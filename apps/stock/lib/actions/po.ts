"use server";

/**
 * Server action wrapper pour /api/po/send.
 *
 * /api/po/send envoie un bon de commande par email au FOURNISSEUR et bascule
 * le statut du PO en 'envoyee' : un appel externe anonyme déclencherait des
 * emails fournisseurs non autorisés (engagement commercial). La route exige
 * donc `x-internal-secret` ; cette server action injecte le secret côté
 * serveur sans jamais l'exposer au navigateur. Le client staff appelle cette
 * action au lieu d'un fetch direct.
 */

import { headers } from "next/headers";

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

export async function sendPoAction(
  poId: string,
): Promise<{ ok: boolean; email?: string; error?: string }> {
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) {
    return { ok: false, error: "INTERNAL_API_SECRET non configuré." };
  }
  const origin = await resolveOrigin();
  try {
    const res = await fetch(`${origin}/api/po/send`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify({ po_id: poId }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      email?: string;
      error?: string;
    };
    if (!res.ok) {
      return { ok: false, error: json?.error ?? "Erreur d'envoi" };
    }
    return { ok: true, email: json.email };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
