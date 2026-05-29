-- Policy UPDATE manquante pour push_subscriptions
-- ─────────────────────────────────────────────────
-- Le script initial push_subscriptions.sql a créé les policies
-- SELECT / INSERT / DELETE mais pas UPDATE. On l'ajoute ici pour
-- couvrir le cas où le user ré-active une notif sur un endpoint
-- existant (réutilisation d'une row au lieu d'un INSERT après DELETE).
--
-- Idempotent : drop + create pour éviter une erreur si déjà appliquée.

drop policy if exists "users update own push subs" on public.push_subscriptions;

create policy "users update own push subs"
  on public.push_subscriptions for update
  using (auth.uid() = user_id);
