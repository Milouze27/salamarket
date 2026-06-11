import { useCallback, useEffect, useState } from "react";

// Bornes du Drive au poids — alignées EXACTEMENT sur cartStore.clampKg
// (MIN 0,1 kg · MAX 5 kg · pas 100 g). Le panier et la page produit
// doivent clamper à l'identique, sinon l'affiché diverge du facturé
// (findings B1-01..04, B1-02 : 9999 affiché / 5 kg facturé).
export const POIDS_MIN_KG = 0.1;
export const POIDS_MAX_KG = 5;
export const POIDS_STEP_KG = 0.1;

/** Clamp + round au dixième. Source de vérité unique du Drive au poids. */
export const clampPoidsKg = (kg: number): number => {
  if (!Number.isFinite(kg)) return POIDS_MIN_KG;
  const rounded = Math.round(kg * 10) / 10;
  return Math.min(POIDS_MAX_KG, Math.max(POIDS_MIN_KG, rounded));
};

/** Formate un poids kg pour l'affichage du champ (virgule FR, pas de zéros parasites). */
const formatChamp = (kg: number): string =>
  (Math.round(kg * 10) / 10).toString().replace(".", ",");

interface UsePoidsInput {
  /** Poids kg clampé — pilote le prix ET l'ajout panier (toujours dans [MIN..MAX]). */
  kg: number;
  /** Texte affiché dans le champ (frappe libre tolérée jusqu'au blur). */
  text: string;
  /** À brancher sur l'input pendant la frappe. */
  onChange: (value: string) => void;
  /** À brancher sur le blur : réaligne le champ sur la valeur clampée. */
  onBlur: () => void;
  /** Stepper − : décrémente d'un pas, borné. */
  decrement: () => void;
  /** Stepper + : incrémente d'un pas, borné. */
  increment: () => void;
  atMin: boolean;
  atMax: boolean;
}

/**
 * Saisie de poids estimé partagée page produit ⇄ panier. Garantit que la
 * valeur clampée (`kg`, qui pilote le prix et l'ajout panier) ne diverge
 * jamais de l'affichage au repos : on tolère une frappe intermédiaire libre
 * dans `text`, mais au blur on réécrit le champ avec la valeur réellement
 * utilisée. Le clamp est identique à cartStore.clampKg.
 */
export function usePoidsInput(initialKg = 1): UsePoidsInput {
  const [kg, setKg] = useState(() => clampPoidsKg(initialKg));
  const [text, setText] = useState(() => formatChamp(clampPoidsKg(initialKg)));

  // Re-sync si le poids initial change (changement de produit).
  useEffect(() => {
    const c = clampPoidsKg(initialKg);
    setKg(c);
    setText(formatChamp(c));
  }, [initialKg]);

  const onChange = useCallback((value: string) => {
    // On laisse le champ afficher la frappe brute pour ne pas bloquer
    // l'utilisateur en plein milieu d'un nombre ("2," → "2,5"), MAIS la
    // valeur clampée `kg` (prix + panier) est recalculée immédiatement
    // pour rester cohérente. Le blur réaligne le texte sur `kg`.
    setText(value);
    const raw = value.replace(",", ".");
    const match = raw.match(/-?\d*\.?\d+/);
    if (!match) return;
    const v = parseFloat(match[0]);
    if (!Number.isFinite(v)) return;
    setKg(clampPoidsKg(v));
  }, []);

  const onBlur = useCallback(() => {
    // Réaligne l'affichage sur la valeur réellement utilisée : 9999 → "5",
    // 0 → "0,1", 2,567 → "2,6". Affiché == facturé garanti.
    setText(formatChamp(kg));
  }, [kg]);

  const decrement = useCallback(() => {
    setKg((v) => {
      const next = clampPoidsKg(v - POIDS_STEP_KG);
      setText(formatChamp(next));
      return next;
    });
  }, []);

  const increment = useCallback(() => {
    setKg((v) => {
      const next = clampPoidsKg(v + POIDS_STEP_KG);
      setText(formatChamp(next));
      return next;
    });
  }, []);

  return {
    kg,
    text,
    onChange,
    onBlur,
    decrement,
    increment,
    atMin: kg <= POIDS_MIN_KG,
    atMax: kg >= POIDS_MAX_KG,
  };
}
