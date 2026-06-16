import { useEffect, useRef, useState } from "react";
import { computePrixEstime, formatKg } from "@salamarket/shared";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/types/product";

// ────────────────────────────────────────────────────────────────────
// PrixEstimeLive — estimation prix « halo » en lecture seule, posée sous
// le KgStepper sur la PDP weight.
//
// Recalcule le montant via computePrixEstime(product, kg) (helper partagé
// @salamarket/shared, read-only) et l'affiche en grand chiffre tabulaire
// sapin avec la microcopy « estimé pour X kg ». AUCUN état métier nouveau :
// le poids vient du parent (usePoidsInput), on ne fait que dériver
// l'affichage.
//
// computePrixEstime renvoie des EUR → on convertit en cents pour réutiliser
// formatPrice (même rendu monétaire fr-FR que partout ailleurs).
//
// Transition douce : à chaque changement de poids on relance un fade court
// sur le chiffre (clé qui change → ré-montage de la couche animée). Respecte
// "Réduire les animations" (la classe animate-in n'est posée que si l'OS ne
// demande pas moins de mouvement).
// ────────────────────────────────────────────────────────────────────

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface Props {
  product: Product;
  kg: number;
}

export const PrixEstimeLive = ({ product, kg }: Props) => {
  const totalCents = Math.round(computePrixEstime(product, kg) * 100);

  // Clé de fade : on incrémente un compteur à chaque variation du montant
  // affiché, pour rejouer le fade uniquement quand le chiffre change
  // réellement (pas à chaque render). Le `key` sur le span force React à
  // re-monter la couche → l'animation `animate-in fade-in` se relance.
  const [fadeKey, setFadeKey] = useState(0);
  const prevCentsRef = useRef(totalCents);
  useEffect(() => {
    if (prevCentsRef.current !== totalCents) {
      prevCentsRef.current = totalCents;
      setFadeKey((k) => k + 1);
    }
  }, [totalCents]);

  const reduce = prefersReducedMotion();

  return (
    <div
      className="mt-3 flex items-baseline gap-2.5"
      aria-live="polite"
      aria-atomic="true"
    >
      <span
        key={reduce ? undefined : fadeKey}
        className={
          reduce
            ? "text-[28px] font-extrabold tabular-nums tracking-[-0.02em] text-[#0E3B2E] leading-none"
            : "text-[28px] font-extrabold tabular-nums tracking-[-0.02em] text-[#0E3B2E] leading-none animate-in fade-in duration-300"
        }
      >
        {formatPrice(totalCents)}
      </span>
      <span className="text-[12px] text-[#0F1A14]/55 font-medium">
        estimé pour {formatKg(kg)}
      </span>
    </div>
  );
};
