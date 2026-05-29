// Panier B2B / Drive Pro. Stocké en localStorage (zustand/persist), clé
// "salamarket-pro-cart" pour ne pas écraser le panier particulier.
//
// Une ligne contient le snapshot complet du tarif Pro (paliers, tva,
// conditionnement) au moment de l'ajout — on ne re-fetch pas à la
// commande pour rester cohérent avec ce qui est affiché à l'utilisateur.

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ProCartItem {
  // Tarif Pro
  prix_id: string; // produits_pro_prix.id
  produit_id: string; // products.id
  // Produit
  product_name: string;
  product_image_url: string;
  product_tva_taux: number;
  product_unit: string;
  // Tarif snapshot
  prix_ht_unitaire: number;
  quantite_par_conditionnement: number;
  conditionnement_pro: string | null;
  qty_palier_1: number | null;
  qty_palier_2: number | null;
  remise_palier_1_pct: number | null;
  remise_palier_2_pct: number | null;
  // Quantité (en nombre de conditionnements)
  quantite_conditionnements: number;
}

const MAX_QTY = 999;
const MIN_QTY = 1;

interface ProCartState {
  items: ProCartItem[];
  addItem: (item: Omit<ProCartItem, "quantite_conditionnements">, qty?: number) => void;
  removeItem: (prixId: string) => void;
  updateQuantity: (prixId: string, qty: number) => void;
  clear: () => void;
  getCount: () => number;
}

const clampQty = (qty: number): number =>
  Math.min(MAX_QTY, Math.max(MIN_QTY, Math.floor(qty)));

export const useProCartStore = create<ProCartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item, qty = 1) =>
        set((state) => {
          const existing = state.items.find((i) => i.prix_id === item.prix_id);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.prix_id === item.prix_id
                  ? {
                      ...i,
                      quantite_conditionnements: clampQty(
                        i.quantite_conditionnements + qty,
                      ),
                    }
                  : i,
              ),
            };
          }
          return {
            items: [
              ...state.items,
              { ...item, quantite_conditionnements: clampQty(qty) },
            ],
          };
        }),
      removeItem: (prixId) =>
        set((state) => ({
          items: state.items.filter((i) => i.prix_id !== prixId),
        })),
      updateQuantity: (prixId, qty) =>
        set((state) => {
          if (qty <= 0) {
            return {
              items: state.items.filter((i) => i.prix_id !== prixId),
            };
          }
          return {
            items: state.items.map((i) =>
              i.prix_id === prixId
                ? { ...i, quantite_conditionnements: clampQty(qty) }
                : i,
            ),
          };
        }),
      clear: () => set({ items: [] }),
      getCount: () =>
        get().items.reduce((sum, i) => sum + i.quantite_conditionnements, 0),
    }),
    {
      name: "salamarket-pro-cart",
    },
  ),
);
