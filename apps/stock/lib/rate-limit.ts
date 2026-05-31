/**
 * Rate limiter in-memory pour Vercel Functions.
 *
 * ⚠ Limites :
 *   - Une instance par Function = pas partagé entre régions / cold starts.
 *     Suffisant pour bloquer un attaquant naïf qui burn la quota Claude
 *     depuis une seule IP, pas pour un DDoS distribué.
 *   - Pour un vrai rate-limit production, brancher @upstash/ratelimit
 *     ou @vercel/kv (cf. INTEGRATIONS.md).
 *
 * Usage :
 *   const { allowed, retryAfter } = checkRateLimit(ip, "assistant", 30, 3600_000);
 *   if (!allowed) return new Response("Too Many Requests", { status: 429,
 *     headers: { "Retry-After": String(retryAfter) }});
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number; // secondes
}

/**
 * Sliding window simple : compte le nombre de requêtes d'un caller (IP+key)
 * dans une fenêtre glissante. Reset auto au-delà de `windowMs`.
 */
export function checkRateLimit(
  ip: string,
  bucketKey: string,
  maxRequests: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const key = `${bucketKey}:${ip}`;
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: maxRequests - 1, retryAfter: 0 };
  }

  bucket.count++;
  if (bucket.count > maxRequests) {
    const retryAfter = Math.ceil(
      (bucket.windowStart + windowMs - now) / 1000,
    );
    return { allowed: false, remaining: 0, retryAfter };
  }

  return {
    allowed: true,
    remaining: maxRequests - bucket.count,
    retryAfter: 0,
  };
}

/**
 * Extrait l'IP du client depuis les headers Vercel/standards.
 * Fallback "unknown" si rien trouvé (ne devrait jamais arriver en prod
 * Vercel mais protège contre les tests locaux).
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // Premier IP de la chaîne = client le plus en amont
    return forwarded.split(",")[0]!.trim();
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const vercelIp = req.headers.get("x-vercel-forwarded-for");
  if (vercelIp) return vercelIp.split(",")[0]!.trim();
  return "unknown";
}
