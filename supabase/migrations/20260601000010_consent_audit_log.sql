-- 20260601000010 — Conformité RGPD : journaux de consentement & d'audit
-- ─────────────────────────────────────────────────────────────────────────
-- Contexte (gap conformité, pré-démo 10 juin) :
--   Le Drive collecte des consentements (CGV, politique de confidentialité,
--   marketing optionnel) au signup et à la commande. Aucune trace horodatée
--   n'était persistée → impossible de prouver le recueil du consentement
--   (RGPD art. 7.1 « le responsable du traitement est en mesure de démontrer
--   que la personne a donné son consentement »).
--   De même, aucune piste d'audit des actions sensibles côté back-office.
--
-- Ce que fait cette migration :
--   1. Table public.consent_log  — 1 ligne par consentement recueilli.
--   2. Table public.audit_log    — 1 ligne par action sensible (écrite par le
--                                  serveur via service_role).
--   3. RLS :
--        consent_log → INSERT autorisé à anon (le signup est public, pas de
--                      session Supabase Auth au moment du consentement) ;
--                      SELECT réservé au service_role (les managers lisent via
--                      les routes serveur qui utilisent service_role).
--        audit_log   → INSERT réservé au service_role (jamais écrit côté
--                      client) ; SELECT réservé au service_role également.
--   4. Index : audit_log(created_at desc), consent_log(email).
--
-- Notes de sécurité :
--   - On NE donne PAS de SELECT anon/authenticated sur ces tables : elles
--     contiennent des PII (email, IP, user agent) et des traces d'actions.
--     Les pages manager passent par des routes /api serveur (service_role),
--     qui bypassent la RLS. C'est la « source de vérité » documentée dans
--     docs/operations/rls-source-of-truth.md.
--   - gen_random_uuid() vient de l'extension pgcrypto, déjà présente sur les
--     projets Supabase ; on la crée par sécurité (idempotent).
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- ── 1. Table consent_log ───────────────────────────────────────────────────
create table if not exists public.consent_log (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid,                         -- null si pas encore de compte
  email             text,
  consent_cgv       boolean not null,
  consent_privacy   boolean not null,
  consent_marketing boolean not null default false,
  ip                text,
  user_agent        text,
  created_at        timestamptz not null default now()
);

comment on table public.consent_log is
  'Journal horodaté des consentements (CGV, confidentialité, marketing). '
  'Preuve RGPD art. 7. INSERT anon (signup public), SELECT service_role only.';

create index if not exists idx_consent_log_email
  on public.consent_log (email);

create index if not exists idx_consent_log_created_at
  on public.consent_log (created_at desc);

-- ── 2. Table audit_log ─────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid,
  actor_role  text,
  action      text not null,
  table_name  text,
  record_id   text,
  details     jsonb,
  ip          text,
  created_at  timestamptz not null default now()
);

comment on table public.audit_log is
  'Piste d''audit des actions sensibles back-office. '
  'INSERT service_role only (jamais côté client), SELECT service_role only.';

create index if not exists idx_audit_log_created_at
  on public.audit_log (created_at desc);

create index if not exists idx_audit_log_action
  on public.audit_log (action);

-- ── 3. RLS ─────────────────────────────────────────────────────────────────
alter table public.consent_log enable row level security;
alter table public.audit_log   enable row level security;

-- consent_log : INSERT anon (signup public). Pas de USING (INSERT n'a pas de
-- clause USING) ; WITH CHECK (true) = toute insertion anon acceptée.
drop policy if exists "consent_log_insert_anon" on public.consent_log;
create policy "consent_log_insert_anon" on public.consent_log
  for insert to anon, authenticated
  with check (true);

-- consent_log : SELECT service_role only.
drop policy if exists "consent_log_select_service" on public.consent_log;
create policy "consent_log_select_service" on public.consent_log
  for select to service_role
  using (true);

-- consent_log : pas d'UPDATE/DELETE (immuable). service_role bypasse la RLS
-- de toute façon pour les rares purges RGPD (droit à l'effacement) via route
-- serveur dédiée.
drop policy if exists "consent_log_service_all" on public.consent_log;
create policy "consent_log_service_all" on public.consent_log
  for all to service_role
  using (true) with check (true);

-- audit_log : tout réservé au service_role (INSERT + SELECT + reste).
drop policy if exists "audit_log_service_all" on public.audit_log;
create policy "audit_log_service_all" on public.audit_log
  for all to service_role
  using (true) with check (true);

-- ── 4. GRANTS (defense in depth, en plus de la RLS) ────────────────────────
-- consent_log : anon/authenticated peuvent INSERT uniquement ; aucun SELECT.
revoke all on public.consent_log from anon, authenticated;
grant insert on public.consent_log to anon, authenticated;
grant all    on public.consent_log to service_role;

-- audit_log : rien pour anon/authenticated ; tout pour service_role.
revoke all on public.audit_log from anon, authenticated;
grant all  on public.audit_log to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Smoke tests (manuels) :
--   -- INSERT anon consent_log → 201
--   curl -X POST "$URL/rest/v1/consent_log" \
--     -H "apikey:<anon>" -H "Content-Type:application/json" \
--     -d '{"email":"t@t.fr","consent_cgv":true,"consent_privacy":true}'
--
--   -- SELECT anon audit_log → 401/permission denied
--   curl "$URL/rest/v1/audit_log?select=id" -H "apikey:<anon>"
--
--   -- SELECT anon consent_log → 401/permission denied (PII protégées)
--   curl "$URL/rest/v1/consent_log?select=id" -H "apikey:<anon>"
-- ─────────────────────────────────────────────────────────────────────────
