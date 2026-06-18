"use client";

/* GlassTabs — barre d'onglets liquid glass (iOS 26).
 * ─────────────────────────────────────────────────
 * L'onglet actif est matérialisé par une pastille `.lg-pill` qui GLISSE
 * d'un onglet à l'autre (transition douce, compositor-only via transform),
 * au lieu d'un changement de couleur sec. Chaque onglet porte `.tap`
 * (feedback pressable) et l'a11y `role=tab` + `aria-selected`.
 *
 * Composant non contrôlé côté UI : l'état actif + la synchro URL restent
 * gérés par la page hôte (on reçoit `value` et `onChange`).
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface GlassTabItem<T extends string> {
  value: T;
  label: ReactNode;
}

interface GlassTabsProps<T extends string> {
  items: GlassTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Libellé a11y de la barre d'onglets. */
  ariaLabel: string;
  /** Classes utilitaires sur le conteneur (espacement, scroll horizontal…). */
  className?: string;
  /** Taille des onglets : compacte (sous-onglets) ou normale. */
  size?: "sm" | "md";
}

export function GlassTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className = "",
  size = "md",
}: GlassTabsProps<T>) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef<Map<T, HTMLButtonElement>>(new Map());
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  // Au tout premier placement, on n'anime pas la pastille (sinon elle glisse
  // depuis 0). L'anim n'est activée qu'après la 1ʳᵉ mesure.
  const [ready, setReady] = useState(false);
  // Respecte « réduire les animations » : pas de glissement de pastille.
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const measure = useCallback(() => {
    const list = listRef.current;
    const active = btnRefs.current.get(value);
    if (!list || !active) return;
    const listRect = list.getBoundingClientRect();
    const btnRect = active.getBoundingClientRect();
    setPill({
      left: btnRect.left - listRect.left + list.scrollLeft,
      width: btnRect.width,
    });
  }, [value]);

  useLayoutEffect(() => {
    measure();
    // Active l'anim de glissement après le 1er positionnement.
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, [measure]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(list);
    btnRefs.current.forEach((b) => ro.observe(b));
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, items]);

  const pad = size === "sm" ? "px-3 py-1.5 text-[12px]" : "px-3.5 py-2 text-[13px]";

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`relative flex gap-1.5 ${className}`}
    >
      {/* Pastille de sélection glissante */}
      {pill && (
        <span
          aria-hidden
          className="lg-pill absolute top-0 bottom-0 z-0 pointer-events-none"
          style={{
            transform: `translateX(${pill.left}px)`,
            width: pill.width,
            transition:
              ready && !reduceMotion
                ? "transform 0.42s var(--ease-spring), width 0.42s var(--ease-spring)"
                : "none",
          }}
        />
      )}
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              if (el) btnRefs.current.set(item.value, el);
              else btnRefs.current.delete(item.value);
            }}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={`tap relative z-10 inline-flex items-center gap-1.5 rounded-full font-bold shrink-0 whitespace-nowrap min-h-[44px] ${pad} transition-colors ${
              active ? "text-text-primary" : "text-text-secondary"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/** Conteneur de panneau qui rejoue une entrée douce (.rise-in) à chaque
 *  changement d'onglet — la clé force le remount de l'animation. */
export function GlassTabPanel({
  tabKey,
  children,
  className = "",
}: {
  tabKey: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div key={tabKey} className={`rise-in ${className}`}>
      {children}
    </div>
  );
}
