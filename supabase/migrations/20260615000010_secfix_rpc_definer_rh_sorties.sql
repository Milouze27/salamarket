-- =====================================================================
-- SÉCURITÉ #3 / Mission 4 — Router les mutations RH & sorties par des
-- RPC SECURITY DEFINER, prérequis à la fermeture de l'écriture anon
-- (migration 20260615000020).
--
-- Contexte : la clé anon est dans le bundle client (auth PIN custom, pas
-- de session Supabase). Tant que pointages / shifts / sorties_stock
-- acceptaient l'écriture anon directe (policy `anon_all` du hotfix vague 7),
-- un tiers pouvait altérer la paie ou blanchir une sortie suspecte.
--
-- Pattern maison (cf. adjust_stock, transfer_stock, verify_pin, stock_ledger)
-- : RLS en LECTURE anon ouverte, ÉCRITURE via RPC SECURITY DEFINER bornés,
-- avec garde de rôle `assert_acteur_manager` pour les actions sensibles.
--
-- APPEND-ONLY : on ne modifie aucune migration existante.
-- =====================================================================

-- ─── 1) Pointage kiosk : check-in / check-out en SECURITY DEFINER ────
-- Les helpers existants (20260530000007) étaient en SECURITY INVOKER :
-- ils écrivaient pointages avec les droits anon. Fermer l'écriture anon
-- les casserait. On bascule juste le mode (corps inchangé) → ils écrivent
-- désormais avec les droits owner, donc survivent à la fermeture.
alter function public.pointage_check_in(uuid, uuid, text) security definer;
alter function public.pointage_check_in(uuid, uuid, text) set search_path = public;
alter function public.pointage_check_out(uuid) security definer;
alter function public.pointage_check_out(uuid) set search_path = public;

grant execute on function public.pointage_check_in(uuid, uuid, text)
  to anon, authenticated, service_role;
grant execute on function public.pointage_check_out(uuid)
  to anon, authenticated, service_role;

-- ─── 2) Correction admin d'un pointage (arrivée / départ) ───────────
-- Remplace l'UPDATE direct anon de lib/db/pointage.ts:updatePointage.
-- Réservé admin/manager. duree_travaillee_min est une colonne générée :
-- Postgres la recalcule, on ne l'écrit pas.
create or replace function public.pointage_corriger(
  p_acteur_id uuid,
  p_id        uuid,
  p_check_in  timestamptz,
  p_check_out timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_acteur_manager(p_acteur_id);
  update public.pointages
     set check_in   = p_check_in,
         check_out  = p_check_out,
         updated_at = now()
   where id = p_id;
  if not found then
    raise exception 'Pointage % introuvable.', p_id using errcode = 'P0002';
  end if;
end$$;

revoke execute on function public.pointage_corriger(uuid, uuid, timestamptz, timestamptz) from public;
grant execute on function public.pointage_corriger(uuid, uuid, timestamptz, timestamptz)
  to anon, authenticated;

-- ─── 3) Modération d'une sortie suspecte (accept / reject / clarifier) ─
-- Remplace les 3 UPDATE directs anon de v2/admin/alertes/page.tsx.
-- Réservé admin/manager. La note est formatée côté client (préfixe +
-- prénom + date), on ne fait ici que persister le verdict.
--   accept    → score 1.0  (sort du filtre lt(0.7)) + note
--   reject    → score 0.99 (sort du filtre)         + note
--   clarifier → note seule (la sortie reste flaggée)
create or replace function public.moderer_sortie(
  p_acteur_id uuid,
  p_sortie_id uuid,
  p_action    text,
  p_note      text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_acteur_manager(p_acteur_id);
  if p_action not in ('accept', 'reject', 'clarifier') then
    raise exception 'Action de modération invalide : %.', p_action using errcode = '22023';
  end if;

  if p_action = 'accept' then
    update public.sorties_stock
       set ia_coherence_score = 1.0,
           ia_coherence_notes = left(p_note, 500)
     where id = p_sortie_id;
  elsif p_action = 'reject' then
    update public.sorties_stock
       set ia_coherence_score = 0.99,
           ia_coherence_notes = left(p_note, 500)
     where id = p_sortie_id;
  else -- clarifier
    update public.sorties_stock
       set ia_coherence_notes = left(p_note, 500)
     where id = p_sortie_id;
  end if;

  if not found then
    raise exception 'Sortie % introuvable.', p_sortie_id using errcode = 'P0002';
  end if;
end$$;

revoke execute on function public.moderer_sortie(uuid, uuid, text, text) from public;
grant execute on function public.moderer_sortie(uuid, uuid, text, text)
  to anon, authenticated;

-- ─── 4) Enregistrement atomique d'une sortie (casse / sortie) ───────
-- Remplace l'orchestration insert + adjust_stock + rollback-DELETE de
-- lib/db/index.ts:createSortie. Tout est dans une seule transaction :
-- si le décrément stock échoue, l'insert (et le consume_lot FEFO) sont
-- annulés automatiquement — plus de compensation DELETE manuelle.
-- Pas de garde manager : tout employé peut enregistrer une casse (action
-- métier normale), mais il ne peut plus que CRÉER une sortie via ce RPC,
-- jamais UPDATE/DELETE arbitraire (c'était la faille #14).
create or replace function public.creer_sortie(
  p_depot_id       uuid,
  p_employe_id     uuid,
  p_produit_id     uuid,
  p_type           text,
  p_quantite       numeric,
  p_photo_url      text,
  p_type_mouvement text,            -- 'casse' | 'sortie' (pour adjust_stock)
  p_motif_libre    text default null,
  p_ia_score       numeric default null,
  p_ia_notes       text default null
)
returns public.sorties_stock
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot_id text;
  v_row    public.sorties_stock;
begin
  if p_type_mouvement not in ('casse', 'sortie') then
    raise exception 'Type de mouvement invalide : %.', p_type_mouvement using errcode = '22023';
  end if;

  -- FEFO : décrémente le lot le plus proche de la DLC (non bloquant : un
  -- produit sans lots suivis renvoie null, la sortie reste valide).
  v_lot_id := public.consume_lot_fefo(p_produit_id, p_quantite, p_depot_id);

  insert into public.sorties_stock
    (depot_id, employe_id, produit_id, type, motif_libre, quantite,
     photo_url, ia_coherence_score, ia_coherence_notes, lot_id)
  values
    (p_depot_id, p_employe_id, p_produit_id, p_type, p_motif_libre, p_quantite,
     p_photo_url, p_ia_score, p_ia_notes, v_lot_id)
  returning * into v_row;

  -- Décrément stock atomique (verrou ligne + ledger). Si ça lève, toute la
  -- transaction (insert + consume_lot) est annulée.
  perform public.adjust_stock(
    p_produit_id, p_depot_id, -p_quantite, p_type_mouvement,
    v_lot_id, v_row.id::text, p_employe_id
  );

  return v_row;
end$$;

revoke execute on function public.creer_sortie(uuid, uuid, uuid, text, numeric, text, text, text, numeric, text) from public;
grant execute on function public.creer_sortie(uuid, uuid, uuid, text, numeric, text, text, text, numeric, text)
  to anon, authenticated;

notify pgrst, 'reload schema';
