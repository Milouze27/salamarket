/**
 * stripe-errors-fr.ts — Mapping erreurs Stripe → messages FR client.
 *
 * Stripe renvoie ses messages en anglais ("Your card was declined.").
 * Affichés tels quels au client = perception cheap + appels SAV.
 *
 * Ce dict couvre les 10 codes les plus fréquents en flow Drive (cf.
 * backlog `pay-error-messages-fr`). Pour les codes absents, on retombe
 * sur un message générique poli.
 *
 * Référence Stripe : https://docs.stripe.com/error-codes
 *                    https://docs.stripe.com/declines/codes
 */

/**
 * Code Stripe (snake_case) → message client FR (ton bienveillant,
 * actionnable, pas de jargon technique).
 */
const STRIPE_ERROR_FR: Record<string, string> = {
  // ─── Card declined family ─────────────────────────────────────────
  card_declined:
    "Carte refusée. Vérifiez vos informations ou utilisez une autre carte.",
  generic_decline:
    "Votre carte a été refusée par votre banque. Contactez-la ou essayez une autre carte.",
  insufficient_funds:
    "Fonds insuffisants sur cette carte. Utilisez une autre carte ou réessayez plus tard.",
  lost_card:
    "Cette carte est signalée perdue. Utilisez une autre carte.",
  stolen_card:
    "Cette carte est signalée volée. Utilisez une autre carte.",

  // ─── Card data invalide ───────────────────────────────────────────
  expired_card:
    "Cette carte a expiré. Utilisez une carte en cours de validité.",
  incorrect_cvc:
    "Le cryptogramme (CVC) au dos de la carte est incorrect.",
  incorrect_number: "Le numéro de carte est incorrect.",
  invalid_number: "Le numéro de carte est invalide.",
  invalid_expiry_month: "Le mois d'expiration de la carte est invalide.",
  invalid_expiry_year: "L'année d'expiration de la carte est invalide.",
  invalid_cvc: "Le cryptogramme (CVC) est invalide.",

  // ─── 3D Secure / authentication ───────────────────────────────────
  authentication_required:
    "Authentification 3D Secure requise. Validez la demande de votre banque.",
  payment_intent_authentication_failure:
    "Authentification 3D Secure échouée. Réessayez ou utilisez une autre carte.",

  // ─── Stripe runtime / réseau ──────────────────────────────────────
  processing_error:
    "Erreur de traitement chez votre banque. Réessayez dans quelques instants.",
  rate_limit:
    "Trop de tentatives de paiement. Patientez quelques secondes puis réessayez.",
  api_connection_error:
    "Connexion au service de paiement interrompue. Vérifiez votre connexion et réessayez.",

  // ─── Setup / config ───────────────────────────────────────────────
  payment_method_unactivated:
    "Ce moyen de paiement n'est pas activé. Utilisez une carte ou Apple Pay / Google Pay.",
};

/**
 * Retourne le message FR client pour une erreur Stripe.
 *
 * @param code     Code Stripe (`error.code` ou `error.decline_code`).
 * @param fallback Message d'origine Stripe (anglais) — utilisé seulement
 *                 si AUCUN code FR ne matche. On le préfixe d'un message
 *                 générique pour éviter l'anglais brut.
 */
export function stripeErrorToFr(
  code: string | null | undefined,
  fallback?: string | null,
): string {
  if (code && STRIPE_ERROR_FR[code]) {
    return STRIPE_ERROR_FR[code];
  }
  // Pas de match — message générique poli + détail anglais en aside
  // pour le support (le client moyen ne lira pas le suffixe technique).
  if (fallback) {
    return `Le paiement n'a pas pu être validé. (${fallback})`;
  }
  return "Le paiement n'a pas pu être validé. Réessayez ou utilisez une autre carte.";
}

/**
 * Variante "soft" : si on a un objet Stripe error complet, on extrait
 * proprement code + decline_code + message en un seul appel.
 *
 * Stripe renvoie souvent `code: "card_declined"` + `decline_code:
 * "insufficient_funds"` — le decline_code est plus précis, on le
 * préfère.
 */
export function stripeErrorObjectToFr(error: {
  code?: string | null;
  decline_code?: string | null;
  message?: string | null;
}): string {
  return stripeErrorToFr(
    error.decline_code ?? error.code ?? null,
    error.message ?? null,
  );
}
