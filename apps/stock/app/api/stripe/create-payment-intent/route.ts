/**
 * POST /api/stripe/create-payment-intent
 *
 * STRIPE_SECRET_KEY=sk_test_PLACEHOLDER  (cf. .env.local.example)
 *
 * Crée un PaymentIntent en `capture_method=manual` (pré-autorisation
 * sans débit immédiat). Le montant autorisé = estimé × 1.20, marge de
 * 20 % qui couvre le Drive au poids variable (cas client qui pèse plus
 * que prévu).
 *
 * Flux côté Drive :
 *   1. Front pose la commande → commandes_drive.statut_paiement = null
 *   2. Cette route crée le PI et UPDATE commandes_drive avec :
 *        - stripe_payment_intent_id
 *        - montant_autorise_ttc
 *        - statut_paiement = 'autorise'
 *        - autorisation_expire_at = now() + 7 jours
 *   3. Front confirme le PI avec le clientSecret retourné
 *   4. À la pesée, on appelle /api/stripe/capture-payment
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import Stripe from "stripe";
import { stripe, auditLog } from "@/lib/stripe";
import { supabaseServer } from "@/lib/supabase-server";
import { computeMontantAutorise } from "@salamarket/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  commande_id: z.string().uuid("commande_id doit être un UUID"),
  // Optionnel : surcharger le montant estimé (sinon = somme des lignes)
  montant_estime_ttc: z.number().positive().optional(),
});

interface LigneRow {
  montant_estime_ttc: number | string | null;
  quantite: number | string | null;
  prix_unitaire: number | string | null;
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
  const { commande_id, montant_estime_ttc: estimeFromBody } = parsed.data;

  const sb = supabaseServer();

  // 2. Charge la commande + lignes
  // FIX 2026-05-16 : on lit montant_autorise_ttc stocké par l'Edge
  // Function create-checkout-session (source unique de vérité). On
  // garde le fallback compute legacy si la colonne est null (commandes
  // créées avant ce fix).
  // FIX 2026-05-31 (pay-no-receipt-email) : on lit aussi client_email
  // pour pouvoir le passer en `receipt_email` au PaymentIntent (reçu
  // Stripe auto au client, évite les appels "j'ai pas de facture").
  const { data: commande, error: errCmd } = await sb
    .from("commandes_drive")
    .select(
      "id, statut_paiement, stripe_payment_intent_id, total_ttc, montant_autorise_ttc, client_email, " +
        "commandes_drive_lignes (montant_estime_ttc, quantite, prix_unitaire)",
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
    total_ttc: number | string | null;
    montant_autorise_ttc: number | string | null;
    client_email: string | null;
    commandes_drive_lignes: LigneRow[] | null;
  };

  // Idempotence : si déjà autorisé, on renvoie l'existant plutôt que
  // de re-créer un PI (sinon double pré-auto sur la même commande).
  if (cmd.stripe_payment_intent_id && cmd.statut_paiement === "autorise") {
    try {
      const pi = await stripe().paymentIntents.retrieve(
        cmd.stripe_payment_intent_id,
      );
      return NextResponse.json({
        clientSecret: pi.client_secret,
        paymentIntentId: pi.id,
        montantAutoriseTtc: (pi.amount ?? 0) / 100,
        reused: true,
      });
    } catch (e) {
      // Si Stripe ne retrouve pas le PI (test mode reset, etc.), on
      // continue pour en re-créer un.
      console.warn("[stripe/create-pi] retrieve a échoué, on recrée :", e);
    }
  }

  // 3. Calcule le montant estimé — TOUJOURS côté serveur.
  // SÉCURITÉ (sec-payment-mocked-tamper) : le montant facturé est dérivé
  // EXCLUSIVEMENT des données serveur (lignes de commande puis total_ttc).
  // Le champ `montant_estime_ttc` du body client n'est JAMAIS utilisé pour
  // GONFLER la charge : on l'autorise uniquement à la réduire (estimé client
  // inférieur), plafonné au total serveur. Un client malveillant ne peut
  // donc pas augmenter le montant pré-autorisé.
  const lignes = cmd.commandes_drive_lignes ?? [];
  let serverEstimeTtc = lignes.reduce((acc, l) => {
    const ligneEstime = toNumber(l.montant_estime_ttc);
    if (ligneEstime > 0) return acc + ligneEstime;
    // Fallback : qté × PU (cas commande hors poids variable)
    return acc + toNumber(l.quantite) * toNumber(l.prix_unitaire);
  }, 0);
  if (serverEstimeTtc <= 0) {
    // Dernier recours : total_ttc de la commande (toujours serveur).
    serverEstimeTtc = toNumber(cmd.total_ttc);
  }

  // Le body client ne peut que RÉDUIRE l'estimé serveur, jamais l'augmenter.
  let estimeTtc = serverEstimeTtc;
  if (estimeFromBody && estimeFromBody > 0 && estimeFromBody < serverEstimeTtc) {
    estimeTtc = estimeFromBody;
  }

  if (estimeTtc <= 0) {
    return NextResponse.json(
      { error: "montant_estime_invalide", detail: "Aucun montant estimable" },
      { status: 422 },
    );
  }

  // FIX 2026-05-16 : préfère le montant_autorise_ttc stocké en DB par
  // l'Edge Function create-checkout-session (source unique de vérité,
  // marge appliquée SEULEMENT sur lignes weight). Fallback sur
  // computeMontantAutorise (estimé × 1.20 sur tout) uniquement pour les
  // commandes pré-fix (créées avant 2026-05-16) qui n'ont pas la
  // colonne renseignée.
  const storedAutorise = toNumber(cmd.montant_autorise_ttc);
  const montantAutoriseTtc =
    storedAutorise > 0 ? storedAutorise : computeMontantAutorise(estimeTtc);
  const montantAutoriseCentimes = Math.round(montantAutoriseTtc * 100);

  // 4. Crée le PaymentIntent côté Stripe
  // FIX 2026-05-31 (pay-no-applepay-googlepay) : on remplace l'ancien
  // `payment_method_types: ["card"]` implicite par
  // `automatic_payment_methods: { enabled: true }`. Stripe va alors
  // détecter automatiquement les wallets éligibles selon le device
  // (Apple Pay sur iOS Safari + PWA installée, Google Pay sur Android
  // Chrome, etc.) et les afficher dans le PaymentElement.
  //
  // Pour que ça marche en prod il faut :
  //   1. Stripe Dashboard → Settings → Payment methods → activer
  //      "Apple Pay" et "Google Pay" (toggle Wallets).
  //   2. Dashboard → Payment methods → Apple Pay → Configure domains
  //      → ajouter `salamarket-drive.vercel.app`.
  //   3. Héberger le fichier `/.well-known/apple-developer-merchantid-
  //      domain-association` téléchargé depuis Stripe sur le domaine
  //      Drive (cf. apps/drive/public/.well-known/).
  // FIX 2026-05-31 (pay-no-receipt-email) : on ajoute `receipt_email`
  // pour que Stripe envoie un reçu automatique au client après capture.
  let paymentIntent: Stripe.PaymentIntent;
  try {
    const createParams: Stripe.PaymentIntentCreateParams = {
      amount: montantAutoriseCentimes,
      currency: "eur",
      capture_method: "manual",
      automatic_payment_methods: { enabled: true },
      metadata: {
        commande_id,
        estime_ttc: estimeTtc.toFixed(2),
        marge_pct: "20",
      },
    };
    if (cmd.client_email) {
      createParams.receipt_email = cmd.client_email;
    }
    // Idempotency-Key déterministe par (commande, montant) : un double-clic
    // ou un retry réseau renvoie le MÊME PaymentIntent côté Stripe au lieu
    // d'en créer un second → zéro double pré-autorisation. La clé inclut le
    // montant pour qu'un ré-estimé légitime (poids différent) produise tout
    // de même un nouveau PI plutôt qu'un conflit Stripe (amount mismatch).
    paymentIntent = await stripe().paymentIntents.create(createParams, {
      idempotencyKey: `pi_create_${commande_id}_${montantAutoriseCentimes}`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur Stripe inconnue";
    console.error("[stripe/create-pi] échec Stripe :", e);
    await auditLog({
      action: "stripe.payment_intent.create_failed",
      tableName: "commandes_drive",
      recordId: commande_id,
      details: { montant_autorise_cents: montantAutoriseCentimes, error: msg },
    });
    return NextResponse.json(
      { error: "stripe_create_failed", detail: msg },
      { status: 500 },
    );
  }

  // 5. UPDATE commande
  const expireAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const { error: errUpd } = await sb
    .from("commandes_drive")
    .update({
      stripe_payment_intent_id: paymentIntent.id,
      montant_autorise_ttc: montantAutoriseTtc,
      statut_paiement: "autorise",
      autorisation_expire_at: expireAt,
    })
    .eq("id", commande_id);

  if (errUpd) {
    // On a un PI Stripe orphelin si l'UPDATE échoue. On le cancel pour
    // ne pas laisser de pré-auto fantôme.
    console.error("[stripe/create-pi] UPDATE Supabase échouée :", errUpd);
    try {
      await stripe().paymentIntents.cancel(paymentIntent.id);
    } catch (e) {
      console.error("[stripe/create-pi] cancel rollback échoué :", e);
    }
    return NextResponse.json(
      { error: "db_update_failed", detail: errUpd.message },
      { status: 500 },
    );
  }

  await auditLog({
    action: "stripe.payment_intent.authorized",
    tableName: "commandes_drive",
    recordId: commande_id,
    details: {
      payment_intent_id: paymentIntent.id,
      montant_autorise_cents: montantAutoriseCentimes,
    },
  });

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    montantAutoriseCents: montantAutoriseCentimes,
  });
}
