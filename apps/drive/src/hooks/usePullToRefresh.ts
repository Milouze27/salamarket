import { useEffect, useRef, useState } from "react";

// Respecte "Réduire les animations" (iOS/macOS). Lu à chaud.
function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// Pull-to-refresh tactile uniquement : on n'arme rien si l'appareil n'a pas
// de pointeur grossier (souris desktop). matchMedia(pointer: coarse) cible
// les écrans tactiles sans dépendre d'un sniff user-agent.
function isCoarsePointer() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

const THRESHOLD = 72; // px à franchir (au-delà de la résistance) pour déclencher
const MAX_PULL = 96; // plafond visuel de la traction
const RESISTANCE = 0.5; // diviseur : la traction réelle suit à moitié le doigt

interface PullState {
  /** Décalage vertical courant de l'indicateur, en px (0 si inactif). */
  pull: number;
  /** Seuil franchi : relâcher déclenchera le refresh. */
  armed: boolean;
  /** Refetch en cours (entre le relâchement et la résolution de onRefresh). */
  refreshing: boolean;
}

const IDLE: PullState = { pull: 0, armed: false, refreshing: false };

/**
 * Pull-to-refresh maison pour l'accueil PWA. Écoute les touch events au
 * niveau document : quand on tire vers le bas alors que la page est déjà
 * tout en haut (scrollY 0), on suit le doigt avec résistance ; passé le
 * seuil on arme + une micro-vibration ; au relâchement on appelle
 * onRefresh() et on garde l'état "refreshing" jusqu'à sa résolution.
 *
 * No-op complet sur pointeur fin (desktop) et sous prefers-reduced-motion :
 * on ne pose aucun listener, l'indicateur reste à 0.
 */
export function usePullToRefresh(onRefresh: () => void | Promise<unknown>) {
  const [state, setState] = useState<PullState>(IDLE);

  // onRefresh est souvent une nouvelle référence à chaque render (ex. refetch
  // TanStack). On la garde dans un ref pour attacher les listeners UNE fois.
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isCoarsePointer() || prefersReducedMotion()) return;

    let startY = 0;
    let pulling = false;
    let armed = false;
    let refreshing = false;

    const apply = (next: PullState) => setState(next);

    const reset = () => {
      pulling = false;
      armed = false;
      startY = 0;
      apply(IDLE);
    };

    const onTouchStart = (e: TouchEvent) => {
      // On n'arme la traction que si la page est tout en haut et qu'on n'est
      // pas déjà en train de rafraîchir.
      if (refreshing) return;
      if (window.scrollY > 0) return;
      if (e.touches.length !== 1) return;
      startY = e.touches[0].clientY;
      pulling = true;
      armed = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling || refreshing) return;
      // Si le scroll a démarré entre-temps, on abandonne (laisse le scroll natif).
      if (window.scrollY > 0) {
        reset();
        return;
      }
      const delta = e.touches[0].clientY - startY;
      if (delta <= 0) {
        // Geste vers le haut : ce n'est pas un pull, on laisse le scroll natif.
        apply(IDLE);
        return;
      }
      // Empêche le rubber-band natif pendant qu'on prend la main sur le geste.
      if (e.cancelable) e.preventDefault();
      const pull = Math.min(delta * RESISTANCE, MAX_PULL);
      const nowArmed = pull >= THRESHOLD;
      // Micro-vibration au franchissement du seuil (montant uniquement).
      if (nowArmed && !armed) {
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          try {
            navigator.vibrate(10);
          } catch {
            /* policy — ignore */
          }
        }
      }
      armed = nowArmed;
      apply({ pull, armed: nowArmed, refreshing: false });
    };

    const onTouchEnd = () => {
      if (!pulling || refreshing) {
        reset();
        return;
      }
      if (armed) {
        refreshing = true;
        // On garde l'indicateur visible au seuil pendant le refetch.
        apply({ pull: THRESHOLD, armed: true, refreshing: true });
        const done = () => {
          refreshing = false;
          pulling = false;
          armed = false;
          startY = 0;
          apply(IDLE);
        };
        try {
          const ret = onRefreshRef.current();
          if (ret && typeof (ret as Promise<unknown>).then === "function") {
            (ret as Promise<unknown>).then(done, done);
          } else {
            // Refetch synchrone / sans promesse : court délai pour que le
            // geste reste lisible plutôt qu'un flash instantané.
            window.setTimeout(done, 600);
          }
        } catch {
          done();
        }
      } else {
        reset();
      }
    };

    // passive:false sur touchmove pour pouvoir preventDefault le rubber-band.
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", reset, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", reset);
    };
  }, []);

  return state;
}
