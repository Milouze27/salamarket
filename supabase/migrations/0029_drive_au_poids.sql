-- =====================================================================
-- 0029_drive_au_poids.sql
-- Système de Drive au poids variable + Stripe manual capture.
--
-- Date : 2026-05-15
-- Échéance démo : 2026-06-10
--
-- Hypothèses figées (cf. BLOCKERS.md) :
--   - Catalogue : DEUX tables (products EN, produits FR) — colonnes
--     ajoutées sur les deux pour cohérence cross-app
--   - Drive orders canoniques = commandes_drive + commandes_drive_lignes
--     (et non drive_orders/drive_order_lines du brief)
--   - drive_ecarts_poids référence commandes_drive_lignes(id)
--   - RLS pattern : policies pour authenticated SANS clause `to anon`
--     stricte (cf. RLS Labo fixée le 2026-05-15)
--   - Idempotent : IF NOT EXISTS partout
-- =====================================================================

-- ════════════════════════════════════════════════════════════════════
-- 1. CATALOGUE — Ajout colonnes weight sur products (EN) ET produits (FR)
-- ════════════════════════════════════════════════════════════════════

-- products (salamarket-drive)
alter table public.products
  add column if not exists unit_type text not null default 'unit';

alter table public.products
  drop constraint if exists products_unit_type_check;

alter table public.products
  add constraint products_unit_type_check
  check (unit_type in ('unit', 'weight', 'weight_bracket'));

alter table public.products
  add column if not exists price_per_kg numeric;

alter table public.products
  add column if not exists estimated_weight_kg numeric;

alter table public.products
  add column if not exists poids_min_kg numeric;

alter table public.products
  add column if not exists poids_max_kg numeric;

-- Cohérence : weight_bracket exige min < max
alter table public.products
  drop constraint if exists products_poids_bracket_check;

alter table public.products
  add constraint products_poids_bracket_check
  check (
    unit_type <> 'weight_bracket'
    or (poids_min_kg is not null and poids_max_kg is not null
        and poids_min_kg < poids_max_kg)
  );


-- produits (salam-stock) — mêmes colonnes, mêmes contraintes
alter table public.produits
  add column if not exists unit_type text not null default 'unit';

alter table public.produits
  drop constraint if exists produits_unit_type_check;

alter table public.produits
  add constraint produits_unit_type_check
  check (unit_type in ('unit', 'weight', 'weight_bracket'));

alter table public.produits
  add column if not exists price_per_kg numeric;

alter table public.produits
  add column if not exists estimated_weight_kg numeric;

alter table public.produits
  add column if not exists poids_min_kg numeric;

alter table public.produits
  add column if not exists poids_max_kg numeric;

alter table public.produits
  drop constraint if exists produits_poids_bracket_check;

alter table public.produits
  add constraint produits_poids_bracket_check
  check (
    unit_type <> 'weight_bracket'
    or (poids_min_kg is not null and poids_max_kg is not null
        and poids_min_kg < poids_max_kg)
  );


-- ════════════════════════════════════════════════════════════════════
-- 2. COMMANDES — Stripe manual capture sur commandes_drive
-- ════════════════════════════════════════════════════════════════════

alter table public.commandes_drive
  add column if not exists stripe_payment_intent_id text;

alter table public.commandes_drive
  add column if not exists montant_autorise_ttc numeric;

alter table public.commandes_drive
  add column if not exists montant_capture_ttc numeric;

alter table public.commandes_drive
  add column if not exists statut_paiement text default 'autorise';

alter table public.commandes_drive
  drop constraint if exists commandes_drive_statut_paiement_check;

alter table public.commandes_drive
  add constraint commandes_drive_statut_paiement_check
  check (statut_paiement in ('autorise', 'capture', 'libere', 'echec'));

alter table public.commandes_drive
  add column if not exists autorisation_expire_at timestamptz;

-- Index sur le PaymentIntent ID pour les webhooks Stripe (lookup rapide)
create unique index if not exists uq_commandes_drive_stripe_pi
  on public.commandes_drive(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists idx_commandes_drive_statut_paiement
  on public.commandes_drive(statut_paiement);


-- ════════════════════════════════════════════════════════════════════
-- 3. LIGNES — Pesée + écarts sur commandes_drive_lignes
-- ════════════════════════════════════════════════════════════════════

alter table public.commandes_drive_lignes
  add column if not exists quantite_estimee numeric;

alter table public.commandes_drive_lignes
  add column if not exists quantite_reelle_pesee numeric;

alter table public.commandes_drive_lignes
  add column if not exists montant_estime_ttc numeric;

alter table public.commandes_drive_lignes
  add column if not exists montant_reel_ttc numeric;

alter table public.commandes_drive_lignes
  add column if not exists pese_par uuid references public.profiles(id) on delete set null;

alter table public.commandes_drive_lignes
  add column if not exists pese_at timestamptz;

create index if not exists idx_commandes_drive_lignes_pese
  on public.commandes_drive_lignes(pese_at) where pese_at is not null;


-- ════════════════════════════════════════════════════════════════════
-- 4. AUDIT — drive_ecarts_poids
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.drive_ecarts_poids (
  id              uuid primary key default gen_random_uuid(),
  ligne_id        uuid not null references public.commandes_drive_lignes(id) on delete cascade,
  ecart_pct       numeric not null,
  action          text not null,
  decision_par    uuid references public.profiles(id) on delete set null,
  decision_at     timestamptz not null default now(),
  notes           text,

  constraint drive_ecarts_poids_action_check
    check (action in (
      'auto_accept',                 -- écart < 10 %, validation automatique
      'preparator_decision',         -- 10-20 % : préparateur tranche
      'client_notify',               -- 10-20 % et > 5 € : notification client
      'client_validation_required'   -- > 20 % : validation client obligatoire
    ))
);

create index if not exists idx_drive_ecarts_poids_ligne
  on public.drive_ecarts_poids(ligne_id);

create index if not exists idx_drive_ecarts_poids_action
  on public.drive_ecarts_poids(action);


-- ════════════════════════════════════════════════════════════════════
-- 5. ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════════════
-- Pattern aligné sur 0025_drive_pro.sql (qui marche pour
-- authenticated). Pas de clause `to anon` stricte. La table
-- drive_ecarts_poids n'est lisible/modifiable que par staff
-- (admin/manager/employee).

alter table public.drive_ecarts_poids enable row level security;

drop policy if exists "ecarts_poids_select_staff" on public.drive_ecarts_poids;
create policy "ecarts_poids_select_staff"
  on public.drive_ecarts_poids for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'manager', 'employee')
    )
  );

drop policy if exists "ecarts_poids_insert_staff" on public.drive_ecarts_poids;
create policy "ecarts_poids_insert_staff"
  on public.drive_ecarts_poids for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('admin', 'manager', 'employee')
    )
  );

-- Les colonnes ajoutées à products / produits / commandes_drive /
-- commandes_drive_lignes héritent automatiquement des policies des
-- tables existantes. Rien de plus à faire ici.


-- ════════════════════════════════════════════════════════════════════
-- 6. VÉRIFICATION (à lancer manuellement post-application)
-- ════════════════════════════════════════════════════════════════════
--
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema = 'public'
--    and (
--         (table_name = 'products' and column_name in ('unit_type','price_per_kg','estimated_weight_kg','poids_min_kg','poids_max_kg'))
--      or (table_name = 'produits' and column_name in ('unit_type','price_per_kg','estimated_weight_kg','poids_min_kg','poids_max_kg'))
--      or (table_name = 'commandes_drive' and column_name in ('stripe_payment_intent_id','montant_autorise_ttc','montant_capture_ttc','statut_paiement','autorisation_expire_at'))
--      or (table_name = 'commandes_drive_lignes' and column_name in ('quantite_estimee','quantite_reelle_pesee','montant_estime_ttc','montant_reel_ttc','pese_par','pese_at'))
--      or table_name = 'drive_ecarts_poids'
--      )
--  order by table_name, ordinal_position;
--
-- Et :
--   select count(*) from public.drive_ecarts_poids;
