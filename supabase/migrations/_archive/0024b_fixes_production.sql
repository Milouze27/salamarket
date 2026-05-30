-- ─────────────────────────────────────────────────────────────────────
-- 0024b — Correctifs production sur la migration 0024 (productions_*)
-- ─────────────────────────────────────────────────────────────────────
--
-- La migration 0024 a déjà été appliquée en prod sans :
--   1) les index sur les FK production_id des 3 tables filles
--      → scan séquentiel à chaque calcul KPI ou jointure
--   2) la colonne tva_taux sur products
--      → impossible de calculer un HT correct par produit
--
-- Ce fichier est idempotent (if not exists) : sans risque si rejoué.
-- ─────────────────────────────────────────────────────────────────────

-- Index FK manquants
create index if not exists idx_productions_inputs_prod
  on public.productions_inputs(production_id);

create index if not exists idx_productions_outputs_prod
  on public.productions_outputs(production_id);

create index if not exists idx_productions_couts_indirects_prod
  on public.productions_couts_indirects(production_id);

-- TVA par produit (taux par défaut 5.5% — viande/alimentaire)
-- Les lignes existantes héritent du default ; à ajuster manuellement
-- pour les SKU non-alimentaires (boissons 20%, bazar 20%, etc.).
alter table public.products
  add column if not exists tva_taux numeric not null default 5.5;
