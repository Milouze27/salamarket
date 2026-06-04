-- ════════════════════════════════════════════════════════════════
-- 20260604000020 — Push rules engine : dedup ledger (MYTH-08)
--
-- Le moteur de règles push (lib/actions/push-rules.ts) tourne sur les
-- crons dlc-scan (horaire) + forecast (6h). Sans garde-fou il enverrait
-- la MÊME alerte à chaque tick (24×/jour pour le DLC forcé) → spam, le
-- staff coupe les notifs, le moat meurt.
--
-- Cette table sert de mémoire courte : une (rule_key, fenêtre) ne peut
-- être poussée qu'UNE fois par fenêtre. On nettoie les vieilles entrées
-- (> 7j) à chaque insert pour ne pas la laisser grossir indéfiniment.
--
-- rule_key : identifiant déterministe par alerte logique. Exemples :
--   'dlc_force:2026-06-04'              (un push/jour pour le bloc DLC forcé)
--   'stockout_blocker:2026-06-04:am'    (un push/demi-journée pour les ruptures)
--   'casse_anomalie:<depot>:2026-06-04' (un push/jour/dépôt pour la casse)
--
-- Idempotent : create table if not exists + ON CONFLICT côté insert.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.push_dedup (
  rule_key    text primary key,
  sent_at     timestamptz not null default now(),
  meta        jsonb
);

create index if not exists idx_push_dedup_sent_at
  on public.push_dedup(sent_at);

comment on table public.push_dedup is
  'Mémoire anti-spam du moteur de règles push (MYTH-08). Une rule_key = une alerte logique poussée au plus une fois par fenêtre.';

-- RLS : seul le service-role (crons) écrit/lit. Pas d''accès anon.
alter table public.push_dedup enable row level security;

-- Aucune policy anon/authenticated → table fermée par défaut sous RLS.
-- Le service-role bypass RLS, donc les crons (qui utilisent la
-- SERVICE_ROLE_KEY) fonctionnent sans policy explicite.

notify pgrst, 'reload schema';
