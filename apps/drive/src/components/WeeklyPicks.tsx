import { ArrowRight, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { Product } from "@/types/product";
import { formatPrice, unitLabel } from "@/lib/format";
import { useCartStore } from "@/stores/cartStore";
import {
  ProductImageFallback,
  isPlaceholderUrl,
} from "@/components/ProductImageFallback";

interface Props {
  products: Product[];
}

// Sélection bandeau horizontal — pas un slider promo, 3 produits curatés
// avec un caption par rayon. Photo dominante 4:5, titre sobre, prix
// aligné. Registre supermarché pro avec pagination éditoriale "02"
// reprise de EditorialIntro pour rythme catalogue raisonné.
//
// Les 3 produits sont choisis en priorité parmi des catégories signature
// (boucherie / charcuterie / épicerie). Fallback : 3 premiers en stock.
const PICKS: Array<{
  category: Product["category"];
  caption: string;
}> = [
  { category: "boucherie", caption: "Boucherie de la semaine" },
  { category: "charcuterie", caption: "Charcuterie maison" },
  { category: "epicerie", caption: "Essentiels du quotidien" },
];

const pickFromCatalog = (products: Product[]): Array<{ product: Product; caption: string }> => {
  const inStock = products.filter((p) => p.inStock);
  const picks: Array<{ product: Product; caption: string }> = [];
  const used = new Set<string>();

  for (const slot of PICKS) {
    const match = inStock.find(
      (p) => p.category === slot.category && !used.has(p.id),
    );
    if (match) {
      picks.push({ product: match, caption: slot.caption });
      used.add(match.id);
    }
  }

  if (picks.length < 3) {
    for (const p of inStock) {
      if (picks.length >= 3) break;
      if (!used.has(p.id)) {
        picks.push({ product: p, caption: "Sélection Salamarket" });
        used.add(p.id);
      }
    }
  }

  return picks.slice(0, 3);
};

export const WeeklyPicks = ({ products }: Props) => {
  const picks = pickFromCatalog(products);
  const addItem = useCartStore((s) => s.addItem);
  const navigate = useNavigate();
  if (picks.length === 0) return null;

  return (
    <section
      aria-labelledby="weekly-picks-title"
      className="relative bg-[#FAF7EE]"
    >
      {/* Hairline divider haut + bas pour cadrer la section comme un
          encart éditorial dans le magazine. */}
      <div aria-hidden className="border-t border-[#0E3B2E]/12" />

      <div className="max-w-7xl mx-auto px-6 md:px-8 pt-12 pb-14 md:pt-20 md:pb-24">
        {/* Header section : pagination "02" + titre + lien droite */}
        <div className="flex items-end justify-between gap-6 mb-9 md:mb-14">
          <div className="min-w-0">
            <div className="flex items-center gap-4 mb-5 md:mb-6">
              <span className="text-[26px] md:text-[30px] font-extrabold text-[#C9A227] tabular-nums leading-none tracking-[-0.04em]">
                02
              </span>
              <span aria-hidden className="h-px flex-1 max-w-[80px] bg-[#0E3B2E]/25" />
              <span className="text-[10px] uppercase tracking-[0.32em] font-bold text-[#0E3B2E]">
                Cette semaine
              </span>
            </div>
            <h2
              id="weekly-picks-title"
              className="text-[30px] md:text-[44px] lg:text-[52px] leading-[0.98] text-[#0E3B2E] font-extrabold tracking-[-0.035em]"
            >
              Notre sélection.
            </h2>
          </div>
          <a
            href="#nos-rayons"
            className="hidden md:inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0E3B2E] underline-offset-[7px] hover:underline decoration-[#C9A227] decoration-[2px] shrink-0 pb-2"
          >
            Tout le catalogue
            <ArrowRight size={14} aria-hidden />
          </a>
        </div>

        {/* Grille 3 colonnes desktop · scroll horizontal mobile */}
        <ul
          className="
            flex md:grid md:grid-cols-3 gap-5 md:gap-8
            -mx-6 md:mx-0 px-6 md:px-0
            overflow-x-auto md:overflow-visible scrollbar-none
            snap-x snap-mandatory md:snap-none
          "
        >
          {picks.map(({ product, caption }, idx) => (
            <li
              key={product.id}
              className="shrink-0 w-[82%] sm:w-[60%] md:w-auto snap-start"
            >
              <article className="group">
                <Link
                  to={`/produit/${product.id}`}
                  className="block"
                  aria-label={`${product.name} — ${caption}`}
                >
                  {/* Photo dominante 4:5 — pas de card frame, ombre subtile */}
                  <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl bg-white shadow-[0_20px_40px_-24px_rgba(8,42,32,0.25)]">
                    {isPlaceholderUrl(product.imageUrl) ? (
                      <ProductImageFallback category={product.category} size="lg" />
                    ) : (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      loading="eager"
                      fetchPriority={idx === 0 ? "high" : "auto"}
                      decoding="async"
                      width={800}
                      height={1000}
                      className="w-full h-full object-cover transition-transform duration-[700ms] ease-out group-hover:scale-[1.05]"
                    />
                    )}
                    {/* Numérotation pick — pose une intention de curation,
                        nichée bas-gauche, sous-jacent au "01/02/03" du
                        rythme catalogue. */}
                    <span
                      aria-hidden
                      className="absolute top-4 left-4 inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full bg-[#FAF7EE]/95 backdrop-blur text-[11px] font-extrabold tabular-nums text-[#0E3B2E] shadow-sm"
                    >
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    {/* CTA ajouter rapide overlay bas-droite */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const unitType = product.unitType ?? "unit";
                        if (unitType === "weight" || unitType === "weight_bracket") {
                          navigate(`/produit/${product.id}`);
                        } else {
                          addItem(product);
                        }
                      }}
                      aria-label={
                        (product.unitType ?? "unit") === "weight" || (product.unitType ?? "unit") === "weight_bracket"
                          ? `Choisir ${product.name}`
                          : `Ajouter ${product.name} au panier`
                      }
                      className="absolute bottom-4 right-4 w-11 h-11 rounded-full bg-[#0E3B2E] text-white flex items-center justify-center shadow-lg shadow-[#0E3B2E]/35 hover:bg-[#082A20] hover:scale-105 active:scale-90 transition-all"
                    >
                      <Plus size={20} strokeWidth={2.4} aria-hidden />
                    </button>
                  </div>
                </Link>

                {/* Légende sous l'image — caption gold caps + titre +
                    pricing aligné Chronodrive. */}
                <div className="mt-5 px-1">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-[#C9A227] font-bold mb-2">
                    {caption}
                  </p>
                  <h3 className="text-[17px] md:text-[19px] leading-[1.25] text-[#0E3B2E] font-bold tracking-[-0.02em]">
                    <Link
                      to={`/produit/${product.id}`}
                      className="hover:underline underline-offset-4 decoration-[1.5px] decoration-[#C9A227]/40"
                    >
                      {product.name}
                    </Link>
                  </h3>
                  <div className="mt-2.5 flex items-baseline gap-2">
                    <span className="text-[16px] font-extrabold tabular-nums text-[#0E3B2E] tracking-[-0.01em]">
                      {(product.unitType ?? "unit") === "weight" && product.pricePerKg != null
                        ? `${product.pricePerKg.toFixed(2).replace(".", ",")} €/kg`
                        : formatPrice(product.priceCents)}
                    </span>
                    <span className="text-[11px] text-[#0F1A14]/55">
                      · {(product.unitType ?? "unit") === "weight"
                        ? "vente au poids"
                        : unitLabel(product.unit)}
                    </span>
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>

        {/* Lien tout le catalogue — version mobile sous la liste */}
        <a
          href="#nos-rayons"
          className="md:hidden mt-8 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0E3B2E] underline underline-offset-[7px] decoration-[#C9A227] decoration-[2px]"
        >
          Tout le catalogue
          <ArrowRight size={14} aria-hidden />
        </a>
      </div>

      <div aria-hidden className="border-b border-[#0E3B2E]/12" />
    </section>
  );
};

export default WeeklyPicks;
