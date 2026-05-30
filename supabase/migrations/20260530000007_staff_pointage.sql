-- ════════════════════════════════════════════════════════════════
-- 0038 — Pointage staff (kiosk tablette dépôt)
--
-- Otmane pilote 16 FTE sur 3 dépôts. Aujourd'hui : excel + mémoire.
-- Demain : iPad à l'entrée, scan badge → check-in/out, anomalies
-- automatiques (sans planning, retard, départ anticipé, oubli).
-- Mode Ramadan : décale horaires + flag.
--
-- Tables :
--   - shifts     : planning prévu (1 ligne par employé × jour)
--   - pointages  : événements scan (check_in/out, pause début/fin)
-- ════════════════════════════════════════════════════════════════

-- ─── Enrichissement employes ──────────────────────────────────────
alter table public.employes
  add column if not exists taux_horaire_brut    numeric(8,2) check (taux_horaire_brut >= 0),
  add column if not exists contrat_heures_hebdo numeric(5,2) not null default 35.00,
  add column if not exists observe_ramadan      boolean not null default false,
  add column if not exists badge_uid            text unique,
  add column if not exists actif                boolean not null default true;

create index if not exists idx_employes_badge_uid
  on public.employes(badge_uid) where badge_uid is not null;

-- ─── Plannings (shifts) ────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'role_jour') then
    create type role_jour as enum (
      'caisse','rayon','reception','boucherie','livraison','manager','polyvalent'
    );
  end if;
end$$;

create table if not exists public.shifts (
  id                uuid primary key default gen_random_uuid(),
  employe_id        uuid not null references public.employes(id) on delete cascade,
  depot_id          uuid not null references public.depots(id),
  jour              date not null,
  heure_debut       time not null,
  heure_fin         time not null,
  pause_minutes     integer not null default 0 check (pause_minutes >= 0),
  role_jour         role_jour not null default 'polyvalent',
  est_ramadan       boolean not null default false,
  cree_par          uuid references public.employes(id),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (employe_id, jour, heure_debut)
);

create index if not exists idx_shifts_depot_jour
  on public.shifts(depot_id, jour);
create index if not exists idx_shifts_employe_jour
  on public.shifts(employe_id, jour desc);

-- ─── Pointages (un seul "ouvert" par employé à la fois) ───────────
do $$
begin
  if not exists (select 1 from pg_type where typname = 'anomalie_pointage') then
    create type anomalie_pointage as enum (
      'aucune','sans_planning','retard','depart_anticipe','oubli','pause_trop_longue'
    );
  end if;
end$$;

create table if not exists public.pointages (
  id              uuid primary key default gen_random_uuid(),
  employe_id      uuid not null references public.employes(id) on delete cascade,
  depot_id        uuid not null references public.depots(id),
  shift_id        uuid references public.shifts(id),
  jour            date not null default current_date,
  check_in        timestamptz,
  check_out       timestamptz,
  pause_debut     timestamptz,
  pause_fin       timestamptz,
  device_id       text,                       -- iPad UUID
  anomalie        anomalie_pointage not null default 'aucune',
  duree_travaillee_min integer
                  generated always as (
                    case
                      when check_in is null or check_out is null then null
                      else greatest(
                        0,
                        extract(epoch from (check_out - check_in))::int / 60
                        - case
                            when pause_debut is not null and pause_fin is not null
                              then extract(epoch from (pause_fin - pause_debut))::int / 60
                            else 0
                          end
                      )
                    end
                  ) stored,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_pointages_employe_jour
  on public.pointages(employe_id, jour desc);
create index if not exists idx_pointages_depot_jour
  on public.pointages(depot_id, jour desc);

-- Index partiel : pointage "ouvert" (check_in ok, check_out null)
-- → utilisé par le kiosk pour savoir qui est en service
create unique index if not exists idx_pointages_ouvert_unique
  on public.pointages(employe_id)
  where check_out is null and check_in is not null;

-- ─── Helper : check-in (résout shift planifié, détecte anomalies) ─
create or replace function public.pointage_check_in(
  p_employe_id uuid,
  p_depot_id   uuid,
  p_device_id  text default null
)
returns uuid
language plpgsql
as $$
declare
  v_shift_id   uuid;
  v_planned    timestamp;
  v_now        timestamptz := now();
  v_pointage_id uuid;
  v_anomalie   anomalie_pointage := 'aucune';
begin
  -- Cherche le shift du jour pour cet employé
  select id,
         (jour + heure_debut)::timestamp
    into v_shift_id, v_planned
    from public.shifts
   where employe_id = p_employe_id
     and jour       = current_date
   order by heure_debut
   limit 1;

  if v_shift_id is null then
    v_anomalie := 'sans_planning';
  elsif v_now > (v_planned at time zone 'Europe/Paris') + interval '10 minutes' then
    v_anomalie := 'retard';
  end if;

  insert into public.pointages (employe_id, depot_id, shift_id, jour, check_in, device_id, anomalie)
  values (p_employe_id, p_depot_id, v_shift_id, current_date, v_now, p_device_id, v_anomalie)
  returning id into v_pointage_id;

  return v_pointage_id;
end$$;

-- ─── Helper : check-out (détecte départ anticipé / oubli) ─────────
create or replace function public.pointage_check_out(p_employe_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_id        uuid;
  v_shift_fin time;
  v_now       timestamptz := now();
  v_anomalie  anomalie_pointage;
begin
  select p.id, s.heure_fin, p.anomalie
    into v_id, v_shift_fin, v_anomalie
    from public.pointages p
    left join public.shifts s on s.id = p.shift_id
   where p.employe_id = p_employe_id
     and p.check_out is null
     and p.check_in is not null
   order by p.check_in desc
   limit 1;

  if v_id is null then
    raise exception 'Aucun pointage ouvert pour employé %', p_employe_id;
  end if;

  if v_shift_fin is not null
     and v_now < (current_date + v_shift_fin) at time zone 'Europe/Paris' - interval '15 minutes'
     and v_anomalie = 'aucune' then
    v_anomalie := 'depart_anticipe';
  end if;

  update public.pointages
     set check_out  = v_now,
         anomalie   = v_anomalie,
         updated_at = v_now
   where id = v_id;

  return v_id;
end$$;

-- ─── Vue : qui est présent maintenant (kiosk + cockpit) ───────────
create or replace view public.v_staff_presents as
select
  p.id              as pointage_id,
  p.employe_id,
  e.nom             as employe_nom,
  e.prenom          as employe_prenom,
  p.depot_id,
  d.nom             as depot_nom,
  p.check_in,
  p.pause_debut,
  p.pause_fin,
  case
    when p.pause_debut is not null and p.pause_fin is null then 'en_pause'
    else 'en_service'
  end               as etat,
  s.heure_fin       as fin_prevue,
  p.anomalie
from public.pointages p
join public.employes e on e.id = p.employe_id
join public.depots   d on d.id = p.depot_id
left join public.shifts s on s.id = p.shift_id
where p.check_out is null
  and p.check_in  is not null;

-- ─── RLS ───────────────────────────────────────────────────────────
alter table public.shifts    enable row level security;
alter table public.pointages enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array['shifts','pointages'])
  loop
    execute format('drop policy if exists "anon_all" on public.%I', t);
    execute format('create policy "anon_all" on public.%I for all using (true) with check (true)', t);
  end loop;
end$$;

grant select on public.v_staff_presents to anon, authenticated;

notify pgrst, 'reload schema';
