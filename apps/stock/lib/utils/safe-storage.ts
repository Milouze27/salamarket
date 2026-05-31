"use client";

/**
 * safe-storage — wrapper localStorage anti-corruption (BUG-003).
 *
 * Symptôme historique : un JSON malformé dans `salam-stock-store` ou
 * `salam-v2-store` (clear partiel par DevTools, écriture interrompue,
 * mauvaise migration Zustand) faisait throw `JSON.parse`. Le throw
 * remontait dans le rehydrate de Zustand → React Suspense bloqué →
 * spinner infini sur /v2 sans message d'erreur exploitable.
 *
 * Stratégie :
 *   - getItem retourne null si le parse JSON échoue, après avoir purgé
 *     la clé corrompue (sinon le throw se reproduit au prochain reload).
 *   - setItem swallow les QuotaExceededError pour ne pas crasher le
 *     dispatch Zustand (pire cas : le state ne persiste pas, mais l'UI
 *     continue à fonctionner).
 *   - removeItem swallow tout aussi (parano), avec console.warn pour
 *     remonter le signal en dev.
 *
 * Usage Zustand :
 *   storage: createJSONStorage(() => safeStorage)
 *
 * On garde l'interface Storage standard pour rester drop-in.
 */

import { createJSONStorage, type StateStorage } from "zustand/middleware";

const isBrowser = typeof window !== "undefined" && !!window.localStorage;

/**
 * StateStorage attend que getItem renvoie la STRING brute (createJSONStorage
 * fera lui-même JSON.parse derrière). Ici on intercepte aussi un éventuel
 * JSON corrompu en testant le parse au passage : si JSON.parse throw, on
 * purge la clé et on renvoie null pour que Zustand reparte sur l'état
 * initial au lieu de crasher.
 */
export const safeStorage: StateStorage = {
  getItem: (key) => {
    if (!isBrowser) return null;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return null;
      // Pre-validate JSON : si invalide, on purge la clé avant de renvoyer
      // null. Ça évite que createJSONStorage relance le throw.
      try {
        JSON.parse(raw);
      } catch (parseErr) {
        // eslint-disable-next-line no-console
        console.warn(
          `[safeStorage] localStorage[${key}] est corrompu, purge auto`,
          parseErr,
        );
        try {
          window.localStorage.removeItem(key);
        } catch {
          /* noop */
        }
        return null;
      }
      return raw;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[safeStorage] lecture localStorage[${key}] a échoué`, err);
      return null;
    }
  },
  setItem: (key, value) => {
    if (!isBrowser) return;
    try {
      window.localStorage.setItem(key, value);
    } catch (err) {
      // QuotaExceededError ou SecurityError (mode privé Safari iOS).
      // On ne crash pas : on perd juste la persistance pour cette session.
      // eslint-disable-next-line no-console
      console.warn(`[safeStorage] écriture localStorage[${key}] a échoué`, err);
    }
  },
  removeItem: (key) => {
    if (!isBrowser) return;
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[safeStorage] remove localStorage[${key}] a échoué`, err);
    }
  },
};

/**
 * Helper prêt-à-l'emploi pour Zustand : `storage: safeJsonStorage`.
 * Equivalent strict de `createJSONStorage(() => safeStorage)` mais évite
 * de réimporter createJSONStorage dans chaque store.
 */
export const safeJsonStorage = createJSONStorage(() => safeStorage);

/**
 * Purge totale des clés de persistence Zustand (utile depuis l'error
 * boundary : bouton "Réinitialiser l'app"). Itère sur les clés connues
 * pour ne pas wiper d'autres données (theme, consent cookie…).
 */
const KNOWN_KEYS = ["salam-stock-store", "salam-v2-store"] as const;

export function resetAppStorage(): void {
  if (!isBrowser) return;
  for (const k of KNOWN_KEYS) {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* noop */
    }
  }
}
