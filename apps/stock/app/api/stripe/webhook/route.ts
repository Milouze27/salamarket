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
function isMissingTable(
  err: { code?: string; message?: string } | null,
): boolean {
  if (!err) return false;
  if (err.code === "PGRST205" || err.code === "42P01") return true;
  const msg = (err.message || "").toLowerCase();
  return msg.includes("does not exist") || msg.includes("could not find");
}

/**
 * Idempotence ATOMIQUE sur event.id (Stripe livre « au moins une fois »).
 * On REVENDIQUE l'event par un INSERT dans stripe_webhook_events (clé primaire
 * = event_id) AVANT tout effet de bord. Le premier gagne ; tout doublon échoue
 * en 23505. C'est atomique au niveau DB → fini la course check-then-act de
 * l'ancien dédup sur audit_log.
 *
 * Retour :
 *   - "claimed"   : revendication obtenue → on traite (et on RELÂCHE si échec transitoire).
 *   - "duplicate" : déjà revendiqué/traité → ACK 200 sans rejouer.
 *   - "no-lock"   : table absente (migration 20260606000001 pas encore appliquée)
 *                   → fallback, on traite SANS verrou (comportement historique).
 *   - "error"     : panne DB transitoire → 500 pour que Stripe retry.
 */
async function claimWebhookEvent(
  eventId: string,
  type: string,
): Promise<"claimed" | "duplicate" | "no-lock" | "error"> {
  try {
    const { error } = await supabaseServer()
      .from("stripe_webhook_events")
      .insert({ event_id: eventId, type });
    if (!error) return "claimed";
    if (error.code === "23505") return "duplicate"; // PK déjà présente
    if (isMissingTable(error)) return "no-lock"; // migration pas appliquée
    return "error"; // transitoire → retry plutôt que double-traitement
  } catch {
    // Client serveur indispo (env manquant) — on traite plutôt que bloquer le paiement.
    return "no-lock";
  }
}

/** Relâche la revendication (échec transitoire) pour autoriser le retry Stripe. */
async function releaseWebhookClaim(eventId: string): Promise<void> {
  try {
    await supabaseServer()
      .from("stripe_webhook_events")
      .delete()
      .eq("event_id", eventId);
  } catch {
    /* best-effort */
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
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
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

  // Idempotence ATOMIQUE : on REVENDIQUE l'event (INSERT PK) AVANT tout effet
  // de bord. Doublon concurrent → un seul gagne, l'autre est rejeté ici.
  const claim = await claimWebhookEvent(event.id, event.type);
  if (claim === "duplicate") {
    return NextResponse.json({ received: true, duplicate: true });
  }
  if (claim === "error") {
    // Impossible de revendiquer (panne DB transitoire) → 500 pour retry Stripe.
    return NextResponse.json({ error: "claim_unavailable" }, { status: 500 });
  }
  // claimed = revendication tenue ; false en fallback "no-lock" (migration pas
  // appliquée → on traite sans verrou, comme avant).
  const claimed = claim === "claimed";

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
      details: {
        type: event.type,
        error: e instanceof Error ? e.message : "unknown",
      },
    });
    // Relâche la revendication → le retry Stripe pourra rejouer cet event.
    if (claimed) await releaseWebhookClaim(event.id);
    return NextResponse.json({ error: "handler_exception" }, { status: 500 });
  }

  // Échec transitoire signalé par le handler → 500 pour retry Stripe.
  if (!result.ok && result.transient) {
    await auditLog({
      action: "stripe.webhook.transient_error",
      recordId: event.id,
      details: { type: event.type, reason: result.reason },
    });
    // Relâche la revendication → le retry Stripe pourra rejouer cet event.
    if (claimed) await releaseWebhookClaim(event.id);
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
