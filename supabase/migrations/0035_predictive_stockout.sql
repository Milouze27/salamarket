-- ════════════════════════════════════════════════════════════════
-- 0035 — Stockout prédictif (Holt linéaire + courbe hijri)
--
-- Le cœur du pitch Otmane : "tu vas être en rupture sur le poulet
-- dans 3 jours, en plein milieu de Ramadan". Algo :
--   1. velocity_state = lissage Holt (level, trend) α=0.35 β=0.10
--   2. hijri_demand_curve = multiplicateur par phase × catégorie
--   3. stockout_forecast = velocity ajustée → days_cover → tier
-- ════════════════════════════════════════════════════════════════

-- ─── 1) État vélocité Holt par (produit, dépôt) ────────────────────
create table if not exists public.velocity_state (
  produit_id      uuid not null references public.produits(id) on delete cascade,
  depot_id        uuid not null references public.depots(id)   on delete cascade,
  level           numeric(12,4) not null default 0,  -- L_t = α·y_t + (1-α)·(L_{t-1}+T_{t-1})
  trend           numeric(12,4) not null default 0,  -- T_t = β·(L_t-L_{t-1}) + (1-β)·T_{t-1}
  alpha           numeric(4,3) not null default 0.350 check (alpha between 0 and 1),
  beta            numeric(4,3) not null default 0.100 check (beta  between 0 and 1),
  last_observed_at date,
  last_observed_qty numeric(12,3),
  computed_at     timestamptz not null default now(),
  primary key (produit_id, depot_id)
);

create index if not exists idx_velocity_state_computed
  on public.velocity_state(computed_at desc);

-- ─── 2) Courbe hijri : multiplicateur de demande par phase × cat ──
do $$
begin
  if not exists (select 1 from pg_type where typname = 'hijri_phase') then
    create type hijri_phase as enum (
      'normal',
      'pre_ramadan_j7',
      'ramadan_debut',
      'ramadan_milieu',
      'ramadan_fin_10j',
      'aid_fitr_j3',
      'pre_aid_adha_j7',
      'aid_adha_j3',
      'achoura_j3'
    );
  end if;
end$$;

create table if not exists public.hijri_demand_curve (
  id              uuid primary key default gen_random_uuid(),
  phase           hijri_phase not null,
  categorie       text not null,            -- ex: 'viande_fraiche','dattes','pates','epicerie_seche'
  multiplicateur  numeric(5,2) not null check (multiplicateur > 0),
  source          text default 'estim_otmane_v1',
  notes           text,
  unique (phase, categorie)
);

-- Seed courbe v1 (à raffiner après Ramadan 2026 avec données réelles)
insert into public.hijri_demand_curve (phase, categorie, multiplicateur, notes) values
  ('normal',           'viande_fraiche',  1.00, 'baseline'),
  ('pre_ramadan_j7',   'viande_fraiche',  1.35, 'constitution stocks foyers'),
  ('ramadan_debut',    'viande_fraiche',  1.80, 'premier ftour'),
  ('ramadan_milieu',   'viande_fraiche',  1.50, ''),
  ('ramadan_fin_10j',  'viande_fraiche',  1.70, 'invités, laylat al-qadr'),
  ('aid_fitr_j3',      'viande_fraiche',  0.40, 'effondrement post-Aïd'),
  ('pre_aid_adha_j7',  'viande_fraiche',  2.20, 'sacrifice, mouton'),
  ('aid_adha_j3',      'viande_fraiche',  3.00, 'pic absolu'),
  ('normal',           'dattes',          1.00, ''),
  ('pre_ramadan_j7',   'dattes',          4.50, 'achat massif rupture ftour'),
  ('ramadan_debut',    'dattes',          3.20, ''),
  ('ramadan_milieu',   'dattes',          2.10, ''),
  ('ramadan_fin_10j',  'dattes',          2.80, ''),
  ('aid_fitr_j3',      'dattes',          0.60, ''),
  ('normal',           'pates',           1.00, ''),
  ('pre_ramadan_j7',   'pates',           1.40, 'chorba, harira'),
  ('ramadan_debut',    'pates',           1.55, ''),
  ('ramadan_milieu',   'pates',           1.45, ''),
  ('ramadan_fin_10j',  'pates',           1.50, ''),
  ('normal',           'epicerie_seche',  1.00, ''),
  ('pre_ramadan_j7',   'epicerie_seche',  1.60, 'cumin, gingembre, semoule'),
  ('ramadan_debut',    'epicerie_seche',  1.45, ''),
  ('ramadan_milieu',   'epicerie_seche',  1.30, ''),
  ('ramadan_fin_10j',  'epicerie_seche',  1.40, ''),
  ('aid_fitr_j3',      'epicerie_seche',  0.70, ''),
  ('normal',           'boissons',        1.00, ''),
  ('pre_ramadan_j7',   'boissons',        1.30, 'sirops, jus'),
  ('ramadan_debut',    'boissons',        1.85, 'rupture ftour'),
  ('ramadan_milieu',   'boissons',        1.60, ''),
  ('ramadan_fin_10j',  'boissons',        1.75, '')
on conflict (phase, categorie) do nothing;

-- ─── 3) Forecast stockout (recalculé par job, 1 ligne par couple) ─
do $$
begin
  if not exists (select 1 from pg_type where typname = 'stockout_tier') then
    create type stockout_tier as enum ('ok','warn','crit','blocker','out');
  end if;
end$$;

create table if not exists public.stockout_forecast (
  produit_id        uuid not null references public.produits(id) on delete cascade,
  depot_id          uuid not null references public.depots(id)   on delete cascade,
  stock_actuel      numeric(12,3) not null,
  velocity_base     numeric(12,4) not null,   -- Holt level
  velocity_adj      numeric(12,4) not null,   -- × multiplicateur hijri phase courante
  phase_courante    hijri_phase not null default 'normal',
  multiplicateur    numeric(5,2) not null default 1.00,
  days_cover        numeric(6,2),             -- stock / velocity_adj (NULL si vel = 0)
  tier              stockout_tier not null default 'ok',
  reason            text,                     -- explication humaine pour UI
  computed_at       timestamptz not null default now(),
  primary key (produit_id, depot_id)
);

-- Index général + index partiel sur tiers critiques (le cockpit ne lit que ceux-là)
create index if not exists idx_stockout_forecast_tier
  on public.stockout_forecast(tier, days_cover);
create index if not exists idx_stockout_forecast_critique
  on public.stockout_forecast(depot_id, days_cover)
  where tier in ('crit','blocker','out');
create index if not exists idx_stockout_forecast_computed
  on public.stockout_forecast(computed_at desc);

-- ─── Vue prête à consommer par le UI cockpit ──────────────────────
create or replace view public.v_stockout_critiques as
select
  f.produit_id,
  f.depot_id,
  p.nom            as produit_nom,
  p.code_barre,
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

-- ─── RLS ───────────────────────────────────────────────────────────
alter table public.velocity_state      enable row level security;
alter table public.hijri_demand_curve  enable row level security;
alter table public.stockout_forecast   enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array['velocity_state','hijri_demand_curve','stockout_forecast'])
  loop
    execute format('drop policy if exists "anon_all" on public.%I', t);
    execute format('create policy "anon_all" on public.%I for all using (true) with check (true)', t);
  end loop;
end$$;

grant select on public.v_stockout_critiques to anon, authenticated;

notify pgrst, 'reload schema';
