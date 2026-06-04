-- ════════════════════════════════════════════════════════════════
-- 20260604000010 — Idempotence import CashMag (ML-8)
--
-- CONTEXTE
-- La table public.ventes_cashmag_import (migrée _archive/0011) a une
-- contrainte d'unicité (numero_ticket, code_barre, designation, quantite).
-- PROBLÈME : code_barre est NULLABLE. En Postgres, NULL n'est jamais égal
-- à NULL dans une contrainte UNIQUE classique → deux lignes identiques
-- SANS code-barre passent toutes les deux. Réimporter le MÊME fichier
-- CashMag duplique alors les ventes sans code-barre → le CA magasin du
-- mois est gonflé. Otmane/Ahmed signent des chiffres faux.
--
-- CORRECTIF (à la SOURCE, pas en sparadrap TS)
--   1. Ajouter une colonne raw_hash text = sha256(raw_line) calculée à
--      l'import. Une ligne CashMag = une ligne CSV brute = un hash unique.
--   2. Backfill raw_hash sur l'existant via pgcrypto (même algo sha256 hex
--      que le TS côté route, donc cohérent).
--   3. Index UNIQUE sur raw_hash → un réimport = ON CONFLICT DO NOTHING.
--      NULL non concerné : raw_hash est calculé pour toute ligne ayant un
--      raw_line ; pour les (rares) lignes legacy sans raw_line on retombe
--      sur un hash dérivé de la tuple métier, qui reste déterministe.
--
-- IDEMPOTENCE DE LA MIGRATION
--   - ADD COLUMN IF NOT EXISTS
--   - Backfill UPDATE WHERE raw_hash IS NULL
--   - CREATE UNIQUE INDEX IF NOT EXISTS (CONCURRENTLY interdit en migration
--     transactionnelle → index classique, table de taille modeste)
--
-- NOTE : on NE touche PAS l'ancienne contrainte unique (numero_ticket,...)
-- pour ne pas casser un éventuel upsert legacy ; le nouvel index est
-- additif et c'est lui qui porte l'idempotence forte.
-- ════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- ─── 1) Colonne raw_hash ────────────────────────────────────────────
alter table public.ventes_cashmag_import
  add column if not exists raw_hash text;

-- ─── 2) Backfill — sha256 hex du raw_line, ou de la tuple métier ────
-- Canonique : si raw_line présent, hash(raw_line). Sinon, hash d'une
-- concaténation déterministe des champs d'identité (séparateur \x1f, peu
-- probable dans des données CashMag). Ceci DOIT rester aligné avec le TS.
update public.ventes_cashmag_import
set raw_hash = encode(
  extensions.digest(
    coalesce(
      nullif(raw_line, ''),
      concat_ws(
        chr(31),
        coalesce(date_vente::text, ''),
        coalesce(heure_vente::text, ''),
        coalesce(numero_ticket, ''),
        coalesce(code_barre, ''),
        coalesce(designation, ''),
        coalesce(quantite::text, ''),
        coalesce(prix_ttc::text, ''),
        coalesce(mode_paiement, '')
      )
    ),
    'sha256'
  ),
  'hex'
)
where raw_hash is null;

-- ─── 3) Index unique idempotence ────────────────────────────────────
create unique index if not exists ux_cashmag_raw_hash
  on public.ventes_cashmag_import (raw_hash);

notify pgrst, 'reload schema';
