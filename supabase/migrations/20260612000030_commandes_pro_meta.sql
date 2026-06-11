-- =====================================================================
-- 20260612000030 — Bon de commande Pro : référence interne (PO client)
--
-- Le délégué Pro peut désormais joindre 3 métadonnées à sa commande au
-- moment de la passer depuis le panier Drive :
--   - une référence interne (numéro de bon de commande côté client) ;
--   - une date de livraison souhaitée ;
--   - une note libre.
--
-- date_livraison_souhaitee et notes_client EXISTENT DÉJÀ sur
-- commandes_pro (cf. _archive/0025_drive_pro.sql) → cette migration
-- n'ajoute QUE la colonne manquante ref_interne. Append-only : aucune
-- colonne existante n'est modifiée.
--
-- ref_interne est saisi librement par le client (texte court). Il n'est
-- ni unique ni contraint : c'est SA propre numérotation, pas la nôtre
-- (numero_commande reste la référence Salam Market).
-- =====================================================================

alter table public.commandes_pro
  add column if not exists ref_interne text;

comment on column public.commandes_pro.ref_interne is
  'Référence interne (numéro de bon de commande) saisie par le client Pro. Libre, non unique.';
