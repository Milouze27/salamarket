import { useMemo } from "react";
import type { Product } from "@/types/product";
import { BRAND } from "@/config/brand";

// ─────────────────────────────────────────────────────────────────
// RayonsRaccourcis — "Accès rapide" aux rayons (vitrine accueil).
//
// Rangée scrollable de boutons typographiques (nom du rayon + nombre de
// produits en stock) qui poussent ?category= dans l'URL via setCategory
// (déjà présent dans Index). On ne montre que les rayons NON vides du
// catalogue chargé. Pas d'eyebrow, pas de picto décoratif : ce sont des
// boutons de navigation, l'unique chevron est fonctionnel.
// ─────────────────────────────────────────────────────────────────

interface Props {
  products: Product[];
  onSelect: (slug: string) => void;
}

export const RayonsRaccourcis = ({ products, onSelect }: Props) => {
  // Compte par catégorie (produits en stock = ceux renvoyés par useProducts).
  const rayons = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    }
    return BRAND.categories
      .map((c) => ({ slug: c.slug, name: c.name, count: counts.get(c.slug) ?? 0 }))
      .filter((r) => r.count > 0);
  }, [products]);

  if (rayons.length === 0) return null;

  return (
    <section
      aria-labelledby="rayons-raccourcis-title"
      className="max-w-7xl mx-auto px-6 md:px-8 mt-8 md:mt-10"
    >
      <h2
        id="rayons-raccourcis-title"
        className="text-[10px] uppercase tracking-[0.24em] font-bold text-[#C9A227] mb-3.5"
      >
        Accès rapide aux rayons
      </h2>
      {/* Scroll horizontal — pas de wrap qui casse l'alignement. Chaque
          bouton ≥44px de haut (tap target). */}
      <div className="flex gap-2.5 -mx-6 md:mx-0 px-6 md:px-0 overflow-x-auto scrollbar-none snap-x">
        {rayons.map((r) => (
          <button
            key={r.slug}
            type="button"
            onClick={() => onSelect(r.slug)}
            className="group shrink-0 snap-start min-h-[44px] inline-flex items-baseline gap-2 rounded-full bg-white border border-[#0E3B2E]/15 pl-4 pr-3.5 py-2.5 text-left transition-all hover:border-[#0E3B2E]/40 hover:bg-[#0E3B2E]/[0.03] active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A227]"
          >
            <span className="text-[13.5px] font-semibold text-[#0E3B2E] whitespace-nowrap">
              {r.name}
            </span>
            <span className="text-[11px] font-bold tabular-nums text-[#0F1A14]/45 group-hover:text-[#C9A227] transition-colors">
              {r.count}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
};

export default RayonsRaccourcis;
