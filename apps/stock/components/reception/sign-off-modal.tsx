"use client";

/**
 * SignOffModal — modal de finalisation BDL scanner-first.
 *
 * Récap visuel avant clôture :
 *   - Température palette (cohérence chaîne du froid)
 *   - Photos palette obligatoires (preuve litige)
 *   - Écart total en euros (calcul live côté serveur via prix_achat_ht)
 *   - Lignes en surplus / manquantes synthétisées
 *
 * Si l'écart dépasse 2 % de la valeur attendue, un bandeau ambre
 * prévient que Otmane recevra une push instantanée et qu'il doit
 * accepter / refuser depuis son iPhone — le réceptionneur ne décide
 * pas seul d'une déviation > 2 %.
 *
 * Composant 100 % présentation : la parente déclenche le POST
 * `/api/bdl/finalize`. Ici on ne fait que confirmer.
 */

import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Loader2,
  PackageCheck,
  Send,
  Thermometer,
  X,
} from "lucide-react";

interface EcartLine {
  produit_nom: string;
  attendu: number;
  recu: number;
  ecart_qte: number;
  ecart_eur: number;
}

interface SignOffModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  submitting: boolean;

  fournisseurNom: string;
  numeroBdl: string;

  temperature: number | null;
  seuilMax: number;

  photosOk: boolean;

  progressionScanned: number;
  progressionTotal: number;

  ecartTotalEur: number;
  ecartValeurAttendueEur: number;
  ecartLignes: EcartLine[];
}

export function SignOffModal({
  open,
  onClose,
  onConfirm,
  submitting,
  fournisseurNom,
  numeroBdl,
  temperature,
  seuilMax,
  photosOk,
  progressionScanned,
  progressionTotal,
  ecartTotalEur,
  ecartValeurAttendueEur,
  ecartLignes,
}: SignOffModalProps) {
  const tempOk = temperature !== null && temperature <= seuilMax;
  const tempMissing = temperature === null;

  // Seuil critique 2 % : push instantanée Otmane si dépassé.
  const ecartRatio =
    ecartValeurAttendueEur > 0
      ? Math.abs(ecartTotalEur) / ecartValeurAttendueEur
      : 0;
  const ecartDepasseSeuil = ecartRatio > 0.02 && ecartValeurAttendueEur > 0;

  const blockers: string[] = [];
  if (tempMissing) blockers.push("Température palette manquante");
  if (!tempOk && !tempMissing)
    blockers.push(`Température ${temperature?.toFixed(1)}°C > seuil ${seuilMax}°C`);
  if (!photosOk) blockers.push("Les 2 photos palette sont obligatoires");

  const canSubmit = blockers.length === 0 && !submitting;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-end justify-center"
        >
          <motion.div
            initial={{ y: 80 }}
            animate={{ y: 0 }}
            exit={{ y: 80 }}
            transition={{ type: "spring", damping: 26, stiffness: 260 }}
            className="bg-white w-full max-w-[460px] rounded-t-[28px] shadow-card-lg max-h-[92vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="px-6 pt-6 pb-3 sticky top-0 bg-white border-b border-rule z-10">
              <div className="flex items-start gap-3">
                <span className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center shrink-0">
                  <PackageCheck className="w-6 h-6" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="label-caps text-primary">Validation finale</p>
                  <h3 className="text-[18px] font-extrabold text-text-primary mt-1 truncate">
                    {fournisseurNom}
                  </h3>
                  <p className="text-[11px] font-mono text-text-tertiary mt-0.5">
                    {numeroBdl} · {progressionScanned}/{progressionTotal} cartons
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="text-text-tertiary w-11 h-11 -mr-2 flex items-center justify-center rounded-full active:scale-95 active:bg-cream shrink-0"
                  aria-label="Fermer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Checklist conformité (bloquants) */}
              <div className="space-y-2">
                <ChecklistItem
                  ok={!tempMissing && tempOk}
                  pending={tempMissing}
                  label={
                    tempMissing
                      ? "Température palette — à saisir"
                      : tempOk
                        ? `Température ${temperature?.toFixed(1)}°C ≤ seuil ${seuilMax}°C`
                        : `Température ${temperature?.toFixed(1)}°C dépasse ${seuilMax}°C`
                  }
                  icon={Thermometer}
                />
                <ChecklistItem
                  ok={photosOk}
                  pending={false}
                  label={
                    photosOk
                      ? "2 photos palette enregistrées"
                      : "Photos palette manquantes (2 requises)"
                  }
                  icon={Camera}
                />
              </div>

              {/* Écart valeur */}
              {ecartValeurAttendueEur > 0 && (
                <div
                  className={`rounded-2xl p-4 border-2 ${
                    Math.abs(ecartTotalEur) < 0.005
                      ? "border-success/30 bg-success-soft"
                      : ecartDepasseSeuil
                        ? "border-warning/40 bg-warning-soft"
                        : "border-rule bg-cream"
                  }`}
                >
                  <p className="label-caps text-text-tertiary">Écart valorisé</p>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-[24px] font-extrabold tabular text-text-primary">
                      {ecartTotalEur > 0 ? "+" : ""}
                      {ecartTotalEur.toFixed(2)} €
                    </span>
                    <span className="text-[12px] font-bold text-text-tertiary">
                      {(ecartRatio * 100).toFixed(2)} % du BDL
                    </span>
                  </div>

                  {ecartDepasseSeuil && (
                    <div className="mt-3 flex items-start gap-2 text-[12px] text-warning leading-snug">
                      <Send className="w-4 h-4 mt-0.5 shrink-0" />
                      <p>
                        <b>Push iPhone Otmane à la validation.</b> Il accepte
                        ou refuse l&apos;écart depuis son téléphone — tu peux
                        continuer ton travail.
                      </p>
                    </div>
                  )}
                  {!ecartDepasseSeuil && Math.abs(ecartTotalEur) >= 0.005 && (
                    <p className="text-[12px] text-text-secondary mt-2">
                      Écart sous le seuil de 2 % — validé automatiquement,
                      tracé sur le BR comptable.
                    </p>
                  )}
                </div>
              )}

              {/* Détail lignes en écart */}
              {ecartLignes.length > 0 && (
                <div>
                  <p className="label-caps text-text-tertiary mb-2">
                    Lignes en écart ({ecartLignes.length})
                  </p>
                  <div className="space-y-1.5">
                    {ecartLignes.slice(0, 6).map((l, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-cream border border-rule"
                      >
                        <span className="flex-1 min-w-0 text-[13px] font-semibold text-text-primary truncate">
                          {l.produit_nom}
                        </span>
                        <span className="text-[12px] text-text-tertiary tabular shrink-0">
                          {l.recu}/{l.attendu}
                        </span>
                        <span
                          className={`text-[12px] font-bold tabular shrink-0 ${
                            l.ecart_qte > 0
                              ? "text-warning"
                              : l.ecart_qte < 0
                                ? "text-danger"
                                : "text-text-tertiary"
                          }`}
                        >
                          {l.ecart_qte > 0 ? "+" : ""}
                          {l.ecart_qte}
                        </span>
                      </div>
                    ))}
                    {ecartLignes.length > 6 && (
                      <p className="text-[11px] text-text-tertiary text-center pt-1">
                        + {ecartLignes.length - 6} autres lignes — détail sur le BR PDF
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Bloquants */}
              {blockers.length > 0 && (
                <div className="rounded-2xl p-3 border-2 border-danger/30 bg-danger-soft">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-danger" />
                    <div className="flex-1">
                      <p className="text-[12px] font-bold text-danger uppercase tracking-wide">
                        Conditions de validation
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {blockers.map((b, i) => (
                          <li key={i} className="text-[12.5px] text-danger">
                            · {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div
              className="px-6 pt-2 sticky bottom-0 bg-white border-t border-rule space-y-2"
              style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom))" }}
            >
              <button
                onClick={() => void onConfirm()}
                disabled={!canSubmit}
                className="w-full bg-primary text-white rounded-[18px] py-4 px-5 flex items-center justify-center gap-2 font-bold shadow-card-lg active:scale-[0.99] disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-5 h-5" />
                )}
                {submitting
                  ? "Validation…"
                  : ecartDepasseSeuil
                    ? "Valider + push Otmane"
                    : "Valider la réception"}
              </button>
              <button
                onClick={onClose}
                disabled={submitting}
                className="w-full min-h-[44px] text-text-secondary text-[14px] font-semibold py-2 disabled:opacity-40 active:bg-cream rounded-xl"
              >
                Revenir au scan
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ChecklistItem({
  ok,
  pending,
  label,
  icon: Icon,
}: {
  ok: boolean;
  pending: boolean;
  label: string;
  icon: typeof Thermometer;
}) {
  const palette = ok
    ? "border-success/40 bg-success-soft text-success"
    : pending
      ? "border-rule bg-cream text-text-tertiary"
      : "border-danger/40 bg-danger-soft text-danger";

  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${palette}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="text-[13px] font-semibold flex-1">{label}</span>
      {ok ? (
        <CheckCircle2 className="w-4 h-4 shrink-0" />
      ) : pending ? (
        <span className="text-[10.5px] font-bold uppercase tracking-wide shrink-0">
          À FAIRE
        </span>
      ) : (
        <AlertTriangle className="w-4 h-4 shrink-0" />
      )}
    </div>
  );
}
