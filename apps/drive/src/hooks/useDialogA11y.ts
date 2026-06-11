import { useEffect, useRef } from "react";

/**
 * useDialogA11y — primitives d'accessibilité partagées pour tous les overlays
 * modaux faits main du Drive (onboarding, préférences cookies, sheets) qui
 * n'utilisent pas un Radix Dialog.
 *
 * Audit a11y S2 (A11Y-02/03, B1-14, WELCOME-MODAL-NO-FOCUS) : aucun de ces
 * overlays ne gérait Escape, ne déplaçait le focus à l'ouverture, ne piégeait
 * le Tab, ni ne restaurait le focus au déclencheur à la fermeture. Ce hook
 * branche les 4 comportements attendus d'un dialog modal sur un conteneur
 * <div role="dialog" aria-modal="true"> existant, sans réécrire en Radix.
 *
 * Branchements :
 *  - `active`   : overlay monté/visible. Quand il passe à false, le focus est
 *                 restauré sur le dernier élément actif d'avant l'ouverture.
 *  - `onClose`  : appelé sur Escape (no-op si non fourni → overlay non
 *                 dismissable, ex. onboarding bloquant, mais le focus reste
 *                 piégé dedans).
 *  - retourne `containerRef` à poser sur le conteneur du dialog.
 *
 * Focus initial : 1er élément focusable du conteneur (ou le conteneur lui-même
 * via tabIndex=-1 si aucun). Focus-trap : Tab/Shift+Tab bouclent dans le
 * conteneur. Escape : appelle onClose.
 */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useDialogA11y<T extends HTMLElement = HTMLDivElement>(
  active: boolean,
  onClose?: () => void,
): React.RefObject<T> {
  const containerRef = useRef<T>(null);
  // Élément ayant le focus juste avant l'ouverture → restauré à la fermeture.
  const triggerRef = useRef<HTMLElement | null>(null);

  // Mémorise le déclencheur + place le focus initial à l'ouverture.
  useEffect(() => {
    if (!active) return;
    triggerRef.current =
      (document.activeElement as HTMLElement | null) ?? null;

    const container = containerRef.current;
    if (!container) return;
    const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    if (first) {
      first.focus();
    } else {
      // Pas d'élément focusable : on porte le focus sur le conteneur lui-même
      // (l'appelant doit poser tabIndex={-1}) pour que le lecteur d'écran y
      // entre et que le trap fonctionne.
      container.focus();
    }
  }, [active]);

  // Restaure le focus sur le déclencheur quand l'overlay se ferme.
  useEffect(() => {
    if (active) return;
    const trigger = triggerRef.current;
    triggerRef.current = null;
    if (trigger && typeof trigger.focus === "function") {
      // requestAnimationFrame : le déclencheur peut avoir été (re)monté après
      // la fermeture (ex. bouton dont la visibilité dépend de l'état).
      requestAnimationFrame(() => trigger.focus());
    }
  }, [active]);

  // Escape → onClose ; Tab → trap.
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (onClose) {
          e.preventDefault();
          onClose();
        }
        return;
      }
      if (e.key !== "Tab") return;

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null || el === container);
      if (focusables.length === 0) {
        // Rien de focusable : on garde le focus sur le conteneur.
        e.preventDefault();
        container.focus();
        return;
      }
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      const activeEl = document.activeElement;

      if (e.shiftKey && activeEl === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && activeEl === lastEl) {
        e.preventDefault();
        firstEl.focus();
      } else if (!container.contains(activeEl)) {
        // Le focus s'est échappé (ex. clic ailleurs) : on le ramène.
        e.preventDefault();
        firstEl.focus();
      }
    };

    container.addEventListener("keydown", onKeyDown);
    return () => container.removeEventListener("keydown", onKeyDown);
  }, [active, onClose]);

  return containerRef;
}
