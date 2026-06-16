import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useProducts } from "@/hooks/useProducts";
import { formatPrice, productUnitLabel } from "@/lib/format";
import {
  ANGLE_METEO,
  matchProductsByKeywords,
  saisonForMonth,
} from "@/data/saison-produits";
import {
  ProductImageFallback,
  isPlaceholderUrl,
} from "@/components/ProductImageFallback";
import { cdnImage } from "@/lib/imageUrl";
import type { Product } from "@/types/product";

// ─────────────────────────────────────────────────────────────────
// SuggestionMeteo — bandeau météo-gourmand léger, saisonnier.
//
// Selon la saison (dérivée du mois, data file saison-produits.ts) on
// propose un angle éditorial (« Soupes & plats mijotés » l'hiver,
// « Salades & grillades » l'été) avec 2-3 produits du catalogue matchés
// par mots-clés. Texte éditorial + vignettes, lecture useProducts seule.
// Gracieux : rend `null` si aucun produit ne matche l'angle.
// ─────────────────────────────────────────────────────────────────

const MAX_ITEMS = 3;

const priceText = (p: Product): string =>
  (p.unitType ?? "unit") === "weight" && p.pricePerKg != null
    ? `${p.pricePerKg.toFixed(2).replace(".", ",")} €/kg`
    : formatPrice(p.priceCents);

const Vignette = ({ product }: { product: Product }) => {
  const [failed, setFailed] = useState(() => isPlaceholderUrl(product.imageUrl));
  return (
    <Link
      to={`/produit/${product.id}`}
      className="group flex items-center gap-3 min-w-0 rounded-2xl p-2 -m-2 transition-colors hover:bg-sapin/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      aria-label={`${product.name} — ${priceText(product)} ${productUnitLabel(product)}`}
    >
      <div className="shrink-0 w-16 h-16 rounded-2xl overflow-hidden bg-white shadow-[0_8px_18px_-12px_rgba(8,42,32,0.25)]">
        {failed ? (
          <ProductImageFallback category={product.category} size="md" />
        ) : (
          <img
            src={cdnImage(product.imageUrl, { width: 200 })}
            alt={product.name}
            loading="lazy"
            decoding="async"
            width={200}
            height={200}
            onError={() => setFailed(true)}
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
          />
        )}
      </div>
      <div className="min-w-0">
        <h3 className="text-[14px] font-semibold leading-[1.2] text-ink truncate group-hover:text-sapin transition-colors">
          {product.name}
        </h3>
        <p className="mt-0.5 text-[14px] font-extrabold text-sapin tabular-nums tracking-[-0.01em]">
          {priceText(product)}
        </p>
      </div>
    </Link>
  );
};

export const SuggestionMeteo = () => {
  const { data: products } = useProducts();

  // Saison figée au mount (le mois ne change pas pendant une session).
  const saison = useMemo(() => saisonForMonth(new Date().getMonth()), []);
  const angle = ANGLE_METEO[saison];

  const matches = useMemo<Product[]>(() => {
    if (!products) return [];
    return matchProductsByKeywords(products, angle.motsCles, MAX_ITEMS);
  }, [products, angle.motsCles]);

  // Pas de produit matché → on ne montre pas un encart vide.
  if (matches.length === 0) return null;

  return (
    <section
      aria-labelledby="suggestion-meteo-title"
      className="max-w-7xl mx-auto px-6 md:px-8 mt-10 md:mt-14"
    >
      <div className="rounded-3xl border border-sapin/12 bg-white/70 p-6 md:p-8">
        <div className="grid md:grid-cols-2 gap-6 md:gap-10 items-center">
          <div className="min-w-0">
            <h2
              id="suggestion-meteo-title"
              className="text-[24px] md:text-[32px] leading-[1.04] text-sapin font-extrabold tracking-[-0.035em]"
            >
              {angle.titre}.
            </h2>
            <p className="mt-3 text-[14px] md:text-[15px] leading-[1.55] text-ink/75 max-w-[46ch]">
              {angle.accroche}
            </p>
          </div>

          {/* Vignettes produits matchés — lecture catalogue, max 3. */}
          <div className="grid gap-3">
            {matches.map((p) => (
              <Vignette key={p.id} product={p} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default SuggestionMeteo;
