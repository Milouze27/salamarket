import { useCartStore } from "@/stores/cartStore";
import { computeCartTotalsCents } from "@/lib/drive-pesee";

// Selectors avec primitive equality — évite les re-renders inutiles que
// `useCartStore((s) => s.getCount())` causerait (la fonction renvoie une
// nouvelle référence à chaque appel, ce qui force un re-render même si
// le nombre n'a pas changé).
//
// Centralise la logique de reduce qui était dupliquée dans 4 composants
// (Header, AppHeader, BottomNav, StickyCartCTA).

export const useCartCount = (): number =>
  useCartStore((s) => s.items.reduce((n, i) => n + i.quantity, 0));

// FIX 2026-05-16 : avant ce fix, le total ignorait les lignes weight
// (priceCents=0 en DB) et renvoyait seulement la somme des lignes unit
// et weight_bracket. Délègue désormais à `computeCartTotalsCents` qui
// applique computePrixEstime ligne par ligne (kg × €/kg pour weight,
// forfait pour bracket, etc.). Source unique de vérité dans drive-pesee.ts.
export const useCartTotalCents = (): number =>
  useCartStore((s) => computeCartTotalsCents(s.items).totalCents);
