"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import * as Sentry from "@sentry/nextjs";

/**
 * Root error boundary (Next 14 App Router). Catches uncaught errors in
 * any nested segment that isn't itself wrapped in a scoped error.tsx.
 *
 * Reset = retry the same segment without full reload (Next handles the
 * remount). Logged to console so prod issues surface in Vercel logs.
 *
 * Sentry : `Sentry.captureException` est tagué avec `digest` (l'ID
 * généré par Next) pour qu'on puisse cross-référencer logs Vercel ↔
 * issue Sentry. Cf. backlog `obs-no-sentry-error-tracking`.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[salam-stock] root error boundary:", error);
    Sentry.captureException(error, {
      tags: { boundary: "app/error.tsx", digest: error.digest ?? "none" },
    });
  }, [error]);

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      <div className="mx-auto w-full max-w-[460px] flex-1 flex flex-col">
        <header className="gradient-header rounded-b-[28px] safe-top-hero pb-12 px-6 text-text-ondark">
          <p className="label-caps text-text-ondark/70">erreur · oups</p>
          <h1 className="h1 text-text-ondark mt-2">Un problème est survenu</h1>
          <p className="body-md text-text-ondarkmuted mt-2">
            On n&apos;a pas pu charger cette page. Réessayez, ou revenez à
            l&apos;accueil. L&apos;équipe technique est notifiée.
          </p>
        </header>

        <div className="flex-1 px-5 pt-8 pb-10 space-y-3">
          <button
            type="button"
            onClick={reset}
            className="w-full bg-primary text-white rounded-2xl p-4 flex items-center gap-4 active:scale-[0.99] transition-transform"
          >
            <span className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center">
              <RotateCcw className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-base font-bold">Réessayer</p>
              <p className="text-xs text-white/70">Recharger ce segment</p>
            </div>
          </button>

          <Link
            href="/v2"
            className="bg-white rounded-2xl shadow-card border border-rule p-4 flex items-center gap-4 active:scale-[0.99] transition-transform block"
          >
            <span className="w-11 h-11 rounded-xl bg-primary text-white flex items-center justify-center">
              <Home className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-text-primary">
                Retour à l&apos;accueil
              </p>
              <p className="text-xs text-text-secondary">Hub Salam Stock V2</p>
            </div>
          </Link>

          {error?.digest && (
            <p className="pt-4 px-2 text-[11px] text-text-secondary flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" />
              <span>Référence : {error.digest}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
