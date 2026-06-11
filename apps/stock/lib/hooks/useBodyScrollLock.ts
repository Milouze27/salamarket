"use client";

import { useEffect } from "react";

/**
 * useBodyScrollLock — verrouille le scroll du <body> tant qu'un overlay
 * (drawer, sheet, modale) est ouvert, sans scroll-leak iOS.
 *
 * Pourquoi `position: fixed` et pas `overflow: hidden` :
 *   Sur iOS Safari/PWA, `overflow:hidden` sur body NE bloque PAS le scroll
 *   tactile — le contenu derrière l'overlay continue de défiler (scroll-leak).
 *   La seule méthode fiable est de figer le body en `position:fixed` avec un
 *   `top` négatif égal au scroll courant, puis de restaurer le scrollY à la
 *   fermeture (sinon la page « saute » en haut).
 *
 * Reentrant : plusieurs overlays peuvent être ouverts en même temps. On
 * compte les locks actifs et on ne restaure le body qu'au dernier unlock.
 */
let lockCount = 0;
let savedScrollY = 0;

function lock() {
  lockCount += 1;
  if (lockCount > 1) return; // déjà verrouillé par un overlay parent
  savedScrollY = window.scrollY;
  const body = document.body;
  body.style.position = "fixed";
  body.style.top = `-${savedScrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
}

function unlock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0) return; // un autre overlay tient encore le lock
  const body = document.body;
  body.style.position = "";
  body.style.top = "";
  body.style.left = "";
  body.style.right = "";
  body.style.width = "";
  // Restauration instantanée du scroll (pas de smooth → pas de « saut »).
  window.scrollTo(0, savedScrollY);
}

export function useBodyScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    lock();
    return () => unlock();
  }, [active]);
}
