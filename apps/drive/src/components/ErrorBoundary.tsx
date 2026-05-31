import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /**
   * When this value changes (e.g. the current pathname), the boundary resets
   * itself so a navigation can recover from an error instead of staying stuck.
   */
  resetKey?: string;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Returns true when the error is a failed dynamic import (lazy chunk). This is
 * the classic "stale tab after a new deploy" scenario: the hashed chunk the open
 * tab references no longer exists on the CDN. The only real fix is a hard reload
 * to fetch the new manifest.
 */
function isChunkLoadError(error: Error | null): boolean {
  if (!error) return false;
  const name = error.name || '';
  const message = error.message || '';
  return (
    name === 'ChunkLoadError' ||
    /Loading chunk [\d]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message)
  );
}

// Avoid reload loops: only auto-reload once per session for chunk errors.
const RELOAD_FLAG = 'sala_chunk_reloaded';

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Stale-deploy chunk error → reload once to pick up the new manifest.
    if (isChunkLoadError(error)) {
      try {
        if (!sessionStorage.getItem(RELOAD_FLAG)) {
          sessionStorage.setItem(RELOAD_FLAG, '1');
          window.location.reload();
          return;
        }
      } catch {
        // sessionStorage unavailable (private mode) — fall through to UI.
      }
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('ErrorBoundary caught:', error, errorInfo);
    }
  }

  componentDidUpdate(prevProps: Props) {
    // Reset on navigation so the user isn't trapped on a dead screen.
    if (
      this.state.hasError &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ hasError: false, error: null });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const chunk = isChunkLoadError(this.state.error);

    return (
      <div
        className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 px-6 text-center"
        style={{ backgroundColor: '#FAF7EE' }}
        role="alert"
        aria-live="assertive"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0E3B2E]/8 text-[#0E3B2E]">
          <AlertTriangle className="h-7 w-7" strokeWidth={2} aria-hidden="true" />
        </div>
        <div className="max-w-sm space-y-2">
          <h1 className="text-xl font-bold tracking-tight text-[#0E3B2E]">
            {chunk ? 'Une mise à jour est disponible' : 'Une erreur est survenue'}
          </h1>
          <p className="text-[15px] leading-relaxed text-[#0E3B2E]/70">
            {chunk
              ? 'La boutique a été mise à jour. Rechargez la page pour continuer.'
              : "Quelque chose s'est mal passé de notre côté. Réessayez, le problème est souvent temporaire."}
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2.5 sm:flex-row">
          {!chunk && (
            <button
              type="button"
              onClick={this.handleRetry}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#0E3B2E]/15 bg-white px-5 text-[15px] font-semibold text-[#0E3B2E] transition-transform duration-200 active:scale-[0.97]"
            >
              Réessayer
            </button>
          )}
          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0E3B2E] px-5 text-[15px] font-semibold text-[#FAF7EE] transition-transform duration-200 active:scale-[0.97]"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Recharger la page
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
