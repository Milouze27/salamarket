"use client";

/**
 * CounterPreview — carte admin qui montre l'écran de retrait `/v2/counter`
 * en miniature, et permet de l'ouvrir plein écran sur un device dédié
 * (iPad au comptoir, TV behind the counter).
 *
 * Inséré dans /v2/admin (orchestrator agent intègre ce composant).
 * On utilise une iframe scaled 25% pour avoir un vrai aperçu live.
 *
 * Constraints :
 *   - iframe scaled : transform: scale(0.25) + width 400% pour rester net.
 *   - pointer-events: none sur l'iframe → tout clic ouvre l'onglet.
 *   - aria pour expliquer au screen reader ce que c'est.
 */

import { useState } from "react";
import { ExternalLink, Maximize2, Monitor } from "lucide-react";

const COUNTER_PATH = "/v2/counter";

export function CounterPreview() {
  const [loaded, setLoaded] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        // Nouvel onglet, named target pour réutiliser la fenêtre si déjà ouverte
        // (utile si l'admin clique plusieurs fois — pas 5 onglets empilés).
        window.open(COUNTER_PATH, "salam-counter", "noopener,noreferrer");
      }}
      className="group relative w-full bg-white border border-rule rounded-[20px] shadow-card overflow-hidden text-left active:scale-[0.99] transition-transform"
      aria-label="Ouvrir l'écran de retrait client en plein écran (nouvel onglet)"
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-[#0E3B2E] text-[#C9A227] flex items-center justify-center shrink-0">
          <Monitor className="w-4 h-4" strokeWidth={2.2} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold text-text-primary leading-tight">
            Écran de retrait client
          </p>
          <p className="text-[10.5px] text-text-tertiary uppercase tracking-wide mt-0.5 leading-tight">
            iPad / TV au comptoir · plein écran
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
          Ouvrir <ExternalLink className="w-3 h-3" />
        </span>
      </div>

      {/* Preview iframe — scaled to fit the card */}
      <div className="relative mx-4 mb-4 rounded-2xl overflow-hidden bg-[#082A20] border border-rule/40 aspect-[16/9]">
        {/* Loading shimmer */}
        {!loaded && (
          <div className="absolute inset-0 bg-gradient-to-br from-[#0E3B2E] to-[#082A20] flex items-center justify-center">
            <div className="text-[#C9A227]/50 text-[10px] font-bold tracking-[0.32em] uppercase animate-pulse">
              Chargement…
            </div>
          </div>
        )}

        {/* Scaled iframe (25%) — 400% width + height keeps it crisp */}
        <iframe
          src={COUNTER_PATH}
          title="Aperçu écran de retrait"
          aria-hidden="true"
          tabIndex={-1}
          onLoad={() => setLoaded(true)}
          className="absolute top-0 left-0 origin-top-left pointer-events-none"
          style={{
            width: "400%",
            height: "400%",
            transform: "scale(0.25)",
            border: "0",
          }}
        />

        {/* Overlay hint */}
        <div className="absolute bottom-2 right-2 inline-flex items-center gap-1 bg-black/60 backdrop-blur text-white/90 text-[10px] font-bold tracking-wide uppercase rounded-full px-2.5 py-1">
          <Maximize2 className="w-3 h-3" />
          Plein écran
        </div>
      </div>
    </button>
  );
}
