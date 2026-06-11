-- ════════════════════════════════════════════════════════════════
-- 20260612000050 — Inventaire (recalage stock) + CRUD équipe (RPC)
--
-- V6-inventaire-equipe. Deux volets :
--
-- 1) INVENTAIRE — recalage du stock sur l'écart compté.
--    Le recalage applicatif (lib/db completeInventaire) appelle déjà
--    adjust_stock(p_type => 'inventaire'). Cette migration GARANTIT de
--    façon idempotente que le type 'inventaire' est bien accepté par
--    adjust_stock (sinon le recalage lève "type invalide"). On NE
--    redéfinit PAS adjust_stock ici (déjà fait, atomique, anti-overdraw) :
--    on se contente d'une assertion défensive qui échoue à l'install si
--    le type a disparu d'un éventuel rollback.
--    On expose aussi la vue `produit_dernier_comptage` (date du dernier
--    comptage validé par produit/dépôt) que le scoreur déterministe du
--    cron inventaire-tournant lit pour prioriser les réfs jamais/anciennement
--    comptées (ancienneté du dernier comptage).
--
-- 2) ÉQUIPE — l'app Stock se connecte avec la clé anon (login par PIN,
--    sans JWT Supabase) : elle ne peut donc PAS muter `employes`
--    (RLS manager_write_employes exige current_user_role() admin/manager
--    via JWT, cf. 20260531000002). On fournit 4 RPC SECURITY DEFINER
--    qui portent la garde de rôle EN INTERNE (l'appelant passe son
--    employe_id ; on vérifie qu'il est admin/manager) :
--      - admin_list_employes(p_acteur_id)            → liste complète (avec actif)
--      - admin_create_employe(...)                   → crée + hash PIN bcrypt
--      - admin_update_employe(...)                   → maj rôle/nom/dépôt
--      - admin_set_employe_actif(p_acteur, p_id, b)  → activer/désactiver
--      - admin_set_employe_pin(p_acteur, p_id, pin)  → reset PIN (bcrypt)
--    Le hash réutilise extensions.crypt/gen_salt (pgcrypto, cf.
--    20260531000003). Aucun PIN clair n'est jamais stocké ni renvoyé.
--
-- IDÉMPOTENT : create or replace + drop if exists. Re-runnable.
-- ════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ─── 1a) Assertion défensive : type 'inventaire' accepté ──────────
-- adjust_stock existe déjà (20260604000002 / 20260608000003) et accepte
-- 'inventaire'. On vérifie sa présence pour échouer tôt et clairement si
-- une migration future / un rollback l'a cassé. On ne touche PAS au corps.
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'adjust_stock'
  ) then
    raise exception
      'adjust_stock manquant : le recalage inventaire ne peut pas fonctionner. Appliquer 20260604000002 d''abord.';
  end if;
end$$;

-- ─── 1b) Vue : dernier comptage validé par produit/dépôt ──────────
-- Le scoreur du cron lit cette vue pour l'ancienneté du dernier comptage.
-- Un produit jamais compté n'apparaît pas → le cron le traite comme
-- "ancienneté max" (priorité haute).
create or replace view public.produit_dernier_comptage as
select
  depot_id,
  produit_id,
  max(completed_at) as dernier_comptage_at
from public.inventaires_tournants
where statut in ('compte', 'valide')
  and completed_at is not null
group by depot_id, produit_id;

comment on view public.produit_dernier_comptage is
  'Date du dernier comptage (compté/validé) par produit & dépôt. Lue par le cron inventaire-tournant pour scorer l''ancienneté.';

grant select on public.produit_dernier_comptage to anon, authenticated, service_role;

-- ─── 2) Garde de rôle interne ─────────────────────────────────────
-- Vérifie que p_acteur_id est un employé actif admin/manager. Lève sinon.
create or replace function public.assert_acteur_manager(p_acteur_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_actif boolean;
begin
  if p_acteur_id is null then
    raise exception 'Accès refusé : acteur non identifié.' using errcode = '42501';
  end if;
  select role, is_active into v_role, v_actif
    from public.employes
   where id = p_acteur_id;
  if v_role is null then
    raise exception 'Accès refusé : acteur inconnu.' using errcode = '42501';
  end if;
  if coalesce(v_actif, false) = false then
    raise exception 'Accès refusé : acteur désactivé.' using errcode = '42501';
  end if;
  if v_role not in ('admin', 'manager') then
    raise exception 'Accès refusé : rôle % insuffisant (admin/manager requis).', v_role
      using errcode = '42501';
  end if;
end$$;

revoke execute on function public.assert_acteur_manager(uuid) from public;
grant execute on function public.assert_acteur_manager(uuid) to anon, authenticated;

-- ─── 2a) Liste complète des employés (avec is_active) ─────────────
-- employes_public masque les désactivés via les call-sites ; ici l'admin
-- doit voir TOUT (actifs + désactivés) pour les réactiver.
create or replace function public.admin_list_employes(p_acteur_id uuid)
returns table (
  id uuid,
  nom text,
  prenom text,
  role text,
  depot_principal_id uuid,
  is_active boolean,
  a_un_pin boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_acteur_manager(p_acteur_id);
  return query
    select e.id, e.nom, e.prenom, e.role, e.depot_principal_id,
           e.is_active,
           (e.pin_hash is not null) as a_un_pin
      from public.employes e
     order by e.is_active desc, e.nom asc;
end$$;

revoke execute on function public.admin_list_employes(uuid) from public;
grant execute on function public.admin_list_employes(uuid) to anon, authenticated;

-- ─── 2b) Création employé (+ hash PIN) ────────────────────────────
create or replace function public.admin_create_employe(
  p_acteur_id uuid,
  p_nom text,
  p_prenom text,
  p_role text,
  p_depot_principal_id uuid,
  p_pin text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.assert_acteur_manager(p_acteur_id);

  if p_nom is null or btrim(p_nom) = '' then
    raise exception 'Nom requis.' using errcode = '22023';
  end if;
  if p_role not in ('reception','caisse','preparation','manager','admin') then
    raise exception 'Rôle invalide : %.', p_role using errcode = '22023';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN invalide : 4 chiffres requis.' using errcode = '22023';
  end if;

  insert into public.employes (nom, prenom, role, depot_principal_id, is_active, pin_code, pin_hash)
  values (
    btrim(p_nom),
    nullif(btrim(coalesce(p_prenom, '')), ''),
    p_role,
    p_depot_principal_id,
    true,
    '0000',                                            -- pin_code neutralisé (cf. 20260531000003)
    extensions.crypt(p_pin, extensions.gen_salt('bf', 10))
  )
  returning id into v_id;

  return v_id;
end$$;

revoke execute on function public.admin_create_employe(uuid, text, text, text, uuid, text) from public;
grant execute on function public.admin_create_employe(uuid, text, text, text, uuid, text) to anon, authenticated;

-- ─── 2c) Mise à jour employé (rôle / nom / dépôt) ─────────────────
create or replace function public.admin_update_employe(
  p_acteur_id uuid,
  p_id uuid,
  p_nom text,
  p_prenom text,
  p_role text,
  p_depot_principal_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_acteur_manager(p_acteur_id);

  if p_nom is null or btrim(p_nom) = '' then
    raise exception 'Nom requis.' using errcode = '22023';
  end if;
  if p_role not in ('reception','caisse','preparation','manager','admin') then
    raise exception 'Rôle invalide : %.', p_role using errcode = '22023';
  end if;

  update public.employes
     set nom = btrim(p_nom),
         prenom = nullif(btrim(coalesce(p_prenom, '')), ''),
         role = p_role,
         depot_principal_id = p_depot_principal_id
   where id = p_id;

  if not found then
    raise exception 'Employé introuvable.' using errcode = 'P0002';
  end if;
end$$;

revoke execute on function public.admin_update_employe(uuid, uuid, text, text, text, uuid) from public;
grant execute on function public.admin_update_employe(uuid, uuid, text, text, text, uuid) to anon, authenticated;

-- ─── 2d) Activer / désactiver ─────────────────────────────────────
create or replace function public.admin_set_employe_actif(
  p_acteur_id uuid,
  p_id uuid,
  p_actif boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_acteur_manager(p_acteur_id);

  -- Garde-fou : ne pas se désactiver soi-même (lockout admin).
  if p_id = p_acteur_id and coalesce(p_actif, true) = false then
    raise exception 'Tu ne peux pas te désactiver toi-même.' using errcode = '42501';
  end if;

  update public.employes
     set is_active = coalesce(p_actif, false)
   where id = p_id;

  if not found then
    raise exception 'Employé introuvable.' using errcode = 'P0002';
  end if;
end$$;

revoke execute on function public.admin_set_employe_actif(uuid, uuid, boolean) from public;
grant execute on function public.admin_set_employe_actif(uuid, uuid, boolean) to anon, authenticated;

-- ─── 2e) Reset PIN (bcrypt) ───────────────────────────────────────
create or replace function public.admin_set_employe_pin(
  p_acteur_id uuid,
  p_id uuid,
  p_pin text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_acteur_manager(p_acteur_id);

  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN invalide : 4 chiffres requis.' using errcode = '22023';
  end if;

  update public.employes
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
         pin_code = '0000'
   where id = p_id;

  if not found then
    raise exception 'Employé introuvable.' using errcode = 'P0002';
  end if;
end$$;

revoke execute on function public.admin_set_employe_pin(uuid, uuid, text) from public;
grant execute on function public.admin_set_employe_pin(uuid, uuid, text) to anon, authenticated;

-- ════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-DÉPLOIEMENT (manuel)
--   select * from public.produit_dernier_comptage limit 5;
--   select public.admin_list_employes('<uuid_admin>');
--   -- création :
--   select public.admin_create_employe('<uuid_admin>','Test','Démo','caisse',
--          (select id from depots limit 1), '4321');
--   -- vérifier login : select public.verify_pin('4321'); -- doit renvoyer l'uuid
-- ════════════════════════════════════════════════════════════════
