/**
 * QR code → SVG, rendu localement (zéro service externe).
 * ──────────────────────────────────────────────────────────────────
 * Le passeport halal /lot/:id affiche un QR re-scannable pointant vers
 * lui-même : un client peut le re-montrer, le re-scanner ou l'envoyer à
 * un proche. On NE veut PAS d'image tierce (api.qrserver, googlecharts…)
 * sur une page de PREUVE halal — dépendance réseau, tracking, point de
 * rupture si le service tombe, et le QR doit fonctionner même en
 * cache offline de la PWA.
 *
 * On encode donc le QR côté client avec `qrcode` (lib éprouvée,
 * conforme ISO/IEC 18004, des millions d'usages) puis on rend la
 * matrice nous-mêmes en SVG — un seul <path>, net à toute taille,
 * aux couleurs de la marque. On passe par l'API SYNCHRONE
 * `QRCode.create()` pour rester utilisable dans un useMemo React.
 *
 * Verrou de fiabilité : un QR de preuve halal DOIT être scannable.
 * On délègue l'encodage à une lib testée plutôt qu'à un encodeur
 * maison (risque de QR « qui a l'air bon » mais illisible).
 */

import QRCode from "qrcode";

interface QrOptions {
  size?: number;
  dark?: string;
  light?: string;
  margin?: number; // quiet zone, en modules
}

/**
 * Génère le SVG (string) d'un QR encodant `text`.
 * @returns le markup SVG, ou `null` si l'encodage échoue (texte vide…).
 */
export function qrSvg(text: string, opts: QrOptions = {}): string | null {
  if (!text) return null;
  const size = opts.size ?? 200;
  const dark = opts.dark ?? "#0F1A14";
  const light = opts.light ?? "#FFFFFF";
  const margin = opts.margin ?? 4;

  let qr: ReturnType<typeof QRCode.create>;
  try {
    // Niveau M (~15 %) : bon compromis robustesse / densité pour une URL.
    qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  } catch {
    return null;
  }

  const count: number = qr.modules.size;
  const get = (r: number, c: number): boolean => Boolean(qr.modules.get(r, c));

  const total = count + margin * 2;
  const cell = size / total;
  const cs = cell.toFixed(3);

  // Un seul <path> = bundle minimal + rendu net (shape-rendering crispEdges).
  let path = "";
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (get(r, c)) {
        const x = ((c + margin) * cell).toFixed(3);
        const y = ((r + margin) * cell).toFixed(3);
        path += `M${x} ${y}h${cs}v${cs}h-${cs}z`;
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" ` +
    `aria-label="QR code du lot">` +
    `<rect width="${size}" height="${size}" fill="${light}"/>` +
    `<path d="${path}" fill="${dark}"/>` +
    `</svg>`
  );
}
