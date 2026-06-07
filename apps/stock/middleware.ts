/**
 * middleware.ts — deux responsabilités, scopes disjoints :
 *
 * 1. LEGACY REDIRECTS (308) — les routes de l'app V1 (/dashboard,
 *    /catalogue, /reception, /inventaire, /alertes, /assistant,
 *    /compte, /login, /staff/preparation) ont été SUPPRIMÉES au profit
 *    de l'app V2 sous /v2/*. Pour ne pas casser les vieux bookmarks ni
 *    laisser des « portes dérobées » répondre en 404, on redirige en
 *    308 (permanent, conserve la méthode) vers l'équivalent V2.
 *    La racine `/` n'est PAS touchée (elle a son propre splash +
 *    redirect côté client). Les routes /api/*, /v2/*, /po/* sont
 *    explicitement préservées.
 *
 * 2. CORS /api/stripe/* — le front salamarket-drive (Vite,
 *    http://localhost:8081) appelle l'API Stripe de salam-stock
 *    (Next.js, http://localhost:3000) pour le flow manual capture
 *    (POST create-payment-intent, capture-payment). Cross-origin →
 *    preflight OPTIONS, qui échoue sans CORS headers → E2E pété.
 *
 *    Stratégie CORS :
 *      - Whitelist d'origines (pas de wildcard `*` car Stripe Elements
 *        envoie potentiellement des cookies).
 *      - Court-circuit des OPTIONS avec un 204 + headers.
 *      - Pour les POST, on laisse Next.js traiter puis on ajoute les
 *        headers à la response sortante.
 *
 *    Webhook (/api/stripe/webhook) : Stripe appelle en serveur-à-
 *    serveur, pas de header Origin → pas de Access-Control-Allow-Origin
 *    renvoyé (inutile), mais la requête n'est pas bloquée. Pas de
 *    régression.
 */
import { NextResponse, type NextRequest } from "next/server";

// ── Redirections legacy V1 → V2 ─────────────────────────────────────
// Clé = préfixe de chemin V1 mort ; valeur = destination V2.
// On matche par préfixe pour couvrir les sous-routes éventuelles
// (ex. /catalogue/123 → /v2/stock). Ordre : du plus spécifique au
// plus générique (Object iteration = ordre d'insertion).
const LEGACY_REDIRECTS: Array<[prefix: string, target: string]> = [
  ["/staff/preparation", "/v2/preparation"],
  ["/dashboard", "/v2"],
  ["/catalogue", "/v2/stock"],
  ["/reception", "/v2/reception"],
  ["/inventaire", "/v2/inventaire"],
  ["/alertes", "/v2/admin/alertes"],
  ["/assistant", "/v2/admin/assistant-ia"],
  ["/compte", "/v2"],
  ["/login", "/v2/login"],
  // Fallback générique : tout /staff résiduel (layout + sous-routes
  // hors preparation déjà mappée ci-dessus) → preparation V2. Placé en
  // dernier pour que /staff/preparation matche d'abord sa cible exacte.
  ["/staff", "/v2/preparation"],
];

function legacyRedirectTarget(pathname: string): string | null {
  for (const [prefix, target] of LEGACY_REDIRECTS) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return target;
    }
  }
  return null;
}

// ── Whitelist d'origines ────────────────────────────────────────────
const ALLOWED_ORIGINS = new Set<string>([
  "http://localhost:8080", // Vite default
  "http://localhost:8081", // Vite fallback (port 8080 occupé)
  "http://localhost:5173", // Vite legacy default
  "https://salamarket-drive-mono.vercel.app", // prod actuelle (Drive)
  "https://salamarket-drive.vercel.app", // legacy
  "https://salamarket.vercel.app", // alias
]);

/** Origines autorisées par MOTIF (déploiements preview Vercel du Drive, dont
 *  l'URL contient un hash : salamarket-drive-mono-<hash>-abumeryems-projects…). */
const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/salamarket-drive[a-z0-9-]*\.vercel\.app$/,
  /^https:\/\/salamarket-drive-mono[a-z0-9-]*-abumeryems-projects\.vercel\.app$/,
];

function isAllowedOrigin(origin: string): boolean {
  return (
    ALLOWED_ORIGINS.has(origin) ||
    ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin))
  );
}

function corsHeadersFor(origin: string | null): Record<string, string> {
  // Si l'origine n'est pas dans la whitelist, on renvoie quand même
  // les headers minimaux mais SANS Access-Control-Allow-Origin → le
  // browser bloquera la requête en toute sécurité.
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── 1. Legacy V1 → V2 redirects (308 permanent) ──────────────────
  // Prioritaire sur tout le reste. Ne concerne JAMAIS /api/*, /v2/*,
  // /po/* ni la racine `/` (legacyRedirectTarget renvoie null pour eux).
  const target = legacyRedirectTarget(pathname);
  if (target) {
    const url = req.nextUrl.clone();
    url.pathname = target;
    // On vide la query string héritée des vieux deep-links V1 : les
    // params V1 (ids store legacy, filtres) n'ont pas de sens en V2.
    url.search = "";
    // 308 = permanent + conserve la méthode HTTP (vs 307 temporaire).
    return NextResponse.redirect(url, 308);
  }

  // ── 2. CORS /api/stripe/* ────────────────────────────────────────
  const origin = req.headers.get("origin");

  // Preflight OPTIONS → 204 + headers, court-circuit Next.js
  if (req.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: corsHeadersFor(origin),
    });
  }

  // Autres requêtes → on laisse passer, et on ajoute les headers CORS
  // sur la response sortante.
  const res = NextResponse.next();
  const headers = corsHeadersFor(origin);
  for (const [k, v] of Object.entries(headers)) {
    res.headers.set(k, v);
  }
  return res;
}

// Le matcher couvre deux familles de chemins :
//   - /api/stripe/* → CORS (cf. branche 2 de middleware()).
//   - les préfixes legacy V1 morts → redirect 308 (branche 1).
// Tout le reste (/, /v2/*, /po/*, autres /api/*, assets) n'entre PAS
// dans le middleware : zéro overhead, zéro régression.
//
// Note : on liste les préfixes legacy explicitement plutôt qu'un
// catch-all, pour garantir que /v2/reception, /v2/inventaire, etc. ne
// soient jamais interceptés (ils ne matchent aucun préfixe ci-dessous).
export const config = {
  matcher: [
    "/api/stripe/:path*",
    "/dashboard/:path*",
    "/dashboard",
    "/catalogue/:path*",
    "/catalogue",
    "/reception/:path*",
    "/reception",
    "/inventaire/:path*",
    "/inventaire",
    "/alertes/:path*",
    "/alertes",
    "/assistant/:path*",
    "/assistant",
    "/compte/:path*",
    "/compte",
    "/login/:path*",
    "/login",
    "/staff/:path*",
    "/staff",
  ],
};
