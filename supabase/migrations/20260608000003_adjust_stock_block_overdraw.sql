-- =====================================================================
-- 20260608000003 — adjust_stock bloque le sur-décrément (audit 2026-06-08)
--
-- Avant : adjust_stock clampait à greatest(0, ...). Sortir 10 d'un stock de
-- 5 ramenait SILENCIEUSEMENT le stock à 0 tout en écrivant un ledger
-- incohérent (delta = -10, quantite_avant = 5, quantite_apres = 0 :
-- 5 + (-10) ≠ 0). On ne savait donc pas qu'on avait « sorti » plus que le
-- disponible → inventaire faux, audit cassé.
--
-- Désormais : une opération DÉPLÉTIVE (sortie / casse / transfert) qui
-- passerait le stock sous 0 LÈVE une exception (opération rejetée, pas de
-- stock fantôme) — cohérent avec transfer_stock qui bloque déjà. Les types
-- inventaire / correction / reception conservent le plancher à 0 (ce sont
-- des ajustements à valeur voulue, pas des sorties).
--
-- Idempotent (create or replace). Signature inchangée.
-- =====================================================================

create or replace function public.adjust_stock(
  p_produit_id   uuid,
  p_depot_id     uuid,
  p_delta        numeric,
  p_type         text,
  p_lot_id       text    default null,
  p_reference_id text    default null,
  p_actor_id     uuid    default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_avant   numeric;
  v_apres   numeric;
begin
  if p_produit_id is null or p_depot_id is null then
    raise exception 'adjust_stock: produit_id et depot_id requis';
  end if;
  if p_delta is null then
    raise exception 'adjust_stock: delta requis';
  end if;
  if p_type is null or p_type not in
       ('reception','sortie','transfert','casse','inventaire','correction') then
    raise exception 'adjust_stock: type invalide (%)', p_type;
  end if;

  -- Verrou ligne : sérialise les concurrents sur ce (produit, dépôt).
  select id, quantite
    into v_id, v_avant
  from public.stock_par_depot
  where produit_id = p_produit_id
    and depot_id   = p_depot_id
  for update;

  if v_id is null then
    v_avant := 0;
  end if;

  -- Garde sur-décrément : refuse de descendre sous 0 pour les opérations
  -- déplétives (sortie/casse/transfert). Pas de stock fantôme silencieux.
  if (v_avant + p_delta) < 0 and p_type in ('sortie', 'casse', 'transfert') then
    raise exception
      'adjust_stock: stock insuffisant (disponible %, mouvement %) pour produit % dépôt %',
      v_avant, p_delta, p_produit_id, p_depot_id
      using errcode = 'check_violation';
  end if;

  v_apres := greatest(0, v_avant + p_delta);

  if v_id is null then
    insert into public.stock_par_depot (produit_id, depot_id, quantite, is_visible)
    values (p_produit_id, p_depot_id, v_apres, true)
    on conflict (produit_id, depot_id) do update
      set quantite   = greatest(0, public.stock_par_depot.quantite + p_delta),
          updated_at = now()
    returning quantite into v_apres;
  else
    update public.stock_par_depot
       set quantite   = v_apres,
           updated_at = now()
     where id = v_id;
  end if;

  -- Ledger immuable (même transaction → atomique avec l'UPDATE).
  insert into public.stock_movements (
    produit_id, depot_id, delta, quantite_avant, quantite_apres,
    type, lot_id, reference_id, actor_id
  ) values (
    p_produit_id, p_depot_id, p_delta, v_avant, v_apres,
    p_type, p_lot_id, p_reference_id, p_actor_id
  );

  return v_apres;
end$$;
