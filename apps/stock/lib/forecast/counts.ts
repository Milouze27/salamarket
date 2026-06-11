/**
 * lib/forecast/counts.ts — Source unique de vérité pour le comptage des
 * tiers de stockout (MGR-02 / ADM-07 / MGR2-13).
 *
 * Avant : chaque écran (accueil, cockpit, forecast) recomptait « les
 * ruptures imminentes » avec sa propre définition de tiers et sa propre
 * limite de lignes → les chiffres divergeaient d'un écran à l'autre
 * (« 5 sur l'accueil, 2 sur le cockpit ») et sautaient entre deux
 * chargements. On centralise ici LA définition métier.
 *
 * Définitions :
 *   - « rupture imminente » = un couple en tier `out` ou `blocker`
 *     (stock épuisé ou < 1.5 j de couverture → à commander aujourd'hui).
 *   - `crit` / `warn` sont des niveaux d'attention, PAS des ruptures.
 */

import type { StockoutTier } from "./holt";

/** Tiers comptés comme « rupture imminente » (à commander aujourd'hui). */
export const RUPTURE_TIERS: ReadonlyArray<StockoutTier> = ["out", "blocker"];

/** Compte les couples en rupture imminente (tier out|blocker). */
export function countRupturesImminentes(
  rows: ReadonlyArray<{ tier: StockoutTier }>,
): number {
  return rows.filter((r) => RUPTURE_TIERS.includes(r.tier)).length;
}
