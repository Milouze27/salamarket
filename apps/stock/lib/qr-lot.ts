/**
 * QR code helpers for halal lot traceability.
 *
 * Every lot in `produits_lots` is reachable via a public Drive page
 * `/lot/{id}`. We print a QR pointing at that URL on the ticket so
 * the customer can scan it from their phone, no app install.
 *
 * Uses bwip-js (already in deps for EAN-13 labels), which exposes a
 * `toSVG()` helper that returns a self-contained SVG string. No new
 * npm dependency required.
 */

const LOT_BASE_URL = "https://salamarket-drive.vercel.app/lot";

/**
 * Build the canonical public URL for a lot.
 *
 * @example generateLotQrUrl("L2026-05-A23")
 *   → "https://salamarket-drive.vercel.app/lot/L2026-05-A23"
 */
export function generateLotQrUrl(lotId: string): string {
  if (!lotId) throw new Error("generateLotQrUrl: lotId is required");
  return `${LOT_BASE_URL}/${encodeURIComponent(lotId)}`;
}

/**
 * Render a QR for the lot as an inline SVG string.
 *
 * Returns a self-contained SVG (no external refs, safe to inject
 * via dangerouslySetInnerHTML).
 *
 * bwip-js writes its own viewBox / width / height attributes ; we
 * post-process to force `width` and `height` to `size` pixels so
 * the SVG scales predictably inside our cards.
 *
 * Throws if bwip-js fails to encode (oversized input, etc.).
 */
export async function generateLotQrSvg(
  lotId: string,
  options: { size?: number } = {}
): Promise<string> {
  const size = options.size ?? 256;
  const url = generateLotQrUrl(lotId);

  // Dynamic import — keeps bwip-js out of the SSR bundle. This module
  // is only ever called from "use client" components. Use the
  // `/browser` entry to mirror `lib/labels/generate-pdf.ts`.
  const bwipjs = (await import("bwip-js/browser")).default;

  // `toSVG` exists at runtime on the browser build but isn't part of
  // the narrow TS types. We cast through `unknown` to call it ; the
  // runtime accepts the same option bag as `toCanvas`.
  const svg = (
    bwipjs as unknown as {
      toSVG: (opts: Record<string, unknown>) => string;
    }
  ).toSVG({
    bcid: "qrcode",
    text: url,
    scale: 4,
    eclevel: "M",
    backgroundcolor: "FFFFFF",
  });

  // Replace bwip-js' default width/height (in pt) with our pixel size,
  // and inject role/aria-label so the markup is accessible.
  return svg
    .replace(
      /<svg([^>]*)>/,
      `<svg$1 width="${size}" height="${size}" role="img" aria-label="QR code lot ${escapeXml(
        lotId
      )}">`
    )
    .replace(/\swidth="[^"]+"\swidth=/, ' width=')
    .replace(/\sheight="[^"]+"\sheight=/, ' height=');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
