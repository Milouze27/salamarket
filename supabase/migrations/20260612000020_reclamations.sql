-- ════════════════════════════════════════════════════════════════
-- 20260612000020 — SAV client : table reclamations
--
-- Permet à un client (Drive B2C) de signaler un problème sur une de
-- ses commandes ("Signaler un problème" depuis Mes commandes) :
--   - motif (catégorie + texte libre)
--   - ligne concernée (produit) optionnelle
--   - photo optionnelle (bucket Storage `reclamations`)
--
-- Rattachement : par email du client (commande_id pointe vers une
-- commande Drive identifiée côté UI). On NE pose PAS de FK dure sur
-- commandes_drive / orders car une commande peut vivre dans l'une OU
-- l'autre table (flux legacy vs Drive au poids) : on stocke l'id en
-- texte + l'email pour le rapprochement métier, comme le reste du SAV.
--
-- Idempotent / append-only. RLS : un client lit/écrit SES réclamations
-- (via auth.uid()) ; le staff (service_role / dashboard) lit tout.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.reclamations (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  client_email  text,
  commande_id   text not null,
  -- catégorie normalisée du problème (cf. UI SignalerProbleme.tsx)
  motif         text not null check (
    motif in (
      'produit_manquant',
      'produit_abime',
      'erreur_produit',
      'qualite',
      'autre'
    )
  ),
  -- produit concerné (optionnel) : on garde l'id + un libellé figé pour
  -- l'historique même si le produit est renommé/supprimé ensuite.
  produit_id    text,
  produit_nom   text,
  commentaire   text not null check (char_length(commentaire) between 1 and 2000),
  photo_url     text,
  statut        text not null default 'ouverte' check (
    statut in ('ouverte', 'en_cours', 'resolue', 'rejetee')
  ),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_reclamations_user
  on public.reclamations(user_id);
create index if not exists idx_reclamations_commande
  on public.reclamations(commande_id);
create index if not exists idx_reclamations_email
  on public.reclamations(client_email);

alter table public.reclamations enable row level security;

-- Le client connecté lit ses propres réclamations.
drop policy if exists "reclamations select own" on public.reclamations;
create policy "reclamations select own" on public.reclamations
  for select to authenticated
  using (user_id = auth.uid());

-- Le client connecté crée une réclamation pour lui-même.
drop policy if exists "reclamations insert own" on public.reclamations;
create policy "reclamations insert own" on public.reclamations
  for insert to authenticated
  with check (user_id = auth.uid());

notify pgrst, 'reload schema';
