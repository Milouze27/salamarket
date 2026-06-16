import { useMemo } from "react";
import type { Product } from "@/types/product";
import type { CartItem } from "@/stores/cartStore";
import { useProducts } from "@/hooks/useProducts";
import {
  RECETTES_DRIVE,
  type RecetteDrive,
  type RecetteIngredientDrive,
} from "@/data/recettes-drive";

/** Normalise pour un match robuste : minuscule, ligatures dépliées, sans accent. */
const normalize = (s: string): string =>
  s
    .toLowerCase()
    // NFD ne décompose pas œ/æ → "bœuf" ne matchait jamais le keyword "boeuf".
    // On déplie les ligatures avant de retirer les diacritiques.
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Un ingrédient est "couvert" si un nom de produit contient un de ses keywords. */
const matchProduct = (
  ingredient: RecetteIngredientDrive,
  productNames: string[],
): boolean =>
  ingredient.keywords.some((kw) => {
    const k = normalize(kw);
    return productNames.some((n) => n.includes(k));
  });

/** Premier produit du catalogue dont le nom matche un keyword de l'ingrédient. */
const findCatalogProduct = (
  ingredient: RecetteIngredientDrive,
  catalog: Product[],
): Product | null => {
  for (const kw of ingredient.keywords) {
    const k = normalize(kw);
    const hit = catalog.find((p) => normalize(p.name).includes(k));
    if (hit) return hit;
  }
  return null;
};

export interface IngredientStatus {
  ingredient: RecetteIngredientDrive;
  /** Déjà présent dans le panier. */
  inCart: boolean;
  /** Produit du catalogue ajoutable si manquant (null si introuvable). */
  produit: Product | null;
}

export interface RecetteSuggestionData {
  recette: RecetteDrive;
  ingredients: IngredientStatus[];
  /** Produits manquants effectivement ajoutables au panier. */
  ajoutables: Product[];
}

/**
 * Choisit la recette la plus pertinente pour le panier courant et liste
 * ses ingrédients manquants ajoutables.
 *
 * Pertinence = nombre d'ingrédients déjà dans le panier. On ne suggère une
 * recette que si au moins 1 ingrédient est présent (le client cuisine
 * visiblement ce plat) ET au moins 1 ingrédient ajoutable manque (sinon
 * rien à proposer). Dégrade en silence si le catalogue n'est pas chargé.
 */
export const useRecettesDrive = (
  cartItems: CartItem[],
): RecetteSuggestionData | null => {
  const { data: catalog = [] } = useProducts();

  return useMemo(() => {
    if (cartItems.length === 0 || catalog.length === 0) return null;

    const cartNames = cartItems.map((i) => normalize(i.product.name));

    let best: RecetteSuggestionData | null = null;
    let bestScore = 0;

    for (const recette of RECETTES_DRIVE) {
      const ingredients: IngredientStatus[] = recette.ingredients.map(
        (ing) => {
          const inCart = matchProduct(ing, cartNames);
          const produit = inCart ? null : findCatalogProduct(ing, catalog);
          return { ingredient: ing, inCart, produit };
        },
      );

      const score = ingredients.filter((x) => x.inCart).length;
      const ajoutables = ingredients
        .filter((x) => !x.inCart && x.produit)
        .map((x) => x.produit as Product);

      // Conditions pour être suggérable : au moins 1 ingrédient en panier et
      // au moins 1 ingrédient manquant à proposer.
      if (score >= 1 && ajoutables.length >= 1 && score > bestScore) {
        bestScore = score;
        best = { recette, ingredients, ajoutables };
      }
    }

    return best;
    // catalog change rarement (staleTime), cartItems pilote le recalcul.
  }, [cartItems, catalog]);
};
