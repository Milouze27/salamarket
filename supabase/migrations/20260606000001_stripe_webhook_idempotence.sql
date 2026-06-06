-- 20260606000001 — Idempotence du webhook Stripe (anti double-traitement)
--
-- PROBLÈME : Stripe livre les events « au moins une fois » (retries). L'ancien
-- garde-fou du webhook était un check-then-act NON atomique sur audit_log
-- (lire « déjà traité ? » → traiter → écrire le marqueur) : deux livraisons
-- concurrentes du même event.id lisaient toutes les deux « non », et exécutaient
-- les effets de bord deux fois.
--
-- POURQUOI PAS une contrainte UNIQUE sur audit_log : audit_log est un journal
-- générique ; un même (action, record_id) peut légitimement apparaître plusieurs
-- fois (ex. deux `stripe.payment_intent.capture_failed` sur un même commande_id
-- lors de retries). Une contrainte unique globale casserait ces usages.
--
-- SOLUTION (pattern Stripe recommandé) : une table DÉDIÉE dont la clé primaire
-- est l'event.id. Le webhook fait un INSERT atomique AVANT les effets de bord :
-- le premier gagne la revendication, tout doublon échoue en 23505 → ACK sans
-- rejouer. En cas d'échec transitoire du traitement, la route SUPPRIME la
-- revendication pour laisser le retry Stripe rejouer.

create table if not exists public.stripe_webhook_events (
  event_id   text primary key,
  type       text,
  claimed_at timestamptz not null default now()
);

comment on table public.stripe_webhook_events is
  'Idempotence webhook Stripe : 1 event.id = 1 revendication atomique (INSERT PK). Écrit par /api/stripe/webhook via SUPABASE_SERVICE_ROLE_KEY. Table neuve, aucun dédoublonnage nécessaire.';

-- RLS : on active sans aucune policy → anon/auth bloqués par défaut. Seul le
-- service_role (webhook serveur) y accède (il bypass RLS).
alter table public.stripe_webhook_events enable row level security;

-- Purge optionnelle des vieux events (housekeeping) — index sur claimed_at.
create index if not exists idx_stripe_webhook_events_claimed_at
  on public.stripe_webhook_events (claimed_at);

-- Recharge le cache de schéma PostgREST pour que la table soit visible via l'API.
notify pgrst, 'reload schema';
