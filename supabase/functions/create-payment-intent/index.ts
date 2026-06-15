// Edge Function — POST /functions/v1/create-payment-intent
//
// Portage Deno de la route Next `apps/stock/app/api/stripe/create-payment-intent`.
// Crée un PaymentIntent Stripe en capture_method=manual (pré-autorisation
// sans débit immédiat), montant = montant_autorise_ttc stocké par
// create-checkout-session (fallback estimé × 1.20). Met à jour la commande.
//
// Pensé pour les instances Drive autonomes (Eden Market) où il n'y a pas de
// backend Next : tout passe par les Edge Functions Supabase du même projet.
//
// Secrets requis : STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const toNum = (v: unknown): number => {
  if (v == null) return 0;
  return typeof v === "string" ? parseFloat(v) : (v as number);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey || stripeKey.includes("PLACEHOLDER")) {
    return json({ error: "Stripe non configuré (STRIPE_SECRET_KEY manquante)" }, 503);
  }
  const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const raw = await req.json().catch(() => null);
  const commandeId: string | undefined = raw?.commande_id;
  if (!commandeId) return json({ error: "commande_id requis" }, 400);

  // Charge commande + lignes
  const { data: commande, error: errCmd } = await sb
    .from("commandes_drive")
    .select(
      "id, statut_paiement, stripe_payment_intent_id, total_ttc, montant_autorise_ttc, client_email, " +
        "commandes_drive_lignes (montant_estime_ttc, quantite, prix_unitaire)",
    )
    .eq("id", commandeId)
    .single();

  if (errCmd || !commande) {
    return json({ error: "commande_introuvable", detail: errCmd?.message }, 404);
  }

  // Idempotence : déjà autorisé → renvoie l'existant
  if (commande.stripe_payment_intent_id && commande.statut_paiement === "autorise") {
    try {
      const pi = await stripe.paymentIntents.retrieve(
        commande.stripe_payment_intent_id,
      );
      return json({
        clientSecret: pi.client_secret,
        paymentIntentId: pi.id,
        montantAutoriseCents: pi.amount ?? 0,
        reused: true,
      });
    } catch (_e) {
      // PI introuvable (reset test mode) → on recrée
    }
  }

  // Montant estimé — toujours côté serveur
  const lignes = (commande.commandes_drive_lignes ?? []) as Array<{
    montant_estime_ttc: number | string | null;
    quantite: number | string | null;
    prix_unitaire: number | string | null;
  }>;
  let estimeTtc = lignes.reduce((acc, l) => {
    const e = toNum(l.montant_estime_ttc);
    return acc + (e > 0 ? e : toNum(l.quantite) * toNum(l.prix_unitaire));
  }, 0);
  if (estimeTtc <= 0) estimeTtc = toNum(commande.total_ttc);
  if (estimeTtc <= 0) return json({ error: "montant_estime_invalide" }, 422);

  const stored = toNum(commande.montant_autorise_ttc);
  const montantAutoriseTtc = stored > 0 ? stored : Math.round(estimeTtc * 1.2 * 100) / 100;
  const cents = Math.round(montantAutoriseTtc * 100);

  // Crée le PaymentIntent
  let pi: Stripe.PaymentIntent;
  try {
    const params: Stripe.PaymentIntentCreateParams = {
      amount: cents,
      currency: "eur",
      capture_method: "manual",
      automatic_payment_methods: { enabled: true },
      metadata: { commande_id: commandeId, estime_ttc: estimeTtc.toFixed(2), marge_pct: "20" },
    };
    if (commande.client_email) params.receipt_email = commande.client_email;
    pi = await stripe.paymentIntents.create(params, {
      idempotencyKey: `pi_create_${commandeId}_${cents}`,
    });
  } catch (e) {
    return json({ error: "stripe_create_failed", detail: String(e) }, 500);
  }

  // UPDATE commande
  const expireAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const { error: errUpd } = await sb
    .from("commandes_drive")
    .update({
      stripe_payment_intent_id: pi.id,
      montant_autorise_ttc: montantAutoriseTtc,
      statut_paiement: "autorise",
      autorisation_expire_at: expireAt,
    })
    .eq("id", commandeId);

  if (errUpd) {
    try { await stripe.paymentIntents.cancel(pi.id); } catch (_e) { /* noop */ }
    return json({ error: "db_update_failed", detail: errUpd.message }, 500);
  }

  return json({
    clientSecret: pi.client_secret,
    paymentIntentId: pi.id,
    montantAutoriseCents: cents,
  });
});
