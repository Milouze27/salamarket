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
import { ChevronRight, Moon, TrendingUp } from "lucide-react";
import { getSeasonalMode } from "@/lib/hijri";

interface RamadanCardProps {
  message: string;                 // ex "Ramadan dans 28 jours"
  joursJusqua: number | null;
  libelle: string | null;          // ex "Ramadan 1447 — début"
  dateDebutIso: string | null;     // ex "2026-02-18"
  enCours: boolean;
  impactCa: "faible" | "moyen" | "fort" | "critique" | null;
  /** Mini-timeline événements suivants (libellé + jours). */
  fenetre?: Array<{ libelle: string; jours: number; impact: string }>;
  /** MYTH-05 — tap sur le bandeau "mode saisonnier" → /v2/admin/ramadan. */
  onSeasonalTap?: () => void;
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
  onSeasonalTap,
}: RamadanCardProps) {
  const impact = impactCa ? IMPACT_STYLES[impactCa] : null;
  // MYTH-05 — résolution locale du mode saisonnier actif (pré-Ramadan /
  // Ramadan / pré-Aïd / Aïd). Si actif, on montre le multiplicateur de
  // demande dominant + un CTA vers le centre de pilotage saisonnier.
  const seasonal = getSeasonalMode();

  return (
    <div className="lg relative p-5 sm:p-6 overflow-hidden">
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

        {/* MYTH-05 — bandeau mode saisonnier actif (multiplicateur + CTA) */}
        {seasonal && (
          <button
            type="button"
            onClick={onSeasonalTap}
            disabled={!onSeasonalTap}
            className={`group flex items-center gap-3 w-full text-left rounded-2xl px-3.5 min-h-[44px] py-2.5 transition ${onSeasonalTap ? "tap" : ""}`}
            style={{
              background: "var(--primary-green-soft)",
              border: "1px solid var(--border-premium)",
            }}
          >
            <TrendingUp
              className="w-4 h-4 shrink-0 text-[var(--accent-gold-bright)]"
              strokeWidth={2.6}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-bold text-[var(--text-primary)] truncate">
                {seasonal.titre}
              </p>
              <p className="text-[11px] text-[var(--text-secondary)] truncate">
                Demande jusqu&apos;à ×{seasonal.multiplicateur_max.toFixed(1)} ·
                plan de réassort
              </p>
            </div>
            {onSeasonalTap && (
              <ChevronRight
                className="w-4 h-4 shrink-0 text-[var(--accent-gold-dim)] group-active:translate-x-0.5 transition-transform"
                strokeWidth={2.4}
              />
            )}
          </button>
        )}

        {/* Mini timeline événements suivants */}
        {fenetre.length > 0 && (
          <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--border-hairline)]">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)] mb-1">
              90 prochains jours
            </p>
            {fenetre.slice(0, 3).map((f, i) => (
              <div
                key={i}
                className="rise-in flex items-center justify-between gap-3 py-1"
                style={{ ["--i" as string]: i }}
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
