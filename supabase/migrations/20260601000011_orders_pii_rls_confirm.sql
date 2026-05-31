-- 20260601000011 — PII des commandes Drive : vue anon-safe + confirmation RLS
-- ─────────────────────────────────────────────────────────────────────────
-- Contexte (gap sec-rls-source-of-truth, pré-démo 10 juin) :
--   La vague 6 (20260531000002_lockdown_rls.sql) avait fermé les writes anon,
--   puis la vague 7 / hotfix (20260531000020_hotfix_rls_reopen_stock.sql) a
--   ré-ouvert TEMPORAIREMENT `anon SELECT + ALL using(true)` sur les tables
--   Stock — dont commandes_drive & commandes_drive_lignes — pour débloquer la
--   PWA Stock qui interroge Supabase avec la clé anon publique (pas de session
--   Supabase Auth côté serveur Stock à ce stade).
--
--   Problème : commandes_drive contient des PII clients (email, téléphone, nom,
--   adresse). `anon SELECT using(true)` signifie que quiconque possède la clé
--   anon publiée dans le bundle Drive peut lire TOUTES les PII de TOUTES les
--   commandes. C'est trop large.
--
-- Réalité opérationnelle (contrainte SAFE pré-démo) :
--   - Le kanban Stock (apps/stock) lit commandes_drive en anon, SANS auth
--     serveur. On ne PEUT donc pas révoquer le SELECT anon sans casser Stock.
--   - Re-câbler Stock sur service_role server-side est un chantier > budget et
--     RISQUÉ à 10 jours de la démo. → reporté post-démo (voir doc).
--
-- Compromis retenu (SAFE, additif, non destructif) :
--   1. Créer une VUE publique `commandes_drive_safe` qui expose les colonnes
--      utiles au kanban (statut, dépôt, créneau, montant, n° commande, dates)
--      MAIS PAS les colonnes PII en clair (email/téléphone/nom/adresse). La vue
--      est construite dynamiquement à partir des colonnes réelles de la table,
--      en EXCLUANT une denylist PII → robuste quel que soit le schéma exact.
--   2. La table complète commandes_drive reste accessible au service_role
--      (routes serveur, exports manager) — service_role bypasse la RLS.
--   3. On NE TOUCHE PAS aux policies/grants anon existants sur la table
--      commandes_drive (poser un revoke casserait Stock maintenant). La vue est
--      l'amorce de migration : quand Stock basculera sur la vue (ou sur
--      service_role), on révoquera le SELECT anon sur la table. Le plan est
--      codifié dans docs/operations/rls-source-of-truth.md.
--
--   ⇒ Cette migration est NON destructive : elle AJOUTE une vue + des grants
--     dessus, sans retirer d'accès existant. Aucun risque de casser Stock.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. Vue anon-safe construite dynamiquement (denylist PII) ───────────────
-- On liste les colonnes de public.commandes_drive en excluant toute colonne
-- dont le nom évoque une PII en clair. security_invoker=on pour que la vue
-- respecte les droits de l'appelant (Postgres 15+ / Supabase OK).
do $$
declare
  v_cols    text;
  v_denylist text[] := array[
    'client_email', 'client_telephone', 'client_tel', 'client_phone',
    'client_nom', 'client_prenom', 'client_nom_complet', 'client_fullname',
    'client_adresse', 'client_address', 'adresse', 'adresse_livraison',
    'email', 'telephone', 'phone', 'nom', 'prenom',
    'notes_client', 'commentaire_client'
  ];
begin
  -- La table doit exister, sinon on ne fait rien (idempotence défensive).
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'commandes_drive'
  ) then
    raise notice 'commandes_drive absente — vue non créée';
    return;
  end if;

  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
    into v_cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name   = 'commandes_drive'
    and column_name <> all (v_denylist);

  if v_cols is null then
    raise notice 'aucune colonne non-PII trouvée — vue non créée';
    return;
  end if;

  execute format(
    'create or replace view public.commandes_drive_safe '
    'with (security_invoker = on) as select %s from public.commandes_drive',
    v_cols
  );
end $$;

comment on view public.commandes_drive_safe is
  'Vue anon-safe de commandes_drive : expose les colonnes non-PII (statut, '
  'dépôt, créneau, montants, n° commande, dates) pour le kanban Stock. '
  'EXCLUT email/téléphone/nom/adresse en clair. Source de vérité RLS : '
  'docs/operations/rls-source-of-truth.md. Cible post-démo : Stock bascule '
  'sur cette vue (ou service_role server-side) puis revoke SELECT anon sur '
  'la table commandes_drive.';

-- Grants sur la vue : lecture anon + authenticated (kanban public Stock).
grant select on public.commandes_drive_safe to anon, authenticated;

-- ── 2. Confirmation RLS sur les tables (état actuel = documenté, non modifié) ─
-- On RÉAFFIRME explicitement que la RLS est activée (idempotent ; la table
-- l'a déjà depuis la vague 6). On NE recrée PAS la policy anon SELECT large :
-- elle existe déjà via le hotfix et la retirer casserait Stock. On se contente
-- de garantir que service_role a bien un accès complet (filet, au cas où un
-- revoke trop large aurait été appliqué ailleurs).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'commandes_drive'
  ) then
    execute 'alter table public.commandes_drive enable row level security';
    execute 'drop policy if exists "commandes_drive_service_all" on public.commandes_drive';
    execute 'create policy "commandes_drive_service_all" on public.commandes_drive '
            'for all to service_role using (true) with check (true)';
    execute 'grant all on public.commandes_drive to service_role';
  end if;

  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'commandes_drive_lignes'
  ) then
    execute 'alter table public.commandes_drive_lignes enable row level security';
    execute 'drop policy if exists "commandes_drive_lignes_service_all" on public.commandes_drive_lignes';
    execute 'create policy "commandes_drive_lignes_service_all" on public.commandes_drive_lignes '
            'for all to service_role using (true) with check (true)';
    execute 'grant all on public.commandes_drive_lignes to service_role';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- IMPORTANT — ce qui N'EST PAS fait ici (volontairement, SAFE pré-démo) :
--   - PAS de `revoke select ... from anon` sur commandes_drive : casserait le
--     kanban Stock (lecture anon). Reporté post-démo.
--   - PAS de re-câblage Stock sur service_role : chantier post-démo.
--   Le plan complet (table × policy actuelle × cible × raison) est dans
--   docs/operations/rls-source-of-truth.md.
--
-- Smoke tests (manuels) :
--   -- Vue anon-safe lisible par anon, SANS PII :
--   curl "$URL/rest/v1/commandes_drive_safe?select=*&limit=1" -H "apikey:<anon>"
--     → 200, et le JSON ne contient PAS client_email / client_telephone.
-- ─────────────────────────────────────────────────────────────────────────
