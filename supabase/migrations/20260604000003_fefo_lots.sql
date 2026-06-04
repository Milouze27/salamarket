-- ════════════════════════════════════════════════════════════════
-- 20260604000003 — FEFO lots (First Expired First Out)
--                  (MYTHOS Wave 4 · ML-4 · traçabilité à la sortie)
--
-- OBJECTIF : à chaque sortie / vente, on décrémente le lot le plus
-- PROCHE de la DLC (FEFO), pas un lot au hasard. C'est ce qui rend la
-- casse "périmé DLC" honnête et la traçabilité halal vérifiable : on
-- sait exactement quel lot a quitté le stock, et un lot épuisé se
-- marque tout seul (quantite_restante = 0).
--
-- Ajouts :
--   1. produits_lots.quantite_restante  (init = quantite_recue)
--   2. produits_lots.depot_id           (un lot vit dans un dépôt)
--   3. sorties_stock.lot_id             (lie la sortie au lot consommé)
--   4. fn consume_lot_fefo(...)         → sélectionne + décrémente le(s)
--                                         lot(s) FEFO, renvoie le lot
--                                         principal consommé.
--
-- Idempotent : safe à re-run. NB : ne touche PAS les migrations déjà
-- appliquées (correctif additif).
-- ════════════════════════════════════════════════════════════════

-- ─── 1) quantite_restante sur les lots ───────────────────────────
alter table public.produits_lots
  add column if not exists quantite_restante numeric;

-- Backfill : un lot sans restante connue = on suppose intact (= reçu).
update public.produits_lots
   set quantite_restante = coalesce(quantite_recue, 0)
 where quantite_restante is null;

alter table public.produits_lots
  alter column quantite_restante set default 0;

-- ─── 2) depot_id sur les lots (où le lot est physiquement stocké) ─
-- Optionnel : si null, le lot est considéré disponible quel que soit
-- le dépôt (FEFO global produit). Permet une montée en charge douce.
alter table public.produits_lots
  add column if not exists depot_id uuid references public.depots(id);

create index if not exists idx_produits_lots_fefo
  on public.produits_lots(produit_id, dlc nulls last)
  where quantite_restante > 0;

-- ─── 3) lot_id sur les sorties (traçabilité) ─────────────────────
alter table public.sorties_stock
  add column if not exists lot_id text references public.produits_lots(id) on delete set null;

create index if not exists idx_sorties_lot
  on public.sorties_stock(lot_id) where lot_id is not null;

-- ─── 4) RPC consume_lot_fefo ─────────────────────────────────────
-- Décrémente quantite_restante des lots du produit en ordre FEFO
-- (DLC la plus proche d'abord, puis date de réception, puis id).
-- Filtre sur le dépôt si le lot porte un depot_id (sinon FEFO global).
-- Décrémente sur plusieurs lots si nécessaire (un lot ne couvre pas
-- toute la quantité). Marque automatiquement épuisé (restante = 0).
--
-- Retourne l'id du PREMIER lot consommé (le plus proche DLC) — c'est
-- celui qu'on attache à sorties_stock.lot_id pour la traçabilité.
-- Renvoie NULL si aucun lot suivi n'existe (produit sans lots : la
-- sortie reste valide, simplement non rattachée à un lot).
create or replace function public.consume_lot_fefo(
  p_produit_id uuid,
  p_quantite   numeric,
  p_depot_id   uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reste      numeric := p_quantite;
  v_first_lot  text := null;
  v_prendre    numeric;
  r            record;
begin
  if p_quantite is null or p_quantite <= 0 then
    return null;
  end if;

  -- Parcourt les lots disponibles en ordre FEFO, avec verrou ligne
  -- pour sérialiser deux sorties concurrentes sur le même lot.
  for r in
    select id, quantite_restante
    from public.produits_lots
    where produit_id = p_produit_id
      and coalesce(quantite_restante, 0) > 0
      and (p_depot_id is null or depot_id is null or depot_id = p_depot_id)
    order by dlc asc nulls last, date_reception asc nulls last, id asc
    for update
  loop
    exit when v_reste <= 0;

    v_prendre := least(v_reste, r.quantite_restante);

    update public.produits_lots
       set quantite_restante = greatest(0, quantite_restante - v_prendre)
     where id = r.id;

    if v_first_lot is null then
      v_first_lot := r.id;     -- lot principal = le plus proche DLC
    end if;

    v_reste := v_reste - v_prendre;
  end loop;

  -- v_reste > 0 ici = on a consommé plus que les lots suivis ne
  -- couvrent. Ce n'est PAS bloquant (les lots ne couvrent pas
  -- toujours 100 % du stock physique en phase de démarrage) : la
  -- sortie reste valide, simplement le surplus n'est pas tracé.
  return v_first_lot;
end$$;

comment on function public.consume_lot_fefo is
  'Décrémente les lots du produit en ordre FEFO (DLC la plus proche d''abord). Marque les lots épuisés. Retourne l''id du lot principal consommé (pour sorties_stock.lot_id).';

-- ─── 5) Vue stock par lot (lots vivants, pour cockpit / DLC) ──────
create or replace view public.v_lots_actifs as
select
  l.id                                   as lot_id,
  l.produit_id,
  p.nom                                  as produit_nom,
  l.depot_id,
  l.dlc,
  case
    when l.dlc is null                   then null
    else (l.dlc - current_date)
  end                                    as jours_restants,
  l.quantite_recue,
  coalesce(l.quantite_restante, 0)       as quantite_restante,
  l.unite,
  l.certifier_name,
  (coalesce(l.quantite_restante, 0) = 0) as epuise
from public.produits_lots l
join public.produits p on p.id = l.produit_id
order by l.dlc asc nulls last;

grant select on public.v_lots_actifs to anon, authenticated, service_role;
grant execute on function public.consume_lot_fefo(uuid, numeric, uuid)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
