/**
 * GET /api/hijri/seasonal-mode
 *
 * Expose le MODE SAISONNIER hijri courant (MYTH-05) au client : titre,
 * compte à rebours, multiplicateurs de demande par catégorie, checklist
 * de constitution de stocks. Tout est calculé in-memory depuis lib/hijri
 * (pas de roundtrip DB) → réponse < 5ms.
 *
 * Renvoie { active: false } hors fenêtre saisonnière. Public (lecture
 * seule, aucune donnée business sensible — c'est du calendrier).
 */
import { NextResponse } from "next/server";
import { getSeasonalMode, getHijriContext } from "@/lib/hijri";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  const mode = getSeasonalMode();
  const ctx = getHijriContext();

  if (!mode) {
    return NextResponse.json(
      {
        active: false,
        // On renvoie quand même le prochain événement pour que la card
        // garde son countdown hors saison.
        prochain_libelle: ctx.prochain?.libelle ?? null,
        jours_jusqua: ctx.jours_jusqua,
        message: ctx.message,
      },
      { headers: { "cache-control": "public, max-age=300" } },
    );
  }

  return NextResponse.json(
    { active: true, mode },
    { headers: { "cache-control": "public, max-age=300" } },
  );
}
