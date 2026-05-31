/**
 * GET /api/cron/refresh-cockpit
 *
 * Cron Vercel quotidien (`0 1 * * *` UTC → 02h Paris hiver / 03h Paris été).
 * Rafraîchit la materialized view mv_ventes_quotidiennes (snapshot matin Otmane)
 * + v_casse_baseline_28j + v_casse_pic_horaire (digest casse hebdo).
 *
 * Miroir Vercel de la Supabase Edge function `refresh-cockpit-cache`.
 * Les deux peuvent tourner en parallèle, REFRESH MATERIALIZED VIEW
 * CONCURRENTLY est idempotent + thread-safe.
 *
 * Auth : Bearer ${CRON_SECRET} si défini.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Supabase env vars not configured" },
      { status: 500 },
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const startTotal = Date.now();
  const results: Array<{ task: string; ok: boolean; duration_ms: number; error?: string }> = [];

  // ─── Task 1 : refresh MV ventes quotidiennes
  {
    const t0 = Date.now();
    const { error } = await supabase.rpc("refresh_mv_ventes_quotidiennes");
    results.push({
      task: "refresh_mv_ventes_quotidiennes",
      ok: !error,
      duration_ms: Date.now() - t0,
      error: error?.message,
    });
  }

  // ─── Task 2 : refresh casse views (optional, ne fail pas si absent)
  {
    const t0 = Date.now();
    const { error } = await supabase.rpc("refresh_casse_views");
    results.push({
      task: "refresh_casse_views",
      ok: !error,
      duration_ms: Date.now() - t0,
      error: error?.message,
    });
  }

  const allOk = results.every((r) => r.ok || r.task === "refresh_casse_views");

  return NextResponse.json(
    {
      ok: allOk,
      refreshed_at: new Date().toISOString(),
      total_duration_ms: Date.now() - startTotal,
      results,
    },
    { status: allOk ? 200 : 500 },
  );
}
