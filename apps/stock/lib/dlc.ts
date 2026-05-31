/**
 * lib/dlc.ts — Normalisation du barème de remise DLC (BUG-018).
 *
 * Contexte : la vue SQL `v_dlc_alerts` calcule `remise_suggeree_pct` en
 * croisant `dlc_pricing_rules` × `produits.categorie`. Bug observé :
 * pour les lots en FORCÉ (dlc <= aujourd'hui), la vue retourne 0% quand
 *   1) le produit n'a pas de catégorie matchant un rule (ex. catégorie
 *      "Autre" / NULL / nouvelle catégorie pas encore seedée),
 *   2) le seed `dlc_pricing_rules` a été oublié / partiellement rollback.
 *
 * Conséquence côté terrain : un lot Merguez périmé s'affichait avec
 * "FORCÉ -0%" → staff ne savait pas quelle remise appliquer → démarque
 * impossible → casse comptable.
 *
 * Fix défensif côté TS : on enforce un plancher de remise par niveau,
 * indépendamment de ce que renvoie la vue. La règle SQL reste source de
 * vérité (cas où elle override avec un % plus agressif), mais on garantit
 * qu'un FORCÉ aura TOUJOURS au moins -50%.
 *
 * Mapping métier (cf. CONTEXT.md `dlc_alert_level`) :
 *   - forcé        → -50% (à démarquer aujourd'hui, sinon casse)
 *   - critique     → -40% (J-1, dernier appel)
 *   - attention    → -20% (J-2 / J-3, anticipation)
 *   - surveillance → -0%  (J-4 → J-7, simple alerte interne)
 *   - ok           → -0%  (rien à faire)
 *
 * Pourquoi pas amender la migration ? Les migrations sont gérées par
 * l'agent migrations-shared et tout patch SQL en parallèle créerait un
 * conflit. On garde la vue telle quelle et on enforce côté lecture.
 */

export type DlcNiveau =
  | "forcé"
  | "critique"
  | "attention"
  | "surveillance"
  | "ok";

/**
 * Plancher de remise par niveau (en %). On prend le MAX entre cette
 * valeur et celle remontée par la vue SQL — si la vue propose -60% on
 * garde -60%, mais on ne descend jamais sous le plancher métier.
 */
export const DLC_MIN_DISCOUNT_PCT: Record<DlcNiveau, number> = {
  forcé: 50,
  critique: 40,
  attention: 20,
  surveillance: 0,
  ok: 0,
};

/**
 * Normalise la remise renvoyée par la vue v_dlc_alerts.
 *
 * @param niveau Niveau d'alerte tel que retourné par v_dlc_alerts
 * @param remiseSuggeree Pourcentage brut (0..100) renvoyé par la vue,
 *   peut être null si la jointure dlc_pricing_rules a échoué.
 * @returns Pourcentage final à appliquer (0..100), entier.
 *
 * @example
 *   normalizeRemiseDlc("forcé", 0)   // 50 (le plancher s'applique)
 *   normalizeRemiseDlc("forcé", 60)  // 60 (la vue override le plancher)
 *   normalizeRemiseDlc("attention", null) // 20
 */
export function normalizeRemiseDlc(
  niveau: DlcNiveau | string | null | undefined,
  remiseSuggeree: number | null | undefined,
): number {
  const safeNiveau = (niveau ?? "ok") as DlcNiveau;
  const floor = DLC_MIN_DISCOUNT_PCT[safeNiveau] ?? 0;
  const raw = Number.isFinite(Number(remiseSuggeree))
    ? Math.max(0, Math.min(100, Math.round(Number(remiseSuggeree))))
    : 0;
  return Math.max(floor, raw);
}
