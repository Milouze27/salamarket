"use client";

/**
 * useTheme — contrôleur de thème du Stock (MYTHOS Wave 1).
 *
 * DARK = DÉFAUT. Le Stock est sombre par défaut (grammaire sapin abyssal +
 * or accent) ; le mode "jour" cream reste un opt-in raffiné.
 *
 * Le mode "auto" (nuit 19h-7h) a été SUPPRIMÉ : il était mort (resolve
 * forçait toujours jour) et n'apportait rien depuis que le dark est le
 * défaut canonique. Il ne reste que deux états : "jour" / "nuit".
 *
 * L'effet visuel passe par :
 *   - `data-theme="jour" | "nuit"` posé sur <html> (source de vérité CSS :
 *     globals.css applique le dark via :root:not([data-theme="jour"]) +
 *     [data-theme="nuit"], donc l'absence d'attribut = dark dès le 1er paint,
 *     sans flash blanc) ;
 *   - `body.theme-nuit` conservé en alias (composants/legacy qui le ciblent).
 *
 * Persistance : localStorage key `salam-stock-theme`.
 */

import { useCallback, useEffect, useState } from "react";

export type ThemePref = "jour" | "nuit";
export type ResolvedTheme = "jour" | "nuit";

const STORAGE_KEY = "salam-stock-theme";
const DEFAULT_THEME: ThemePref = "nuit";

function readStoredPref(): ThemePref {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "jour" || raw === "nuit") return raw;
    // Migration douce : ancien "auto" → nuit (le nouveau défaut).
  } catch {
    /* localStorage indisponible (mode privé Safari, etc.) */
  }
  return DEFAULT_THEME;
}

function applyTheme(theme: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  const body = document.body;
  if (body) {
    body.classList.toggle("theme-nuit", theme === "nuit");
    body.dataset.theme = theme;
  }
}

export function useTheme(): {
  pref: ThemePref;
  resolved: ResolvedTheme;
  setPref: (p: ThemePref) => void;
  toggle: () => void;
} {
  // SSR-safe : dark par défaut (cohérent avec le 1er paint CSS).
  const [pref, setPrefState] = useState<ThemePref>(DEFAULT_THEME);

  // Hydratation client : lit la préférence stockée et la pose.
  useEffect(() => {
    const initial = readStoredPref();
    setPrefState(initial);
    applyTheme(initial);
  }, []);

  const setPref = useCallback((p: ThemePref) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, p);
    } catch {
      /* noop */
    }
    setPrefState(p);
    applyTheme(p);
  }, []);

  const toggle = useCallback(() => {
    setPref(pref === "jour" ? "nuit" : "jour");
  }, [pref, setPref]);

  // pref et resolved sont identiques maintenant qu'il n'y a plus d'auto,
  // mais on garde `resolved` dans l'API pour ne pas casser les consommateurs.
  return { pref, resolved: pref, setPref, toggle };
}
