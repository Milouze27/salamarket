import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeStorage } from "@/lib/safe-storage";

/**
 * Mémo "liste de courses" — note libre, 100 % CLIENT, jamais envoyée au
 * serveur. Persistée en localStorage (clé dédiée) pour survivre au reload
 * sans toucher au panier ni à la commande.
 *
 * Storage défensif (safeStorage) comme cartStore : sur iOS Safari navigation
 * privée / PWA / quota dépassé, un accès localStorage brut throw — safeStorage
 * bascule alors sur une Map mémoire au lieu de perdre la note.
 */

/** Longueur max de la note — borne anti-quota, alignée sur le compteur UI. */
export const SHOPPING_MEMO_MAX = 500;

interface ShoppingMemoState {
  note: string;
  setNote: (note: string) => void;
}

export const useShoppingMemo = create<ShoppingMemoState>()(
  persist(
    (set) => ({
      note: "",
      setNote: (note) => set({ note: note.slice(0, SHOPPING_MEMO_MAX) }),
    }),
    {
      name: "salamarket-shopping-memo",
      storage: createJSONStorage(() => safeStorage),
    },
  ),
);
