/**
 * lib/ai/vision.ts — helper partagé pour les appels vision Claude.
 *
 * Factorise le parsing data-URL + l'appel HTTP Anthropic + l'extraction JSON
 * utilisés par /api/vision-product-recognition et /api/vision-coherence.
 *
 * Règle métier : PAS de mock laxiste. Si la clé est absente ou l'appel échoue,
 * l'appelant doit échouer de manière explicite (fail-closed), jamais renvoyer
 * un faux score complaisant (cf. bug « 80 % sur une photo de PC »).
 */

/** Modèle vision standard de l'app (cf. app/api/assistant/route.ts). */
export const CLAUDE_VISION_MODEL = "claude-sonnet-4-6";

export interface ParsedImage {
  mediaType: string;
  base64: string;
}

/** ~500 chars de base64 ≈ 375 octets : en dessous, l'image est vide/corrompue. */
const MIN_BASE64_LEN = 500;
/** ~15M chars de base64 ≈ 11 Mo : au-delà, on refuse (limite API + anti-OOM). */
const MAX_BASE64_LEN = 15_000_000;

/** Extrait media type + base64 d'une data-URL `data:image/...;base64,...`. */
export function parseImageDataUrl(dataUrl: unknown): ParsedImage | null {
  if (typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.*)$/i);
  if (!m) return null;
  const base64 = m[2];
  if (base64.length < MIN_BASE64_LEN || base64.length > MAX_BASE64_LEN) {
    return null;
  }
  return { mediaType: m[1], base64 };
}

export interface VisionCallArgs {
  apiKey: string;
  image: ParsedImage;
  system?: string;
  userText: string;
  maxTokens?: number;
  /** Surcharge optionnelle du modèle. */
  model?: string;
}

export type VisionCallResult =
  | { ok: true; text: string }
  | { ok: false; status: number; error: string };

/**
 * Appelle l'API messages d'Anthropic avec une image + un prompt texte.
 * Renvoie le texte brut de la réponse (à parser par l'appelant via {@link extractJson}).
 */
export async function callClaudeVision(
  args: VisionCallArgs,
): Promise<VisionCallResult> {
  const { apiKey, image, system, userText, maxTokens = 600, model } = args;
  let r: Response;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: model ?? CLAUDE_VISION_MODEL,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: image.mediaType,
                  data: image.base64,
                },
              },
              { type: "text", text: userText },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    console.error("[vision] network error", err);
    return { ok: false, status: 0, error: "network" };
  }

  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    console.error("[vision] anthropic error", r.status, errText);
    return { ok: false, status: r.status, error: "anthropic_failure" };
  }

  const json = (await r.json().catch(() => null)) as {
    content?: Array<{ text?: string }>;
  } | null;
  const text = json?.content?.[0]?.text ?? "";
  return { ok: true, text };
}

/**
 * Prompt vision pour lire les dates d'un carton/étiquette produit à la
 * réception (DLC, date d'abattage, n° de lot fournisseur).
 *
 * Réutilise le même contrat fail-closed que les autres routes vision : si
 * une date n'est pas LISIBLE avec certitude sur la photo, l'IA renvoie null
 * (jamais une date inventée — une DLC fausse fait sortir un produit du
 * catalogue à tort ou en garde un périmé). Les dates sont normalisées au
 * format ISO `YYYY-MM-DD`.
 */
export const DLC_VISION_SYSTEM =
  "Tu es un assistant de réception en épicerie halal. Tu lis les étiquettes " +
  "et tampons imprimés sur un carton ou un emballage produit pour en extraire " +
  "les dates et le numéro de lot. Tu retournes STRICTEMENT du JSON valide, " +
  "sans préambule ni markdown. Règle absolue : tu ne DEVINES jamais une date. " +
  "Si une information n'est pas lisible avec certitude sur la photo, tu mets " +
  "null pour ce champ. Une date inventée est pire qu'une date absente.";

/** Texte utilisateur du prompt DLC (champs attendus en sortie). */
export const DLC_VISION_USER_TEXT = [
  "Lis cette photo d'un carton / emballage / étiquette produit.",
  "Extrais UNIQUEMENT ce qui est réellement imprimé. Réponds STRICTEMENT en JSON :",
  "{",
  '  "dlc": "<YYYY-MM-DD|null>",            // Date Limite de Consommation (à consommer jusqu\'au / DLC / use by)',
  '  "ddm": "<YYYY-MM-DD|null>",            // Date de Durabilité Minimale (à consommer de préférence avant / DDM / DLUO / best before)',
  '  "date_abattage": "<YYYY-MM-DD|null>",  // date d\'abattage si présente (viande halal)',
  '  "supplier_lot": "<string|null>",       // numéro de lot fournisseur (LOT / L. / Batch)',
  '  "lisible": <bool>,                     // true si AU MOINS une date a pu être lue',
  '  "notes": "<analyse courte 1 phrase en français>"',
  "}",
  "",
  "Règles :",
  "- Convertis toute date au format ISO YYYY-MM-DD (ex: 03/06/2026 → 2026-06-03).",
  "- Si le format est ambigu (JJ/MM vs MM/JJ), privilégie le format français JJ/MM/AAAA.",
  "- Si une date n'est pas lisible avec certitude, mets null — n'invente jamais.",
  "- Si la photo ne montre aucune étiquette de date exploitable → lisible=false, toutes les dates null.",
].join("\n");

/**
 * Normalise une valeur de date renvoyée par l'IA en `YYYY-MM-DD` strict,
 * ou null. Rejette toute chaîne qui n'est pas une date ISO plausible
 * (garde-fou serveur : on n'écrit jamais une DLC mal formée en DB).
 */
export function normalizeIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  // Re-sérialise pour rejeter les dates impossibles (ex: 2026-02-31).
  return d.toISOString().slice(0, 10) === v ? v : null;
}

/**
 * Extrait le premier objet JSON d'une réponse texte (tolère ```json …``` et
 * le préambule éventuel). Renvoie `{}` si rien d'exploitable.
 */
export function extractJson(text: string): Record<string, unknown> {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as Record<string, unknown>;
      } catch {
        return {};
      }
    }
    return {};
  }
}
