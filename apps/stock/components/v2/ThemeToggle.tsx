"use client";

import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { useTheme } from "@/lib/hooks/useTheme";

/**
 * ThemeToggle — bouton compact dans le header V2Shell.
 *
 * Tap court : flip jour↔nuit instantané (dark = défaut Stock).
 * Tap long (clic droit) : ouvre un mini popover avec les 2 modes
 * (Nuit, Jour) pour donner le contrôle explicite à Otmane.
 */
export function ThemeToggle() {
  const { pref, resolved, setPref, toggle } = useTheme();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const isNight = resolved === "nuit";

  const Icon = isNight ? Moon : Sun;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        onContextMenu={(e) => {
          e.preventDefault();
          setPopoverOpen((v) => !v);
        }}
        aria-label={
          isNight ? "Mode atelier nuit actif — basculer en jour" : "Mode jour actif — basculer en nuit"
        }
        aria-pressed={isNight}
        className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white/80 hover:text-white active:scale-95 transition-all relative"
      >
        <Icon className="w-4 h-4" strokeWidth={2.2} />
      </button>

      {popoverOpen && (
        <>
          <button
            className="fixed inset-0 z-30 cursor-default"
            aria-hidden
            onClick={() => setPopoverOpen(false)}
          />
          <div
            role="menu"
            className="absolute right-0 mt-2 z-40 w-[180px] bg-white rounded-2xl shadow-card-lg border border-rule overflow-hidden"
          >
            <div className="px-3 pt-2 pb-1.5 border-b border-rule">
              <p className="label-caps text-text-tertiary">Mode atelier</p>
            </div>
            {(
              [
                { key: "nuit", label: "Nuit", icon: Moon },
                { key: "jour", label: "Jour", icon: Sun },
              ] as const
            ).map(({ key, label, icon: ItemIcon }) => {
              const active = pref === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    setPref(key);
                    setPopoverOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-[13px] font-semibold transition-colors ${
                    active
                      ? "bg-cream text-primary-dark"
                      : "text-text-secondary hover:bg-cream/60"
                  }`}
                >
                  <ItemIcon className="w-4 h-4 shrink-0" strokeWidth={2.2} />
                  <span className="flex-1">{label}</span>
                  {active && (
                    <span className="w-1.5 h-1.5 rounded-full bg-gold" />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default ThemeToggle;
