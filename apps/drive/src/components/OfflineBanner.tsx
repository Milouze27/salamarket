import { useEffect, useRef, useState } from "react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

// ─────────────────────────────────────────────────────────────────
// OfflineBanner — bandeau calme « Vous êtes hors-ligne ».
//
// Monté globalement (App.tsx). Apparaît quand la connexion tombe, se
// retire proprement quand elle revient. Message rassurant : le panier
// est persisté en localStorage (zustand persist) → l'utilisateur ne perd
// rien et peut continuer à parcourir ce qui est déjà chargé.
//
// AUCUNE dépendance au service worker (lecture navigator.onLine seule).
// Pas de picto décoratif : hiérarchie par la typo. Sobre et premium :
// fondu + léger glissement depuis le bas, neutralisé sous
// prefers-reduced-motion. Safe-area bottom respectée (mémoire overlays).
// Posé au-dessus de la BottomNav mobile (z élevé) sans la masquer.
// ─────────────────────────────────────────────────────────────────

// Durée de l'animation de sortie : on garde le bandeau monté le temps de
// jouer le fondu avant de le retirer du DOM (sinon il « pop » sans transition).
const EXIT_MS = 300;

export const OfflineBanner = () => {
  const online = useOnlineStatus();
  // `mounted` pilote la présence DOM, `visible` pilote l'état d'animation.
  // On les découple pour pouvoir animer l'entrée ET la sortie.
  const [mounted, setMounted] = useState(!online);
  const [visible, setVisible] = useState(!online);
  const exitTimer = useRef<number | null>(null);

  useEffect(() => {
    if (exitTimer.current) {
      window.clearTimeout(exitTimer.current);
      exitTimer.current = null;
    }
    if (!online) {
      // Hors-ligne : on monte puis on déclenche l'entrée à la frame
      // suivante pour que la transition d'opacité parte bien de 0.
      setMounted(true);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    // Retour en ligne : on joue la sortie puis on démonte.
    setVisible(false);
    exitTimer.current = window.setTimeout(() => setMounted(false), EXIT_MS);
    return () => {
      if (exitTimer.current) window.clearTimeout(exitTimer.current);
    };
  }, [online]);

  if (!mounted) return null;

  return (
    <div
      // role=status + aria-live polite : annoncé une fois aux lecteurs
      // d'écran sans voler le focus. aria-hidden quand en sortie pour ne
      // pas ré-annoncer au retour.
      role="status"
      aria-live="polite"
      aria-hidden={!visible}
      className={[
        "fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3",
        "pb-[calc(env(safe-area-inset-bottom)+12px)] pt-2",
        "pointer-events-none",
        "transition-all duration-300 ease-out motion-reduce:transition-none",
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-3 motion-reduce:translate-y-0",
      ].join(" ")}
    >
      <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-sapin-deep text-cream shadow-[0_20px_45px_-18px_rgba(8,42,32,0.7)] ring-1 ring-white/10 px-4 py-3">
        <p className="text-[14px] font-bold leading-tight">Vous êtes hors-ligne</p>
        <p className="mt-1 text-[12.5px] leading-snug text-cream/80">
          Votre panier est sauvegardé sur cet appareil. Vous pouvez continuer à
          parcourir ce qui est déjà chargé — tout reprend dès le retour du
          réseau.
        </p>
      </div>
    </div>
  );
};

export default OfflineBanner;
