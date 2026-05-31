/**
 * GET /api/cron/dlc-scan
 *
 * Cron Vercel toutes les heures (`0 * * * *`) — forwarde vers l'edge function
 * Supabase `dlc-scan` qui scanne les produits proches DLC.
 *
 * Auth : Bearer ${CRON_SECRET} côté Vercel.
 */
import { NextResponse } from "next/server";

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
    return NextResponse.json(
      {
        ok: resp.ok,
        forwarded_to: url,
        duration_ms: Date.now() - t0,
        edge_status: resp.status,
        edge_body: body,
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
