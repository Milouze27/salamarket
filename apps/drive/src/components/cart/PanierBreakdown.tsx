import type { CartItem } from "@/stores/cartStore";

/**
 * Ligne de synthèse discrète "X produits au poids · Y à l'unité" — clarifie
 * d'un coup d'œil ce qui sera pesé en magasin (lignes 'weight', facturées au
 * poids réel) par rapport aux produits à prix fixe (unit + forfait bracket).
 *
 * On compte des produits (lignes du panier), pas des unités. Typo secondaire,
 * aucun pictogramme : lecture pure dérivée des unitType du store.
 */
export const PanierBreakdown = ({ items }: { items: CartItem[] }) => {
  const weightCount = items.filter((i) => i.unitType === "weight").length;
  const unitCount = items.length - weightCount;

  // Rien à clarifier si tout le panier est d'un seul type.
  if (weightCount === 0 || unitCount === 0) return null;

  const weightLabel = `${weightCount} produit${weightCount > 1 ? "s" : ""} au poids`;
  const unitLabel = `${unitCount} à l'unité`;

  return (
    <p className="px-1 text-[12px] text-ink-faint">
      {weightLabel} <span aria-hidden>·</span> {unitLabel}
    </p>
  );
};
