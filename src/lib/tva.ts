// Conversion HT ↔ TTC. Toutes les fonctions acceptent un taux en pourcent
// (ex: 5.5 pour 5,5 %), aligné avec products.tva_taux et la convention
// française.
//
// Les arrondis sont volontairement à 2 décimales (au centime) pour
// correspondre à la présentation comptable. Pour l'agrégation totale,
// on somme les arrondis ligne par ligne (méthode "arrondi commercial"),
// pas une somme brute puis arrondi global — c'est ce que fait la
// majorité des logiciels de facturation FR.

/**
 * Arrondit à 2 décimales. Math.round est suffisant ici (pas de bankers
 * rounding requis pour la TVA en France).
 */
export const round2 = (value: number): number =>
  Math.round(value * 100) / 100;

/** Convertit un prix HT en TTC. taux en %. */
export const ttcFromHt = (ht: number, taux: number): number =>
  round2(ht * (1 + taux / 100));

/** Convertit un prix TTC en HT. taux en %. */
export const htFromTtc = (ttc: number, taux: number): number =>
  round2(ttc / (1 + taux / 100));

/** Montant de TVA correspondant à un HT donné. */
export const tvaAmountFromHt = (ht: number, taux: number): number =>
  round2(ht * (taux / 100));

/** Montant de TVA contenu dans un TTC donné. */
export const tvaAmountFromTtc = (ttc: number, taux: number): number =>
  round2(ttc - htFromTtc(ttc, taux));

/**
 * Calcule le total d'un panier multi-tva. Renvoie HT, TVA total, TTC.
 * Méthode : on arrondit ligne par ligne au centime puis on somme.
 * `prix_ht` est déjà le HT total de la ligne (qty × prix unitaire HT).
 */
export interface CartLine {
  prix_ht: number;
  tva_taux: number;
}

export interface CartTotal {
  ht: number;
  tva: number;
  ttc: number;
}

export const computeCartTotal = (lines: readonly CartLine[]): CartTotal => {
  let ht = 0;
  let tva = 0;
  for (const line of lines) {
    const ligneHt = round2(line.prix_ht);
    const ligneTva = tvaAmountFromHt(ligneHt, line.tva_taux);
    ht += ligneHt;
    tva += ligneTva;
  }
  ht = round2(ht);
  tva = round2(tva);
  return { ht, tva, ttc: round2(ht + tva) };
};

/**
 * Applique le palier de remise volume au tarif Pro. Les paliers sont
 * cumulatifs descendants : si qty ≥ palier_2, palier_2 ; sinon si
 * qty ≥ palier_1, palier_1 ; sinon 0.
 */
export interface VolumePaliers {
  qty_palier_1: number | null;
  remise_palier_1_pct: number | null;
  qty_palier_2: number | null;
  remise_palier_2_pct: number | null;
}

export const computeRemisePct = (
  quantite: number,
  paliers: VolumePaliers,
): number => {
  if (
    paliers.qty_palier_2 != null &&
    paliers.remise_palier_2_pct != null &&
    quantite >= paliers.qty_palier_2
  ) {
    return paliers.remise_palier_2_pct;
  }
  if (
    paliers.qty_palier_1 != null &&
    paliers.remise_palier_1_pct != null &&
    quantite >= paliers.qty_palier_1
  ) {
    return paliers.remise_palier_1_pct;
  }
  return 0;
};

/** Prix HT unitaire après application du palier volume. */
export const prixHtApresRemise = (
  prixHt: number,
  quantite: number,
  paliers: VolumePaliers,
): number => {
  const remisePct = computeRemisePct(quantite, paliers);
  return round2(prixHt * (1 - remisePct / 100));
};
