-- update_updated_at_column n'a pas besoin de SECURITY DEFINER
alter function public.update_updated_at_column() security invoker;
revoke execute on function public.update_updated_at_column() from public, anon, authenticated;

-- handle_new_user doit rester SECURITY DEFINER (trigger sur auth.users)
-- mais on révoque l'exécution publique
revoke execute on function public.handle_new_user() from public, anon, authenticated;