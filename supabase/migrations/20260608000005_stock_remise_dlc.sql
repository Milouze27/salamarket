-- =====================================================================
-- 20260608000005 — Remise DLC persistante sur stock_par_depot
--
-- Le centre d'alertes DLC (/v2/admin/alertes-dlc) avait des boutons
-- « Appliquer la remise » et « Tout marquer en démarque » qui ne faisaient
-- RIEN de réel (mock : setTimeout + toast). On ajoute le support DB pour
-- appliquer une vraie remise au prix de vente, de façon idempotente et
-- réversible :
--   - prix_vente_avant_remise : snapshot du prix de base (avant 1re remise).
--   - remise_dlc_pct          : % de remise DLC actuellement appliqué.
--   - demarque_at             : horodatage de la dernière démarque.
--
-- Le prix effectif vendu (prix_vente) est mis à
--   round(prix_vente_avant_remise * (1 - remise_dlc_pct/100), 2)
-- par l'application. Garder le prix de base permet de re-calculer sans
-- jamais cumuler les remises (idempotent) et de lever la remise plus tard.
-- =====================================================================

alter table public.stock_par_depot
  add column if not exists prix_vente_avant_remise numeric,
  add column if not exists remise_dlc_pct integer not null default 0
    check (remise_dlc_pct between 0 and 100),
  add column if not exists demarque_at timestamptz;

comment on column public.stock_par_depot.prix_vente_avant_remise is
  'Prix de vente de base (avant remise DLC). NULL = aucune remise appliquée.';
comment on column public.stock_par_depot.remise_dlc_pct is
  'Remise DLC appliquée au prix_vente (%). 0 = plein tarif.';
