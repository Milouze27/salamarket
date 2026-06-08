-- =====================================================================
-- 20260608000002 — Ferme la forgerie de lots halal (audit 2026-06-08)
--
-- Contexte : 20260531000002_lockdown_rls avait retiré l'écriture anon sur
-- produits_lots (staff_write_lots). Le hotfix 20260531000020 (déblocage
-- IMPORT STOCK) l'a RÉ-OUVERTE sous le nom 'anon_temporary_write_lots'
-- ('for all to anon using(true)') — POC à durcir. Conséquence réelle :
-- n'importe quel porteur de la clé anon publique peut INSERT/UPDATE/DELETE
-- un lot, donc FORGER un lot « certifié halal » affiché sur /lot/:id.
--
-- Aucune écriture applicative ne cible produits_lots (toutes les
-- références code sont des lectures : pages /lots, certificat-pdf,
-- HalalBadgeLink). On peut donc retirer l'écriture anon sans rien casser.
-- Les écritures (réception/seed) passent par le service-role qui bypasse
-- la RLS. La lecture publique 'read_all' (scan QR) reste intacte.
-- =====================================================================

do $$
begin
  if exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'produits_lots'
  ) then
    -- Retire toute policy d'écriture anonyme (POC) sur les lots.
    execute 'drop policy if exists "anon_temporary_write_lots" on public.produits_lots';
    execute 'drop policy if exists "anon_temporary_write" on public.produits_lots';
    execute 'drop policy if exists "anon_write_all" on public.produits_lots';
    -- 'read_all' (SELECT to anon, scan QR public) est volontairement conservée.
  end if;
end$$;
