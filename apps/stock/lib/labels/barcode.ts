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
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = ean.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? d : d * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === ean.charCodeAt(12) - 48;
}

/**
 * Choisit le code-barres à imprimer pour un produit :
 *   - EAN-13 valide → ean13 ;
 *   - sinon, si un SKU/identifiant est fourni → code128 (fallback) ;
 *   - sinon → null (rien d'imprimable, l'appelant gère).
 */
export function pickBarcode(
  ean: string | null | undefined,
  fallbackSku?: string | null
): { kind: BarcodeKind; text: string } | null {
  if (isValidEan13(ean)) return { kind: "ean13", text: ean!.trim() };
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
