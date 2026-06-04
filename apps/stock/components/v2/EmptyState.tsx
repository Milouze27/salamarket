"use client";

/**
 * EmptyState (v2) — état vide canonique de l'app Stock, dark par défaut.
 *
 * Pattern unique cross-app pour TOUTE liste vide (po, lots, sortie, recherche,
 * panier, alertes…). Triptyque : icône lucide en or posée dans un disque
 * surface-2 cerclé d'un ring or doux, titre éditorial, copy FR chaleureuse,
 * CTA optionnel intégré (bouton sapin OU lien).
 *
 * Doctrine dark MYTHOS :
 *  - L'or reste un ACCENT : il colore l'icône + le hairline du disque, jamais
 *    une grande surface. Le disque s'élève d'un cran (surface-2) avec un ring
 *    or translucide (--accent-gold-hairline) → profondeur sans fill or.
 *  - Texte primary/secondary via tokens, jamais de hex.
 *  - CTA = sapin plein (primary-green), pas l'or. Glow CTA discret.
 *
 * Usage :
 *   <EmptyState icon={PackageOpen} title="Aucun lot" />
 *   <EmptyState icon={Search} title="Rien trouvé" description="Essaie un autre code."
 *     cta={{ label: "Réinitialiser", onClick: reset }} />
 *   <EmptyState icon={ClipboardList} title="Pas de commande"
 *     cta={{ label: "Voir le catalogue", href: "/v2/po" }} />
 *   <EmptyState icon={...} title="..." action={<CustomNode />} />  // échappatoire
 */

import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface EmptyStateCta {
  label: string;
  /** Action client. Mutuellement exclusif avec `href`. */
  onClick?: () => void;
  /** Navigation interne. Mutuellement exclusif avec `onClick`. */
  href?: string;
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** CTA intégré (rendu en bouton sapin). */
  cta?: EmptyStateCta;
  /** Échappatoire pour un CTA custom (prioritaire sur `cta`). */
  action?: ReactNode;
  /** Resserre le padding vertical quand l'état vide vit dans une card. */
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  cta,
  action,
  compact = false,
  className = "",
}: EmptyStateProps) {
  const ctaClassName =
    "inline-flex items-center justify-center min-h-[44px] px-5 rounded-full text-[14px] font-bold active:scale-[0.98] transition-transform";
  const ctaStyle = {
    background: "var(--primary-green)",
    color: "var(--text-primary)",
    boxShadow: "var(--glow-cta)",
  } as const;

  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-6 ${
        compact ? "py-10" : "py-16"
      } ${className}`}
    >
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{
          background: "var(--surface-2)",
          boxShadow:
            "var(--shadow-card), inset 0 0 0 1px var(--accent-gold-hairline)",
        }}
      >
        <Icon
          className="w-7 h-7"
          style={{ color: "var(--accent-gold)" }}
          strokeWidth={1.8}
        />
      </div>
      <h3
        className="text-lg font-semibold mb-1"
        style={{ color: "var(--text-primary)" }}
      >
        {title}
      </h3>
      {description && (
        <p className="text-sm max-w-xs" style={{ color: "var(--text-secondary)" }}>
          {description}
        </p>
      )}
      {action ? (
        <div className="mt-6">{action}</div>
      ) : cta ? (
        <div className="mt-6">
          {cta.href ? (
            <Link href={cta.href} className={ctaClassName} style={ctaStyle}>
              {cta.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={cta.onClick}
              className={ctaClassName}
              style={ctaStyle}
            >
              {cta.label}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
