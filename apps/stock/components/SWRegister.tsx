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

    // Y avait-il DÉJÀ un SW aux commandes au montage ? Si oui, un futur
    // `controllerchange` = une vraie MAJ (et non la 1re prise de contrôle
    // au tout premier chargement) → on peut recharger sans risque de boucle.
    const hadController = !!navigator.serviceWorker.controller;

    // Recharge UNE seule fois quand le nouveau SW prend les commandes.
    let refreshed = false;
    const onControllerChange = () => {
      if (refreshed || !hadController) return;
      refreshed = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

    // SW installé en attente, pas encore activé. On l'applique sans déranger :
    // la bascule se fait quand l'app passe en arrière-plan (l'utilisateur
    // retrouve la version fraîche à son retour), JAMAIS en plein milieu d'une
    // saisie. C'est ce qui évite de rester coincé sur une vieille version.
    let pendingWaiting: ServiceWorker | null = null;
    const applyUpdate = (waiting: ServiceWorker | null | undefined) => {
      if (!waiting) return;
      pendingWaiting = waiting;
      window.dispatchEvent(
        new CustomEvent("sw-update-available", { detail: { waiting } }),
      );
      // Déjà en arrière-plan → applique tout de suite.
      maybeActivateInBackground();
    };
    const maybeActivateInBackground = () => {
      if (!pendingWaiting) return;
      if (document.visibilityState === "hidden") {
        pendingWaiting.postMessage({ type: "SKIP_WAITING" });
        pendingWaiting = null;
      }
    };
    document.addEventListener("visibilitychange", maybeActivateInBackground);

    // Filet de sécurité : si après 30 s l'utilisateur n'a jamais quitté l'app,
    // on bascule quand même (la nouvelle version peut corriger des bugs
    // bloquants). Reload non intrusif : on attend qu'aucun champ ne soit en
    // cours de saisie.
    const forceTimer = window.setTimeout(() => {
      if (!pendingWaiting) return;
      const ae = document.activeElement as HTMLElement | null;
      const typing =
        ae &&
        (ae.tagName === "INPUT" ||
          ae.tagName === "TEXTAREA" ||
          ae.isContentEditable);
      if (typing) return; // on ne coupe pas une saisie → restera pour le prochain passage en arrière-plan
      pendingWaiting.postMessage({ type: "SKIP_WAITING" });
      pendingWaiting = null;
    }, 30_000);

    // Defer to avoid blocking first paint. Idle-callback when available.
    const reg = () => {
      navigator.serviceWorker
        .register(swUrl)
        .then((registration) => {
          // Un SW peut être DÉJÀ en attente au chargement (MAJ précédente
          // jamais confirmée par l'utilisateur) → on l'applique maintenant.
          if (registration.waiting && navigator.serviceWorker.controller) {
            applyUpdate(registration.waiting);
          }
          // Surveille les updates qui arrivent pendant la session.
          registration.addEventListener("updatefound", () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              if (
                installing.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                applyUpdate(registration.waiting ?? installing);
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

    // Action manuelle (toast « Recharger ») → bascule immédiate.
    const onActivate = async () => {
      const r = await navigator.serviceWorker.getRegistration(swUrl);
      const waiting = r?.waiting ?? pendingWaiting;
      if (!waiting) {
        window.location.reload();
        return;
      }
      waiting.postMessage({ type: "SKIP_WAITING" });
    };
    window.addEventListener("sw-activate-update", onActivate);

    return () => {
      window.removeEventListener("sw-activate-update", onActivate);
      document.removeEventListener(
        "visibilitychange",
        maybeActivateInBackground,
      );
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      window.clearTimeout(forceTimer);
    };
  }, []);
  return null;
}
