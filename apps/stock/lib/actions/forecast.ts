"use server";

/**
 * Server action wrapper pour le recompute du forecast de stockout.
 *
 * Pourquoi : la route /api/forecast/recompute exige `CRON_SECRET` (Bearer ou
 * ?secret=) pour bloquer les hits externes — correct côté cron, mais le
 * bouton "Recompute" de /v2/forecast n'a pas ce secret côté navigateur et
 * tombait donc en 401 silencieux. Le manager ne pouvait jamais initialiser
 * le forecast en démo.
 *
 * Fix : on appelle directement `recomputeStockoutForecast()` côté serveur
 * (même fonction que la route, client service-role), sans round-trip HTTP ni
 * exposition du secret. La route HTTP reste verrouillée pour les crons.
 *
 * Usage côté client :
 *   import { triggerRecompute } from "@/lib/actions/forecast";
 *   const r = await triggerRecompute();
 */

import {
  recomputeStockoutForecast,
  type RecomputeSummary,
} from "@/lib/forecast/recompute";

export async function triggerRecompute(): Promise<{
  ok: boolean;
  data?: RecomputeSummary;
  error?: string;
}> {
  try {
    const data = await recomputeStockoutForecast();
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
