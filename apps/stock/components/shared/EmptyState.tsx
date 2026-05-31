import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Resserre le padding vertical quand l'état vide vit dans une card. */
  compact?: boolean;
}

/**
 * EmptyState — état vide canonique des deux apps.
 *
 * Triptyque unique : icône lucide en or, posée dans un disque cream cerclé
 * d'un ring or doux (charte sapin/or/cream, zéro Tailwind rainbow), titre
 * éditorial, sous-titre chaleureux, CTA optionnel. Réutilisé partout
 * (po, lots, réception, sortie, recherche, panier) pour que chaque liste
 * vide raconte la même histoire visuelle.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-6 ${
        compact ? "py-10" : "py-16"
      }`}
    >
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{
          background: "var(--bg-cream)",
          boxShadow: "0 0 0 1px var(--border-light), inset 0 0 0 4px rgba(201,162,39,0.10)",
        }}
      >
        <Icon className="w-7 h-7" style={{ color: "var(--accent-gold)" }} strokeWidth={1.8} />
      </div>
      <h3 className="text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        {title}
      </h3>
      {description && (
        <p className="text-sm max-w-xs" style={{ color: "var(--text-secondary)" }}>
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
