create table public.pickup_slots (
  id uuid primary key default gen_random_uuid(),
  slot_start timestamptz not null,
  slot_end timestamptz not null,
  capacity integer not null default 5 check (capacity > 0),
  reserved_count integer not null default 0 check (reserved_count >= 0),
  created_at timestamptz not null default now(),
  unique (slot_start)
);

create index idx_pickup_slots_start on public.pickup_slots(slot_start);

alter table public.pickup_slots enable row level security;

create policy "pickup_slots_public_read" on public.pickup_slots
  for select using (true);