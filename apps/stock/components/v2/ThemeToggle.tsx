"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/hooks/useTheme";

/**
 * ThemeToggle — switch jour↔nuit premium et découvrable.
 *
 * Un vrai switch animé (plus de long-press popover non-découvrable) :
 *   - track sapin (--surface-2) ;
 *   - thumb qui glisse avec l'icône sun (jour) / moon (nuit) ;
 *   - thumb en or + glow quand nuit.
 *
 * Tap = bascule directe via useTheme (2 modes : "jour" | "nuit").
 * Accessible : role="switch" + aria-checked + label clair.
 */
export function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const isNight = resolved === "nuit";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isNight}
      onClick={toggle}
      aria-label={
        isNight
          ? "Mode atelier nuit actif — basculer en jour"
          : "Mode jour actif — basculer en nuit"
      }
      className="relative inline-flex items-center shrink-0 rounded-full active:scale-[0.97]"
      style={{
        width: 58,
        height: 32,
        padding: 3,
        background: isNight ? "var(--surface-2)" : "rgba(255,255,255,0.16)",
        border: `1px solid ${isNight ? "var(--border-card)" : "rgba(255,255,255,0.22)"}`,
        boxShadow: "inset 0 1px 2px rgba(0,0,0,0.28)",
        transition:
          "background 280ms var(--ease-out-quart), border-color 280ms var(--ease-out-quart), transform 120ms var(--ease-out-quart)",
      }}
    >
      {/* Icônes de fond (rail) : sun à gauche, moon à droite */}
      <span
        aria-hidden
        className="absolute inset-0 flex items-center justify-between px-[7px]"
      >
        <Sun
          className="w-3.5 h-3.5"
          strokeWidth={2.2}
          style={{
            color: isNight ? "var(--text-tertiary)" : "rgba(255,255,255,0.85)",
            opacity: isNight ? 0.5 : 0,
            transition: "opacity 240ms var(--ease-out-quart)",
          }}
        />
        <Moon
          className="w-3.5 h-3.5"
          strokeWidth={2.2}
          style={{
            color: "var(--text-tertiary)",
            opacity: isNight ? 0 : 0.55,
            transition: "opacity 240ms var(--ease-out-quart)",
          }}
        />
      </span>

      {/* Thumb */}
      <span
        aria-hidden
        className="relative inline-flex items-center justify-center rounded-full"
        style={{
          width: 26,
          height: 26,
          transform: isNight ? "translateX(26px)" : "translateX(0px)",
          background: isNight ? "var(--accent-gold-bright)" : "#FFFFFF",
          boxShadow: isNight
            ? "var(--accent-gold-glow), 0 1px 2px rgba(0,0,0,0.35)"
            : "0 1px 3px rgba(0,0,0,0.30)",
          transition:
            "transform 320ms var(--ease-out-quart), background 280ms var(--ease-out-quart), box-shadow 280ms var(--ease-out-quart)",
        }}
      >
        {isNight ? (
          <Moon
            className="w-[14px] h-[14px]"
            strokeWidth={2.4}
            style={{ color: "var(--text-on-gold)" }}
          />
        ) : (
          <Sun
            className="w-[14px] h-[14px]"
            strokeWidth={2.4}
            style={{ color: "var(--primary-green)" }}
          />
        )}
      </span>
    </button>
  );
}

export default ThemeToggle;
