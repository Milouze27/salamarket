"use client";

/**
 * TemperatureInput — saisie obligatoire de la température de la palette
 * à la réception. Affichage thermomètre live : vert sous le seuil, ambre
 * proche du seuil, rouge au-dessus. Pour Sodrune, seuil par défaut = 4°C
 * (DGAL : la chaîne du froid frais doit rester ≤ 4°C ; congelé ≤ −18°C).
 *
 * Composant 100 % contrôlé : la page parente persiste la valeur dans
 * `bons_de_livraison.temperature_reception_c` via Supabase. Ici on ne
 * fait que la lecture/saisie + le feedback visuel — pas de réseau.
 *
 * Mobile-first : steppers ±0.5 °C pour saisie au pouce, clavier
 * numérique iOS via `inputMode="decimal"`. Pas de focus auto pour ne
 * pas voler le clavier au scanner.
 */

import {
  Thermometer,
  AlertTriangle,
  CheckCircle2,
  Minus,
  Plus,
} from "lucide-react";
import { useMemo } from "react";

interface TemperatureInputProps {
  /** Valeur courante (°C) ou null si pas encore saisie. */
  value: number | null;
  /** Seuil maximum toléré (°C). Sodrune frais = 4, congelé = -18. */
  seuilMax: number;
  /** Callback à chaque modification. La parente persiste. */
  onChange: (v: number | null) => void;
  /** Label optionnel (par défaut : "Température palette"). */
  label?: string;
  /** Marque le champ comme déjà validé (state lecture seule visuelle). */
  locked?: boolean;
}

export function TemperatureInput({
  value,
  seuilMax,
  onChange,
  label = "Température palette",
  locked = false,
}: TemperatureInputProps) {
  const status = useMemo<"empty" | "ok" | "warn" | "bad">(() => {
    if (value === null || Number.isNaN(value)) return "empty";
    if (value > seuilMax) return "bad";
    if (value > seuilMax - 1) return "warn";
    return "ok";
  }, [value, seuilMax]);

  // Couleurs alignées sur les design tokens
  const palette = {
    empty: {
      ring: "border-rule",
      bg: "bg-white",
      text: "text-text-tertiary",
      pill: "bg-cream text-text-tertiary",
      icon: "text-text-tertiary",
      caption: "Saisie obligatoire avant validation",
    },
    ok: {
      ring: "border-success/40",
      bg: "bg-success-soft",
      text: "text-success",
      pill: "bg-success text-white",
      icon: "text-success",
      caption: `Chaîne du froid conforme (≤ ${seuilMax}°C)`,
    },
    warn: {
      ring: "border-warning/40",
      bg: "bg-warning-soft",
      text: "text-warning",
      pill: "bg-warning text-white",
      icon: "text-warning",
      caption: `Limite proche du seuil ${seuilMax}°C — vérifie`,
    },
    bad: {
      ring: "border-danger/40",
      bg: "bg-danger-soft",
      text: "text-danger",
      pill: "bg-danger text-white",
      icon: "text-danger",
      caption: `RUPTURE FROID — au-dessus du seuil ${seuilMax}°C`,
    },
  }[status];

  function bump(delta: number) {
    if (locked) return;
    const base = value ?? seuilMax - 1;
    const next = Math.round((base + delta) * 10) / 10;
    onChange(next);
  }

  return (
    <div
      className={`rounded-2xl border-2 p-4 transition-colors ${palette.ring} ${palette.bg}`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-white border ${palette.ring}`}
        >
          <Thermometer className={`w-5 h-5 ${palette.icon}`} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="label-caps text-text-tertiary">{label}</p>
          <p className={`text-[12px] font-semibold mt-0.5 ${palette.text}`}>
            {palette.caption}
          </p>
        </div>
        <span
          className={`text-[10.5px] font-bold uppercase tracking-wide px-2 py-1 rounded-full whitespace-nowrap ${palette.pill}`}
        >
          Seuil {seuilMax}°C
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          aria-label="Décrémenter 0,5°C"
          onClick={() => bump(-0.5)}
          disabled={locked}
          className="w-12 h-14 rounded-2xl bg-white border border-rule font-bold text-xl text-text-primary disabled:opacity-40 active:scale-95"
        >
          <Minus className="w-5 h-5 mx-auto" />
        </button>
        <div className="flex-1 relative">
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            aria-label="Température en degrés Celsius"
            disabled={locked}
            value={value ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === "") {
                onChange(null);
                return;
              }
              const n = parseFloat(raw.replace(",", "."));
              onChange(Number.isNaN(n) ? null : n);
            }}
            placeholder="—"
            className={`w-full h-14 rounded-2xl bg-white border-2 ${palette.ring} text-center text-[28px] font-extrabold tabular ${palette.text} outline-none focus:ring-4 focus:ring-[color:var(--primary-ring)] disabled:opacity-60`}
          />
          <span
            className={`absolute right-3 top-1/2 -translate-y-1/2 text-[14px] font-bold ${palette.text} pointer-events-none`}
          >
            °C
          </span>
        </div>
        <button
          type="button"
          aria-label="Incrémenter 0,5°C"
          onClick={() => bump(0.5)}
          disabled={locked}
          className="w-12 h-14 rounded-2xl bg-white border border-rule font-bold text-xl text-text-primary disabled:opacity-40 active:scale-95"
        >
          <Plus className="w-5 h-5 mx-auto" />
        </button>
      </div>

      {status === "bad" && !locked && (
        <div className="mt-3 flex items-start gap-2 text-[12px] text-danger leading-snug">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            <b>Refuse la livraison</b> ou prends photo + lance la procédure
            litige. La compta sera notifiée automatiquement.
          </p>
        </div>
      )}
      {status === "ok" && (
        <div className="mt-3 flex items-start gap-2 text-[12px] text-success leading-snug">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <p>Chaîne du froid validée. Tu peux scanner les cartons.</p>
        </div>
      )}
    </div>
  );
}
