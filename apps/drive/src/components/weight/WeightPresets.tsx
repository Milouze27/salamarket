import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────────────
// WeightPresets — rangée de puces de poids (250 g / 500 g / 1 kg / 2 kg)
// posée AU-DESSUS du KgStepper sur la PDP weight.
//
// Rôle strict : un raccourci de saisie. Chaque puce appelle
// `onSelectKg(valeur)` qui pilote l'input usePoidsInput déjà en place
// (via poids.onChange). Aucune modif du store, aucun calcul de prix ici :
// le poids clampé reste la seule source de vérité (cf. usePoidsInput).
//
// La puce active (poids courant ≈ preset) est en sapin plein ; les autres
// en blanc bord sapin. La hiérarchie passe par la TYPO + le remplissage,
// jamais par un picto (règle design : pas d'icône décorative).
//
// Note palette : on reprend les hex de la surface PDP (#0E3B2E sapin,
// #FAF7EE cream) plutôt que BRAND.colors.primary (#15663C, plus clair et
// absent de cette surface) pour rester visuellement cohérent avec le
// KgStepper et le CTA juste à côté.
// ────────────────────────────────────────────────────────────────────

const SAPIN = "#0E3B2E";

const PRESETS: { kg: number; label: string }[] = [
  { kg: 0.25, label: "250 g" },
  { kg: 0.5, label: "500 g" },
  { kg: 1, label: "1 kg" },
  { kg: 2, label: "2 kg" },
];

interface Props {
  /** Poids courant (kg clampé), pour mettre en avant la puce active. */
  currentKg: number;
  /** Appelé au tap d'une puce — branché sur poids.onChange(String(kg)). */
  onSelectKg: (kg: number) => void;
}

export const WeightPresets = ({ currentKg, onSelectKg }: Props) => {
  return (
    <div
      role="group"
      aria-label="Poids rapides"
      className="flex flex-wrap gap-2 mb-3"
    >
      {PRESETS.map(({ kg, label }) => {
        // Tolérance flottante : usePoidsInput arrondit au dixième, donc une
        // comparaison stricte suffit en pratique, mais on garde une marge
        // pour rester robuste aux arrondis (0.25 → 0.3 après clamp au pas).
        const active = Math.abs(currentKg - kg) < 0.05;
        return (
          <button
            key={kg}
            type="button"
            onClick={() => onSelectKg(kg)}
            aria-pressed={active}
            aria-label={`Choisir ${label}`}
            className={cn(
              "h-11 min-w-[3.25rem] px-4 rounded-full text-[14px] font-bold tabular-nums transition-all active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A227]/50 focus-visible:ring-offset-1 focus-visible:ring-offset-[#FAF7EE]",
              active
                ? "bg-[#0E3B2E] text-white shadow-sm shadow-[#0E3B2E]/25"
                : "bg-white text-[#0E3B2E] border border-[#0E3B2E]/25 hover:border-[#0E3B2E]/50",
            )}
            style={active ? { backgroundColor: SAPIN } : undefined}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
};
