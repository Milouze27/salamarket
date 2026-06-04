"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  Loader2,
  PackageCheck,
  PackagePlus,
  X,
} from "lucide-react";

/**
 * Sheet de création de fiche produit : EAN totalement inconnu (ni BDL ni
 * catalogue). Propose d'abord le choix Carton vs Unité, puis le formulaire
 * fiche (nom, catégorie, prix, qté reçue).
 *
 * Composant PUR : tous les champs du brouillon produit et les actions
 * (bascule carton, submit) vivent dans page.tsx et descendent en props.
 */
export function CreateProductModal({
  code,
  nom,
  categorie,
  prix,
  qty,
  creating,
  onClose,
  onSwitchToCarton,
  onNomChange,
  onCategorieChange,
  onPrixChange,
  onQtyChange,
  onSubmit,
}: {
  code: string | null;
  nom: string;
  categorie: string;
  prix: string;
  qty: number;
  creating: boolean;
  onClose: () => void;
  onSwitchToCarton: () => void;
  onNomChange: (value: string) => void;
  onCategorieChange: (value: string) => void;
  onPrixChange: (value: string) => void;
  onQtyChange: (next: number) => void;
  onSubmit: () => void;
}) {
  return (
    <AnimatePresence>
      {code && (
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
                <PackagePlus className="w-6 h-6" />
              </span>
              <div className="flex-1">
                <p className="label-caps text-primary">Code inconnu</p>
                <h3 className="text-[18px] font-extrabold text-text-primary mt-1">
                  Carton ou unité ?
                </h3>
                <p className="text-[11px] font-mono bg-cream text-text-tertiary inline-block px-2 py-1 rounded-lg mt-2">
                  {code}
                </p>
              </div>
              <button onClick={onClose}>
                <X className="w-5 h-5 text-text-tertiary" />
              </button>
            </div>

            <p className="text-[12.5px] text-text-secondary mt-3 leading-relaxed">
              Indique d&apos;abord le type pour faciliter la suite.
            </p>

            {/* Choix Carton vs Unité — 2 cards égales */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button
                onClick={onSwitchToCarton}
                className="bg-gold-soft text-primary-dark rounded-2xl py-5 flex flex-col items-center gap-2 border-2 border-gold/30 active:scale-95 transition-transform"
              >
                <PackageCheck className="w-7 h-7" />
                <span className="font-extrabold text-[14px]">Carton</span>
                <span className="text-[10.5px] font-medium opacity-80">
                  plusieurs unités
                </span>
              </button>
              <button
                onClick={() => {
                  // Auto-focus le nom après 50ms (laisse le DOM se peindre)
                  setTimeout(() => {
                    document.getElementById("create-prod-nom-input")?.focus();
                  }, 50);
                }}
                className="bg-cream text-primary rounded-2xl py-5 flex flex-col items-center gap-2 border-2 border-rule active:scale-95 transition-transform"
              >
                <PackagePlus className="w-7 h-7" />
                <span className="font-extrabold text-[14px]">Unité</span>
                <span className="text-[10.5px] font-medium opacity-80">
                  1 produit
                </span>
              </button>
            </div>

            <p className="text-[11px] text-text-tertiary text-center mt-4 mb-2">
              Pour 1 unité, remplis la fiche ci-dessous · Pour un carton, tap le
              bouton or
            </p>

            {/* Bascule carton — bouton secondaire texte (au cas où user a déjà tap unité) */}
            <button onClick={onSwitchToCarton} className="hidden">
              <PackageCheck className="w-5 h-5" />
              C&apos;est un carton (pas une unité)
            </button>

            <div className="mt-5 space-y-3">
              <label className="block">
                <span className="label-caps text-text-tertiary block mb-1.5">
                  Nom du produit
                </span>
                <input
                  id="create-prod-nom-input"
                  value={nom}
                  onChange={(e) => onNomChange(e.target.value)}
                  onFocus={(e) => {
                    // Scroll le champ vers le centre pour éviter
                    // que le clavier iOS le cache (340ms = durée
                    // approximative d'ouverture du clavier).
                    setTimeout(
                      () =>
                        e.target.scrollIntoView({
                          block: "center",
                          behavior: "smooth",
                        }),
                      340
                    );
                  }}
                  placeholder="ex : Bricks tunisiens x10"
                  className="input-field"
                />
              </label>

              <label className="block">
                <span className="label-caps text-text-tertiary block mb-1.5">
                  Catégorie
                </span>
                <select
                  value={categorie}
                  onChange={(e) => onCategorieChange(e.target.value)}
                  className="input-field"
                >
                  <option value="Boucherie">Boucherie</option>
                  <option value="Charcuterie">Charcuterie</option>
                  <option value="Épicerie">Épicerie</option>
                  <option value="Frais">Frais</option>
                  <option value="Surgelés">Surgelés</option>
                  <option value="Boissons">Boissons</option>
                  <option value="Hygiène">Hygiène</option>
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="label-caps text-text-tertiary block mb-1.5">
                    Prix unitaire (€)
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={prix}
                    onChange={(e) => onPrixChange(e.target.value)}
                    placeholder="ex : 4.90"
                    className="input-field tabular"
                  />
                </label>

                <label className="block">
                  <span className="label-caps text-text-tertiary block mb-1.5">
                    Qté reçue
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onQtyChange(Math.max(1, qty - 1))}
                      className="w-10 h-12 rounded-2xl bg-cream font-bold text-lg text-text-primary"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={qty}
                      onChange={(e) =>
                        onQtyChange(Math.max(1, parseInt(e.target.value || "1", 10)))
                      }
                      inputMode="numeric"
                      className="flex-1 input-field text-center text-lg font-extrabold tabular"
                    />
                    <button
                      type="button"
                      onClick={() => onQtyChange(qty + 1)}
                      className="w-10 h-12 rounded-2xl bg-cream font-bold text-lg text-text-primary"
                    >
                      +
                    </button>
                  </div>
                </label>
              </div>
            </div>

            <button
              onClick={onSubmit}
              disabled={creating}
              className="w-full mt-5 bg-primary text-white rounded-[18px] py-4 px-5 flex items-center justify-center gap-2 font-bold shadow-card-lg active:scale-[0.99] disabled:opacity-50"
            >
              {creating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
              {creating ? "Création…" : "Créer la fiche et ajouter au BDL"}
            </button>
            <button
              onClick={onClose}
              className="w-full mt-2 text-text-secondary text-[13px] font-semibold py-2"
            >
              Annuler
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
