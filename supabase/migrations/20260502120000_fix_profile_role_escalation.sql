-- ─────────────────────────────────────────────────────────────────────
-- SECURITY FIX — ERROR #1 (Lovable Security Scan 2026-05-02)
-- Profile role escalation
-- ─────────────────────────────────────────────────────────────────────
--
-- Avant ce fix : la policy "profiles_update_own" autorisait n'importe
-- quel user authenticated à UPDATE sa propre ligne, y compris la colonne
-- 'role'. Un attaquant pouvait donc faire :
--
--   UPDATE profiles SET role='admin' WHERE id = auth.uid();
--
-- → take-over admin instantané (accès toutes commandes, gestion créneaux,
-- promotion d'autres comptes, etc.).
--
-- Fix en 2 niveaux de défense :
--   1. WITH CHECK qui force le NEW.role à rester égal au role courant
--      stocké en base (lu dans une sous-requête).
--   2. REVOKE UPDATE (role) au niveau colonne pour le rôle authenticated.
--      Si pour une raison inconnue le WITH CHECK échouait à s'évaluer
--      (bug PG futur, contournement RLS, etc.), le moteur Postgres lui-
--      même refuse la modification.
--
-- L'admin peut TOUJOURS modifier le rôle d'autres users via une edge
-- function utilisant SUPABASE_SERVICE_ROLE_KEY, qui bypasse RLS et
-- n'est pas concerné par les column grants sur authenticated.

drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select role from public.profiles where id = auth.uid())
  );

-- Defense in depth — column-level revoke. La REVOKE n'affecte que les
-- updates explicites sur cette colonne ; les UPDATEs sur full_name,
-- phone, email, updated_at restent autorisés (et passent par la policy
-- ci-dessus de toutes façons).
revoke update (role) on public.profiles from authenticated;

-- Vérification (à lancer manuellement post-migration) :
--   set role authenticated;
--   set request.jwt.claim.sub = '<un user uuid>';
--   update public.profiles set role='admin' where id='<un user uuid>';
--   → ERROR: new row violates row-level security policy
--                OR
--   → ERROR: permission denied for column role
