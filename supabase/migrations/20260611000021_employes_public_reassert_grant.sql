-- ════════════════════════════════════════════════════════════════
-- RÉ-ASSERTION GRANT employes_public — Session 3 FIX (ADM-01 / MGR2-01)
--
-- CONTEXTE
-- Le centre d'alertes (/v2/admin/alertes) et l'assistant IA chargeaient
-- les sorties suspectes via un JOIN PostgREST `employes(prenom,nom)`.
-- Depuis le lockdown PII (20260531000021_employes_public_view.sql), anon
-- n'a plus SELECT sur public.employes → le join renvoyait
-- « 401 permission denied for table employes » (code 42501) et faisait
-- échouer TOUTE la requête. Conséquence : faux « Aucune sortie suspecte ».
--
-- CORRECTIF PRINCIPAL = CÔTÉ APP (déjà appliqué)
--   - app/v2/admin/alertes/page.tsx : on ne joint plus `employes`, on lit
--     `employe_id` puis on résout les noms via la vue `employes_public`
--     (anon-safe, sans pin_hash). Un vrai état d'erreur remplace le faux
--     état vide.
--   - app/api/assistant/route.ts : bascule sur supabaseServer()
--     (service_role) — la route est server-only et gardée par
--     x-internal-secret.
--
-- POURQUOI PAS « GRANT SELECT ON public.employes TO anon »
-- C'est exactement ce que le lockdown PII a RÉVOQUÉ : ré-ouvrir anon sur
-- la table exposerait pin_hash (bcrypt offline-crackable), pin_code,
-- taux_horaire et observe_ramadan. On ne le fait donc PAS. La vue
-- employes_public est la bonne surface anon.
--
-- CE QUE FAIT CETTE MIGRATION (idempotent, défensif)
-- Ré-affirme que la vue employes_public existe avec les colonnes
-- attendues et que anon + authenticated ont bien SELECT dessus. Aucune
-- ouverture de PII : on n'ajoute AUCUN grant sur public.employes pour anon.
--
-- VOLET DONNÉES vs DDL
-- 100 % DDL idempotent (CREATE OR REPLACE VIEW + GRANT). À appliquer via
-- la CLI Supabase quand elle sera loggée. Le correctif fonctionnel ne
-- DÉPEND PAS de cette migration (le grant existe déjà en prod, vérifié au
-- service_role) — elle ne fait que verrouiller l'invariant pour les
-- environnements qui auraient dérivé.
-- ════════════════════════════════════════════════════════════════

create or replace view public.employes_public as
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
  'pin_code, taux_horaire, observe_ramadan. Utilisée par les apps côté '
  'client (anon key) pour résoudre les noms (ex. centre d''alertes). '
  'Pour les API routes serveur, utiliser public.employes via service_role.';

-- Invariant : anon + authenticated lisent la vue (jamais la table).
grant select on public.employes_public to anon, authenticated;

-- Garde-fou anti-régression : si une migration future ré-ouvrait anon sur
-- la table employes, ce REVOKE le referme. (No-op si déjà révoqué.)
revoke select on public.employes from anon;

notify pgrst, 'reload schema';
