-- ─────────────────────────────────────────────────────────────────────
-- 0025 — Vue KPI productions (coûts, marge, rendement)
-- ─────────────────────────────────────────────────────────────────────
--
-- Vue agrégée qui calcule en temps réel par production terminée :
--   - cout_matieres (Σ inputs)
--   - cout_indirects (Σ couts_indirects)
--   - cout_total
--   - ca_potentiel_ttc / ca_potentiel_ht (outputs × prix vente)
--   - rendement_pct (output_qty / input_qty)
--   - marge_eur_ht / marge_pct_ht
--
-- Choix techniques :
--   - security_invoker = true → la view applique les RLS de l'appelant
--     (et non du créateur), donc un user non-admin ne verra que les
--     productions auxquelles ses policies sur productions* donnent accès.
--   - 3 CTEs pour pré-agréger inputs / couts indirects / outputs avant
--     le join sur productions → évite le produit cartésien et le N+1.
--   - NULLIF sur tous les dénominateurs → renvoie NULL plutôt que de
--     lever division_by_zero.
--   - Filtre statut='terminee' → on n'expose pas les productions en
--     cours (chiffres incomplets, fausse lecture).
--
-- ⚠ HYPOTHÈSES SUR LES COLONNES DES TABLES productions_*
--   (la migration 0024 n'est pas commitée dans le repo) :
--
--   productions:                id, lot_numero, date_production,
--                               recette, statut
--   productions_inputs:         production_id, quantite, prix_unitaire
--   productions_outputs:        production_id, product_id, quantite,
--                               prix_vente_unitaire_ttc
--   productions_couts_indirects: production_id, montant
--
--   Si les noms réels diffèrent, ajuster les CTEs ci-dessous AVANT
--   exécution. Cf. MIGRATIONS_REPORT.md.
-- ─────────────────────────────────────────────────────────────────────

create or replace view public.v_productions_kpi
with (security_invoker = true) as
with inputs as (
  select
    production_id,
    sum(quantite)                         as input_total_qty,
    sum(quantite * prix_unitaire)         as cout_matieres
  from public.productions_inputs
  group by production_id
),
couts as (
  select
    production_id,
    sum(montant)                          as cout_indirects
  from public.productions_couts_indirects
  group by production_id
),
outputs as (
  select
    po.production_id,
    sum(po.quantite)                                                                      as output_total_qty,
    sum(po.quantite * po.prix_vente_unitaire_ttc)                                         as ca_potentiel_ttc,
    sum(po.quantite * po.prix_vente_unitaire_ttc / (1 + coalesce(pr.tva_taux, 5.5)/100))  as ca_potentiel_ht
  from public.productions_outputs po
  left join public.products pr on pr.id = po.product_id
  group by po.production_id
)
select
  p.id,
  p.lot_numero,
  p.date_production,
  p.recette,

  coalesce(i.cout_matieres, 0)                                            as cout_matieres,
  coalesce(c.cout_indirects, 0)                                           as cout_indirects,
  coalesce(i.cout_matieres, 0) + coalesce(c.cout_indirects, 0)            as cout_total,

  o.ca_potentiel_ttc,
  o.ca_potentiel_ht,

  i.input_total_qty,
  o.output_total_qty,

  -- Rendement matière : qty sortie / qty entrée × 100
  case
    when nullif(i.input_total_qty, 0) is null then null
    else round((o.output_total_qty / i.input_total_qty) * 100, 2)
  end                                                                     as rendement_pct,

  -- Marge HT en €
  o.ca_potentiel_ht
    - (coalesce(i.cout_matieres, 0) + coalesce(c.cout_indirects, 0))      as marge_eur_ht,

  -- Marge HT en %
  case
    when nullif(o.ca_potentiel_ht, 0) is null then null
    else round(
      ((o.ca_potentiel_ht - (coalesce(i.cout_matieres, 0) + coalesce(c.cout_indirects, 0)))
       / o.ca_potentiel_ht) * 100,
      2
    )
  end                                                                     as marge_pct_ht

from public.productions p
left join inputs  i on i.production_id = p.id
left join couts   c on c.production_id = p.id
left join outputs o on o.production_id = p.id
where p.statut = 'terminee';

comment on view public.v_productions_kpi is
  'KPI temps réel par production terminée : coûts, CA potentiel HT/TTC, rendement, marge HT. Respecte les RLS (security_invoker).';
