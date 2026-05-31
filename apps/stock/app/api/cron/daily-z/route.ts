import { NextResponse } from "next/server";
import { computeDailyZ, todayIsoParis } from "@/lib/cashbox/daily-z";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Cron Vercel — tous les jours à 23h59 (Europe/Paris) via vercel.json.
 * Calcule le Z du jour courant et déclenche l'envoi email via /api/notify.
 *
 * SÉCURITÉ (durci 2026-05-31) : on REFUSE de servir si CRON_SECRET n'est
 * pas configuré, ou si l'auth ne match pas. Vercel injecte
 * Authorization: Bearer <CRON_SECRET> ET x-vercel-cron: 1 sur ses crons.
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron/daily-z] CRON_SECRET non configuré, refus de servir");
    return NextResponse.json(
      { error: "cron_misconfigured" },
      { status: 503 }
    );
  }
  const auth = req.headers.get("authorization");
  const vercelCron = req.headers.get("x-vercel-cron");
  if (auth !== `Bearer ${cronSecret}` && vercelCron !== "1") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const date = todayIsoParis();

  try {
    const summary = await computeDailyZ(date);
    const origin = new URL(req.url).origin;

    // Déclenche un email via /api/notify (channel WhatsApp ou email
    // selon config WHATSAPP_WEBHOOK_URL / EMAIL_*).
    const notifRes = await fetch(`${origin}/api/notify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // HOTFIX vague 7 : /api/notify exige x-internal-secret.
        "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
      },
      body: JSON.stringify({
        kind: "daily_z_auto",
        payload: {
          date,
          ca_ttc: summary.ca_ttc,
          nb_commandes: summary.nb_commandes,
          pdf_url: `${origin}/api/cashbox/daily-z-pdf?date=${date}`,
          csv_url: `${origin}/api/cashbox/daily-z-csv?date=${date}`,
        },
      }),
    });

    return NextResponse.json({
      ok: true,
      date,
      nb_commandes: summary.nb_commandes,
      ca_ttc: summary.ca_ttc,
      notify_status: notifRes.ok ? "sent" : "failed",
    });
  } catch (err) {
    console.error("[cron/daily-z] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur" },
      { status: 500 }
    );
  }
}
