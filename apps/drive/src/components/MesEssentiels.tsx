import { useMemo } from "react";
import { Repeat } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useUserOrders } from "@/hooks/useUserOrders";
import { useProducts } from "@/hooks/useProducts";
import { ProductCard } from "@/components/ProductCard";
import type { Product } from "@/types/product";

// ─────────────────────────────────────────────────────────────────
// MesEssentiels — rayon "Mes essentiels" en haut d'accueil.
//
// Agrege les produits RECURRENTS de l'historique de commandes du client :
// on compte combien de commandes distinctes contiennent chaque produit,
// on garde ceux commandes au moins 2 fois (vrais reachats, pas un one-shot),
// tries par frequence. Resolus contre le catalogue charge (useProducts)
// pour avoir le prix/stock a jour et reutiliser ProductCard tel quel.
//
// Gracieux : non connecte → null. Aucune commande / aucun recurrent /
// aucun produit encore au catalogue → null. Jamais d'empty-state moche.
// ─────────────────────────────────────────────────────────────────

const MIN_OCCURRENCES = 2;
const MAX_ITEMS = 6;

export const MesEssentiels = () => {
  const { user } = useAuth();
  const { data: orders } = useUserOrders(user?.id, user?.email);
  const { data: products } = useProducts();

  const essentiels = useMemo<Product[]>(() => {
    if (!orders || orders.length === 0 || !products) return [];

    // Index catalogue par id (prix/stock a jour, seuls les en-stock y sont).
    const byId = new Map<string, Product>();
    products.forEach((p) => byId.set(p.id, p));

    // Compte les commandes DISTINCTES contenant chaque produit (frequence de
    // reachat), pas la quantite cumulee : 1 grosse commande ne doit pas faire
    // passer un produit pour un essentiel.
    const counts = new Map<string, number>();
    for (const order of orders) {
      const seen = new Set<string>();
      for (const item of order.items ?? []) {
        if (!item.product_id || seen.has(item.product_id)) continue;
        seen.add(item.product_id);
        counts.set(item.product_id, (counts.get(item.product_id) ?? 0) + 1);
      }
    }

    return Array.from(counts.entries())
      .filter(([, n]) => n >= MIN_OCCURRENCES)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => byId.get(id))
      .filter((p): p is Product => p != null)
      .slice(0, MAX_ITEMS);
  }, [orders, products]);

  if (essentiels.length === 0) return null;

  return (
    <section
      aria-labelledby="mes-essentiels-title"
      className="max-w-7xl mx-auto px-6 md:px-8 mt-8 md:mt-10"
    >
      <div className="flex items-center gap-3 mb-5 md:mb-6">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#0E3B2E] text-[#FAF7EE] shrink-0">
          <Repeat size={15} strokeWidth={2.4} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.24em] font-bold text-[#C9A227] leading-none">
            Vos habitudes
          </p>
          <h2
            id="mes-essentiels-title"
            className="mt-1.5 text-[20px] md:text-[26px] leading-[1.05] text-[#0E3B2E] font-extrabold tracking-[-0.03em]"
          >
            Mes essentiels
          </h2>
        </div>
      </div>

      {/* Scroll horizontal mobile, grille desktop — meme grammaire que les
          autres rayons. Anti-overflow via les cartes (ProductCard gere son
          line-clamp / object-cover). */}
      <ul
        className="
          flex md:grid md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-6
          -mx-6 md:mx-0 px-6 md:px-0
          overflow-x-auto md:overflow-visible scrollbar-none
          snap-x snap-mandatory md:snap-none
        "
      >
        {essentiels.map((p) => (
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

export default MesEssentiels;
