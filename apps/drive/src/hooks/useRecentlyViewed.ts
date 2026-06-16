import { useSyncExternalStore } from "react";
import { safeStorage } from "@/lib/safe-storage";

// ─────────────────────────────────────────────────────────────────
// useRecentlyViewed — "Reprendre où vous en étiez".
//
// Persiste un petit set d'ids produits consultés (les Product complets
// restent en mémoire via useProducts ; on ne fige ni prix ni stock dans
// le storage, comme favoritesStore). Le plus RÉCENT en tête.
//
// Store maison minimal (pas de dépendance zustand ici) : un module-level
// store + useSyncExternalStore pour que le carrousel d'accueil se
// rafraîchisse quand l'utilisateur ouvre une PDP puis revient. Storage
// défensif (safeStorage) → jamais de white-screen en navigation privée.
// 100 % client : aucun appel réseau.
// ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "salamarket-recently-viewed";
const MAX_IDS = 12;

const read = (): string[] => {
  try {
    const raw = safeStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
};

// Snapshot mémoire partagé : useSyncExternalStore exige une référence
// stable tant que rien ne change (sinon boucle de rendu).
let ids: string[] = read();
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

const getSnapshot = () => ids;

// Pousse un produit en tête (dédupliqué), tronque à MAX_IDS, persiste.
// No-op si l'id de tête est déjà ce produit → pas de re-render inutile.
export const pushRecentlyViewed = (productId: string) => {
  if (!productId || ids[0] === productId) return;
  ids = [productId, ...ids.filter((id) => id !== productId)].slice(0, MAX_IDS);
  try {
    safeStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* storage indisponible : on garde au moins l'état mémoire de session */
  }
  emit();
};

/** Liste réactive des ids récemment consultés (plus récent d'abord). */
export const useRecentlyViewed = (): string[] =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
