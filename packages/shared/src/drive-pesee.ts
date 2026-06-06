// ────────────────────────────────────────────────────────────────────
// drive-pesee.ts — Helpers de calcul de prix pour le Drive au poids.
//
// SOURCE UNIQUE DE VÉRITÉ partagée entre `apps/drive` (UI client) et
// `apps/stock` (UI staff + API routes Stripe). Fusion des deux copies
// historiquement dupliquées :
//   - apps/drive/src/lib/drive-pesee.ts  (version "frontend", complète)
//   - apps/stock/lib/drive-pesee.ts      (version "backend", helpers
//     `computeMontantAutorise` / `computeEcartPct` /
//     `determineEcartAction` utilisés par les API Stripe + workflow
//     préparateur)
// Aucune divergence sémantique à arbitrer : les deux fichiers traitaient
// des problèmes disjoints (Drive = panier client, Stock = capture +
// écart pesée). Voir note "Coexistence" plus bas pour le calcul du
// montant pré-autorisé qui existe sous deux formes (cents agrégés vs
// EUR ligne).
//
// Trois modes (cf. ProductUnitType) :
//   - 'unit'           : prix fixe en centimes (priceCents)
//   - 'weight'         : prix au kilo (pricePerKg en EUR), quantité = kg
//   - 'weight_bracket' : 1 à N brackets (poids_min..poids_max → prix forfait)
//
// On manipule des EUR partout dans ce module (pas de cents), car
// price_per_kg en DB est numeric (€/kg). Conversion vers cents au
// moment du calcul global panier/checkout.
// ────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────
// Types — inlinés ici pour que le package shared n'ait aucune
// dépendance vers le code d'apps/. Les deux apps réimportent ces
// types depuis `@salamarket/shared` au besoin.
// ────────────────────────────────────────────────────────────────────

export type ProductUnit = "kg" | "piece" | "pack";

// unit_type — modèle pour le Drive au poids variable.
//   - 'unit'           : prix fixe à l'unité (comportement historique)
//   - 'weight'         : prix au kilo, le client saisit un poids estimé
//   - 'weight_bracket' : prix au choix d'un bracket (poids_min..poids_max)
export type ProductUnitType = "unit" | "weight" | "weight_bracket";

export interface Product {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  unit: ProductUnit;
  category: string;
  imageUrl: string;
  inStock: boolean;

  // Drive au poids — champs optionnels, absents sur les anciens produits.
  // unitType est défaulté à 'unit' côté hook si la colonne est null/absente.
  unitType?: ProductUnitType;
  pricePerKg?: number | null;
  estimatedWeightKg?: number | null;
  poidsMinKg?: number | null;
  poidsMaxKg?: number | null;
}

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
  /**
   * Prix unitaire REMISÉ DLC en centimes, capturé au moment de l'ajout au
   * panier (anti-gaspi). Présent uniquement pour les lignes 'unit' affichées
   * avec une remise DLC. S'il est défini, il remplace product.priceCents dans
   * le calcul du total — sinon le client paierait le plein tarif malgré la
   * remise affichée.
   */
  dlcUnitPriceCents?: number;
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
    // Remise DLC (lignes 'unit' uniquement) : le prix remisé capturé à l'ajout
    // remplace le prix plein, sinon le client paie le plein tarif malgré la
    // remise affichée (bug revenue/confiance).
    const cents =
      unitType === "unit" && item.dlcUnitPriceCents != null
        ? Math.round(item.dlcUnitPriceCents) * item.quantity
        : Math.round(
            computePrixEstime(item.product, qtyArg, item.bracketIndex ?? 0) *
              100,
          );

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

// ────────────────────────────────────────────────────────────────────
// Helpers manual-capture / écart pesée — utilisés côté Stock (API
// Stripe + workflow préparateur).
//
// Coexistence avec `computeCartTotalsCents.autoriseCents` :
//   - `computeMontantAutorise(estimeTtc)` opère sur UN TOTAL EUR déjà
//     calculé (use-case API Stripe `create-payment-intent` qui reçoit
//     `estime_ttc` depuis le payload du Drive et doit produire un
//     montant en EUR à passer à Stripe).
//   - `computeCartTotalsCents` opère sur la liste des LIGNES en
//     centimes (use-case panier client / aggregator).
//   La formule sous-jacente est identique : `ceil(estime * 1.20)`.
//   On garde les deux APIs car les call-sites consomment des inputs
//   structurellement différents.
// ────────────────────────────────────────────────────────────────────

/** Pré-autorisation = estimé × 1.20, arrondi au centime supérieur. */
export function computeMontantAutorise(estimeTtc: number): number {
  return Math.ceil(estimeTtc * 1.2 * 100) / 100;
}

/** Écart en % entre estimé et réel. Renvoie 0 si pas encore pesé. */
export function computeEcartPct(estime: number, reel: number | null): number {
  if (reel == null || estime === 0) return 0;
  return ((reel - estime) / estime) * 100;
}

/**
 * Détermine l'action sur écart :
 * - < 10 % : auto_accept
 * - 10-20 % en valeur absolue ET < 5 € : preparator_decision
 * - 10-20 % en valeur absolue ET >= 5 € : client_notify
 * - > 20 % : client_validation_required
 */
export type EcartAction =
  | "auto_accept"
  | "preparator_decision"
  | "client_notify"
  | "client_validation_required";

export function determineEcartAction(
  ecartPct: number,
  ecartEur: number,
): EcartAction {
  const abs = Math.abs(ecartPct);
  if (abs < 10) return "auto_accept";
  if (abs > 20) return "client_validation_required";
  // entre 10 et 20 inclus
  return Math.abs(ecartEur) >= 5 ? "client_notify" : "preparator_decision";
}
