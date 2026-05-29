-- ============================================================================
-- 0032_dlc_engine.sql — DLC alerts engine (Bet 2)
-- ----------------------------------------------------------------------------
-- Demo-mode foundations for the date limite de consommation (DLC) alerts
-- engine. Powers the staff banner, the /v2/admin/alertes-dlc dashboard and
-- the Drive courte date entry point.
--
-- Dependencies:
--   - migration 0031 (Bet 1) creates public.produits_lots with a `dlc` column.
--     This migration is defensive: it will guard the produits_lots reference
--     so that the view and seed block do not crash if the table is missing.
--
-- Idempotent: rules are seeded via ON CONFLICT DO NOTHING and demo lots use
-- ON CONFLICT (id) DO UPDATE so re-running the migration is safe.
-- ============================================================================

-- ── Pricing rules ───────────────────────────────────────────────────────────
-- Discount rules per category. Configurable from admin (later). Currently
-- seeded with standard anti-gaspi defaults so the demo has signal.
create table if not exists public.dlc_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  categorie text not null,                  -- ex 'Boucherie', 'Frais', 'Charcuterie', 'Traiteur', 'Surgelés'
  jours_avant_dlc integer not null,         -- 1, 2, 3, 7…
  remise_pct integer not null check (remise_pct between 0 and 100),
  active boolean not null default true,
  unique (categorie, jours_avant_dlc)
);

-- Seed anti-gaspi defaults (idempotent).
insert into public.dlc_pricing_rules (categorie, jours_avant_dlc, remise_pct) values
  ('Boucherie', 7, 0), ('Boucherie', 3, 15), ('Boucherie', 2, 30), ('Boucherie', 1, 50),
  ('Charcuterie', 7, 0), ('Charcuterie', 3, 15), ('Charcuterie', 2, 30), ('Charcuterie', 1, 50),
  ('Frais', 5, 0), ('Frais', 2, 30), ('Frais', 1, 50),
  ('Traiteur', 3, 0), ('Traiteur', 2, 30), ('Traiteur', 1, 50),
  ('Surgelés', 30, 0)
on conflict (categorie, jours_avant_dlc) do nothing;

-- ── View: v_dlc_alerts ──────────────────────────────────────────────────────
-- Lots actifs avec leur niveau d'alerte calculé.
-- Niveaux :
--   forcé        → DLC <= aujourd'hui (à démarquer)
--   critique     → 0 < jours_restants <= 1 (J-1)
--   attention    → 1 < jours_restants <= 3 (J-2 / J-3)
--   surveillance → 3 < jours_restants <= 7 (J-4 → J-7)
--   ok           → > 7 jours
-- La vue ne suppose pas la présence de la table produits_lots. Si elle est
-- absente (cas où 0031 n'a pas encore été appliquée dans certains envs), on
-- crée une vue vide compatible pour ne pas casser les appels frontend.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'produits_lots'
  ) then
    execute $view$
      create or replace view public.v_dlc_alerts as
      select
        l.id                                                   as lot_id,
        l.produit_id                                           as produit_id,
        p.nom                                                  as produit_nom,
        p.categorie                                            as produit_categorie,
        l.dlc                                                  as dlc,
        (l.dlc - current_date)                                 as jours_restants,
        case
          when l.dlc <= current_date            then 'forcé'
          when (l.dlc - current_date) <= 1      then 'critique'
          when (l.dlc - current_date) <= 3      then 'attention'
          when (l.dlc - current_date) <= 7      then 'surveillance'
          else 'ok'
        end                                                    as niveau_alerte,
        coalesce(
          (
            select r.remise_pct
            from public.dlc_pricing_rules r
            where r.categorie = p.categorie
              and r.jours_avant_dlc >= (l.dlc - current_date)
              and r.active = true
            order by r.jours_avant_dlc asc
            limit 1
          ),
          0
        )                                                      as remise_suggeree_pct,
        l.quantite_recue                                       as quantite_recue,
        l.unite                                                as unite
      from public.produits_lots l
      join public.produits p on p.id = l.produit_id
      where l.dlc is not null;
    $view$;
  else
    -- Fallback vide (mêmes colonnes) si produits_lots n'existe pas encore.
    execute $view$
      create or replace view public.v_dlc_alerts as
      select
        null::text     as lot_id,
        null::uuid     as produit_id,
        null::text     as produit_nom,
        null::text     as produit_categorie,
        null::date     as dlc,
        null::integer  as jours_restants,
        null::text     as niveau_alerte,
        0              as remise_suggeree_pct,
        null::numeric  as quantite_recue,
        null::text     as unite
      where false;
    $view$;
  end if;
end $$;

-- ── Demo seed: 3 lots avec DLC J-1, J-2, J-7 ────────────────────────────────
-- Ces inserts ne s'exécutent que si la table produits_lots existe ET si on
-- trouve les produits cibles dans le catalogue. Le bloc est entièrement
-- idempotent (ON CONFLICT (id) DO UPDATE SET dlc = ...).
do $$
declare
  v_p1 uuid;
  v_p2 uuid;
  v_p3 uuid;
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'produits_lots'
  ) then
    raise notice '[0032] produits_lots absent, demo seed sauté';
    return;
  end if;

  select id into v_p1 from public.produits where nom ilike '%merguez%maison%' limit 1;
  select id into v_p2 from public.produits where nom ilike '%escalope%poulet%' limit 1;
  select id into v_p3 from public.produits where nom ilike '%pavé%saumon%' limit 1;

  if v_p1 is not null then
    insert into public.produits_lots (
      id, produit_id, supplier_lot, certifier_id, certifier_name,
      abattoir_nom, date_abattage, dlc, quantite_recue, unite, notes
    ) values (
      'L2026-05-DLC1', v_p1, 'MERG-2026-22', 'AVS', 'AVS — A Votre Service',
      'Atelier maison K&A', '2026-05-27', current_date + interval '1 day',
      4.2, 'kg', 'Lot DLC J-1 démo'
    )
    on conflict (id) do update set
      dlc = excluded.dlc,
      quantite_recue = excluded.quantite_recue,
      notes = excluded.notes;
  end if;

  if v_p2 is not null then
    insert into public.produits_lots (
      id, produit_id, supplier_lot, certifier_id, certifier_name,
      abattoir_nom, date_abattage, dlc, quantite_recue, unite, notes
    ) values (
      'L2026-05-DLC2', v_p2, 'ESC-2026-09', 'ARGML', 'ARGML — Lyon',
      'Bigard Castres', '2026-05-26', current_date + interval '2 days',
      6.8, 'kg', 'Lot DLC J-2 démo'
    )
    on conflict (id) do update set
      dlc = excluded.dlc,
      quantite_recue = excluded.quantite_recue,
      notes = excluded.notes;
  end if;

  if v_p3 is not null then
    insert into public.produits_lots (
      id, produit_id, supplier_lot, certifier_id, certifier_name,
      abattoir_nom, date_abattage, dlc, quantite_recue, unite, notes
    ) values (
      'L2026-05-DLC3', v_p3, 'SAUM-2026-04', 'AVS', 'AVS — A Votre Service',
      'Norvège pêche durable', '2026-05-25', current_date + interval '7 days',
      8.0, 'kg', 'Lot DLC J-7 démo'
    )
    on conflict (id) do update set
      dlc = excluded.dlc,
      quantite_recue = excluded.quantite_recue,
      notes = excluded.notes;
  end if;
end $$;

-- ── RLS / Grants ────────────────────────────────────────────────────────────
-- Pricing rules : read public (la UI staff doit pouvoir afficher la remise
-- suggérée sans service-role), write restreint à l'admin (policy gérée par
-- la migration admin globale plus tard — pour le démo on garde permissif).
alter table public.dlc_pricing_rules enable row level security;

drop policy if exists "dlc_pricing_rules_read_all" on public.dlc_pricing_rules;
create policy "dlc_pricing_rules_read_all"
  on public.dlc_pricing_rules
  for select
  using (true);

-- La vue hérite des permissions de la table sous-jacente (produits_lots /
-- produits) — pas de RLS supplémentaire ici. Si produits_lots a sa propre
-- RLS, elle filtre automatiquement la vue.
grant select on public.v_dlc_alerts to anon, authenticated;
grant select on public.dlc_pricing_rules to anon, authenticated;
