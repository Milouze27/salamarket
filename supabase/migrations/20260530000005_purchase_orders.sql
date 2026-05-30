-- ════════════════════════════════════════════════════════════════
-- 0036 — Auto-PO + certif halal blocking
--
-- Pour qu'Otmane n'ait JAMAIS à se demander "qui je commande ?" :
--   • fournisseurs enrichis : email_commandes, lead_time, franco,
--     jours_livraison[1..7], certificat halal (organisme + expire)
--   • multi-fournisseur par SKU (est_principal=true → suggéré)
--   • purchase_orders avec state machine stricte
--
-- Garde-fou MÉTIER : si certif_expire_le < now(), le PO doit refuser
-- de partir (vérifié côté app/edge function, helper SQL fourni).
-- ════════════════════════════════════════════════════════════════

-- ─── Enums certif halal + statut PO ────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'certif_organisme') then
    create type certif_organisme as enum ('AVS','ARGML','ACMIF','SFCVH','MOSQUEE_PARIS','AUTRE');
  end if;
  if not exists (select 1 from pg_type where typname = 'po_statut') then
    create type po_statut as enum (
      'brouillon','envoyee','confirmee','partiellement_recue','recue','annulee'
    );
  end if;
end$$;

-- ─── Upgrade fournisseurs ──────────────────────────────────────────
alter table public.fournisseurs
  add column if not exists email_commandes     text,
  add column if not exists lead_time_jours     integer check (lead_time_jours >= 0),
  add column if not exists min_commande_euros  numeric(10,2) check (min_commande_euros >= 0),
  add column if not exists franco_de_port      numeric(10,2) check (franco_de_port >= 0),
  add column if not exists jours_livraison     integer[] default array[]::integer[],
                                                -- ISO 1=lun … 7=dim
  add column if not exists certif_organisme    certif_organisme,
  add column if not exists certif_numero       text,
  add column if not exists certif_expire_le    date,
  add column if not exists certif_pdf_url      text,
  add column if not exists actif               boolean not null default true,
  add column if not exists updated_at          timestamptz not null default now();

create index if not exists idx_fournisseurs_certif_expire
  on public.fournisseurs(certif_expire_le)
  where certif_expire_le is not null;

-- ─── Multi-fournisseur par SKU ────────────────────────────────────
create table if not exists public.produits_fournisseurs (
  id                   uuid primary key default gen_random_uuid(),
  produit_id           uuid not null references public.produits(id) on delete cascade,
  fournisseur_id       uuid not null references public.fournisseurs(id) on delete cascade,
  reference_fourn      text,
  prix_achat_ht        numeric(10,4) check (prix_achat_ht >= 0),
  conditionnement_qte  integer not null default 1 check (conditionnement_qte > 0),
  est_principal        boolean not null default false,
  derniere_commande_le date,
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (produit_id, fournisseur_id)
);

-- Un seul "principal" par produit
create unique index if not exists uniq_pf_principal_par_produit
  on public.produits_fournisseurs(produit_id) where est_principal = true;

create index if not exists idx_pf_produit on public.produits_fournisseurs(produit_id);
create index if not exists idx_pf_fournisseur on public.produits_fournisseurs(fournisseur_id);

-- ─── Bons de commande (purchase orders) ────────────────────────────
create sequence if not exists public.po_numero_seq start 10001;

create table if not exists public.purchase_orders (
  id                  uuid primary key default gen_random_uuid(),
  numero_po           text not null unique
                        default ('PO-' || lpad(nextval('public.po_numero_seq')::text, 6, '0')),
  fournisseur_id      uuid not null references public.fournisseurs(id),
  depot_destination_id uuid not null references public.depots(id),
  statut              po_statut not null default 'brouillon',
  date_creation       date not null default current_date,
  date_envoi          timestamptz,
  date_livraison_prevue date,
  date_reception      timestamptz,
  total_ht            numeric(12,2) not null default 0,
  total_ttc           numeric(12,2) not null default 0,
  email_envoye_a      text,
  email_message_id    text,
  bdl_id              uuid references public.bons_de_livraison(id),  -- lien BDL réception
  cree_par            uuid references public.employes(id),
  envoye_par          uuid references public.employes(id),
  notes               text,
  -- Snapshot certif au moment de l'envoi (audit halal)
  certif_organisme_snapshot   certif_organisme,
  certif_numero_snapshot      text,
  certif_expire_le_snapshot   date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_po_statut on public.purchase_orders(statut, date_creation desc);
create index if not exists idx_po_fournisseur on public.purchase_orders(fournisseur_id, date_creation desc);
create index if not exists idx_po_depot on public.purchase_orders(depot_destination_id, date_creation desc);

-- ─── Lignes du PO ──────────────────────────────────────────────────
create table if not exists public.purchase_order_lignes (
  id                  uuid primary key default gen_random_uuid(),
  po_id               uuid not null references public.purchase_orders(id) on delete cascade,
  produit_id          uuid not null references public.produits(id),
  reference_fourn     text,
  quantite_commandee  numeric(12,3) not null check (quantite_commandee > 0),
  quantite_recue      numeric(12,3) not null default 0 check (quantite_recue >= 0),
  prix_achat_ht       numeric(10,4) not null default 0,
  tva_pct             numeric(5,2) not null default 5.50,
  ligne_total_ht      numeric(12,2) generated always as
                        (round(quantite_commandee * prix_achat_ht, 2)) stored,
  notes               text
);

create index if not exists idx_po_lignes_po on public.purchase_order_lignes(po_id);
create index if not exists idx_po_lignes_produit on public.purchase_order_lignes(produit_id);

-- ─── Garde-fou métier : certif halal valide à l'envoi ──────────────
create or replace function public.fournisseur_certif_halal_valide(p_fournisseur_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select certif_organisme is not null
         and certif_numero    is not null
         and certif_expire_le is not null
         and certif_expire_le > current_date
       from public.fournisseurs where id = p_fournisseur_id),
    false
  );
$$;

-- Trigger : on bloque le passage brouillon → envoyee si certif KO,
-- et on snapshote la certif sur le PO.
create or replace function public.tg_po_check_certif_halal()
returns trigger
language plpgsql
as $$
declare
  v_org   certif_organisme;
  v_num   text;
  v_exp   date;
begin
  if NEW.statut = 'envoyee' and (OLD.statut is distinct from 'envoyee') then
    select certif_organisme, certif_numero, certif_expire_le
      into v_org, v_num, v_exp
      from public.fournisseurs
      where id = NEW.fournisseur_id;

    if v_org is null or v_num is null or v_exp is null or v_exp <= current_date then
      raise exception
        'PO % bloqué : certificat halal manquant ou expiré (fournisseur %)',
        NEW.numero_po, NEW.fournisseur_id
        using errcode = 'check_violation';
    end if;

    NEW.certif_organisme_snapshot := v_org;
    NEW.certif_numero_snapshot    := v_num;
    NEW.certif_expire_le_snapshot := v_exp;
    NEW.date_envoi := coalesce(NEW.date_envoi, now());
  end if;
  return NEW;
end$$;

drop trigger if exists trg_po_check_certif_halal on public.purchase_orders;
create trigger trg_po_check_certif_halal
  before update on public.purchase_orders
  for each row execute function public.tg_po_check_certif_halal();

-- ─── Vue : fournisseurs avec certif bientôt expirée (cockpit) ─────
create or replace view public.v_fournisseurs_certif_alerte as
select
  id,
  nom,
  certif_organisme,
  certif_numero,
  certif_expire_le,
  (certif_expire_le - current_date) as jours_restants,
  case
    when certif_expire_le is null then 'manquante'
    when certif_expire_le <= current_date then 'expiree'
    when certif_expire_le <= current_date + 30 then 'expire_30j'
    when certif_expire_le <= current_date + 60 then 'expire_60j'
    else 'ok'
  end as alerte
from public.fournisseurs
where actif = true
  and (certif_expire_le is null or certif_expire_le <= current_date + 60);

-- ─── RLS ───────────────────────────────────────────────────────────
alter table public.produits_fournisseurs   enable row level security;
alter table public.purchase_orders         enable row level security;
alter table public.purchase_order_lignes   enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array[
    'produits_fournisseurs','purchase_orders','purchase_order_lignes'
  ])
  loop
    execute format('drop policy if exists "anon_all" on public.%I', t);
    execute format('create policy "anon_all" on public.%I for all using (true) with check (true)', t);
  end loop;
end$$;

grant select on public.v_fournisseurs_certif_alerte to anon, authenticated;

notify pgrst, 'reload schema';
