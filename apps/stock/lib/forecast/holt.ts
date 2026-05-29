/**
 * Holt linear smoothing — implémentation pure pour le moteur de stockout.
 *
 * Spec (cf. migration 0035) :
 *   - α = 0.35  (poids du dernier observé sur le niveau)
 *   - β = 0.10  (poids de la nouvelle tendance)
 *   - L_t = α·y_t + (1-α)·(L_{t-1} + T_{t-1})
 *   - T_t = β·(L_t - L_{t-1}) + (1-β)·T_{t-1}
 *   - Vitesse prévue h jours en avant : F_{t+h} = L_t + h·T_t
 *
 * Init : si on n'a pas d'état précédent, on bootstrap avec L_0 = y_0,
 * T_0 = 0. C'est suffisant — l'algo converge en 3-4 jours d'observation.
 *
 * Ce module n'a AUCUNE dépendance Supabase. Il est testable seul, et
 * réutilisé par l'edge function Deno comme par l'API route Node.
 */

export interface HoltState {
  level: number;
  trend: number;
}

export interface HoltParams {
  alpha: number;
  beta: number;
}

export const DEFAULT_HOLT: HoltParams = { alpha: 0.35, beta: 0.1 };

/**
 * Met à jour l'état Holt avec une nouvelle observation (vélocité du jour
 * en unités/jour, ex : 12 cartons de dattes vendus aujourd'hui = 12).
 *
 * Si `prev` est null, on bootstrap : L = obs, T = 0.
 */
export function holtUpdate(
  prev: HoltState | null,
  observation: number,
  params: HoltParams = DEFAULT_HOLT,
): HoltState {
  if (!prev) {
    return { level: Math.max(0, observation), trend: 0 };
  }
  const { alpha, beta } = params;
  const predicted = prev.level + prev.trend;
  const newLevel = alpha * observation + (1 - alpha) * predicted;
  const newTrend = beta * (newLevel - prev.level) + (1 - beta) * prev.trend;
  return {
    // On ne laisse jamais le level passer sous 0 (négatif n'a pas de sens
    // pour une vélocité de ventes).
    level: Math.max(0, newLevel),
    trend: newTrend,
  };
}

/**
 * Prédiction h jours en avant.
 */
export function holtForecast(state: HoltState, h: number): number {
  return Math.max(0, state.level + h * state.trend);
}

/**
 * Calcule le tier de criticité à partir des jours de couverture.
 * Aligné sur l'enum SQL `stockout_tier` (migration 0035).
 *
 * Seuils :
 *   - out      : stock = 0 (ou couverture = 0)
 *   - blocker  : < 1.5 jours (Otmane doit commander aujourd'hui)
 *   - crit     : < 3 jours
 *   - warn     : < 7 jours
 *   - ok       : >= 7 jours
 *
 * Si la vitesse ajustée = 0 (pas de vente prévue), days_cover = null
 * → tier = ok par défaut (sauf si stock = 0, alors out).
 */
export type StockoutTier = "ok" | "warn" | "crit" | "blocker" | "out";

export function tierFromCover(
  stock: number,
  daysCover: number | null,
): StockoutTier {
  if (stock <= 0) return "out";
  if (daysCover === null) return "ok"; // pas de vélocité = pas de risque
  if (daysCover < 1.5) return "blocker";
  if (daysCover < 3) return "crit";
  if (daysCover < 7) return "warn";
  return "ok";
}
