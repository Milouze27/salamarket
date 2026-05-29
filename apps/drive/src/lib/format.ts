import type { ProductUnit } from "@/types/product";

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
