/**
 * /api/forecast/recompute
 *
 * Force recompute du moteur de stockout prédictif. Trois usages :
 *   1. DEMO   : pendant la démo Otmane, on clique un bouton qui appelle
 *               cette route pour rejouer le calcul live → il voit la
 *               page /v2/forecast se mettre à jour devant lui.
 *   2. DEV    : on a édité hijri_demand_curve, on veut voir l'effet
 *               sans attendre le cron.
 *   3. CRON   : la cron Vercel ou Supabase hit cette route en HMAC
 *               (CRON_SECRET) — toutes les heures de 06:00 à 22:00,
 *               toutes les 15 minutes en fenêtre Ramadan/iftar.
 *
 * Pas de payload côté POST — la phase hijri se résout côté serveur à
 * partir de l'heure courante.
 *
 * Auth :
 *   - Si `CRON_SECRET` est défini → on exige `Authorization: Bearer X`
 *     OU `?secret=X` en query (pour les hits manuels depuis l'iPhone
 *     d'Otmane sans header).
 *   - Sinon (dev local) → libre.
 */

import { NextResponse } from "next/server";
import { recomputeStockoutForecast } from "@/lib/forecast/recompute";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// On laisse 60s — le recompute touche stock_par_depot + ventes_cashmag_import
// pour 1k-3k couples, ça reste largement sous la seconde sur Vercel.
export const maxDuration = 60;

function authOk(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev mode
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}

async function handle(req: Request) {
  if (!authOk(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const t0 = Date.now();
    const summary = await recomputeStockoutForecast();
    const ms = Date.now() - t0;
    return NextResponse.json({
      ok: true,
      duration_ms: ms,
      ...summary,
    });
  } catch (err) {
    console.error("[/api/forecast/recompute] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur" },
      { status: 500 },
    );
  }
}

// GET pour les hits navigateur/cron URL-only, POST pour les UI buttons.
export const GET = handle;
export const POST = handle;
