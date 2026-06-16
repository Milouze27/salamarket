import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

// Respecte "Réduire les animations" : pas de fondu si l'utilisateur demande
// moins de mouvement. Lu une fois au mount (le réglage change rarement en
// cours de session, et on évite de re-souscrire un matchMedia ici).
function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface Props {
  children: ReactNode;
}

/**
 * Transitions de page douces (fade) globales. À chaque changement de route on
 * rejoue un court fondu d'entrée en OPACITÉ uniquement sur le conteneur, sans
 * remonter le sous-arbre (les routes restent montées par React Router — aucun
 * state perdu, aucun refetch).
 *
 * Effet purement opacité → n'interfère pas avec les View Transitions API de la
 * PDP (shared-element morph de l'image), qui jouent sur leur propre couche.
 * Neutralisé sous prefers-reduced-motion (opacité figée à 1).
 */
export const PageFade = ({ children }: Props) => {
  const { pathname } = useLocation();
  const reduce = useRef(prefersReducedMotion());
  // On démarre visible : pas de flash au tout premier rendu de l'app.
  const [opacity, setOpacity] = useState(1);
  const firstRef = useRef(true);

  useEffect(() => {
    if (reduce.current) return;
    // On saute le premier passage (mount initial déjà à pleine opacité).
    if (firstRef.current) {
      firstRef.current = false;
      return;
    }
    // Repart de transparent puis remonte à 1 à la frame suivante → fondu
    // d'entrée. requestAnimationFrame évite que React batche les deux états
    // en un seul paint (ce qui supprimerait la transition).
    setOpacity(0);
    const raf = requestAnimationFrame(() => setOpacity(1));
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  return (
    <div
      style={{
        opacity,
        transition: reduce.current ? undefined : "opacity 180ms ease-out",
        // willChange limité à la propriété animée — pas de layout/paint inutile.
        willChange: "opacity",
      }}
    >
      {children}
    </div>
  );
};
