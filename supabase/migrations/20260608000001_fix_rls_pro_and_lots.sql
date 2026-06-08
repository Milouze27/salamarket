-- =====================================================================
-- 20260608000001 — Correctifs RLS (audit 2026-06-08)
--
-- 1. commandes_pro / commandes_pro_lignes : ajoute les policies INSERT
--    (et UPDATE pour commandes_pro) manquantes pour le délégué d'un
--    compte Pro ACTIF. Sans elles, la validation de commande Pro échouait
--    TOUJOURS (RLS deny-by-default : seules SELECT délégué + ALL
--    admin/manager existaient). Le flux client fait INSERT commande →
--    INSERT lignes → UPDATE montants : il faut donc INSERT + UPDATE.
--
-- 2. produits_lots : retire la policy d'écriture anonyme 'anon_write_all'
--    (POC démo) qui permettait à n'importe quel client porteur de la clé
--    anon de FORGER ou MODIFIER un lot certifié halal (atteinte directe à
--    la traçabilité exposée sur /lot/:id). Aucune écriture applicative ne
--    passe par anon (toutes les références code sont des lectures) : les
--    écritures restent possibles via service-role (réception staff / seed).
--    La policy de lecture publique 'read_all' est conservée.
--
-- NB — HORS PÉRIMÈTRE ICI (volontairement) : les policies 'anon_all' sur
-- pointages/shifts (audit P0) ne sont PAS retirées. Le staff s'authentifie
-- par PIN sur la clé anon (pas de session Supabase, donc auth.uid() IS
-- NULL côté staff) : retirer l'accès anon casserait toute l'app staff. Le
-- correctif propre = router les écritures staff via service-role (server
-- actions), traité dans un lot dédié.
-- =====================================================================

-- 1a. commandes_pro : INSERT par le délégué d'un compte actif ----------
drop policy if exists "delegue_insert_commandes_pro" on public.commandes_pro;
create policy "delegue_insert_commandes_pro" on public.commandes_pro
  for insert to authenticated
  with check (
    exists (
      select 1 from public.comptes_pro cp
      where cp.id = compte_pro_id
        and cp.delegue_user_id = auth.uid()
        and cp.statut = 'actif'
    )
  );

-- 1b. commandes_pro : UPDATE de SA commande tant qu'elle est 'a_valider'
--     (le client écrit les montants ht/tva/ttc juste après l'INSERT).
drop policy if exists "delegue_update_commandes_pro" on public.commandes_pro;
create policy "delegue_update_commandes_pro" on public.commandes_pro
  for update to authenticated
  using (
    statut = 'a_valider'
    and exists (
      select 1 from public.comptes_pro cp
      where cp.id = compte_pro_id
        and cp.delegue_user_id = auth.uid()
        and cp.statut = 'actif'
    )
  )
  with check (
    exists (
      select 1 from public.comptes_pro cp
      where cp.id = compte_pro_id
        and cp.delegue_user_id = auth.uid()
        and cp.statut = 'actif'
    )
  );

-- 1c. commandes_pro_lignes : INSERT sur une commande appartenant au -----
--     délégué (compte actif).
drop policy if exists "delegue_insert_commandes_pro_lignes" on public.commandes_pro_lignes;
create policy "delegue_insert_commandes_pro_lignes" on public.commandes_pro_lignes
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.commandes_pro cmd
      join public.comptes_pro cp on cp.id = cmd.compte_pro_id
      where cmd.id = commande_pro_id
        and cp.delegue_user_id = auth.uid()
        and cp.statut = 'actif'
    )
  );

-- 2. produits_lots : supprime l'écriture anonyme (forgerie halal) ------
--    La lecture publique 'read_all' reste en place pour la page /lot/:id.
drop policy if exists "anon_write_all" on public.produits_lots;
