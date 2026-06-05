-- ────────────────────────────────────────────────────────────────
-- 20260605000003_cart_abandonment.sql
-- Suivi des paniers abandonnés pour relance email H+1 / H+24.
-- Écrit par le client (utilisateur connecté) ; lu par le cron service-role.
-- Idempotent.
-- ────────────────────────────────────────────────────────────────

create table if not exists public.cart_abandonment_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) on delete cascade,
  email        text,
  cart_hash    text not null,                 -- empreinte du contenu (évite doublons)
  items_count  integer not null default 0,
  total_cents  integer not null default 0,
  recovered    boolean not null default false,-- true si commande passée depuis
  emailed_h1   boolean not null default false,
  emailed_h24  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_cart_aband_pending on public.cart_abandonment_events (created_at)
  where recovered = false and (emailed_h1 = false or emailed_h24 = false);
create unique index if not exists uq_cart_aband_user_hash on public.cart_abandonment_events (user_id, cart_hash);

alter table public.cart_abandonment_events enable row level security;
-- L'utilisateur gère ses propres événements ; le staff lit tout ; le cron passe en service-role (bypass RLS).
drop policy if exists "own_cart_aband" on public.cart_abandonment_events;
create policy "own_cart_aband" on public.cart_abandonment_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "staff_read_cart_aband" on public.cart_abandonment_events;
create policy "staff_read_cart_aband" on public.cart_abandonment_events
  for select using (public.current_user_role() in ('admin','manager'));
grant select, insert, update on public.cart_abandonment_events to authenticated;
