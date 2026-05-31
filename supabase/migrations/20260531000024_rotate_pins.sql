-- ════════════════════════════════════════════════════════════════
-- ROTATE STAFF PINS — 6-digit non-séquentiel (vague 7, P0 post-démo)
--
-- ⚠️  CETTE MIGRATION EST DEMO-GATED : par défaut elle ne fait RIEN.
-- ⚠️  Pour la démo du 10 juin 2026 le user veut garder les PINs lisibles
-- ⚠️  1234/5678/9999 affichés via NEXT_PUBLIC_SHOW_DEMO_PINS=true
-- ⚠️  (cf. /v2/login/page.tsx).
--
-- POURQUOI GATED PAR DÉFAUT ?
-- Pour que `supabase db push --include-all` puisse pousser sans casser
-- la démo. La migration est inscrite dans supabase_migrations comme
-- "appliquée" mais ses effets (UPDATE pin_hash + élargissement format)
-- sont court-circuités via un GUC de session.
--
-- COMMENT L'ACTIVER POST-DÉMO ?
-- Dans une session SQL (psql ou Supabase Studio), avant d'appliquer :
--   SET app.rotate_pins_acknowledged = true;
-- Puis copier-coller le contenu de cette migration. Les UPDATE + le
-- replace function s'exécutent. Ne PAS oublier de re-déployer le front
-- /v2/login avec un keypad 6 chiffres au préalable (voir
-- docs/operations/pins.md pour le patch front).
--
-- CONTEXTE
-- La vague 6 (20260531000003_hash_pin_codes.sql) a migré les PINs en
-- bcrypt mais les PINs eux-mêmes restent 4 chiffres triviaux :
--   - Otmane (admin) : 1234
--   - Ilyes (préparation) : 5678
--   - Ahmed (admin) : 9999
-- Même AVEC le rate-limit vague 7 (000023), ces PINs sont trouvables.
-- Pour la prod réelle post-démo on passe à 6 chiffres non-séquentiels.
--
-- IDÉMPOTENCE
-- UPDATE est idempotent (re-run = même hash bcrypt → no-op effectif).
-- CREATE OR REPLACE FUNCTION idem.
-- ════════════════════════════════════════════════════════════════

-- ─── Exécution gated par GUC de session ────────────────────────────
-- Tout est dans un DO unique pour pouvoir court-circuiter avec un
-- early return. Les CREATE FUNCTION sont émis via EXECUTE.
do $$
declare
  v_ack boolean;
begin
  v_ack := coalesce(current_setting('app.rotate_pins_acknowledged', true)::boolean, false);

  if not v_ack then
    raise notice 'PIN rotation SKIPPED (demo-gated). Set app.rotate_pins_acknowledged=true to apply. See docs/operations/pins.md';
    return;
  end if;

  -- ─────────────────────────────────────────────────────────────────
  -- À PARTIR D'ICI : ack=true, on applique réellement la rotation.
  -- ─────────────────────────────────────────────────────────────────

  -- 1) Élargir le format verify_pin à 4 OU 6 chiffres (transition).
  --    Code de la fonction reprend la logique throttle vague 7 (000023)
  --    à l'identique. EXECUTE pour pouvoir faire CREATE OR REPLACE.
  execute $func$
    create or replace function public.verify_pin(p_pin text)
    returns uuid
    language plpgsql
    security definer
    set search_path = public
    as $body$
    declare
      v_employe_id    uuid;
      v_ip            text;
      v_fails_ip      int;
      v_fails_global  int;
    begin
      if p_pin is null then return null; end if;
      if length(p_pin) not in (4, 6) then return null; end if;
      if p_pin !~ '^[0-9]+$' then return null; end if;

      v_ip := public._pin_attempt_ip();

      if v_ip is not null then
        select count(*) into v_fails_ip
          from public.pin_attempts
         where ip = v_ip and success = false
           and attempted_at > now() - interval '5 minutes';
        if v_fails_ip >= 5 then
          insert into public.pin_attempts (employe_id, ip, success)
            values (null, v_ip, false);
          return null;
        end if;
      end if;

      if v_ip is null then
        select count(*) into v_fails_global
          from public.pin_attempts
         where ip is null and success = false
           and attempted_at > now() - interval '5 minutes';
        if v_fails_global >= 20 then
          insert into public.pin_attempts (employe_id, ip, success)
            values (null, null, false);
          return null;
        end if;
      end if;

      select id into v_employe_id
        from public.employes
       where is_active = true
         and pin_hash is not null
         and pin_hash = extensions.crypt(p_pin, pin_hash)
       limit 1;

      insert into public.pin_attempts (employe_id, ip, success)
        values (v_employe_id, v_ip, v_employe_id is not null);

      if v_employe_id is not null then
        select count(*) into v_fails_global
          from public.pin_attempts
         where employe_id = v_employe_id and success = false
           and attempted_at > now() - interval '5 minutes';
        if v_fails_global >= 5 then return null; end if;
      end if;

      return v_employe_id;
    end$body$
  $func$;

  -- 2) UPDATE pin_hash pour les 3 employés démo.
  --    PINs proposés (non triviaux, hors top 1000 PIN lists publiques) :
  --      - Otmane : 728341
  --      - Ilyes  : 519604
  --      - Ahmed  : 836275
  update public.employes
     set pin_hash = extensions.crypt('728341', extensions.gen_salt('bf', 10))
   where id = '93274b0c-9c91-44c3-ae9a-e08f58ee6a41'
     and is_active = true;

  update public.employes
     set pin_hash = extensions.crypt('519604', extensions.gen_salt('bf', 10))
   where id = 'c44d758b-7cb3-486d-bc52-a1bacc628555'
     and is_active = true;

  update public.employes
     set pin_hash = extensions.crypt('836275', extensions.gen_salt('bf', 10))
   where id = 'b16789c3-daf6-41fe-916d-83bfa395ac3f'
     and is_active = true;

  -- 3) Re-grant identique à vague 6+7 (CREATE OR REPLACE garde les
  --    grants existants mais on les rejoue pour être robuste).
  execute 'revoke execute on function public.verify_pin(text) from public';
  execute 'grant execute on function public.verify_pin(text) to anon, authenticated';

  -- Schema reload pour que PostgREST découvre la nouvelle signature
  execute 'notify pgrst, ''reload schema''';

  raise notice 'PIN rotation APPLIED for Otmane/Ilyes/Ahmed (6-digit). Comm hors-bande requis.';
end$$;

-- ════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-DÉPLOIEMENT (uniquement si ack=true)
--
-- 1. Vérif côté DB :
--    select id, nom, prenom, length(pin_hash) from employes where is_active=true;
--    -- Tous les pin_hash doivent commencer par $2a$10$
--
-- 2. Tester depuis CLI (service_role) :
--    select verify_pin('728341');  -- doit retourner UUID Otmane
--    select verify_pin('1234');    -- doit retourner NULL (ancien PIN)
--
-- 3. Front /v2/login : doit avoir été migré keypad 4→6 avant l'apply,
--    sinon les staff ne peuvent plus se connecter.
--
-- ROLLBACK (sortie d'urgence)
--   set app.rotate_pins_acknowledged = true;
--   begin;
--   update employes set pin_hash = extensions.crypt('1234', extensions.gen_salt('bf', 10))
--     where id = '93274b0c-9c91-44c3-ae9a-e08f58ee6a41';
--   update employes set pin_hash = extensions.crypt('5678', extensions.gen_salt('bf', 10))
--     where id = 'c44d758b-7cb3-486d-bc52-a1bacc628555';
--   update employes set pin_hash = extensions.crypt('9999', extensions.gen_salt('bf', 10))
--     where id = 'b16789c3-daf6-41fe-916d-83bfa395ac3f';
--   commit;
--   -- Restaurer verify_pin format ^[0-9]{4}$ via re-apply 20260531000023.
-- ════════════════════════════════════════════════════════════════
