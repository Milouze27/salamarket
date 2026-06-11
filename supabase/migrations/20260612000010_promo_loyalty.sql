-- ────────────────────────────────────────────────────────────────
-- 20260612000010_promo_loyalty.sql
-- V1 Panier — Promo (réactivation) + Cagnotte Baraka (fidélité B2C).
--
-- 1) Codes promo : la table public.promo_codes et la RPC
--    validate_promo_code() existent déjà (cf. 20260605000001_promo_codes.sql).
--    On NE les recrée PAS. On se contente de seeder 2 codes de démo
--    idempotents pour que le champ "Code promo" du panier soit
--    démontrable immédiatement.
--
-- 2) Cagnotte Baraka : 1 point fidélité par euro dépensé sur une commande
--    RETIRÉE (commandes_drive.statut = 'retire'). La source de vérité du
--    solde reste les commandes retirées (agrégées par la RPC), la table
--    loyalty_points sert de ledger pour d'éventuels ajustements manuels
--    (bonus parrainage, geste commercial) sans toucher aux commandes.
--
-- Idempotent : safe to re-run.
-- ────────────────────────────────────────────────────────────────

-- ── 1) Seed codes promo de démo (idempotent via ON CONFLICT) ──────
-- BARAKA10 : -10 % dès 20 € de panier. WELCOME5 : -5 € dès 25 €.
insert into public.promo_codes
  (code, discount_type, value, min_order_cents, target_audience, active)
values
  ('BARAKA10', 'percent',     10, 2000, 'all', true),
  ('WELCOME5', 'fixed_cents', 500, 2500, 'all', true)
on conflict (code) do nothing;

-- ── 2) Cagnotte Baraka : ledger + solde ──────────────────────────
create table if not exists public.loyalty_points (
  id          uuid primary key default gen_random_uuid(),
  -- On rattache par email (les commandes Drive au poids sont matchées par
  -- email côté app ; user_id n'est pas toujours présent). user_id optionnel
  -- pour les comptes authentifiés.
  email       text not null,
  user_id     uuid,
  points      integer not null,                       -- +crédit / -débit
  reason      text not null default 'ajustement',     -- 'commande' | 'ajustement' | 'bonus'
  commande_id uuid,                                    -- trace la commande source si reason='commande'
  created_at  timestamptz not null default now()
);

create index if not exists idx_loyalty_points_email on public.loyalty_points (lower(email));

alter table public.loyalty_points enable row level security;

-- L'anon ne lit jamais le ledger directement : il passe par la RPC
-- get_loyalty_balance() (SECURITY DEFINER). Seul le staff lit/écrit la table.
drop policy if exists "staff_read_loyalty" on public.loyalty_points;
create policy "staff_read_loyalty" on public.loyalty_points
  for select using (public.current_user_role() in ('admin','manager'));
drop policy if exists "staff_write_loyalty" on public.loyalty_points;
create policy "staff_write_loyalty" on public.loyalty_points
  for all using (public.current_user_role() in ('admin','manager'))
  with check (public.current_user_role() in ('admin','manager'));
revoke select on public.loyalty_points from anon;

-- RPC solde Baraka : 1 point / € sur les commandes RETIRÉES + ajustements
-- du ledger. Renvoie un solde entier ≥ 0. SECURITY DEFINER pour pouvoir
-- lire commandes_drive sans exposer la table à l'anon.
create or replace function public.get_loyalty_balance(p_email text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email       text := lower(trim(coalesce(p_email, '')));
  v_from_orders integer := 0;
  v_from_ledger integer := 0;
begin
  if v_email = '' then
    return 0;
  end if;

  -- 1 point par euro dépensé (total_ttc) sur les commandes retirées.
  select coalesce(floor(sum(total_ttc)), 0)::integer
    into v_from_orders
    from public.commandes_drive
    where lower(client_email) = v_email
      and statut = 'retire';

  -- Ajustements manuels éventuels.
  select coalesce(sum(points), 0)::integer
    into v_from_ledger
    from public.loyalty_points
    where lower(email) = v_email;

  return greatest(0, coalesce(v_from_orders, 0) + coalesce(v_from_ledger, 0));
end;
$$;

grant execute on function public.get_loyalty_balance(text) to anon, authenticated;
