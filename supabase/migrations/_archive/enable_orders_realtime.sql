-- Active la réplication Realtime sur la table orders.
-- À exécuter dans Lovable Cloud → SQL Editor.
--
-- Sans cette publication, les INSERT sur public.orders ne sont pas
-- diffusés via Supabase Realtime. Conséquence : le hook
-- useNewOrderSound (sur /admin) ne reçoit jamais les events INSERT,
-- donc ni le toast "Nouvelle commande" ni le son cha-ching ne se
-- déclenchent quand un client passe commande.
--
-- Idempotent : si la table est déjà dans la publication, l'instruction
-- échoue silencieusement (à wrapper dans un DO block au cas où).

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

-- Vérification : la table doit apparaître dans la liste.
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by schemaname, tablename;
