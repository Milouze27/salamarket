"use client";

import { motion, AnimatePresence } from "framer-motion";
import { PackageCheck, ScanBarcode, X } from "lucide-react";
import type { CartonSearchHit, LearnCartonState } from "./types";

/**
 * Sheet d'apprentissage de la liaison carton↔produit.
 * Deux étapes : "qty" (combien d'unités dans le carton) puis "pick"
 * (identifier le produit interne par scan ou recherche nom).
 *
 * Composant PUR : tout l'état (learnCartonModal, recherche) et les actions
 * (bind, scan interne) vivent dans page.tsx et descendent en props.
 */
export function CartonLearnModal({
  state,
  cartonScannerOpen,
  searchQuery,
  searchResults,
  onClose,
  onChangeState,
  onOpenCartonScanner,
  onSearchQueryChange,
  onBindProduct,
}: {
  state: LearnCartonState | null;
  cartonScannerOpen: boolean;
  searchQuery: string;
  searchResults: CartonSearchHit[];
  onClose: () => void;
  onChangeState: (next: LearnCartonState) => void;
  onOpenCartonScanner: () => void;
  onSearchQueryChange: (value: string) => void;
  onBindProduct: (produitId: string, produitNom: string) => void;
}) {
  return (
    <AnimatePresence>
      {state && !cartonScannerOpen && (
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
            className="bg-white w-full max-w-[460px] rounded-t-[28px] p-6 pb-8 shadow-card-lg max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start gap-3">
              <span className="w-12 h-12 rounded-2xl bg-gold-soft text-primary-dark flex items-center justify-center shrink-0">
                <PackageCheck className="w-6 h-6" />
              </span>
              <div className="flex-1">
                <p className="label-caps text-primary">Apprentissage carton</p>
                <h3 className="text-[18px] font-extrabold text-text-primary mt-1">
                  {state.step === "qty"
                    ? "Combien d'unités ?"
                    : "Quel produit est dedans ?"}
                </h3>
                <p className="text-[11px] font-mono bg-cream text-text-tertiary inline-block px-2 py-1 rounded-lg mt-2">
                  Carton : {state.code}
                </p>
              </div>
              <button onClick={onClose}>
                <X className="w-5 h-5 text-text-tertiary" />
              </button>
            </div>

            {state.step === "qty" && (
              <>
                <p className="text-[12.5px] text-text-secondary mt-3 leading-relaxed">
                  Indique combien d&apos;unités sont dans ce carton. La
                  prochaine fois que ce code-barre sera scanné, on multipliera
                  automatiquement.
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <button
                    onClick={() =>
                      onChangeState({
                        ...state,
                        qty: Math.max(0, state.qty - 1),
                      })
                    }
                    className="w-12 h-12 rounded-2xl bg-cream border border-rule font-bold text-xl"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    value={state.qty || ""}
                    onChange={(e) =>
                      onChangeState({
                        ...state,
                        qty: Math.max(0, parseInt(e.target.value || "0", 10)),
                      })
                    }
                    onFocus={(e) => {
                      // Scroll vers le centre quand le clavier iOS
                      // s'ouvre (sinon il cache le champ).
                      setTimeout(
                        () =>
                          e.target.scrollIntoView({
                            block: "center",
                            behavior: "smooth",
                          }),
                        340
                      );
                    }}
                    inputMode="numeric"
                    placeholder="ex: 24"
                    className="flex-1 input-field text-center text-2xl font-extrabold"
                  />
                  <button
                    onClick={() =>
                      onChangeState({ ...state, qty: state.qty + 1 })
                    }
                    className="w-12 h-12 rounded-2xl bg-cream border border-rule font-bold text-xl"
                  >
                    +
                  </button>
                </div>
                <button
                  onClick={() => onChangeState({ ...state, step: "pick" })}
                  disabled={state.qty <= 0}
                  className="w-full mt-5 bg-primary text-white rounded-2xl py-3.5 font-bold disabled:opacity-50"
                >
                  Suivant — identifier le produit interne
                </button>
              </>
            )}

            {state.step === "pick" && (
              <>
                <p className="text-[12.5px] text-text-secondary mt-3 leading-relaxed">
                  {state.qty} unités dans le carton. Scanne ou cherche le
                  produit qui est dedans.
                </p>
                <button
                  onClick={onOpenCartonScanner}
                  className="w-full mt-3 bg-primary text-white rounded-2xl py-3 inline-flex items-center justify-center gap-2 font-bold"
                >
                  <ScanBarcode className="w-5 h-5" />
                  Scanner un produit interne
                </button>
                <div className="mt-3">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => onSearchQueryChange(e.target.value)}
                    placeholder="Ou cherche par nom (Cristaline, Coca…)"
                    className="input-field"
                  />
                  <div className="mt-2 max-h-64 overflow-y-auto space-y-1">
                    {searchResults.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => onBindProduct(p.id, p.nom)}
                        className="w-full text-left p-2 rounded-xl active:bg-cream"
                      >
                        <p className="text-sm font-bold text-text-primary truncate">
                          {p.nom}
                        </p>
                        <p className="text-[11px] text-text-tertiary font-mono">
                          {p.ean ?? "—"}
                          {p.categorie && (
                            <span className="ml-2">· {p.categorie}</span>
                          )}
                        </p>
                      </button>
                    ))}
                    {searchQuery.length >= 2 && searchResults.length === 0 && (
                      <p className="text-xs text-text-tertiary text-center py-3">
                        Aucun résultat
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onChangeState({ ...state, step: "qty" })}
                  className="w-full mt-3 text-text-secondary text-sm font-bold py-2"
                >
                  ← Modifier la quantité
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
