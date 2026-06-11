import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface CheckoutState {
  selectedSlotId: string | null;
  setSlot: (id: string) => void;
  clearSlot: () => void;
  /**
   * Code promo appliqué dans le panier (normalisé upper). Persisté pour
   * survivre au parcours panier → créneaux → paiement, puis transmis à
   * l'edge create-checkout-session qui RE-VALIDE la remise côté serveur
   * (jamais confiance au client). null = aucun code.
   */
  promoCode: string | null;
  setPromoCode: (code: string | null) => void;
  clearPromoCode: () => void;
}

// Persisté en sessionStorage (et non localStorage) : le créneau choisi survit
// à un reload / retour dans le parcours panier→créneaux→paiement (B1-15), mais
// disparaît à la fermeture de l'onglet — une commande non payée ne doit pas
// garder indéfiniment un créneau qui peut être complet/périmé à la session
// suivante. La validité réelle est revérifiée côté serveur au paiement.
// Idem pour le code promo : la remise est toujours recalculée côté serveur.
export const useCheckoutStore = create<CheckoutState>()(
  persist(
    (set) => ({
      selectedSlotId: null,
      setSlot: (id) => set({ selectedSlotId: id }),
      clearSlot: () => set({ selectedSlotId: null }),
      promoCode: null,
      setPromoCode: (code) =>
        set({ promoCode: code ? code.trim().toUpperCase() || null : null }),
      clearPromoCode: () => set({ promoCode: null }),
    }),
    {
      name: "salamarket-checkout",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
