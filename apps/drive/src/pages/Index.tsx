import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, QrCode, SearchX, Heart, ArrowUpDown } from "lucide-react";
import { Header } from "@/components/Header";
import { EditorialIntro } from "@/components/EditorialIntro";
import { WeeklyPicks } from "@/components/WeeklyPicks";
import { BundleCarousel } from "@/components/BundleCarousel";
import { RamadanBanner } from "@/components/RamadanBanner";
import { MesEssentiels } from "@/components/MesEssentiels";
import { CategoryTabs } from "@/components/CategoryTabs";
import { CourteDateBanner } from "@/components/CourteDateBanner";
import { useDlcProductIds } from "@/components/HalalBadgeLink";
import { ProductCard } from "@/components/ProductCard";
import { ProductCardSkeleton } from "@/components/ProductCardSkeleton";
import { useProducts } from "@/hooks/useProducts";
import { useCartCount } from "@/hooks/useCartSummary";
import { useFavoritesStore } from "@/stores/favoritesStore";
import { BRAND, formatStoreLocation } from "@/config/brand";
import { normalizeSearch } from "@/lib/search";

// Options de tri B2C. "pertinence" = ordre catalogue par défaut (catégorie
// puis nom, déjà trié côté useProducts) ; les autres réordonnent en mémoire.
type SortKey =
  | "pertinence"
  | "nouveautes"
  | "prix_asc"
  | "prix_desc"
  | "nom";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "pertinence", label: "Pertinence" },
  { key: "nouveautes", label: "Nouveautés" },
  { key: "prix_asc", label: "Prix croissant" },
  { key: "prix_desc", label: "Prix décroissant" },
  { key: "nom", label: "Nom A→Z" },
];

// Prix de référence pour le tri : on trie sur le prix réellement payé à
// l'unité (price_per_kg pour les produits au poids, priceCents sinon) pour
// que "prix croissant" reste cohérent quel que soit le type de produit.
const sortPriceCents = (p: {
  unitType?: string;
  pricePerKg?: number | null;
  priceCents: number;
}): number =>
  p.unitType === "weight" && p.pricePerKg != null
    ? Math.round(p.pricePerKg * 100)
    : p.priceCents;

const Index = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  // URL = source de vérité. Pas de state local pour la catégorie : on
  // lit/écrit toujours via le query param. Évite la désync entre l'état
  // affiché et l'URL bookmarkable / partageable.
  const category = searchParams.get("category") || "all";
  // Rayon anti-gaspi : ?courte_date=1 (depuis CourteDateBanner). On charge
  // l'ensemble des produits en remise DLC seulement dans ce mode.
  const courteDate = searchParams.get("courte_date") === "1";
  // Rayon "Mes favoris" : ?favoris=1 (depuis MesEssentiels / cœur). Mode
  // dédié comme courte_date — on bascule en catalogue filtré sur le set
  // persistant de favoris.
  const favoritesMode = searchParams.get("favoris") === "1";
  const favoriteIds = useFavoritesStore((s) => s.ids);
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const dlcIds = useDlcProductIds(courteDate);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // Tri catalogue B2C — état local (les produits sont déjà en mémoire).
  const [sort, setSort] = useState<SortKey>("pertinence");
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
    const filtered = allProducts.filter((p) => {
      // Rayon anti-gaspi : ne garde que les produits en remise DLC active.
      if (courteDate && !(dlcIds?.has(p.id) ?? false)) return false;
      // Rayon favoris : ne garde que les produits du set persistant.
      if (favoritesMode && !favoriteSet.has(p.id)) return false;
      if (category !== "all" && p.category !== category) return false;
      if (!term) return true;
      const haystack = normalizeSearch(`${p.name} ${p.description ?? ""}`);
      return haystack.includes(term);
    });

    // Tri en mémoire. "pertinence" = ordre catalogue d'origine (déjà trié
    // catégorie→nom côté useProducts) → on ne touche pas. On copie avant de
    // trier pour ne pas muter le tableau partagé du cache TanStack.
    if (sort === "pertinence") return filtered;
    const sorted = [...filtered];
    if (sort === "nouveautes") {
      // Plus récent d'abord (products.created_at desc). createdAt peut être
      // absent : on retombe alors sur 0 (epoch) pour ces produits, qui sont
      // simplement relégués en fin de liste plutôt que de casser le tri.
      const ts = (p: { createdAt?: string | null }): number => {
        const t = p.createdAt ? Date.parse(p.createdAt) : NaN;
        return Number.isFinite(t) ? t : 0;
      };
      sorted.sort((a, b) => ts(b) - ts(a));
    } else if (sort === "prix_asc") {
      sorted.sort((a, b) => sortPriceCents(a) - sortPriceCents(b));
    } else if (sort === "prix_desc") {
      sorted.sort((a, b) => sortPriceCents(b) - sortPriceCents(a));
    } else if (sort === "nom") {
      sorted.sort((a, b) =>
        a.name.localeCompare(b.name, "fr", { sensitivity: "base" }),
      );
    }
    return sorted;
  }, [
    allProducts,
    category,
    debouncedSearch,
    courteDate,
    dlcIds,
    favoritesMode,
    favoriteSet,
    sort,
  ]);

  const resetFilters = useCallback(() => {
    setCategory("all"); // nettoie l'URL
    setSearchInput("");
  }, [setCategory]);

  // Affiche EditorialIntro + WeeklyPicks uniquement en mode "all" sans
  // recherche : mode "vitrine". Dès qu'on filtre/cherche, on entre en
  // mode catalogue pur, plus efficace.
  const showVitrine =
    category === "all" && !debouncedSearch && !courteDate && !favoritesMode;

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
      {/* Mode Ramadan/Aïd — bandeau contextuel (return null hors période
          hijri). Util hijri local, aucun appel réseau. */}
      {showVitrine && <RamadanBanner />}
      {/* "Mes essentiels" — produits récurrents de l'historique (return
          null si non connecté / aucun récurrent). En haut d'accueil. */}
      {showVitrine && <MesEssentiels />}
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
                {favoritesMode
                  ? "Vos coups de cœur"
                  : courteDate
                    ? "Anti-gaspi"
                    : debouncedSearch
                      ? "Recherche"
                      : "Rayon"}
              </p>
              <h1 className="text-[26px] md:text-[36px] leading-[1.05] text-[#0E3B2E] font-extrabold tracking-[-0.03em]">
                {favoritesMode
                  ? "Mes favoris"
                  : courteDate
                    ? "Courte date, petits prix"
                    : debouncedSearch
                      ? `« ${debouncedSearch} »`
                      : (BRAND.categories.find((c) => c.slug === category)
                          ?.name ?? "Tout")}
              </h1>
              {(courteDate || favoritesMode) && (
                <button
                  onClick={resetFilters}
                  className="mt-2 text-[12px] font-bold text-[#0E3B2E] underline underline-offset-2"
                >
                  ← Tout le catalogue
                </button>
              )}
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

        {/* Barre de tri B2C — visible dès qu'une grille de produits est
            affichée (pas en chargement/erreur/vide). Scroll horizontal des
            puces sur petit écran, pas de wrap qui casse l'alignement. */}
        {!isError && !isLoading && products.length > 0 && (
          <div className="mb-6 md:mb-8 flex items-center gap-2 -mx-6 md:mx-0 px-6 md:px-0 overflow-x-auto scrollbar-none">
            <span
              className="shrink-0 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.14em] font-bold text-[#0F1A14]/55"
              aria-hidden
            >
              <ArrowUpDown size={13} className="text-[#C9A227]" />
              Trier
            </span>
            {SORT_OPTIONS.map((opt) => {
              const active = sort === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setSort(opt.key)}
                  aria-pressed={active}
                  className={
                    "shrink-0 h-9 px-3.5 rounded-full text-[12.5px] font-semibold transition-all active:scale-[0.97] " +
                    (active
                      ? "bg-[#0E3B2E] text-[#FAF7EE] shadow-sm"
                      : "bg-white text-[#0E3B2E] border border-[#0E3B2E]/15 hover:border-[#0E3B2E]/40")
                  }
                >
                  {opt.label}
                </button>
              );
            })}
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
        ) : favoritesMode ? (
          // État vide dédié au rayon favoris : pas une "recherche infructueuse"
          // mais une invitation à ajouter des cœurs.
          <div className="text-center py-20 flex flex-col items-center gap-4">
            <Heart size={48} className="text-[#E5483D]/40" aria-hidden />
            <p className="text-[18px] font-bold text-[#0E3B2E]">
              Aucun favori pour l&apos;instant
            </p>
            <p className="text-[14px] text-[#0F1A14]/60 max-w-xs">
              Touchez le cœur sur un produit pour le retrouver ici en un coup
              d&apos;œil.
            </p>
            <button
              onClick={resetFilters}
              className="mt-2 px-6 h-11 rounded-full bg-[#0E3B2E] text-white text-[14px] font-semibold hover:bg-[#082A20] active:scale-[0.98] transition-all"
            >
              Parcourir le catalogue
            </button>
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
            {/* Accès rayon favoris — affiché seulement si l'utilisateur a
                déjà des cœurs (sinon lien vers un rayon vide trompeur). */}
            {favoriteIds.length > 0 && (
              <Link
                to="/?favoris=1"
                className="inline-flex items-center gap-2 px-4 h-10 rounded-full bg-transparent border border-[#FAF7EE]/20 text-[#FAF7EE] text-[12px] font-semibold tracking-[0.04em] hover:bg-[#FAF7EE]/8 active:scale-[0.98] transition-all"
              >
                <Heart
                  size={13}
                  className="fill-[#E5483D] text-[#E5483D]"
                  aria-hidden
                />
                Mes favoris ({favoriteIds.length})
              </Link>
            )}
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
