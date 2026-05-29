import { create } from "zustand";

interface CheckoutState {
  selectedSlotId: string | null;
  setSlot: (id: string) => void;
  clearSlot: () => void;
}

// Pas de persistence : un créneau choisi mais commande non payée doit s'effacer.
export const useCheckoutStore = create<CheckoutState>((set) => ({
  selectedSlotId: null,
  setSlot: (id) => set({ selectedSlotId: id }),
  clearSlot: () => set({ selectedSlotId: null }),
}));
