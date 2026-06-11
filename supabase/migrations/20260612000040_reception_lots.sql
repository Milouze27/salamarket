-- ────────────────────────────────────────────────────────────────
-- 20260612000040 — Réception → LOT halal (V5-reception-lot-halal)
--
-- À la validation d'une réception (BDL), on crée un LOT halal :
-- DLC + date d'abattage + abattoir + certificat AVS + n° lot
-- fournisseur. Ce lot alimente :
--   • FEFO (consume_lot_fefo lit produits_lots.dlc),
--   • les alertes DLC (v_dlc_alerts),
--   • le passeport QR public (/lot/:id sur Drive).
--
-- La table `produits_lots` existe déjà (20260530000000_lots_traceability).
-- Ici on l'enrichit, de façon APPEND-ONLY et idempotente, des colonnes
-- nécessaires au rattachement réception ↔ dépôt ↔ BDL :
--   • depot_id      : où le lot est physiquement entré (FEFO par dépôt),
--   • bdl_id        : traçabilité vers le bon de livraison d'origine,
--   • created_by    : employé qui a validé la réception.
--
-- Les colonnes métier halal (certifier_*, abattoir_*, date_abattage,
-- dlc, ddm, supplier_lot, quantite_recue) existent déjà : on ne les
-- recrée pas.
--
-- Idempotent : safe à rejouer.
-- ────────────────────────────────────────────────────────────────

-- Rattachement physique : dépôt d'entrée du lot (FEFO consomme par dépôt).
alter table public.produits_lots
  add column if not exists depot_id uuid references public.depots(id);

-- Traçabilité : bon de livraison à l'origine du lot.
alter table public.produits_lots
  add column if not exists bdl_id uuid references public.bons_de_livraison(id) on delete set null;

-- Qui a validé la réception qui a créé ce lot.
alter table public.produits_lots
  add column if not exists created_by uuid references public.employes(id);

-- Index FEFO par produit + dépôt + DLC (consume_lot_fefo + alertes).
create index if not exists idx_produits_lots_produit_depot
  on public.produits_lots(produit_id, depot_id)
  where depot_id is not null;

create index if not exists idx_produits_lots_bdl
  on public.produits_lots(bdl_id)
  where bdl_id is not null;

-- ─── Génération d'un id de lot lisible côté DB ─────────────────
-- L'app fournit déjà l'id (format L2026-06-XYZ). Cette fonction sert
-- de filet pour les inserts qui n'en passent pas : id stable, trié
-- temporellement, lisible sur un ticket.
--   Format : L{YYYY}-{MM}-{6 hex}
create or replace function public.generate_lot_id()
returns text
language sql
volatile
as $$
  select 'L'
    || to_char(now(), 'YYYY') || '-'
    || to_char(now(), 'MM') || '-'
    || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
$$;
