/* PO confirm token — HMAC-signed payload
 * ─────────────────────────────────────
 * Pas de table tokens, pas de DB call à la vérification. Le token
 * encode {po_id, exp} + HMAC-SHA256 base64url. C'est l'approche JWT-lite
 * adaptée à notre besoin : Otmane envoie l'email, le grossiste clique,
 * on vérifie en O(1) qu'on a bien signé ce po_id avec notre secret.
 *
 * Secret : PO_CONFIRM_SECRET (env), avec fallback dev = "salam-dev-secret".
 * En prod, l'absence du secret env doit logguer un warning à l'init.
 */

import crypto from "node:crypto";

function getSecret(): string {
  const s = process.env.PO_CONFIRM_SECRET;
  if (s) return s;
  // Dev fallback — jamais en prod, on log au premier appel.
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[po-token] PO_CONFIRM_SECRET manquant en prod — tokens invalides à la vérif"
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

export function signPoToken(poId: string, ttlSeconds = 60 * 60 * 24 * 30): string {
  const payload = { po_id: poId, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = crypto.createHmac("sha256", getSecret()).update(payloadB64).digest();
  return `${payloadB64}.${b64url(sig)}`;
}

export function verifyPoToken(token: string): { ok: true; po_id: string } | { ok: false; error: string } {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, error: "format invalide" };
  const [payloadB64, sigB64] = parts;

  // Recalcule la sig sur payload et compare en constant-time
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

  let payload: { po_id?: string; exp?: number };
  try {
    payload = JSON.parse(b64urlToBuf(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, error: "payload corrompu" };
  }
  if (!payload.po_id) return { ok: false, error: "po_id manquant" };
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, error: "lien expiré" };
  }
  return { ok: true, po_id: payload.po_id };
}
