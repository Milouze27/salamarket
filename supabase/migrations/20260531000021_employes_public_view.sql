-- ════════════════════════════════════════════════════════════════
-- LOCKDOWN EMPLOYES PII — vague 7 (P0 sécurité)
--
-- CONTEXTE
-- La vague 6 (20260531000002_lockdown_rls.sql) a gardé une policy
-- "anon_read_employes_no_pin" sur public.employes qui autorise anon
-- à SELECT * sur la table. Conséquence : la clé anon publique
-- (utilisée par le Drive PWA + l'app Stock côté client) peut lister
-- TOUTES les colonnes des employés, dont :
--   - pin_hash (bcrypt $2a$10$...) → offline-crackable (rainbow / GPU brute)
--   - pin_code (en clair, neutralisé à '0000' par 20260531000003 mais
--     PAS DROP de la colonne — reste lisible)
--   - taux_horaire, observe_ramadan (PII RH sensibles)
--
-- Probe prod confirmant la fuite :
--   curl …/employes?select=id,prenom,pin_hash,pin_code → 200 + pin_hash bcrypt
--
-- STRATÉGIE
-- 1. Créer une vue `employes_public` qui n'expose QUE les colonnes
--    sûres (id, nom, prenom, role, depot_principal_id, is_active,
--    created_at). Pas de pin_hash, pas de pin_code, pas de taux_horaire,
--    pas de observe_ramadan.
-- 2. GRANT SELECT sur la vue à anon + authenticated.
-- 3. REVOKE SELECT sur la table public.employes à anon.
-- 4. Garder SELECT sur public.employes pour authenticated + service_role
--    (les API routes Stock qui utilisent supabaseServer() bypassent RLS
--    via service_role anyway).
--
-- MIGRATION CÔTÉ APPS
-- Suivi par tickets séparés :
--   - apps/stock/lib/db/index.ts (listEmployes) → bascule sur employes_public
--   - apps/stock/lib/notifications.ts → idem (lit role + prenom)
--   - apps/stock/lib/staff/pointage-data.ts → idem
--   - apps/stock/app/v2/admin/alertes/page.tsx → idem
--   - apps/stock/app/v2/reception/[id]/page.tsx → idem
--   - apps/stock/app/v2/inventaire/historique/page.tsx → idem
--   - apps/stock/app/v2/admin/page.tsx → idem
-- Les routes /api/** utilisent supabaseServer() (service_role) — pas
-- besoin de changer.
--
-- BACKWARD COMPAT TEMPORAIRE
-- Pour ne PAS casser /v2/login (qui lit la liste des employés via anon
-- pour afficher prénom + role en sélection rapide), on POUSSE une vue
-- nommée 1:1 sur les colonnes attendues — les apps qui font encore
-- `.from('employes').select('*')` vont casser SI ces requêtes sont
-- côté anon. Les call sites recensés ci-dessus seront updatés dans
-- un commit séparé (apps/stock).
--
-- IDÉMPOTENT
-- CREATE OR REPLACE VIEW + REVOKE/GRANT — re-runnable.
-- ════════════════════════════════════════════════════════════════

-- Drop d'éventuelles versions antérieures (re-run)
drop view if exists public.employes_public;

-- Vue publique : colonnes non-sensibles UNIQUEMENT
--
-- Colonnes table employes en prod (probe service_role) :
--   id, nom, prenom, role, depot_principal_id, is_active, pin_code,
--   taux_horaire_brut, contrat_heures_hebdo, observe_ramadan,
--   badge_uid, actif, pin_hash.
--
-- Colonnes EXCLUES (sensibles) :
--   pin_code, pin_hash (auth secret), taux_horaire_brut,
--   contrat_heures_hebdo (RH paie), observe_ramadan (religion),
--   badge_uid (token physique).
--
-- created_at n'existe pas sur cette table → on ne l'expose pas.
create view public.employes_public as
select
  id,
  nom,
  prenom,
  role,
  depot_principal_id,
  is_active,
  actif
from public.employes;

comment on view public.employes_public is
  'Vue publique anon-safe des employés. N''expose JAMAIS pin_hash, '
  'pin_code, taux_horaire, observe_ramadan. Utilisée par les apps '
  'côté client (anon key). Pour les API routes serveur, utiliser '
  'directement public.employes via service_role (Mission 4).';

-- Grants : anon + authenticated peuvent SELECT la vue
grant select on public.employes_public to anon, authenticated;

-- Revoke SELECT direct sur la table employes pour anon (anti-fuite PII)
revoke select on public.employes from anon;

-- Garde SELECT pour authenticated (server-side bcp via service_role)
-- + writes managers/admins (déjà policy "manager_write_employes" vague 6)
grant select on public.employes to authenticated;

-- Drop la policy anon SELECT héritée de vague 6
do $$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='employes') then
    execute 'drop policy if exists "anon_read_employes_no_pin" on public.employes';
  end if;
end$$;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-DÉPLOIEMENT
--
-- Doit échouer (anon n'a plus SELECT employes) :
--   curl …/employes?select=pin_hash → 401 ou []
--
-- Doit fonctionner (anon a SELECT employes_public) :
--   curl …/employes_public?select=* → 200 + rows SANS pin_hash
--
-- ROLLBACK
--   grant select on public.employes to anon;
--   create policy "anon_read_employes_no_pin" on public.employes
--     for select using (true);
-- ════════════════════════════════════════════════════════════════
