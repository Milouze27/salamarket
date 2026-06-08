"use server";

/**
 * Server actions : génèrent une URL signée (token HMAC qui expire) pour les
 * documents PII servis par <a href> (facture Pro PDF, ticket de retrait).
 * Le token est calculé côté serveur (secret jamais exposé au navigateur) ;
 * le client ouvre l'URL retournée. Les routes vérifient le token → un tiers
 * externe ne peut plus énumérer les UUID pour aspirer les PDF.
 */

import { signDocToken } from "@/lib/doc-token";

/** URL signée de la facture Pro PDF (valable 1h). */
export async function signFacturePdfUrl(id: string): Promise<string> {
  const t = signDocToken("facture", id);
  return `/api/factures-pro/${encodeURIComponent(id)}/pdf?t=${encodeURIComponent(t)}`;
}

/** URL signée du ticket de retrait (valable 1h). */
export async function signTicketUrl(id: string): Promise<string> {
  const t = signDocToken("ticket", id);
  return `/api/commandes-drive/${encodeURIComponent(id)}/ticket?t=${encodeURIComponent(t)}`;
}
