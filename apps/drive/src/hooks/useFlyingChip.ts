import { useCallback } from "react";

// Respecte le réglage iOS/macOS "Réduire les animations". matchMedia est lu
// à chaque déclenchement (pas mis en cache) pour suivre un changement de
// préférence en cours de session sans recharger l'app.
function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// Public selectors that the cart icon should expose somewhere in the DOM.
// The hook picks the first match (cart icon may render in 2 places: header
// big & header compact). Tag the visible/best target with the BottomNav
// cart link as fallback (BottomNav is always present on mobile).
const CART_TARGET_SELECTORS = [
  "[data-cart-target]:not([data-cart-hidden='1'])",
  "[data-cart-target]",
  "a[href='/panier']",
];

interface FlyOptions {
  /** Optional image URL — if missing we use a gold chip. */
  imageUrl?: string;
  /** Optional product name for alt. */
  name?: string;
}

// Hook flying-chip — anime un petit thumbnail produit depuis le bouton
// "Ajouter" jusqu'à l'icône panier (top-right header ou BottomNav). Le
// chip est créé dans document.body en position fixed, anime via Web
// Animations API (transforms + opacity = 60fps, pas de layout thrashing).
// Côté impact, on bump aussi le compteur cart via attribut data-cart-bump
// que les composants concernés écoutent pour relancer l'animation.
export function useFlyingChip() {
  const triggerFly = useCallback(
    (fromEl: HTMLElement | null, options: FlyOptions = {}) => {
      if (typeof window === "undefined" || !fromEl) return;
      if (typeof document === "undefined") return;

      // Find target — try cart icon, fallback to top-right area.
      let target: HTMLElement | null = null;
      for (const sel of CART_TARGET_SELECTORS) {
        const found = document.querySelector<HTMLElement>(sel);
        if (found) {
          target = found;
          break;
        }
      }
      if (!target) return;

      // "Réduire les animations" : on saute le chip volant ET le retour
      // haptique (les deux sont des effets de mouvement perçus), mais on
      // bump quand même le compteur panier pour conserver le feedback non
      // animé (le CSS du bump est neutralisé par @media reduced-motion).
      if (prefersReducedMotion()) {
        target.setAttribute("data-cart-bump", String(Date.now()));
        return;
      }

      const from = fromEl.getBoundingClientRect();
      const to = target.getBoundingClientRect();

      // Compute deltas — animate from center of source to center of target.
      const startX = from.left + from.width / 2;
      const startY = from.top + from.height / 2;
      const endX = to.left + to.width / 2;
      const endY = to.top + to.height / 2;
      const dx = endX - startX;
      const dy = endY - startY;

      // Build chip element.
      const chip = document.createElement("div");
      chip.setAttribute("aria-hidden", "true");
      chip.style.position = "fixed";
      chip.style.left = `${startX - 22}px`;
      chip.style.top = `${startY - 22}px`;
      chip.style.width = "44px";
      chip.style.height = "44px";
      chip.style.borderRadius = "9999px";
      chip.style.overflow = "hidden";
      chip.style.pointerEvents = "none";
      chip.style.zIndex = "999";
      chip.style.boxShadow = "0 12px 28px -8px rgba(8, 42, 32, 0.45)";
      chip.style.background = "#0E3B2E";
      chip.style.willChange = "transform, opacity";

      if (options.imageUrl) {
        const img = document.createElement("img");
        img.src = options.imageUrl;
        img.alt = options.name ?? "";
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        img.draggable = false;
        chip.appendChild(img);
      } else {
        // Gold-tinted fallback dot.
        chip.style.background = "#C9A227";
      }

      document.body.appendChild(chip);

      // Haptic feedback on supporting devices.
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        try {
          navigator.vibrate(40);
        } catch {
          /* some browsers throw on policy — silently ignore */
        }
      }

      // Use WAAPI for 60fps animation. Curve mimics a slight arc by easing
      // out fast then settling — keeps it short (420ms) and snappy.
      const DURATION = 420;
      const anim = chip.animate(
        [
          {
            transform: "translate(0, 0) scale(1)",
            opacity: 1,
          },
          {
            transform: `translate(${dx * 0.6}px, ${dy * 0.6 - 40}px) scale(0.7)`,
            opacity: 0.95,
            offset: 0.6,
          },
          {
            transform: `translate(${dx}px, ${dy}px) scale(0.3)`,
            opacity: 0,
          },
        ],
        {
          duration: DURATION,
          easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
          fill: "forwards",
        },
      );

      // Cleanup idempotent — déclenché par onfinish (cas nominal), oncancel,
      // un filet setTimeout, ET visibilitychange→hidden. Garde-fou anti-fuite :
      // si l'utilisateur background l'onglet / verrouille l'iPhone pendant les
      // 420ms, WAAPI suspend l'anim quand document.hidden et onfinish peut ne
      // JAMAIS fire → le chip restait collé en position:fixed z-index:999
      // par-dessus l'UI au retour. Le spam d'ajouts empilait des orphelins.
      let cleaned = false;
      let safety: number | undefined;
      const onHide = () => {
        if (document.visibilityState === "hidden") cleanup();
      };
      function cleanup() {
        if (cleaned) return;
        cleaned = true;
        if (safety !== undefined) window.clearTimeout(safety);
        document.removeEventListener("visibilitychange", onHide);
        try {
          anim.cancel();
        } catch {
          /* anim peut déjà être finie/annulée — ignore */
        }
        chip.remove();
      }

      anim.onfinish = () => {
        cleanup();
        // Trigger cart counter bump by toggling data attribute.
        // The cart icon element re-applies a CSS animation keyframe.
        target?.setAttribute("data-cart-bump", String(Date.now()));
      };
      anim.oncancel = cleanup;
      // Filet de secours : +200ms après la durée nominale, on force la
      // suppression même si onfinish n'a jamais été émis (cf. splash
      // index.html qui a déjà ce pattern à 1500ms).
      safety = window.setTimeout(cleanup, DURATION + 200);
      document.addEventListener("visibilitychange", onHide);
    },
    [],
  );

  return { triggerFly };
}
