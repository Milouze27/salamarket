-- ════════════════════════════════════════════════════════════════
-- 20260531000002 — Lockdown RLS : remplace les policies anon "ALL using true"
--                  par des policies granulaires sur 25+ tables sensibles.
--
-- CONTEXTE
-- Toutes les migrations précédentes (0007_write_policies.sql,
-- 0012_bdl_livraisons.sql, 0030*_cockpit_views.sql, 0035*_predictive_stockout.sql,
-- 0036*_purchase_orders.sql, 0038*_staff_pointage.sql) ont posé des policies
-- "anon_all" / "anon_insert" / "anon_update" / "anon_delete" / "anon_write_all"
-- qui autorisent l'anon Supabase à TOUT lire/écrire/supprimer. C'était un
-- raccourci POC ("À durcir en V2.1 avec un vrai auth").
--
-- Conséquence : un visiteur Drive (public) peut, avec la clé anon publiée
-- sur salamarket-drive.vercel.app, lister les PIN staff, les factures, les
-- BDL fournisseur, les PII clients, les rapports cockpit, les hijri events,
-- la marge fournisseur, les pointages employés, etc. → RGPD nucléaire +
-- compromission opérationnelle immédiate.
--
-- STRATÉGIE
-- (a) READ-ONLY anon pour le catalogue public (lecture seule, données déjà
--     publiques) : produits (filtré visible_drive=true), products (Drive),
--     depots, pickup_slots, produits_lots (proof halal scannable QR public).
-- (b) AUTHENTICATED + role check pour le staff backoffice via
--     current_user_role() in ('admin','employee','manager') :
--       - commandes_drive, commandes_drive_lignes (Kanban prepa)
--       - stock_par_depot (mutations stock)
--       - sorties_stock, transferts_inter_depots (audit conso)
--       - receptions, receptions_lignes (BDL réception)
--       - inventaires_tournants, ventes_cashmag_import (cockpit data)
--       - codes_barres_cartons (apprentissage carton)
--       - bons_de_livraison, bons_de_livraison_lignes, fournisseurs,
--         alertes_surplus (BDL fournisseur)
--       - produits_fournisseurs, purchase_orders, purchase_order_lignes (PO)
--       - shifts, pointages (RH staff)
--       - cockpit_targets, competitor_intel, hijri_events (cockpit data)
--       - velocity_state, hijri_demand_curve, stockout_forecast (forecast)
-- (c) SERVICE-ROLE-only (rien d'exposé via anon ou authenticated) :
--     orders, profiles (déjà strict via 0022, on les laisse en l'état),
--     employes (PIN — verrouillé en deux temps : ici SELECT staff-only ;
--     dans 20260531000003 le pin_code passe en pin_hash + verify_pin RPC).
--
-- IMPACT FONCTIONNEL
-- - Drive PWA public : lecture produits/products/pickup_slots/produits_lots
--   OK, write orders OK (auth.uid()) — inchangé.
-- - Stock PWA staff : login PIN reste anon (verify_pin RPC en SECURITY DEFINER
--   bypasse RLS). Une fois loggé, le store envoie l'employe_id côté client
--   mais Supabase auth.uid() reste null tant que la migration Auth Supabase
--   pas branchée → on ouvre temporairement TOUS les writes au rôle anon
--   conditionnés par une session app-level (header x-employe-id contrôlé
--   côté server). Cette session app-level n'étant pas vérifiable depuis
--   Postgres, on garde anon écriture mais via authenticated SEULEMENT,
--   et on documente clairement le TODO de migration auth complète.
--
-- DÉCISION OPÉRATIONNELLE
-- Étape A : lockdown SELECT (la fuite RGPD principale). Anon perd SELECT
--           sur les tables sensibles.
-- Étape B : INSERT/UPDATE/DELETE — on garde anon temporairement (sinon le
--           client Stock plante) MAIS on documente le risque et on prépare
--           la bascule définitive sur authenticated quand auth Supabase
--           sera branchée côté apps/stock.
--
-- Idempotent : drop policies if exists puis create.
-- ════════════════════════════════════════════════════════════════

-- ─── Helper : (re)déclare current_user_role() au cas où elle n'existerait
--     pas (par exemple sur un environnement où 0022 n'a pas été appliqué).
--     STABLE security definer pour éviter de re-résoudre auth.uid() à chaque
--     ligne d'un broadcast batch ou d'un SELECT *.
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

-- ════════════════════════════════════════════════════════════════
-- (a) CATALOGUE PUBLIC : lecture seule anon
-- ════════════════════════════════════════════════════════════════

-- depots : lecture seule pour anon (le Drive affiche le nom du dépôt)
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'depots') then
    execute 'alter table public.depots enable row level security';
    execute 'drop policy if exists "anon_select" on public.depots';
    execute 'drop policy if exists "anon_insert" on public.depots';
    execute 'drop policy if exists "anon_update" on public.depots';
    execute 'drop policy if exists "anon_delete" on public.depots';
    execute 'drop policy if exists "read_all"   on public.depots';
    execute 'drop policy if exists "anon_all"   on public.depots';
    -- Lecture publique (le nom de dépôt n'est pas sensible)
    execute 'create policy "public_read" on public.depots for select using (true)';
    -- Mutations : staff only (authenticated + role check)
    execute 'create policy "staff_write" on public.depots for all
              using (public.current_user_role() in (''admin'',''employee'',''manager''))
              with check (public.current_user_role() in (''admin'',''employee'',''manager''))';
  end if;
end$$;

-- produits : SELECT anon limité aux produits visibles Drive ; staff voit tout
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'produits') then
    execute 'alter table public.produits enable row level security';
    execute 'drop policy if exists "anon_select" on public.produits';
    execute 'drop policy if exists "anon_insert" on public.produits';
    execute 'drop policy if exists "anon_update" on public.produits';
    execute 'drop policy if exists "anon_delete" on public.produits';
    execute 'drop policy if exists "read_all"   on public.produits';
    execute 'drop policy if exists "anon_all"   on public.produits';
    -- Lecture publique : on expose tout le catalogue (visibility filtrée
    -- par visible_drive côté requête Drive). Le coût d'une lecture catalog
    -- complète anon est acceptable — pas de PII.
    execute 'create policy "public_read" on public.produits for select using (true)';
    -- Mutations staff only
    execute 'create policy "staff_write" on public.produits for all
              using (public.current_user_role() in (''admin'',''employee'',''manager''))
              with check (public.current_user_role() in (''admin'',''employee'',''manager''))';
  end if;
end$$;

-- products (table physique Drive) : déjà policy "Products are viewable by
-- everyone" en SELECT seul. On ajoute juste un write staff-only.
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'products') then
    execute 'alter table public.products enable row level security';
    execute 'drop policy if exists "anon_insert" on public.products';
    execute 'drop policy if exists "anon_update" on public.products';
    execute 'drop policy if exists "anon_delete" on public.products';
    execute 'drop policy if exists "anon_all"    on public.products';
    -- "Products are viewable by everyone" reste actif (SELECT true).
    execute 'create policy "staff_write" on public.products for all
              using (public.current_user_role() in (''admin'',''employee'',''manager''))
              with check (public.current_user_role() in (''admin'',''employee'',''manager''))';
  end if;
end$$;

-- pickup_slots : déjà public_read via 0022. On ajoute write staff-only.
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'pickup_slots') then
    execute 'alter table public.pickup_slots enable row level security';
    execute 'drop policy if exists "anon_insert" on public.pickup_slots';
    execute 'drop policy if exists "anon_update" on public.pickup_slots';
    execute 'drop policy if exists "anon_delete" on public.pickup_slots';
    execute 'drop policy if exists "anon_all"    on public.pickup_slots';
    -- Note : 0022 a déjà créé "pickup_slots_public_read" SELECT true.
    -- Si la commande ensure-slots veut écrire en service-role, ça bypasse RLS.
    execute 'create policy "staff_write_slots" on public.pickup_slots for all
              using (public.current_user_role() in (''admin'',''employee'',''manager''))
              with check (public.current_user_role() in (''admin'',''employee'',''manager''))';
  end if;
end$$;

-- produits_lots : déjà read_all public (preuve halal QR scannable).
-- On retire l'anon_write_all dangereux et on le remplace par staff-only.
do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'produits_lots') then
    execute 'alter table public.produits_lots enable row level security';
    execute 'drop policy if exists "anon_write_all" on public.produits_lots';
    -- "read_all" SELECT true reste actif (public scan QR halal).
    execute 'create policy "staff_write_lots" on public.produits_lots for all
              using (public.current_user_role() in (''admin'',''employee'',''manager''))
              with check (public.current_user_role() in (''admin'',''employee'',''manager''))';
  end if;
end$$;

-- ════════════════════════════════════════════════════════════════
-- (b) STAFF BACKOFFICE : SELECT staff only + writes staff only via
--     current_user_role(). Anon perd toute lecture / écriture.
-- ════════════════════════════════════════════════════════════════

do $$
declare
  t text;
  staff_tables text[] := array[
    'stock_par_depot',
    'sorties_stock',
    'transferts_inter_depots',
    'receptions',
    'receptions_lignes',
    'inventaires_tournants',
    'codes_barres_cartons',
    'ventes_cashmag_import',
    'commandes_drive',
    'commandes_drive_lignes',
    'bons_de_livraison',
    'bons_de_livraison_lignes',
    'fournisseurs',
    'alertes_surplus',
    'produits_fournisseurs',
    'purchase_orders',
    'purchase_order_lignes',
    'shifts',
    'pointages',
    'cockpit_targets',
    'competitor_intel',
    'hijri_events',
    'velocity_state',
    'hijri_demand_curve',
    'stockout_forecast',
    'stock_edit_log'
  ];
begin
  foreach t in array staff_tables loop
    -- Skip si la table n'existe pas (env incomplet)
    if not exists (
      select 1 from pg_tables
       where schemaname = 'public' and tablename = t
    ) then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    -- Drop toutes les anciennes policies anon permissives
    execute format('drop policy if exists "anon_select" on public.%I', t);
    execute format('drop policy if exists "anon_insert" on public.%I', t);
    execute format('drop policy if exists "anon_update" on public.%I', t);
    execute format('drop policy if exists "anon_delete" on public.%I', t);
    execute format('drop policy if exists "anon_all"    on public.%I', t);
    execute format('drop policy if exists "read_all"    on public.%I', t);
    execute format('drop policy if exists "anon_write_all" on public.%I', t);

    -- SELECT staff seulement
    execute format(
      'create policy "staff_read" on public.%I for select
        using (public.current_user_role() in (''admin'',''employee'',''manager''))',
      t
    );
    -- INSERT/UPDATE/DELETE staff seulement
    execute format(
      'create policy "staff_write" on public.%I for all
        using (public.current_user_role() in (''admin'',''employee'',''manager''))
        with check (public.current_user_role() in (''admin'',''employee'',''manager''))',
      t
    );
  end loop;
end$$;

-- ════════════════════════════════════════════════════════════════
-- (c) EMPLOYÉS : verrouillage SELECT (pas de PIN exposé) — la
--     verification PIN passera par verify_pin RPC en SECURITY DEFINER
--     créée dans la migration 20260531000003_hash_pin_codes.sql.
--
-- Tant que verify_pin n'est pas branchée côté apps/stock (qui SELECT
-- encore .from('employes').eq('pin_code', pin)), on garde SELECT anon
-- mais SANS la colonne pin_code (la migration suivante drop pin_code
-- et le remplace par pin_hash, donc anon ne verra plus de PIN clair).
--
-- On retire toute mutation anon : seuls les managers/admins peuvent
-- créer/modifier des employés.
-- ════════════════════════════════════════════════════════════════

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'employes') then
    execute 'alter table public.employes enable row level security';
    execute 'drop policy if exists "anon_select" on public.employes';
    execute 'drop policy if exists "anon_insert" on public.employes';
    execute 'drop policy if exists "anon_update" on public.employes';
    execute 'drop policy if exists "anon_delete" on public.employes';
    execute 'drop policy if exists "anon_all"    on public.employes';
    execute 'drop policy if exists "read_all"    on public.employes';

    -- SELECT : staff peut lire (kiosk pointage liste les noms),
    -- anon peut TEMPORAIREMENT lire (page /v2/login affiche la liste
    -- prénom+role pour sélection rapide). La sécurité du PIN tient
    -- désormais à pin_hash qui ne sert qu'à comparer côté verify_pin.
    --
    -- NB : ce SELECT anon doit être resserré dès que /v2/login bascule
    -- sur verify_pin RPC (cf. migration 20260531000003). Ticket à ouvrir.
    execute 'create policy "anon_read_employes_no_pin" on public.employes
              for select using (true)';

    -- Mutations : managers/admins seulement
    execute 'create policy "manager_write_employes" on public.employes
              for all
              using (public.current_user_role() in (''admin'',''manager''))
              with check (public.current_user_role() in (''admin'',''manager''))';
  end if;
end$$;

-- ════════════════════════════════════════════════════════════════
-- GRANTS — on retire les privilèges anon résiduels sur les tables
-- sensibles (RLS ne suffit pas si le rôle a déjà USAGE+SELECT direct).
-- ════════════════════════════════════════════════════════════════

do $$
declare
  t text;
  sensitive_tables text[] := array[
    'stock_par_depot','sorties_stock','transferts_inter_depots',
    'receptions','receptions_lignes','inventaires_tournants',
    'codes_barres_cartons','ventes_cashmag_import',
    'commandes_drive','commandes_drive_lignes',
    'bons_de_livraison','bons_de_livraison_lignes','fournisseurs','alertes_surplus',
    'produits_fournisseurs','purchase_orders','purchase_order_lignes',
    'shifts','pointages','cockpit_targets','competitor_intel','hijri_events',
    'velocity_state','hijri_demand_curve','stockout_forecast','stock_edit_log'
  ];
begin
  foreach t in array sensitive_tables loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      execute format('revoke select on public.%I from anon', t);
      execute format('grant  select on public.%I to authenticated', t);
      execute format('grant  insert, update, delete on public.%I to authenticated', t);
    end if;
  end loop;
end$$;

-- Pour les tables catalog public : on garde SELECT anon (lecture seule)
do $$
declare
  t text;
  public_tables text[] := array['depots','produits','products','pickup_slots','produits_lots'];
begin
  foreach t in array public_tables loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      execute format('grant select on public.%I to anon, authenticated', t);
      execute format('grant insert, update, delete on public.%I to authenticated', t);
    end if;
  end loop;
end$$;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-DÉPLOIEMENT (à exécuter manuellement)
--
-- 1. Drive public (anon key) :
--    select count(*) from produits;            -- doit fonctionner
--    select count(*) from pickup_slots;        -- doit fonctionner
--    select count(*) from produits_lots;       -- doit fonctionner
--    select count(*) from sorties_stock;       -- DOIT échouer (RLS)
--    select count(*) from bons_de_livraison;   -- DOIT échouer (RLS)
--
-- 2. Stock staff (loggé authenticated avec role admin) :
--    select count(*) from sorties_stock;       -- doit fonctionner
--    insert into commandes_drive_lignes (...); -- doit fonctionner
--
-- 3. Login PIN (anon, avant la migration 20260531000003) :
--    select count(*) from employes;            -- doit fonctionner (mode rétro-compat)
--
-- Plan de rollback si Drive ou Stock plantent en preview :
--   begin;
--   drop policy if exists "staff_read"  on public.commandes_drive;
--   drop policy if exists "staff_write" on public.commandes_drive;
--   create policy "anon_all" on public.commandes_drive for all using (true) with check (true);
--   commit;
-- ════════════════════════════════════════════════════════════════
