/* Document token — HMAC-signed {scope, id, exp}
 * ─────────────────────────────────────────────
 * Même principe que po-token.ts (JWT-lite, vérif O(1) sans DB), mais
 * générique : protège les routes de documents PII servies par <a href>
 * (factures Pro PDF, ticket de retrait). Le staff n'a pas de session
 * Supabase (login PIN) → on ne peut pas vérifier auth.getUser() ; un lien
 * signé qui EXPIRE ferme l'énumération d'UUID par un tiers externe.
 *
 * `scope` lie le token à un type de document (ex. "facture", "ticket") :
 * un token de facture ne peut pas servir à tirer un ticket, et vice-versa.
 *
 * Secret : INTERNAL_API_SECRET (déjà présent en prod). Fallback dev local
 * uniquement, avec warning si absent en prod.
 */

import crypto from "node:crypto";

function getSecret(): string {
  const s = process.env.INTERNAL_API_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[doc-token] INTERNAL_API_SECRET manquant en prod — tokens invalides à la vérif",
    );
  }
  return "salam-dev-secret-change-me";
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlToBuf(s: string): Buffer {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

/** Signe un token pour (scope, id) valable `ttlSeconds` (défaut 1h). */
export function signDocToken(
  scope: string,
  id: string,
  ttlSeconds = 60 * 60,
): string {
  const payload = {
    s: scope,
    id,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(payloadB64)
    .digest();
  return `${payloadB64}.${b64url(sig)}`;
}

/** Vérifie qu'un token correspond bien à (scope, id) et n'est pas expiré. */
export function verifyDocToken(
  scope: string,
  id: string,
  token: string | null,
): { ok: true } | { ok: false; error: string } {
  if (!token) return { ok: false, error: "token manquant" };
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, error: "format invalide" };
  const [payloadB64, sigB64] = parts;

  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(payloadB64)
    .digest();
  const given = b64urlToBuf(sigB64);
  if (expected.length !== given.length) {
    return { ok: false, error: "signature invalide" };
  }
  if (!crypto.timingSafeEqual(expected, given)) {
    return { ok: false, error: "signature invalide" };
  }

  let payload: { s?: string; id?: string; exp?: number };
  try {
    payload = JSON.parse(b64urlToBuf(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, error: "payload corrompu" };
  }
  if (payload.s !== scope || payload.id !== id) {
    return { ok: false, error: "token non valide pour ce document" };
  }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, error: "lien expiré" };
  }
  return { ok: true };
}
