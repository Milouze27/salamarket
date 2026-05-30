-- ────────────────────────────────────────────────────────────────
-- 0031 — Halal lot traceability (Bet 1, demo-mode)
--
-- Adds `produits_lots` : one row per physical lot received from a
-- supplier, with halal-specific metadata (certifier, validity,
-- abattoir, dates, DLC).
--
-- The QR code printed on a Drive/POS ticket points at the public
-- page `https://salamarket-drive.vercel.app/lot/{id}`. That page is
-- served by the Drive PWA and reads this table via anon SELECT
-- (RLS read-all). No PII here — only product / lot / certifier info,
-- safe to expose publicly. This IS the moat : auto-verifiable halal
-- proof, scannable from any phone, no competitor offers it.
--
-- Idempotent : safe to re-run.
-- ────────────────────────────────────────────────────────────────

create table if not exists public.produits_lots (
  id              text primary key,                       -- format human-readable : L2026-05-A23
  produit_id      uuid not null references public.produits(id) on delete restrict,
  supplier_lot    text,                                   -- numéro de lot du fournisseur
  fournisseur_id  uuid references public.fournisseurs(id),
  certifier_id    text,                                   -- AVS | ARGML | MOSQUEE_PARIS | OTHER
  certifier_name  text,
  certifier_valid_until date,                             -- validité du certificat halal
  abattoir_nom    text,
  abattoir_pays   text default 'FR',
  date_abattage   date,
  date_reception  date not null default current_date,
  dlc             date,                                   -- pour Bet 2 DLC engine
  ddm             date,
  quantite_recue  numeric,
  unite           text default 'kg',
  qr_url          text generated always as ('https://salamarket-drive.vercel.app/lot/' || id) stored,
  notes           text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_produits_lots_produit
  on public.produits_lots(produit_id);

create index if not exists idx_produits_lots_dlc
  on public.produits_lots(dlc)
  where dlc is not null;

-- ─── RLS read-open ─────────────────────────────────────────────
-- Public /lot/:id page on Drive needs anonymous SELECT. The data
-- exposed is intentionally public (it IS the halal proof).
alter table public.produits_lots enable row level security;

drop policy if exists "read_all" on public.produits_lots;
create policy "read_all" on public.produits_lots
  for select using (true);

-- POC write policy aligned with 0007_write_policies pattern.
-- Stock admin writes happen via service-role from server actions ;
-- this anon INSERT is for local dev / demo.
drop policy if exists "anon_write_all" on public.produits_lots;
create policy "anon_write_all" on public.produits_lots
  for all using (true) with check (true);

-- ─── Seed demo lot — Brochettes Poulet Marinées ────────────────
-- Idempotent : ON CONFLICT DO NOTHING. Picks the first product
-- whose name matches "brochettes ... poulet". If none exists, the
-- INSERT silently inserts zero rows — the table stays empty, the
-- public /lot/L2026-05-A23 page will show its empty state.
insert into public.produits_lots (
  id, produit_id, supplier_lot,
  certifier_id, certifier_name, certifier_valid_until,
  abattoir_nom, abattoir_pays, date_abattage,
  dlc, quantite_recue, unite, notes
)
select
  'L2026-05-A23',
  p.id,
  'BPM-2026-127',
  'AVS',
  'AVS — A Votre Service',
  date '2027-03-15',
  'Établissements Bigard Castres',
  'FR',
  date '2026-05-28',
  date '2026-06-03',
  12.5,
  'kg',
  'Poulet fermier label rouge, abattu Castres, certifié AVS catégorie 1.'
from public.produits p
where p.nom ilike '%brochettes%poulet%'
limit 1
on conflict (id) do nothing;
