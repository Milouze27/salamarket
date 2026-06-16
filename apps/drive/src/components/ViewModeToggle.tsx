import { LayoutGrid, Rows3 } from "lucide-react";
import { useViewMode, setViewMode, type ViewMode } from "@/hooks/useViewMode";

// ─────────────────────────────────────────────────────────────────
// ViewModeToggle — bascule densité du catalogue : cartes ↔ liste
// compacte. Posé près de la barre de tri d'Index. Les icônes sont
// FONCTIONNELLES (contrôle segmenté d'affichage, pas un ornement à côté
// d'un libellé) → autorisées par la charte. Lit/écrit le hook useViewMode
// (localStorage). aria-pressed + libellés sr-only pour l'accessibilité.
// ─────────────────────────────────────────────────────────────────

const OPTIONS: { mode: ViewMode; label: string; Icon: typeof LayoutGrid }[] = [
  { mode: "grid", label: "Affichage en cartes", Icon: LayoutGrid },
  { mode: "compact", label: "Affichage en liste compacte", Icon: Rows3 },
];

export const ViewModeToggle = () => {
  const mode = useViewMode();

  return (
    <div
      role="group"
      aria-label="Densité d'affichage du catalogue"
      className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-white border border-[#0E3B2E]/15 p-0.5"
    >
      {OPTIONS.map(({ mode: m, label, Icon }) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => setViewMode(m)}
            aria-pressed={active}
            aria-label={label}
            className={
              "w-9 h-8 rounded-full flex items-center justify-center transition-all active:scale-90 " +
              (active
                ? "bg-[#0E3B2E] text-[#FAF7EE] shadow-sm"
                : "text-[#0E3B2E]/55 hover:text-[#0E3B2E]")
            }
          >
            <Icon size={16} strokeWidth={2.2} aria-hidden />
          </button>
        );
      })}
    </div>
  );
};

export default ViewModeToggle;
