/**
 * POST /api/stripe/capture-payment
 *
 * STRIPE_SECRET_KEY=sk_test_PLACEHOLDER  (cf. .env.local.example)
 *
 * Capture la pré-autorisation Stripe d'une commande Drive APRÈS la
 * pesée réelle des produits. Le montant capturé = somme des
 * `montant_reel_ttc` des lignes (fallback `montant_estime_ttc` pour
 * les lignes non pesées, ex. produits à l'unité).
 *
 * Garde-fou : on ne peut pas capturer plus que la pré-auto (Stripe le
 * refusera de toute façon). Si la pesée dépasse l'autorisé, il faut
 * notifier le client et créer un PI complémentaire — c'est géré par
 * la logique de validation côté UI préparateur (cf. drive-pesee.ts).
 *
 * AUTH : seul un user staff (admin/manager/employee) peut capturer.
 * On lit le `user_id` (= profiles.id) depuis le body et on vérifie le
 * role via service-role. C'est le pattern déjà utilisé ailleurs dans
 * salam-stock (sync/drive-pull lit profiles via service-role).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import Stripe from "stripe";
import { stripe, auditLog } from "@/lib/stripe";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  commande_id: z.string().uuid("commande_id doit être un UUID"),
  user_id: z
    .string()
    .uuid("user_id doit être un UUID (= profiles.id du préparateur)"),
});

interface LigneMontant {
  montant_estime_ttc: number | string | null;
  montant_reel_ttc: number | string | null;
}

function toNumber(v: number | string | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "string" ? parseFloat(v) : v;
}

export async function POST(req: Request) {
  // 1. Parse + validation
  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { commande_id, user_id } = parsed.data;

  const sb = supabaseServer();

  // 2. AUTH staff : profiles.role in (admin, manager, employee)
  const { data: profile, error: errProfile } = await sb
    .from("profiles")
    .select("id, role")
    .eq("id", user_id)
    .single();

  if (errProfile || !profile) {
    return NextResponse.json(
      { error: "profile_introuvable", detail: errProfile?.message },
      { status: 401 },
    );
  }

  const role = (profile as { role: string | null }).role;
  if (!role || !["admin", "manager", "employee"].includes(role)) {
    return NextResponse.json(
      { error: "forbidden", detail: "Role staff requis" },
      { status: 403 },
    );
  }

  // 3. Charge la commande + ses lignes
  const { data: commande, error: errCmd } = await sb
    .from("commandes_drive")
    .select(
      "id, statut_paiement, stripe_payment_intent_id, " +
        "montant_autorise_ttc, autorisation_expire_at, " +
        "commandes_drive_lignes (montant_estime_ttc, montant_reel_ttc)",
    )
    .eq("id", commande_id)
    .single();

  if (errCmd || !commande) {
    return NextResponse.json(
      { error: "commande_introuvable", detail: errCmd?.message },
      { status: 404 },
    );
  }

  const cmd = commande as unknown as {
    id: string;
    statut_paiement: string | null;
    stripe_payment_intent_id: string | null;
    montant_autorise_ttc: number | string | null;
    autorisation_expire_at: string | null;
    commandes_drive_lignes: LigneMontant[] | null;
  };

  // Pré-autorisation Stripe expirée ? (capture_method=manual → ~7 j de validité).
  // On le détecte AVANT l'appel Stripe pour renvoyer un message actionnable au
  // staff plutôt qu'une erreur Stripe brute « PaymentIntent ... cannot be captured ».
  if (
    cmd.autorisation_expire_at &&
    new Date(cmd.autorisation_expire_at).getTime() < Date.now()
  ) {
    return NextResponse.json(
      {
        error: "autorisation_expiree",
        detail: `La pré-autorisation a expiré le ${new Date(cmd.autorisation_expire_at).toLocaleString("fr-FR")}. Demande au client de repasser commande ou de re-régler au comptoir.`,
      },
      { status: 409 },
    );
  }

  if (cmd.statut_paiement !== "autorise") {
    return NextResponse.json(
      {
        error: "statut_invalide",
        detail: `statut_paiement = ${cmd.statut_paiement} (attendu 'autorise')`,
      },
      { status: 409 },
    );
  }

  if (!cmd.stripe_payment_intent_id) {
    return NextResponse.json(
      { error: "payment_intent_manquant" },
      { status: 422 },
    );
  }

  // 4. Calcule le montant réel à capturer
  const lignes = cmd.commandes_drive_lignes ?? [];
  if (lignes.length === 0) {
    return NextResponse.json(
      { error: "aucune_ligne", detail: "La commande n'a aucune ligne" },
      { status: 422 },
    );
  }

  const montantReelTtc = lignes.reduce((acc, l) => {
    const reel = toNumber(l.montant_reel_ttc);
    const estime = toNumber(l.montant_estime_ttc);
    return acc + (reel > 0 ? reel : estime);
  }, 0);

  if (montantReelTtc <= 0) {
    return NextResponse.json(
      { error: "montant_reel_invalide", detail: "Total réel = 0" },
      { status: 422 },
    );
  }

  const montantAutorise = toNumber(cmd.montant_autorise_ttc);
  if (montantReelTtc > montantAutorise + 0.005) {
    return NextResponse.json(
      {
        error: "depassement_autorisation",
        detail:
          `Réel ${montantReelTtc.toFixed(2)} € > autorisé ` +
          `${montantAutorise.toFixed(2)} €. Demander supplément client.`,
        montantReelTtc,
        montantAutoriseTtc: montantAutorise,
      },
      { status: 409 },
    );
  }

  const amountCentimes = Math.round(montantReelTtc * 100);

  // 5. Capture Stripe
  // Idempotency-Key déterministe par (commande, montant capturé) : si le
  // préparateur double-clique ou si le réseau retry, Stripe renvoie la
  // capture déjà effectuée au lieu d'en tenter une seconde.
  let captured: Stripe.PaymentIntent;
  try {
    captured = await stripe().paymentIntents.capture(
      cmd.stripe_payment_intent_id,
      { amount_to_capture: amountCentimes },
      { idempotencyKey: `pi_capture_${commande_id}_${amountCentimes}` },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur Stripe inconnue";
    console.error("[stripe/capture] échec Stripe :", e);
    await auditLog({
      action: "stripe.payment_intent.capture_failed",
      tableName: "commandes_drive",
      recordId: commande_id,
      actorId: user_id,
      actorRole: role,
      details: {
        payment_intent_id: cmd.stripe_payment_intent_id,
        montant_capture_cents: amountCentimes,
        error: msg,
      },
    });
    return NextResponse.json(
      { error: "stripe_capture_failed", detail: msg },
      { status: 500 },
    );
  }

  // 6. UPDATE commande
  const { error: errUpd } = await sb
    .from("commandes_drive")
    .update({
      montant_capture_ttc: montantReelTtc,
      statut_paiement: "capture",
    })
    .eq("id", commande_id);

  // Audit AVANT le retour : trace la capture Stripe et l'état du DB UPDATE,
  // même en cas d'échec (réconciliation Stripe↔DB).
  await auditLog({
    action: "stripe.payment_intent.captured",
    tableName: "commandes_drive",
    recordId: commande_id,
    actorId: user_id,
    actorRole: role,
    details: {
      payment_intent_id: captured.id,
      montant_capture_cents: amountCentimes,
      db_update_ok: !errUpd,
    },
  });

  if (errUpd) {
    // La capture Stripe a RÉUSSI (client débité) mais l'UPDATE DB a échoué :
    // statut_paiement reste 'autorise', montant_capture_ttc NULL. Il ne faut
    // PAS renvoyer 'success' (sinon le staff croit la capture enregistrée et
    // rien ne corrige l'incohérence — Stripe ne re-déclenche pas sur un 200).
    console.error(
      "[stripe/capture] capture Stripe OK mais UPDATE DB échouée :",
      errUpd,
    );
    return NextResponse.json(
      {
        error: "db_desync_after_capture",
        message: `Paiement capturé chez Stripe mais enregistrement échoué. Prévenir l'admin (PI ${captured.id}).`,
        paymentIntentId: captured.id,
        montantCaptureTtc: montantReelTtc,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    paymentIntentId: captured.id,
    montantCaptureTtc: montantReelTtc,
    status: "success",
  });
}
