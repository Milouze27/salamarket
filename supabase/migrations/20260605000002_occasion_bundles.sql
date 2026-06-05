-- ────────────────────────────────────────────────────────────────
-- 20260605000002_occasion_bundles.sql
-- Paniers-type par occasion (Soirée Ramadan, Aïd, etc.) — catalogue
-- public lisible par anon (comme depots/produits). Idempotent.
-- ────────────────────────────────────────────────────────────────

create table if not exists public.occasion_bundles (
  id          uuid primary key default gen_random_uuid(),
  occasion    text not null check (occasion in ('ramadan_iftar','eid_fitr','eid_adha','achoura','general')),
  name        text not null,
  description text,
  product_ids uuid[] not null default '{}',   -- FK logiques vers produits(id)
  image_url   text,
  sort        integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists idx_occasion_bundles_active on public.occasion_bundles (occasion, sort) where active = true;

alter table public.occasion_bundles enable row level security;
drop policy if exists "read_all_bundles" on public.occasion_bundles;
create policy "read_all_bundles" on public.occasion_bundles
  for select using (true);                    -- catalogue public (anon)
drop policy if exists "staff_write_bundles" on public.occasion_bundles;
create policy "staff_write_bundles" on public.occasion_bundles
  for all using (public.current_user_role() in ('admin','manager'))
  with check (public.current_user_role() in ('admin','manager'));
grant select on public.occasion_bundles to anon, authenticated;
grant insert, update, delete on public.occasion_bundles to authenticated;
