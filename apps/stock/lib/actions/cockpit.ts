"use server";

/**
 * Server action wrapper pour /api/cockpit/snapshot.
 *
 * Le snapshot expose des données opérationnelles internes (CA hier, top
 * stockouts, casse, competitor intel). Doit pas fuiter à un scan externe.
 * Protection : x-internal-secret côté API route, injecté ici côté serveur.
 *
 * Usage côté client :
 *   import { loadCockpitSnapshot } from "@/lib/actions/cockpit";
 *   const r = await loadCockpitSnapshot(depotId);
 */

import { headers } from "next/headers";
import type { CockpitSnapshot } from "@/app/api/cockpit/snapshot/route";
import type { CockpitBriefing } from "@/app/api/cockpit/briefing/route";

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

export async function loadCockpitSnapshot(
  depotId?: string,
): Promise<{ ok: boolean; data?: CockpitSnapshot; error?: string }> {
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) {
    return { ok: false, error: "INTERNAL_API_SECRET non configuré." };
  }

  const origin = await resolveOrigin();
  const params = depotId ? `?depot_id=${encodeURIComponent(depotId)}` : "";
  try {
    const res = await fetch(`${origin}/api/cockpit/snapshot${params}`, {
      headers: { "x-internal-secret": internalSecret },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => `HTTP ${res.status}`);
      return { ok: false, error: text.slice(0, 200) };
    }
    const data = (await res.json()) as CockpitSnapshot;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Server action wrapper pour /api/cockpit/briefing (MYTH-02 copilote).
 *
 * Même pattern d'auth que loadCockpitSnapshot : on injecte le secret
 * côté serveur. Le briefing est résilient (l'API fallback toujours sur
 * un brief brut ou vide) donc cette action ne devrait jamais throw —
 * on enveloppe quand même par sécurité.
 */
export async function loadCockpitBriefing(
  depotId?: string,
): Promise<{ ok: boolean; data?: CockpitBriefing; error?: string }> {
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) {
    return { ok: false, error: "INTERNAL_API_SECRET non configuré." };
  }

  const origin = await resolveOrigin();
  const params = depotId ? `?depot_id=${encodeURIComponent(depotId)}` : "";
  try {
    const res = await fetch(`${origin}/api/cockpit/briefing${params}`, {
      headers: { "x-internal-secret": internalSecret },
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => `HTTP ${res.status}`);
      return { ok: false, error: text.slice(0, 200) };
    }
    const data = (await res.json()) as CockpitBriefing;
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
