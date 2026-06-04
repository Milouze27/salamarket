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
 * Visuel : surface-1 + filet or vertical à gauche (rappel sapin/or).
 * L'or reste accent (filet/glow/chiffre), jamais fill grande surface.
 */
import type { CSSProperties } from "react";
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
  { style: CSSProperties; label: string }
> = {
  faible: {
    style: { background: "var(--accent-gold-soft)", color: "var(--accent-gold-dim)" },
    label: "Impact faible",
  },
  moyen: {
    style: { background: "var(--accent-gold-soft)", color: "var(--accent-gold-bright)" },
    label: "Impact moyen",
  },
  fort: {
    style: {
      background: "var(--warning-soft)",
      color: "var(--warning)",
      border: "1px solid var(--border-premium)",
    },
    label: "Impact fort",
  },
  critique: {
    style: { background: "var(--danger-soft)", color: "var(--danger)" },
    label: "Impact critique",
  },
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
      className="relative bg-[var(--surface-1)] border border-[var(--border-card)] rounded-[22px] p-5 sm:p-6 overflow-hidden"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      {/* Filet or vertical gauche — accent or (liseré), jamais fill */}
      <span
        aria-hidden
        className="absolute left-0 top-6 bottom-6 w-[3px] rounded-full"
        style={{
          background:
            "linear-gradient(180deg, var(--accent-gold-bright) 0%, var(--accent-gold) 100%)",
          boxShadow: "var(--accent-gold-glow)",
        }}
      />

      <div className="flex flex-col gap-4 pl-2">
        {/* Eyebrow + impact */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Moon
              className="w-4 h-4 text-[var(--accent-gold-bright)]"
              strokeWidth={2.4}
            />
            <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-[var(--accent-gold-dim)]">
              Calendrier hijri
            </p>
          </div>
          {impact && (
            <span
              className="text-[10px] font-bold uppercase tracking-[0.1em] px-2.5 py-1 rounded-full"
              style={impact.style}
            >
              {impact.label}
            </span>
          )}
        </div>

        {/* Big countdown */}
        <div className="flex items-end gap-3 flex-wrap">
          {joursJusqua !== null && !enCours && (
            <p
              className="text-[56px] sm:text-[64px] font-extrabold leading-none tracking-tight text-[var(--accent-gold-bright)] tabular"
              style={{ textShadow: "var(--bignum-glow)" }}
            >
              {joursJusqua === 0 ? "J" : `J-${joursJusqua}`}
            </p>
          )}
          {enCours && (
            <p
              className="text-[36px] sm:text-[40px] font-extrabold leading-none tracking-tight text-[var(--accent-gold-bright)]"
              style={{ textShadow: "var(--bignum-glow)" }}
            >
              En cours
            </p>
          )}
          <div className="flex flex-col gap-0.5 pb-1.5 min-w-0">
            <p className="text-[16px] font-bold text-[var(--text-primary)] leading-tight">
              {libelle ?? message}
            </p>
            {dateDebutIso && (
              <p className="text-[12.5px] text-[var(--text-secondary)] capitalize">
                {formatDateFr(dateDebutIso)}
              </p>
            )}
          </div>
        </div>

        {/* Mini timeline événements suivants */}
        {fenetre.length > 0 && (
          <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--border-hairline)]">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)] mb-1">
              90 prochains jours
            </p>
            {fenetre.slice(0, 3).map((f, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 py-1"
              >
                <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                  {f.libelle}
                </p>
                <span className="text-[12px] font-bold text-[var(--text-secondary)] tabular shrink-0">
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
