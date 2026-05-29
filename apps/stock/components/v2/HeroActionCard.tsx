/**
 * HeroActionCard — card promotion sapin plein sur les hubs
 *
 * Pattern Drive : sapin plein (#0E3B2E), icône or (#C9A227)
 * dans un disque or pâle translucide, gros titre blanc, sous-
 * titre cream-muted. Halo radial or top-right pour la chaleur.
 *
 * Utilisé sur les pages hub V2 pour PROMOUVOIR une action
 * principale (ex : "Préparer une commande", "Nouvelle
 * réception") sans tomber dans la grille uniforme des autres
 * actions. Drive applique systématiquement cette hiérarchie :
 * 1 hero + N secondaires.
 *
 * Accessible : Link wrapper, focus-visible outline gold.
 */
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface HeroActionCardProps {
  href: string;
  eyebrow?: string;
  title: string;
  desc?: string;
  icon: LucideIcon;
  /** Optional accent badge top-right (ex "Temps réel"). */
  badge?: string;
}

export function HeroActionCard({
  href,
  eyebrow,
  title,
  desc,
  icon: Icon,
  badge,
}: HeroActionCardProps) {
  return (
    <Link
      href={href}
      className="hero-action-card group card-tappable focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-gold)]"
    >
      {/* Top row — eyebrow + badge */}
      {(eyebrow || badge) && (
        <div className="relative z-10 flex items-start justify-between gap-3">
          {eyebrow && (
            <p
              className="text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--accent-gold)]"
            >
              {eyebrow}
            </p>
          )}
          {badge && (
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] bg-[rgba(201,162,39,0.18)] text-[color:var(--accent-gold)] px-2.5 py-1 rounded-full">
              {badge}
            </span>
          )}
        </div>
      )}

      {/* Icon */}
      <span
        aria-hidden
        className="relative z-10 inline-flex w-14 h-14 rounded-2xl items-center justify-center bg-[rgba(201,162,39,0.18)] text-[color:var(--accent-gold)]"
      >
        <Icon className="w-7 h-7" strokeWidth={2.2} />
      </span>

      {/* Title + description + chevron */}
      <div className="relative z-10 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[22px] font-extrabold leading-[1.1] text-white tracking-tight">
            {title}
          </h2>
          {desc && (
            <p className="text-[13px] text-[color:var(--text-on-dark-muted)] mt-1.5 leading-snug">
              {desc}
            </p>
          )}
        </div>
        <span
          aria-hidden
          className="inline-flex w-10 h-10 rounded-full items-center justify-center bg-[rgba(201,162,39,0.18)] text-[color:var(--accent-gold)] shrink-0 transition-transform group-active:translate-x-0.5"
        >
          <ArrowRight className="w-5 h-5" strokeWidth={2.4} />
        </span>
      </div>
    </Link>
  );
}
