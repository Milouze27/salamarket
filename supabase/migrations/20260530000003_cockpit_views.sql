-- ════════════════════════════════════════════════════════════════
-- 0034 — Manager Cockpit "Sabah" (matin)
--
-- Vue d'ensemble en 30 secondes pour Otmane à l'ouverture :
--   • CA de la veille vs target par dépôt
--   • Intel concurrent Aya Market (prix + photo manuel)
--   • Calendrier hijri (Ramadan / Aïd / Achoura)
--
-- Tables :
--   - cockpit_targets        : objectifs CA quotidiens par dépôt
--   - competitor_intel       : relevés prix concurrent (manuel + photo)
--   - hijri_events           : dates grégoriennes Ramadan/Aïd/Achoura
--
-- Vue matérialisée :
--   - mv_ventes_quotidiennes : agrégat ventes_cashmag_import jour×dépôt
-- ════════════════════════════════════════════════════════════════

-- ─── Targets CA par dépôt × jour ───────────────────────────────────
create table if not exists public.cockpit_targets (
  id            uuid primary key default gen_random_uuid(),
  depot_id      uuid not null references public.depots(id) on delete cascade,
  jour          date not null,
  target_ca     numeric(12,2) not null check (target_ca >= 0),
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (depot_id, jour)
);

create index if not exists idx_cockpit_targets_jour
  on public.cockpit_targets(jour desc, depot_id);

-- ─── Intel concurrent (Aya Market à 200m) ──────────────────────────
create table if not exists public.competitor_intel (
  id              uuid primary key default gen_random_uuid(),
  concurrent_nom  text not null default 'Aya Market',
  produit_id      uuid references public.produits(id),
  libelle_releve  text not null,            -- ex: "Poulet entier 1.2kg"
  prix_releve_eur numeric(10,2) not null check (prix_releve_eur >= 0),
  unite           text,                     -- "kg", "pièce", "barquette"
  photo_url       text,
  releve_par      uuid references public.employes(id),
  releve_le       timestamptz not null default now(),
  notes           text
);

create index if not exists idx_competitor_intel_recent
  on public.competitor_intel(releve_le desc);
create index if not exists idx_competitor_intel_produit
  on public.competitor_intel(produit_id) where produit_id is not null;

-- ─── Calendrier hijri 2026-2030 (dates clés CA halal) ──────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'hijri_event_type') then
    create type hijri_event_type as enum (
      'ramadan_debut','ramadan_milieu','ramadan_fin_10j','ramadan_fin',
      'aid_fitr','aid_adha','achoura','mouloud','rajab','chaabane_15'
    );
  end if;
end$$;

create table if not exists public.hijri_events (
  id            uuid primary key default gen_random_uuid(),
  evenement     hijri_event_type not null,
  date_debut    date not null,
  date_fin      date not null,
  annee_hijri   integer not null,
  libelle       text not null,
  impact_ca     text check (impact_ca in ('faible','moyen','fort','critique')),
  notes         text,
  unique (evenement, annee_hijri)
);

create index if not exists idx_hijri_events_date
  on public.hijri_events(date_debut);

-- Seed Ramadan / Aïd / Achoura 2026-2030 (dates publiées MFCM Paris)
insert into public.hijri_events (evenement, date_debut, date_fin, annee_hijri, libelle, impact_ca) values
  ('ramadan_debut',   '2026-02-18','2026-02-18',1447,'Ramadan 1447 — début',         'critique'),
  ('ramadan_milieu',  '2026-03-05','2026-03-05',1447,'Ramadan 1447 — mi-Ramadan',    'fort'),
  ('ramadan_fin_10j', '2026-03-10','2026-03-19',1447,'Ramadan 1447 — 10 derniers j', 'critique'),
  ('aid_fitr',        '2026-03-20','2026-03-22',1447,'Aïd al-Fitr 1447',             'critique'),
  ('aid_adha',        '2026-05-27','2026-05-29',1447,'Aïd al-Adha 1447',             'critique'),
  ('achoura',         '2026-06-26','2026-06-26',1448,'Achoura 1448',                 'moyen'),
  ('mouloud',         '2026-08-25','2026-08-25',1448,'Mouloud 1448',                 'faible'),
  ('ramadan_debut',   '2027-02-08','2027-02-08',1448,'Ramadan 1448 — début',         'critique'),
  ('ramadan_fin_10j', '2027-02-28','2027-03-09',1448,'Ramadan 1448 — 10 derniers j', 'critique'),
  ('aid_fitr',        '2027-03-10','2027-03-12',1448,'Aïd al-Fitr 1448',             'critique'),
  ('aid_adha',        '2027-05-17','2027-05-19',1448,'Aïd al-Adha 1448',             'critique'),
  ('ramadan_debut',   '2028-01-28','2028-01-28',1449,'Ramadan 1449 — début',         'critique'),
  ('aid_fitr',        '2028-02-27','2028-03-01',1449,'Aïd al-Fitr 1449',             'critique'),
  ('aid_adha',        '2028-05-06','2028-05-08',1449,'Aïd al-Adha 1449',             'critique'),
  ('ramadan_debut',   '2029-01-16','2029-01-16',1450,'Ramadan 1450 — début',         'critique'),
  ('aid_fitr',        '2029-02-15','2029-02-17',1450,'Aïd al-Fitr 1450',             'critique'),
  ('aid_adha',        '2029-04-25','2029-04-27',1450,'Aïd al-Adha 1450',             'critique'),
  ('ramadan_debut',   '2030-01-06','2030-01-06',1451,'Ramadan 1451 — début',         'critique'),
  ('aid_fitr',        '2030-02-05','2030-02-07',1451,'Aïd al-Fitr 1451',             'critique'),
  ('aid_adha',        '2030-04-14','2030-04-16',1451,'Aïd al-Adha 1451',             'critique')
on conflict (evenement, annee_hijri) do nothing;

-- ─── Vue matérialisée : ventes quotidiennes ────────────────────────
-- Source : ventes_cashmag_import (migré 0011) — schéma RÉEL (cf 0011) :
--   date_vente (date), numero_ticket (text), quantite (numeric),
--   prix_ttc (numeric), prix_ht, tva_taux, mode_paiement, ...
-- PAS de depot_id ni montant_ttc/nb_tickets → on calcule à la volée :
--   ca_ttc      = sum(prix_ttc * quantite)
--   nb_tickets  = count(distinct numero_ticket)
--   panier_moy  = ca_ttc / nb_tickets
-- Le breakdown par dépôt sera ajouté quand 0011 aura une colonne depot_id
-- (TODO future migration : alter table ventes_cashmag_import add depot_id).
-- REFRESH manuel (cron edge function 06h).
drop materialized view if exists public.mv_ventes_quotidiennes;
create materialized view public.mv_ventes_quotidiennes as
select
  v.date_vente                                          as jour,
  sum(v.prix_ttc * coalesce(v.quantite, 1))::numeric(12,2) as ca_ttc,
  count(distinct v.numero_ticket)                       as nb_tickets,
  case when count(distinct v.numero_ticket) > 0
       then (sum(v.prix_ttc * coalesce(v.quantite, 1))
             / count(distinct v.numero_ticket))::numeric(10,2)
       else null end                                    as panier_moyen,
  count(*)                                              as nb_lignes_import
from public.ventes_cashmag_import v
group by v.date_vente;

create unique index if not exists idx_mv_ventes_quot_unique
  on public.mv_ventes_quotidiennes(jour);
create index if not exists idx_mv_ventes_quot_jour
  on public.mv_ventes_quotidiennes(jour desc);

-- Helper de refresh (appelable par cron edge function ou bouton admin)
create or replace function public.refresh_mv_ventes_quotidiennes()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently public.mv_ventes_quotidiennes;
exception when feature_not_supported then
  refresh materialized view public.mv_ventes_quotidiennes;
end$$;

-- ─── RLS ───────────────────────────────────────────────────────────
alter table public.cockpit_targets enable row level security;
alter table public.competitor_intel enable row level security;
alter table public.hijri_events enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array['cockpit_targets','competitor_intel','hijri_events'])
  loop
    execute format('drop policy if exists "anon_all" on public.%I', t);
    execute format('create policy "anon_all" on public.%I for all using (true) with check (true)', t);
  end loop;
end$$;

-- Vue matérialisée : lecture libre via grant (RLS ne s'applique pas aux MV)
grant select on public.mv_ventes_quotidiennes to anon, authenticated;

notify pgrst, 'reload schema';
