"use client";

import {
  Download,
  FileText,
  PackageCheck,
  PackagePlus,
  ScanBarcode,
} from "lucide-react";
import type { BdlDetail, Progression } from "./types";

/**
 * Actions flottantes sticky en bas de la page réception.
 *  - statut "receptionnee" → lien de téléchargement du BR PDF
 *  - sinon → bouton "Scanner produit suivant" + bouton "Valider la réception"
 *
 * Composant PUR : reçoit les callbacks scan/finalize de page.tsx.
 */
export function ValidationFooter({
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
    <div className="fixed bottom-0 inset-x-0 z-30 pb-safe pointer-events-none">
      <div className="mx-auto max-w-[460px] px-4 pt-3 pb-3 pointer-events-auto space-y-2.5">
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
              <span className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-2xl bg-gold/20 text-gold flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </span>
                <span className="text-left">
                  <span className="block label-caps text-gold">
                    BON DE RÉCEPTION
                  </span>
                  <span className="block font-bold text-[15px]">
                    Télécharger le BR PDF
                  </span>
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
              <span className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-2xl bg-gold/20 text-gold flex items-center justify-center">
                  <ScanBarcode className="w-6 h-6" />
                </span>
                <span className="text-left">
                  <span className="block label-caps text-gold">SCANNER</span>
                  <span className="block font-bold text-[15px]">
                    Scanner produit suivant
                  </span>
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
                  : "bg-white border border-rule text-text-primary"
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
    </div>
  );
}
