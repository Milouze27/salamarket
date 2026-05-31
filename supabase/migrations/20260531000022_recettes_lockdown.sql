-- ════════════════════════════════════════════════════════════════
-- LOCKDOWN RECETTES — vague 7 (exploit live trouvé en mega audit)
--
-- CONTEXTE
-- Le mega audit (workflow wf_ca3338c9) a démontré qu'un visiteur Drive
-- avec la clé anon publique peut écrire arbitrairement sur les tables
-- recettes labo (création de fausses recettes, modification des
-- ingrédients/coûts, suppression).
--
-- Probe prod confirmant l'exploit live :
--   curl -X POST …/recettes -H "apikey: <anon>" -d '{"nom":"HACK"}' → 201
--   curl -X DELETE …/recettes?nom=eq.HACK → 204
--
-- IMPACT BUSINESS
-- - Recettes = source des coûts laboratoire / marges.
-- - Attaquant peut empoisonner les calculs de marge (ingrédient à
--   prix négatif → simulation rentable → décision pricing fausse).
-- - Attaquant peut supprimer toute la BDD recettes le jour de la démo.
--
-- STRATÉGIE
-- - SELECT : ouvert à anon (le catalogue recettes labo peut être
--   exposé en lecture — ce sont des recettes culinaires, pas du PII).
-- - WRITE (INSERT/UPDATE/DELETE) : service_role UNIQUEMENT.
--   Les API routes Stock qui gèrent recettes utiliseront supabaseServer().
--
-- TABLES CIBLÉES (toutes existantes en prod, probes 200)
--   - recettes
--   - recettes_etapes
--   - recettes_ingredients
--   - productions_inputs
--   - productions_outputs
--
-- IDÉMPOTENT
-- ENABLE RLS + DROP policies anciennes + CREATE temporaires.
-- ════════════════════════════════════════════════════════════════

do $$
declare
  t text;
  recipe_tables text[] := array[
    'recettes',
    'recettes_etapes',
    'recettes_ingredients',
    'recettes_main_oeuvre',
    'productions_inputs',
    'productions_outputs'
  ];
begin
  foreach t in array recipe_tables loop
    if exists (
      select 1 from pg_tables
       where schemaname = 'public' and tablename = t
    ) then
      execute format('alter table public.%I enable row level security', t);
      -- Drop anciennes policies permissives
      execute format('drop policy if exists "anon_all"        on public.%I', t);
      execute format('drop policy if exists "anon_select"     on public.%I', t);
      execute format('drop policy if exists "anon_insert"     on public.%I', t);
      execute format('drop policy if exists "anon_update"     on public.%I', t);
      execute format('drop policy if exists "anon_delete"     on public.%I', t);
      execute format('drop policy if exists "anon_write_all"  on public.%I', t);
      execute format('drop policy if exists "read_all"        on public.%I', t);
      -- Drop policies hotfix existantes (re-run)
      execute format('drop policy if exists "anon_temporary_read"   on public.%I', t);
      execute format('drop policy if exists "service_role_write"    on public.%I', t);
      -- SELECT ouvert anon (recettes pas PII)
      execute format(
        'create policy "anon_temporary_read" on public.%I
          for select to anon using (true)',
        t
      );
      -- WRITE service_role only (les API routes utilisent supabaseServer)
      execute format(
        'create policy "service_role_write" on public.%I
          for all to service_role using (true) with check (true)',
        t
      );
      -- Grants : revoke writes anon, garde SELECT
      execute format(
        'revoke insert, update, delete on public.%I from anon',
        t
      );
      execute format(
        'grant select on public.%I to anon, authenticated',
        t
      );
    end if;
  end loop;
end$$;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-DÉPLOIEMENT
--
-- Doit fonctionner (anon SELECT) :
--   curl …/recettes?select=id&limit=2 → 200 + rows
--
-- Doit échouer (anon WRITE) :
--   curl -X POST …/recettes -H "apikey:<anon>" -d '{"nom":"HACK"}' → 401
--   curl -X DELETE …/recettes?nom=eq.X -H "apikey:<anon>"          → 401
--
-- Doit fonctionner (service_role WRITE) :
--   curl -X POST …/recettes -H "apikey:<service_role>" -d '{"nom":"OK"}' → 201
--
-- ROLLBACK
--   create policy "anon_all" on public.recettes for all using (true) with check (true);
--   grant insert, update, delete on public.recettes to anon;
-- ════════════════════════════════════════════════════════════════
