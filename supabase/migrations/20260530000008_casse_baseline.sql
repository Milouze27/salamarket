-- ════════════════════════════════════════════════════════════════
-- 0039 — Casse : baseline 28j + pic horaire (digest email hebdo)
--
-- Otmane reçoit chaque lundi 06h un email :
--   "Cette semaine, ton dépôt Particulier a cassé pour 412€,
--    soit +2.1σ vs baseline 28j. Pic : jeudi 17h, rayon viande
--    fraîche, 3 employés impliqués (hash anonymisé)."
--
-- Vues matérialisées (refresh nocturne via edge fn) :
--   - v_casse_baseline_28j  : mu/sigma/p95 par (produit, dépôt)
--   - v_casse_pic_horaire   : heat-map heure×jour, user_hash GDPR
-- ════════════════════════════════════════════════════════════════

-- ─── 1) Baseline 28 jours glissants ────────────────────────────────
-- On agrège la valeur de casse en € en joignant aux produits pour
-- récupérer un prix de référence. NB : produits.prix_vente_ttc existe
-- depuis 0001 ; si absent dans certains environnements, le COALESCE
-- évite le crash.
drop materialized view if exists public.v_casse_baseline_28j;
create materialized view public.v_casse_baseline_28j as
with valos as (
  select
    s.produit_id,
    s.depot_id,
    s.created_at::date as jour,
    sum(s.quantite * coalesce(p.prix_drive_cents / 100.0, 0))::numeric(12,2) as valeur_eur,
    sum(s.quantite)::numeric(12,3) as qte
  from public.sorties_stock s
  join public.produits p on p.id = s.produit_id
  where s.type in ('casse_manipulation','casse_client','perime_dlc','perime_ddm','defaut_fournisseur')
    and s.created_at >= now() - interval '28 days'
  group by s.produit_id, s.depot_id, s.created_at::date
)
select
  produit_id,
  depot_id,
  count(*)                                              as nb_jours_avec_casse,
  avg(valeur_eur)::numeric(10,2)                        as mu_eur,
  coalesce(stddev_samp(valeur_eur), 0)::numeric(10,2)   as sigma_eur,
  percentile_cont(0.95) within group (order by valeur_eur)::numeric(10,2) as p95_eur,
  sum(valeur_eur)::numeric(12,2)                        as total_eur_28j,
  sum(qte)::numeric(12,3)                               as total_qte_28j,
  now()                                                 as computed_at
from valos
group by produit_id, depot_id;

create unique index if not exists idx_mv_casse_baseline_unique
  on public.v_casse_baseline_28j(produit_id, depot_id);
create index if not exists idx_mv_casse_baseline_total
  on public.v_casse_baseline_28j(depot_id, total_eur_28j desc);

-- ─── 2) Pic horaire (heat-map heure × jour-semaine, 90j) ───────────
-- user_hash = SHA256(employe_id::text) → GDPR safe pour digest
drop materialized view if exists public.v_casse_pic_horaire;
create materialized view public.v_casse_pic_horaire as
select
  s.depot_id,
  extract(isodow from s.created_at)::int          as jour_semaine,   -- 1=lun..7=dim
  extract(hour   from s.created_at)::int          as heure,
  md5(coalesce(s.employe_id::text, '')) as user_hash,
  count(*)                                        as nb_evenements,
  sum(s.quantite * coalesce(p.prix_drive_cents / 100.0, 0))::numeric(12,2) as valeur_perdue_eur
from public.sorties_stock s
join public.produits p on p.id = s.produit_id
where s.type in ('casse_manipulation','casse_client','perime_dlc','perime_ddm','defaut_fournisseur')
  and s.created_at >= now() - interval '90 days'
group by s.depot_id, jour_semaine, heure, user_hash;

create index if not exists idx_mv_casse_pic_depot
  on public.v_casse_pic_horaire(depot_id, valeur_perdue_eur desc);
create index if not exists idx_mv_casse_pic_heure
  on public.v_casse_pic_horaire(depot_id, jour_semaine, heure);

-- pgcrypto pour digest() (déjà activé par 0001 normalement)
create extension if not exists pgcrypto;

-- ─── Helper de refresh (cron edge function lundi 05h45) ────────────
create or replace function public.refresh_casse_views()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    refresh materialized view concurrently public.v_casse_baseline_28j;
  exception when feature_not_supported then
    refresh materialized view public.v_casse_baseline_28j;
  end;
  begin
    refresh materialized view concurrently public.v_casse_pic_horaire;
  exception when feature_not_supported then
    refresh materialized view public.v_casse_pic_horaire;
  end;
end$$;

-- ─── Vue digest hebdo : top contributeurs casse semaine ───────────
-- (lue par l'edge function `casse-weekly-digest` qui formatte l'email)
create or replace view public.v_casse_digest_semaine as
with semaine as (
  select
    s.depot_id,
    s.produit_id,
    p.nom as produit_nom,
    sum(s.quantite * coalesce(p.prix_drive_cents / 100.0, 0))::numeric(12,2) as valeur_eur,
    sum(s.quantite)::numeric(12,3) as qte
  from public.sorties_stock s
  join public.produits p on p.id = s.produit_id
  where s.type in ('casse_manipulation','casse_client','perime_dlc','perime_ddm','defaut_fournisseur')
    and s.created_at >= date_trunc('week', now())
  group by s.depot_id, s.produit_id, p.nom
)
select
  sem.depot_id,
  d.nom as depot_nom,
  sem.produit_id,
  sem.produit_nom,
  sem.qte,
  sem.valeur_eur,
  b.mu_eur          as baseline_mu_eur,
  b.sigma_eur       as baseline_sigma_eur,
  case
    when b.sigma_eur is null or b.sigma_eur = 0 then null
    else round((sem.valeur_eur - b.mu_eur) / nullif(b.sigma_eur, 0), 2)
  end as ecart_sigma
from semaine sem
join public.depots d on d.id = sem.depot_id
left join public.v_casse_baseline_28j b
  on b.produit_id = sem.produit_id and b.depot_id = sem.depot_id
order by sem.depot_id, sem.valeur_eur desc;

-- ─── Grants (RLS ne s'applique pas aux materialized views) ────────
grant select on public.v_casse_baseline_28j to anon, authenticated;
grant select on public.v_casse_pic_horaire  to anon, authenticated;
grant select on public.v_casse_digest_semaine to anon, authenticated;

notify pgrst, 'reload schema';
