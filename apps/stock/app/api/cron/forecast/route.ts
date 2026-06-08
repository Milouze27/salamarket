/**
 * GET /api/cron/forecast
 *
 * Cron Vercel toutes les 6h (`0 *‌/6 * * *`) — forwarde vers l'edge function
 * Supabase `forecast-stockouts` qui contient la logique Holt + hijri.
 *
 * Pourquoi un forward ? La fonction edge est déjà écrite et déployée,
 * mais le plan Supabase Free n'a pas accès aux schedulers Edge — donc
 * Vercel ping la function via HTTP. C'est le pattern recommandé.
 *
 * Auth : Bearer ${CRON_SECRET} côté Vercel + côté edge fn (transparent).
 */
import { NextResponse } from "next/server";
import { runForecastPushRules } from "@/lib/actions/push-rules";

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
  // Sinon n'importe qui peut déclencher la forecast Edge function et
  // burner les compute units Supabase.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[cron/forecast] CRON_SECRET non configuré, refus");
    return NextResponse.json(
      { error: "cron_misconfigured" },
      { status: 503 }
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
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
  const url = `${SUPABASE_URL}/functions/v1/forecast-stockouts`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
    });
    const body = await resp.json().catch(() => ({}));

    // ─── MYTH-08 — moteur de règles push (rupture blocker + casse) ───
    // Évalué APRÈS le recalcul forecast (les vues v_stockout_critiques
    // sont à jour). Best-effort : un échec ici ne fait pas rougir le cron.
    let push_rules: unknown = null;
    try {
      push_rules = await runForecastPushRules(resolveOrigin(req));
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
