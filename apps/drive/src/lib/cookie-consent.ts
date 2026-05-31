import { safeStorage } from "@/lib/safe-storage";

/**
 * Central, importable source of truth for cookie consent so third-party scripts
 * (analytics, marketing pixels) can be gated on the user's actual RGPD choice
 * instead of loading unconditionally.
 *
 * IMPORTANT: this reads the SAME localStorage key the CookieBanner already
 * writes (`cookieConsent`) — it does not change the banner's persistence shape.
 * It only adds (a) a typed read accessor, (b) a subscribe helper that reacts to
 * the in-tab consent-change event AND cross-tab storage events, and (c) a stable
 * anonymous visitor id (generated once, reused) for correlating consent logs.
 *
 * Feature code that wants to load an analytics script should do:
 *
 *   if (getConsent().analytics) loadAnalytics();
 *   const off = onConsentChange((c) => { if (c.analytics) loadAnalytics(); });
 */

export const CONSENT_STORAGE_KEY = "cookieConsent";
export const CONSENT_EVENT = "sala:consent-change";
const VISITOR_ID_KEY = "sala_visitor_id";

export interface CookieConsent {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  /** Epoch ms of the decision, if recorded by the banner. */
  ts?: number;
}

const DEFAULT_CONSENT: CookieConsent = {
  necessary: true,
  analytics: false,
  marketing: false,
};

/** Returns the stored consent, or defaults (non-essential refused) if none. */
export function getConsent(): CookieConsent {
  try {
    const raw = safeStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONSENT };
    const parsed = JSON.parse(raw) as Partial<CookieConsent>;
    return {
      necessary: true,
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
      ts: typeof parsed.ts === "number" ? parsed.ts : undefined,
    };
  } catch {
    return { ...DEFAULT_CONSENT };
  }
}

/** True once the user has made an explicit choice. */
export function hasDecided(): boolean {
  try {
    return safeStorage.getItem(CONSENT_STORAGE_KEY) != null;
  } catch {
    return false;
  }
}

/**
 * Notify same-tab listeners that consent changed. The banner calls this right
 * after persisting, so scripts can react immediately (cross-tab is covered by
 * the native `storage` event handled in onConsentChange).
 */
export function emitConsentChange(): void {
  try {
    window.dispatchEvent(new CustomEvent<CookieConsent>(CONSENT_EVENT, { detail: getConsent() }));
  } catch {
    /* CustomEvent unsupported — ignore */
  }
}

/** Subscribe to consent changes (same-tab event + cross-tab storage). */
export function onConsentChange(cb: (consent: CookieConsent) => void): () => void {
  const handler = () => cb(getConsent());
  const storageHandler = (e: StorageEvent) => {
    if (e.key === CONSENT_STORAGE_KEY) cb(getConsent());
  };
  window.addEventListener(CONSENT_EVENT, handler as EventListener);
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener(CONSENT_EVENT, handler as EventListener);
    window.removeEventListener("storage", storageHandler);
  };
}

/**
 * Stable, anonymous visitor id — generated once and reused, instead of a fresh
 * id on every write (which made consent logs impossible to correlate).
 */
export function getVisitorId(): string {
  try {
    const existing = safeStorage.getItem(VISITOR_ID_KEY);
    if (existing) return existing;
  } catch {
    /* fall through */
  }
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `v_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  try {
    safeStorage.setItem(VISITOR_ID_KEY, id);
  } catch {
    /* non-persistent — still stable for this session */
  }
  return id;
}
