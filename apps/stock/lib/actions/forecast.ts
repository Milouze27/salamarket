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
    // On NE renvoie JAMAIS le message d'erreur brut au client : il peut
    // exposer du SQL (« numeric field overflow », noms de colonnes…) qui
    // n'a aucun sens pour le manager et fait fuiter le schéma. Le détail
    // technique reste côté serveur (logs Vercel) ; l'UI reçoit un message
    // FR générique.
    console.error("[forecast] recompute échoué:", err);
    return {
      ok: false,
      error: "Le calcul des ruptures n'a pas pu aboutir. Réessaie dans un instant.",
    };
  }
}
