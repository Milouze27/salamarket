-- Table des subscriptions Web Push.
-- Une ligne = un appareil/navigateur abonné aux notifications push.
-- L'unicité (user_id, endpoint) évite les doublons si l'utilisateur
-- re-souscrit depuis le même appareil.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now(),
  unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Lecture / insert / suppression de ses propres subscriptions
drop policy if exists "users read own push subs" on public.push_subscriptions;
create policy "users read own push subs"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "users insert own push subs" on public.push_subscriptions;
create policy "users insert own push subs"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

drop policy if exists "users delete own push subs" on public.push_subscriptions;
create policy "users delete own push subs"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

-- Le service_role utilisé par l'edge function bypasse RLS automatiquement
-- (pas besoin de policy explicite pour lui).
