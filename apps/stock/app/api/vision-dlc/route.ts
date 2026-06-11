/**
 * POST /api/vision-dlc
 * Body: { photo_data_url: string }
 * Returns: { dlc, ddm, date_abattage, supplier_lot, lisible, notes, ia_unavailable }
 *
 * Scan-vision DLC : pré-remplit les dates d'un LOT halal à partir d'une
 * photo du carton / étiquette à la réception. L'employé scanne le carton,
 * l'IA lit la DLC / date d'abattage / n° de lot, et l'UI propose les
 * valeurs à confirmer (jamais d'écriture auto sans validation humaine).
 *
 * Fail-closed : si la clé API est absente ou l'appel échoue, on renvoie
 * toutes les dates à null + ia_unavailable:true. L'employé saisit alors
 * les dates à la main — l'app ne crashe jamais et n'invente aucune DLC
 * (une DLC fausse = produit périmé gardé, ou produit sain jeté).
 *
 * Réutilise le pattern vision existant (lib/ai/vision.ts) comme
 * /api/vision-coherence et /api/vision-product-recognition.
 */

import { NextResponse } from "next/server";
import {
  callClaudeVision,
  extractJson,
  parseImageDataUrl,
  normalizeIsoDate,
  DLC_VISION_SYSTEM,
  DLC_VISION_USER_TEXT,
} from "@/lib/ai/vision";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

interface DlcRequest {
  photo_data_url: string;
}

interface DlcResult {
  dlc: string | null;
  ddm: string | null;
  date_abattage: string | null;
  supplier_lot: string | null;
  lisible: boolean;
  notes: string;
  ia_unavailable: boolean;
}

/** Réponse fail-closed : aucune date pré-remplie, saisie manuelle requise. */
function failClosed(notes: string): DlcResult {
  return {
    dlc: null,
    ddm: null,
    date_abattage: null,
    supplier_lot: null,
    lisible: false,
    notes,
    ia_unavailable: true,
  };
}

export async function POST(req: Request) {
  // Rate-limit : route client-facing qui appelle l'API Claude (coûteuse).
  // 20 req/min/IP suffit pour une saisie de réception et bloque l'abus.
  const rl = checkRateLimit(getClientIp(req), "vision-dlc", 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: DlcRequest;
  try {
    body = (await req.json()) as DlcRequest;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const image = parseImageDataUrl(body?.photo_data_url);
  if (!image) {
    return NextResponse.json({ error: "invalid_image" }, { status: 400 });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    // Fail-closed : pas de date inventée, saisie manuelle.
    return NextResponse.json(
      failClosed("IA indisponible (clé non configurée) — saisie manuelle."),
    );
  }

  const call = await callClaudeVision({
    apiKey: key,
    image,
    system: DLC_VISION_SYSTEM,
    userText: DLC_VISION_USER_TEXT,
    maxTokens: 400,
  });

  if (!call.ok) {
    return NextResponse.json(
      failClosed(`IA indisponible (${call.error}) — saisie manuelle.`),
    );
  }

  const parsed = extractJson(call.text) as Record<string, unknown>;
  if (Object.keys(parsed).length === 0) {
    return NextResponse.json(
      failClosed("Réponse IA illisible — saisie manuelle."),
    );
  }

  // Garde serveur : on ne fait JAMAIS confiance au format renvoyé par l'IA.
  // normalizeIsoDate rejette toute chaîne non-ISO ou date impossible.
  const dlc = normalizeIsoDate(parsed.dlc);
  const ddm = normalizeIsoDate(parsed.ddm);
  const dateAbattage = normalizeIsoDate(parsed.date_abattage);
  const supplierLot =
    typeof parsed.supplier_lot === "string" && parsed.supplier_lot.trim()
      ? parsed.supplier_lot.trim().slice(0, 80)
      : null;
  const lisible = Boolean(dlc || ddm || dateAbattage || supplierLot);

  const result: DlcResult = {
    dlc,
    ddm,
    date_abattage: dateAbattage,
    supplier_lot: supplierLot,
    lisible,
    notes:
      typeof parsed.notes === "string" && parsed.notes.trim()
        ? parsed.notes.trim().slice(0, 200)
        : lisible
          ? "Dates lues sur l'étiquette — à confirmer."
          : "Aucune date lisible sur la photo.",
    ia_unavailable: false,
  };
  return NextResponse.json(result);
}
