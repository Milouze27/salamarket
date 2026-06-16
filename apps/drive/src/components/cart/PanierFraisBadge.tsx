import type { CartItem } from "@/stores/cartStore";

// ─────────────────────────────────────────────────────────────────
// PanierFraisBadge — badge typographique ludique « Panier 100% frais »
// (ou « Panier majoritairement frais »). Pur dérivé des catégories des
// lignes du panier, aucun écrit serveur.
//
// Rayons frais = les rayons périssables du marché (fruits & légumes,
// boucherie, charcuterie, frais). Une ligne vendue au poids est par
// nature un produit frais préparé en magasin, on la compte aussi.
// Sobre : valorise par la typo (graisse + or), zéro picto décoratif.
// ─────────────────────────────────────────────────────────────────

const RAYONS_FRAIS = new Set([
  "fruits-legumes",
  "boucherie",
  "charcuterie",
  "frais",
]);

const estFrais = (item: CartItem): boolean => {
  // Vente au poids = produit frais préparé au comptoir (pesée magasin).
  if (item.unitType === "weight" || item.unitType === "weight_bracket") {
    return true;
  }
  return RAYONS_FRAIS.has(item.product.category);
};

export const PanierFraisBadge = ({ items }: { items: CartItem[] }) => {
  if (items.length === 0) return null;

  const fraisCount = items.filter(estFrais).length;
  // Pas de valorisation tant que le frais n'est pas majoritaire : le
  // badge doit récompenser un vrai panier de produits frais, pas un
  // panier d'épicerie avec deux pommes.
  if (fraisCount <= items.length / 2) return null;

  const toutFrais = fraisCount === items.length;

  return (
    <p
      className="px-1 text-[12px] font-semibold tracking-[0.02em] text-gold-text"
      role="status"
    >
      {toutFrais ? "Panier 100% frais" : "Panier majoritairement frais"}
      <span className="font-normal text-ink-faint">
        {" "}
        <span aria-hidden>·</span> préparé du jour
      </span>
    </p>
  );
};

export default PanierFraisBadge;
