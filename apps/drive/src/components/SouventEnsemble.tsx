import { useMemo } from "react";
import { useProducts } from "@/hooks/useProducts";
import { ProductCard } from "@/components/ProductCard";
import type { Product } from "@/types/product";

// ─────────────────────────────────────────────────────────────────
// SouventEnsemble — "Souvent pris ensemble" (PDP).
//
// Propose 4 produits de catégories COMPLÉMENTAIRES au produit courant
// (mapping statique de bon sens marché de quartier), à défaut de la même
// catégorie. Lecture pure depuis useProducts (aucun signal serveur de
// co-achat ici). Réutilise ProductCard → l'ajout panier / flying chip est
// déjà câblé.
//
// `excludeIds` reçoit les ids déjà montrés par "Vous aimerez aussi" pour
// que les deux blocs restent DISTINCTS (pas de doublon sur la même fiche).
// ─────────────────────────────────────────────────────────────────

// Catégories qui se mangent ensemble (panier courses typique). On pioche
// d'abord dans cette liste, dans l'ordre, puis on complète au besoin.
// Slugs alignés sur BRAND.categories (Salamarket).
const COMPLEMENTS: Record<string, string[]> = {
  "fruits-legumes": ["frais", "epicerie", "boucherie"],
  boucherie: ["fruits-legumes", "epicerie", "boissons"],
  charcuterie: ["frais", "epicerie", "fruits-legumes"],
  frais: ["fruits-legumes", "epicerie", "charcuterie"],
  epicerie: ["fruits-legumes", "frais", "boissons"],
  boissons: ["epicerie", "boucherie", "surgele"],
  surgele: ["boissons", "epicerie", "fruits-legumes"],
  bazar: ["epicerie", "boissons", "fruits-legumes"],
};

const MAX_ITEMS = 4;

interface Props {
  product: Product;
  /** Ids déjà affichés par "Vous aimerez aussi" — exclus pour rester distinct. */
  excludeIds: string[];
}

export const SouventEnsemble = ({ product, excludeIds }: Props) => {
  const { data: products } = useProducts();

  const items = useMemo<Product[]>(() => {
    if (!products) return [];
    const excluded = new Set([product.id, ...excludeIds]);
    // Ordre de pioche : catégories complémentaires d'abord, puis même
    // catégorie en dernier recours pour toujours remplir les 4 cases.
    const order = [
      ...(COMPLEMENTS[product.category] ?? []),
      product.category,
    ];
    const picks: Product[] = [];
    const used = new Set<string>();
    for (const cat of order) {
      for (const p of products) {
        if (picks.length >= MAX_ITEMS) break;
        if (p.category !== cat) continue;
        if (excluded.has(p.id) || used.has(p.id)) continue;
        picks.push(p);
        used.add(p.id);
      }
      if (picks.length >= MAX_ITEMS) break;
    }
    return picks;
  }, [products, product.id, product.category, excludeIds]);

  if (items.length === 0) return null;

  return (
    <section className="mt-8 md:mt-10">
      <h2 className="text-base md:text-[17px] font-bold text-[#0E3B2E] mb-3 px-1">
        Souvent pris ensemble
      </h2>
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
};

export default SouventEnsemble;
