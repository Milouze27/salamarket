-- ════════════════════════════════════════════════════════════════
-- 20260612000001 — Active Realtime sur stock_par_depot
--
-- Pour l'alerte rupture COMPTOIR temps réel (écran /v2/counter) : quand
-- un produit chaud (en rayon, prix renseigné) passe sous le seuil de
-- réassort suite à une vente/sortie, l'écran comptoir doit le signaler
-- au préparateur SANS rafraîchissement manuel.
--
-- Sans cette ligne, le channel postgres_changes sur stock_par_depot ne
-- reçoit aucun event : l'app ne crashe pas (fallback gracieux côté
-- counter), mais l'alerte rupture reste muette. Idempotent.
-- ════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'stock_par_depot'
  ) then
    alter publication supabase_realtime add table public.stock_par_depot;
  end if;
end$$;

-- Vérif (Supabase Studio doit afficher stock_par_depot)
select schemaname, tablename
  from pg_publication_tables
 where pubname = 'supabase_realtime'
   and tablename = 'stock_par_depot';
