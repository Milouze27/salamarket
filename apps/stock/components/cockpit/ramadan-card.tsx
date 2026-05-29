"use client";

/**
 * RamadanCard — la carte qui rend le produit "halal-native".
 *
 * Tout SaaS retail FR sait afficher Noël. Aucun ne sait afficher
 * Ramadan dans X jours, encore moins distinguer Aïd al-Fitr / al-Adha
 * et leurs courbes de demande différentes. C'est le détail qui fait
 * dire à Otmane "ah ouais ils ont compris ce qu'on fait".
 *
 * Affiche :
 *   - Countdown big number (jours)
 *   - Libellé event ("Aïd al-Fitr 1447")
 *   - Date FR ("vendredi 20 mars")
 *   - Pill impact (critique / fort / moyen)
 *   - Mini-fenêtre 3 prochains événements (timeline horizontale)
 *
 * Visuel : fond cream + filet or vertical à gauche (rappel sapin/or).
 */
import { Moon } from "lucide-react";

interface RamadanCardProps {
  message: string;                 // ex "Ramadan dans 28 jours"
  joursJusqua: number | null;
  libelle: string | null;          // ex "Ramadan 1447 — début"
  dateDebutIso: string | null;     // ex "2026-02-18"
  enCours: boolean;
  impactCa: "faible" | "moyen" | "fort" | "critique" | null;
  /** Mini-timeline événements suivants (libellé + jours). */
  fenetre?: Array<{ libelle: string; jours: number; impact: string }>;
}

function formatDateFr(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

const IMPACT_STYLES: Record<
  "faible" | "moyen" | "fort" | "critique",
  { bg: string; text: string; label: string }
> = {
  faible:   { bg: "bg-[#F4E9C4]/55", text: "text-[#8B6F0E]", label: "Impact faible" },
  moyen:    { bg: "bg-[#F4E9C4]",    text: "text-[#8B6F0E]", label: "Impact moyen" },
  fort:     { bg: "bg-[#DDB31C]/85", text: "text-[#082A20]", label: "Impact fort" },
  critique: { bg: "bg-[#A8231A]",    text: "text-white",     label: "Impact critique" },
};

export function RamadanCard({
  message,
  joursJusqua,
  libelle,
  dateDebutIso,
  enCours,
  impactCa,
  fenetre = [],
}: RamadanCardProps) {
  const impact = impactCa ? IMPACT_STYLES[impactCa] : null;

  return (
    <div
      className="relative bg-[#FAF7EE] border border-[#E8E4D8] rounded-[22px] p-5 sm:p-6 overflow-hidden"
      style={{ boxShadow: "0 2px 12px rgba(14, 59, 46, 0.06)" }}
    >
      {/* Filet or vertical gauche */}
      <span
        aria-hidden
        className="absolute left-0 top-6 bottom-6 w-[3px] rounded-full"
        style={{ background: "linear-gradient(180deg, #DDB31C 0%, #C9A227 100%)" }}
      />

      <div className="flex flex-col gap-4 pl-2">
        {/* Eyebrow + impact */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Moon className="w-4 h-4 text-[#C9A227]" strokeWidth={2.4} />
            <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#8B6F0E]">
              Calendrier hijri
            </p>
          </div>
          {impact && (
            <span
              className={`text-[10px] font-bold uppercase tracking-[0.1em] px-2.5 py-1 rounded-full ${impact.bg} ${impact.text}`}
            >
              {impact.label}
            </span>
          )}
        </div>

        {/* Big countdown */}
        <div className="flex items-end gap-3 flex-wrap">
          {joursJusqua !== null && !enCours && (
            <p className="text-[56px] sm:text-[64px] font-extrabold leading-none tracking-tight text-[#0E3B2E] tabular">
              {joursJusqua === 0 ? "J" : `J-${joursJusqua}`}
            </p>
          )}
          {enCours && (
            <p className="text-[36px] sm:text-[40px] font-extrabold leading-none tracking-tight text-[#0E3B2E]">
              En cours
            </p>
          )}
          <div className="flex flex-col gap-0.5 pb-1.5 min-w-0">
            <p className="text-[16px] font-bold text-[#0F1A14] leading-tight">
              {libelle ?? message}
            </p>
            {dateDebutIso && (
              <p className="text-[12.5px] text-[#5A6470] capitalize">
                {formatDateFr(dateDebutIso)}
              </p>
            )}
          </div>
        </div>

        {/* Mini timeline événements suivants */}
        {fenetre.length > 0 && (
          <div className="flex flex-col gap-1.5 pt-2 border-t border-[#E8E4D8]">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#5A6470] mb-1">
              90 prochains jours
            </p>
            {fenetre.slice(0, 3).map((f, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 py-1"
              >
                <p className="text-[13px] font-semibold text-[#0F1A14] truncate">
                  {f.libelle}
                </p>
                <span className="text-[12px] font-bold text-[#5A6470] tabular shrink-0">
                  J-{f.jours}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
