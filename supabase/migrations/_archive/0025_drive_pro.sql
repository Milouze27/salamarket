-- =====================================================================
-- 0025_drive_pro.sql
-- Module B2B Pro : comptes pro, catalogue prix HT, commandes pro, lignes.
-- 4 tables + 2 séquences + 5 triggers + RLS + indexes.
--
-- Hypothèses validées sur Supabase (2026-05-14) :
--   - Tables existantes : products (PK id uuid), profiles (PK id uuid, role text)
--   - Rôles utilisés : 'admin', 'manager', 'employee'
--   - products.tva_taux numeric not null existe
--   - Fonction update_updated_at_column() existe déjà (migration profiles)
-- =====================================================================

-- =====================================================================
-- SECTION 1 — Table comptes_pro
-- Représente une entreprise cliente (resto, traiteur, école, association)
-- =====================================================================

create table public.comptes_pro (
  id                    uuid primary key default gen_random_uuid(),
  raison_sociale        text not null,
  siret                 text not null unique,
  forme_juridique       text,                    -- 'SARL', 'SAS', 'EI', 'Association'
  tva_intracom          text,                    -- 'FR12345678901'
  adresse_facturation   text not null,
  adresse_livraison     text,
  delegue_user_id       uuid references public.profiles(id) on delete set null,
  delegue_nom           text not null,
  delegue_telephone     text not null,
  delegue_email         text not null,
  mandat_sepa_id        text,                    -- ID GoCardless ou Stripe SetupIntent, jamais l'IBAN brut
  conditions_paiement   text not null default 'comptant',
  encours_max           numeric not null default 0,
  encours_actuel        numeric not null default 0,
  statut                text not null default 'en_validation',
  notes_interne         text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  valide_par_profile_id uuid references public.profiles(id) on delete set null,
  valide_at             timestamptz,

  constraint comptes_pro_statut_check
    check (statut in ('en_validation', 'actif', 'suspendu', 'archive')),
  constraint comptes_pro_conditions_paiement_check
    check (conditions_paiement in ('comptant', '30_jours', '45_jours_fin_mois'))
);

create index idx_comptes_pro_delegue on public.comptes_pro(delegue_user_id);
create index idx_comptes_pro_statut  on public.comptes_pro(statut);

-- =====================================================================
-- SECTION 2 — Table produits_pro_prix
-- Tarif Pro HT par produit + dégressifs volume
-- Un seul tarif "actif" par produit grâce à l'index unique partiel
-- =====================================================================

create table public.produits_pro_prix (
  id                            uuid primary key default gen_random_uuid(),
  produit_id                    uuid not null references public.products(id) on delete cascade,
  prix_ht_unitaire              numeric not null,
  conditionnement_pro           text,                  -- 'carton de 12', 'palette de 60'
  quantite_par_conditionnement  integer not null default 1,
  prix_ht_par_conditionnement   numeric,
  remise_palier_1_pct           numeric,
  qty_palier_1                  integer,
  remise_palier_2_pct           numeric,
  qty_palier_2                  integer,
  actif                         boolean not null default true,
  valide_a_partir_de            date not null default current_date,
  disponible_drive_pro          boolean not null default true,
  created_at                    timestamptz not null default now()
);

create unique index uniq_produits_pro_prix_actif
  on public.produits_pro_prix(produit_id)
  where actif = true;

-- =====================================================================
-- SECTION 3 — Séquences pour numéros de commande et de facture
-- Une séquence par année, conforme aux exigences compta françaises
-- =====================================================================

create sequence if not exists public.seq_commande_pro_2026 start 1;
create sequence if not exists public.seq_facture_2026 start 1;

-- =====================================================================
-- SECTION 4 — Table commandes_pro
-- Une commande passée par un compte_pro, avec workflow de validation
-- =====================================================================

create table public.commandes_pro (
  id                        uuid primary key default gen_random_uuid(),
  compte_pro_id             uuid not null references public.comptes_pro(id) on delete restrict,
  numero_commande           text unique,                 -- 'CP-2026-0001', généré par trigger
  date_commande             timestamptz not null default now(),
  date_livraison_souhaitee  date,
  creneau_livraison_debut   time,
  creneau_livraison_fin     time,
  type_recuperation         text not null default 'livraison',
  statut                    text not null default 'a_valider',
  validee_par_profile_id    uuid references public.profiles(id) on delete set null,
  validee_at                timestamptz,
  montant_ht                numeric not null default 0,
  montant_tva               numeric not null default 0,
  montant_ttc               numeric not null default 0,
  mode_paiement             text,
  facture_url               text,                        -- URL Supabase Storage du PDF
  facture_numero            text unique,                 -- 'F-2026-0042', généré au passage en 'facturee'
  date_echeance             date,
  date_paiement             timestamptz,
  notes_client              text,
  notes_interne             text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint commandes_pro_type_recuperation_check
    check (type_recuperation in ('livraison', 'retrait_pro')),
  constraint commandes_pro_statut_check
    check (statut in ('a_valider', 'validee', 'en_preparation', 'expediee', 'livree', 'facturee', 'payee', 'annulee')),
  constraint commandes_pro_mode_paiement_check
    check (mode_paiement is null or mode_paiement in ('stripe', 'virement_30j', 'prelevement_sepa'))
);

create index idx_commandes_pro_compte_statut on public.commandes_pro(compte_pro_id, statut);
create index idx_commandes_pro_relances      on public.commandes_pro(date_echeance)
  where statut not in ('payee', 'annulee');

-- =====================================================================
-- SECTION 5 — Table commandes_pro_lignes
-- Lignes d'une commande Pro, avec dénormalisation et colonnes générées
-- =====================================================================

create table public.commandes_pro_lignes (
  id                              uuid primary key default gen_random_uuid(),
  commande_pro_id                 uuid not null references public.commandes_pro(id) on delete cascade,
  produit_id                      uuid not null references public.products(id) on delete restrict,
  quantite_conditionnements       integer not null,
  quantite_par_conditionnement    integer not null,                       -- snapshot au moment de la commande
  quantite_unitaire_totale        numeric generated always as (quantite_conditionnements * quantite_par_conditionnement) stored,
  prix_ht_unitaire                numeric not null,
  prix_ht_total                   numeric generated always as (quantite_conditionnements * quantite_par_conditionnement * prix_ht_unitaire) stored,
  tva_taux                        numeric,                                -- copié depuis products.tva_taux par trigger si null
  created_at                      timestamptz not null default now()
);

create index idx_commandes_pro_lignes_commande on public.commandes_pro_lignes(commande_pro_id);

-- =====================================================================
-- SECTION 6 — Trigger : génération numero_commande au INSERT
-- =====================================================================

create or replace function public.gen_numero_commande_pro()
returns trigger
language plpgsql
as $$
begin
  if new.numero_commande is null then
    new.numero_commande := 'CP-2026-' || lpad(nextval('public.seq_commande_pro_2026')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger trg_gen_numero_commande_pro
  before insert on public.commandes_pro
  for each row execute function public.gen_numero_commande_pro();

-- =====================================================================
-- SECTION 7 — Trigger : génération facture_numero à la transition vers 'facturee'
-- =====================================================================

create or replace function public.gen_facture_numero()
returns trigger
language plpgsql
as $$
begin
  if new.statut = 'facturee'
     and (old.statut is distinct from 'facturee')
     and new.facture_numero is null then
    new.facture_numero := 'F-2026-' || lpad(nextval('public.seq_facture_2026')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger trg_gen_facture_numero
  before update on public.commandes_pro
  for each row execute function public.gen_facture_numero();

-- =====================================================================
-- SECTION 8 — Trigger : copie tva_taux depuis products si non fournie
-- =====================================================================

create or replace function public.set_ligne_tva_taux()
returns trigger
language plpgsql
as $$
declare
  v_tva numeric;
begin
  if new.tva_taux is null then
    select tva_taux into v_tva from public.products where id = new.produit_id;
    if v_tva is null then
      raise exception 'Produit % introuvable ou sans tva_taux', new.produit_id;
    end if;
    new.tva_taux := v_tva;
  end if;
  return new;
end;
$$;

create trigger trg_set_ligne_tva_taux
  before insert on public.commandes_pro_lignes
  for each row execute function public.set_ligne_tva_taux();

-- =====================================================================
-- SECTION 9 — Trigger : recalcul de l'encours du compte pro
-- À chaque INSERT/UPDATE/DELETE sur commandes_pro, on recalcule l'encours
-- =====================================================================

create or replace function public.recalc_encours_compte_pro()
returns trigger
language plpgsql
as $$
declare
  v_compte_id uuid;
  v_old_compte_id uuid;
begin
  if tg_op = 'DELETE' then
    v_compte_id := old.compte_pro_id;
  else
    v_compte_id := new.compte_pro_id;
  end if;

  -- Recalcul pour le compte actuel
  update public.comptes_pro
  set encours_actuel = (
    select coalesce(sum(montant_ttc), 0)
    from public.commandes_pro
    where compte_pro_id = v_compte_id
      and statut not in ('payee', 'annulee')
  )
  where id = v_compte_id;

  -- Cas particulier : UPDATE qui change le compte_pro_id → on recalcule aussi l'ancien
  if tg_op = 'UPDATE' and old.compte_pro_id is distinct from new.compte_pro_id then
    update public.comptes_pro
    set encours_actuel = (
      select coalesce(sum(montant_ttc), 0)
      from public.commandes_pro
      where compte_pro_id = old.compte_pro_id
        and statut not in ('payee', 'annulee')
    )
    where id = old.compte_pro_id;
  end if;

  return coalesce(new, old);
end;
$$;

create trigger trg_recalc_encours_insert
  after insert on public.commandes_pro
  for each row execute function public.recalc_encours_compte_pro();

create trigger trg_recalc_encours_update
  after update on public.commandes_pro
  for each row execute function public.recalc_encours_compte_pro();

create trigger trg_recalc_encours_delete
  after delete on public.commandes_pro
  for each row execute function public.recalc_encours_compte_pro();

-- =====================================================================
-- SECTION 10 — updated_at automatique
-- Réutilise la fonction update_updated_at_column() déjà créée par la migration profiles
-- =====================================================================

create trigger trg_comptes_pro_updated_at
  before update on public.comptes_pro
  for each row execute function public.update_updated_at_column();

create trigger trg_commandes_pro_updated_at
  before update on public.commandes_pro
  for each row execute function public.update_updated_at_column();

-- =====================================================================
-- SECTION 11 — Row Level Security
-- Rôles : admin, manager, employee
-- admin + manager → ALL sur tout
-- délégué d'un compte → SELECT sur son compte + ses commandes + le catalogue Pro
-- =====================================================================

alter table public.comptes_pro            enable row level security;
alter table public.produits_pro_prix      enable row level security;
alter table public.commandes_pro          enable row level security;
alter table public.commandes_pro_lignes   enable row level security;

-- comptes_pro
create policy "comptes_pro_select_delegue"
  on public.comptes_pro for select
  using (auth.uid() = delegue_user_id);

create policy "comptes_pro_all_admin_manager"
  on public.comptes_pro for all
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'manager')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'manager')
  ));

-- commandes_pro
create policy "commandes_pro_select_delegue"
  on public.commandes_pro for select
  using (exists (
    select 1 from public.comptes_pro cp
    where cp.id = commandes_pro.compte_pro_id
      and cp.delegue_user_id = auth.uid()
  ));

create policy "commandes_pro_all_admin_manager"
  on public.commandes_pro for all
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'manager')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'manager')
  ));

-- commandes_pro_lignes
create policy "commandes_pro_lignes_select_delegue"
  on public.commandes_pro_lignes for select
  using (exists (
    select 1 from public.commandes_pro cmd
    join public.comptes_pro cp on cp.id = cmd.compte_pro_id
    where cmd.id = commandes_pro_lignes.commande_pro_id
      and cp.delegue_user_id = auth.uid()
  ));

create policy "commandes_pro_lignes_all_admin_manager"
  on public.commandes_pro_lignes for all
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'manager')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'manager')
  ));

-- produits_pro_prix
create policy "produits_pro_prix_select_pro"
  on public.produits_pro_prix for select
  using (exists (
    select 1 from public.comptes_pro cp
    where cp.delegue_user_id = auth.uid()
      and cp.statut = 'actif'
  ));

create policy "produits_pro_prix_all_admin_manager"
  on public.produits_pro_prix for all
  using (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'manager')
  ))
  with check (exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'manager')
  ));

-- =====================================================================
-- SECTION 12 — Permissions de base
-- =====================================================================

grant select, insert, update on public.comptes_pro            to authenticated;
grant select, insert, update on public.commandes_pro          to authenticated;
grant select, insert, update on public.commandes_pro_lignes   to authenticated;
grant select                 on public.produits_pro_prix      to authenticated;
