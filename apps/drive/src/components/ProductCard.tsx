import { useRef, useState } from "react";
import { BadgeCheck, Plus, Scale } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Product } from "@/types/product";
import { formatPrice, unitLabel } from "@/lib/format";
import { useCartStore } from "@/stores/cartStore";
import { useFlyingChip } from "@/hooks/useFlyingChip";
import { formatPriceWithUnit } from "@salamarket/shared";
import {
  ProductImageFallback,
  isPlaceholderUrl,
} from "@/components/ProductImageFallback";
import { cdnImage } from "@/lib/imageUrl";

interface Props {
  product: Product;
}

// View Transitions API — feature detection sans throw côté TS.
function startTransition(fn: () => void) {
  // @ts-expect-error - startViewTransition not yet in TS lib.dom default
  if (typeof document !== "undefined" && document.startViewTransition) {
    // @ts-expect-error - same
    document.startViewTransition(fn);
  } else {
    fn();
  }
}

// Card produit Chronodrive-density × Salamarket-warmth
export const ProductCard = ({ product }: Props) => {
  const navigate = useNavigate();
  const addItem = useCartStore((s) => s.addItem);
  const { triggerFly } = useFlyingChip();
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const [imgFailed, setImgFailed] = useState(() =>
    isPlaceholderUrl(product.imageUrl),
  );

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
    // Fly the chip BEFORE state update — chip captures the source position
    // and is independent of the React re-render that follows addItem().
    triggerFly(addBtnRef.current, {
      imageUrl: product.imageUrl,
      name: product.name,
    });
    addItem(product);
  };

  const handleOpen = () => {
    // Wrap navigation in startViewTransition so the shared view-transition-name
    // on the image enables a smooth morph to ProductDetail hero.
    startTransition(() => {
      navigate(`/produit/${product.id}`);
    });
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
        {imgFailed ? (
          <ProductImageFallback category={product.category} size="md" />
        ) : (
          <img
            src={cdnImage(product.imageUrl, { width: 600 })}
            alt={product.name}
            loading="lazy"
            decoding="async"
            width={600}
            height={600}
            onError={() => setImgFailed(true)}
            /* View Transitions API — shared element morph vers ProductDetail
               hero. La même CSS view-transition-name est posée sur l'image
               du detail. Browsers sans support : la prop CSS est ignorée. */
            style={{ viewTransitionName: `product-${product.id}` }}
            className="w-full h-full object-cover transition-transform duration-[600ms] ease-out group-hover:scale-[1.05]"
          />
        )}

        {/* Layout original : HALAL en haut-gauche, AU POIDS en haut-droite.
            Taille réduite (h=20, text-[9px]) pour éviter le chevauchement
            qui se produisait avec le format précédent (h=24, text-[10px]). */}
        {showHalalBadge && (
          <span
            className="absolute top-2 left-2 z-10 inline-flex items-center gap-0.5 pl-1 pr-1.5 h-[20px] rounded-full bg-[#FAF7EE]/95 backdrop-blur text-[#0E3B2E] text-[9px] font-extrabold uppercase tracking-[0.06em] shadow-sm ring-1 ring-black/5"
            aria-label="Produit halal certifié"
          >
            <BadgeCheck size={11} className="text-[#C9A227]" aria-hidden />
            Halal
          </span>
        )}
        {isVariable && (
          <span
            className="absolute top-2 right-2 z-10 inline-flex items-center gap-0.5 pl-1 pr-1.5 h-[20px] rounded-full bg-[#FBF6E2]/95 backdrop-blur text-[#3E2E0A] text-[9px] font-extrabold uppercase tracking-[0.06em] shadow-sm ring-1 ring-black/5"
            aria-label="Vente au poids variable"
          >
            <Scale size={11} className="text-[#C9A227]" aria-hidden />
            Au poids
          </span>
        )}

        <button
          ref={addBtnRef}
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

      {/* Bloc info — hauteur stable entre unit / weight / bracket.
          Variantes précédentes : "VENTE AU POIDS · TAILLES AU CHOIX"
          wrappait sur 2 lignes alors que "AU KG" tenait sur 1, créant
          un delta de ~37px qui désalignait la grille. Solution : prix
          sur sa propre ligne (h-stable) et meta tronquée single-line
          dessous. */}
      <div className="flex flex-col gap-1 px-1 pt-3.5 pb-1">
        <h3 className="text-[13.5px] md:text-[14px] leading-[1.25] text-[#0F1A14] font-semibold line-clamp-2 min-h-[2.5em] group-hover:text-[#0E3B2E] transition-colors">
          {product.name}
        </h3>
        <div className="mt-1 flex flex-col gap-0.5">
          <span className="text-[15.5px] md:text-[16px] font-extrabold text-[#0E3B2E] tabular-nums tracking-[-0.01em] leading-tight">
            {unitType === "weight" && product.pricePerKg != null
              ? `${product.pricePerKg.toFixed(2).replace(".", ",")} €/kg`
              : formatPrice(product.priceCents)}
          </span>
          <span className="text-[10.5px] uppercase tracking-[0.12em] text-[#0F1A14]/55 font-semibold truncate">
            {unitMeta}
          </span>
        </div>
      </div>
    </article>
  );
};
