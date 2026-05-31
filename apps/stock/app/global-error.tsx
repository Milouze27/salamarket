'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { resetAppStorage } from '@/lib/utils/safe-storage';

/**
 * Root-level error boundary. Unlike app/error.tsx, this catches errors thrown in
 * the root layout (layout.tsx, providers, SW registration) and in error.tsx itself.
 * It must render its own <html>/<body>. Tailwind/global CSS is NOT guaranteed to be
 * applied here, so all styling is inline and uses the Salam palette directly.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { boundary: 'global-error' } });
  }, [error]);

  const SAPIN = '#0E3B2E';
  const GOLD = '#C9A227';
  const CREAM = '#FAF7EE';

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: CREAM,
          color: SAPIN,
          textAlign: 'center',
          padding: '24px',
          fontFamily:
            "'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 64,
            height: 64,
            borderRadius: '9999px',
            background: '#F8E9E6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 24,
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#8C2D22" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>
          L&apos;application a rencontré un problème
        </h1>
        <p style={{ fontSize: 14, color: 'rgba(14,59,46,0.6)', maxWidth: 360, margin: '0 0 24px' }}>
          Une erreur inattendue s&apos;est produite. Vous pouvez réessayer, réinitialiser
          l&apos;application ou revenir à l&apos;accueil.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 280 }}>
          <button
            onClick={() => reset()}
            style={{
              height: 48,
              borderRadius: 12,
              border: 'none',
              background: SAPIN,
              color: CREAM,
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Réessayer
          </button>
          <button
            onClick={() => {
              resetAppStorage();
              window.location.href = '/v2/cockpit';
            }}
            style={{
              height: 48,
              borderRadius: 12,
              border: `1px solid ${GOLD}`,
              background: 'transparent',
              color: SAPIN,
              fontSize: 15,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Réinitialiser l&apos;application
          </button>
          <button
            onClick={() => {
              window.location.href = '/v2/cockpit';
            }}
            style={{
              height: 44,
              borderRadius: 12,
              border: 'none',
              background: 'transparent',
              color: 'rgba(14,59,46,0.55)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Retour à l&apos;accueil
          </button>
        </div>
      </body>
    </html>
  );
}
