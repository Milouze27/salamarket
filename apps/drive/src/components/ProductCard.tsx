import { BadgeCheck, Plus, Scale } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Product } from "@/types/product";
import { formatPrice, unitLabel } from "@/lib/format";
import { useCartStore } from "@/stores/cartStore";
import { formatPriceWithUnit } from "@salamarket/shared";

interface Props {
  product: Product;
}

// Card produit Chronodrive-density × Salamarket-warmth
export const ProductCard = ({ product }: Props) => {
  const navigate = useNavigate();
  const addItem = useCartStore((s) => s.addItem);

  const unitType = product.unitType ?? "unit";
  // Pour weight & weight_bracket on n'ajoute pas directement depuis la
  // card — l'utilisateur doit choisir un poids/bracket → open detail.
  const isVariable = unitType === "weight" || unitType === "weight_bracket";

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isVariable) {
      navigate(`/produit/${product.id}`);
      return;
    }
    addItem(product);
  };

  const handleOpen = () => {
    navigate(`/produit/${product.id}`);
  };

  const showHalalBadge =
    product.category === "boucherie" || product.category === "charcuterie";

  // Texte affiché sous le prix : "au kg" / "à la pièce" pour unit,
  // "Vente au poids" pour weight, "3 tailles" pour bracket.
  const unitMeta =
    unitType === "weight"
      ? "vente au poids"
      : unitType === "weight_bracket"
        ? "vente au poids · tailles au choix"
        : unitLabel(product.unit);

  return (
    <article
      onClick={handleOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleOpen();
      }}
      aria-label={`${product.name} — ${formatPriceWithUnit(product)}`}
      className="group flex flex-col cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A227] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAF7EE] rounded-3xl"
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-3xl bg-white shadow-[0_12px_28px_-16px_rgba(8,42,32,0.18)]">
        <img
          src={product.imageUrl}
          alt={product.name}
          loading="lazy"
          decoding="async"
          width={600}
          height={600}
          className="w-full h-full object-cover transition-transform duration-[600ms] ease-out group-hover:scale-[1.05]"
        />

        {showHalalBadge && (
          <span
            className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#FAF7EE]/95 backdrop-blur text-[#0E3B2E] text-[10px] font-extrabold uppercase tracking-[0.1em] shadow-sm"
            aria-label="Produit halal certifié"
          >
            <BadgeCheck size={11} className="text-[#C9A227]" aria-hidden />
            Halal
          </span>
        )}

        {/* Badge "Au poids" en haut-droite pour les produits variables */}
        {isVariable && (
          <span
            className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-[#FBF6E2]/95 backdrop-blur text-[#3E2E0A] text-[10px] font-extrabold uppercase tracking-[0.1em] shadow-sm"
            aria-label="Vente au poids variable"
          >
            <Scale size={11} className="text-[#C9A227]" aria-hidden />
            Au poids
          </span>
        )}

        <button
          onClick={handleAdd}
          aria-label={
            isVariable
              ? `Choisir ${product.name}`
              : `Ajouter ${product.name} au panier`
          }
          className="absolute bottom-2.5 right-2.5 w-11 h-11 rounded-full bg-[#0E3B2E] text-white flex items-center justify-center shadow-lg shadow-[#0E3B2E]/35 hover:bg-[#082A20] hover:scale-105 active:scale-90 transition-all"
        >
          <Plus size={20} strokeWidth={2.4} aria-hidden />
        </button>
      </div>

      <div className="flex flex-col gap-1 px-1 pt-3.5 pb-1">
        <h3 className="text-[13.5px] md:text-[14px] leading-[1.25] text-[#0F1A14] font-semibold line-clamp-2 min-h-[2.5em] group-hover:text-[#0E3B2E] transition-colors">
          {product.name}
        </h3>
        <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
          <span className="text-[15.5px] md:text-[16px] font-extrabold text-[#0E3B2E] tabular-nums tracking-[-0.01em]">
            {unitType === "weight" && product.pricePerKg != null
              ? `${product.pricePerKg.toFixed(2).replace(".", ",")} €/kg`
              : formatPrice(product.priceCents)}
          </span>
          <span className="text-[10.5px] uppercase tracking-[0.12em] text-[#0F1A14]/55 font-semibold">
            · {unitMeta}
          </span>
        </div>
      </div>
    </article>
  );
};
