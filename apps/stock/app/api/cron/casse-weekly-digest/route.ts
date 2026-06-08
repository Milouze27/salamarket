/**
 * GET /api/cron/casse-weekly-digest
 *
 * Cron Vercel hebdomadaire (lundi 07h Europe/Paris ≈ 05h UTC l'été,
 * 06h UTC l'hiver — on cale sur 06h UTC pour avoir au pire 08h Paris
 * en hiver et 08h Paris en été, plus simple qu'un double cron).
 *
 * Snippet à ajouter dans `apps/stock/vercel.json` (NE PAS éditer ici
 * pour respecter la consigne "NEW files only", l'orchestrateur le fera) :
 *
 *   {
 *     "path": "/api/cron/casse-weekly-digest",
 *     "schedule": "0 6 * * 1"
 *   }
 *
 * Auth : Bearer ${CRON_SECRET} si défini.
 * Destinataires : env CASSE_DIGEST_RECIPIENTS (CSV) ou fallback
 *                 EMAIL_MANAGER, sinon 503 explicite.
 */
import { NextResponse } from "next/server";
import { computeCasseDigest } from "@/lib/casse-digest";
import { renderCasseDigestHtml, renderCasseDigestText } from "@/lib/casse-digest/template";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  // SÉCURITÉ (durci 2026-05-31) : refuse si CRON_SECRET non configuré.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron/casse-weekly-digest] CRON_SECRET non configuré");
    return NextResponse.json(
      { error: "cron_misconfigured" },
      { status: 503 }
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Override `now` via ?now=ISO pour test depuis le preview (démo)
  const url = new URL(req.url);
  const nowParam = url.searchParams.get("now");
  const now = nowParam ? new Date(nowParam) : new Date();

  // ─── 1) Calcul du digest
  let data;
  try {
    data = await computeCasseDigest(now);
  } catch (err) {
    console.error("[cron/casse-weekly-digest] compute failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur calcul" },
      { status: 500 },
    );
  }

  // ─── 2) Destinataires
  const recipientsRaw =
    process.env.CASSE_DIGEST_RECIPIENTS ?? process.env.EMAIL_MANAGER ?? "";
  const recipients = recipientsRaw
    .split(/[,;]\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.includes("@"));

  // Mode "dry-run" : si pas de destinataire, on renvoie quand même
  // le digest calculé (utile pour vérifier que le cron tourne et que
  // la data tient debout, sans dépendre de Resend).
  if (recipients.length === 0) {
    console.warn("[cron/casse-weekly-digest] no recipients configured, dry-run only");
    return NextResponse.json({
      ok: true,
      dry_run: true,
      reason: "Définir CASSE_DIGEST_RECIPIENTS dans Vercel pour activer l'envoi",
      preview_url: "/api/casse-weekly-digest/preview",
      digest: data,
    });
  }

  // ─── 3) Envoi via /api/email/send (réutilise Resend déjà câblé)
  const html = renderCasseDigestHtml(data);
  const text = renderCasseDigestText(data);
  const subject = buildSubject(data);

  const origin = new URL(req.url).origin;
  let emailRes: Response;
  try {
    emailRes = await fetch(`${origin}/api/email/send`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-token": process.env.INTERNAL_API_SECRET ?? "",
      },
      body: JSON.stringify({ to: recipients, subject, html, text }),
    });
  } catch (err) {
    console.error("[cron/casse-weekly-digest] email send failed:", err);
    return NextResponse.json(
      { error: "Email transport failure", detail: String(err) },
      { status: 502 },
    );
  }

  const emailJson = (await emailRes.json().catch(() => ({}))) as {
    id?: string;
    error?: string;
  };

  console.log(
    `[cron/casse-weekly-digest] sent to ${recipients.length} recipient(s), ` +
      `total=${data.total_eur_semaine}€, delta=${data.delta_pct ?? "n/a"}%`,
  );

  return NextResponse.json({
    ok: emailRes.ok,
    sent_at: new Date().toISOString(),
    recipients,
    subject,
    total_eur: data.total_eur_semaine,
    delta_pct: data.delta_pct,
    nb_actions: data.actions.length,
    email_status: emailRes.ok ? "sent" : "failed",
    email_id: emailJson.id ?? null,
    email_error: emailRes.ok ? null : emailJson.error ?? null,
  });
}

function buildSubject(d: {
  total_eur_semaine: number;
  delta_pct: number | null;
}): string {
  const total = d.total_eur_semaine.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
  const delta = d.delta_pct === null
    ? ""
    : d.delta_pct > 0
    ? ` (+${d.delta_pct}% vs S-1)`
    : ` (${d.delta_pct}% vs S-1)`;
  return `Casse semaine : ${total}${delta} · 3 actions concrètes`;
}
