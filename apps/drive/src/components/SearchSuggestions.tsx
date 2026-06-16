import { useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Search, X } from "lucide-react";
import { useProducts } from "@/hooks/useProducts";
import {
  useRecentSearches,
  removeRecentSearch,
} from "@/hooks/useRecentSearches";
import { normalizeSearch } from "@/lib/search";
import { formatPrice, productUnitLabel } from "@/lib/format";
import { BRAND } from "@/config/brand";
import {
  ProductImageFallback,
  isPlaceholderUrl,
} from "@/components/ProductImageFallback";
import { cdnImage } from "@/lib/imageUrl";
import type { Product } from "@/types/product";

// ─────────────────────────────────────────────────────────────────
// SearchSuggestions — overlay sous le champ de recherche du Header.
//
// Deux états, 100 % client (lecture pure useProducts, ne touche pas la
// logique de filtrage d'Index) :
//   - Champ REMPLI  : les 5 produits matchant la saisie (vignette + nom
//     + prix), navigation directe vers la PDP au clic.
//   - Champ VIDE    : dernières recherches (effaçables individuellement)
//     + raccourcis vers les rayons non vides.
//
// Accessibilité : role="listbox" sur la liste produits, options en
// role="option". La fermeture (blur/escape) est pilotée par le Header
// (état `open`) ; ici on rend null si fermé ou si rien à proposer.
// ─────────────────────────────────────────────────────────────────

const MAX_RESULTS = 5;

interface Props {
  /** Saisie courante du champ (brute, non normalisée). */
  query: string;
  /** Overlay ouvert (le champ a le focus) — piloté par le Header. */
  open: boolean;
  /** Ferme l'overlay (après navigation / sélection). */
  onClose: () => void;
  /** Remplit le champ depuis une recherche récente ou un libellé rayon. */
  onSelectTerm: (term: string) => void;
}

const priceText = (p: Product): string =>
  p.unitType === "weight" && p.pricePerKg != null
    ? `${p.pricePerKg.toFixed(2).replace(".", ",")} €/kg`
    : formatPrice(p.priceCents);

// Vignette mini réutilisée pour chaque produit suggéré (fallback si pas
// de photo / placeholder, comme partout dans le catalogue).
const SuggestionThumb = ({ product }: { product: Product }) => {
  if (isPlaceholderUrl(product.imageUrl)) {
    return (
      <div className="shrink-0 w-11 h-11 rounded-lg overflow-hidden bg-white ring-1 ring-black/5">
        <ProductImageFallback category={product.category} size="sm" />
      </div>
    );
  }
  return (
    <img
      src={cdnImage(product.imageUrl, { width: 96 })}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      width={96}
      height={96}
      className="shrink-0 w-11 h-11 rounded-lg object-cover bg-white ring-1 ring-black/5"
    />
  );
};

export const SearchSuggestions = ({
  query,
  open,
  onClose,
  onSelectTerm,
}: Props) => {
  const navigate = useNavigate();
  const { data: products } = useProducts();
  const recent = useRecentSearches();

  const term = normalizeSearch(query);

  // Top correspondances (préfixe du nom prioritaire, puis inclusion nom,
  // puis description) — limité à MAX_RESULTS. Lecture pure du catalogue.
  const matches = useMemo<Product[]>(() => {
    if (!term || !products) return [];
    const starts: Product[] = [];
    const contains: Product[] = [];
    const inDesc: Product[] = [];
    for (const p of products) {
      const name = normalizeSearch(p.name);
      if (name.startsWith(term)) starts.push(p);
      else if (name.includes(term)) contains.push(p);
      else if (normalizeSearch(p.description ?? "").includes(term))
        inDesc.push(p);
      if (starts.length >= MAX_RESULTS) break;
    }
    return [...starts, ...contains, ...inDesc].slice(0, MAX_RESULTS);
  }, [term, products]);

  // Rayons non vides (raccourcis quand le champ est vide).
  const rayons = useMemo(() => {
    if (!products) return [];
    const counts = new Set(products.map((p) => p.category));
    return BRAND.categories.filter((c) => counts.has(c.slug));
  }, [products]);

  if (!open) return null;

  const hasQuery = term.length > 0;
  // Rien de pertinent à afficher → pas d'overlay (on n'affiche pas un
  // "aucun résultat" : Index gère déjà l'état vide de la grille).
  if (hasQuery && matches.length === 0) return null;
  if (!hasQuery && recent.length === 0 && rayons.length === 0) return null;

  const goToProduct = (id: string) => {
    onClose();
    navigate(`/produit/${id}`);
  };

  return (
    <div
      // mousedown plutôt que click : on capture la sélection AVANT le blur
      // du champ (qui fermerait l'overlay et empêcherait le clic).
      className="absolute left-0 right-0 top-full mt-2 z-40 max-h-[60vh] overflow-y-auto rounded-2xl bg-white text-text shadow-xl shadow-[#082A20]/25 ring-1 ring-black/5 animate-in fade-in slide-in-from-top-1 duration-150"
    >
      {hasQuery ? (
        <ul role="listbox" aria-label="Suggestions de produits" className="py-1.5">
          {matches.map((p) => (
            <li key={p.id} role="option" aria-selected={false}>
              <button
                type="button"
                // onMouseDown pour devancer le blur ; preventDefault garde
                // le focus stable le temps de naviguer.
                onMouseDown={(e) => {
                  e.preventDefault();
                  goToProduct(p.id);
                }}
                className="w-full flex items-center gap-3 px-3.5 py-2 text-left hover:bg-[#0E3B2E]/[0.04] active:bg-[#0E3B2E]/[0.07] transition-colors"
              >
                <SuggestionThumb product={p} />
                <span className="flex-1 min-w-0">
                  <span className="block text-[14px] font-semibold text-[#0F1A14] line-clamp-1">
                    {p.name}
                  </span>
                  <span className="block text-[12px] text-[#0F1A14]/55 font-medium">
                    {priceText(p)}
                    <span className="mx-1.5 text-[#0F1A14]/25">·</span>
                    {productUnitLabel(p)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="py-2">
          {recent.length > 0 && (
            <div className="px-3.5 pb-1.5">
              <p className="px-0.5 pt-1 pb-1.5 text-[10px] uppercase tracking-[0.2em] font-bold text-[#8B6F0E]">
                Recherches récentes
              </p>
              <ul className="flex flex-col">
                {recent.map((t) => (
                  <li key={t} className="flex items-center">
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onSelectTerm(t);
                      }}
                      className="flex-1 min-w-0 flex items-center gap-2.5 py-2 pr-2 text-left text-[14px] text-[#0F1A14] hover:text-[#0E3B2E] transition-colors"
                    >
                      <Search
                        size={15}
                        className="shrink-0 text-[#0F1A14]/35"
                        aria-hidden
                      />
                      <span className="truncate font-medium">{t}</span>
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        removeRecentSearch(t);
                      }}
                      aria-label={`Oublier la recherche « ${t} »`}
                      className="shrink-0 w-9 h-9 -mr-1 rounded-full flex items-center justify-center text-[#0F1A14]/35 hover:text-[#0F1A14]/70 hover:bg-[#0E3B2E]/[0.05] active:scale-90 transition-all"
                    >
                      <X size={15} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rayons.length > 0 && (
            <div className="px-3.5 pt-1.5 pb-1 border-t border-[#0E3B2E]/8">
              <p className="px-0.5 pt-1.5 pb-2 text-[10px] uppercase tracking-[0.2em] font-bold text-[#8B6F0E]">
                Rayons
              </p>
              <div className="flex flex-wrap gap-2 pb-1">
                {rayons.map((c) => (
                  <Link
                    key={c.slug}
                    to={`/?category=${c.slug}`}
                    onMouseDown={() => onClose()}
                    className="inline-flex items-center min-h-[36px] rounded-full bg-[#0E3B2E]/[0.05] px-3.5 text-[13px] font-semibold text-[#0E3B2E] hover:bg-[#0E3B2E]/[0.1] active:scale-[0.97] transition-all"
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchSuggestions;
