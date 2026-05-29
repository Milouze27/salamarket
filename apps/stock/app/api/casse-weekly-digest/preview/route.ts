/**
 * GET /api/casse-weekly-digest/preview
 *
 * Renvoie le DIGEST EN HTML directement (Content-Type: text/html) pour
 * que pendant la démo Otmane voie le rendu exact qu'il recevrait par
 * mail, sans avoir à configurer Resend ni attendre lundi 7h.
 *
 * Query params :
 *   - ?now=YYYY-MM-DD  → simule un calcul à une date arbitraire
 *   - ?format=json     → renvoie la data brute au lieu du HTML
 *   - ?format=text     → version texte (utile pour debug)
 */
import { NextResponse } from "next/server";
import { computeCasseDigest } from "@/lib/casse-digest";
import {
  renderCasseDigestHtml,
  renderCasseDigestText,
} from "@/lib/casse-digest/template";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const nowParam = url.searchParams.get("now");
  const format = (url.searchParams.get("format") ?? "html").toLowerCase();
  const now = nowParam ? new Date(nowParam) : new Date();

  if (isNaN(now.getTime())) {
    return NextResponse.json(
      { error: "Paramètre `now` invalide (format ISO attendu)" },
      { status: 400 },
    );
  }

  let data;
  try {
    data = await computeCasseDigest(now);
  } catch (err) {
    console.error("[casse-weekly-digest/preview] compute failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur calcul" },
      { status: 500 },
    );
  }

  if (format === "json") {
    return NextResponse.json(data);
  }
  if (format === "text") {
    return new Response(renderCasseDigestText(data), {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const html = renderCasseDigestHtml(data);
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Pas de cache : on veut un calcul frais à chaque ouverture
      // pendant la démo, et la query peut changer.
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
