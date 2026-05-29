"use client";

/**
 * useDensity — Confort ↔ Compact pour les pages listes.
 *
 * Confort (défaut) : padding/spacing actuels.
 * Compact : padding réduit, font-size légèrement plus petit, plus d'items
 * à l'écran. Utile pour les sessions intensives (inventaire, prépa rush).
 *
 * L'effet visuel passe par la classe `density-compact` sur <body>.
 * globals.css contient les overrides de variables.
 *
 * Persistance : localStorage key `salam-stock-density`.
 */

import { useCallback, useEffect, useState } from "react";

export type DensityPref = "comfort" | "compact";

const STORAGE_KEY = "salam-stock-density";

function readStoredDensity(): DensityPref {
  if (typeof window === "undefined") return "comfort";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "compact" || raw === "comfort") return raw;
  } catch {
    /* noop */
  }
  return "comfort";
}

function applyToBody(d: DensityPref) {
  if (typeof document === "undefined") return;
  const body = document.body;
  if (d === "compact") body.classList.add("density-compact");
  else body.classList.remove("density-compact");
  body.dataset.density = d;
}

export function useDensity(): {
  density: DensityPref;
  setDensity: (d: DensityPref) => void;
  toggle: () => void;
} {
  const [density, setDensityState] = useState<DensityPref>("comfort");

  useEffect(() => {
    const initial = readStoredDensity();
    setDensityState(initial);
    applyToBody(initial);
  }, []);

  const setDensity = useCallback((d: DensityPref) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, d);
    } catch {
      /* noop */
    }
    setDensityState(d);
    applyToBody(d);
  }, []);

  const toggle = useCallback(() => {
    setDensity(density === "comfort" ? "compact" : "comfort");
  }, [density, setDensity]);

  return { density, setDensity, toggle };
}
