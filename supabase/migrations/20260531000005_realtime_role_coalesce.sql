-- ════════════════════════════════════════════════════════════════
-- 20260531000005 — Realtime messages policy : COALESCE current_user_role()
--
-- CONTEXTE
-- La policy "Realtime orders access policy" sur realtime.messages
-- (cf. 20260502120100_fix_realtime_orders_leak.sql) utilise :
--   public.current_user_role() in ('admin', 'employee')
-- Or si auth.uid() résout sur un user sans ligne dans profiles (cas
-- rare mais possible : webhook handle_new_user n'a pas tourné, ou user
-- supprimé manuellement), current_user_role() retourne NULL.
-- NULL IN ('admin','employee') → NULL (pas TRUE), donc le row est
-- SILENCIEUSEMENT filtré → staff ne reçoit aucun event realtime alors
-- qu'il devrait. Fail closed pour ce cas-là est sécurisant MAIS
-- déroutant à débugger.
--
-- La migration 20260530000004_predictive_stockout.sql (et autres)
-- utilisent déjà current_user_role() avec ce risque.
--
-- FIX
-- Wrap current_user_role() avec COALESCE(..., 'customer') pour que la
-- comparaison soit déterministe. Si pas de profile → role='customer'
-- → pas dans ('admin','employee') → fail closed (toujours sûr) mais
-- maintenant explicite et debuggable.
--
-- En réalité, la fonction current_user_role() est déjà définie en
-- 20260531000002_lockdown_rls.sql avec :
--   coalesce((select role from public.profiles where id = auth.uid()), 'customer')
-- Donc le COALESCE est déjà au niveau de la fonction. Ce migration sert
-- de filet de sécurité sur l'usage RLS au cas où une version antérieure
-- de current_user_role() (sans coalesce) serait encore active.
--
-- Idempotent : drop + create policy.
-- ════════════════════════════════════════════════════════════════

-- (Re)déclare current_user_role() avec COALESCE explicite (filet)
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'customer');
$$;
revoke execute on function public.current_user_role() from public;
grant execute on function public.current_user_role() to anon, authenticated;

-- Re-pose la policy avec COALESCE explicite au cas où la fonction
-- serait écrasée par une migration ultérieure.
alter table realtime.messages enable row level security;
drop policy if exists "Realtime orders access policy" on realtime.messages;

create policy "Realtime orders access policy"
  on realtime.messages
  for select
  to authenticated
  using (
    not (
      extension = 'postgres_changes'
      and (payload->'data'->>'table') = 'orders'
    )
    or
    coalesce(public.current_user_role(), 'customer') in ('admin', 'employee', 'manager')
    or
    (
      extension = 'postgres_changes'
      and (payload->'data'->>'table') = 'orders'
      and (payload->'data'->'record'->>'user_id')::uuid = auth.uid()
    )
  );

notify pgrst, 'reload schema';
