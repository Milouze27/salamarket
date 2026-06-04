/**
 * GET /api/cron/dlc-scan
 *
 * Cron Vercel toutes les heures (`0 * * * *`) — forwarde vers l'edge function
 * Supabase `dlc-scan` qui scanne les produits proches DLC.
 *
 * Auth : Bearer ${CRON_SECRET} côté Vercel.
 */
import { NextResponse } from "next/server";
import { runDlcPushRules } from "@/lib/actions/push-rules";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Origin de l'app (pour rappeler /api/push/send en interne). */
function resolveOrigin(req: Request): string {
  const h = req.headers;
  const host =
    h.get("x-forwarded-host") ??
    h.get("host") ??
    (process.env.VERCEL_URL ? process.env.VERCEL_URL : "localhost:3000");
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function GET(req: Request) {
  // SÉCURITÉ (durci HOTFIX vague 7) : refuse si CRON_SECRET non configuré.
  // Sinon n'importe qui peut déclencher le scan et burner les quotas Edge.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron/dlc-scan] CRON_SECRET non configuré, refus de servir");
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

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Supabase env vars not configured" },
      { status: 500 },
    );
  }

  const t0 = Date.now();
  const url = `${SUPABASE_URL}/functions/v1/dlc-scan`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
    });
    const body = await resp.json().catch(() => ({}));

    // ─── MYTH-08 — moteur de règles push (DLC forcé du jour) ─────────
    // On évalue les règles APRÈS le scan edge (les vues sont à jour) et
    // de façon best-effort : un échec ici ne doit pas faire passer le
    // cron en rouge. Les quiet hours + dedup sont gérés dans le moteur.
    let push_rules: unknown = null;
    try {
      push_rules = await runDlcPushRules(resolveOrigin(req));
    } catch (e) {
      push_rules = { error: e instanceof Error ? e.message : "push_rules failed" };
    }

    return NextResponse.json(
      {
        ok: resp.ok,
        forwarded_to: url,
        duration_ms: Date.now() - t0,
        edge_status: resp.status,
        edge_body: body,
        push_rules,
      },
      { status: resp.ok ? 200 : 502 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "fetch failed",
        duration_ms: Date.now() - t0,
      },
      { status: 500 },
    );
  }
}
