"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Loader2, Truck, X } from "lucide-react";
import type { SurplusState } from "./types";

/**
 * Sheet de signalement d'un surplus : produit connu du catalogue scanné mais
 * absent du BDL. L'employé indique la quantité reçue en plus, le signalement
 * part vers Otmane + Ahmed (push iPhone) depuis page.tsx.
 *
 * Composant PUR : état (surplusModal, surplusQty) et action submit en props.
 */
export function SurplusModal({
  state,
  qty,
  onClose,
  onQtyChange,
  onSubmit,
}: {
  state: SurplusState | null;
  qty: number | "";
  onClose: () => void;
  onQtyChange: (next: number | "") => void;
  onSubmit: () => void | Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onSubmit();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {state && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end justify-center"
        >
          <motion.div
            initial={{ y: 60 }}
            animate={{ y: 0 }}
            exit={{ y: 60 }}
            transition={{ type: "spring", damping: 26, stiffness: 280 }}
            className="bg-white w-full max-w-[460px] rounded-t-[28px] p-6 pb-8 shadow-card-lg"
          >
            <div className="flex items-start gap-3">
              <span className="w-12 h-12 rounded-2xl bg-danger-soft text-danger flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </span>
              <div className="flex-1">
                <p className="label-caps text-danger">Produit non commandé</p>
                <h3 className="text-[18px] font-extrabold text-text-primary mt-1">
                  {state.produitNom}
                </h3>
                <p className="text-[11px] font-mono bg-cream text-text-tertiary inline-block px-2 py-1 rounded-lg mt-2">
                  {state.code}
                </p>
              </div>
              <button onClick={onClose}>
                <X className="w-5 h-5 text-text-tertiary" />
              </button>
            </div>
            <p className="text-[13px] text-text-secondary mt-4">
              Ce produit ne figure pas sur le bon de livraison du fournisseur.
              Tu peux signaler le surplus à Otmane et Ahmed pour facturation au
              fournisseur ou retour marchandise.
            </p>
            <div className="mt-5">
              <label className="label-caps text-text-tertiary block mb-1.5">
                Quantité reçue en plus
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    onQtyChange(Math.max(1, (Number(qty) || 0) - 1))
                  }
                  className="w-12 h-12 rounded-2xl bg-cream font-bold text-xl text-text-primary"
                >
                  −
                </button>
                <input
                  type="number"
                  value={qty}
                  onChange={(e) =>
                    onQtyChange(
                      e.target.value === ""
                        ? ""
                        : Math.max(1, parseInt(e.target.value, 10) || 1),
                    )
                  }
                  inputMode="numeric"
                  className="flex-1 input-field text-center text-2xl font-extrabold"
                />
                <button
                  onClick={() => onQtyChange((Number(qty) || 0) + 1)}
                  className="w-12 h-12 rounded-2xl bg-cream font-bold text-xl text-text-primary"
                >
                  +
                </button>
              </div>
            </div>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full mt-5 bg-danger text-white rounded-[18px] py-4 px-5 flex items-center justify-center gap-2 font-bold shadow-card-lg active:scale-[0.99] disabled:opacity-60 disabled:active:scale-100"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Envoi en cours…
                </>
              ) : (
                <>
                  <Truck className="w-4 h-4" />
                  Signaler à Otmane et Ahmed
                </>
              )}
            </button>
            <button
              onClick={onClose}
              disabled={submitting}
              className="w-full mt-2 text-text-secondary text-[13px] font-semibold py-2 disabled:opacity-60"
            >
              Annuler
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
