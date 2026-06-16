import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Product } from "@/types/product";
import { formatPrice, productUnitLabel } from "@/lib/format";
import {
  ProductImageFallback,
  isPlaceholderUrl,
} from "@/components/ProductImageFallback";
import { cdnImage } from "@/lib/imageUrl";

// ─────────────────────────────────────────────────────────────────
// NouveautesStrip — "Arrivages récents" en tête de grille catalogue.
//
// Bande sobre au-dessus de la grille (mode filtré) listant 2-3 produits
// au createdAt récent (< 30 j). Lecture du champ createdAt déjà exposé
// par useProducts. Purement additif : reçoit la liste déjà filtrée/triée
// du catalogue et n'affiche rien si aucun produit récent.
// ─────────────────────────────────────────────────────────────────

const RECENT_DAYS = 30;
const RECENT_MS = RECENT_DAYS * 24 * 60 * 60 * 1000;
const MAX_ITEMS = 3;

const Vignette = ({ product }: { product: Product }) => {
  const [failed, setFailed] = useState(() => isPlaceholderUrl(product.imageUrl));
  const unitType = product.unitType ?? "unit";
  return (
    <Link
      to={`/produit/${product.id}`}
      className="group flex items-center gap-3 min-w-0 rounded-2xl p-2 -m-2 transition-colors hover:bg-[#0E3B2E]/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A227]"
      aria-label={`${product.name} — ${
        unitType === "weight" && product.pricePerKg != null
          ? `${product.pricePerKg.toFixed(2).replace(".", ",")} €/kg`
          : formatPrice(product.priceCents)
      } ${productUnitLabel(product)}`}
    >
      <div className="shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-white shadow-[0_8px_18px_-12px_rgba(8,42,32,0.25)]">
        {failed ? (
          <ProductImageFallback category={product.category} size="md" />
        ) : (
          <img
            src={cdnImage(product.imageUrl, { width: 160 })}
            alt={product.name}
            loading="lazy"
            decoding="async"
            width={160}
            height={160}
            onError={() => setFailed(true)}
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
          />
        )}
      </div>
      <div className="min-w-0">
        <h3 className="text-[13.5px] font-semibold leading-[1.2] text-[#0F1A14] truncate group-hover:text-[#0E3B2E] transition-colors">
          {product.name}
        </h3>
        <p className="mt-0.5 text-[13px] font-extrabold text-[#0E3B2E] tabular-nums tracking-[-0.01em]">
          {unitType === "weight" && product.pricePerKg != null
            ? `${product.pricePerKg.toFixed(2).replace(".", ",")} €/kg`
            : formatPrice(product.priceCents)}
        </p>
      </div>
    </Link>
  );
};

export const NouveautesStrip = ({ products }: { products: Product[] }) => {
  const recent = useMemo<Product[]>(() => {
    const now = Date.now();
    return products
      .filter((p) => {
        if (!p.createdAt) return false;
        const t = Date.parse(p.createdAt);
        return Number.isFinite(t) && now - t < RECENT_MS;
      })
      .sort((a, b) => Date.parse(b.createdAt!) - Date.parse(a.createdAt!))
      .slice(0, MAX_ITEMS);
  }, [products]);

  if (recent.length === 0) return null;

  return (
    <section
      aria-labelledby="nouveautes-strip-title"
      className="mb-7 md:mb-9 rounded-3xl border border-[#0E3B2E]/12 bg-white/70 px-4 py-4 md:px-6 md:py-5"
    >
      <div className="flex items-baseline gap-3 mb-3.5">
        <h2
          id="nouveautes-strip-title"
          className="text-[12px] uppercase tracking-[0.2em] font-extrabold text-[#0E3B2E]"
        >
          Arrivages récents
        </h2>
        <span className="text-[11px] text-[#0F1A14]/45">
          ajoutés ces 30 derniers jours
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
        {recent.map((p) => (
          <Vignette key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
};

export default NouveautesStrip;
