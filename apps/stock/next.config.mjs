import { withSentryConfig } from "@sentry/nextjs";

/**
 * Build id déterministe par déploiement.
 * - Sur Vercel : SHA du commit (VERCEL_GIT_COMMIT_SHA) → change à chaque
 *   release, stable entre les serverless functions d'un même déploiement.
 * - En local : null → Next génère son id par défaut.
 * On le ré-expose en NEXT_PUBLIC_BUILD_ID pour que le Service Worker
 * (cf. public/sw.js + components/SWRegister.tsx) versionne ses caches
 * sur la même valeur et les purge à chaque release.
 */
const BUILD_ID =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ||
  process.env.NEXT_PUBLIC_BUILD_ID ||
  null;

/**
 * Content-Security-Policy — enforced.
 *
 * Historique : déployée d'abord en Report-Only le temps de valider qu'on
 * ne casse ni Stripe Elements, ni Supabase realtime, ni l'API Anthropic.
 * La télémétrie n'ayant pas remonté de violation légitime, on bascule en
 * mode enforced (Report-Only n'offre aucune protection réelle).
 *
 * Note : 'unsafe-inline' sur style-src reste nécessaire — Tailwind et
 * shadcn injectent des styles inline. 'unsafe-eval' sur script-src est
 * requis par le runtime dev/SSR de Next 14. On migrera vers des nonces
 * quand Next supportera proprement le nonce CSP App Router.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' js.stripe.com",
  "connect-src 'self' *.supabase.co wss://*.supabase.co api.anthropic.com api.stripe.com *.ingest.sentry.io *.ingest.us.sentry.io *.ingest.de.sentry.io",
  "img-src 'self' data: blob: https:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  // 'self' requis : la carte « Écran de retrait client » de /v2/admin
  // embarque /v2/counter en iframe same-origin (aperçu comptoir). Sans
  // 'self', frame-src n'autorisant que Stripe, l'iframe était bloquée en prod.
  "frame-src 'self' js.stripe.com hooks.stripe.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // 'self' (pas 'none') : autorise l'embed same-origin de /v2/counter
  // par /v2/admin. frame-ancestors prime sur X-Frame-Options ; 'none'
  // bloquait l'aperçu comptoir interne. Reste anti-clickjacking cross-origin.
  "frame-ancestors 'self'",
  "upgrade-insecure-requests",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Le package workspace `@salamarket/shared` est livré en TS source
  // (pas pré-compilé). Next 14 doit le passer dans son pipeline SWC
  // sinon les imports échouent en runtime.
  transpilePackages: ["@salamarket/shared"],
  // Expose le build id au client pour que le Service Worker versionne
  // ses caches dessus (cf. SWRegister.tsx → /sw.js?v=<buildId>).
  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID || "dev",
  },
  // Aligne l'id de build Next sur le SHA commit (quand dispo) : les
  // chunks /_next/static/<buildId>/* et la version du SW partagent ainsi
  // la même valeur de release.
  ...(BUILD_ID ? { generateBuildId: async () => BUILD_ID } : {}),
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
    ],
  },
  async redirects() {
    return [
      // /staff/preparation déprécié 2026-05-16 → /v2/preparation
      // (cf. app/staff/preparation/DEPRECATED.md). 301 permanente pour
      // que les bookmarks staff existants suivent.
      {
        source: "/staff/preparation",
        destination: "/v2/preparation",
        permanent: true,
      },
      {
        source: "/staff/preparation/:id",
        destination: "/v2/preparation/:id",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // ─── Sécurité (sec-no-csp-no-hsts-headers backlog) ───
          // HSTS : force HTTPS 2 ans, inclus sous-domaines, preload list.
          // Note : irréversible côté browser pendant 2 ans, on prend.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // X-Frame-Options : SAMEORIGIN — anti clickjacking cross-origin,
          // mais autorise l'embed same-origin légitime (l'aperçu comptoir
          // /v2/counter en iframe dans la carte « Écran de retrait client »
          // de /v2/admin). DENY bloquait aussi cet embed interne.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // CSP enforced (cf. const CSP ci-dessus). Verrouille les sources
          // exécutables/réseau aux seuls domaines légitimes Stripe /
          // Supabase / Anthropic / Sentry.
          {
            key: "Content-Security-Policy",
            value: CSP,
          },
          // ─── Sécurité (déjà en place) ───
          // Autorise explicitement la caméra (scan code-barre) sur le
          // domaine self. Sans header, certains contextes PWA iOS et les
          // browsers paranoïaques bloquent getUserMedia silencieusement.
          {
            key: "Permissions-Policy",
            value:
              "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

// ─── Sentry wrapper ────────────────────────────────────────────────
// Cf. backlog `obs-no-sentry-error-tracking`.
//
// silent: true → pas de bruit en dev, juste les uploads de sourcemaps
//                en prod via SENTRY_AUTH_TOKEN.
// org/project : repris depuis env si dispo, sinon fallback statique.
// widenClientFileUpload : capture les sourcemaps des chunks dynamiques.
// disableLogger : retire les console.log Sentry du bundle browser
//                 (réduit ~5KB sur le bundle final).
// automaticVercelMonitors : false par défaut, on a déjà nos crons dans
//                           vercel.json et on ne veut pas que Sentry
//                           crée des doublons côté monitoring.
const sentryBuildOptions = {
  silent: true,
  org: process.env.SENTRY_ORG || "salamarket",
  project: process.env.SENTRY_PROJECT || "stock",
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: false,
  // Si SENTRY_AUTH_TOKEN absent (dev local), on skip l'upload des
  // sourcemaps pour pas planter le build.
  authToken: process.env.SENTRY_AUTH_TOKEN,
};

// Wrap UNIQUEMENT si la DSN est fournie. Sinon on retourne la config
// brute pour pas faire chier en local sans compte Sentry.
const finalConfig =
  process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN
    ? withSentryConfig(nextConfig, sentryBuildOptions)
    : nextConfig;

export default finalConfig;
