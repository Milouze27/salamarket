import { useRef, useState, useId } from "react";
import { Minus, Plus } from "lucide-react";
import { useHaptic } from "@/hooks/useHaptic";

interface RippleSpec {
  key: number;
  x: number;
  y: number;
  /** Bouton d'origine — un ripple ne s'affiche que dans son propre bouton. */
  source: "minus" | "plus";
}

interface Props {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Libellé accessible décrivant ce qui est compté (ex. "portions"). */
  label: string;
  /** Suffixe optionnel affiché après la valeur (ex. "pers."). */
  unitLabel?: string;
  className?: string;
}

/**
 * Stepper +/- « satisfaisant », réutilisable et isolé. Chaque appui déclenche
 * trois feedbacks sobres : pression (scale via active:), ripple sapin léger
 * qui part du point touché, et une micro-vibration (useHaptic → 10ms, gardée
 * par prefers-reduced-motion). Boutons fonctionnels 44×44.
 *
 * Composant contrôlé : la valeur vit chez l'appelant. Bornes min/max
 * appliquées avant onChange — les boutons se désactivent en butée.
 */
export const Stepper = ({
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  label,
  unitLabel,
  className = "",
}: Props) => {
  const haptic = useHaptic();
  const valueId = useId();
  const [ripples, setRipples] = useState<RippleSpec[]>([]);
  const rippleSeq = useRef(0);

  const spawnRipple = (
    e: React.PointerEvent<HTMLButtonElement>,
    source: "minus" | "plus",
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const key = rippleSeq.current++;
    setRipples((prev) => [
      ...prev,
      { key, x: e.clientX - rect.left, y: e.clientY - rect.top, source },
    ]);
    // Nettoyage après l'animation (durée alignée sur le keyframe ci-dessous).
    window.setTimeout(
      () => setRipples((prev) => prev.filter((r) => r.key !== key)),
      450,
    );
  };

  const update = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next === value) return;
    haptic(10);
    onChange(next);
  };

  const atMin = value <= min;
  const atMax = value >= max;

  const btnBase =
    "relative overflow-hidden w-11 h-11 rounded-full flex items-center justify-center " +
    "transition-transform active:scale-90 disabled:opacity-35 disabled:active:scale-100 " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-cream";

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full border border-line bg-white p-1 ${className}`}
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        onPointerDown={(e) => spawnRipple(e, "minus")}
        onClick={() => update(-step)}
        disabled={atMin}
        aria-label={`Retirer (${label})`}
        className={`${btnBase} bg-cream text-ink hover:bg-cream-200`}
      >
        <Minus size={18} strokeWidth={2.6} aria-hidden />
        {ripples
          .filter((r) => r.source === "minus")
          .map((r) => (
            <span
              key={r.key}
              aria-hidden
              className="pointer-events-none absolute rounded-full bg-sapin/20"
              style={{
                left: r.x,
                top: r.y,
                width: 8,
                height: 8,
                marginLeft: -4,
                marginTop: -4,
                animation: "eden-stepper-ripple 450ms ease-out forwards",
              }}
            />
          ))}
      </button>

      <output
        id={valueId}
        aria-live="polite"
        className="min-w-[2.5rem] px-1 text-center text-[17px] font-extrabold tabular-nums text-ink"
      >
        {value}
        {unitLabel ? (
          <span className="ml-0.5 text-[12px] font-semibold text-ink-faint">
            {unitLabel}
          </span>
        ) : null}
      </output>

      <button
        type="button"
        onPointerDown={(e) => spawnRipple(e, "plus")}
        onClick={() => update(step)}
        disabled={atMax}
        aria-label={`Ajouter (${label})`}
        className={`${btnBase} bg-sapin text-white hover:bg-sapin-deep`}
      >
        <Plus size={18} strokeWidth={2.6} aria-hidden />
        {ripples
          .filter((r) => r.source === "plus")
          .map((r) => (
            <span
              key={r.key}
              aria-hidden
              className="pointer-events-none absolute rounded-full bg-white/30"
              style={{
                left: r.x,
                top: r.y,
                width: 8,
                height: 8,
                marginLeft: -4,
                marginTop: -4,
                animation: "eden-stepper-ripple 450ms ease-out forwards",
              }}
            />
          ))}
      </button>
    </div>
  );
};
