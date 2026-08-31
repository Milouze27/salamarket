"use client";

import { Download, PackageCheck, PackagePlus } from "lucide-react";
import type { BdlDetail, Progression } from "./types";

/**
 * Actions de la page réception :
 *  - statut "receptionnee" → lien de téléchargement du BR PDF
 *  - sinon → bouton "Scanner produit suivant" + bouton "Valider la réception"
 *
 * Composant PUR : reçoit les callbacks scan/finalize de page.tsx.
 *
 * Deux enveloppes pour un seul jeu de boutons :
 *  - `ValidationFooter` : la barre collée en bas, geste du pouce. Elle reste
 *    la seule forme au téléphone et disparaît à partir de 1024 px.
 *  - `ValidationActions` : les mêmes boutons posés dans la colonne de travail
 *    du poste d'ordinateur. Mesuré le 31/08/2026 : sur grand écran la barre
 *    collée flottait au MILIEU de l'écran, à 460 px de large, par-dessus la
 *    liste des lignes — elle ne se lisait plus comme une barre d'action.
 */
export function ValidationActions({
  bdl,
  progression,
  allRecu,
  submitting,
  onScan,
  onFinalize,
}: {
  bdl: BdlDetail;
  progression: Progression;
  allRecu: boolean;
  submitting: boolean;
  onScan: () => void;
  onFinalize: () => void;
}) {
  return (
    <div className="space-y-2.5">
      {bdl.statut === "receptionnee" ? (
        <>
          {/* BR PDF — disponible une fois la réception validée.
              ADM-04 : route protégée par lien signé (token HMAC qui expire).
              On ouvre l'onglet AVANT l'await (anti pop-up bloquée) puis on y
              pose l'URL signée générée côté serveur. */}
          <button
            type="button"
            onClick={() => {
              const win = window.open("", "_blank", "noopener,noreferrer");
              void import("@/lib/actions/doc-url")
                .then((m) => m.signBonReceptionPdfUrl(bdl.id))
                .then((url) => {
                  if (win) win.location.href = url;
                })
                .catch(() => win?.close());
            }}
            className="w-full bg-primary text-white rounded-[22px] py-4 px-5 flex items-center justify-between shadow-card-lg active:scale-[0.99]"
          >
            <span className="text-left">
              <span className="block label-caps text-gold">
                BON DE RÉCEPTION
              </span>
              <span className="block font-bold text-[15px]">
                Télécharger le BR PDF
              </span>
            </span>
            <Download className="w-5 h-5 text-gold" />
          </button>
        </>
      ) : (
        <>
          <button
            onClick={onScan}
            className="w-full bg-primary text-white rounded-[22px] py-4 px-5 flex items-center justify-between shadow-card-lg active:scale-[0.99]"
          >
            <span className="text-left">
              <span className="block label-caps text-gold">SCANNER</span>
              <span className="block font-bold text-[15px]">
                Scanner produit suivant
              </span>
            </span>
            <PackagePlus className="w-5 h-5 text-gold" />
          </button>

          <button
            onClick={onFinalize}
            disabled={submitting}
            className={`w-full rounded-[20px] py-3.5 px-4 flex items-center justify-between transition-colors disabled:opacity-50 ${
              allRecu
                ? "bg-success text-white shadow-card"
                : "bg-[color:var(--surface-1)] border border-rule text-text-primary"
            }`}
          >
            <span className="text-left">
              <span className="block text-[10px] font-bold uppercase tracking-[0.12em]">
                {submitting ? "Validation…" : "Valider la réception"}
              </span>
              <span className="block text-[13px] font-extrabold mt-0.5">
                {allRecu
                  ? "Toutes les lignes traitées · BR PDF généré ensuite"
                  : `${progression.scanned}/${progression.total} unités traitées`}
              </span>
            </span>
            <PackageCheck className="w-5 h-5" />
          </button>
        </>
      )}
    </div>
  );
}

/** Barre collée en bas — forme téléphone. Retirée à partir de 1024 px. */
export function ValidationFooter(
  props: Parameters<typeof ValidationActions>[0],
) {
  return (
    <div className="bar-desktop lg:hidden fixed bottom-0 inset-x-0 z-30 pb-safe pointer-events-none">
      <div className="mx-auto max-w-[460px] px-4 pt-3 pb-3 pointer-events-auto">
        <ValidationActions {...props} />
      </div>
    </div>
  );
}
