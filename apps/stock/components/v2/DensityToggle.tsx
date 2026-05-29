"use client";

import { Rows3, Rows4 } from "lucide-react";
import { useDensity } from "@/lib/hooks/useDensity";

/**
 * DensityToggle — Confort ↔ Compact pour les pages listes.
 *
 * Tap → flip de mode. Persistant (localStorage).
 * Compact applique `body.density-compact` qui override les variables CSS
 * de padding/font-size globalement.
 */
export function DensityToggle() {
  const { density, toggle } = useDensity();
  const isCompact = density === "compact";

  const Icon = isCompact ? Rows4 : Rows3;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        isCompact
          ? "Mode compact actif — basculer en confort"
          : "Mode confort actif — basculer en compact"
      }
      aria-pressed={isCompact}
      title={isCompact ? "Mode compact" : "Mode confort"}
      className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white/80 hover:text-white active:scale-95 transition-all"
    >
      <Icon className="w-4 h-4" strokeWidth={2.2} />
    </button>
  );
}

export default DensityToggle;
