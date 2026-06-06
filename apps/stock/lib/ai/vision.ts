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
