/**
 * Mapping TVA française par catégorie produit Stock.
 *
 * 5.5% — Produits alimentaires de première nécessité (boucherie,
 *        charcuterie, frais, surgelés, épicerie, fruits & légumes,
 *        produits du Maghreb)
 * 10%  — Traiteur (vente à consommer, restauration), boissons sans
 *        alcool consommables, certaines préparations
 * 20%  — Hygiène, bazar, alcool, tout produit non alimentaire
 *
 * Cf. https://www.economie.gouv.fr/cedef/taux-tva-france
 *
 * Fallback : 5.5% si catégorie inconnue (par défaut alimentaire).
 */
export type TvaRate = 5.5 | 10 | 20;

const RATE_BY_CATEGORY: Record<string, TvaRate> = {
  Traiteur: 10,
  Boissons: 10,
  Hygiène: 20,
  "Hygiene": 20,
  Bazar: 20,
};

/** Catégories explicitement alimentaires → 5.5% */
const FOOD_5_5: ReadonlySet<string> = new Set([
  "Boucherie",
  "Charcuterie",
  "Frais",
  "Surgelés",
  "Surgele",
  "Épicerie",
  "Epicerie",
  "Produits du Maghreb",
  "Maghreb",
  "Fruits & Légumes",
  "Fruits & Legumes",
  "Fruits et légumes",
]);

export function tvaRateForCategory(categorie: string | null | undefined): TvaRate {
  if (!categorie) return 5.5;
  if (FOOD_5_5.has(categorie)) return 5.5;
  if (RATE_BY_CATEGORY[categorie]) return RATE_BY_CATEGORY[categorie];
  // Fallback sécurisé : alimentaire 5.5
  return 5.5;
}

/** Décompose un prix TTC en HT + TVA selon le taux */
export function decomposeTTC(ttc: number, rate: TvaRate): { ht: number; tva: number } {
  const ht = ttc / (1 + rate / 100);
  const tva = ttc - ht;
  return { ht, tva };
}

export type TvaBuckets = Record<string, { base_ht: number; tva: number; ttc: number }>;

/**
 * Réconciliation fiscale : ventile un résidu TTC dans une ventilation TVA
 * pré-décomposée, pour que le document balance (CA HT + TVA = CA TTC).
 *
 * Pourquoi : le CA TTC d'un récap est la somme des `total_ttc` facturés au
 * niveau commande, alors que la ventilation TVA est décomposée à partir des
 * lignes (prix_unitaire × quantité). Quand la somme des lignes ne reconstitue
 * pas le total facturé (frais de pesée, ajustement de poids, frais de retrait,
 * ligne manquante…), HT + TVA ≠ TTC et le Z devient inexploitable par un
 * comptable. On répartit donc le résidu `caTtc − Σ lignes_ttc` au prorata des
 * bases TTC déjà présentes (fallback 20% — droit commun — si aucune ligne).
 *
 * Muté en place. Idempotence non requise (appelé une fois par calcul).
 *
 * @param buckets ventilation par taux (modifiée en place)
 * @param residuTtc caTtc − Σ buckets.ttc, déjà arrondi au centime
 */
export function ventilerResiduTtc(buckets: TvaBuckets, residuTtc: number): void {
  if (Math.abs(residuTtc) < 0.01) return;

  const totalBaseTtc = Object.values(buckets).reduce((s, v) => s + v.ttc, 0);

  if (totalBaseTtc <= 0) {
    // Aucune ligne décomposable : le résidu = tout le CA. On l'impute au taux
    // de droit commun 20% pour rester équilibré et visible.
    const rate: TvaRate = 20;
    const { tva } = decomposeTTC(residuTtc, rate);
    const ttcR = Math.round(residuTtc * 100) / 100;
    const tvaR = Math.round(tva * 100) / 100;
    buckets["20.0"] = {
      ttc: ttcR,
      tva: tvaR,
      base_ht: Math.round((ttcR - tvaR) * 100) / 100,
    };
    return;
  }

  // Prorata sur les taux existants ; le reliquat d'arrondi va au taux à plus
  // forte base.
  const keys = Object.keys(buckets);
  let distribue = 0;
  const parts = keys.map((key) => {
    const part =
      Math.round((residuTtc * buckets[key].ttc) / totalBaseTtc * 100) / 100;
    distribue += part;
    return { key, part };
  });
  const reliquat = Math.round((residuTtc - distribue) * 100) / 100;
  if (Math.abs(reliquat) >= 0.01) {
    const biggest = parts.reduce((a, b) =>
      buckets[b.key].ttc > buckets[a.key].ttc ? b : a,
    );
    biggest.part = Math.round((biggest.part + reliquat) * 100) / 100;
  }
  for (const { key, part } of parts) {
    if (Math.abs(part) < 0.01) continue;
    const rate = parseFloat(key) as TvaRate;
    const { tva } = decomposeTTC(part, rate);
    const ttcR = Math.round(part * 100) / 100;
    const tvaR = Math.round(tva * 100) / 100;
    buckets[key].ttc += ttcR;
    buckets[key].tva += tvaR;
    buckets[key].base_ht += Math.round((ttcR - tvaR) * 100) / 100;
  }
}

/** Estime les frais Stripe : 1.4% + 0.25 € par transaction CB EU
 *  https://stripe.com/fr/pricing */
export function estimateStripeFee(ttcEuro: number): number {
  return ttcEuro * 0.014 + 0.25;
}

/**
 * Format français d'un taux de TVA (ADM-06).
 * Entrée numérique ou chaîne (clé de bucket "5.5"/"10.0"/"20.0") → libellé FR
 * avec virgule décimale et espace insécable avant le %.
 * Ex. 5.5 → "5,5 %", 10 → "10 %", "20.0" → "20 %".
 */
export function formatTvaRateFr(rate: number | string): string {
  const n = typeof rate === "string" ? parseFloat(rate) : rate;
  if (Number.isNaN(n)) return String(rate);
  // Pas de décimale superflue (10,0 % → 10 %), mais on garde 5,5 %.
  const str = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(n);
  return `${str} %`;
}

/** Format français : 1 234,56 € */
export function formatEurFr(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Format date FR : 11/05/2026 */
export function formatDateFr(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Format heure FR : 14h32 */
export function formatHeureFr(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).replace(":", "h");
}
