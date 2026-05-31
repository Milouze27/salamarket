/**
 * instrumentation.ts — Boot-time env assertions for salam-stock.
 *
 * Next 14 auto-loads ce fichier au démarrage du serveur (avant
 * d'accepter la 1ère requête). Stable depuis Next 14.0.4 — pas besoin
 * de flag `experimental.instrumentationHook` en 14.2.
 *
 * Cf. https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * Objectif : refuser de démarrer en production avec des placeholders
 * Stripe (PLACEHOLDER / TODO / CHANGEME / vide). Évite l'incident
 * silencieux du genre "la prod tourne mais aucun paiement n'aboutit
 * parce que la clé est encore `sk_test_PLACEHOLDER`".
 *
 * Cf. backlog `pay-test-mode-hardcoded-blocker`.
 */

export async function register() {
  // Ne s'exécute que côté serveur Node (pas Edge runtime).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Skip during the build itself (next build collecte les routes en
  // ouvrant l'app — on ne veut pas qu'une clé placeholder casse le
  // build avant déploiement). On valide UNIQUEMENT au boot du serveur
  // (next start ou Vercel runtime).
  // Cf. https://nextjs.org/docs/app/api-reference/next-config-js
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  assertEnv();
}

function assertEnv() {
  const errors: string[] = [];
  const isProd = process.env.NODE_ENV === "production";

  // Patterns interdits dans n'importe quel env critique.
  const PLACEHOLDER_PATTERNS = [
    /PLACEHOLDER/i,
    /TODO/i,
    /CHANGEME/i,
    /CHANGE_ME/i,
    /YOUR_KEY_HERE/i,
    /XXXXX/,
  ];

  const isPlaceholder = (value: string | undefined): boolean => {
    if (!value || value.trim().length === 0) return true;
    return PLACEHOLDER_PATTERNS.some((re) => re.test(value));
  };

  const required = [
    "STRIPE_SECRET_KEY",
    "STRIPE_PUBLISHABLE_KEY",
    "STRIPE_WEBHOOK_SECRET",
  ];

  // En prod : on exige que toutes les clés Stripe critiques soient
  // renseignées et NON-placeholder. Sinon on throw au boot — Vercel
  // marquera le deployment failed et on évite de tourner avec une
  // config morte.
  if (isProd) {
    for (const key of required) {
      const val = process.env[key];
      if (isPlaceholder(val)) {
        errors.push(
          `[instrumentation] ${key} est un placeholder ou manquant en production`,
        );
      }
    }

    // Garde-fou supplémentaire : si STRIPE_FORCE_TEST_MODE !== "1" en
    // prod, on attend une vraie clé live (sk_live_). Sinon on attend
    // sk_test_. Toute incohérence = on throw.
    const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
    const forceTest = process.env.STRIPE_FORCE_TEST_MODE === "1";
    if (!isPlaceholder(stripeKey)) {
      if (forceTest && !stripeKey.startsWith("sk_test_")) {
        errors.push(
          "[instrumentation] STRIPE_FORCE_TEST_MODE=1 mais STRIPE_SECRET_KEY ne commence pas par sk_test_",
        );
      }
      if (!forceTest && !stripeKey.startsWith("sk_live_")) {
        errors.push(
          "[instrumentation] Production sans STRIPE_FORCE_TEST_MODE=1 mais STRIPE_SECRET_KEY ne commence pas par sk_live_",
        );
      }
    }
  }

  if (errors.length > 0) {
    // On log d'abord pour que la stacktrace Vercel soit lisible (le
    // throw masque parfois le message).
    for (const e of errors) {
      // eslint-disable-next-line no-console
      console.error(e);
    }
    throw new Error(
      `Boot refused — ${errors.length} env error(s). Voir logs ci-dessus.`,
    );
  }
}
