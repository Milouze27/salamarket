"use server";

/**
 * Server action wrapper pour /api/push/send et /api/push/test.
 *
 * Permet aux composants client (PWA staff) de déclencher des web push
 * notifications sans exposer la valeur de INTERNAL_API_SECRET. La server
 * action lit le secret côté serveur et l'injecte dans le header
 * `x-internal-secret` que les routes /api/push/* vérifient pour bloquer
 * les abus de relais anonyme (sinon 5 push reçus par n'importe quel
 * scanner externe — incident vague 7).
 *
 * À utiliser depuis :
 *   import { sendPush } from "@/lib/actions/push-send";
 *   await sendPush({ title, body, employe_ids, ... });
 *
 * Ou pour le test PWA :
 *   import { sendPushTest } from "@/lib/actions/push-send";
 *   await sendPushTest({ employe_id });
 */

import { headers } from "next/headers";

interface PushSendPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  urgent?: boolean;
  employe_ids?: string[];
  alerte_id?: string;
}

interface PushSendResult {
  ok: boolean;
  sent?: number;
  failed?: number;
  total?: number;
  error?: string;
}

async function resolveOrigin(): Promise<string> {
  const h = await headers();
  const host =
    h.get("x-forwarded-host") ??
    h.get("host") ??
    process.env.VERCEL_URL ??
    "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function sendPush(
  payload: PushSendPayload,
): Promise<PushSendResult> {
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) {
    return {
      ok: false,
      error: "INTERNAL_API_SECRET non configuré côté serveur.",
    };
  }

  const origin = await resolveOrigin();
  try {
    const res = await fetch(`${origin}/api/push/send`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as {
      sent?: number;
      failed?: number;
      total?: number;
      error?: string;
    };
    if (!res.ok) {
      return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    }
    return {
      ok: true,
      sent: json.sent,
      failed: json.failed,
      total: json.total,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function sendPushTest(
  opts: { employe_id?: string } = {},
): Promise<PushSendResult> {
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) {
    return {
      ok: false,
      error: "INTERNAL_API_SECRET non configuré côté serveur.",
    };
  }

  const origin = await resolveOrigin();
  try {
    const res = await fetch(`${origin}/api/push/test`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify({ employe_id: opts.employe_id }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      sent?: number;
      failed?: number;
      total?: number;
      error?: string;
    };
    if (!res.ok) {
      return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    }
    return {
      ok: true,
      sent: json.sent,
      failed: json.failed,
      total: json.total,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
