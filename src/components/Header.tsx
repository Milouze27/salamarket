import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Search, ShoppingBag, Store, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCartCount } from "@/hooks/useCartSummary";
import { HeaderUserMenu } from "@/components/HeaderUserMenu";
import { BrandLogo } from "@/components/BrandLogo";
import { StaffBanner } from "@/components/StaffBanner";
import { cn } from "@/lib/utils";

interface Props {
  searchValue: string;
  onSearchChange: (value: string) => void;
}

const firstNameOf = (full?: string | null): string | null => {
  if (!full) return null;
  const trimmed = full.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
};

const greetingForHour = (h: number): string => {
  if (h < 5) return "Bonsoir";
  if (h < 18) return "Bonjour";
  return "Bonsoir";
};

// Pattern iOS Large Title : hero gradient sapin scrollable + compact
// sticky en sapin qui apparaît au scroll. Le bg sapin met en valeur le
// logo doré transparent et donne une signature brand forte distincte du
// reste de l'app crème. StaffBanner est intégré dans le hero (admin/
// employee uniquement) pour éviter le gap blanc précédent.
export const Header = ({ searchValue, onSearchChange }: Props) => {
  const { profile, user } = useAuth();
  const firstName = firstNameOf(profile?.full_name);
  const cartCount = useCartCount();

  const sentinelRef = useRef<HTMLDivElement>(null);
  const [showCompact, setShowCompact] = useState(false);
  const [compactSearchOpen, setCompactSearchOpen] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const obs = new IntersectionObserver(
      ([entry]) => setShowCompact(!entry.isIntersecting),
      { rootMargin: "0px", threshold: 0 },
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, []);

  const hour = new Date().getHours();
  const greet = greetingForHour(hour);

  return (
    <>
      {/* HERO — gradient sapin sombre, logo doré pleine valeur */}
      <section
        className="relative bg-gradient-to-b from-[#0E3B2E] via-[#082A20] to-[#082A20] text-white px-6 pb-6 overflow-hidden"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        {/* Halo doré décoratif blur */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-12 -right-12 w-56 h-56 rounded-full bg-[#C9A227]/15 blur-2xl"
        />

        {/* Top row : logo + (cart desktop/tablette only) + account */}
        <div className="relative flex items-center justify-between mb-6">
          <Link to="/" aria-label="Salamarket Drive — accueil">
            <BrandLogo size="lg" />
          </Link>
          <div className="flex items-center gap-2">
            {/* Cart icon visible md+ uniquement (mobile a le BottomNav) */}
            <Link
              to="/panier"
              aria-label={
                cartCount > 0
                  ? `Voir le panier (${cartCount} article${cartCount > 1 ? "s" : ""})`
                  : "Voir le panier"
              }
              className="hidden md:flex relative w-10 h-10 rounded-full bg-white/10 hover:bg-white/15 items-center justify-center text-white active:scale-95 transition-all"
            >
              <ShoppingBag size={20} aria-hidden />
              {cartCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#C9A227] text-[#0E3B2E] text-[10px] font-bold flex items-center justify-center border-2 border-[#0E3B2E] shadow-sm">
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              )}
            </Link>
            <HeaderUserMenu />
          </div>
        </div>

        {/* Greeting hero — blanc sur sapin */}
        <h1 className="relative text-[28px] font-bold text-white leading-tight tracking-tight">
          {greet}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="relative text-base text-white/75 mt-1">
          {user
            ? "Que voulez-vous commander ?"
            : "Bienvenue sur votre supermarché halal"}
        </p>

        {/* Search bar large — bg blanc pour contraste sur sapin */}
        <div className="relative mt-5">
          <Search
            size={20}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-[#0E3B2E] pointer-events-none"
            aria-hidden
          />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Rechercher viandes, épices, riz..."
            aria-label="Rechercher un produit"
            className="w-full h-14 rounded-2xl bg-white border-2 border-transparent pl-12 pr-12 text-base placeholder:text-muted/65 text-text focus:outline-none focus:border-[#C9A227] focus:ring-4 focus:ring-[#C9A227]/25 transition-all shadow-lg shadow-[#082A20]/30"
            inputMode="search"
            enterKeyHint="search"
          />
          {searchValue && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Effacer la recherche"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full hover:bg-[#FAF7EE] flex items-center justify-center text-muted active:scale-90 transition-transform"
            >
              <X size={18} aria-hidden />
            </button>
          )}
        </div>

        {/* Magasin info — petit texte blanc semi-transparent */}
        <div className="relative mt-4 inline-flex items-center gap-1.5 text-xs text-white/65">
          <Store size={12} className="text-[#C9A227]" aria-hidden />
          <span>
            <span className="font-semibold text-white">Salamarket Toulouse</span>
            <span className="mx-1.5 text-white/40">·</span>
            <span>Retrait au 8 av. Larrieu-Thibaud</span>
          </span>
        </div>

        {/* StaffBanner — intégré dans le hero pour partage du bg sapin */}
        <StaffBanner />

        <div ref={sentinelRef} aria-hidden className="h-px" />
      </section>

      {/* COMPACT — sapin gradient sticky top, fade-in via IntersectionObserver */}
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-[#0E3B2E] to-[#082A20] text-white border-b border-white/10 shadow-md transition-opacity duration-200",
          showCompact ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
        style={{ paddingTop: "env(safe-area-inset-top)" }}
        aria-hidden={!showCompact}
      >
        <div className="px-6 h-14 flex items-center gap-2">
          {compactSearchOpen ? (
            <>
              <button
                type="button"
                onClick={() => setCompactSearchOpen(false)}
                aria-label="Fermer la recherche"
                className="w-10 h-10 -ml-2 rounded-full hover:bg-white/10 flex items-center justify-center text-white active:scale-90 transition-transform shrink-0"
              >
                <ArrowLeft size={20} aria-hidden />
              </button>
              <div className="relative flex-1">
                <Search
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#0E3B2E] pointer-events-none"
                  aria-hidden
                />
                <input
                  autoFocus
                  type="text"
                  value={searchValue}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Rechercher..."
                  aria-label="Rechercher un produit"
                  className="w-full h-10 rounded-full bg-white border border-transparent pl-10 pr-10 text-sm placeholder:text-muted/65 text-text focus:outline-none focus:border-[#C9A227] focus:ring-2 focus:ring-[#C9A227]/30 transition-all"
                  inputMode="search"
                  enterKeyHint="search"
                />
                {searchValue && (
                  <button
                    type="button"
                    onClick={() => onSearchChange("")}
                    aria-label="Effacer la recherche"
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full hover:bg-bg flex items-center justify-center text-muted active:scale-90 transition-transform"
                  >
                    <X size={14} aria-hidden />
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <Link to="/" aria-label="Salamarket Drive — accueil">
                <BrandLogo size="sm" />
              </Link>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => setCompactSearchOpen(true)}
                aria-label="Rechercher"
                className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-white active:scale-90 transition-transform shrink-0"
              >
                <Search size={20} aria-hidden />
              </button>
              {/* Cart icon md+ dans le compact bar */}
              <Link
                to="/panier"
                aria-label={
                  cartCount > 0
                    ? `Voir le panier (${cartCount} article${cartCount > 1 ? "s" : ""})`
                    : "Voir le panier"
                }
                className="hidden md:flex relative w-10 h-10 rounded-full hover:bg-white/10 items-center justify-center text-white active:scale-95 transition-all shrink-0"
              >
                <ShoppingBag size={20} aria-hidden />
                {cartCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#C9A227] text-[#0E3B2E] text-[10px] font-bold flex items-center justify-center border-2 border-[#0E3B2E] shadow-sm">
                    {cartCount > 9 ? "9+" : cartCount}
                  </span>
                )}
              </Link>
              <HeaderUserMenu />
            </>
          )}
        </div>
      </header>
    </>
  );
};

export default Header;
