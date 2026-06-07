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

import { Maximize2, Monitor } from "lucide-react";

const COUNTER_PATH = "/v2/counter";

export function CounterPreview() {
  return (
    <button
      type="button"
      onClick={() => {
        // Nouvel onglet, named target pour réutiliser la fenêtre si déjà ouverte
        // (utile si l'admin clique plusieurs fois — pas 5 onglets empilés).
        window.open(COUNTER_PATH, "salam-counter", "noopener,noreferrer");
      }}
      className="group w-full bg-white border border-rule rounded-[20px] shadow-card text-left active:scale-[0.99] transition-transform px-4 py-3.5 flex items-center gap-3.5"
      aria-label="Ouvrir l'écran de retrait client en plein écran (nouvel onglet)"
    >
      <span className="w-11 h-11 rounded-2xl bg-[var(--primary-green)] text-[var(--accent-gold-bright)] flex items-center justify-center shrink-0">
        <Monitor className="w-5 h-5" strokeWidth={2.1} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-bold text-text-primary leading-tight">
          Écran de retrait client
        </p>
        <p className="text-[12px] text-text-secondary mt-0.5 leading-snug">
          Affiche les commandes prêtes sur l'iPad ou la TV du comptoir.
        </p>
      </div>
      <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-primary shrink-0">
        <Maximize2 className="w-3.5 h-3.5" />
        Ouvrir
      </span>
    </button>
  );
}
