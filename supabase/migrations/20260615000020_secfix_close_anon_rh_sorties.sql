-- =====================================================================
-- SÉCURITÉ #3 / #14 — Refermer l'accès anon en ÉCRITURE rouvert par le
-- hotfix vague 7 (20260531000020_hotfix_rls_reopen_stock.sql).
--
-- ⚠️ DOIT s'appliquer APRÈS 20260615000010 (RPC SECURITY DEFINER) qui
--    route les mutations légitimes :
--      - pointage check-in/out → pointage_check_in/out (definer)
--      - correction pointage    → pointage_corriger
--      - modération sortie      → moderer_sortie
--      - création casse/sortie  → creer_sortie
--
-- Failles fermées :
--   #3  pointages / shifts : RH/paie modifiables par anon (clé publique).
--   #14 sorties_stock : écriture anon → blanchir/rejeter une sortie.
--
-- Le hotfix vague 7 avait, pour ces tables : policy `anon_temporary_write`
-- (FOR ALL) + GRANT insert/update/delete à anon. On retire les DEUX :
--   1. la policy d'écriture (RLS refuse alors l'écriture anon) ;
--   2. le privilège de table (défense en profondeur — même si une policy
--      d'écriture resurgissait, anon resterait sans droit d'écrire).
-- Les RPC SECURITY DEFINER tournent en owner → NON affectés par le revoke.
--
-- LECTURE anon conservée (kiosk staff, cockpit, alertes lisent en anon).
-- APPEND-ONLY : neutralise le hotfix par une migration postérieure.
-- =====================================================================

do $$
declare
  t text;
  rh_tables text[] := array['pointages', 'shifts', 'sorties_stock'];
begin
  foreach t in array rh_tables loop
    if exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = t
    ) then
      -- 1) Couper l'écriture anon : policies du hotfix + variantes héritées.
      execute format('drop policy if exists "anon_temporary_write" on public.%I', t);
      execute format('drop policy if exists "anon_all"             on public.%I', t);
      execute format('drop policy if exists "anon_temporary_all"   on public.%I', t);

      -- 2) Défense en profondeur : retirer le privilège d'écriture à anon.
      execute format('revoke insert, update, delete on public.%I from anon', t);

      -- 3) Lecture anon conservée (policy SELECT unique et idempotente).
      execute format('drop policy if exists "anon_temporary_read" on public.%I', t);
      execute format('drop policy if exists "rh_anon_read"        on public.%I', t);
      execute format(
        'create policy "rh_anon_read" on public.%I for select to anon using (true)', t
      );
    end if;
  end loop;
end$$;

notify pgrst, 'reload schema';
