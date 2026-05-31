import { lazy, type ComponentType } from "react";

type Factory<T extends ComponentType<unknown>> = () => Promise<{ default: T }>;

/**
 * Drop-in replacement for React.lazy that survives stale-deploy chunk errors.
 *
 * When a new deploy ships, the previously-hashed JS chunks a long-lived tab
 * (or installed PWA) references are removed from the CDN. The next dynamic
 * import() then rejects with a ChunkLoadError / "Failed to fetch dynamically
 * imported module". This is extremely common here because the live deploy stays
 * frozen for hours while users keep the PWA open.
 *
 * Strategy:
 *   1. One silent retry after a short delay (handles transient network blips).
 *   2. If it still fails, force a single hard reload to fetch the fresh build
 *      manifest. A sessionStorage flag prevents reload loops if the failure is
 *      genuinely persistent (offline, real 500) — in that case we rethrow so
 *      the ErrorBoundary can show its branded fallback.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(factory: Factory<T>) {
  return lazy<T>(() =>
    factory().catch(async (error) => {
      try {
        await new Promise((r) => setTimeout(r, 400));
        return await factory();
      } catch {
        const FLAG = "sala_chunk_reloaded";
        try {
          if (!sessionStorage.getItem(FLAG)) {
            sessionStorage.setItem(FLAG, "1");
            window.location.reload();
            // Never resolve — nothing should render before the reload kicks in.
            return await new Promise<{ default: T }>(() => {});
          }
        } catch {
          /* sessionStorage blocked (private mode) — fall through to rethrow */
        }
        throw error;
      }
    }),
  );
}
