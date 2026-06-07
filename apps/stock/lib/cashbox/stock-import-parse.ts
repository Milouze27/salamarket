/* lib/cashbox/stock-import-parse.ts — Parse le CSV d'import du CATALOGUE produits
 * (initialisation du stock pour l'onboarding client). Colonnes attendues :
 * EAN, nom, marque (opt), catégorie (opt), prix de vente, quantité (opt).
 * Réutilise les helpers CSV de cashmag-parse (DRY) : séparateur, split, nombres. */
import {
  detectSeparator,
  splitCsvLine,
  parseNumberFr,
  normalize,
} from "./cashmag-parse";

export interface StockImportRow {
  ean: string;
  nom: string;
  marque: string | null;
  categorie: string;
  prix_vente: number;
  quantite: number;
}

export interface StockImportParseResult {
  rows: StockImportRow[];
  errors: { line: number; raw: string; reason: string }[];
  meta: {
    separator: string;
    headers: string[];
    columnIndex: Record<string, number>;
    total: number;
  };
}

const KEYWORDS: Record<string, string[]> = {
  ean: ["ean", "codebarre", "code barre", "gencod", "barcode", "code"],
  nom: ["nom", "designation", "libelle", "produit", "article"],
  marque: ["marque", "brand"],
  categorie: ["categorie", "rayon", "famille", "category"],
  prix: ["prixvente", "pv", "prix", "price", "ttc", "tarif"],
  quantite: ["quantite", "qte", "stock", "qty"],
};

function detectColumns(headers: string[]): Record<string, number> {
  const idx: Record<string, number> = {};
  const norm = headers.map((h) => normalize(h));
  for (const [key, kws] of Object.entries(KEYWORDS)) {
    for (let i = 0; i < norm.length; i++) {
      if (kws.some((k) => norm[i].includes(normalize(k)))) {
        if (idx[key] === undefined) idx[key] = i;
      }
    }
  }
  return idx;
}

/** Catégories canoniques (cf lib/types). On mappe au plus proche, défaut Épicerie. */
const CATEGORIES_VALIDES = [
  "Épicerie",
  "Boucherie",
  "Charcuterie",
  "Boissons",
  "Surgelés",
  "Frais",
  "Produits du Maghreb",
  "Hygiène",
];
function normCategorie(s: string | undefined): string {
  if (!s) return "Épicerie";
  const n = normalize(s);
  const match = CATEGORIES_VALIDES.find(
    (c) =>
      normalize(c) === n ||
      normalize(c).includes(n) ||
      n.includes(normalize(c)),
  );
  return match ?? "Épicerie";
}

export function parseStockCsv(raw: string): StockImportParseResult {
  const errors: StockImportParseResult["errors"] = [];
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return {
      rows: [],
      errors: [{ line: 0, raw: "", reason: "Fichier vide ou sans en-tête" }],
      meta: { separator: ";", headers: [], columnIndex: {}, total: 0 },
    };
  }
  const separator = detectSeparator(lines[0]);
  const headers = splitCsvLine(lines[0], separator);
  const columnIndex = detectColumns(headers);
  const required = ["ean", "nom", "prix"];
  const missing = required.filter((k) => columnIndex[k] === undefined);
  if (missing.length) {
    return {
      rows: [],
      errors: [
        {
          line: 1,
          raw: lines[0],
          reason: `Colonnes manquantes : ${missing.join(", ")} (attendu au moins EAN, nom, prix de vente)`,
        },
      ],
      meta: { separator, headers, columnIndex, total: 0 },
    };
  }

  const rows: StockImportRow[] = [];
  const seenEan = new Set<string>();
  for (let i = 1; i < lines.length; i++) {
    const rawL = lines[i];
    try {
      const cells = splitCsvLine(rawL, separator);
      const get = (k: string) =>
        columnIndex[k] !== undefined ? cells[columnIndex[k]] : undefined;
      const ean = (get("ean") ?? "").trim();
      const nom = (get("nom") ?? "").trim();
      const prix = parseNumberFr(get("prix"));
      if (!ean) {
        errors.push({ line: i + 1, raw: rawL, reason: "EAN manquant" });
        continue;
      }
      if (!/^\d{6,14}$/.test(ean)) {
        errors.push({
          line: i + 1,
          raw: rawL,
          reason: `EAN invalide (${ean})`,
        });
        continue;
      }
      if (!nom) {
        errors.push({ line: i + 1, raw: rawL, reason: "Nom manquant" });
        continue;
      }
      if (prix === null || prix < 0) {
        errors.push({
          line: i + 1,
          raw: rawL,
          reason: "Prix de vente invalide",
        });
        continue;
      }
      if (seenEan.has(ean)) {
        errors.push({
          line: i + 1,
          raw: rawL,
          reason: `EAN en double dans le fichier (${ean})`,
        });
        continue;
      }
      seenEan.add(ean);
      const q = parseNumberFr(get("quantite"));
      rows.push({
        ean,
        nom,
        marque: (get("marque") ?? "").trim() || null,
        categorie: normCategorie(get("categorie")),
        prix_vente: Math.round(prix * 100) / 100,
        quantite: q !== null && q > 0 ? Math.floor(q) : 0,
      });
    } catch {
      errors.push({ line: i + 1, raw: rawL, reason: "Ligne illisible" });
    }
  }
  return {
    rows,
    errors,
    meta: { separator, headers, columnIndex, total: lines.length - 1 },
  };
}
