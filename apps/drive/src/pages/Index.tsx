import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertCircle, QrCode, Heart, ArrowUpDown } from "lucide-react";
import { Header } from "@/components/Header";
import { SalutationHero } from "@/components/SalutationHero";
import { EditorialIntro } from "@/components/EditorialIntro";
import { SelectionSaison } from "@/components/SelectionSaison";
import { RayonDuJour } from "@/components/RayonDuJour";
import { CreneauTeaser } from "@/components/CreneauTeaser";
import { SuggestionMeteo } from "@/components/SuggestionMeteo";
import { WeeklyPicks } from "@/components/WeeklyPicks";
import { BundleCarousel } from "@/components/BundleCarousel";
import { RamadanBanner } from "@/components/RamadanBanner";
import { MesEssentiels } from "@/components/MesEssentiels";
import { RecentlyViewed } from "@/components/RecentlyViewed";
import { RayonsRaccourcis } from "@/components/RayonsRaccourcis";
import { NouveautesStrip } from "@/components/NouveautesStrip";
import { SearchEmptyState } from "@/components/SearchEmptyState";
import { CategoryTabs } from "@/components/CategoryTabs";
import { CourteDateBanner } from "@/components/CourteDateBanner";
import { useDlcProductIds } from "@/components/HalalBadgeLink";
import { ProductCard } from "@/components/ProductCard";
import { ProductRowCompact } from "@/components/ProductRowCompact";
import { ViewModeToggle } from "@/components/ViewModeToggle";
import {
  FiltresDietetiques,
  type ProductPredicate,
} from "@/components/FiltresDietetiques";
import { StickySearchBar } from "@/components/StickySearchBar";
import { ProductCardSkeleton } from "@/components/ProductCardSkeleton";
import { PullToRefreshIndicator } from "@/components/PullToRefreshIndicator";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useProducts } from "@/hooks/useProducts";
import { useViewMode } from "@/hooks/useViewMode";
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
  // Filtre diététique en mémoire (puces FiltresDietetiques) — additif,
  // n'altère pas l'URL ?category=. null = aucune puce active.
  const [dietPredicate, setDietPredicate] = useState<ProductPredicate | null>(
    null,
  );
  // Densité d'affichage du catalogue (grille de cartes vs liste compacte).
  const viewMode = useViewMode();
  const {
    data: allProducts,
    isLoading,
    isError,
    error,
    refetch,
  } = useProducts();

  // Pull-to-refresh maison (mobile uniquement) — au relâchement passé le
  // seuil, on rejoue le refetch du catalogue déjà exposé par useProducts.
  // No-op sur desktop / prefers-reduced-motion (le hook ne s'arme pas).
  const pull = usePullToRefresh(refetch);

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
      // Filtre diététique client (puces) — additif, par-dessus le reste.
      if (dietPredicate && !dietPredicate(p)) return false;
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
    dietPredicate,
  ]);

  const resetFilters = useCallback(() => {
    setCategory("all"); // nettoie l'URL
    setSearchInput("");
  }, [setCategory]);

  // Stocke le prédicat diététique. IMPORTANT : on l'encapsule dans le
  // setter fonctionnel (`() => pred`) — sinon React useState interprète un
  // argument fonction comme un *updater* et l'appelle avec l'état précédent
  // au lieu de le stocker, ce qui casserait le filtre.
  const handleDietFilter = useCallback((pred: ProductPredicate | null) => {
    setDietPredicate(() => pred);
  }, []);

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
      <PullToRefreshIndicator
        pull={pull.pull}
        armed={pull.armed}
        refreshing={pull.refreshing}
      />
      <Header searchValue={searchInput} onSearchChange={setSearchInput} />

      {/* Barre de recherche d'appoint mobile — apparaît au scroll vers le
          haut, réutilise le même état de recherche. Complément du Header,
          ne le remplace pas (cf. StickySearchBar pour la coexistence). */}
      <StickySearchBar value={searchInput} onSearchChange={setSearchInput} />

      {/* Salutation contextuelle (heure locale + prénom si connecté).
          Logique date pure côté client, additive au-dessus du hero. */}
      {showVitrine && <SalutationHero />}
      {showVitrine && <EditorialIntro />}
      {/* Mode Ramadan/Aïd — bandeau contextuel (return null hors période
          hijri). Util hijri local, aucun appel réseau. */}
      {showVitrine && <RamadanBanner />}
      {/* "Mes essentiels" — produits récurrents de l'historique (return
          null si non connecté / aucun récurrent). En haut d'accueil. */}
      {showVitrine && <MesEssentiels />}
      {/* "Reprendre où vous en étiez" — derniers produits consultés
          (localStorage). return null sous 2 produits encore au catalogue. */}
      {showVitrine && <RecentlyViewed />}
      {/* Accès rapide aux rayons — pousse ?category= via setCategory.
          return null si catalogue vide. */}
      {showVitrine && allProducts && allProducts.length > 0 && (
        <RayonsRaccourcis products={allProducts} onSelect={setCategory} />
      )}
      {/* Rayon du jour — rotation déterministe par jour de la semaine,
          encart éditorial vers ?category=. Lecture catalogue (visuel),
          dégrade en null si le rayon du jour est vide. */}
      {showVitrine && <RayonDuJour />}
      {showVitrine && (
        <div className="max-w-7xl mx-auto px-6 md:px-8 mt-6">
          <CourteDateBanner />
        </div>
      )}
      {showVitrine && allProducts && allProducts.length > 0 && (
        <WeeklyPicks products={allProducts} />
      )}
      {/* Sélection de saison — carrousel filtré sur les mots-clés du mois
          courant (data file). Lecture catalogue seule, null si < 2 matchs. */}
      {showVitrine && <SelectionSaison />}
      {/* Angle météo-gourmand saisonnier (soupes l'hiver, salades l'été)
          + 2-3 produits matchés. Lecture catalogue, null si aucun match. */}
      {showVitrine && <SuggestionMeteo />}
      {/* Paniers-type par occasion. Le composant gere lui-meme son absence
          de donnees (table occasion_bundles absente en prod / 0 ligne →
          return null) : aucun risque de casser la home en mode vitrine. */}
      {showVitrine && <BundleCarousel />}
      {/* Teaser créneaux — message date-pur « Retrait dès demain » vers
          /creneaux. Aucune lecture de la table slots, purement éditorial. */}
      {showVitrine && <CreneauTeaser />}

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
            puces sur petit écran, pas de wrap qui casse l'alignement. Le
            ViewModeToggle reste épinglé à droite, hors du scroll des puces. */}
        {!isError && !isLoading && products.length > 0 && (
          <div className="mb-6 md:mb-8 flex items-center gap-3">
            <div className="flex-1 min-w-0 flex items-center gap-2 -ml-6 md:ml-0 pl-6 md:pl-0 overflow-x-auto scrollbar-none">
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
                      // h-11 (44px) = tap target Apple HIG (avant : h-9/36px).
                      "shrink-0 h-11 px-3.5 rounded-full text-[12.5px] font-semibold transition-all active:scale-[0.97] " +
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
            <ViewModeToggle />
          </div>
        )}

        {/* Filtres rapides (Halal / Sans surgelé / Fait maison) — puces
            dérivées des produits, filtre client additif au-dessus de la
            grille. Le composant gère sa propre absence (return null si
            aucune puce pertinente pour le catalogue chargé). */}
        {!isError && !isLoading && allProducts && allProducts.length > 0 && (
          <FiltresDietetiques
            products={allProducts}
            onFilterChange={handleDietFilter}
          />
        )}

        {/* "Arrivages récents" — bande des produits au createdAt < 30j en
            tête de grille catalogue (mode filtré uniquement). Purement
            additif : return null si aucun produit récent dans le rayon. */}
        {!showVitrine && !isError && !isLoading && products.length > 0 && (
          <NouveautesStrip products={products} />
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
          viewMode === "compact" ? (
            // Mode liste compacte : lignes denses séparées par un hairline.
            // divide-y évite une bordure sur la première ligne.
            <ul className="divide-y divide-[#0E3B2E]/8">
              {products.map((p) => (
                <li key={p.id}>
                  <ProductRowCompact product={p} />
                </li>
              ))}
            </ul>
          ) : (
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
          )
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
          // État vide soigné : rebond vers les 3 rayons les plus fournis +
          // reset, plutôt qu'un cul-de-sac générique.
          <SearchEmptyState
            allProducts={allProducts ?? []}
            query={debouncedSearch}
            onSelectRayon={setCategory}
            onReset={resetFilters}
          />
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
