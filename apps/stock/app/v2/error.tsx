"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

/**
 * Scoped error boundary for /v2/*. Wraps the staff-facing V2 segment so
 * a single broken sub-page (forecast, fournisseurs, etc.) doesn't take
 * down the whole shell — V2 layout stays mounted (nav still works).
 */
export default function V2Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[salam-stock] /v2 error boundary:", error);
  }, [error]);

  return (
    <div className="px-5 pt-10 pb-24 space-y-3">
      <div className="rounded-2xl border border-rule bg-white p-5 shadow-card">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-warning-soft text-warning flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-bold text-text-primary">
              Cette page n&apos;a pas pu charger
            </p>
            <p className="text-sm text-text-secondary mt-1">
              Réessayez. Si ça persiste, revenez à l&apos;accueil et
              prévenez le manager.
            </p>
          </div>
        </div>
      </div>

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
          <p className="text-xs text-white/70">Recharger cette page</p>
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
            Retour à l&apos;accueil V2
          </p>
          <p className="text-xs text-text-secondary">Hub Salam Stock</p>
        </div>
      </Link>

      {error?.digest && (
        <p className="pt-2 px-2 text-[11px] text-text-secondary">
          Référence : {error.digest}
        </p>
      )}
    </div>
  );
}
