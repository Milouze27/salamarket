"use client";

/**
 * useTheme — atelier nuit / jour controller.
 *
 * Mode "auto" : reste en "jour" (le mode nuit auto entre 19h-7h a été
 * désactivé car il rendait l'app illisible pour les démos qui tournent
 * en soirée — cartes blanches restées hardcodées `bg-white` clashent
 * avec le bg sapin sombre, contraste gold-on-white du bottom nav, etc.).
 * Le mode nuit reste accessible en opt-in explicite via ThemeToggle.
 * Mode "jour" / "nuit" : override manuel persistant.
 *
 * L'effet visuel passe par la classe `theme-nuit` posée sur <body>.
 * globals.css contient l'override des CSS variables sous `body.theme-nuit`.
 *
 * Persistance : localStorage key `salam-stock-theme`.
 */

import { useCallback, useEffect, useState } from "react";

export type ThemePref = "auto" | "jour" | "nuit";
export type ResolvedTheme = "jour" | "nuit";

const STORAGE_KEY = "salam-stock-theme";

function readStoredPref(): ThemePref {
  if (typeof window === "undefined") return "auto";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "jour" || raw === "nuit" || raw === "auto") return raw;
  } catch {
    /* localStorage indisponible (mode privé Safari, etc.) */
  }
  return "auto";
}

function resolve(pref: ThemePref): ResolvedTheme {
  // Auto = jour par défaut. Le mode nuit reste un opt-in conscient
  // (la nuit boutique fonctionne avec les lumières allumées,
  // l'app jour est mieux adaptée à l'écran iPad du comptoir).
  if (pref === "nuit") return "nuit";
  return "jour";
}

function applyToBody(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const body = document.body;
  if (resolved === "nuit") body.classList.add("theme-nuit");
  else body.classList.remove("theme-nuit");
  body.dataset.theme = resolved;
}

export function useTheme(): {
  pref: ThemePref;
  resolved: ResolvedTheme;
  setPref: (p: ThemePref) => void;
  toggle: () => void;
} {
  // Lecture initiale prudente : SSR-safe.
  const [pref, setPrefState] = useState<ThemePref>("auto");
  const [resolved, setResolvedState] = useState<ResolvedTheme>("jour");

  // Hydratation client.
  useEffect(() => {
    const initial = readStoredPref();
    const r = resolve(initial);
    setPrefState(initial);
    setResolvedState(r);
    applyToBody(r);
  }, []);

  // Auto-recheck toutes les 60s pour le mode auto (heure qui passe 19h).
  useEffect(() => {
    if (pref !== "auto") return;
    const id = window.setInterval(() => {
      const r = resolve("auto");
      setResolvedState((prev) => {
        if (prev !== r) applyToBody(r);
        return r;
      });
    }, 60_000);
    return () => window.clearInterval(id);
  }, [pref]);

  const setPref = useCallback((p: ThemePref) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, p);
    } catch {
      /* noop */
    }
    const r = resolve(p);
    setPrefState(p);
    setResolvedState(r);
    applyToBody(r);
  }, []);

  const toggle = useCallback(() => {
    // Toggle simple : jour → nuit, nuit → jour, auto → opposé du résolu courant.
    const next: ThemePref =
      resolved === "jour" ? "nuit" : "jour";
    setPref(next);
  }, [resolved, setPref]);

  return { pref, resolved, setPref, toggle };
}
