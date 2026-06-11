-- =====================================================================
-- SÉCURITÉ — Refermer l'accès anon rouvert par le hotfix vague 7
-- (20260531000020_hotfix_rls_reopen_stock.sql).
--
-- Failles fermées ici (audit 2026-06-11) :
--   #3  pointages / shifts : données RH/paie lisibles ET modifiables par
--       le rôle `anon` (clé publique présente dans le bundle client).
--   #14 sorties_stock : écriture anon → un tiers peut blanchir/rejeter
--       une sortie suspecte (altération du score d'audit IA).
--
-- ⚠️ APPEND-ONLY : ne modifie PAS le hotfix d'origine, on le neutralise
--    par une migration postérieure.
--
-- ⚠️ PRÉ-REQUIS APP : apps/stock interroge ces tables avec la clé ANON
--    (client public, pas de session Supabase — auth PIN custom). Refermer
--    en `authenticated` casserait les écrans qui lisent/écrivent en anon.
--    => On bascule ces tables en LECTURE anon autorisée mais ÉCRITURE
--    interdite à anon. Les mutations légitimes (pointage employé, modération
--    sortie) doivent passer par une route server-side service_role
--    (Mission 4). Tant que ces routes n'existent pas, le pointage en
--    écriture directe anon cessera de fonctionner : à VÉRIFIER EN LIVE
--    avant/après application, écran par écran.
-- =====================================================================

-- ---------- pointages ----------
drop policy if exists "anon_all" on public.pointages;
drop policy if exists "anon_temporary_write" on public.pointages;
drop policy if exists "anon_temporary_all" on public.pointages;

-- Lecture seule pour anon (kiosk staff affiche les pointages du jour).
drop policy if exists "pointages_anon_read" on public.pointages;
create policy "pointages_anon_read"
  on public.pointages for select
  to anon
  using (true);

-- ---------- shifts ----------
drop policy if exists "anon_all" on public.shifts;
drop policy if exists "anon_temporary_write" on public.shifts;
drop policy if exists "anon_temporary_all" on public.shifts;

drop policy if exists "shifts_anon_read" on public.shifts;
create policy "shifts_anon_read"
  on public.shifts for select
  to anon
  using (true);

-- ---------- sorties_stock ----------
-- Lecture conservée (cockpit/alertes la lisent en anon), mais on coupe
-- l'écriture anon directe : la modération (accept/reject/clarify) devra
-- passer par une route server-side service_role à rôle vérifié.
drop policy if exists "anon_temporary_write" on public.sorties_stock;
drop policy if exists "anon_all" on public.sorties_stock;

drop policy if exists "sorties_stock_anon_read" on public.sorties_stock;
create policy "sorties_stock_anon_read"
  on public.sorties_stock for select
  to anon
  using (true);
