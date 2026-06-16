import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { BRAND } from "@/config/brand";
import { useProducts } from "@/hooks/useProducts";
import type { UserOrder } from "@/hooks/useUserOrders";

// ─────────────────────────────────────────────────────────────────
// RayonsPreferes — top 3 des rayons les plus présents dans l'historique
// de commandes (useUserOrders), avec raccourci vers chaque rayon.
//
// Lecture pure : on résout la catégorie de chaque ligne via le catalogue
// déjà chargé (useProducts, table products), donc AUCUNE requête nouvelle
// propre à ce composant. On compte les unités commandées par rayon.
// Dégrade en null sans historique ou si aucune catégorie n'est résolue.
// Top 3 typographique, le chevron est un repère de navigation fonctionnel.
// ─────────────────────────────────────────────────────────────────

const CATEGORY_BY_SLUG = new Map(BRAND.categories.map((c) => [c.slug, c.name]));

export const RayonsPreferes = ({ orders }: { orders: UserOrder[] }) => {
  // useProducts est déjà monté ailleurs (catalogue) → cache React Query
  // partagé, pas de fetch supplémentaire imputable à ce composant.
  const { data: products } = useProducts();

  const top = useMemo(() => {
    if (!orders.length || !products?.length) return [];

    const categoryByProductId = new Map(
      products.map((p) => [p.id, p.category]),
    );

    const counts = new Map<string, number>();
    for (const order of orders) {
      const items = Array.isArray(order.items) ? order.items : [];
      for (const item of items) {
        const slug = categoryByProductId.get(item.product_id);
        // On ne retient que les rayons connus du catalogue actuel (un
        // produit retiré n'a plus de rayon résoluble → ignoré).
        if (!slug || !CATEGORY_BY_SLUG.has(slug)) continue;
        counts.set(slug, (counts.get(slug) ?? 0) + (item.quantity || 1));
      }
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([slug, count]) => ({
        slug,
        name: CATEGORY_BY_SLUG.get(slug)!,
        count,
      }));
  }, [orders, products]);

  if (top.length === 0) return null;

  return (
    <section
      aria-labelledby="rayons-preferes-title"
      className="rounded-2xl border border-border bg-white p-5 shadow-sm"
    >
      <h2
        id="rayons-preferes-title"
        className="text-[11px] font-bold tracking-[0.18em] uppercase text-ink-faint mb-3"
      >
        Vos rayons préférés
      </h2>
      <ol className="flex flex-col divide-y divide-border">
        {top.map((r, idx) => (
          <li key={r.slug}>
            <Link
              to={`/?category=${r.slug}`}
              className="group flex items-baseline gap-3 py-3 -mx-1 px-1 rounded-lg active:scale-[0.99] hover:bg-sapin/[0.03] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              aria-label={`Voir le rayon ${r.name}`}
            >
              <span className="text-[13px] font-extrabold tabular-nums text-gold-text w-5 shrink-0">
                {idx + 1}
              </span>
              <span className="flex-1 min-w-0 text-[15px] font-semibold text-sapin truncate">
                {r.name}
              </span>
              <span className="shrink-0 text-[12px] font-medium tabular-nums text-ink-faint">
                {r.count} article{r.count > 1 ? "s" : ""}
              </span>
              <ChevronRight
                size={16}
                className="shrink-0 text-ink-faint group-hover:text-sapin group-hover:translate-x-0.5 transition-all"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
};

export default RayonsPreferes;
