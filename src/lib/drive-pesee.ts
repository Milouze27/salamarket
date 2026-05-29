// ────────────────────────────────────────────────────────────────────
// drive-pesee.ts — Helpers de calcul de prix pour le Drive au poids.
//
// Trois modes (cf. types/product.ts) :
//   - 'unit'           : prix fixe en centimes (priceCents)
//   - 'weight'         : prix au kilo (pricePerKg en EUR), quantité = kg
//   - 'weight_bracket' : 1 à N brackets (poids_min..poids_max → prix forfait)
//
// On manipule des EUR partout dans ce module (pas de cents), car
// price_per_kg en DB est numeric (€/kg). Conversion vers cents au
// moment du calcul global panier/checkout.
// ────────────────────────────────────────────────────────────────────

import type { Product, ProductUnitType } from "@/types/product";

export interface Bracket {
  min: number;
  max: number;
  /** Prix forfaitaire du bracket, en EUR. */
  prix: number;
  /** Label humain ("1 - 1,5 kg"). */
  label: string;
}

/** Format poids "1,2 kg" / "0,5 kg" — fr-FR, max 2 décimales. */
export const formatKg = (kg: number): string =>
  `${new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(kg)} kg`;

const EUR = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatEur = (value: number): string => EUR.format(value);

/**
 * Calcule le prix estimé d'une ligne panier en EUR, selon le unit_type.
 *
 * @param product   produit
 * @param quantite  pour 'unit' = nb d'unités ; pour 'weight' = kg ;
 *                  pour 'weight_bracket' = nb d'unités du bracket
 *                  (en général 1, choisi via bracketIndex)
 * @param bracketIndex (optionnel) index du bracket choisi pour
 *                  'weight_bracket'. Défaut 0.
 */
export function computePrixEstime(
  product: Product,
  quantite: number,
  bracketIndex = 0,
): number {
  const unitType = product.unitType ?? "unit";

  if (unitType === "weight") {
    const pricePerKg = product.pricePerKg ?? 0;
    return pricePerKg * Math.max(0, quantite);
  }

  if (unitType === "weight_bracket") {
    const brackets = getBrackets(product);
    if (brackets.length === 0) return 0;
    const bracket = brackets[bracketIndex] ?? brackets[0];
    return bracket.prix * Math.max(0, quantite);
  }

  // unit
  return (product.priceCents / 100) * Math.max(0, quantite);
}

/**
 * Renvoie les brackets disponibles pour un produit weight_bracket.
 * Implémentation simple V1 : 1 seul bracket (poids_min..poids_max,
 * prix = price_cents). On laisse la signature `Array<Bracket>` pour
 * permettre une évolution multi-brackets sans casser les call-sites.
 *
 * Pour les produits 'unit' / 'weight', renvoie [].
 */
export function getBrackets(product: Product): Bracket[] {
  if ((product.unitType ?? "unit") !== "weight_bracket") return [];

  const min = product.poidsMinKg ?? null;
  const max = product.poidsMaxKg ?? null;
  if (min == null || max == null) return [];

  return [
    {
      min,
      max,
      prix: product.priceCents / 100,
      label: `${formatKg(min)} - ${formatKg(max)}`,
    },
  ];
}

/**
 * Affichage prix + unité prêt-à-poser pour ProductCard / ProductDetail.
 *
 * Exemples :
 *   - unit          → "5,90 €"
 *   - weight        → "12,00 €/kg"
 *   - weight_bracket→ "à partir de 15,00 € · 1 - 1,5 kg"
 */
export function formatPriceWithUnit(product: Product): string {
  const unitType = product.unitType ?? "unit";

  if (unitType === "weight" && product.pricePerKg != null) {
    return `${formatEur(product.pricePerKg)}/kg`;
  }

  if (unitType === "weight_bracket") {
    const brackets = getBrackets(product);
    if (brackets.length > 0) {
      const first = brackets[0];
      return `à partir de ${formatEur(first.prix)} · ${first.label}`;
    }
  }

  return formatEur(product.priceCents / 100);
}

/**
 * Petite phrase indicative ("Pesé en magasin · facturé au poids réel")
 * affichée sous le prix sur les vignettes weight/weight_bracket.
 */
export function unitHint(product: Product): string | null {
  const unitType = product.unitType ?? "unit";
  if (unitType === "weight") {
    return "Pesé en magasin · facturé au poids réel";
  }
  if (unitType === "weight_bracket") {
    return "Vente au poids · taille au choix";
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────
// Totaux panier — source unique de vérité pour TOUT le calcul Drive
// au poids. À utiliser dans :
//   - useCartSummary.ts (hook frontend)
//   - cartStore.getTotalCents (state Zustand)
//   - Checkout.tsx (affichage Total estimé + Pré-autoriser)
//   - Edge Function create-checkout-session (calcul serveur ; le helper
//     est ré-implémenté en Deno car runtime différent, MAIS la formule
//     est strictement identique — voir tests).
//
// Règle métier (validée 2026-05-16) :
//   - Marge 20 % appliquée UNIQUEMENT aux lignes unit_type='weight'
//     (le poids variable peut dépasser l'estimation → on couvre)
//   - Lignes 'weight_bracket' : prix forfaitaire, JAMAIS de marge
//   - Lignes 'unit' : prix fixe, JAMAIS de marge
//   - Si aucune ligne weight → autorise = total (pas de pré-auto)
// ────────────────────────────────────────────────────────────────────

export interface CartLineLike {
  product: Product;
  quantity: number;
  unitType: ProductUnitType;
  quantiteKg?: number;
  bracketIndex?: number;
}

export interface CartTotalsCents {
  /** Total estimé en centimes (somme de toutes les lignes). */
  totalCents: number;
  /** Sous-total des lignes unit_type='weight' uniquement, en centimes. */
  weightCents: number;
  /** Sous-total des lignes non-weight (unit + bracket), en centimes. */
  otherCents: number;
  /** Montant à pré-autoriser à Stripe : weightCents × 1.20 (ceil au
   *  centime sup) + otherCents. Si pas de ligne weight, == totalCents. */
  autoriseCents: number;
  /** Y a-t-il au moins une ligne weight ? Si oui → flow manual capture. */
  hasWeightLine: boolean;
}

/**
 * Calcule le total estimé ET le montant pré-autorisé pour un panier.
 * SOURCE UNIQUE DE VÉRITÉ — toute autre fonction calculant ces deux
 * valeurs doit utiliser celle-ci pour éviter les divergences (cf. bug
 * 2026-05-16 où le total agrégé ignorait les lignes weight parce que
 * priceCents=0 en DB).
 */
export function computeCartTotalsCents(
  items: readonly CartLineLike[],
): CartTotalsCents {
  let weightCents = 0;
  let otherCents = 0;
  let hasWeightLine = false;

  for (const item of items) {
    const unitType = item.unitType ?? item.product.unitType ?? "unit";

    // Quantité à passer à computePrixEstime selon le type.
    const qtyArg =
      unitType === "weight"
        ? (item.quantiteKg ?? 0) * item.quantity
        : item.quantity;
    const eur = computePrixEstime(item.product, qtyArg, item.bracketIndex ?? 0);
    const cents = Math.round(eur * 100);

    if (unitType === "weight") {
      weightCents += cents;
      hasWeightLine = true;
    } else {
      otherCents += cents;
    }
  }

  // Marge 20 % UNIQUEMENT sur weight, ceil au centime sup pour ne jamais
  // sous-couvrir. Les lignes non-weight passent telles quelles.
  const autoriseCents = Math.ceil(weightCents * 1.2) + otherCents;

  return {
    totalCents: weightCents + otherCents,
    weightCents,
    otherCents,
    autoriseCents,
    hasWeightLine,
  };
}
