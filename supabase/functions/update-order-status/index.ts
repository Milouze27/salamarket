import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Statuts gérés par le Kanban (pending est exclu, géré par confirm-order)
const KANBAN_STATUSES = ["confirmed", "preparing", "ready", "picked_up", "cancelled"];

// Notifie le CLIENT propriétaire d'une commande lorsque celle-ci passe à
// "ready" (commande prête à retirer). Best-effort : toute erreur push est
// loggée mais ne fait jamais échouer la mise à jour du statut.
async function notifyClientOrderReady(
  admin: ReturnType<typeof createClient>,
  userId: string | null,
) {
  if (!userId) {
    console.log("[update-order-status] order has no user_id, skip client push");
    return;
  }

  const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY");
  const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");
  const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT");
  if (!VAPID_PUBLIC || !VAPID_PRIVATE || !VAPID_SUBJECT) {
    console.warn("[update-order-status] VAPID not configured, skip client push");
    return;
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const { data: subs, error: subsError } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, keys_p256dh, keys_auth")
    .eq("user_id", userId)
    .eq("enabled", true);

  if (subsError) {
    console.error("[update-order-status] client subs query error:", subsError);
    return;
  }
  if (!subs || subs.length === 0) {
    console.log("[update-order-status] no client push subscriptions");
    return;
  }

  const notification = JSON.stringify({
    title: "Votre commande est prête",
    body: "Vous pouvez venir la retirer à Salamarket.",
    url: "/commandes",
    tag: "order-ready",
  });

  const results = await Promise.allSettled(
    subs.map((sub: { endpoint: string; keys_p256dh: string; keys_auth: string }) =>
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
        expired.push((subs[idx] as { id: string }).id);
      } else {
        console.error("[update-order-status] client push failed:", err);
      }
    }
  });
  if (expired.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", expired);
  }

  const sent = results.filter((r) => r.status === "fulfilled").length;
  console.log(`[update-order-status] client push sent=${sent}, expired=${expired.length}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  console.log("[update-order-status] invoked");

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !user) return json({ error: "Unauthorized" }, 401);

    // Check role
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "employee"].includes(profile.role)) {
      console.warn(`[update-order-status] forbidden role: ${profile?.role}`);
      return json({ error: "Forbidden — admin or employee role required" }, 403);
    }

    const { order_id, new_status } = (await req.json()) as {
      order_id?: string;
      new_status?: string;
    };

    if (!order_id || !new_status) {
      return json({ error: "Missing order_id or new_status" }, 400);
    }

    if (!KANBAN_STATUSES.includes(new_status)) {
      return json({
        error: `Invalid status. Must be one of: ${KANBAN_STATUSES.join(", ")}`,
      }, 400);
    }

    // Fetch current to log + ensure not still pending
    const { data: current, error: fetchErr } = await supabaseAdmin
      .from("orders")
      .select("id, status, user_id")
      .eq("id", order_id)
      .single();

    if (fetchErr || !current) {
      return json({ error: "Order not found" }, 404);
    }

    if (current.status === "pending") {
      return json({
        error: "Cannot update pending order via Kanban — must be confirmed first",
      }, 409);
    }

    console.log(`[update-order-status] ${user.id} ${order_id} ${current.status} → ${new_status}`);

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("orders")
      .update({ status: new_status, updated_at: new Date().toISOString() })
      .eq("id", order_id)
      .select()
      .single();

    if (updateErr) {
      console.error("[update-order-status] update failed:", updateErr);
      return json({ error: updateErr.message }, 500);
    }

    // Push CLIENT "commande prête" — uniquement sur la transition vers
    // ready, et seulement si la commande n'était pas déjà ready (évite le
    // double-envoi si l'employé re-clique). Best-effort, jamais bloquant.
    if (new_status === "ready" && current.status !== "ready") {
      try {
        await notifyClientOrderReady(
          supabaseAdmin,
          (current as { user_id?: string | null }).user_id ?? null,
        );
      } catch (pushErr) {
        console.error("[update-order-status] client push threw:", pushErr);
      }
    }

    return json({ success: true, order: updated });
  } catch (err) {
    console.error("[update-order-status]", err);
    return json({ error: (err as Error).message ?? "Server error" }, 500);
  }
});
