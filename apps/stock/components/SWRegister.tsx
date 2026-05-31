"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js on mount (browser only). Without this, Web Push
 * (iOS 16.4+ PWA standalone) never fires because the SW never installs.
 * Le SW gère aussi le fallback offline (cf. public/sw.js).
 *
 * Idempotent: navigator.serviceWorker.register is a no-op when the same
 * script URL is already controlling the page. Errors are swallowed to
 * avoid breaking PWAs on browsers that block SW (private mode Safari).
 *
 * Update prompt : quand une nouvelle version du SW est installée en
 * attente, on dispatch un CustomEvent('sw-update-available'). Un Toast
 * UI peut écouter et proposer "Recharger" qui dispatchera
 * 'sw-activate-update' pour activer la nouvelle version.
 */
export function SWRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Build id (Vercel commit SHA ou fallback) injecté dans l'URL du SW.
    // Chaque déploiement change l'URL → le browser réinstalle le SW et
    // l'activate purge les caches de l'ancienne version (anti-gonflement
    // storage iOS). En dev l'id vaut "dev" et reste stable.
    const buildId = process.env.NEXT_PUBLIC_BUILD_ID || "dev";
    const swUrl = `/sw.js?v=${encodeURIComponent(buildId)}`;

    // Defer to avoid blocking first paint. Idle-callback when available.
    const reg = () => {
      navigator.serviceWorker
        .register(swUrl)
        .then((registration) => {
          // Surveille les updates pour proposer un refresh à l'utilisateur.
          registration.addEventListener("updatefound", () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              if (
                installing.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                window.dispatchEvent(
                  new CustomEvent("sw-update-available", {
                    detail: { registration },
                  })
                );
              }
            });
          });
        })
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

    // Listener pour activer le SW en attente quand l'UI confirme.
    const onActivate = async () => {
      const r = await navigator.serviceWorker.getRegistration(swUrl);
      const waiting = r?.waiting;
      if (!waiting) {
        window.location.reload();
        return;
      }
      let refreshed = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshed) return;
        refreshed = true;
        window.location.reload();
      });
      waiting.postMessage({ type: "SKIP_WAITING" });
    };
    window.addEventListener("sw-activate-update", onActivate);
    return () => window.removeEventListener("sw-activate-update", onActivate);
  }, []);
  return null;
}
