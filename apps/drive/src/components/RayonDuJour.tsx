import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useProducts } from "@/hooks/useProducts";
import { BRAND } from "@/config/brand";
import {
  ProductImageFallback,
  isPlaceholderUrl,
} from "@/components/ProductImageFallback";
import { cdnImage } from "@/lib/imageUrl";
import type { Product } from "@/types/product";

// ─────────────────────────────────────────────────────────────────
// RayonDuJour — mise en avant éditoriale d'un rayon, en rotation jour.
//
// Le rayon signature est choisi par le JOUR de la semaine (mapping
// statique, déterministe, aucun appel réseau). Encart éditorial pleine
// largeur sur fond sapin nuit menant au catalogue filtré (?category=).
// Grande typographie + un visuel produit du rayon (lu sur le catalogue
// déjà en cache — purement décoratif, le composant fonctionne sans).
// Gracieux : si le rayon du jour n'a aucun produit en stock, on rend
// `null` (pas d'encart pointant vers un rayon vide).
// ─────────────────────────────────────────────────────────────────

// 0 = dimanche … 6 = samedi (Date.getDay()). On mappe chaque jour sur
// un slug de BRAND.categories + une accroche éditoriale. Les slugs DOIVENT
// exister dans BRAND.categories (sinon le rayon serait introuvable).
const JOUR_RAYON: Record<
  number,
  { slug: string; accroche: string }
> = {
  0: { slug: "frais", accroche: "Fromages, crèmerie et produits frais de caractère." },
  1: { slug: "fruits-legumes", accroche: "On refait le plein de fraîcheur pour la semaine." },
  2: { slug: "boucherie", accroche: "Le comptoir halal, préparé maison chaque matin." },
  3: { slug: "frais", accroche: "Le rayon frais, sélectionné avec soin." },
  4: { slug: "epicerie", accroche: "Les essentiels du placard, choisis avec soin." },
  5: { slug: "boucherie", accroche: "On prépare le week-end : les belles pièces du comptoir." },
  6: { slug: "fruits-legumes", accroche: "Le marché du samedi, comme à l'étal." },
};

const VisuelProduit = ({ product }: { product: Product }) => {
  const [failed, setFailed] = useState(() => isPlaceholderUrl(product.imageUrl));
  if (failed) {
    return <ProductImageFallback category={product.category} size="lg" />;
  }
  return (
    <img
      src={cdnImage(product.imageUrl, { width: 800 })}
      alt={product.name}
      loading="lazy"
      decoding="async"
      width={800}
      height={800}
      onError={() => setFailed(true)}
      className="w-full h-full object-cover transition-transform duration-[700ms] ease-out group-hover:scale-[1.05]"
    />
  );
};

export const RayonDuJour = () => {
  const { data: products } = useProducts();

  // Jour figé au mount. Déterministe : même jour → même rayon.
  const dayIndex = useMemo(() => new Date().getDay(), []);
  const entry = JOUR_RAYON[dayIndex];

  const category = useMemo(
    () => BRAND.categories.find((c) => c.slug === entry.slug),
    [entry.slug],
  );

  // Un produit du rayon pour le visuel (premier en stock du catalogue
  // déjà chargé). Décoratif : si rien, on garde l'encart sans photo.
  const visuel = useMemo<Product | null>(() => {
    if (!products) return null;
    return (
      products.find((p) => p.category === entry.slug && p.inStock) ?? null
    );
  }, [products, entry.slug]);

  // Catégorie inconnue (config incohérente) → on n'affiche rien plutôt
  // que de pointer vers un rayon vide.
  if (!category) return null;
  // Le catalogue est chargé mais le rayon du jour est vide : on dégrade.
  if (products && !products.some((p) => p.category === entry.slug && p.inStock)) {
    return null;
  }

  const to = `/?category=${category.slug}`;

  return (
    <section
      aria-labelledby="rayon-du-jour-title"
      className="max-w-7xl mx-auto px-6 md:px-8 mt-10 md:mt-14"
    >
      <Link
        to={to}
        className="group block overflow-hidden rounded-[28px] md:rounded-[36px] bg-sapin-deep text-cream shadow-[0_30px_60px_-32px_rgba(8,42,32,0.45)] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
      >
        <div className="grid md:grid-cols-2 items-stretch">
          {/* Bloc texte — hiérarchie par la typo : surtitre jour discret,
              gros titre rayon, accroche, puis CTA fonctionnel. */}
          <div className="p-7 md:p-12 flex flex-col justify-center">
            <p className="text-[11px] uppercase tracking-[0.28em] font-bold text-gold">
              Le rayon du jour
            </p>
            <h2
              id="rayon-du-jour-title"
              className="mt-3 text-[30px] sm:text-[38px] md:text-[46px] leading-[0.98] font-extrabold tracking-[-0.035em]"
            >
              {category.name}
            </h2>
            <p className="mt-4 text-[14px] md:text-[15px] leading-[1.55] text-cream/80 max-w-[40ch]">
              {entry.accroche}
            </p>
            <span className="mt-6 inline-flex items-center gap-2 h-12 px-6 self-start rounded-full bg-cream text-sapin-deep text-[14px] font-semibold shadow-lg shadow-black/20 transition-transform group-hover:translate-x-0.5 group-active:scale-[0.98]">
              Voir le rayon
              <ArrowRight size={15} aria-hidden />
            </span>
          </div>

          {/* Visuel produit — ratio cadré, décoratif (alt vide). Masqué si
              aucun produit (le bloc texte occupe alors toute la largeur). */}
          {visuel && (
            <div className="relative min-h-[200px] md:min-h-[320px] order-first md:order-last overflow-hidden bg-sapin">
              <VisuelProduit product={visuel} />
              {/* Liaison visuelle vers le bloc texte sapin sur desktop. */}
              <div
                aria-hidden
                className="hidden md:block absolute inset-0 bg-gradient-to-r from-sapin-deep/60 to-transparent"
              />
            </div>
          )}
        </div>
      </Link>
    </section>
  );
};

export default RayonDuJour;
