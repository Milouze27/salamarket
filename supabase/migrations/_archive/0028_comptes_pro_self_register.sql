-- =====================================================================
-- 0028_comptes_pro_self_register.sql
-- Permet à un utilisateur authentifié de créer son propre comptes_pro
-- via le formulaire /pro/inscription.
--
-- 0025 active la RLS sur comptes_pro et expose uniquement :
--   - comptes_pro_select_delegue   : SELECT pour le délégué
--   - comptes_pro_all_admin_manager: ALL pour admin/manager
-- → AUCUNE policy d'INSERT pour un utilisateur "lambda" authentifié.
--
-- Conséquence : signUp côté client réussit, puis l'INSERT dans
-- comptes_pro est bloqué silencieusement par RLS, et le formulaire
-- /pro/inscription affiche "Une erreur est survenue, réessayez".
--
-- Cette migration ajoute la policy manquante avec deux garde-fous :
--   1. delegue_user_id doit être égal à auth.uid() (pas d'usurpation)
--   2. statut doit être 'en_validation' (un user ne peut pas s'auto-valider)
-- =====================================================================

create policy "comptes_pro_insert_self"
  on public.comptes_pro for insert
  to authenticated
  with check (
    auth.uid() = delegue_user_id
    and statut = 'en_validation'
  );
