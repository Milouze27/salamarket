-- ════════════════════════════════════════════════════════════════════════════
-- 20260604000001 — Vérité métier : barème DLC à la SOURCE + casse au VRAI prix
--
-- Migration CORRECTIVE (ne touche pas 20260530000001_dlc_engine ni
-- 20260530000008_casse_baseline, déjà appliquées). Objectif : que les
-- chiffres affichés à Otmane / Ahmed soient justes À LA SOURCE SQL, sans
-- dépendre du plancher défensif TS (lib/dlc.ts).
--
-- ── ML-1 : barème DLC ───────────────────────────────────────────────────────
-- Bug source : v_dlc_alerts calculait remise_suggeree_pct via une jointure
-- EXACTE (case-sensitive) sur produits.categorie × dlc_pricing_rules.categorie.
-- Or le catalogue contient des catégories NON seedées ou de casse différente :
-- 'boucherie' (minuscule), 'volaille', 'Poissonnerie', 'Épicerie',
-- 'Produits du Maghreb', 'Boissons', 'Hygiène', 'Maison'…
-- → le sous-select renvoyait NULL → COALESCE 0 → "FORCÉ -0%" en magasin.
-- Vérifié live : lot L2026-05-DLC1 (cat 'boucherie') niveau=forcé remise=0%.
--
-- Fix : le PLANCHER par niveau d'alerte devient garanti EN SQL (CASE), et la
-- jointure catégorie ne sert qu'à OVERRIDER vers une remise plus agressive si
-- une règle dédiée existe. On normalise aussi la casse de la catégorie
-- (lower/unaccent) pour matcher 'boucherie' ↔ 'Boucherie'. Plus jamais 0% sur
-- un niveau qui exige une démarque.
--
-- Mapping métier (cf. CONTEXT.md dlc_alert_level / lib/dlc.ts) :
--   forcé→50  critique→40  attention→20  surveillance→0  ok→0
--
-- ── ML-2 : valorisation casse ───────────────────────────────────────────────
-- Bug source : les 3 objets casse (v_casse_baseline_28j, v_casse_pic_horaire,
-- v_casse_digest_semaine) valorisaient avec coalesce(prix_drive_cents/100, 0).
-- Or les produits AU POIDS (boucherie/volaille : Merguez, Kefta, Brochettes…)
-- ont prix_drive_cents = NULL et leur prix de VENTE magasin est dans
-- price_per_kg (€/kg), avec quantite exprimée en kg. Résultat : la casse de ces
-- produits — justement les plus chers — était comptée à 0€.
-- Vérifié live : casse "Brochettes Poulet" qty 1.14kg → 0€ au lieu de 18.24€.
--
-- Fix : prix de vente unitaire = coalesce(prix_drive_cents/100, price_per_kg).
-- Pour un produit au poids, quantite (kg) × price_per_kg (€/kg) = perte réelle.
-- Pour un produit à l'unité, quantite × prix_drive_cents/100. 0 reste l'ultime
-- filet uniquement si AUCUN prix n'est renseigné (produit non synchronisé).
--
-- Idempotent : create or replace / drop ... if exists. Apply :
--   supabase db push --include-all --yes
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists unaccent;

-- ─────────────────────────────────────────────────────────────────────────────
-- ML-1 · Helper immuable : plancher de remise par niveau d'alerte
-- ─────────────────────────────────────────────────────────────────────────────
-- Source de vérité unique du barème, réutilisable et testable isolément.
-- IMMUTABLE → utilisable dans des vues / index sans pénalité.
create or replace function public.dlc_remise_plancher(niveau text)
returns integer
language sql
immutable
as $$
  select case lower(coalesce(niveau, 'ok'))
    when 'forcé'        then 50
    when 'force'        then 50   -- tolérance accent absent
    when 'critique'     then 40
    when 'attention'    then 20
    when 'surveillance' then 0
    when 'ok'           then 0
    else 0
  end;
$$;

comment on function public.dlc_remise_plancher(text) is
  'Plancher métier de remise DLC par niveau d''alerte (forcé 50 / critique 40 / attention 20 / sinon 0). Source SQL — le plancher TS lib/dlc.ts est désormais redondant (filet de sécurité, non contradictoire).';

-- ─────────────────────────────────────────────────────────────────────────────
-- ML-1 · Seed catégorie-complet de dlc_pricing_rules
-- ─────────────────────────────────────────────────────────────────────────────
-- On seede TOUTES les catégories périssables du catalogue (y compris variantes
-- de casse) afin qu'une règle dédiée existe. Le plancher SQL couvre déjà tout,
-- mais ce seed donne des paliers fins (J-3 / J-2 / J-1) là où ça a du sens.
-- Catégories non périssables (Épicerie, Boissons, Hygiène, Maison) n'ont pas
-- besoin de palier : le plancher par niveau suffit si jamais un lot y traîne.
insert into public.dlc_pricing_rules (categorie, jours_avant_dlc, remise_pct) values
  -- variantes de casse / synonymes boucherie
  ('boucherie', 7, 0), ('boucherie', 3, 15), ('boucherie', 2, 30), ('boucherie', 1, 50),
  ('Volaille', 7, 0), ('Volaille', 3, 15), ('Volaille', 2, 30), ('Volaille', 1, 50),
  ('volaille', 7, 0), ('volaille', 3, 15), ('volaille', 2, 30), ('volaille', 1, 50),
  ('Poissonnerie', 3, 0), ('Poissonnerie', 2, 30), ('Poissonnerie', 1, 50),
  ('Produits du Maghreb', 5, 0), ('Produits du Maghreb', 2, 20), ('Produits du Maghreb', 1, 40)
on conflict (categorie, jours_avant_dlc) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- ML-1 · Vue v_dlc_alerts corrigée — plancher GARANTI en SQL
-- ─────────────────────────────────────────────────────────────────────────────
-- remise_suggeree_pct = GREATEST(plancher du niveau, règle catégorie si plus
-- agressive). La règle catégorie matche désormais en lower(unaccent(...)) pour
-- absorber 'boucherie'/'Boucherie'. Le plancher s'applique MÊME sans règle.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'produits_lots'
  ) then
    execute $view$
      create or replace view public.v_dlc_alerts as
      with base as (
        select
          l.id              as lot_id,
          l.produit_id      as produit_id,
          p.nom             as produit_nom,
          p.categorie       as produit_categorie,
          l.dlc             as dlc,
          (l.dlc - current_date) as jours_restants,
          case
            when l.dlc <= current_date       then 'forcé'
            when (l.dlc - current_date) <= 1 then 'critique'
            when (l.dlc - current_date) <= 3 then 'attention'
            when (l.dlc - current_date) <= 7 then 'surveillance'
            else 'ok'
          end               as niveau_alerte,
          l.quantite_recue  as quantite_recue,
          l.unite           as unite
        from public.produits_lots l
        join public.produits p on p.id = l.produit_id
        where l.dlc is not null
      )
      select
        b.lot_id,
        b.produit_id,
        b.produit_nom,
        b.produit_categorie,
        b.dlc,
        b.jours_restants,
        b.niveau_alerte,
        greatest(
          public.dlc_remise_plancher(b.niveau_alerte),
          coalesce(
            (
              select r.remise_pct
              from public.dlc_pricing_rules r
              where unaccent(lower(r.categorie)) = unaccent(lower(b.produit_categorie))
                and r.jours_avant_dlc >= b.jours_restants
                and r.active = true
              order by r.jours_avant_dlc asc
              limit 1
            ),
            0
          )
        )::integer as remise_suggeree_pct,
        b.quantite_recue,
        b.unite
      from base b;
    $view$;
  else
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

grant select on public.v_dlc_alerts to anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- ML-2 · Casse valorisée au VRAI prix de vente magasin
-- ═════════════════════════════════════════════════════════════════════════════
-- Prix de vente unitaire applicable à `quantite` :
--   - produit à l'unité   : prix_drive_cents/100 (€/pièce)
--   - produit au poids     : price_per_kg (€/kg), quantite étant en kg
-- coalesce(prix_drive_cents/100, price_per_kg) → on prend le prix Drive s'il
-- existe, sinon le prix/kg magasin. 0 seulement si aucun prix (non synchronisé).
-- Fonction helper IMMUTABLE pour rester DRY entre les 3 objets casse.
create or replace function public.prix_vente_unitaire_eur(
  prix_drive_cents integer,
  price_per_kg numeric
)
returns numeric
language sql
immutable
as $$
  select coalesce(prix_drive_cents / 100.0, price_per_kg, 0)::numeric;
$$;

comment on function public.prix_vente_unitaire_eur(integer, numeric) is
  'Prix de vente unitaire en € : prix Drive (€/pièce) si présent, sinon price_per_kg (€/kg pour produits au poids). Utilisé pour valoriser la casse à la perte RÉELLE au prix de vente magasin, jamais 0 par défaut quand un prix existe.';

-- v_casse_digest_semaine dépend de v_casse_baseline_28j → drop d'abord la vue
-- dépendante avant de recréer la MV (recréée plus bas).
drop view if exists public.v_casse_digest_semaine;

-- ─── 1) Baseline 28 jours ────────────────────────────────────────────────────
drop materialized view if exists public.v_casse_baseline_28j;
create materialized view public.v_casse_baseline_28j as
with valos as (
  select
    s.produit_id,
    s.depot_id,
    s.created_at::date as jour,
    sum(s.quantite * public.prix_vente_unitaire_eur(p.prix_drive_cents, p.price_per_kg))::numeric(12,2) as valeur_eur,
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

-- ─── 2) Pic horaire (90j) ────────────────────────────────────────────────────
drop materialized view if exists public.v_casse_pic_horaire;
create materialized view public.v_casse_pic_horaire as
select
  s.depot_id,
  extract(isodow from s.created_at)::int          as jour_semaine,
  extract(hour   from s.created_at)::int          as heure,
  md5(coalesce(s.employe_id::text, '')) as user_hash,
  count(*)                                        as nb_evenements,
  sum(s.quantite * public.prix_vente_unitaire_eur(p.prix_drive_cents, p.price_per_kg))::numeric(12,2) as valeur_perdue_eur
from public.sorties_stock s
join public.produits p on p.id = s.produit_id
where s.type in ('casse_manipulation','casse_client','perime_dlc','perime_ddm','defaut_fournisseur')
  and s.created_at >= now() - interval '90 days'
group by s.depot_id, jour_semaine, heure, user_hash;

create index if not exists idx_mv_casse_pic_depot
  on public.v_casse_pic_horaire(depot_id, valeur_perdue_eur desc);
create index if not exists idx_mv_casse_pic_heure
  on public.v_casse_pic_horaire(depot_id, jour_semaine, heure);

-- ─── Refresh helper (inchangé fonctionnellement, recréé pour cohérence) ──────
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

-- ─── 3) Vue digest hebdo ─────────────────────────────────────────────────────
create or replace view public.v_casse_digest_semaine as
with semaine as (
  select
    s.depot_id,
    s.produit_id,
    p.nom as produit_nom,
    sum(s.quantite * public.prix_vente_unitaire_eur(p.prix_drive_cents, p.price_per_kg))::numeric(12,2) as valeur_eur,
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

-- ─── Grants + refresh initial + reload PostgREST ─────────────────────────────
grant select on public.v_casse_baseline_28j  to anon, authenticated;
grant select on public.v_casse_pic_horaire   to anon, authenticated;
grant select on public.v_casse_digest_semaine to anon, authenticated;
grant execute on function public.dlc_remise_plancher(text) to anon, authenticated;
grant execute on function public.prix_vente_unitaire_eur(integer, numeric) to anon, authenticated;

-- Refresh initial NON concurrent : les MV viennent d'être (re)créées dans cette
-- même transaction, donc pas encore peuplées et sans état préalable → un refresh
-- CONCURRENTLY échouerait (SQLSTATE 55000). On peuple en plein. Les refresh
-- nocturnes ultérieurs passent par refresh_casse_views() (concurrent, l'index
-- unique sur baseline le permet).
refresh materialized view public.v_casse_baseline_28j;
refresh materialized view public.v_casse_pic_horaire;

notify pgrst, 'reload schema';
