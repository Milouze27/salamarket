-- ─────────────────────────────────────────────────────────────────────
-- SECURITY FIX — ERROR #2 (Lovable Security Scan 2026-05-02)
-- Realtime orders data leak
-- ─────────────────────────────────────────────────────────────────────
--
-- Avant ce fix : la table public.orders est publiée à supabase_realtime
-- (cf. enable_orders_realtime.sql) mais aucune RLS sur realtime.messages.
-- → tout user authenticated qui ouvre un canal sur "public:orders" reçoit
-- les payloads INSERT/UPDATE/DELETE de TOUTES les commandes (emails,
-- téléphones, payment_status, stripe_session_id, etc.). Fuite RGPD
-- caractérisée + risque d'exposition Stripe IDs.
--
-- Fix : RLS sur realtime.messages avec une policy qui autorise UNIQUEMENT :
--   1. Les payloads orders dont user_id du record = auth.uid() (le user
--      voit ses propres commandes en Realtime — utile si on ajoute plus
--      tard un suivi temps réel côté client)
--   2. Les users avec rôle admin/employee (ils ont besoin de toutes les
--      commandes pour /admin et /employe)
--   3. Les payloads d'autres tables (broadcast/presence non sensibles,
--      autres tables Realtime futures) restent passants
--
-- Note : le payload column dans realtime.messages a la structure
--   { "data": { "schema":"public", "table":"orders", "type":"INSERT",
--               "record": {...}, "old_record": {...} }, "ids": [...] }
-- Pour les UPDATEs, record contient la nouvelle ligne (donc user_id présent).
-- Pour les DELETEs, record peut être null mais on n'a pas de DELETE
-- exposé côté client dans cette app (rollback côté server-side uniquement
-- via service_role qui bypasse cette RLS).
--
-- notify-new-order et confirm-order sont server-side avec service_role :
-- ils bypassent cette RLS, donc M3 (push iPhone) reste fonctionnel.

-- Helper SECURITY DEFINER : évite les problèmes de récursion RLS si
-- profiles a une policy qui ré-évalue auth.uid(). Cached STABLE pour
-- ne pas refaire la query à chaque ligne du broadcast batch.
create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

revoke execute on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated;

-- Active RLS sur realtime.messages (idempotent)
alter table realtime.messages enable row level security;

-- Drop ancienne policy si re-run
drop policy if exists "Realtime orders access policy" on realtime.messages;

create policy "Realtime orders access policy"
  on realtime.messages
  for select
  to authenticated
  using (
    -- Cas 1 : payload postgres_changes sur autre table que orders
    -- → laisser passer (broadcast/presence, autres tables non sensibles)
    not (
      extension = 'postgres_changes'
      and (payload->'data'->>'table') = 'orders'
    )
    or
    -- Cas 2 : c'est un event orders ET le user est admin/employee
    public.current_user_role() in ('admin', 'employee')
    or
    -- Cas 3 : c'est un event orders ET le user est le owner du record
    -- (utile pour un futur suivi commande temps réel côté client ;
    -- aujourd'hui aucun client ne s'abonne mais c'est défense en
    -- profondeur cohérente avec l'esprit de la table)
    (
      extension = 'postgres_changes'
      and (payload->'data'->>'table') = 'orders'
      and (payload->'data'->'record'->>'user_id')::uuid = auth.uid()
    )
  );

-- Vérification post-migration :
-- 1. Login en client-demo → ouvrir DevTools console :
--      const ch = window.supabase.channel('test')
--        .on('postgres_changes', {event:'*', schema:'public', table:'orders'}, console.log)
--        .subscribe();
--    Passer une commande depuis un AUTRE compte → ne doit RIEN logger.
-- 2. Login en admin → idem → doit logger TOUS les events orders.
