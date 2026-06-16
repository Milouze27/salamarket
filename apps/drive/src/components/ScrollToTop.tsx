import { useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";

// Respecte "Réduire les animations" : un scroll smooth EST du mouvement. On
// retombe sur un saut instantané pour les utilisateurs qui le demandent.
function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

const SHOW_AFTER = 600; // px de scroll avant apparition

/**
 * Bouton « Retour en haut » flottant, monté globalement. Apparaît après
 * ~600px de scroll et remonte la page en douceur. Il s'efface dès que le
 * StickyCartCTA est présent à l'écran pour ne jamais le chevaucher (mémoire
 * UX : la nav du bas ne doit pas se superposer à du contenu utile) — on
 * détecte sa présence réelle dans le DOM via [data-sticky-cart], plutôt que
 * de dupliquer sa logique de route/panier.
 *
 * z-40 : sous le header compact (z-50), au-dessus de la grille.
 */
export const ScrollToTop = () => {
  const [visible, setVisible] = useState(false);
  const [cartVisible, setCartVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Présence du StickyCartCTA : il monte/démonte selon panier + route. Un
  // MutationObserver léger sur le body suffit (pas de polling). On lit aussi
  // au mount pour l'état initial.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const check = () =>
      setCartVisible(!!document.querySelector("[data-sticky-cart]"));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const show = visible && !cartVisible;

  const handleClick = () => {
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Revenir en haut de la page"
      tabIndex={show ? 0 : -1}
      aria-hidden={!show}
      className={
        "fixed right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full " +
        "bg-sapin text-white shadow-lg shadow-sapin/30 ring-1 ring-white/10 " +
        "transition-all duration-300 hover:bg-sapin-deep active:scale-90 " +
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-cream " +
        (show
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-3 opacity-0")
      }
      style={{
        // Au-dessus du BottomNav mobile (≈56px + home indicator) ; sur desktop
        // le BottomNav est absent, le bouton se cale juste au-dessus du bord.
        bottom: "calc(env(safe-area-inset-bottom) + 56px + 16px)",
      }}
    >
      <ChevronUp size={22} strokeWidth={2.4} aria-hidden />
    </button>
  );
};
