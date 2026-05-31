"use server";

/**
 * Server action wrapper pour /api/notify.
 *
 * Permet aux composants client (PWA staff) de déclencher une notification
 * interne (WhatsApp / log serveur) sans exposer la valeur de
 * INTERNAL_API_SECRET. La server action lit le secret côté serveur et
 * l'injecte dans le header `x-internal-secret` que l'API route /api/notify
 * vérifie pour rejeter les appels publics anonymes.
 *
 * À utiliser depuis tous les composants client :
 *   import { sendInternalNotify } from "@/lib/actions/notify";
 *   await sendInternalNotify({ kind: "...", payload: {...} });
 */

import { headers } from "next/headers";

interface NotifyPayload {
  kind: string;
  payload: unknown;
}

export async function sendInternalNotify(
  body: NotifyPayload,
): Promise<{ ok: boolean; delivered?: boolean; status?: number; error?: string }> {
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) {
    return {
      ok: false,
      error: "INTERNAL_API_SECRET non configuré côté serveur.",
    };
  }

  const h = await headers();
  const host =
    h.get("x-forwarded-host") ??
    h.get("host") ??
    process.env.VERCEL_URL ??
    "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}/api/notify`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      delivered?: boolean;
      status?: number;
      error?: string;
    };
    if (!res.ok) {
      return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    }
    return { ok: true, delivered: json.delivered, status: json.status };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
