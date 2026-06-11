import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface CheckoutState {
  selectedSlotId: string | null;
  setSlot: (id: string) => void;
  clearSlot: () => void;
}

// Persisté en sessionStorage (et non localStorage) : le créneau choisi survit
// à un reload / retour dans le parcours panier→créneaux→paiement (B1-15), mais
// disparaît à la fermeture de l'onglet — une commande non payée ne doit pas
// garder indéfiniment un créneau qui peut être complet/périmé à la session
// suivante. La validité réelle est revérifiée côté serveur au paiement.
export const useCheckoutStore = create<CheckoutState>()(
  persist(
    (set) => ({
      selectedSlotId: null,
      setSlot: (id) => set({ selectedSlotId: id }),
      clearSlot: () => set({ selectedSlotId: null }),
    }),
    {
      name: "salamarket-checkout",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
