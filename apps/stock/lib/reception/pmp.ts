/** Coût moyen pondéré (PMP) après une entrée de stock.
 *  Retourne le coût reçu si pas de stock/coût antérieur, sinon la moyenne
 *  pondérée arrondie à 4 décimales. null si pas de coût reçu valide. */
export function calculerPmp(p: {
  qteAvant: number;
  coutAvant: number | null;
  qteRecue: number;
  coutRecu: number | null;
}): number | null {
  if (p.coutRecu == null || p.coutRecu < 0 || p.qteRecue <= 0) return null;
  if (p.qteAvant <= 0 || p.coutAvant == null) {
    return Math.round(p.coutRecu * 10000) / 10000;
  }
  return (
    Math.round(
      ((p.qteAvant * p.coutAvant + p.qteRecue * p.coutRecu) /
        (p.qteAvant + p.qteRecue)) *
        10000,
    ) / 10000
  );
}
