-- ────────────────────────────────────────────────────────────────
-- 20260605000001_promo_codes.sql
-- Codes promo B2C : table + RPC de validation SECURITY DEFINER.
-- L'anon NE lit PAS la table (pas d'énumération des codes) ; il valide
-- via validate_promo_code() qui renvoie uniquement le verdict + la remise.
-- Idempotent : safe to re-run.
-- ────────────────────────────────────────────────────────────────

create table if not exists public.promo_codes (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,                 -- saisi par le client (insensible casse via upper())
  discount_type text not null check (discount_type in ('percent','fixed_cents')),
  value         integer not null check (value > 0),   -- percent: 1..100 ; fixed_cents: centimes
  min_order_cents integer not null default 0,         -- montant minimum pour appliquer
  valid_from    timestamptz not null default now(),
  valid_until   timestamptz,                          -- null = pas d'expiration
  max_uses      integer,                              -- null = illimité
  current_uses  integer not null default 0,
  target_audience text not null default 'all' check (target_audience in ('all','new','pro')),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists idx_promo_codes_code on public.promo_codes (upper(code));

alter table public.promo_codes enable row level security;
-- Pas de policy SELECT pour anon : on ne lit jamais la table directement.
drop policy if exists "staff_read_promo" on public.promo_codes;
create policy "staff_read_promo" on public.promo_codes
  for select using (public.current_user_role() in ('admin','manager'));
drop policy if exists "staff_write_promo" on public.promo_codes;
create policy "staff_write_promo" on public.promo_codes
  for all using (public.current_user_role() in ('admin','manager'))
  with check (public.current_user_role() in ('admin','manager'));
revoke select on public.promo_codes from anon;

-- RPC de validation : renvoie le verdict sans exposer la table.
create or replace function public.validate_promo_code(p_code text, p_total_cents integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.promo_codes%rowtype;
  discount integer := 0;
begin
  select * into r from public.promo_codes
    where upper(code) = upper(trim(p_code)) and active = true
    limit 1;
  if not found then
    return jsonb_build_object('valid', false, 'reason', 'introuvable');
  end if;
  if r.valid_until is not null and r.valid_until < now() then
    return jsonb_build_object('valid', false, 'reason', 'expire');
  end if;
  if r.valid_from > now() then
    return jsonb_build_object('valid', false, 'reason', 'pas_encore_actif');
  end if;
  if r.max_uses is not null and r.current_uses >= r.max_uses then
    return jsonb_build_object('valid', false, 'reason', 'epuise');
  end if;
  if coalesce(p_total_cents,0) < r.min_order_cents then
    return jsonb_build_object('valid', false, 'reason', 'min_non_atteint', 'min_cents', r.min_order_cents);
  end if;
  if r.discount_type = 'percent' then
    discount := floor(p_total_cents * least(r.value,100) / 100.0);
  else
    discount := least(r.value, p_total_cents);
  end if;
  return jsonb_build_object(
    'valid', true, 'code', upper(r.code),
    'discount_type', r.discount_type, 'value', r.value,
    'discount_cents', discount
  );
end;
$$;

grant execute on function public.validate_promo_code(text, integer) to anon, authenticated;
