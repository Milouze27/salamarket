"use client";

import { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";

/**
 * Dialog de confirmation maison (charte Salamarket) en remplacement de
 * window.confirm() natif — EMP-07. Bottom-sheet cohérent avec SurplusModal.
 *
 * API Promise-based via le hook useConfirmDialog : `await confirm({...})`
 * résout true (confirmé) / false (annulé), pour s'intégrer dans des flux
 * async qui faisaient `if (!window.confirm(...)) return;`.
 */
export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "warning" | "danger";
}

export function useConfirmDialog() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const [resolver, setResolver] = useState<((ok: boolean) => void) | null>(
    null,
  );

  const confirm = useCallback((req: ConfirmRequest) => {
    setRequest(req);
    return new Promise<boolean>((resolve) => {
      setResolver(() => resolve);
    });
  }, []);

  const settle = useCallback(
    (ok: boolean) => {
      resolver?.(ok);
      setResolver(null);
      setRequest(null);
    },
    [resolver],
  );

  return { request, confirm, onConfirm: () => settle(true), onCancel: () => settle(false) };
}

export function ConfirmDialog({
  request,
  onConfirm,
  onCancel,
}: {
  request: ConfirmRequest | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const tone = request?.tone ?? "warning";
  return (
    <AnimatePresence>
      {request && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-end lg:items-center justify-center"
          onClick={onCancel}
        >
          <motion.div
            initial={{ y: 60 }}
            animate={{ y: 0 }}
            exit={{ y: 60 }}
            transition={{ type: "spring", damping: 26, stiffness: 280 }}
            className="sheet-panel w-full max-w-[460px] rounded-t-[28px] p-6 pb-8 shadow-card-lg"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
          >
            <div className="flex items-start gap-3">
              <span
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                  tone === "danger"
                    ? "bg-danger-soft text-danger"
                    : "bg-warning-soft text-warning"
                }`}
              >
                <AlertTriangle className="w-6 h-6" />
              </span>
              <div className="flex-1">
                <h3 className="text-[18px] font-extrabold text-text-primary">
                  {request.title}
                </h3>
                <p className="text-[13px] text-text-secondary mt-1.5 whitespace-pre-line">
                  {request.message}
                </p>
              </div>
            </div>
            <button
              onClick={onConfirm}
              className={`w-full mt-5 text-white rounded-[18px] py-4 px-5 flex items-center justify-center gap-2 font-bold shadow-card-lg active:scale-[0.99] ${
                tone === "danger" ? "bg-danger" : "bg-primary"
              }`}
            >
              {request.confirmLabel ?? "Confirmer"}
            </button>
            <button
              onClick={onCancel}
              className="w-full mt-2 text-text-secondary text-[13px] font-semibold py-2"
            >
              {request.cancelLabel ?? "Annuler"}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
