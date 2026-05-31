"use server";

/**
 * Server action wrapper pour /api/email/send.
 *
 * Permet aux composants client (PWA staff) de déclencher un envoi email
 * sans exposer la valeur de INTERNAL_API_SECRET. La server action lit
 * le secret côté serveur et l'injecte dans le header `x-internal-token`
 * que l'API route /api/email/send vérifie pour rejeter les abus de
 * relais spam anonyme.
 *
 * À utiliser depuis tous les composants client :
 *   import { sendOperationalEmail } from "@/lib/actions/email-send";
 *   await sendOperationalEmail({ to, subject, html });
 */

import { headers } from "next/headers";

interface SendEmailPayload {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}

export async function sendOperationalEmail(
  payload: SendEmailPayload,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) {
    return {
      ok: false,
      error: "INTERNAL_API_SECRET non configuré côté serveur.",
    };
  }

  // Construit l'URL absolue de l'API route à partir des headers (Vercel
  // ou local). VERCEL_URL ne marche pas en preview pour le host courant,
  // on préfère le host de la requête entrante.
  const h = await headers();
  const host =
    h.get("x-forwarded-host") ??
    h.get("host") ??
    process.env.VERCEL_URL ??
    "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}/api/email/send`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-token": internalSecret,
      },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      error?: string;
    };
    if (!res.ok) {
      return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    }
    return { ok: true, id: json.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
