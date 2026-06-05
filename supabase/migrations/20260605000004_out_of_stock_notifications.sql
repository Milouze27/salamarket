-- ────────────────────────────────────────────────────────────────
-- 20260605000004_out_of_stock_notifications.sql
-- "Préviens-moi au retour" : un client demande à être notifié quand un
-- produit en rupture revient. Écrit par l'utilisateur (ou anon avec email).
-- Idempotent.
-- ────────────────────────────────────────────────────────────────

create table if not exists public.out_of_stock_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  product_id  uuid not null,                  -- FK logique vers produits(id)
  email       text not null,
  notified_at timestamptz,                    -- null = pas encore notifié
  created_at  timestamptz not null default now()
);

create index if not exists idx_oos_pending on public.out_of_stock_notifications (product_id)
  where notified_at is null;
create unique index if not exists uq_oos_email_product on public.out_of_stock_notifications (lower(email), product_id)
  where notified_at is null;

alter table public.out_of_stock_notifications enable row level security;
-- Inscription ouverte (anon peut s'inscrire avec son email) ; lecture staff + cron service-role.
drop policy if exists "insert_oos" on public.out_of_stock_notifications;
create policy "insert_oos" on public.out_of_stock_notifications
  for insert with check (true);
drop policy if exists "own_oos" on public.out_of_stock_notifications;
create policy "own_oos" on public.out_of_stock_notifications
  for select using (auth.uid() = user_id or public.current_user_role() in ('admin','manager'));
grant insert on public.out_of_stock_notifications to anon, authenticated;
grant select on public.out_of_stock_notifications to authenticated;
