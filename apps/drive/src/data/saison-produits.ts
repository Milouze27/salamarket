// ─────────────────────────────────────────────────────────────────
// Saisonnalité — mapping mois → mots-clés produits + angle météo-gourmand.
//
// Donnée statique pure (aucun appel réseau, aucune table). Sert deux
// composants vitrine :
//   - SelectionSaison : carrousel « De saison en {mois} » filtré sur
//     les mots-clés saisonniers du mois courant.
//   - SuggestionMeteo : encart éditorial saisonnier (soupes l'hiver,
//     salades l'été) avec quelques produits matchés.
//
// Les mots-clés sont matchés (sans accent / casse) sur le nom + la
// description des produits du catalogue. Tout est gracieux : si aucun
// produit ne matche, les composants rendent `null`.
// ─────────────────────────────────────────────────────────────────

import type { Product } from "@/types/product";
import { normalizeSearch } from "@/lib/search";

// 4 saisons calendaires (hémisphère nord). Sert l'angle météo-gourmand.
export type Saison = "hiver" | "printemps" | "ete" | "automne";

// Mois 0-indexés (Date.getMonth()) → saison.
const MOIS_SAISON: readonly Saison[] = [
  "hiver", // janvier
  "hiver", // février
  "printemps", // mars
  "printemps", // avril
  "printemps", // mai
  "ete", // juin
  "ete", // juillet
  "ete", // août
  "automne", // septembre
  "automne", // octobre
  "automne", // novembre
  "hiver", // décembre
];

export const saisonForMonth = (monthIndex: number): Saison =>
  MOIS_SAISON[((monthIndex % 12) + 12) % 12];

// Nom du mois en toutes lettres, pour le titre « De saison en juin ».
const MOIS_LABELS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

export const moisLabel = (monthIndex: number): string =>
  MOIS_LABELS[((monthIndex % 12) + 12) % 12];

// Produits/ingrédients typiques par mois (0-indexé). Mots-clés génériques
// d'un primeur de quartier — matchés sur nom + description. Volontairement
// larges (« tomate » attrape « tomate grappe », « tomates cerises »…).
const MOIS_MOTS_CLES: readonly string[][] = [
  // janvier
  ["orange", "clémentine", "mandarine", "poireau", "endive", "chou", "potiron", "carotte", "pomme"],
  // février
  ["orange", "kiwi", "poireau", "endive", "chou", "carotte", "betterave", "pomme", "mâche"],
  // mars
  ["épinard", "radis", "poireau", "carotte", "pomme", "kiwi", "chou", "navet"],
  // avril
  ["asperge", "radis", "épinard", "fraise", "artichaut", "petit pois", "salade"],
  // mai
  ["fraise", "asperge", "radis", "cerise", "rhubarbe", "petit pois", "salade", "courgette"],
  // juin
  ["fraise", "cerise", "abricot", "tomate", "courgette", "melon", "concombre", "salade", "pêche"],
  // juillet
  ["tomate", "abricot", "pêche", "melon", "courgette", "aubergine", "poivron", "concombre", "nectarine", "framboise"],
  // août
  ["tomate", "pêche", "melon", "prune", "figue", "aubergine", "poivron", "courgette", "raisin", "mirabelle"],
  // septembre
  ["raisin", "figue", "prune", "pomme", "poire", "tomate", "courge", "champignon", "noisette"],
  // octobre
  ["pomme", "poire", "raisin", "potiron", "courge", "champignon", "châtaigne", "noix", "chou"],
  // novembre
  ["pomme", "poire", "clémentine", "potiron", "courge", "poireau", "endive", "chou", "noix"],
  // décembre
  ["clémentine", "orange", "mandarine", "poireau", "endive", "chou", "potiron", "marron", "pomme"],
];

export const motsClesForMonth = (monthIndex: number): string[] =>
  MOIS_MOTS_CLES[((monthIndex % 12) + 12) % 12];

// Angle météo-gourmand par saison : titre éditorial + accroche + mots-clés
// de plats/ingrédients à matcher pour les vignettes. Distinct des mots-clés
// « de saison » (ici on cible une intention de cuisine, pas le primeur).
export interface AngleMeteo {
  titre: string;
  accroche: string;
  motsCles: string[];
}

// Matche un catalogue contre une liste de mots-clés (nom + description,
// normalisés sans accent/casse via normalizeSearch). Renvoie les produits
// en stock dont le nom OU la description contient l'un des mots-clés,
// dédupliqués, dans l'ordre du catalogue. Logique pure réutilisée par
// SelectionSaison et SuggestionMeteo. `limit` borne le résultat (0 = tout).
export const matchProductsByKeywords = (
  products: Product[],
  keywords: string[],
  limit = 0,
): Product[] => {
  const needles = keywords.map((k) => normalizeSearch(k)).filter(Boolean);
  if (needles.length === 0) return [];
  const out: Product[] = [];
  for (const p of products) {
    if (!p.inStock) continue;
    const haystack = normalizeSearch(`${p.name} ${p.description ?? ""}`);
    if (needles.some((n) => haystack.includes(n))) {
      out.push(p);
      if (limit > 0 && out.length >= limit) break;
    }
  }
  return out;
};

export const ANGLE_METEO: Record<Saison, AngleMeteo> = {
  hiver: {
    titre: "Soupes & plats mijotés",
    accroche:
      "Le temps se rafraîchit. On ressort la cocotte : bouillons, ragoûts et légumes qui réchauffent.",
    motsCles: ["soupe", "poireau", "potiron", "courge", "pomme de terre", "carotte", "lentille", "bœuf", "oignon", "champignon"],
  },
  printemps: {
    titre: "Premières récoltes",
    accroche:
      "Les beaux jours reviennent. Place aux légumes tendres et aux premiers fruits du verger.",
    motsCles: ["asperge", "radis", "épinard", "fraise", "petit pois", "salade", "poulet", "courgette"],
  },
  ete: {
    titre: "Salades & grillades",
    accroche:
      "Il fait chaud. On allume le barbecue, on dresse des salades fraîches et colorées.",
    motsCles: ["tomate", "courgette", "aubergine", "poivron", "salade", "concombre", "melon", "merguez", "brochette", "pêche"],
  },
  automne: {
    titre: "Retour des saveurs chaudes",
    accroche:
      "Les soirées rallongent. Courges, champignons et fruits du verger reviennent en cuisine.",
    motsCles: ["courge", "potiron", "champignon", "pomme", "poire", "raisin", "châtaigne", "poireau", "noix"],
  },
};
