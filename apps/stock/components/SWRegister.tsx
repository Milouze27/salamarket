"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js on mount (browser only). Without this, Web Push
 * (iOS 16.4+ PWA standalone) never fires because the SW never installs.
 *
 * Idempotent: navigator.serviceWorker.register is a no-op when the same
 * script URL is already controlling the page. Errors are swallowed to
 * avoid breaking PWAs on browsers that block SW (private mode Safari).
 */
export function SWRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Defer to avoid blocking first paint. Idle-callback when available.
    const reg = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() => {
          /* SW registration failed — likely Safari private mode or
             corporate proxy. Push notifs degrade gracefully. */
        });
    };
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      w.requestIdleCallback(reg);
    } else {
      window.setTimeout(reg, 1000);
    }
  }, []);
  return null;
}
