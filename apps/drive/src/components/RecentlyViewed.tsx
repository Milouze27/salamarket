import { useMemo } from "react";
import { useProducts } from "@/hooks/useProducts";
import { useRecentlyViewed } from "@/hooks/useRecentlyViewed";
import { ProductCard } from "@/components/ProductCard";
import type { Product } from "@/types/product";

// ─────────────────────────────────────────────────────────────────
// RecentlyViewed — "Reprendre où vous en étiez".
//
// Carrousel horizontal des derniers produits consultés (ids persistés
// par useRecentlyViewed, alimentés depuis la PDP). On résout les ids
// contre le catalogue chargé (useProducts) pour prix/stock à jour et
// réutiliser ProductCard tel quel.
//
// Gracieux : aucun récent encore au catalogue (rupture, retiré…) → null.
// Affiché seulement à partir de 2 produits (en dessous, "reprendre" n'a
// pas de sens). Hiérarchie par la typo, pas de picto décoratif.
// ─────────────────────────────────────────────────────────────────

const MIN_ITEMS = 2;
const MAX_ITEMS = 8;

export const RecentlyViewed = () => {
  const recentIds = useRecentlyViewed();
  const { data: products } = useProducts();

  const recent = useMemo<Product[]>(() => {
    if (recentIds.length === 0 || !products) return [];
    const byId = new Map(products.map((p) => [p.id, p]));
    return recentIds
      .map((id) => byId.get(id))
      .filter((p): p is Product => p != null)
      .slice(0, MAX_ITEMS);
  }, [recentIds, products]);

  if (recent.length < MIN_ITEMS) return null;

  return (
    <section
      aria-labelledby="recently-viewed-title"
      className="max-w-7xl mx-auto px-6 md:px-8 mt-8 md:mt-10"
    >
      <div className="flex items-end justify-between gap-4 mb-5 md:mb-6">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.24em] font-bold text-[#C9A227] leading-none">
            Reprendre où vous en étiez
          </p>
          <h2
            id="recently-viewed-title"
            className="mt-1.5 text-[20px] md:text-[26px] leading-[1.05] text-[#0E3B2E] font-extrabold tracking-[-0.03em]"
          >
            Vus récemment
          </h2>
        </div>
        <span className="text-[12px] text-[#0F1A14]/55 pb-1 tabular-nums shrink-0">
          {recent.length}
        </span>
      </div>

      {/* Scroll horizontal mobile, grille desktop — même grammaire que les
          autres rayons. Les cartes gèrent leur propre line-clamp / object-cover. */}
      <ul
        className="
          flex md:grid md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-6
          -mx-6 md:mx-0 px-6 md:px-0 scroll-pl-6 md:scroll-pl-0
          overflow-x-auto md:overflow-visible scrollbar-none
          snap-x snap-mandatory md:snap-none
        "
      >
        {recent.map((p) => (
          <li
            key={p.id}
            className="shrink-0 w-[42%] sm:w-[30%] md:w-auto snap-start"
          >
            <ProductCard product={p} />
          </li>
        ))}
      </ul>
    </section>
  );
};

export default RecentlyViewed;
