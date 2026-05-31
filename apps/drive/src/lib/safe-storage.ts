/**
 * Defensive storage adapter.
 *
 * In private browsing (strict iOS Safari), when quota is exceeded, or when the
 * user has disabled site storage, `localStorage.getItem/setItem/removeItem`
 * throw (SecurityError / QuotaExceededError). Because the Supabase client and
 * the zustand stores touch storage very early at boot — before the React
 * ErrorBoundary is mounted — an unguarded throw can white-screen the whole app.
 *
 * This wrapper mirrors the Stock app's `safeStorage`: every access is wrapped in
 * try/catch and falls back to an in-memory Map so the app keeps working (session
 * simply isn't persisted across reloads) instead of crashing.
 */

type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function createMemoryStorage(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem: (key) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

function detectLocalStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    // Probe with a throwaway key — some environments expose the object but
    // throw on the first write (private mode, blocked storage).
    const probe = "__sala_storage_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

const memoryFallback = createMemoryStorage();
const nativeStorage = detectLocalStorage();

/**
 * A storage object that never throws. Safe to pass to supabase-js `auth.storage`
 * and to zustand's `createJSONStorage`.
 */
export const safeStorage: StorageLike = {
  getItem(key) {
    try {
      if (nativeStorage) return nativeStorage.getItem(key);
    } catch {
      /* fall through to memory */
    }
    return memoryFallback.getItem(key);
  },
  setItem(key, value) {
    try {
      if (nativeStorage) {
        nativeStorage.setItem(key, value);
        return;
      }
    } catch {
      /* fall through to memory */
    }
    memoryFallback.setItem(key, value);
  },
  removeItem(key) {
    try {
      if (nativeStorage) {
        nativeStorage.removeItem(key);
        return;
      }
    } catch {
      /* fall through to memory */
    }
    memoryFallback.removeItem(key);
  },
};

/** True when persistent storage is actually available (not memory fallback). */
export const hasPersistentStorage = nativeStorage !== null;
