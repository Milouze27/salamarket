"use client";

/**
 * lib/labels/barcode.ts — Helpers code-barres robustes (PDF-04).
 *
 * Mutualise la génération bwip-js côté navigateur pour les étiquettes
 * Brother + gondole :
 *   - validation EAN-13 (check-digit) ;
 *   - dédup : un même EAN n'est rendu qu'UNE fois (cache Map) ;
 *   - fallback Code128 sur le SKU/ID quand l'EAN est absent ou invalide ;
 *   - quiet-zone garantie (padding bwip-js).
 *
 * Le cache est par-appel (passé par le builder) pour ne pas garder en
 * mémoire des data URLs entre deux générations.
 */

export type BarcodeKind = "ean13" | "code128";

/** Préfixe GS1 réservé aux codes internes magasin (numérotation interne 290). */
export const INTERNAL_EAN_PREFIX = "290";

/**
 * Check-digit EAN-13 (Luhn pondéré 1/3) à partir des 12 premiers chiffres.
 * Positions 0-based : index pair ×1, index impair ×3 ; complément à 10.
 *
 * @example ean13CheckDigit("301762042200") // 3 (Nutella)
 */
export function ean13CheckDigit(twelveDigits: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = twelveDigits.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Génère un EAN-13 interne valide (préfixe 290) pour un produit sans
 * code-barres fabricant. `seq` est un numéro de séquence magasin ; on le
 * zéro-pad sur 9 chiffres puis on calcule le check-digit À LA SOURCE.
 *
 * C'est ICI qu'il faut produire les codes internes : ne jamais coller le
 * numéro d'ordre comme 13e chiffre (bug historique des EAN 2900200000011…
 * dont le dernier chiffre valait l'ordre au lieu du check-digit calculé).
 *
 * @example makeInternalEan13(1) // "2900000000018"
 */
export function makeInternalEan13(seq: number): string {
  const body = String(Math.trunc(Math.abs(seq))).padStart(9, "0").slice(-9);
  const twelve = INTERNAL_EAN_PREFIX + body;
  return twelve + String(ean13CheckDigit(twelve));
}

/**
 * Répare un EAN-13 interne dont SEUL le check-digit est faux : recalcule le
 * 13e chiffre sur les 12 premiers. Renvoie null si l'entrée n'est pas un code
 * interne (préfixe 290) de 13 chiffres — on ne « répare » jamais un EAN
 * fabricant (le faux check-digit y signale une vraie erreur de saisie).
 */
export function repairInternalEan13(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const ean = raw.trim();
  if (!/^\d{13}$/.test(ean)) return null;
  if (!ean.startsWith(INTERNAL_EAN_PREFIX)) return null;
  const twelve = ean.slice(0, 12);
  return twelve + String(ean13CheckDigit(twelve));
}

export interface BarcodeResult {
  /** PNG data URL prêt pour jsPDF.addImage(..., "PNG", ...). */
  dataUrl: string;
  /** Type effectivement encodé (peut différer du souhait si fallback). */
  kind: BarcodeKind;
  /** Texte effectivement encodé. */
  text: string;
}

/**
 * Valide un EAN-13 : 13 chiffres + check-digit correct (modulo 10).
 *
 * @example isValidEan13("3017620422003") // true (Nutella)
 */
export function isValidEan13(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const ean = raw.trim();
  if (!/^\d{13}$/.test(ean)) return false;
  return ean13CheckDigit(ean.slice(0, 12)) === ean.charCodeAt(12) - 48;
}

/**
 * Choisit le code-barres à imprimer pour un produit :
 *   - EAN-13 valide → ean13 ;
 *   - code interne 290 à check-digit faux → ean13 RÉPARÉ (option défensive :
 *     on recalcule le 13e chiffre plutôt que de retomber en Code128, sinon
 *     un code interne ne serait pas scannable comme EAN en caisse) ;
 *   - sinon, si un SKU/identifiant est fourni → code128 (fallback) ;
 *   - sinon → null (rien d'imprimable, l'appelant gère).
 *
 * `repaired:true` signale à l'appelant que l'EAN imprimé diffère de la donnée
 * source (utile pour avertir l'utilisateur / corriger la DB plus tard).
 */
export function pickBarcode(
  ean: string | null | undefined,
  fallbackSku?: string | null
): { kind: BarcodeKind; text: string; repaired?: boolean } | null {
  if (isValidEan13(ean)) return { kind: "ean13", text: ean!.trim() };
  const repaired = repairInternalEan13(ean);
  if (repaired) return { kind: "ean13", text: repaired, repaired: true };
  const sku = (fallbackSku ?? "").trim();
  if (sku) return { kind: "code128", text: sku };
  return null;
}

/**
 * Rend un code-barres en PNG data URL (canvas → toDataURL), avec dédup
 * via le cache fourni. La clé de cache = `${kind}:${text}`.
 *
 * @param cache Map réutilisée sur tout le batch pour éviter de
 *   re-rasteriser le même code (gain réel sur 200+ étiquettes).
 * @returns BarcodeResult ou null si bwip-js échoue (l'appelant dessine
 *   alors un fallback texte).
 */
export async function renderBarcodePng(
  spec: { kind: BarcodeKind; text: string },
  cache: Map<string, string>,
  opts: { scale?: number; height?: number; includetext?: boolean } = {}
): Promise<BarcodeResult | null> {
  const cacheKey = `${spec.kind}:${spec.text}`;
  const cached = cache.get(cacheKey);
  if (cached) return { dataUrl: cached, kind: spec.kind, text: spec.text };

  try {
    const bwipjs = (await import("bwip-js/browser")).default;
    const canvas = document.createElement("canvas");
    bwipjs.toCanvas(canvas, {
      bcid: spec.kind,
      text: spec.text,
      scale: opts.scale ?? 2,
      height: opts.height ?? 12,
      includetext: opts.includetext ?? true,
      textxalign: "center",
      textsize: 7,
      paddingwidth: 2, // quiet-zone horizontale
      backgroundcolor: "FFFFFF",
    } as Parameters<typeof bwipjs.toCanvas>[1]);
    const dataUrl = canvas.toDataURL("image/png");
    cache.set(cacheKey, dataUrl);
    return { dataUrl, kind: spec.kind, text: spec.text };
  } catch (e) {
    console.error("[barcode] render fail", spec, e);
    return null;
  }
}
