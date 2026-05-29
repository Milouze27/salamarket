/**
 * POST /api/casse-weekly-digest/send-now
 *
 * Envoi MANUEL du digest casse, pour la démo :
 *   - Otmane clique "envoyer maintenant", le mail arrive sur son
 *     iPhone en direct → effet wow plus fort que la promesse
 *     "tu le recevras lundi à 7h".
 *
 * Body JSON :
 *   { "to": "otmane@kafood.fr" | ["a@x", "b@y"], "now"?: ISO string }
 *
 * Si `to` absent → fallback CASSE_DIGEST_RECIPIENTS env.
 */
import { NextResponse } from "next/server";
import { computeCasseDigest } from "@/lib/casse-digest";
import {
  renderCasseDigestHtml,
  renderCasseDigestText,
} from "@/lib/casse-digest/template";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface SendNowBody {
  to?: string | string[];
  now?: string;
}

export async function POST(req: Request) {
  let body: SendNowBody = {};
  try {
    body = (await req.json()) as SendNowBody;
  } catch {
    // body optionnel
  }

  const now = body.now ? new Date(body.now) : new Date();
  if (isNaN(now.getTime())) {
    return NextResponse.json({ error: "Paramètre `now` invalide" }, { status: 400 });
  }

  const fallback = (process.env.CASSE_DIGEST_RECIPIENTS ?? process.env.EMAIL_MANAGER ?? "")
    .split(/[,;]\s*/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
  const toRaw = body.to ?? fallback;
  const recipients = (Array.isArray(toRaw) ? toRaw : [toRaw])
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));

  if (recipients.length === 0) {
    return NextResponse.json(
      {
        error:
          "Aucun destinataire. Fournir `to` dans le body ou définir CASSE_DIGEST_RECIPIENTS dans l'env.",
      },
      { status: 400 },
    );
  }

  let data;
  try {
    data = await computeCasseDigest(now);
  } catch (err) {
    console.error("[casse-weekly-digest/send-now] compute failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur calcul" },
      { status: 500 },
    );
  }

  const html = renderCasseDigestHtml(data);
  const text = renderCasseDigestText(data);
  const total = data.total_eur_semaine.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
  const subject = `Casse semaine : ${total}${data.delta_pct !== null ? ` (${data.delta_pct > 0 ? "+" : ""}${data.delta_pct}% vs S-1)` : ""} · 3 actions concrètes`;

  const origin = new URL(req.url).origin;
  const emailRes = await fetch(`${origin}/api/email/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ to: recipients, subject, html, text }),
  });
  const emailJson = (await emailRes.json().catch(() => ({}))) as {
    id?: string;
    error?: string;
  };

  return NextResponse.json(
    {
      ok: emailRes.ok,
      recipients,
      subject,
      total_eur: data.total_eur_semaine,
      delta_pct: data.delta_pct,
      email_id: emailJson.id ?? null,
      email_error: emailRes.ok ? null : emailJson.error ?? null,
    },
    { status: emailRes.ok ? 200 : 502 },
  );
}
