import { useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────
// useStickySearch — détecte le SENS du scroll pour révéler une barre de
// recherche d'appoint (StickySearchBar mobile).
//
// Renvoie `visible = true` quand l'utilisateur scrolle vers le HAUT après
// être descendu assez bas dans la page, `false` quand il scrolle vers le
// bas (la barre s'efface pour libérer l'écran). Lecture pure de
// window.scrollY via rAF (pas de re-render à chaque pixel) — aucune
// dépendance, aucun appel réseau. No-op SSR (window absent).
//
// Seuils :
//   - revealAfter : profondeur mini avant d'envisager d'afficher la barre
//     (inutile tout en haut, le Header porte déjà la recherche).
//   - delta : amplitude mini d'un mouvement pour basculer (anti-jitter).
// ─────────────────────────────────────────────────────────────────

interface Options {
  revealAfter?: number;
  delta?: number;
}

export const useStickySearch = ({
  revealAfter = 520,
  delta = 8,
}: Options = {}): boolean => {
  const [visible, setVisible] = useState(false);
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    lastY.current = window.scrollY;

    const update = () => {
      ticking.current = false;
      const y = window.scrollY;
      const diff = y - lastY.current;

      // Mouvement trop petit : on ignore (évite le clignotement sur les
      // micro-scrolls / rebonds élastiques iOS).
      if (Math.abs(diff) < delta) {
        lastY.current = y;
        return;
      }

      if (y < revealAfter) {
        // Près du haut : le Header (hero ou compact) couvre déjà le besoin.
        setVisible(false);
      } else if (diff < 0) {
        // Scroll vers le haut → on révèle.
        setVisible(true);
      } else {
        // Scroll vers le bas → on masque.
        setVisible(false);
      }
      lastY.current = y;
    };

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [revealAfter, delta]);

  return visible;
};
