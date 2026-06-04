"use client";

/**
 * HeroKPI — la carte sapin plein qui ouvre le cockpit.
 *
 * Contient l'élément WOW de la démo :
 *   "Sabah el khir Otmane. Ramadan dans 28j. T'as fait 38 420€ hier,
 *    +12% sur N-1."
 *
 * Hiérarchie visuelle :
 *   - Salutation contextuelle (Sabah el khir / Salam / Msa el khir)
 *   - Prénom en or saturé (personnalisation = anti-générique)
 *   - Phrase hijri (le détail culturel que NO compétiteur français a)
 *   - Big number CA hier (display 56px, tabular)
 *   - Delta N-1 en pill couleur (vert > / rouge <)
 *   - Pill secondaire : target hit (87%) ou nb tickets
 *
 * Mobile-first : sapin plein, halo or top-right, padding généreux,
 * pas de skeleton qui clignote (zone reservée min-h pendant load).
 */
import { TrendingUp, TrendingDown, Sparkles } from "lucide-react";

interface HeroKpiProps {
  prenom: string;
  salutation: string;
  hijriMessage: string;
  hijriEnCours: boolean;
  caHier: number | null;
  deltaN1Pct: number | null;
  pctTarget: number | null;
  nbTickets: number | null;
  loading?: boolean;
}

function formatEur(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatPct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export function HeroKpi({
  prenom,
  salutation,
  hijriMessage,
  hijriEnCours,
  caHier,
  deltaN1Pct,
  pctTarget,
  nbTickets,
  loading = false,
}: HeroKpiProps) {
  const deltaPositive = deltaN1Pct !== null && deltaN1Pct >= 0;
  const TrendIcon = deltaPositive ? TrendingUp : TrendingDown;

  return (
    <div
      className="relative overflow-hidden rounded-[28px] p-6 sm:p-7"
      style={{
        background: "var(--hero-gradient)",
        boxShadow:
          "var(--shadow-elevated), inset 0 1px 0 var(--border-premium)",
      }}
    >
      {/* Halo radial or — chaleur sapin */}
      <span
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 100% 0%, var(--accent-gold-soft) 0%, transparent 55%)",
        }}
      />
      {/* Trame or subtile bas-gauche pour anti-flat */}
      <span
        aria-hidden
        className="absolute -bottom-12 -left-12 w-44 h-44 rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, var(--accent-gold-soft) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 flex flex-col gap-5">
        {/* Eyebrow hijri */}
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles
            className="w-3.5 h-3.5 text-[var(--accent-gold-bright)]"
            strokeWidth={2.4}
            aria-hidden
          />
          <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[var(--accent-gold-bright)]">
            {hijriEnCours ? "Période active" : "Prochaine échéance"}
          </p>
          <span
            aria-hidden
            className="w-1 h-1 rounded-full bg-[var(--accent-gold-bright)]/50"
          />
          <p className="text-[10.5px] font-semibold tracking-[0.08em] text-white/70 truncate">
            {hijriMessage}
          </p>
        </div>

        {/* Salutation */}
        <div className="flex flex-col gap-0.5">
          <p className="text-[14px] font-semibold text-white/75 tracking-tight">
            {salutation},
          </p>
          <h1
            className="text-[32px] sm:text-[36px] font-extrabold leading-none tracking-tight text-white"
          >
            {prenom}
            <span className="text-[var(--accent-gold-bright)]">.</span>
          </h1>
        </div>

        {/* Big number CA */}
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/55">
            CA hier
          </p>
          {loading ? (
            <div className="h-12 w-44 rounded-xl bg-white/10 animate-pulse" />
          ) : caHier === null ? (
            <p className="text-[28px] font-extrabold text-white/55 tabular">
              —
            </p>
          ) : (
            <p
              className="text-[44px] sm:text-[52px] font-extrabold leading-[1] tracking-tight text-white tabular"
              style={{ textShadow: "var(--bignum-glow)" }}
              aria-label={`Chiffre d'affaires de la veille : ${formatEur(caHier)}`}
            >
              {formatEur(caHier)}
            </p>
          )}
        </div>

        {/* Pills : delta N-1, target, tickets */}
        <div className="flex flex-wrap items-center gap-2">
          {deltaN1Pct !== null && (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold tabular"
              style={{
                background: deltaPositive
                  ? "var(--success-soft)"
                  : "var(--danger-soft)",
                color: deltaPositive ? "var(--success)" : "var(--danger)",
              }}
              aria-label={`Delta vs même jour semaine précédente : ${formatPct(deltaN1Pct)}`}
            >
              <TrendIcon className="w-3.5 h-3.5" strokeWidth={2.6} />
              {formatPct(deltaN1Pct)}
              <span className="font-semibold opacity-75 text-[11px]">vs N-1</span>
            </span>
          )}
          {pctTarget !== null && (
            <span
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-bold tabular text-[var(--accent-gold-bright)] border border-[var(--border-premium)]"
              style={{ background: "var(--accent-gold-soft)" }}
              aria-label={`Atteinte du target : ${pctTarget.toFixed(0)} pourcent`}
            >
              <span className="opacity-75 font-semibold text-[11px]">Target</span>
              {pctTarget.toFixed(0)}%
            </span>
          )}
          {nbTickets !== null && (
            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12px] font-bold tabular bg-white/10 text-white/85">
              <span className="opacity-75 font-semibold text-[11px]">Tickets</span>
              {nbTickets}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
