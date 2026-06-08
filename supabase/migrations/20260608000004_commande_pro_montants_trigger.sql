-- =====================================================================
-- 20260608000004 — Montants commande Pro calculés serveur + retrait de la
--                  policy UPDATE délégué (durcissement audit 2026-06-08)
--
-- Contexte : la migration 20260608000001 avait ajouté une policy UPDATE
-- pour le délégué (afin que le client puisse écrire montant_ht/tva/ttc après
-- l'INSERT). Mais son `with check` ne re-contraignait NI le statut NI les
-- colonnes → un délégué pouvait, en appelant PostgREST directement :
--   (1) faire passer sa commande de 'a_valider' à 'validee'/'payee'
--       (auto-validation : bypass du manager + du plafond de crédit Pro) ;
--   (2) réécrire les montants facturés à une valeur arbitraire.
--
-- Correctif propre : les montants d'une commande = SOMME de ses lignes
-- (commandes_pro_lignes.prix_ht_total est déjà une colonne générée). On les
-- recalcule donc par TRIGGER serveur (security definer) à chaque
-- INSERT/UPDATE/DELETE de ligne. Le client n'a plus aucune raison d'écrire
-- les montants → on SUPPRIME la policy UPDATE délégué. Surface d'escalade = 0
-- (le délégué ne garde que l'INSERT commande + lignes).
--
-- tva_taux est déjà posé par trg_set_ligne_tva_taux (BEFORE INSERT) → pas de
-- race avec ce trigger AFTER.
-- =====================================================================

-- 1. Recalcul des montants depuis les lignes ---------------------------
create or replace function public.recompute_commande_pro_montants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cmd uuid := coalesce(new.commande_pro_id, old.commande_pro_id);
  v_ht  numeric;
  v_tva numeric;
begin
  select
    coalesce(sum(prix_ht_total), 0),
    -- TVA arrondie par ligne (cohérent avec la ventilation de la facture PDF).
    coalesce(sum(round(prix_ht_total * coalesce(tva_taux, 0) / 100.0, 2)), 0)
  into v_ht, v_tva
  from public.commandes_pro_lignes
  where commande_pro_id = v_cmd;

  update public.commandes_pro
     set montant_ht  = v_ht,
         montant_tva = v_tva,
         montant_ttc = v_ht + v_tva
   where id = v_cmd;

  return null;
end$$;

drop trigger if exists trg_recompute_commande_pro_montants
  on public.commandes_pro_lignes;
create trigger trg_recompute_commande_pro_montants
  after insert or update or delete on public.commandes_pro_lignes
  for each row execute function public.recompute_commande_pro_montants();

-- 2. Retrait de la policy UPDATE délégué (escalade de privilège) --------
--    Le délégué ne doit plus pouvoir UPDATE commandes_pro du tout : les
--    montants sont calculés par le trigger ci-dessus, et le changement de
--    statut reste réservé au staff (policy ALL admin/manager de 0025).
drop policy if exists "delegue_update_commandes_pro" on public.commandes_pro;
