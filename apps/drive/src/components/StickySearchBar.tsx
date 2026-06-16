import { Search, X } from "lucide-react";
import { useStickySearch } from "@/hooks/useStickySearch";
import { useCartCount } from "@/hooks/useCartSummary";

// ─────────────────────────────────────────────────────────────────
// StickySearchBar — mini-barre de recherche d'appoint (mobile).
//
// Apparaît en bas d'écran quand on scrolle VERS LE HAUT dans le
// catalogue (useStickySearch) et s'efface vers le bas, pour re-chercher
// sans remonter au Header. Elle réutilise l'onSearchChange d'Index : la
// saisie filtre la grille via le même debounce, aucune logique dupliquée.
//
// Positionnée en bas (au-dessus de la BottomNav) pour ne JAMAIS
// chevaucher le Header compact sticky (qui occupe le haut). On la masque
// quand le panier n'est pas vide : le StickyCartCTA occupe alors ce slot
// bas et on ne veut pas empiler deux barres (règle UX du projet).
// Respecte les safe-areas iOS. md:hidden — desktop a le Header complet.
// ─────────────────────────────────────────────────────────────────

interface Props {
  value: string;
  onSearchChange: (value: string) => void;
}

export const StickySearchBar = ({ value, onSearchChange }: Props) => {
  const visible = useStickySearch();
  const cartCount = useCartCount();

  // Panier non vide → le StickyCartCTA tient ce slot bas. On s'efface.
  if (cartCount > 0) return null;

  return (
    <div
      className={
        "fixed left-0 right-0 z-30 px-3 md:hidden transition-all duration-200 " +
        (visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-3 pointer-events-none")
      }
      // Juste au-dessus de la BottomNav (~56px) + safe-area + petit offset,
      // comme le StickyCartCTA pour rester aligné.
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 56px + 8px)" }}
      aria-hidden={!visible}
    >
      <div className="relative max-w-2xl mx-auto">
        <Search
          size={18}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-[#0E3B2E] pointer-events-none"
          aria-hidden
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Rechercher dans le catalogue..."
          aria-label="Rechercher un produit"
          tabIndex={visible ? 0 : -1}
          className="w-full h-12 rounded-full bg-white border border-[#0E3B2E]/10 pl-11 pr-11 text-[15px] placeholder:text-muted/65 text-text shadow-xl shadow-[#082A20]/25 focus:outline-none focus:border-[#C9A227] focus:ring-2 focus:ring-[#C9A227]/30 transition-all"
          inputMode="search"
          enterKeyHint="search"
        />
        {value && (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Effacer la recherche"
            tabIndex={visible ? 0 : -1}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full hover:bg-[#FAF7EE] flex items-center justify-center text-muted active:scale-90 transition-transform"
          >
            <X size={16} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
};

export default StickySearchBar;
