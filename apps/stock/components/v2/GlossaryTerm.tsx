"use client";

import { useEffect, useId, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";

/**
 * GlossaryTerm : terme métier avec aide contextuelle.
 *
 * Affiche un libellé suivi d'une petite icône d'aide. Au tap (mobile) ou
 * clic (desktop), ouvre un popover accessible avec une définition FR courte.
 * Fermeture au clic extérieur ou touche Échap. Pensé tactile : la cible de
 * tap fait au moins 44px de haut, l'icône reste discrète.
 *
 * Usage :
 *   <GlossaryTerm term="BDL" def="Bon de Livraison : le document du fournisseur." />
 */
export function GlossaryTerm({ term, def }: { term: string; def: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const popId = useId();

  // Fermeture au clic extérieur + touche Échap.
  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`${term} : ${def}`}
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        className="inline-flex items-center gap-1 min-h-[44px] py-1 -my-1 align-baseline select-none"
        style={{ color: "inherit" }}
      >
        <span>{term}</span>
        <HelpCircle
          className="w-3.5 h-3.5 shrink-0"
          strokeWidth={2.2}
          style={{ color: "var(--text-tertiary)" }}
          aria-hidden
        />
      </button>

      {open && (
        <span
          id={popId}
          role="tooltip"
          className="absolute left-0 top-full mt-1.5 z-50 w-max max-w-[min(240px,calc(100vw-1.5rem))] rounded-xl px-3 py-2 text-[12px] font-medium leading-snug normal-case tracking-normal"
          style={{
            background: "var(--surface-3)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-card)",
            boxShadow: "var(--shadow-card-lg)",
          }}
        >
          {def}
        </span>
      )}
    </span>
  );
}
