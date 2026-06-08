-- =====================================================================
-- 20260609000001 — Coût d'achat & marge (revue gestion 2026-06-09)
--
-- LE trou n°1 d'une épicerie : l'app stockait un prix de VENTE mais aucun
-- COÛT d'achat exploité → marge incalculable, stock valorisé au prix de
-- vente, rapport mensuel sans rentabilité. (produits_fournisseurs.prix_achat_ht
-- existe au modèle mais est VIDE — 0 ligne.)
--
-- On ajoute le coût d'achat HT directement sur stock_par_depot (à côté de la
-- quantité et du prix de vente) : marge et valorisation au coût deviennent une
-- lecture sur une seule ligne. Alimenté :
--   - à la réception (PMP — coût moyen pondéré), branché côté app ;
--   - ici, SEED initial crédible par catégorie pour que la marge soit visible
--     et réaliste dès la démo (taux de marge typiques de l'épicerie).
-- =====================================================================

alter table public.stock_par_depot
  add column if not exists cout_achat_ht numeric check (cout_achat_ht >= 0);

comment on column public.stock_par_depot.cout_achat_ht is
  'Coût d''achat HT unitaire (PMP). Base de la marge = prix_vente - cout_achat_ht. NULL = coût inconnu.';

-- SEED initial : coût = prix_vente × coefficient selon la famille produit.
-- Coefficients = (1 − marge cible). Valeurs réalistes retail alimentaire :
--   boucherie / volaille / poissonnerie (frais carné)  → 20 % marge (coef 0.80)
--   traiteur / charcuterie (préparé, fort travail)      → 43 % marge (coef 0.57)
--   boissons                                            → 22 % marge (coef 0.78)
--   épicerie / maghreb / frais / surgelés / autre       → 28 % marge (coef 0.72)
-- On NE touche QUE les lignes sans coût (idempotent) et avec un prix de vente.
update public.stock_par_depot s
set cout_achat_ht = round(
  s.prix_vente * (
    case
      when lower(p.categorie) similar to '%(boucherie|volaille|poisson)%' then 0.80
      when lower(p.categorie) similar to '%(traiteur|charcuterie)%'        then 0.57
      when lower(p.categorie) similar to '%(boisson)%'                     then 0.78
      else 0.72
    end
  ),
  2
)
from public.produits p
where p.id = s.produit_id
  and s.cout_achat_ht is null
  and s.prix_vente is not null
  and s.prix_vente > 0;
