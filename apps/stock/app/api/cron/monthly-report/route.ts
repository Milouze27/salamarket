import { NextResponse } from "next/server";
import { computeMonthlyReport, previousMonthYYYYMM } from "@/lib/cashbox/monthly-report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  // SÉCURITÉ (durci 2026-05-31) : refuse si CRON_SECRET non configuré.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron/monthly-report] CRON_SECRET non configuré");
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
  const mois = previousMonthYYYYMM();
  try {
    const report = await computeMonthlyReport(mois);
    const origin = new URL(req.url).origin;
    const notif = await fetch(`${origin}/api/notify`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // HOTFIX vague 7 : /api/notify exige x-internal-secret.
        "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
      },
      body: JSON.stringify({
        kind: "monthly_report_auto",
        payload: {
          mois, ca_total: report.consolidation.ca_ttc_total,
          partial: report.magasin.partial,
          pdf_url: `${origin}/api/cashbox/monthly-report-pdf?mois=${mois}`,
          csv_url: `${origin}/api/cashbox/monthly-report-csv?mois=${mois}`,
        },
      }),
    });
    return NextResponse.json({
      ok: true, mois, ca_total: report.consolidation.ca_ttc_total,
      notify_status: notif.ok ? "sent" : "failed",
    });
  } catch (err) {
    console.error("[cron/monthly-report]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur" },
      { status: 500 }
    );
  }
}
