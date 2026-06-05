/**
 * Code promo — wrapper "graceful" autour de la RPC Supabase
 * `validate_promo_code`.
 *
 * ⚠️ La RPC `validate_promo_code` n'existe PAS ENCORE en prod. Ce module
 * doit donc DÉGRADER PROPREMENT : si la RPC est absente / renvoie une
 * erreur, on ne throw jamais et on renvoie un résultat neutre
 * (`{ valid: false, reason: "unavailable" }`) que l'UI peut ignorer sans
 * afficher d'erreur effrayante.
 *
 * Contrat RPC attendu (quand elle existera) :
 *   validate_promo_code(p_code text, p_total_cents int)
 *     → { valid bool, discount_cents int, code text, reason text }
 */

import { supabase } from "@/integrations/supabase/client";

/** Raisons normalisées renvoyées au consommateur UI. */
export type PromoReason =
  | "ok"
  | "invalid"
  | "min_not_reached"
  | "expired"
  | "unavailable"
  | "empty";

export interface PromoResult {
  /** true uniquement si la RPC confirme un code applicable. */
  valid: boolean;
  /** Remise en centimes (≥ 0). Toujours 0 si !valid. */
  discount_cents: number;
  /** Code normalisé (trim + upper) renvoyé pour réaffichage. */
  code: string;
  /** Motif machine-friendly pour piloter le message UI. */
  reason: PromoReason;
}

/** Normalise une raison libre de la RPC vers notre enum stable. */
const normalizeReason = (raw: unknown): PromoReason => {
  const r = typeof raw === "string" ? raw.toLowerCase().trim() : "";
  switch (r) {
    case "ok":
    case "valid":
      return "ok";
    case "min_not_reached":
    case "min":
    case "minimum":
      return "min_not_reached";
    case "expired":
      return "expired";
    case "unavailable":
      return "unavailable";
    case "invalid":
    case "not_found":
    case "":
      return "invalid";
    default:
      return "invalid";
  }
};

/**
 * Valide un code promo. Ne throw JAMAIS.
 *
 * @param code        Code saisi par l'utilisateur (sera trim + upper).
 * @param totalCents  Sous-total courant du panier, en centimes.
 * @returns           Résultat normalisé toujours exploitable par l'UI.
 */
export async function validatePromo(
  code: string,
  totalCents: number,
): Promise<PromoResult> {
  const normalized = (code ?? "").trim().toUpperCase();

  if (!normalized) {
    return { valid: false, discount_cents: 0, code: "", reason: "empty" };
  }

  try {
    // ⚠️ La RPC `validate_promo_code` n'est pas (encore) dans les types
    // générés Supabase → on relâche le typage du client SUR CE SEUL appel.
    // Le reste du module reste strictement typé. Convention déjà utilisée
    // ailleurs dans l'app pour les objets DB non encore déployés.
    const { data, error } = await (
      supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>
    )("validate_promo_code", {
      p_code: normalized,
      p_total_cents: Math.max(0, Math.round(totalCents)),
    });

    // RPC absente en prod OU toute autre erreur Postgres → on dégrade.
    if (error) {
      return {
        valid: false,
        discount_cents: 0,
        code: normalized,
        reason: "unavailable",
      };
    }

    // La RPC peut renvoyer un objet seul ou un tableau d'une ligne.
    const row = Array.isArray(data) ? data[0] : data;

    if (!row || typeof row !== "object") {
      return {
        valid: false,
        discount_cents: 0,
        code: normalized,
        reason: "invalid",
      };
    }

    const rec = row as Record<string, unknown>;
    const valid = rec.valid === true;
    const rawDiscount = Number(rec.discount_cents);
    const discount_cents =
      valid && Number.isFinite(rawDiscount) && rawDiscount > 0
        ? Math.round(rawDiscount)
        : 0;
    const reason = valid ? "ok" : normalizeReason(rec.reason);

    return {
      valid: valid && discount_cents > 0,
      discount_cents,
      code:
        typeof rec.code === "string" && rec.code.trim()
          ? rec.code.trim().toUpperCase()
          : normalized,
      reason,
    };
  } catch {
    // Erreur réseau / RPC inexistante côté client → dégrade en silence.
    return {
      valid: false,
      discount_cents: 0,
      code: normalized,
      reason: "unavailable",
    };
  }
}

/**
 * Message FR clair à afficher selon le résultat. Volontairement non
 * agressif quand la feature est indisponible (on dit juste "Code
 * invalide" plutôt que d'exposer un bug technique).
 */
export function promoMessage(result: PromoResult): string {
  if (result.valid) return "Code appliqué";
  switch (result.reason) {
    case "min_not_reached":
      return "Montant minimum non atteint pour ce code";
    case "expired":
      return "Ce code a expiré";
    case "empty":
      return "Saisissez un code";
    case "unavailable":
    case "invalid":
    default:
      return "Code invalide";
  }
}
