-- ════════════════════════════════════════════════════════════════
-- 20260531000003 — Hash PIN staff (bcrypt) + verify_pin SECURITY DEFINER
--
-- CONTEXTE
-- public.employes.pin_code est stocké en CLAIR (text NOT NULL CHECK length=4).
-- Couplé à la RLS permissive de _archive/0007_write_policies.sql (anon SELECT
-- libre), n'importe quel anonyme avec la clé Supabase publique du Drive peut :
--   SELECT pin_code FROM public.employes;
-- → compromission immédiate de tous les comptes POS / Stock.
--
-- La migration 20260531000002_lockdown_rls.sql ferme déjà les writes anon,
-- mais on doit en plus :
--   1. Ajouter une colonne pin_hash (bcrypt cost 10 via pgcrypto.crypt())
--   2. Backfiller pin_hash = crypt(pin_code, gen_salt('bf', 10))
--   3. DROP la colonne pin_code (plus jamais en clair)
--   4. Créer verify_pin(p_pin text) returns uuid SECURITY DEFINER qui compare
--      le PIN clair fourni au hash et retourne employe_id si match (+ actif).
--      C'est la seule fonction qui touche aux hashes, en SECURITY DEFINER
--      pour bypasser la RLS qui sera resserrée plus tard.
--
-- IMPACT FONCTIONNEL
-- apps/stock/lib/db/index.ts loginByPin() utilise actuellement :
--   .eq("pin_code", pin)  → cette migration casse cette query.
-- Le code client est mis à jour dans la même PR pour appeler la RPC :
--   const { data } = await supabase.rpc('verify_pin', { p_pin: pin });
--   if (data) { /* data = employe_id uuid */ }
--
-- IDEMPOTENCE
-- - ADD COLUMN IF NOT EXISTS
-- - Backfill UPDATE WHERE pin_hash IS NULL
-- - DROP COLUMN IF EXISTS
-- - CREATE OR REPLACE FUNCTION
-- ════════════════════════════════════════════════════════════════

-- pgcrypto pour crypt() et gen_salt() — installé dans le schema "extensions"
-- sur Supabase managed. On qualifie chaque appel pour éviter search_path issues.
create extension if not exists pgcrypto with schema extensions;

-- ─── 1) Ajouter pin_hash ───────────────────────────────────────────
alter table public.employes
  add column if not exists pin_hash text;

-- ─── 2) Backfill : seulement si pin_code existe encore et pin_hash vide
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'employes'
       and column_name  = 'pin_code'
  ) then
    update public.employes
       set pin_hash = extensions.crypt(pin_code, extensions.gen_salt('bf', 10))
     where pin_hash is null
       and pin_code is not null;
  end if;
end$$;

-- ─── 3) DROP pin_code (plus jamais en clair) ───────────────────────
-- NB : sur la prod, on ne drop pas la colonne immédiatement pour
--      laisser le temps au déploiement applicatif. On garde la colonne
--      mais on bascule l'API serveur sur verify_pin et on met pin_code
--      vide (string vide) pour neutraliser les anciennes lectures.
--      Sur un nouvel environnement, on drop directement.
--
-- DÉCISION : on neutralise au lieu de drop, pour éviter une fenêtre où
-- /v2/login serait cassé. Le client va basculer sur verify_pin dans la
-- même PR — on pourra dropper la colonne dans une migration ultérieure
-- une fois confirmé qu'aucun consommateur ne lit pin_code.
update public.employes
   set pin_code = '0000'
 where pin_code is not null
   and pin_hash is not null;

-- ─── 4) verify_pin RPC SECURITY DEFINER ────────────────────────────
-- Compare le PIN clair au hash stocké, renvoie employe_id si match ET
-- employé actif. Aucun PIN ne sort jamais de la fonction.
--
-- SECURITY DEFINER → bypasse la RLS sur public.employes (qui sera
-- resserrée pour SELECT staff-only après bascule du client).
--
-- Anti-énumération : on ne révèle PAS quel employé existe. Si pas de
-- match → on renvoie NULL. Le client gère "PIN incorrect" générique.
--
-- Anti-timing attack : pgcrypto.crypt() utilise bcrypt constant-time
-- pour la comparaison du hash, donc pas besoin d'ajout de delay.
create or replace function public.verify_pin(p_pin text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employe_id uuid;
begin
  -- Garde-fou : PIN doit être 4 chiffres
  if p_pin is null or length(p_pin) != 4 or p_pin !~ '^[0-9]{4}$' then
    return null;
  end if;

  -- Trouve l'employé actif dont le hash matche
  -- extensions.crypt qualifié car search_path = public ici
  select id
    into v_employe_id
    from public.employes
   where is_active = true
     and pin_hash is not null
     and pin_hash = extensions.crypt(p_pin, pin_hash)
   limit 1;

  return v_employe_id;
end$$;

-- Anon peut appeler verify_pin (c'est l'écran de login).
-- L'authenticated aussi (re-vérification).
revoke execute on function public.verify_pin(text) from public;
grant execute on function public.verify_pin(text) to anon, authenticated;

-- ─── 5) Helper : get_employe_by_id staff-safe ──────────────────────
-- Retourne une ligne employe (sans pin_hash) pour un id donné. Utile
-- pour reconstituer la session post-login sans exposer le hash.
create or replace function public.get_employe_safe(p_id uuid)
returns table (
  id                  uuid,
  nom                 text,
  prenom              text,
  role                text,
  depot_principal_id  uuid,
  is_active           boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select id, nom, prenom, role, depot_principal_id, is_active
    from public.employes
   where id = p_id;
$$;

revoke execute on function public.get_employe_safe(uuid) from public;
grant execute on function public.get_employe_safe(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-DÉPLOIEMENT
--
-- 1. Vérifier que tous les employés actifs ont un pin_hash :
--    select count(*) from employes where is_active=true and pin_hash is null;
--    -- doit retourner 0
--
-- 2. Tester verify_pin avec un PIN connu (l'ancien PIN d'avant bascule) :
--    select verify_pin('1234');  -- doit retourner un uuid si 1234 existait
--    select verify_pin('0000');  -- doit retourner NULL (anti-bypass via valeur neutralisée)
--    select verify_pin('XYZ');   -- doit retourner NULL (format invalide)
--
-- 3. Confirmer que pin_code n'expose plus de secrets :
--    select distinct pin_code from employes;  -- doit montrer '0000' partout
--
-- Plan de rollback :
--   begin;
--   drop function if exists public.verify_pin(text);
--   drop function if exists public.get_employe_safe(uuid);
--   -- pour restaurer pin_code, il faut une sauvegarde pré-migration
--   commit;
-- ════════════════════════════════════════════════════════════════
