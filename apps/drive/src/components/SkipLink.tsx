import type { MouseEvent } from "react";

/**
 * SkipLink — lien d'évitement « Aller au contenu » (A11Y-11).
 *
 * Premier élément focusable de la page : un utilisateur clavier peut sauter le
 * header (logo, panier, compte, recherche) répété sur chaque écran et atterrir
 * directement sur le contenu. Visuellement masqué (sr-only) tant qu'il n'a pas
 * le focus, il apparaît en haut à gauche au premier Tab.
 *
 * Plutôt que cibler un id fixe (toutes les pages Drive ont leur propre <main>
 * mais pas toujours un id stable), on résout le 1er <main> du document au clic
 * et on lui porte le focus — robuste sur les 21 écrans sans les modifier un par
 * un.
 */
export const SkipLink = () => {
  const onActivate = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const main = document.querySelector("main");
    if (!main) return;
    // tabindex=-1 temporaire : <main> n'est pas focusable par défaut.
    if (!main.hasAttribute("tabindex")) {
      main.setAttribute("tabindex", "-1");
    }
    main.focus();
    main.scrollIntoView({ block: "start" });
  };

  return (
    <a
      href="#main"
      onClick={onActivate}
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-xl focus:bg-[#0E3B2E] focus:px-4 focus:py-2.5 focus:text-[14px] focus:font-bold focus:text-white focus:shadow-2xl focus:outline-none focus:ring-2 focus:ring-[#C9A227]"
    >
      Aller au contenu
    </a>
  );
};

export default SkipLink;
