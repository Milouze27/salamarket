"use client";

/**
 * AlertCard — bloc d'alerte unifié pour DLC / stockout / casse.
 *
 * 3 variantes pilotées par `tone` :
 *   - "danger"  : DLC J-1, rupture imminente (bordeaux #A8231A soft)
 *   - "warn"    : DLC J-2/3, stock bas (or #D97706 soft)
 *   - "info"    : casse delta, baseline (sapin soft)
 *
 * Pattern : icône carrée 44px à gauche + titre/sous-titre + big number
 * à droite + chevron tap. La carte entière est tappable (button) → ouvre
 * un détail (passe via `onTap`).
 *
 * Les rows secondaires (top 3 produits par exemple) sont rendues en
 * children pour garder la card flexible.
 */
import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "danger" | "warn" | "info" | "neutral";

interface AlertCardProps {
  icon: LucideIcon;
  tone: Tone;
  eyebrow: string;
  title: string;
  /** Big number displayed top-right (ex "14" or "287 €"). */
  metric?: string;
  /** Phrase courte sous le titre, ex "valeur estimée à recapter". */
  hint?: string;
  /** Lignes détail (ProductRow par exemple). */
  children?: ReactNode;
  onTap?: () => void;
  /** Texte du CTA bas, par défaut "Tap pour creuser". */
  ctaLabel?: string;
}

const TONE_STYLES: Record<
  Tone,
  {
    iconBg: string;
    iconColor: string;
    metricColor: string;
    border: string;
    eyebrowColor: string;
  }
> = {
  danger: {
    iconBg: "bg-[var(--danger-soft)]",
    iconColor: "text-[var(--danger)]",
    metricColor: "text-[var(--danger)]",
    border: "border-[var(--danger-border)]",
    eyebrowColor: "text-[var(--danger)]",
  },
  warn: {
    iconBg: "bg-[var(--warning-soft)]",
    iconColor: "text-[var(--warning)]",
    metricColor: "text-[var(--warning)]",
    border: "border-[var(--warning-border)]",
    eyebrowColor: "text-[var(--warning)]",
  },
  info: {
    iconBg: "bg-[var(--success-soft)]",
    iconColor: "text-[var(--success)]",
    metricColor: "text-[var(--success)]",
    border: "border-[var(--border-card)]",
    eyebrowColor: "text-[var(--success)]",
  },
  neutral: {
    iconBg: "bg-[var(--surface-2)]",
    iconColor: "text-[var(--text-secondary)]",
    metricColor: "text-[var(--text-primary)]",
    border: "border-[var(--border-card)]",
    eyebrowColor: "text-[var(--text-secondary)]",
  },
};

export function AlertCard({
  icon: Icon,
  tone,
  eyebrow,
  title,
  metric,
  hint,
  children,
  onTap,
  ctaLabel = "Tap pour creuser",
}: AlertCardProps) {
  const style = TONE_STYLES[tone];
  const isClickable = Boolean(onTap);

  const inner = (
    <div className="flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`inline-flex w-11 h-11 rounded-xl items-center justify-center shrink-0 ${style.iconBg} ${style.iconColor}`}
        >
          <Icon className="w-5 h-5" strokeWidth={2.2} />
        </span>
        <div className="flex-1 min-w-0">
          <p
            className={`text-[10.5px] font-bold uppercase tracking-[0.14em] ${style.eyebrowColor}`}
          >
            {eyebrow}
          </p>
          <p className="text-[16px] font-bold text-[var(--text-primary)] leading-tight mt-0.5">
            {title}
          </p>
          {hint && (
            <p className="text-[12.5px] text-[var(--text-secondary)] mt-1 leading-snug">
              {hint}
            </p>
          )}
        </div>
        {metric && (
          <span
            className={`text-[24px] font-extrabold tabular leading-none shrink-0 ${style.metricColor}`}
          >
            {metric}
          </span>
        )}
      </div>

      {/* Detail rows */}
      {children && (
        <div className="flex flex-col divide-y divide-[var(--border-hairline)] -mx-1">
          {children}
        </div>
      )}

      {/* CTA tap */}
      {isClickable && (
        <div className="flex items-center justify-between text-[12px] font-bold text-[var(--primary-green-hover)] pt-1">
          <span>{ctaLabel}</span>
          <ChevronRight className="w-4 h-4" strokeWidth={2.4} />
        </div>
      )}
    </div>
  );

  if (isClickable) {
    return (
      <button
        type="button"
        onClick={onTap}
        className={`w-full text-left bg-[var(--surface-1)] border ${style.border} rounded-[22px] p-4 sm:p-5 shadow-[var(--shadow-card)] active:scale-[0.99] transition-transform`}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      className={`bg-[var(--surface-1)] border ${style.border} rounded-[22px] p-4 sm:p-5 shadow-[var(--shadow-card)]`}
    >
      {inner}
    </div>
  );
}

/** Row détail réutilisable dans AlertCard. */
export function AlertCardRow({
  label,
  meta,
  value,
  accent = "neutral",
}: {
  label: string;
  meta?: string;
  value: string;
  accent?: "danger" | "warn" | "neutral";
}) {
  const valueColor =
    accent === "danger"
      ? "text-[var(--danger)]"
      : accent === "warn"
        ? "text-[var(--warning)]"
        : "text-[var(--text-primary)]";
  return (
    <div className="flex items-center justify-between gap-3 px-1 py-2.5 first:pt-1 last:pb-1">
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-[var(--text-primary)] truncate">
          {label}
        </p>
        {meta && (
          <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5 truncate">{meta}</p>
        )}
      </div>
      <span
        className={`text-[13.5px] font-extrabold tabular shrink-0 ${valueColor}`}
      >
        {value}
      </span>
    </div>
  );
}
