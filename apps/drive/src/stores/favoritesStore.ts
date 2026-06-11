import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeStorage } from "@/lib/safe-storage";

// ─────────────────────────────────────────────────────────────────
// favoritesStore — cœurs/favoris client B2C.
//
// On persiste juste un set d'ids produits (les Product complets sont déjà
// en mémoire via useProducts ; pas la peine de dupliquer/figer leur prix
// ou stock dans le storage). Le rayon "Mes favoris" résout les ids contre
// le catalogue chargé.
//
// Storage défensif (safeStorage) comme cartStore : iOS Safari privé / PWA
// stricte peut throw sur localStorage → bascule sur une Map mémoire au lieu
// de perdre les favoris.
// ─────────────────────────────────────────────────────────────────

interface FavoritesState {
  /** Ids produits favoris (ordre = ordre d'ajout, le plus ancien d'abord). */
  ids: string[];
  /** Bascule le favori d'un produit (ajoute si absent, retire sinon). */
  toggle: (productId: string) => void;
  /** True si le produit est en favori. */
  has: (productId: string) => boolean;
  clear: () => void;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      ids: [],

      toggle: (productId) =>
        set((state) =>
          state.ids.includes(productId)
            ? { ids: state.ids.filter((id) => id !== productId) }
            : { ids: [...state.ids, productId] },
        ),

      has: (productId) => get().ids.includes(productId),

      clear: () => set({ ids: [] }),
    }),
    {
      name: "salamarket-favorites",
      storage: createJSONStorage(() => safeStorage),
      version: 1,
    },
  ),
);
