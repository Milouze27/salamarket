import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, QrCode, SearchX } from "lucide-react";
import { Header } from "@/components/Header";
import { EditorialIntro } from "@/components/EditorialIntro";
import { WeeklyPicks } from "@/components/WeeklyPicks";
import { BundleCarousel } from "@/components/BundleCarousel";
import { CategoryTabs } from "@/components/CategoryTabs";
import { CourteDateBanner } from "@/components/CourteDateBanner";
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
  const {
    data: allProducts,
    isLoading,
    isError,
    error,
    refetch,
  } = useProducts();

  // Setter qui pousse dans l'URL. "all" = nettoie le param pour
  // basculer en mode vitrine (URL propre /).
  const setCategory = useCallback(
    (slug: string) => {
      setSearchParams(slug === "all" ? {} : { category: slug }, {
        replace: false,
      });
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
        requestIdleCallback?: (
          cb: () => void,
          opts?: { timeout: number },
        ) => number;
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

  // Padding bas additif basé sur les hauteurs RÉELLES du stack fixe plutôt
  // qu'un magic number heuristique :
  //   BottomNav = 56px + env(safe-area-inset-bottom)
  //   StickyCartCTA = 64px + 8px d'offset (bottom: safe + 56 + 8) — visible
  //     seulement panier non vide.
  //   + respiration pour que le dernier produit ET la fin du footer soient
  //     entièrement révélés au scroll-to-bottom (mémoire user : la nav ne
  //     doit jamais cacher de contenu utile), panier vide ET rempli.
  // calc() encaisse le home indicator iOS sans estimation. md:0 = desktop
  // n'a ni BottomNav ni StickyCartCTA (composants md:hidden).
  const cartCount = useCartCount();
  // Tailwind arbitrary value : espaces du calc() échappés en `_`. md:pb-0
  // car desktop n'affiche ni BottomNav ni StickyCartCTA (md:hidden).
  const bottomPad =
    cartCount > 0
      ? "pb-[calc(env(safe-area-inset-bottom)_+_56px_+_72px_+_24px)] md:pb-0"
      : "pb-[calc(env(safe-area-inset-bottom)_+_56px_+_16px)] md:pb-0";

  // BUG-007 : `overflow-x-hidden` au root pour empêcher tout overflow
  // horizontal sous 360px (constaté +4px sur iPhone SE 320px). Le footer
  // poster "Indépendant." en clamp(48px, 12vw, 180px) est ~288px de large
  // à 48px contre 272px utiles (320 − px-6×2) — c'est intentionnellement
  // visuellement débordant mais on borne le viewport pour pas créer de
  // scroll horizontal parasite (qui décale tout et casse les sticky).
  return (
    <div className={`min-h-dvh bg-[#FAF7EE] overflow-x-hidden ${bottomPad}`}>
      <Header searchValue={searchInput} onSearchChange={setSearchInput} />

      {showVitrine && <EditorialIntro />}
      {showVitrine && (
        <div className="max-w-7xl mx-auto px-6 md:px-8 mt-6">
          <CourteDateBanner />
        </div>
      )}
      {showVitrine && allProducts && allProducts.length > 0 && (
        <WeeklyPicks products={allProducts} />
      )}
      {/* Paniers-type par occasion. Le composant gere lui-meme son absence
          de donnees (table occasion_bundles absente en prod / 0 ligne →
          return null) : aucun risque de casser la home en mode vitrine. */}
      {showVitrine && <BundleCarousel />}

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
                  : (BRAND.categories.find((c) => c.slug === category)?.name ??
                    "Tout")}
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
            <span
              aria-hidden
              className="h-px flex-1 max-w-[80px] bg-[#0E3B2E]/25 mb-2"
            />
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

      {/* Footer éditorial — poster sapin nuit + affirmation display
          massive "Indépendant. De Toulouse. Halal." Le mot "Halal" passe
          en or solide. Microcopy adresse/horaires/copyright en hairline
          discret. Pas de social, pas de newsletter, pas de bullshit —
          juste la marque qui termine la lecture. */}
      <footer className="bg-[#082A20] text-[#FAF7EE]">
        <div className="max-w-7xl mx-auto px-6 md:px-8 py-16 md:py-28">
          {/* Pagination "05 / Salamarket" — rythme magazine conservé */}
          <div className="hidden md:flex items-end gap-4 mb-16">
            <span className="text-[26px] font-extrabold text-[#C9A227] tabular-nums leading-none tracking-[-0.04em]">
              05
            </span>
            <span
              aria-hidden
              className="h-px flex-1 max-w-[80px] bg-[#FAF7EE]/25 mb-2"
            />
            <span className="text-[10px] uppercase tracking-[0.32em] font-bold text-[#FAF7EE]">
              Salamarket
            </span>
            <span aria-hidden className="flex-1 h-px bg-[#FAF7EE]/12 mb-2" />
          </div>

          {/* Display poster — taille fluide clamp(48, 12vw, 180). Plus
              Jakarta extrabold uniquement, pas de serif décoratif (règle
              mémoire user). Le mot "Halal" tombe en or, le reste en cream. */}
          <h2
            className="font-extrabold text-[#FAF7EE]"
            style={{
              fontSize: "clamp(40px, 11vw, 180px)",
              lineHeight: 0.95,
              letterSpacing: "-0.04em",
            }}
          >
            Indépendant.
            <br />
            De Toulouse.
            <br />
            <span style={{ color: "#C9A227" }}>Halal.</span>
          </h2>

          {/* Traçabilité halal — chips éditorial avant le hairline.
              Single-point d'entrée discret vers la promesse lot QR
              (chaque pièce viande a son lot vérifiable). */}
          <div className="mt-10 md:mt-14 flex flex-wrap items-center gap-3">
            <Link
              to="/lot/L2026-05-A23"
              className="inline-flex items-center gap-2 px-4 h-10 rounded-full bg-[#FAF7EE]/10 border border-[#C9A227]/40 text-[#FAF7EE] text-[12px] font-semibold tracking-[0.04em] hover:bg-[#C9A227]/15 hover:border-[#C9A227]/65 active:scale-[0.98] transition-all"
            >
              <QrCode size={14} className="text-[#C9A227]" aria-hidden />
              Traçabilité halal — voir un lot
            </Link>
            <Link
              to="/drive-au-poids"
              className="inline-flex items-center px-4 h-10 rounded-full bg-transparent border border-[#FAF7EE]/20 text-[#FAF7EE] text-[12px] font-semibold tracking-[0.04em] hover:bg-[#FAF7EE]/8 active:scale-[0.98] transition-all"
            >
              Comment marche le drive au poids
            </Link>
          </div>

          {/* Microcopy — adresse + horaires + copyright en hairline discret */}
          <div className="mt-12 md:mt-16 pt-6 border-t border-[#FAF7EE]/15 flex flex-wrap justify-between gap-x-8 gap-y-3 text-[12px] text-[#FAF7EE]/65">
            <div>
              {BRAND.store.address}, {BRAND.store.postalCode} {BRAND.store.city}
            </div>
            <div>
              {BRAND.store.hours.map((h, i) => (
                <span key={h.days}>
                  {i > 0 && (
                    <span aria-hidden className="px-2 text-[#FAF7EE]/35">
                      ·
                    </span>
                  )}
                  {h.days} {h.time}
                </span>
              ))}
            </div>
            <div>
              © {new Date().getFullYear()} {BRAND.name} ·{" "}
              {formatStoreLocation(BRAND.store)}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
