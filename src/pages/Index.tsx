import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, SearchX } from "lucide-react";
import { Header } from "@/components/Header";
import { EditorialIntro } from "@/components/EditorialIntro";
import { WeeklyPicks } from "@/components/WeeklyPicks";
import { CategoryTabs } from "@/components/CategoryTabs";
import { ProductCard } from "@/components/ProductCard";
import { ProductCardSkeleton } from "@/components/ProductCardSkeleton";
import { useProducts } from "@/hooks/useProducts";
import { useCartCount } from "@/hooks/useCartSummary";
import { BRAND, formatStoreLocation } from "@/config/brand";
import { normalizeSearch } from "@/lib/search";

const Index = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  // URL = source de vérité. Pas de state local pour la catégorie : on
  // lit/écrit toujours via le query param. Évite la désync entre l'état
  // affiché et l'URL bookmarkable / partageable.
  const category = searchParams.get("category") || "all";
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const { data: allProducts, isLoading, isError, error, refetch } = useProducts();

  // Setter qui pousse dans l'URL. "all" = nettoie le param pour
  // basculer en mode vitrine (URL propre /).
  const setCategory = useCallback(
    (slug: string) => {
      setSearchParams(
        slug === "all" ? {} : { category: slug },
        { replace: false },
      );
    },
    [setSearchParams],
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Préload IDLE 2-phases (12 d'abord, reste plus tard) hors chemin
  // critique — first paint reste réactif.
  useEffect(() => {
    if (!allProducts || allProducts.length === 0) return;
    const list = allProducts.filter((p) => p.imageUrl);

    const preloadBatch = (items: typeof list) => {
      items.forEach((p) => {
        const img = new Image();
        img.decoding = "async";
        img.src = p.imageUrl as string;
      });
    };

    const idle = (cb: () => void, timeout: number) => {
      const w = window as unknown as {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      };
      if (typeof w.requestIdleCallback === "function") {
        w.requestIdleCallback(cb, { timeout });
      } else {
        window.setTimeout(cb, timeout);
      }
    };

    idle(() => preloadBatch(list.slice(0, 12)), 800);
    idle(() => preloadBatch(list.slice(12)), 2500);
  }, [allProducts]);

  const products = useMemo(() => {
    if (!allProducts) return [];
    const term = normalizeSearch(debouncedSearch);
    return allProducts.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (!term) return true;
      const haystack = normalizeSearch(`${p.name} ${p.description ?? ""}`);
      return haystack.includes(term);
    });
  }, [allProducts, category, debouncedSearch]);

  const resetFilters = useCallback(() => {
    setCategory("all"); // nettoie l'URL
    setSearchInput("");
  }, [setCategory]);

  // Affiche EditorialIntro + WeeklyPicks uniquement en mode "all" sans
  // recherche : mode "vitrine". Dès qu'on filtre/cherche, on entre en
  // mode catalogue pur, plus efficace.
  const showVitrine = category === "all" && !debouncedSearch;

  // Padding bas dynamique : BottomNav (~56+safe) + StickyCartCTA (~64+8)
  // empilés = ~150px sur iPhone avec home indicator + panier rempli.
  // pb-20 (80px) masquait les derniers produits / la fin du footer.
  const cartCount = useCartCount();
  const bottomPad = cartCount > 0 ? "pb-[150px] md:pb-0" : "pb-20 md:pb-0";

  return (
    <div className={`min-h-dvh bg-[#FAF7EE] ${bottomPad}`}>
      <Header searchValue={searchInput} onSearchChange={setSearchInput} />

      {showVitrine && <EditorialIntro />}
      {showVitrine && allProducts && allProducts.length > 0 && (
        <WeeklyPicks products={allProducts} />
      )}

      <CategoryTabs active={category} onChange={setCategory} />

      <main className="max-w-7xl mx-auto px-6 md:px-8 pt-8 pb-14 md:pt-12 md:pb-24">
        {/* Header catalogue mode "filtré" — quand on a une catégorie ou
            une recherche, on ouvre par une note typographique sobre. */}
        {!showVitrine && (
          <header className="mb-7 md:mb-10 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] font-bold text-[#C9A227] mb-2">
                {debouncedSearch ? "Recherche" : "Rayon"}
              </p>
              <h1 className="text-[26px] md:text-[36px] leading-[1.05] text-[#0E3B2E] font-extrabold tracking-[-0.03em]">
                {debouncedSearch
                  ? `« ${debouncedSearch} »`
                  : BRAND.categories.find((c) => c.slug === category)?.name ?? "Tout"}
              </h1>
            </div>
            {products.length > 0 && (
              <span className="text-[12px] text-[#0F1A14]/55 pb-1.5 tabular-nums">
                {products.length} produit{products.length > 1 ? "s" : ""}
              </span>
            )}
          </header>
        )}

        {/* Pagination "04 / Catalogue" — visible en mode vitrine
            uniquement, pour rythmer la suite du parcours. */}
        {showVitrine && (
          <div className="hidden md:flex items-end gap-4 mb-10">
            <span className="text-[26px] font-extrabold text-[#C9A227] tabular-nums leading-none tracking-[-0.04em]">
              04
            </span>
            <span aria-hidden className="h-px flex-1 max-w-[80px] bg-[#0E3B2E]/25 mb-2" />
            <span className="text-[10px] uppercase tracking-[0.32em] font-bold text-[#0E3B2E] mb-1.5">
              Catalogue
            </span>
            <span aria-hidden className="flex-1 h-px bg-[#0E3B2E]/12 mb-2" />
          </div>
        )}

        {isError ? (
          <div className="flex flex-col items-center justify-center text-center py-20 px-4 gap-4">
            <AlertCircle size={40} className="text-destructive" />
            <h2 className="text-[18px] font-bold text-[#0E3B2E]">
              Impossible de charger le catalogue
            </h2>
            <p className="text-[14px] text-[#0F1A14]/60 max-w-sm">
              {error instanceof Error
                ? error.message
                : "Une erreur est survenue. Vérifiez votre connexion et réessayez."}
            </p>
            <button
              onClick={() => refetch()}
              className="mt-2 px-6 h-11 rounded-full bg-[#0E3B2E] text-white text-[14px] font-semibold hover:bg-[#082A20] active:scale-[0.98] transition-all"
            >
              Réessayer
            </button>
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 lg:gap-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : products.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6 lg:gap-8">
            {products.map((p, idx) => (
              <div
                key={p.id}
                className="animate-in fade-in slide-in-from-bottom-2 duration-500 [animation-fill-mode:backwards]"
                style={{ animationDelay: `${Math.min(idx, 8) * 40}ms` }}
              >
                <ProductCard product={p} />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 flex flex-col items-center gap-4">
            <SearchX size={48} className="text-[#0F1A14]/30" />
            <p className="text-[18px] font-bold text-[#0E3B2E]">
              Aucun produit trouvé
            </p>
            <p className="text-[14px] text-[#0F1A14]/60">
              Essayez une autre recherche ou catégorie
            </p>
            <button
              onClick={resetFilters}
              className="mt-2 px-6 h-11 rounded-full bg-[#0E3B2E] text-white text-[14px] font-semibold hover:bg-[#082A20] active:scale-[0.98] transition-all"
            >
              Voir tous les produits
            </button>
          </div>
        )}
      </main>

      {/* Footer — bandeau sapin sombre, pagination "05 / Salamarket"
          pour clôturer le rythme catalogue raisonné. */}
      <footer className="bg-[#0E3B2E] text-[#FAF7EE]">
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-14 md:py-24">
          <div className="hidden md:flex items-end gap-4 mb-12">
            <span className="text-[26px] font-extrabold text-[#C9A227] tabular-nums leading-none tracking-[-0.04em]">
              05
            </span>
            <span aria-hidden className="h-px flex-1 max-w-[80px] bg-[#FAF7EE]/25 mb-2" />
            <span className="text-[10px] uppercase tracking-[0.32em] font-bold text-[#FAF7EE]">
              Salamarket
            </span>
            <span aria-hidden className="flex-1 h-px bg-[#FAF7EE]/12 mb-2" />
          </div>

          <div className="grid gap-12 md:gap-16 md:grid-cols-12 items-start">
            <div className="md:col-span-7">
              <p className="md:hidden text-[10px] uppercase tracking-[0.28em] font-bold text-[#C9A227] mb-4">
                Salamarket Toulouse
              </p>
              <p className="text-[26px] sm:text-[30px] md:text-[40px] lg:text-[48px] leading-[1.05] text-[#FAF7EE] max-w-[18ch] font-extrabold tracking-[-0.035em]">
                Le supermarché halal{" "}
                <span className="text-[#C9A227]">indépendant</span> de Toulouse.
              </p>
              <p className="mt-6 text-[14px] md:text-[15px] text-[#FAF7EE]/70 leading-relaxed max-w-[44ch]">
                Sélection halal certifiée, retrait en magasin sans abonnement,
                créneaux du matin au soir.
              </p>
            </div>

            <div className="md:col-span-5 grid grid-cols-2 gap-8 md:gap-10 text-[13px]">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-[#C9A227] mb-3">
                  Adresse
                </p>
                <p className="text-[#FAF7EE]/85 leading-[1.55]">
                  {BRAND.store.address}
                  <br />
                  {BRAND.store.postalCode} {BRAND.store.city}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-[#C9A227] mb-3">
                  Horaires
                </p>
                <ul className="space-y-2 text-[#FAF7EE]/85">
                  {BRAND.store.hours.map((h) => (
                    <li key={h.days} className="flex flex-col leading-[1.4]">
                      <span className="text-[11px] text-[#FAF7EE]/55">
                        {h.days}
                      </span>
                      <span className="font-semibold">{h.time}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Bandeau bas — copyright + service, hairline pour séparer */}
          <div className="mt-14 md:mt-20 pt-6 border-t border-[#FAF7EE]/15 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] text-[#FAF7EE]/55 tracking-[0.02em]">
            <p>
              © {new Date().getFullYear()} {BRAND.name} · {formatStoreLocation(BRAND.store)}
            </p>
            <p>Click &amp; collect uniquement · Sans abonnement</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
