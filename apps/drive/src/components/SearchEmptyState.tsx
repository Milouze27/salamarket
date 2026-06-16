import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import type { Product } from "@/types/product";
import { BRAND } from "@/config/brand";

// ─────────────────────────────────────────────────────────────────
// SearchEmptyState — état vide soigné quand une recherche ne donne rien.
//
// Remplace le bloc vide générique d'Index : au lieu d'un cul-de-sac, on
// rebondit sur les 3 rayons les plus fournis du catalogue (calculés depuis
// allProducts reçu en prop) + un bouton reset. Net-new, branché par un
// simple swap de JSX dans l'état vide existant.
// ─────────────────────────────────────────────────────────────────

const TOP_RAYONS = 3;

interface Props {
  allProducts: Product[];
  /** Terme recherché — repris en clair pour situer l'absence de résultat. */
  query: string;
  onSelectRayon: (slug: string) => void;
  onReset: () => void;
}

export const SearchEmptyState = ({
  allProducts,
  query,
  onSelectRayon,
  onReset,
}: Props) => {
  // 3 rayons les plus fournis (produits en stock = ceux de useProducts).
  const topRayons = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of allProducts) {
      counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    }
    return BRAND.categories
      .map((c) => ({ slug: c.slug, name: c.name, count: counts.get(c.slug) ?? 0 }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_RAYONS);
  }, [allProducts]);

  return (
    <div className="py-16 md:py-20 flex flex-col items-center text-center">
      <p className="text-[13px] uppercase tracking-[0.22em] font-bold text-[#C9A227] mb-3">
        Aucun résultat
      </p>
      <h2 className="text-[22px] md:text-[28px] font-extrabold text-[#0E3B2E] tracking-[-0.02em] leading-[1.1] max-w-md">
        Rien trouvé{query ? <> pour « {query} »</> : null}
      </h2>
      <p className="mt-3 text-[14px] text-[#0F1A14]/60 max-w-sm">
        Vérifiez l&apos;orthographe, ou repartez d&apos;un de nos rayons les
        plus fournis.
      </p>

      {topRayons.length > 0 && (
        <div className="mt-7 w-full max-w-md flex flex-col gap-2.5">
          {topRayons.map((r) => (
            <button
              key={r.slug}
              type="button"
              onClick={() => onSelectRayon(r.slug)}
              className="group flex items-center justify-between gap-3 w-full min-h-[52px] rounded-2xl bg-white border border-[#0E3B2E]/15 pl-5 pr-4 py-3 text-left transition-all hover:border-[#0E3B2E]/40 hover:bg-[#0E3B2E]/[0.03] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A227]"
            >
              <span className="min-w-0">
                <span className="block text-[15px] font-bold text-[#0E3B2E] truncate">
                  {r.name}
                </span>
                <span className="block text-[12px] text-[#0F1A14]/50 tabular-nums">
                  {r.count} produit{r.count > 1 ? "s" : ""}
                </span>
              </span>
              <ArrowRight
                size={18}
                className="shrink-0 text-[#0E3B2E]/40 transition-transform group-hover:translate-x-0.5 group-hover:text-[#0E3B2E]"
                aria-hidden
              />
            </button>
          ))}
        </div>
      )}

      <button
        onClick={onReset}
        className="mt-7 px-6 h-11 rounded-full bg-[#0E3B2E] text-white text-[14px] font-semibold hover:bg-[#082A20] active:scale-[0.98] transition-all"
      >
        Voir tout le catalogue
      </button>
    </div>
  );
};

export default SearchEmptyState;
