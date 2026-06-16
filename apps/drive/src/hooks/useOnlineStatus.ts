import { useSyncExternalStore } from "react";

// ─────────────────────────────────────────────────────────────────
// useOnlineStatus — état de connexion réseau réactif (navigator.onLine).
//
// S'abonne aux events 'online' / 'offline' du navigateur via
// useSyncExternalStore (pas de useState/useEffect : une seule source de
// vérité, zéro flash au mount, SSR-safe via le getServerSnapshot). Aucune
// dépendance au service worker : on lit uniquement navigator.onLine, que
// le navigateur bascule de lui-même quand la connexion tombe/revient.
//
// 100 % client, aucun appel réseau. Sert au bandeau hors-ligne rassurant.
// ─────────────────────────────────────────────────────────────────

const subscribe = (callback: () => void) => {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
};

// navigator.onLine n'est pas fiable à 100 % (il dit juste « pas de réseau
// du tout »), mais il couvre le cas qui compte : avion / tunnel / coupure.
const getSnapshot = () => navigator.onLine;

// SSR / pré-rendu : on suppose en ligne (pas de navigator). Évite un
// bandeau hors-ligne flashé côté serveur puis corrigé à l'hydratation.
const getServerSnapshot = () => true;

/** `true` tant que le navigateur se déclare en ligne. */
export const useOnlineStatus = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
