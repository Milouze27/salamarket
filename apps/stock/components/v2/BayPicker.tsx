"use client";

/**
 * BayPicker — modal d'assignation borne sur "Avancer → Prêt".
 *
 * Le staff ne CHOISIT PAS la borne. La fonction Supabase `assign_next_bay()`
 * trouve la première borne libre (A1..A6 puis B1..B6) et la renvoie. Le
 * staff voit juste « range en B3 » en énorme et confirme.
 *
 * Flow :
 *   1. Le kanban (page /v2/preparation, NOT TOUCHED HERE) ouvre ce modal
 *      avec `commandeId` et `numeroCommande` quand le staff clique
 *      « Avancer » sur une carte en_preparation.
 *   2. Le modal appelle `assign_next_bay` au mount → affiche la bay.
 *   3. Au clic « Confirmer », on passe `statut='pret'` + close.
 *
 * Le modal ne setCommandeStatut PAS lui-même — il rend `bay` dans
 * onConfirm() pour que le kanban garde la main sur la transaction.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

interface BayPickerProps {
  open: boolean;
  commandeId: string | null;
  numeroCommande?: string;
  onClose: () => void;
  /** Called after staff confirms. Receives the assigned bay label. */
  onConfirm: (bay: string) => void | Promise<void>;
}

export function BayPicker({
  open,
  commandeId,
  numeroCommande,
  onClose,
  onConfirm,
}: BayPickerProps) {
  const [bay, setBay] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Reset + assign quand le modal s'ouvre.
  useEffect(() => {
    if (!open || !commandeId) {
      setBay(null);
      setError(null);
      setLoading(false);
      setConfirming(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const sb = supabase();
        if (!sb) {
          // Mode local (dev sans Supabase) : faux bay pour UX preview.
          if (!cancelled) setBay("A1");
          return;
        }
        const { data, error: rpcErr } = await sb.rpc("assign_next_bay", {
          p_commande_id: commandeId,
        });
        if (cancelled) return;
        if (rpcErr) throw rpcErr;
        const assigned = typeof data === "string" ? data : String(data ?? "");
        if (!assigned) throw new Error("Aucune borne renvoyée");
        setBay(assigned);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : "Erreur d'assignation";
        setError(msg);
        toast.error(`Impossible d'assigner une borne : ${msg}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, commandeId]);

  async function handleConfirm() {
    if (!bay) return;
    setConfirming(true);
    try {
      await onConfirm(bay);
      toast.success(`Commande prête en bay ${bay}`);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      toast.error(`Confirmation échouée : ${msg}`);
    } finally {
      setConfirming(false);
    }
  }

  const isOverflow = bay === "OVERFLOW";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="baypicker-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[80] bg-black/55 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Assignation borne de retrait"
        >
          <motion.div
            key="baypicker-panel"
            initial={{ y: 40, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.24, ease: [0.22, 0.61, 0.36, 1] }}
            className="w-full max-w-md bg-white rounded-[28px] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative px-6 pt-6 pb-3 bg-gradient-to-br from-[#0E3B2E] to-[#082A20] text-white">
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <p className="text-[11px] font-bold tracking-[0.16em] uppercase text-[#C9A227]">
                Borne assignée
              </p>
              <p className="text-[13px] text-white/75 mt-1">
                Commande {numeroCommande ?? ""}
              </p>
            </div>

            {/* Body — gigantic bay label */}
            <div className="px-6 py-10 flex flex-col items-center justify-center text-center">
              {loading && (
                <div className="flex flex-col items-center gap-3 text-text-secondary py-8">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p className="text-sm font-semibold">
                    Recherche d&apos;une borne libre…
                  </p>
                </div>
              )}

              {!loading && error && (
                <div className="text-danger text-sm font-semibold py-8">
                  {error}
                </div>
              )}

              {!loading && bay && !error && (
                <>
                  <MapPin
                    className={`w-7 h-7 mb-3 ${isOverflow ? "text-danger" : "text-[#C9A227]"}`}
                    strokeWidth={2.2}
                  />
                  <p
                    className={`font-extrabold tabular tracking-tight leading-none ${
                      isOverflow ? "text-danger" : "text-[#0E3B2E]"
                    }`}
                    style={{ fontSize: "clamp(72px, 18vw, 128px)" }}
                  >
                    {bay}
                  </p>
                  <p className="text-[13px] text-text-secondary mt-4 max-w-[280px]">
                    {isOverflow
                      ? "Toutes les bornes sont occupées. Range la commande à l'écart et préviens le client manuellement."
                      : "Range la commande dans cette borne au comptoir client."}
                  </p>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 pt-2 bg-white">
              <button
                type="button"
                disabled={!bay || loading || confirming}
                onClick={handleConfirm}
                className="w-full bg-[#0E3B2E] hover:bg-[#082A20] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl py-4 font-bold text-[15px] inline-flex items-center justify-center gap-2 transition-colors active:scale-[0.99]"
              >
                {confirming ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Confirmation…
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Confirmer — rangée en {bay ?? "…"}
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full mt-2 text-text-tertiary text-[12px] font-semibold py-2"
              >
                Annuler
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
