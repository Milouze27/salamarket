/**
 * lib/stripe.ts — Singleton client Stripe serveur.
 *
 * Phase actuelle : Drive au poids (Stripe manual capture).
 *
 * Historique :
 * - Avant 2026-05-31 : check strict `sk_test_` qui throwait à chaque
 *   appel API en prod. Empêchait toute démo réelle avec une vraie clé
 *   live (Otmane). Cf. backlog `pay-test-mode-hardcoded-blocker`.
 * - 2026-05-31 (FIX pay-test-mode-hardcoded-blocker) : soft check —
 *   on autorise les clés live SEULEMENT si STRIPE_FORCE_TEST_MODE !== "1"
 *   ET NODE_ENV === "production". Sinon (dev/preview/test) on impose
 *   `sk_test_` pour éviter d'envoyer accidentellement de vrais débits
 *   depuis un environnement de dev.
 *
 * Voir `.env.local.example` pour les placeholders à remplir :
 *   STRIPE_SECRET_KEY=sk_test_PLACEHOLDER
 *   STRIPE_PUBLISHABLE_KEY=pk_test_PLACEHOLDER
 *   STRIPE_WEBHOOK_SECRET=whsec_PLACEHOLDER
 *   STRIPE_FORCE_TEST_MODE=1     # met à 1 pour forcer sk_test_ même en prod
 */
import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY manquante (cf. .env.local.example)");
  }

  // Soft check : on force sk_test_ sauf si :
  //   - on est explicitement en prod (NODE_ENV=production), ET
  //   - on n'a PAS posé STRIPE_FORCE_TEST_MODE=1 (kill-switch sécurité).
  // En clair :
  //   - dev / preview / test : sk_test_ obligatoire (anti-débit accidentel).
  //   - production sans force flag : sk_live_ accepté (vraie démo paiement).
  //   - production avec STRIPE_FORCE_TEST_MODE=1 : sk_test_ même en prod
  //     (mode démo "fake money" Otmane).
  const isProd = process.env.NODE_ENV === "production";
  const forceTest = process.env.STRIPE_FORCE_TEST_MODE === "1";
  const liveAllowed = isProd && !forceTest;

  if (!liveAllowed && !key.startsWith("sk_test_")) {
    throw new Error(
      "STRIPE_SECRET_KEY doit commencer par sk_test_ (TEST mode obligatoire " +
        "hors production, ou avec STRIPE_FORCE_TEST_MODE=1). " +
        `NODE_ENV=${process.env.NODE_ENV ?? "undefined"}, ` +
        `STRIPE_FORCE_TEST_MODE=${process.env.STRIPE_FORCE_TEST_MODE ?? "undefined"}`,
    );
  }

  _stripe = new Stripe(key, {
    // Version pinned sur celle livrée par stripe-node v22 installé en
    // dépendance. Si on remonte le package, ajuster ici (LatestApiVersion).
    apiVersion: "2026-05-27.dahlia",
    typescript: true,
  });
  return _stripe;
}
