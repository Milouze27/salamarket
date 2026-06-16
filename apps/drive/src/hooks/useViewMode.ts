import { useSyncExternalStore } from "react";
import { safeStorage } from "@/lib/safe-storage";

// ─────────────────────────────────────────────────────────────────
// useViewMode — densité d'affichage du catalogue : cartes vs liste.
//
//   - 'grid'    : grille de ProductCard (défaut, comportement historique)
//   - 'compact' : liste de lignes denses (ProductRowCompact)
//
// Persiste le choix (localStorage) pour qu'il survive aux navigations.
// Store maison minimal + useSyncExternalStore : un toggle dans la barre
// de tri et la grille d'Index lisent la même valeur réactive. 100 %
// client. Storage défensif (safeStorage) → jamais de white-screen.
// ─────────────────────────────────────────────────────────────────

export type ViewMode = "grid" | "compact";

const STORAGE_KEY = "salamarket-view-mode";

const isViewMode = (v: unknown): v is ViewMode =>
  v === "grid" || v === "compact";

const read = (): ViewMode => {
  try {
    const raw = safeStorage.getItem(STORAGE_KEY);
    return isViewMode(raw) ? raw : "grid";
  } catch {
    return "grid";
  }
};

let mode: ViewMode = read();
const listeners = new Set<() => void>();

const emit = () => {
  for (const l of listeners) l();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => mode;

export const setViewMode = (next: ViewMode) => {
  if (next === mode) return;
  mode = next;
  try {
    safeStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* storage indisponible : on garde au moins l'état mémoire de session */
  }
  emit();
};

/** Mode d'affichage réactif du catalogue ('grid' | 'compact'). */
export const useViewMode = (): ViewMode =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
