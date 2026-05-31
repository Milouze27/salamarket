-- ════════════════════════════════════════════════════════════════
-- HOTFIX RLS — vague 7 (post-mega-audit)
--
-- CONTEXTE
-- La migration vague 6 `20260531000002_lockdown_rls.sql` a remplacé
-- les anciennes policies "anon_all using true" par des policies
-- `staff_read` / `staff_write` qui exigent
-- `current_user_role() in ('admin','employee','manager')`.
--
-- PROBLÈME OBSERVÉ EN PROD
-- L'app Stock (apps/stock) n'utilise PAS encore Supabase Auth — elle
-- ouvre toutes ses requêtes avec la clé anon Supabase (pas de session
-- authentifiée). Conséquence : `auth.uid()` est null → la profile-jointure
-- de `current_user_role()` renvoie 'customer' → toutes les policies
-- `staff_read` / `staff_write` refusent → l'app Stock affiche des écrans
-- vides sur /v2/reception, /v2/stock, /v2/counter, /v2/preparation.
--
-- Probes prod confirmant le breakage (curl avec anon key) :
--   - /commandes_drive       → 401
--   - /bons_de_livraison     → 401
--   - /purchase_orders       → 401
--   - /stock_par_depot       → 401
--   - /sorties_stock         → 401
--   - /transferts_inter_depots → 401
--   - /cockpit_targets       → 401
--   - /competitor_intel      → 401
--   - /pointages             → 401
--   - /stockout_forecast     → 400
--   - /velocity_state        → 400
--
-- STRATÉGIE HOTFIX (minimum-risk, post-démo on bascule sur service_role
-- server-side via Mission 4)
-- Ré-ouvrir TEMPORAIREMENT `anon SELECT + ALL` sur les tables Stock
-- opérationnelles. Lock-down PII / secrets séparé (cf. migrations
-- 20260531000021 employes_public_view et 20260531000022 recettes_lockdown).
--
-- TICKET POST-DÉMO (Mission 4)
-- Bascule Stock sur service_role server-side :
--   - Toutes les requêtes anon de apps/stock/lib/db, apps/stock/app/v2/**
--     remplacées par appels server-side via `supabaseServer()` (déjà en
--     place dans apps/stock/app/api/** routes).
--   - Une fois fait : restore staff_read/staff_write définitifs.
--
-- IDÉMPOTENT
-- DROP POLICY IF EXISTS pour les policies vague 6 + CREATE des anon_temp.
-- Si table absente → no-op.
-- ════════════════════════════════════════════════════════════════

do $$
declare
  t text;
  staff_tables text[] := array[
    -- Tables flux opérationnel Stock (commandes Drive + prepa)
    'commandes_drive',
    'commandes_drive_lignes',
    -- Tables BDL fournisseur (réception scan-first)
    'bons_de_livraison',
    'bons_de_livraison_lignes',
    'fournisseurs',
    'alertes_surplus',
    'produits_fournisseurs',
    -- Tables PO (achats)
    'purchase_orders',
    'purchase_order_lignes',
    -- Tables stock physique (sortie, transfert, réception ad-hoc)
    'sorties_stock',
    'stock_par_depot',
    'receptions',
    'receptions_lignes',
    'transferts_inter_depots',
    'inventaires_tournants',
    'codes_barres_cartons',
    'ventes_cashmag_import',
    'stock_edit_log',
    -- Pickup (slots) — déjà public_read, on touche pas. pickup_bays absent en prod.
    -- Cockpit / forecast
    'cockpit_targets',
    'competitor_intel',
    'hijri_events',
    'stockout_forecast',
    'velocity_state',
    'hijri_demand_curve',
    -- RH staff (kiosk pointage)
    'shifts',
    'pointages'
  ];
begin
  foreach t in array staff_tables loop
    if exists (
      select 1 from pg_tables
       where schemaname = 'public' and tablename = t
    ) then
      -- Drop policies vague 6 qui bloquaient anon
      execute format('drop policy if exists "staff_read"  on public.%I', t);
      execute format('drop policy if exists "staff_write" on public.%I', t);
      -- Drop policies hotfix existantes (re-run idempotent)
      execute format('drop policy if exists "anon_temporary_read"  on public.%I', t);
      execute format('drop policy if exists "anon_temporary_write" on public.%I', t);
      -- Ouvre SELECT et ALL à anon (POC mode, à durcir Mission 4)
      execute format(
        'create policy "anon_temporary_read" on public.%I
          for select to anon using (true)',
        t
      );
      execute format(
        'create policy "anon_temporary_write" on public.%I
          for all to anon using (true) with check (true)',
        t
      );
      -- Restore les grants SELECT/INSERT/UPDATE/DELETE à anon
      -- (la vague 6 les avait révoqués pour anon).
      execute format(
        'grant select, insert, update, delete on public.%I to anon, authenticated',
        t
      );
    end if;
  end loop;
end$$;

-- ────────────────────────────────────────────────────────────────
-- produits_lots : la vague 6 a gardé read_all (SELECT true) mais
-- mis staff_write_lots qui bloque l'écriture anon. On rouvre.
-- ────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='produits_lots') then
    execute 'drop policy if exists "staff_write_lots" on public.produits_lots';
    execute 'drop policy if exists "anon_temporary_write_lots" on public.produits_lots';
    execute 'create policy "anon_temporary_write_lots" on public.produits_lots
              for all to anon using (true) with check (true)';
    execute 'grant insert, update, delete on public.produits_lots to anon, authenticated';
  end if;
end$$;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-DÉPLOIEMENT
--
-- Stock devrait revivre :
--   curl …/commandes_drive       → 200 + rows
--   curl …/bons_de_livraison     → 200 + rows
--   curl …/stock_par_depot       → 200 + rows
--   curl …/cockpit_targets       → 200 + rows
--
-- ROLLBACK D'URGENCE
--   begin;
--     drop policy if exists "anon_temporary_read"  on public.commandes_drive;
--     drop policy if exists "anon_temporary_write" on public.commandes_drive;
--     create policy "staff_read"  on public.commandes_drive for select
--       using (current_user_role() in ('admin','employee','manager'));
--     create policy "staff_write" on public.commandes_drive for all
--       using (current_user_role() in ('admin','employee','manager'))
--       with check (current_user_role() in ('admin','employee','manager'));
--   commit;
-- ════════════════════════════════════════════════════════════════
