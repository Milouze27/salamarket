/**
 * QR retrait — URLs scannables présentes sur le ticket client.
 *
 * Flow cible (post-démo) :
 *   1. Le client présente son QR au comptoir.
 *   2. Le staff scanne (caméra iPad ou douchette).
 *   3. La page `/retrait/[id]` POST sur l'API qui set `retired_at = now()`.
 *   4. La commande disparaît du `/v2/counter` (animation fade-out).
 *
 * Out of scope démo : la page /retrait/[id] elle-même + scanner hardware.
 * Cette utility se contente de générer l'URL pour embarquer dans un QR
 * (ticket PDF, email de confirmation « Votre commande est prête »).
 *
 * Pas de dépendance npm ajoutée (pas de `qrcode` lib) — la génération
 * d'image QR existante (bwip-js déjà installé pour les étiquettes carton)
 * peut encoder cette URL côté serveur si besoin.
 */

/**
 * Base URL du Stock app, override-able via env (utile pour preview
 * deployments / dev local). Fallback sur la prod.
 */
function getBaseUrl(): string {
  if (typeof process !== "undefined" && process.env) {
    const fromEnv =
      process.env.NEXT_PUBLIC_STOCK_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
    if (fromEnv) return fromEnv.replace(/\/$/, "");
  }
  return "https://salam-stock.vercel.app";
}

/**
 * Construit l'URL de retrait à encoder dans le QR client.
 *
 * @param commandeId UUID de `commandes_drive.id`
 * @returns ex: `https://salam-stock.vercel.app/retrait/abc-123`
 */
export function generateRetraitQrUrl(commandeId: string): string {
  if (!commandeId) {
    throw new Error("generateRetraitQrUrl: commandeId requis");
  }
  return `${getBaseUrl()}/retrait/${commandeId}`;
}
