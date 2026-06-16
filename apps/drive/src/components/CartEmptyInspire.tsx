import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useProducts } from "@/hooks/useProducts";
import { ProductCard } from "@/components/ProductCard";
import { popularityScore } from "@/lib/productSignals";
import type { Product } from "@/types/product";

// ─────────────────────────────────────────────────────────────────
// CartEmptyInspire — état vide du panier, version inspirante.
//
// Remplace le message sec « Votre panier est vide » par une invitation :
// un titre éditorial, un CTA retour catalogue, et 3 produits « populaires »
// choisis de façon DÉTERMINISTE (popularityScore = hash de l'id, stable
// entre les renders — pas de Math.random qui clignote). Réutilise
// ProductCard tel quel (ajout direct / route PDP pour le poids déjà gérés).
//
// Strictement additif : ne touche AUCUNE logique panier. Lecture catalogue
// seule. Si moins de 3 produits sont disponibles, on n'affiche pas le bloc
// suggestions (juste le message + CTA), jamais de carrousel famélique.
// ─────────────────────────────────────────────────────────────────

const SUGGESTION_COUNT = 3;

export const CartEmptyInspire = () => {
  const navigate = useNavigate();
  const { data: products } = useProducts();

  const populaires = useMemo<Product[]>(() => {
    if (!products || products.length === 0) return [];
    // Tri déterministe par score de popularité (desc), puis on prend le top.
    return [...products]
      .sort((a, b) => popularityScore(b.id) - popularityScore(a.id))
      .slice(0, SUGGESTION_COUNT);
  }, [products]);

  return (
    <div className="flex flex-col items-center text-center py-12 px-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <p className="text-[10px] uppercase tracking-[0.28em] font-bold text-gold-text">
        Votre panier
      </p>
      <h2 className="mt-2 text-[24px] md:text-[28px] leading-[1.1] font-extrabold tracking-[-0.02em] text-sapin">
        Encore vide — pour l&apos;instant.
      </h2>
      <p className="mt-2 max-w-xs text-[14px] text-ink/60">
        Composez votre commande avec nos produits halal frais préparés avec
        soin. Voici quelques favoris pour démarrer.
      </p>

      <button
        onClick={() => navigate("/")}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-sapin px-6 py-3 text-[14px] font-semibold text-cream shadow-md shadow-sapin-deep/20 hover:bg-sapin-deep active:scale-[0.98] transition-all"
      >
        Découvrir le catalogue
      </button>

      {populaires.length === SUGGESTION_COUNT && (
        <section
          aria-labelledby="cart-empty-suggestions"
          className="mt-10 w-full"
        >
          <h3
            id="cart-empty-suggestions"
            className="mb-4 text-left text-[11px] uppercase tracking-[0.2em] font-bold text-ink/55"
          >
            Souvent commandés
          </h3>
          <ul className="grid grid-cols-3 gap-3 md:gap-5">
            {populaires.map((p) => (
              <li key={p.id}>
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export default CartEmptyInspire;
