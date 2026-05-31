// Edge function notify-new-order
// ─────────────────────────────────
// Déclenchée par un Database Webhook Supabase configuré sur INSERT
// public.orders. Envoie une notification Web Push à toutes les
// subscriptions des employés actifs (admin, manager, caisse, reception,
// preparation) — cf. JOIN push_subscriptions ↔ employes ci-dessous
// (HOTFIX-VAGUE7).
//
// Env vars requises (Lovable Cloud → Edge Functions → Secrets) :
//   - VAPID_PUBLIC_KEY
//   - VAPID_PRIVATE_KEY
//   - VAPID_SUBJECT      (ex. "mailto:contact@salamarket.fr")
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface OrderRecord {
  id: string;
  total_cents: number;
  status: string;
}

interface WebhookPayload {
  type?: string;
  table?: string;
  record?: OrderRecord;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const formatEUR = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    (cents ?? 0) / 100,
  );

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ─────────────────────────────────────────────────────────────────
  // SECURITY — ERROR #3 (Lovable Security Scan 2026-05-02)
  //
  // Cette function est appelée EXCLUSIVEMENT en service-to-service
  // depuis confirm-order (cf. confirm-order/index.ts L138). Elle ne
  // doit JAMAIS être invoquée depuis le frontend client : sans ce
  // check, n'importe qui pouvait POSTer un payload arbitraire pour
  // déclencher un push à tous les admins/employees (spam de notifs,
  // social engineering possible).
  //
  // On compare directement le Bearer au SERVICE_ROLE_KEY au lieu
  // d'utiliser supabase.auth.getUser() : la function n'est pas
  // appelée par un user humain, donc pas de session JWT à valider.
  // ─────────────────────────────────────────────────────────────────
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const expectedAuth = SERVICE_ROLE_KEY ? `Bearer ${SERVICE_ROLE_KEY}` : null;
  const authHeader = req.headers.get("Authorization");

  if (!expectedAuth || !authHeader || authHeader !== expectedAuth) {
    console.warn("[notify-new-order] unauthorized call attempt", {
      hasAuth: !!authHeader,
      method: req.method,
    });
    return json({ error: "Unauthorized — service role required" }, 401);
  }

  console.log("[notify-new-order] invoked, method:", req.method);

  const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY");
  const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");
  const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT");

  if (!VAPID_PUBLIC || !VAPID_PRIVATE || !VAPID_SUBJECT) {
    return json({ error: "VAPID keys not configured" }, 500);
  }

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  console.log("[notify-new-order] payload received:", JSON.stringify(payload).slice(0, 300));

  // Filtre : on ne traite que les INSERT sur orders.
  if (payload.type !== "INSERT" || payload.table !== "orders" || !payload.record) {
    console.warn("[notify-new-order] skipped, payload type/table mismatch:", payload.type, payload.table);
    return json({ skipped: true, reason: "not an orders insert" });
  }

  const order = payload.record;

  // ─────────────────────────────────────────────────────────────────
  // HOTFIX-VAGUE7 — JOIN push_subscriptions → employes (PIN-based staff)
  //
  // Avant : on filtrait `profiles` puis on JOIN push_subscriptions.user_id.
  // Problème : Stock V2 logge les staff par PIN (pas d'auth.users), donc
  // les push subs sont créées avec `employe_id` non null et `user_id` NULL.
  // → l'`in('user_id', targetUserIds)` ne matchait personne, les notifs
  // ne partaient jamais.
  //
  // Solution : on cible directement `push_subscriptions` joint à `employes`
  // (la source de vérité staff) en filtrant sur :
  //   - employe.is_active = true
  //   - employe.role ∈ whitelist (admin + manager + opérationnels)
  //
  // NB : "employee" est le rôle profils B2C (pas applicable ici). En
  // employes.role on a ('reception','caisse','preparation','manager',
  // 'admin'). On whitelist tout sauf rien, parce que toute personne
  // active doit pouvoir être notifiée d'une nouvelle commande Drive.
  // ─────────────────────────────────────────────────────────────────
  const STAFF_ROLES_NOTIFIABLES = [
    "admin",
    "manager",
    "caisse",
    "reception",
    "preparation",
  ];

  const { data: subs, error: subsError } = await supabase
    .from("push_subscriptions")
    .select(
      "id, endpoint, keys_p256dh, keys_auth, employe_id, employes!inner(id, role, is_active)",
    )
    .eq("enabled", true)
    .eq("employes.is_active", true)
    .in("employes.role", STAFF_ROLES_NOTIFIABLES);

  if (subsError) {
    console.error("[notify-new-order] subs query error:", subsError);
    return json({ error: subsError.message }, 500);
  }

  console.log(
    `[notify-new-order] found ${subs?.length ?? 0} push subscriptions (staff actifs)`,
  );

  if (!subs || subs.length === 0) {
    return json({ sent: 0, reason: "no subscriptions" });
  }

  const notification = JSON.stringify({
    title: "Nouvelle commande",
    body: `Commande de ${formatEUR(order.total_cents)} reçue.`,
    url: "/admin",
    tag: `order-${order.id}`,
  });

  const results = await Promise.allSettled(
    subs.map((sub: { id: string; endpoint: string; keys_p256dh: string; keys_auth: string }) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
        },
        notification,
      ),
    ),
  );

  // Nettoie les subscriptions invalides (410 Gone, 404 Not Found).
  const expired: string[] = [];
  results.forEach((res, idx) => {
    if (res.status === "rejected") {
      const err = res.reason as { statusCode?: number };
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        expired.push(subs[idx].id);
      } else {
        console.error("[notify-new-order] push failed:", err);
      }
    }
  });

  if (expired.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", expired);
  }

  const sent = results.filter((r) => r.status === "fulfilled").length;
  console.log(`[notify-new-order] done: sent=${sent}, expired=${expired.length}, total=${subs.length}`);
  return json({ sent, expired: expired.length, total: subs.length });
});
