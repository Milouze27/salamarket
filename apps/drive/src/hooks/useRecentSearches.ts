import { useSyncExternalStore } from "react";
import { safeStorage } from "@/lib/safe-storage";
import { normalizeSearch } from "@/lib/search";

// ─────────────────────────────────────────────────────────────────
// useRecentSearches — dernières recherches de l'utilisateur.
//
// Persiste un petit set de termes saisis (le plus RÉCENT en tête) pour
// les reproposer dans l'overlay de suggestions quand le champ est vide.
// 100 % client : aucun appel réseau, ne touche pas la logique de
// filtrage d'Index. Même grammaire que useRecentlyViewed : module-level
// store + useSyncExternalStore (le composant SearchSuggestions se
// rafraîchit dès qu'une recherche est mémorisée ou effacée). Storage
// défensif (safeStorage) → jamais de white-screen en navigation privée.
// ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "salamarket-recent-searches";
const MAX_TERMS = 6;
// On ne mémorise pas les saisies trop courtes (1-2 lettres = bruit, pas
// une vraie intention de recherche reproposable).
const MIN_LENGTH = 2;

const read = (): string[] => {
  try {
    const raw = safeStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((t): t is string => typeof t === "string")
      : [];
  } catch {
    return [];
  }
};

// Snapshot mémoire partagé : useSyncExternalStore exige une référence
// stable tant que rien ne change (sinon boucle de rendu).
let terms: string[] = read();
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

const getSnapshot = () => terms;

const persist = () => {
  try {
    safeStorage.setItem(STORAGE_KEY, JSON.stringify(terms));
  } catch {
    /* storage indisponible : on garde au moins l'état mémoire de session */
  }
};

// Mémorise un terme en tête. Déduplication insensible aux accents/casse
// (via normalizeSearch) mais on stocke le libellé d'origine (trimé) pour
// le ré-afficher tel que tapé. No-op sous MIN_LENGTH.
export const pushRecentSearch = (raw: string) => {
  const label = raw.trim();
  if (label.length < MIN_LENGTH) return;
  const key = normalizeSearch(label);
  const next = [
    label,
    ...terms.filter((t) => normalizeSearch(t) !== key),
  ].slice(0, MAX_TERMS);
  terms = next;
  persist();
  emit();
};

/** Retire un terme précis (effacement individuel depuis l'overlay). */
export const removeRecentSearch = (raw: string) => {
  const key = normalizeSearch(raw);
  const next = terms.filter((t) => normalizeSearch(t) !== key);
  if (next.length === terms.length) return;
  terms = next;
  persist();
  emit();
};

/** Liste réactive des dernières recherches (plus récente d'abord). */
export const useRecentSearches = (): string[] =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
