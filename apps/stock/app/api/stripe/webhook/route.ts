/**
 * POST /api/stripe/webhook
 *
 * STRIPE_SECRET_KEY=sk_test_PLACEHOLDER
 * STRIPE_WEBHOOK_SECRET=whsec_PLACEHOLDER  (cf. .env.local.example)
 *
 * Endpoint qui reçoit les events Stripe et réconcilie l'état du paiement
 * sur `commandes_drive`. La signature est OBLIGATOIRE (header
 * `stripe-signature`). On lit le body en RAW (pas .json()) pour que
 * la vérif HMAC fonctionne.
 *
 * Events gérés :
 *   - payment_intent.canceled            → statut_paiement = 'libere'
 *   - payment_intent.payment_failed      → statut_paiement = 'echec'
 *   - payment_intent.succeeded           → statut_paiement = 'capture' (si pas déjà)
 *
 * On répond 200 OK même sur events non gérés pour ne pas que Stripe
 * retry (cf. doc Stripe : 2xx = ack, tout le reste = retry).
 *
 * Configuration Stripe Dashboard :
 *   Webhook URL : https://<host>/api/stripe/webhook
 *   Events : payment_intent.succeeded, payment_intent.canceled,
 *            payment_intent.payment_failed
 *   Récupérer le `whsec_...` et le mettre dans STRIPE_WEBHOOK_SECRET.
 */
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe, auditLog } from "@/lib/stripe";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WebhookResult =
  | { ok: true; updated: boolean }
  // `transient` distingue une panne récupérable (DB indispo → Stripe doit
  // retry, on répond 500) d'une erreur définitive (commande introuvable →
  // un retry ne changera rien, on ACK 200 pour stopper la boucle).
  | { ok: false; reason: string; transient: boolean };

/** Détecte si l'erreur Postgres/PostgREST = "table absente" (env legacy). */
function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "PGRST205" || err.code === "42P01") return true;
  const msg = (err.message || "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("could not find");
}

/**
 * Idempotence sur event.id : Stripe livre AU MOINS une fois (retries), donc
 * un même event peut arriver plusieurs fois. On enregistre chaque event.id
 * traité dans audit_log et on refuse de ré-appliquer les effets de bord.
 *
 * Retour :
 *   - "yes"   : déjà traité → ACK 200 sans rejouer.
 *   - "no"    : jamais vu (ou table audit_log absente) → on traite.
 *   - "error" : impossible de vérifier (panne transitoire) → 500 pour retry,
 *               on préfère un retry à un double-traitement.
 */
async function alreadyProcessed(eventId: string): Promise<"yes" | "no" | "error"> {
  try {
    const { data, error } = await supabaseServer()
      .from("audit_log")
      .select("id")
      .eq("action", "stripe.webhook.processed")
      .eq("record_id", eventId)
      .limit(1);
    if (error) {
      if (isMissingTable(error)) return "no"; // pas de table → on traite une fois
      return "error";
    }
    return data && data.length > 0 ? "yes" : "no";
  } catch {
    // Client serveur indispo (env manquant) — on traite plutôt que bloquer.
    return "no";
  }
}

async function handlePaymentIntent(
  pi: Stripe.PaymentIntent,
  newStatut: "capture" | "libere" | "echec",
  opts: { skipIfAlready?: "capture" } = {},
): Promise<WebhookResult> {
  // On retrouve la commande via metadata.commande_id (set côté
  // create-payment-intent) OU via stripe_payment_intent_id en fallback.
  const commandeId = pi.metadata?.commande_id;
  const sb = supabaseServer();

  let query = sb.from("commandes_drive").select("id, statut_paiement");
  query = commandeId
    ? query.eq("id", commandeId)
    : query.eq("stripe_payment_intent_id", pi.id);

  const { data: rows, error } = await query.limit(1);
  if (error) {
    // Panne DB transitoire → Stripe doit retry (500 en amont).
    console.error("[stripe/webhook] lookup commande échoué :", error);
    return { ok: false, reason: "lookup_failed", transient: true };
  }
  const row = (rows ?? [])[0] as
    | { id: string; statut_paiement: string | null }
    | undefined;
  if (!row) {
    // Définitif : un retry ne fera pas apparaître la commande. ACK 200.
    console.warn(
      "[stripe/webhook] commande introuvable pour PI",
      pi.id,
      "metadata.commande_id =",
      commandeId,
    );
    return { ok: false, reason: "commande_introuvable", transient: false };
  }

  if (opts.skipIfAlready && row.statut_paiement === opts.skipIfAlready) {
    return { ok: true, updated: false };
  }

  const patch: Record<string, unknown> = { statut_paiement: newStatut };
  if (newStatut === "capture") {
    // Stripe expose amount_received (en centimes) une fois capturé
    patch.montant_capture_ttc = (pi.amount_received ?? pi.amount ?? 0) / 100;
  }

  const { error: errUpd } = await sb
    .from("commandes_drive")
    .update(patch)
    .eq("id", row.id);

  if (errUpd) {
    // Panne DB transitoire pendant l'UPDATE → Stripe doit retry (500).
    console.error("[stripe/webhook] UPDATE échouée :", errUpd);
    return { ok: false, reason: "update_failed", transient: true };
  }

  return { ok: true, updated: true };
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig) {
    return NextResponse.json(
      { error: "missing_signature" },
      { status: 400 },
    );
  }
  if (!whSecret) {
    return NextResponse.json(
      { error: "webhook_secret_missing" },
      { status: 503 },
    );
  }

  // RAW body obligatoire pour la vérification HMAC
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, sig, whSecret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "signature_invalide";
    console.error("[stripe/webhook] vérif signature échouée :", msg);
    return NextResponse.json(
      { error: "invalid_signature", detail: msg },
      { status: 400 },
    );
  }

  // Idempotence : si on a déjà traité cet event.id, on ACK sans rejouer.
  const seen = await alreadyProcessed(event.id);
  if (seen === "error") {
    // Impossible de vérifier le dédup (panne transitoire) → 500 pour retry.
    return NextResponse.json({ error: "dedup_unavailable" }, { status: 500 });
  }
  if (seen === "yes") {
    return NextResponse.json({ received: true, duplicate: true });
  }

  let result: WebhookResult = { ok: true, updated: false };
  try {
    switch (event.type) {
      case "payment_intent.canceled": {
        const pi = event.data.object as Stripe.PaymentIntent;
        result = await handlePaymentIntent(pi, "libere");
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        result = await handlePaymentIntent(pi, "echec");
        break;
      }
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        result = await handlePaymentIntent(pi, "capture", {
          skipIfAlready: "capture",
        });
        break;
      }
      default:
        // Event non géré : ACK 200 (rien à faire), marqué traité plus bas.
        console.log("[stripe/webhook] event non géré :", event.type);
    }
  } catch (e) {
    // Exception inattendue = panne transitoire probable. On renvoie 500
    // pour que Stripe retry (au lieu d'avaler en 200 et de perdre l'event).
    console.error("[stripe/webhook] handler a throw :", e);
    await auditLog({
      action: "stripe.webhook.error",
      recordId: event.id,
      details: { type: event.type, error: e instanceof Error ? e.message : "unknown" },
    });
    return NextResponse.json({ error: "handler_exception" }, { status: 500 });
  }

  // Échec transitoire signalé par le handler → 500 pour retry Stripe.
  if (!result.ok && result.transient) {
    await auditLog({
      action: "stripe.webhook.transient_error",
      recordId: event.id,
      details: { type: event.type, reason: result.reason },
    });
    return NextResponse.json(
      { error: "transient_error", reason: result.reason },
      { status: 500 },
    );
  }

  // Succès OU échec définitif (commande introuvable / event non géré) :
  // on marque l'event comme traité (idempotence) puis on ACK 200.
  await auditLog({
    action: "stripe.webhook.processed",
    recordId: event.id,
    tableName: "commandes_drive",
    details: {
      type: event.type,
      outcome: result.ok ? "applied" : result.reason,
    },
  });

  return NextResponse.json({ received: true });
}
