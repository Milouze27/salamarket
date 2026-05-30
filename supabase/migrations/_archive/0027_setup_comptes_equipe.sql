-- =====================================================================
-- 0027_setup_comptes_equipe.sql
-- Préparation des comptes équipe avant l'activation du module B2B Pro
-- =====================================================================
--
-- État constaté en prod (2026-05-14) :
--   - Mohamed REDA  <digitalwebmastertlse@gmail.com>     role 'customer'
--   - ZBAIRI        <zbairi.mohamed@salamarket31.fr>     role 'admin' ← doublon
--   - ZBAIRI        <mohamed.zbairi@salamarket31.fr>     role 'admin' ← doublon
--   - test          <test-001@gmail.com>                 role 'customer'
--
-- Manquent : Mohamed Belhamiti, Otmane, Ahmed.
--
-- Note : 0026_promote_zabiri_manager.sql ciblait 'zabiri' alors que
-- la donnée réelle est 'zbairi'. Ce fichier corrige le tir et remplace
-- 0026 (qui est marqué .OBSOLETE).
--
-- Objectifs :
--   1) Promouvoir les 2 ZBAIRI 'admin' → 'manager'
--   2) CHECK sur profiles.role (4 valeurs autorisées)
--   3) Fonction set_user_role(email, role) SECURITY DEFINER pour
--      promouvoir les futurs comptes équipe sans toucher à la table
--      (contourne RLS profiles_update_own + revoke update(role))
-- =====================================================================


-- =====================================================================
-- SECTION 1 — Promouvoir les 2 comptes ZBAIRI en 'manager'
-- Fait AVANT la CHECK pour ne pas se bloquer si un rôle non listé
-- existait, et pour aligner la donnée avec l'usage B2B.
-- =====================================================================

update public.profiles
   set role = 'manager',
       updated_at = now()
 where email in (
   'zbairi.mohamed@salamarket31.fr',
   'mohamed.zbairi@salamarket31.fr'
 );


-- =====================================================================
-- SECTION 2 — CHECK constraint sur profiles.role
-- Idempotent : drop puis add.
--
-- Valeurs autorisées :
--   - admin    : accès complet (backoffice + B2B)
--   - manager  : accès complet B2B (Drive Pro)
--   - employee : accès limité backoffice (préparation commandes)
--   - customer : client final Drive Particulier (rôle par défaut au
--                signup via le trigger handle_new_user → set 'customer')
-- =====================================================================

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'manager', 'employee', 'customer'));


-- =====================================================================
-- SECTION 3 — Fonction set_user_role(email, role)
--
-- Permet à un admin de promouvoir un compte en 1 ligne après que le
-- trigger handle_new_user ait inséré la ligne profiles au signup.
--
-- SECURITY DEFINER → exécute avec les droits du propriétaire, donc
-- contourne :
--   - le revoke update(role) on profiles from authenticated
--   - la policy profiles_update_own qui force role inchangé
--
-- Sécurité applicative dans le corps :
--   - Validation de p_role contre la liste blanche
--   - Vérif que auth.uid() correspond à un compte profiles.role='admin'
--   - Exception claire si aucun email ne matche
--
-- Usage :
--   select public.set_user_role('otmane@xxx.fr', 'admin');
-- =====================================================================

create or replace function public.set_user_role(
  p_email text,
  p_role  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
  v_rows        integer;
begin
  -- 1. Validation du rôle cible (liste blanche)
  if p_role not in ('admin', 'manager', 'employee', 'customer') then
    raise exception
      'set_user_role: rôle invalide "%". Valeurs autorisées : admin, manager, employee, customer.',
      p_role;
  end if;

  -- 2. Autorisation : appelant doit être admin
  select role into v_caller_role
    from public.profiles
   where id = auth.uid();

  if v_caller_role is distinct from 'admin' then
    raise exception
      'set_user_role: forbidden — caller is not admin (current role: %).',
      coalesce(v_caller_role, 'null');
  end if;

  -- 3. Application
  update public.profiles
     set role = p_role,
         updated_at = now()
   where email = p_email;

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception
      'set_user_role: aucun compte trouvé avec email "%".',
      p_email;
  end if;
end;
$$;

-- EXECUTE : par défaut, PUBLIC peut appeler une fonction. On retire
-- ce droit et on n'expose qu'à 'authenticated'. La sécurité réelle
-- (admin uniquement) est faite dans le corps de la fonction.
revoke execute on function public.set_user_role(text, text) from public;
grant  execute on function public.set_user_role(text, text) to authenticated;

comment on function public.set_user_role(text, text) is
  'Promeut un compte profiles à un rôle donné. SECURITY DEFINER. Réservé aux admins (vérif dans le corps). Usage : select public.set_user_role(''otmane@xxx.fr'', ''admin'').';


-- =====================================================================
-- SECTION 4 — Comptes équipe à créer (ACTION MANUELLE post-migration)
-- =====================================================================
--
-- Les 3 comptes ci-dessous NE SONT PAS créés par cette migration
-- (les comptes auth ne peuvent pas être insérés en SQL sans le
-- service_role et la table auth.users est sous Supabase Auth).
--
-- Étapes pour chacun :
--
--   1) Dashboard Supabase → Authentication → Users → "Add user"
--      Renseigner email + mot de passe temporaire (ou inviter par email).
--      Le trigger public.handle_new_user() crée automatiquement la
--      ligne dans public.profiles avec role 'customer' (default).
--
--   2) Promotion en une commande (à lancer en tant qu'admin déjà connecté
--      via le SQL Editor authentifié, ou via une edge function avec
--      service_role) :
--
--        select public.set_user_role('mohamed.belhamiti@xxx.fr', 'admin');
--        select public.set_user_role('otmane@xxx.fr',            'admin');
--        select public.set_user_role('ahmed@xxx.fr',             'admin');
--
-- Comptes à créer :
--   - Mohamed Belhamiti  → role 'admin'  — email à confirmer
--   - Otmane             → role 'admin'  — email à confirmer
--   - Ahmed              → role 'admin'  — email à confirmer
--
-- =====================================================================
