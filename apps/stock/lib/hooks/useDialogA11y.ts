"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * useDialogA11y — primitives d'accessibilité partagées pour les overlays
 * modaux faits main de Stock (palette ⌘K, sheets, scanner) qui ne reposent pas
 * sur un Radix Dialog.
 *
 * Audit a11y S2 (A11Y-01/A11Y-02) : la palette ⌘K affichait un badge « ESC »
 * mais Escape ne fermait rien (cmdk ne capte Escape que dans un Radix Dialog,
 * pas en <Command> nu), et le Tab s'échappait derrière l'overlay (pas de
 * focus-trap). Ce hook branche les 4 comportements d'un dialog modal sur un
 * conteneur <div role="dialog" aria-modal="true"> existant :
 *   - focus initial dans le conteneur à l'ouverture,
 *   - focus-trap (Tab/Shift+Tab bornés),
 *   - Escape → onClose,
 *   - restauration du focus sur le déclencheur à la fermeture.
 *
 * `active` : overlay monté/visible. `onClose` : fermeture (Escape).
 * Retourne le ref à poser sur le conteneur du dialog.
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
  onClose: () => void,
): RefObject<T> {
  const containerRef = useRef<T>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Mémorise le déclencheur + focus initial à l'ouverture.
  useEffect(() => {
    if (!active) return;
    triggerRef.current = (document.activeElement as HTMLElement | null) ?? null;

    const container = containerRef.current;
    if (!container) return;
    // L'input autoFocus de cmdk prend déjà le focus ; on ne le vole que si rien
    // dans le conteneur n'est focusé (ex. sheet sans champ).
    if (!container.contains(document.activeElement)) {
      const first = container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (first) {
        first.focus();
      } else {
        container.focus();
      }
    }
  }, [active]);

  // Restaure le focus sur le déclencheur à la fermeture.
  useEffect(() => {
    if (active) return;
    const trigger = triggerRef.current;
    triggerRef.current = null;
    if (trigger && typeof trigger.focus === "function") {
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
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null || el === container);
      if (focusables.length === 0) {
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
        e.preventDefault();
        firstEl.focus();
      }
    };

    container.addEventListener("keydown", onKeyDown);
    return () => container.removeEventListener("keydown", onKeyDown);
  }, [active, onClose]);

  return containerRef;
}
