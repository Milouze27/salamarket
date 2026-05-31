"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { safeJsonStorage } from "./utils/safe-storage";
import type { Depot, Employe } from "@/lib/types/db";

interface V2State {
  hydrated: boolean;
  setHydrated: (v: boolean) => void;

  /** Depot currently active in the UI. Null until first selection. */
  currentDepot: Depot | null;
  setCurrentDepot: (d: Depot | null) => void;

  /** Employee logged in via PIN. */
  currentEmploye: Employe | null;
  setCurrentEmploye: (e: Employe | null) => void;
  logoutEmploye: () => void;
}

export const useV2 = create<V2State>()(
  persist(
    (set) => ({
      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),

      currentDepot: null,
      setCurrentDepot: (d) => set({ currentDepot: d }),

      currentEmploye: null,
      setCurrentEmploye: (e) => set({ currentEmploye: e }),
      logoutEmploye: () => set({ currentEmploye: null }),
    }),
    {
      name: "salam-v2-store",
      // BUG-003 — safeJsonStorage purge auto les clés JSON corrompues
      // (DevTools, écriture interrompue, migration foirée). Sans ça
      // Zustand rehydrate throw → spinner infini sur /v2.
      storage: safeJsonStorage,
      partialize: (s) => ({
        currentDepot: s.currentDepot,
        currentEmploye: s.currentEmploye,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);
