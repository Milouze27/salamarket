import type { Product, ProductUnit } from "@/types/product";

export const formatPrice = (cents: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);

export const unitLabel = (unit: ProductUnit) => {
  switch (unit) {
    case "kg":
      return "au kg";
    case "piece":
      return "à la pièce";
    case "pack":
      return "le pack";
  }
};

// ─────────────────────────────────────────────────────────────────────
// Libellé d'unité dérivé du unitType (source de vérité), PAS de la colonne
// `unit`. Évite l'incohérence COH-12 / B1-10 : un produit unit_type='unit'
// avec unit='kg' (prix forfaitaire à la pièce) ne doit JAMAIS afficher
// "au kg" — il est vendu à la pièce/au pack, pas au poids. Seuls les vrais
// produits au poids (unitType 'weight') portent "/kg". Le bracket est un
// prix forfait à taille choisie, pas une vente au poids réel.
// ─────────────────────────────────────────────────────────────────────
export const productUnitLabel = (product: Product): string => {
  const unitType = product.unitType ?? "unit";
  switch (unitType) {
    case "weight":
      // Vrai produit au poids : prix au kilo, facturé au poids réel pesé.
      return "au kg";
    case "weight_bracket":
      // Prix forfait, le client choisit une taille (pas une vente au poids).
      return "prix forfait · taille au choix";
    case "unit":
    default:
      // Prix fixe : on s'appuie sur la sémantique de `unit`, mais on ne
      // laisse jamais "au kg" remonter pour un unitaire (unit='kg' = data
      // incohérente côté DB) → fallback "à la pièce".
      return product.unit === "kg" ? "à la pièce" : unitLabel(product.unit);
  }
};

// ─────────────────────────────────────────────────────────────────────
// Phrase indicative sous le prix (PDP / vignettes). Corrige B1-09 :
// les produits weight_bracket sont des FORFAITS à prix fixe (le client
// choisit une taille), pas une vente au poids réel — afficher
// "Prix forfait · taille au choix" plutôt que "Vente au poids". Les vrais
// produits au poids ('weight') gardent "Pesé en magasin · facturé au
// poids réel" (le poids réel pesé fait foi).
// ─────────────────────────────────────────────────────────────────────
export const productUnitHint = (product: Product): string | null => {
  const unitType = product.unitType ?? "unit";
  if (unitType === "weight") {
    return "Pesé en magasin · facturé au poids réel";
  }
  if (unitType === "weight_bracket") {
    return "Prix forfait · taille au choix";
  }
  return null;
};

// ─────────────────────────────────────────────────────────────────────
// Formatters monétaires/numériques étendus utilisés par les modules
// Labo (Recettes/Productions) et Pro (B2B). Tolèrent null/undefined
// pour les colonnes DB nullables.
// ─────────────────────────────────────────────────────────────────────

const EUR = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PERCENT = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const DATE_FR = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const DATETIME_FR = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const QTY = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 3,
});

/** Euros (déjà en €, pas en cents). Renvoie "" si null/undefined. */
export const formatEur = (value: number | null | undefined): string =>
  value == null ? "" : EUR.format(value);

/**
 * Pourcentage tel quel (ex: 15.5 → "15,5 %"). Le rate est en pourcent,
 * PAS en ratio 0-1. C'est le format DB partout (tva_taux=5.5).
 */
export const formatPercent = (value: number | null | undefined): string =>
  value == null ? "" : PERCENT.format(value / 100);

export const formatDate = (value: string | Date | null | undefined): string => {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return DATE_FR.format(d);
};

export const formatDateTime = (
  value: string | Date | null | undefined,
): string => {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return DATETIME_FR.format(d);
};

export const formatQty = (value: number | null | undefined): string =>
  value == null ? "" : QTY.format(value);
