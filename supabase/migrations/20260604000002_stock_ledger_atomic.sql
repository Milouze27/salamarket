-- ════════════════════════════════════════════════════════════════
-- 20260604000002 — Stock ledger immuable + RPC adjust_stock atomique
--                  (MYTHOS Wave 4 · ML-3 · anti race-condition)
--
-- PROBLÈME corrigé À LA SOURCE :
--   adjustStock() côté TS (lib/db/index.ts) faisait un read-then-write
--   non atomique : deux sorties / transferts / casses concurrents
--   lisent la MÊME quantité puis écrasent l'un l'autre → stock faux.
--   Sur un produit à forte rotation (poulet en Ramadan), c'est la
--   garantie d'un inventaire qui ment. Otmane/Ahmed ne peuvent pas
--   signer un chiffre faux.
--
-- SOLUTION (transactionnelle, source = SQL) :
--   1. table stock_movements        → LEDGER immuable (audit complet)
--   2. fn adjust_stock(...)          → UPDATE atomique + INSERT ledger
--                                      dans la MÊME transaction, avec
--                                      verrou ligne (SELECT ... FOR UPDATE)
--                                      pour sérialiser les concurrents.
--   3. fn transfer_stock(...)        → transfert BLOQUANT : refuse si
--                                      stock source insuffisant (pas de
--                                      quantité négative silencieuse).
--
-- Idempotent : safe à re-run.
-- ════════════════════════════════════════════════════════════════

-- ─── 1) Ledger immuable des mouvements de stock ──────────────────
create table if not exists public.stock_movements (
  id            uuid primary key default gen_random_uuid(),
  produit_id    uuid not null references public.produits(id) on delete restrict,
  depot_id      uuid not null references public.depots(id)   on delete restrict,
  delta         numeric not null,                 -- + = entrée, - = sortie
  quantite_avant numeric,                          -- stock avant le mouvement (audit)
  quantite_apres numeric,                          -- stock après le mouvement (audit)
  type          text not null
                check (type in (
                  'reception','sortie','transfert','casse',
                  'inventaire','correction'
                )),
  lot_id        text references public.produits_lots(id) on delete set null,
  reference_id  text,                              -- id du doc source (sortie, bdl, transfert…)
  actor_id      uuid,                              -- employe_id à l'origine (audit, pas de FK stricte)
  created_at    timestamptz not null default now()
);

create index if not exists idx_stock_movements_produit_depot
  on public.stock_movements(produit_id, depot_id, created_at desc);
create index if not exists idx_stock_movements_type
  on public.stock_movements(type, created_at desc);
create index if not exists idx_stock_movements_lot
  on public.stock_movements(lot_id) where lot_id is not null;
create index if not exists idx_stock_movements_reference
  on public.stock_movements(reference_id) where reference_id is not null;

comment on table public.stock_movements is
  'Ledger immuable de tous les mouvements de stock. Source de vérité d''audit. Ne jamais UPDATE/DELETE (append-only).';

-- ─── RLS : lecture ouverte (audit), écriture via RPC SECURITY DEFINER ─
alter table public.stock_movements enable row level security;

drop policy if exists "read_all" on public.stock_movements;
create policy "read_all" on public.stock_movements
  for select using (true);

-- Pas de policy INSERT/UPDATE/DELETE directe : seules les RPC
-- SECURITY DEFINER ci-dessous écrivent. (Le ledger reste append-only ;
-- un client anon ne peut pas falsifier l'historique.)

-- ─── 2) RPC atomique adjust_stock ────────────────────────────────
-- Un seul appel = un verrou ligne + un UPDATE + un INSERT ledger,
-- le tout dans la transaction implicite de la fonction. Deux appels
-- concurrents sur le même (produit, dépôt) se sérialisent grâce au
-- FOR UPDATE → plus d'écrasement.
--
-- Retourne la quantité APRÈS mouvement (le caller peut l'afficher).
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
    -- Pas encore de ligne stock. On en crée une (clamp >= 0 :
    -- un delta négatif sans stock préexistant donne 0).
    v_avant := 0;
    v_apres := greatest(0, v_avant + p_delta);
    insert into public.stock_par_depot (produit_id, depot_id, quantite, is_visible)
    values (p_produit_id, p_depot_id, v_apres, true)
    on conflict (produit_id, depot_id) do update
      set quantite   = greatest(0, public.stock_par_depot.quantite + p_delta),
          updated_at = now()
    returning quantite into v_apres;
  else
    v_apres := greatest(0, v_avant + p_delta);
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

comment on function public.adjust_stock is
  'Ajuste atomiquement stock_par_depot (verrou ligne) et écrit le ledger stock_movements. Anti race-condition. Retourne la quantité après mouvement.';

-- ─── 3) RPC transfert atomique BLOQUANT ──────────────────────────
-- Décrémente la source ET incrémente la destination dans UNE seule
-- transaction. Si le stock source est insuffisant → exception, rien
-- n'est écrit (ni stock ni ledger). Plus de quantité négative silencieuse.
create or replace function public.transfer_stock(
  p_produit_id    uuid,
  p_depot_source  uuid,
  p_depot_dest    uuid,
  p_quantite      numeric,
  p_reference_id  text    default null,
  p_actor_id      uuid    default null
)
returns numeric            -- quantité restante au dépôt SOURCE après transfert
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src_id     uuid;
  v_src_qty    numeric;
  v_src_apres  numeric;
begin
  if p_depot_source = p_depot_dest then
    raise exception 'transfer_stock: source et destination identiques';
  end if;
  if p_quantite is null or p_quantite <= 0 then
    raise exception 'transfer_stock: quantité doit être > 0';
  end if;

  -- Verrou + vérification stock source SUFFISANT (bloquant).
  select id, quantite
    into v_src_id, v_src_qty
  from public.stock_par_depot
  where produit_id = p_produit_id
    and depot_id   = p_depot_source
  for update;

  if v_src_id is null or coalesce(v_src_qty, 0) < p_quantite then
    raise exception
      'transfer_stock: stock source insuffisant (dispo: %, demandé: %)',
      coalesce(v_src_qty, 0), p_quantite
      using errcode = 'check_violation';
  end if;

  -- Source : décrément atomique + ledger.
  v_src_apres := v_src_qty - p_quantite;
  update public.stock_par_depot
     set quantite = v_src_apres, updated_at = now()
   where id = v_src_id;
  insert into public.stock_movements (
    produit_id, depot_id, delta, quantite_avant, quantite_apres,
    type, reference_id, actor_id
  ) values (
    p_produit_id, p_depot_source, -p_quantite, v_src_qty, v_src_apres,
    'transfert', p_reference_id, p_actor_id
  );

  -- Destination : incrément atomique + ledger (réutilise adjust_stock).
  perform public.adjust_stock(
    p_produit_id, p_depot_dest, p_quantite,
    'transfert', null, p_reference_id, p_actor_id
  );

  return v_src_apres;
end$$;

comment on function public.transfer_stock is
  'Transfert inter-dépôts atomique et BLOQUANT : refuse si stock source insuffisant. Écrit 2 lignes ledger.';

-- ─── 4) Grants (les RPC sont SECURITY DEFINER, owner = postgres) ──
grant execute on function public.adjust_stock(uuid, uuid, numeric, text, text, text, uuid)
  to anon, authenticated, service_role;
grant execute on function public.transfer_stock(uuid, uuid, uuid, numeric, text, uuid)
  to anon, authenticated, service_role;
grant select on public.stock_movements to anon, authenticated, service_role;

notify pgrst, 'reload schema';
