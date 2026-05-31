import { NextResponse } from "next/server";
import { computeMonthlyReport, currentMonthYYYYMM } from "@/lib/cashbox/monthly-report";

export const dynamic = "force-dynamic";

/**
 * AUTH (HOTFIX vague 7) : refuse les appels anonymes — la route expose
 * du P&L (CA TTC, TVA collectée, top produits). Accepte :
 *   - header `x-internal-secret` = INTERNAL_API_SECRET (server actions)
 *   - header `authorization: Bearer <CRON_SECRET>` (cron Vercel)
 *   - header `x-vercel-cron: 1` (cron Vercel runtime)
 */
function checkAuth(req: Request): { ok: boolean; error?: string; status?: number } {
  const internalSecret = process.env.INTERNAL_API_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  if (!internalSecret && !cronSecret) {
    return {
      ok: false,
      status: 503,
      error: "monthly-report misconfigured (INTERNAL_API_SECRET or CRON_SECRET required)",
    };
  }
  const provided = req.headers.get("x-internal-secret");
  if (internalSecret && provided === internalSecret) return { ok: true };
  const auth = req.headers.get("authorization");
  if (cronSecret && auth === `Bearer ${cronSecret}`) return { ok: true };
  const vercelCron = req.headers.get("x-vercel-cron");
  if (cronSecret && vercelCron === "1") return { ok: true };
  return { ok: false, status: 401, error: "unauthorized" };
}

export async function GET(req: Request) {
  const auth = checkAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const url = new URL(req.url);
  const mois = url.searchParams.get("mois") || currentMonthYYYYMM();
  if (!/^\d{4}-\d{2}$/.test(mois)) {
    return NextResponse.json({ error: "mois must be YYYY-MM" }, { status: 400 });
  }
  try {
    return NextResponse.json(await computeMonthlyReport(mois));
  } catch (err) {
    console.error("[monthly-report]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur" },
      { status: 500 }
    );
  }
}
