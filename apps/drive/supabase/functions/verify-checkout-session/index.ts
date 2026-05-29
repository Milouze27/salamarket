// ─────────────────────────────────────────────────────────────────────
// verify-checkout-session — READ-ONLY
// ─────────────────────────────────────────────────────────────────────
// Cette function est désormais READ-ONLY : elle ne fait plus aucun
// .update() / .upsert() sur la table orders.
//
// Pourquoi : verify-checkout-session et confirm-order tournaient en
// parallèle au mount de /commande/confirmee, et tous deux écrivaient
// sur la même row. Race condition ⇒ confirm-order pouvait voir
// status != 'pending' et sauter le push notification (~50% miss).
//
// Désormais : confirm-order est le seul writer. Cette function se
// contente de fetch l'order + retourner ses infos pour affichage UI
// (avec un Stripe.retrieve diagnostique pour les paiements online
// pas encore confirmés en base).
//
// Future : quand le webhook Stripe officiel (checkout.session.completed,
// Bloc 2.4) sera en place, lui aussi appellera confirm-order. Single
// writer preserved.
// ─────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@18?target=denonext";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  console.log("[verify-checkout-session] invoked");

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2024-11-20.acacia",
    httpClient: Stripe.createFetchHttpClient(),
  });

  try {
    const { order_id, session_id } = await req.json();
    if (!order_id) return json({ error: "order_id requis" }, 400);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("*, pickup_slot:pickup_slots(id, slot_start, slot_end)")
      .eq("id", order_id)
      .eq("user_id", user.id)
      .single();

    // Fallback Drive au poids : la commande vit dans commandes_drive
    // (pas dans orders), créée par l'edge function create-checkout-session
    // sans passer par la table orders. On la cherche par id + email user
    // et on la mappe à la shape Order attendue par OrderConfirmation.tsx.
    if (error || !order) {
      const { data: cd } = await supabaseAdmin
        .from("commandes_drive")
        .select(
          "id, statut, mode_paiement, statut_paiement, total_ttc, " +
            "creneau_retrait, client_email, " +
            "commandes_drive_lignes (produit_id, quantite, prix_unitaire, " +
            "montant_estime_ttc, produit:produits(nom))"
        )
        .eq("id", order_id)
        .single();

      if (!cd || cd.client_email !== user.email) {
        return json({ error: "Commande introuvable" }, 404);
      }

      // Re-fetch avec le montant_autorise_ttc pour la pré-autorisation
      const { data: cdFull } = await supabaseAdmin
        .from("commandes_drive")
        .select("montant_autorise_ttc, montant_capture_ttc")
        .eq("id", order_id)
        .single();

      const items = (cd.commandes_drive_lignes ?? []).map((l: any) => ({
        product_id: l.produit_id,
        name: l.produit?.nom ?? "Produit",
        unit_price_cents: Math.round(Number(l.prix_unitaire ?? 0) * 100),
        quantity: Number(l.quantite ?? 0),
        line_total_cents: Math.round(Number(l.montant_estime_ttc ?? 0) * 100),
      }));

      const creneauStart = cd.creneau_retrait;
      const creneauEnd = creneauStart
        ? new Date(new Date(creneauStart).getTime() + 30 * 60 * 1000).toISOString()
        : null;

      // Drive au poids = manual capture Stripe :
      //   - statut_paiement="autorise"  ⇒ "authorized" (pré-autorisé, débit après pesée)
      //   - statut_paiement="capture"   ⇒ "paid"       (montant final débité)
      //   - autre                       ⇒ "unpaid"
      let mappedPaymentStatus: "paid" | "unpaid" | "authorized" = "unpaid";
      if (cd.statut_paiement === "capture") mappedPaymentStatus = "paid";
      else if (cd.statut_paiement === "autorise") mappedPaymentStatus = "authorized";

      const mapped = {
        id: cd.id,
        status: cd.statut,
        payment_method: cd.mode_paiement === "stripe" ? "online" : "in_store",
        payment_status: mappedPaymentStatus,
        total_cents: Math.round(Number(cd.total_ttc ?? 0) * 100),
        authorized_cents: cdFull?.montant_autorise_ttc
          ? Math.round(Number(cdFull.montant_autorise_ttc) * 100)
          : null,
        captured_cents: cdFull?.montant_capture_ttc
          ? Math.round(Number(cdFull.montant_capture_ttc) * 100)
          : null,
        items,
        notes: null,
        pickup_slot: creneauStart
          ? { id: cd.id, slot_start: creneauStart, slot_end: creneauEnd }
          : null,
      };

      console.log(
        `[verify-checkout-session] drive-au-poids fallback hit, id=${order_id}`
      );
      return json({ order: mapped });
    }

    // Pour les paiements online encore unpaid en base : on fait un retrieve
    // Stripe à titre informatif (diagnostic / future UI), mais on n'écrit
    // RIEN. confirm-order s'occupe de l'UPDATE atomique.
    if (
      order.payment_method === "online" &&
      order.payment_status !== "paid" &&
      session_id &&
      order.stripe_session_id === session_id
    ) {
      try {
        const session = await stripe.checkout.sessions.retrieve(session_id);
        console.log(
          `[verify-checkout-session] returning session data, payment_status=${session.payment_status} (db=${order.payment_status})`
        );
      } catch (stripeErr) {
        console.error("[verify-checkout-session] stripe retrieve failed:", stripeErr);
      }
      return json({ order });
    }

    console.log(
      `[verify-checkout-session] returning session data, payment_status=${order.payment_status}`
    );
    return json({ order });
  } catch (err) {
    console.error("[verify-checkout-session]", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
