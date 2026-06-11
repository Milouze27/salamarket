-- ─────────────────────────────────────────────────────────────────────────────
-- MGR-12 · Barème de remise DLC différencié par niveau
-- ─────────────────────────────────────────────────────────────────────────────
-- Bug : la vue v_dlc_alerts calcule remise_suggeree_pct =
--   greatest(plancher_du_niveau, règle_catégorie). Or le seed catégorie de
--   dlc_pricing_rules (migration 20260604000001) posait le palier
--   jours_avant_dlc = 1 à 50% pour toutes les catégories périssables. Un lot
--   en niveau CRITIQUE (DLC à J-1, encore vendable) matchait ce palier → 50%,
--   écrasant le plancher critique métier (40%). Résultat terrain : TOUS les
--   lots affichaient -50%, y compris les critiques qui doivent être -40%, et
--   le barème n'était plus différencié (forcé et critique confondus).
--
-- Règle métier (cf. CONTEXT.md / lib/dlc.ts) :
--   forcé (DLC dépassée)  → 50%  (garanti par le plancher SQL, niveau forcé)
--   critique (J-1)        → 40%
--   attention (J-2/J-3)   → 20%
--
-- Fix : le palier jours_avant_dlc = 1 correspond au niveau critique → il doit
-- plafonner à 40%, pas 50%. Le 50% reste réservé au niveau forcé via
-- dlc_remise_plancher('forcé'). On aligne tous les paliers J-1 > 40 à 40.
--
-- ⚠️ Volet DONNÉES déjà appliqué en prod via service_role (CLI supabase non
-- loggé la nuit du fix). Cette migration le rend reproductible / idempotent
-- pour tout nouvel environnement. Append-only.
-- ─────────────────────────────────────────────────────────────────────────────

update public.dlc_pricing_rules
set remise_pct = 40
where jours_avant_dlc = 1
  and remise_pct > 40;
