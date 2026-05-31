/**
 * POST /api/notify
 * Body: { kind: string, payload: any }
 * Forwards to WHATSAPP_WEBHOOK_URL if configured. Otherwise just logs server-side.
 * Returns { delivered: boolean }
 */

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  // ─── AUTH : header x-internal-secret obligatoire (HOTFIX vague 7) ────
  // Sinon n'importe qui peut spammer le webhook WhatsApp / logs serveur
  // avec n'importe quel `kind` arbitraire. Les callers internes
  // (server actions, crons, autres routes) passent le secret.
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) {
    console.error("[notify] INTERNAL_API_SECRET non configuré, refus.");
    return NextResponse.json(
      { error: "notify service misconfigured (INTERNAL_API_SECRET missing)" },
      { status: 503 }
    );
  }
  const provided = req.headers.get("x-internal-secret");
  if (provided !== internalSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as
    | { kind: string; payload: unknown }
    | null;
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  const url = process.env.WHATSAPP_WEBHOOK_URL;
  if (!url) {
    console.log("[notify]", body.kind, JSON.stringify(body.payload));
    return NextResponse.json({ delivered: false, reason: "no_webhook" });
  }
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return NextResponse.json({ delivered: r.ok, status: r.status });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ delivered: false, reason: "fetch_failed" });
  }
}
