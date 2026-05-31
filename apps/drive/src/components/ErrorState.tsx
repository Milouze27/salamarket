import { WifiOff, RefreshCw, AlertTriangle } from 'lucide-react';

interface ErrorStateProps {
  /** Short title. Defaults to a network-failure copy. */
  title?: string;
  /** Supporting line under the title. */
  description?: string;
  /** Retry handler. When provided, a "Réessayer" button is shown. */
  onRetry?: () => void;
  /** Visual variant — 'network' shows an offline glyph, 'generic' a warning. */
  variant?: 'network' | 'generic';
  /** Render inside a card/section rather than full height. */
  inline?: boolean;
  className?: string;
}

/**
 * Shared, on-brand error state for failed fetches (catalogue, commandes,
 * paiement, lot public). Mirrors the editorial tone of the Stock error.tsx
 * screens so both apps present failures the same way.
 */
export function ErrorState({
  title,
  description,
  onRetry,
  variant = 'network',
  inline = false,
  className = '',
}: ErrorStateProps) {
  const Icon = variant === 'network' ? WifiOff : AlertTriangle;
  const resolvedTitle =
    title ?? (variant === 'network' ? 'Connexion interrompue' : 'Une erreur est survenue');
  const resolvedDescription =
    description ??
    (variant === 'network'
      ? "Impossible de charger le contenu. Vérifiez votre connexion puis réessayez."
      : "Quelque chose s'est mal passé. Réessayez dans un instant.");

  return (
    <div
      className={[
        'flex flex-col items-center justify-center gap-5 px-6 text-center',
        inline ? 'py-12' : 'min-h-[60dvh] py-16',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-live="polite"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0E3B2E]/8 text-[#0E3B2E]">
        <Icon className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
      </div>
      <div className="max-w-xs space-y-1.5">
        <p className="text-base font-bold tracking-tight text-[#0E3B2E]">{resolvedTitle}</p>
        <p className="text-[14px] leading-relaxed text-[#0E3B2E]/65">{resolvedDescription}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0E3B2E] px-5 text-[15px] font-semibold text-[#FAF7EE] transition-transform duration-200 active:scale-[0.97]"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Réessayer
        </button>
      )}
    </div>
  );
}

export default ErrorState;
