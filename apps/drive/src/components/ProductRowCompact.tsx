import { useRef, useState } from "react";
import { Plus, Scale } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Product } from "@/types/product";
import { formatPrice, productUnitLabel } from "@/lib/format";
import { useCartStore } from "@/stores/cartStore";
import { useFlyingChip } from "@/hooks/useFlyingChip";
import {
  ProductImageFallback,
  isPlaceholderUrl,
} from "@/components/ProductImageFallback";
import { cdnImage } from "@/lib/imageUrl";
import { useDlcDiscount } from "@/components/HalalBadgeLink";

interface Props {
  product: Product;
}

// ─────────────────────────────────────────────────────────────────
// ProductRowCompact — ligne dense pour le mode "liste compacte" du
// catalogue (bascule ViewModeToggle). Vignette mini + nom + prix + un
// seul bouton "+" fonctionnel. Même logique d'ajout que ProductCard
// (réutilise addItem du store, throttle anti double-tap, chip volant,
// remise DLC capturée), mais sans le décor (favori/badges) : la densité
// prime ici. Les produits au poids ouvrent la PDP au lieu d'ajouter
// directement (le client doit choisir un poids/bracket).
// ─────────────────────────────────────────────────────────────────
export const ProductRowCompact = ({ product }: Props) => {
  const navigate = useNavigate();
  const addItem = useCartStore((s) => s.addItem);
  const { triggerFly } = useFlyingChip();
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const lastAddAtRef = useRef<number>(0);
  const [imgFailed, setImgFailed] = useState(() =>
    isPlaceholderUrl(product.imageUrl),
  );
  const [announce, setAnnounce] = useState<{ key: number; msg: string } | null>(
    null,
  );

  const unitType = product.unitType ?? "unit";
  const isVariable = unitType === "weight" || unitType === "weight_bracket";
  const isOutOfStock = !product.inStock;

  const dlcDiscount = useDlcDiscount(
    product.id,
    product.priceCents,
    unitType !== "weight",
  );
  const showDlcPrice = dlcDiscount != null && unitType !== "weight";

  const unitMeta = productUnitLabel(product);

  const handleOpen = () => {
    navigate(`/produit/${product.id}`);
  };

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOutOfStock) return;
    if (isVariable) {
      navigate(`/produit/${product.id}`);
      return;
    }
    // Throttle leading-only 200ms — couvre double-tap iOS + clics rageux
    // (même garde que ProductCard, cf. BUG-011).
    const now = Date.now();
    if (now - lastAddAtRef.current < 200) return;
    lastAddAtRef.current = now;
    triggerFly(addBtnRef.current, {
      imageUrl: product.imageUrl,
      name: product.name,
    });
    addItem(product, {
      dlcUnitPriceCents:
        showDlcPrice && dlcDiscount ? dlcDiscount.discountedCents : undefined,
    });
    setAnnounce({ key: Date.now(), msg: `${product.name} ajouté au panier` });
  };

  // Prix affiché : €/kg pour les vrais produits au poids, prix remisé DLC
  // sinon le plein tarif. On garde la même règle que ProductCard.
  const priceDisplay =
    showDlcPrice && dlcDiscount
      ? formatPrice(dlcDiscount.discountedCents)
      : unitType === "weight" && product.pricePerKg != null
        ? `${product.pricePerKg.toFixed(2).replace(".", ",")} €/kg`
        : formatPrice(product.priceCents);

  return (
    <article
      onClick={handleOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleOpen();
      }}
      aria-label={`${product.name} — ${priceDisplay} ${unitMeta}`}
      className="group flex items-center gap-3.5 py-2.5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A227] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAF7EE] rounded-2xl"
    >
      {/* Vignette mini */}
      <div className="relative shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-white shadow-[0_6px_16px_-10px_rgba(8,42,32,0.25)]">
        {imgFailed ? (
          <ProductImageFallback category={product.category} size="sm" />
        ) : (
          <img
            src={cdnImage(product.imageUrl, { width: 120 })}
            alt={product.name}
            loading="lazy"
            decoding="async"
            width={120}
            height={120}
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover"
          />
        )}
        {isOutOfStock && (
          <div
            aria-hidden
            className="absolute inset-0 bg-white/45 pointer-events-none"
          />
        )}
      </div>

      {/* Nom + meta — la typo porte la hiérarchie, pas de picto décoratif */}
      <div className="flex-1 min-w-0">
        <h3 className="text-[14px] leading-[1.3] text-[#0F1A14] font-semibold line-clamp-1 group-hover:text-[#0E3B2E] transition-colors">
          {product.name}
        </h3>
        <div className="mt-0.5 flex items-center gap-2 min-w-0">
          <span className="text-[14px] font-extrabold text-[#0E3B2E] tabular-nums tracking-[-0.01em] shrink-0">
            {priceDisplay}
          </span>
          {isVariable && (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-[0.08em] font-bold text-[#8B6F0E] shrink-0"
              aria-hidden
            >
              <Scale size={11} className="text-[#C9A227]" />
              Au poids
            </span>
          )}
          <span className="text-[11px] text-[#0F1A14]/55 font-medium truncate">
            {unitMeta}
          </span>
        </div>
      </div>

      {/* Action — unique bouton fonctionnel, 44×44 tap target */}
      <button
        ref={addBtnRef}
        type="button"
        onClick={handleAdd}
        disabled={isOutOfStock}
        aria-label={
          isOutOfStock
            ? `${product.name} indisponible`
            : isVariable
              ? `Choisir ${product.name}`
              : `Ajouter ${product.name} au panier`
        }
        className="shrink-0 w-11 h-11 rounded-full bg-[#0E3B2E] text-white flex items-center justify-center shadow-md shadow-[#0E3B2E]/30 hover:bg-[#082A20] active:scale-90 transition-all disabled:bg-[#0F1A14]/30 disabled:shadow-none disabled:cursor-not-allowed"
      >
        <Plus size={20} strokeWidth={2.4} aria-hidden />
      </button>

      <span key={announce?.key} aria-live="polite" className="sr-only">
        {announce?.msg ?? ""}
      </span>
    </article>
  );
};

export default ProductRowCompact;
