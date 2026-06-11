"use client";

import { motion } from "framer-motion";
import { BackButton } from "@/components/v2/BackButton";
import type { BdlDetail, Progression } from "./types";

/**
 * En-tête de la page réception : retour, fournisseur, n° BDL, n° BDL
 * fournisseur éditable inline, badge statut, barre de progression.
 *
 * Composant PUR : tout l'état d'édition vit dans page.tsx et descend en props.
 * Aucun accès Supabase, aucune logique métier ici.
 */
export function ReceptionHeader({
  bdl,
  progression,
  editingNumFourn,
  numFournDraft,
  onNumFournDraftChange,
  onStartEditNumFourn,
  onSaveNumFourn,
  onCancelEditNumFourn,
}: {
  bdl: BdlDetail;
  progression: Progression;
  editingNumFourn: boolean;
  numFournDraft: string;
  onNumFournDraftChange: (value: string) => void;
  onStartEditNumFourn: () => void;
  onSaveNumFourn: () => void;
  onCancelEditNumFourn: () => void;
}) {
  return (
    <header className="px-5 pt-5 pb-3 bg-cream border-b border-rule">
      <BackButton href="/v2/reception" />
      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label-caps text-primary">
            BDL · {bdl.fournisseurs?.nom ?? "—"}
          </p>
          <h1 className="text-[22px] font-extrabold text-text-primary mt-0.5">
            {bdl.numero_bdl}
          </h1>
          <p className="text-[12px] text-text-secondary mt-0.5">
            Livraison <b>{bdl.depots?.nom ?? "—"}</b> ·{" "}
            {new Date(bdl.date_livraison_prevue).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "long",
            })}
          </p>
          {/* N° BDL fournisseur — éditable inline */}
          {editingNumFourn ? (
            <div className="flex items-center gap-1.5 mt-1.5">
              <input
                value={numFournDraft}
                onChange={(e) => onNumFournDraftChange(e.target.value)}
                placeholder="N° BDL fournisseur"
                className="flex-1 bg-white border border-rule rounded-lg px-2.5 py-1 text-[12px] font-mono"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSaveNumFourn();
                  if (e.key === "Escape") onCancelEditNumFourn();
                }}
              />
              <button
                onClick={onSaveNumFourn}
                aria-label="Confirmer"
                className="bg-primary text-white text-[11px] font-bold px-2.5 py-1 rounded-lg"
              >
                OK
              </button>
              <button
                onClick={onCancelEditNumFourn}
                aria-label="Annuler"
                className="text-text-tertiary text-[11px] px-1"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              onClick={onStartEditNumFourn}
              className="inline-flex items-center gap-1.5 mt-1.5 text-[11px] font-mono"
            >
              {bdl.numero_bdl_fournisseur ? (
                <>
                  <span className="text-text-tertiary">N° BDL fourn :</span>
                  <span className="font-bold text-text-primary">
                    {bdl.numero_bdl_fournisseur}
                  </span>
                  <span className="text-[10px] text-text-tertiary">
                    (éditer)
                  </span>
                </>
              ) : (
                <span className="italic text-primary">
                  + Saisir N° BDL fournisseur
                </span>
              )}
            </button>
          )}
        </div>
        <span
          className={`text-[10.5px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full shrink-0 whitespace-nowrap ${
            bdl.statut === "receptionnee"
              ? "bg-success-soft text-success"
              : bdl.statut === "en_cours"
                ? "bg-gold-soft text-primary-dark"
                : bdl.statut === "litige"
                  ? "bg-danger-soft text-danger"
                  : "bg-cream text-text-tertiary"
          }`}
        >
          {bdl.statut === "receptionnee"
            ? "Réceptionnée"
            : bdl.statut === "en_cours"
              ? "En cours"
              : bdl.statut === "litige"
                ? "Litige"
                : "Prévue"}
        </span>
      </div>

      {/* Progression */}
      <div className="mt-3">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide text-text-tertiary">
            Progression
          </span>
          <span className="text-[13px] font-extrabold tabular text-text-primary">
            {progression.received} / {progression.total} unités
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-cream overflow-hidden">
          <motion.div
            className={`h-full ${
              progression.hasSurReception ? "bg-warning" : "bg-primary"
            }`}
            initial={{ width: 0 }}
            animate={{ width: `${progression.pct}%` }}
            transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
          />
        </div>
        {progression.hasSurReception && (
          <p className="text-[11px] font-bold text-warning mt-1.5">
            Sur-réception détectée · reçu {progression.received} pour{" "}
            {progression.total} attendus. Vérifie les lignes en ambre.
          </p>
        )}
      </div>
    </header>
  );
}
