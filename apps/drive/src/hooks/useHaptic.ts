import { useCallback } from "react";

// Respecte le réglage iOS/macOS "Réduire les animations". Lu à chaud à
// chaque appel (pas mis en cache) pour suivre un changement de préférence
// en cours de session — même pattern que useFlyingChip.
function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Retour haptique discret, centralisé. Encapsule navigator.vibrate avec :
 *  - garde "Réduire les animations" (une vibration EST un mouvement perçu),
 *  - feature-detection (navigateurs sans Vibration API → no-op silencieux),
 *  - try/catch (certains navigateurs throw selon la policy d'engagement).
 *
 * Défaut 10ms = tap léger « satisfaisant » sans être intrusif, aligné sur
 * le geste d'ajout favori. Renvoie une fonction stable.
 */
export function useHaptic() {
  const haptic = useCallback((duration = 10) => {
    if (typeof navigator === "undefined") return;
    if (typeof navigator.vibrate !== "function") return;
    if (prefersReducedMotion()) return;
    try {
      navigator.vibrate(duration);
    } catch {
      /* policy peut refuser hors interaction — on ignore silencieusement */
    }
  }, []);

  return haptic;
}
