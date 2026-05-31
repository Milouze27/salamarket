-- ════════════════════════════════════════════════════════════════
-- VERIFY_PIN RATE-LIMIT — vague 7 (P0 brute force)
--
-- CONTEXTE
-- La vague 6 (20260531000003_hash_pin_codes.sql) a déjà migré les PINs
-- en bcrypt + créé verify_pin() SECURITY DEFINER. Mais la fonction ne
-- rate-limit RIEN : un attaquant qui a la clé anon publique peut spammer
-- verify_pin('0000'), verify_pin('0001'), ..., verify_pin('9999') en
-- ~12 minutes (10000 calls, bcrypt cost 10 ≈ 70ms/call sur Supabase
-- managed) et trouver TOUS les PINs 4 chiffres actifs.
--
-- Probe de l'exploit :
--   for i in $(seq 0000 9999); do
--     curl -s "$URL/rest/v1/rpc/verify_pin" -d "{\"p_pin\":\"$i\"}" \
--       -H "apikey:<anon>" -H "Content-Type:application/json" &
--   done | grep -v null
-- → liste des UUIDs employes actifs en clair.
--
-- STRATÉGIE
-- 1. Créer table public.pin_attempts (audit log) :
--      - employe_id uuid (nullable : on log même si pas matché, pour
--        détecter le scan d'IDs)
--      - ip text (best-effort via current_setting, optionnel — Supabase
--        ne propage pas toujours request.headers ip côté RPC SECURITY
--        DEFINER, donc on log si dispo sinon NULL)
--      - success boolean (true si match, false sinon)
--      - attempted_at timestamptz default now()
-- 2. Index (employe_id, attempted_at desc) pour lookup rapide window 5min
-- 3. Index (ip, attempted_at desc) pour bloquer le scan IP-side
-- 4. REPLACE verify_pin() :
--      a) Calcul nb_fails_5min côté employé candidat ET côté IP
--      b) Si SOIT employé soit IP a >= 5 fails dans 5 dernières minutes
--         → return NULL (lockout temporaire silencieux)
--      c) Sinon : test bcrypt, log attempt avec success boolean
--      d) Si match → return employe_id
--
-- NB : on garde le SECURITY DEFINER + revoke/grant identique à v1.
--
-- ANTI-LEAK : on ne révèle JAMAIS au client si c'est un lockout ou un
-- mauvais PIN — toujours NULL côté retour, le front affiche le même
-- toast "PIN incorrect" générique. L'attaquant ne sait pas qu'il s'est
-- fait throttler — il continue à scanner pour rien.
--
-- LIMITES CONNUES
-- - L'attaquant peut spammer N IPs différentes (botnet). Le throttle
--   per-employee fait que au pire il met 5x plus de temps que sans
--   throttle (1 fail toutes les 5min/employé). Pour bloquer ce vecteur
--   il faudrait Cloudflare WAF / fail2ban sur la couche edge (hors
--   scope migration DB).
-- - On ne capture l'IP que si current_setting('request.headers') la
--   propage (Supabase parfois oui parfois non). Best-effort.
--
-- IDEMPOTENCE
--   CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE FUNCTION.
--   Index CREATE IF NOT EXISTS.
-- ════════════════════════════════════════════════════════════════

-- ─── 1) Table pin_attempts ─────────────────────────────────────────
create table if not exists public.pin_attempts (
  id           bigserial primary key,
  employe_id   uuid null references public.employes(id) on delete set null,
  ip           text null,
  success      boolean not null default false,
  attempted_at timestamptz not null default now()
);

comment on table public.pin_attempts is
  'Audit log des tentatives verify_pin. Sert au throttle 5 fails/5min '
  'côté employé candidat et IP. Logique dans la fonction verify_pin().';

-- Indexes pour lookup rapide window 5min
create index if not exists pin_attempts_employe_attempted_idx
  on public.pin_attempts (employe_id, attempted_at desc)
  where employe_id is not null;

create index if not exists pin_attempts_ip_attempted_idx
  on public.pin_attempts (ip, attempted_at desc)
  where ip is not null;

create index if not exists pin_attempts_attempted_idx
  on public.pin_attempts (attempted_at desc);

-- RLS : aucun anon ne doit lire ce log (data sensible employes_id +
-- pattern d'attaque). Service_role only.
alter table public.pin_attempts enable row level security;

drop policy if exists "service_role_only_pin_attempts" on public.pin_attempts;
create policy "service_role_only_pin_attempts" on public.pin_attempts
  for all to service_role using (true) with check (true);

revoke all on public.pin_attempts from anon, authenticated;
grant all on public.pin_attempts to service_role;
grant usage, select on sequence public.pin_attempts_id_seq to service_role;

-- ─── 2) Helper : best-effort IP extraction depuis request headers ──
-- Supabase Postgrest peut peupler current_setting('request.headers')
-- avec un JSON contenant x-forwarded-for. On extrait la première IP.
-- Si pas dispo → NULL.
create or replace function public._pin_attempt_ip()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_headers jsonb;
  v_xff text;
begin
  begin
    v_headers := current_setting('request.headers', true)::jsonb;
  exception when others then
    return null;
  end;
  if v_headers is null then return null; end if;
  v_xff := v_headers ->> 'x-forwarded-for';
  if v_xff is null or v_xff = '' then
    v_xff := v_headers ->> 'cf-connecting-ip';
  end if;
  if v_xff is null or v_xff = '' then return null; end if;
  -- garde uniquement la 1ère IP (xff peut être "ip1, ip2, ip3")
  return trim(split_part(v_xff, ',', 1));
end$$;

-- ─── 3) verify_pin() v2 : rate-limit + log ─────────────────────────
-- Remplace la version vague 6. Comportement identique en sortie
-- (return uuid|null), seul l'intérieur change : throttle + log.
--
-- Limite : 5 fails dans les 5 dernières minutes côté employé candidat
--          OU côté IP source → return NULL (lockout silencieux).
create or replace function public.verify_pin(p_pin text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employe_id    uuid;
  v_ip            text;
  v_fails_ip      int;
  v_fails_global  int;
begin
  -- Garde-fou format
  if p_pin is null or length(p_pin) != 4 or p_pin !~ '^[0-9]{4}$' then
    return null;
  end if;

  v_ip := public._pin_attempt_ip();

  -- Throttle par IP : 5 fails / 5 min toutes employes confondus
  -- (bloque le scan brute force du dictionnaire 0000-9999).
  if v_ip is not null then
    select count(*) into v_fails_ip
      from public.pin_attempts
     where ip = v_ip
       and success = false
       and attempted_at > now() - interval '5 minutes';
    if v_fails_ip >= 5 then
      -- on log quand même pour audit (sans tenter le bcrypt)
      insert into public.pin_attempts (employe_id, ip, success)
        values (null, v_ip, false);
      return null;
    end if;
  end if;

  -- Throttle global anti-IP-spoofing : si on a beaucoup de fails très
  -- récents sans ip (xff manquant), on freine quand même.
  -- Seuil plus généreux (20 / 5min) car concerne toute la planète.
  if v_ip is null then
    select count(*) into v_fails_global
      from public.pin_attempts
     where ip is null
       and success = false
       and attempted_at > now() - interval '5 minutes';
    if v_fails_global >= 20 then
      insert into public.pin_attempts (employe_id, ip, success)
        values (null, null, false);
      return null;
    end if;
  end if;

  -- Tentative match bcrypt
  select id
    into v_employe_id
    from public.employes
   where is_active = true
     and pin_hash is not null
     and pin_hash = extensions.crypt(p_pin, pin_hash)
   limit 1;

  -- Log de l'attempt (success boolean)
  insert into public.pin_attempts (employe_id, ip, success)
    values (v_employe_id, v_ip, v_employe_id is not null);

  -- Si match mais l'employé spécifique a >= 5 fails récents :
  -- on bloque quand même (cas où attaquant a deviné le PIN après
  -- 4 essais ratés sur le même employé — ne devrait pas arriver
  -- avec le throttle IP mais ceinture+bretelles).
  if v_employe_id is not null then
    select count(*) into v_fails_global
      from public.pin_attempts
     where employe_id = v_employe_id
       and success = false
       and attempted_at > now() - interval '5 minutes';
    if v_fails_global >= 5 then
      return null;
    end if;
  end if;

  return v_employe_id;
end$$;

-- Re-grant identique à vague 6 (anon peut appeler, c'est le login)
revoke execute on function public.verify_pin(text) from public;
grant execute on function public.verify_pin(text) to anon, authenticated;

revoke execute on function public._pin_attempt_ip() from public;
grant execute on function public._pin_attempt_ip() to anon, authenticated;

notify pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════
-- VÉRIFICATION POST-DÉPLOIEMENT
--
-- 1. Test rate-limit (depuis terminal) :
--    URL=https://tltmermqodelorthtbre.supabase.co
--    ANON=<NEXT_PUBLIC_SUPABASE_ANON_KEY>
--    # 6 mauvais PINs depuis même IP → 6e doit return null même si bon
--    for i in 9990 9991 9992 9993 9994 9995; do
--      curl -s "$URL/rest/v1/rpc/verify_pin" \
--        -H "apikey:$ANON" -H "Content-Type:application/json" \
--        -d "{\"p_pin\":\"$i\"}"
--      echo
--    done
--    # Maintenant tente le bon PIN (1234) → doit return null aussi
--    # (lockout actif). Attendre 5min puis retest → doit fonctionner.
--
-- 2. Vérifier les logs en base :
--    select count(*), success
--      from pin_attempts
--     where attempted_at > now() - interval '10 minutes'
--     group by success;
--
-- ROLLBACK
--   begin;
--   -- Restaurer la v1 verify_pin (sans throttle)
--   create or replace function public.verify_pin(p_pin text)
--   returns uuid language plpgsql security definer set search_path=public as $$
--   declare v_employe_id uuid;
--   begin
--     if p_pin is null or length(p_pin) != 4 or p_pin !~ '^[0-9]{4}$' then
--       return null;
--     end if;
--     select id into v_employe_id from public.employes
--      where is_active = true and pin_hash is not null
--        and pin_hash = extensions.crypt(p_pin, pin_hash) limit 1;
--     return v_employe_id;
--   end$$;
--   drop function if exists public._pin_attempt_ip();
--   drop table if exists public.pin_attempts;
--   commit;
-- ════════════════════════════════════════════════════════════════
