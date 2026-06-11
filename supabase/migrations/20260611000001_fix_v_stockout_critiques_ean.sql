-- ─────────────────────────────────────────────────────────────────────
-- HOTFIX FORECAST — vue v_stockout_critiques : colonne ean (pas code_barre)
--
-- Contexte : la vue v_stockout_critiques (migration 20260530000004) avait
-- été définie avec `p.code_barre`, colonne INEXISTANTE sur public.produits
-- (la bonne colonne est `p.ean`, cf. SCHEMA.md). La définition source a été
-- corrigée plus tard EN PLACE (commit 0cd3d4d), mais comme la migration
-- 20260530000004 avait déjà tourné en prod, le `create or replace view`
-- corrigé n'a JAMAIS été rejoué → la prod sert encore la vue cassée.
--
-- Conséquence prod : GET /rest/v1/v_stockout_critiques?select=...,ean,...
-- renvoie 400 "column v_stockout_critiques.ean does not exist", /v2/forecast
-- 100% vide (tous KPI à 0), feature hijri-aware morte en démo.
--
-- Fix : nouvelle migration horodatée (append-only) qui recrée la vue avec
-- le schéma réel. Le SELECT client (forecast/page.tsx) lit exactement ces
-- colonnes : produit_id, depot_id, produit_nom, ean, depot_nom,
-- stock_actuel, velocity_adj, days_cover, tier, phase_courante,
-- multiplicateur, reason, computed_at.
-- ─────────────────────────────────────────────────────────────────────

create or replace view public.v_stockout_critiques as
select
  f.produit_id,
  f.depot_id,
  p.nom            as produit_nom,
  p.ean,
  d.nom            as depot_nom,
  f.stock_actuel,
  f.velocity_adj,
  f.days_cover,
  f.tier,
  f.phase_courante,
  f.multiplicateur,
  f.reason,
  f.computed_at
from public.stockout_forecast f
join public.produits p on p.id = f.produit_id
join public.depots   d on d.id = f.depot_id
where f.tier in ('warn','crit','blocker','out')
order by
  case f.tier
    when 'out' then 0 when 'blocker' then 1 when 'crit' then 2 when 'warn' then 3
    else 4 end,
  f.days_cover nulls first;

grant select on public.v_stockout_critiques to anon, authenticated;

notify pgrst, 'reload schema';
