import { useNavigate, useLocation } from "react-router-dom";
import { ShoppingCart, ArrowRight } from "lucide-react";
import { useCartCount, useCartTotalCents } from "@/hooks/useCartSummary";
import { formatPrice } from "@/lib/format";

// CTA panier flottant en bas — pattern Frichti / Picard / Carrefour Drive.
// Apparaît dès qu'on a 1 item dans le panier, sauf sur les routes où on
// est déjà dans le flow d'achat (panier, créneaux, paiement, confirmation)
// ou sur des dashboards non-client.
const HIDDEN_PREFIXES = [
  "/panier",
  "/paiement",
  "/creneaux",
  "/commande/confirmee",
  "/connexion",
  "/inscription",
  "/admin",
  "/employe",
  // ProductDetail a déjà un CTA fixed "Ajouter au panier" — éviter le
  // stacking visuel à 3 bandes en bas (add-to-cart + sticky + bottom nav).
  // Le badge sur le BottomNav suffit à informer du nb d'items en cours.
  "/produit/",
];

export const StickyCartCTA = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const cartCount = useCartCount();
  const totalCents = useCartTotalCents();

  if (cartCount === 0) return null;
  if (HIDDEN_PREFIXES.some((p) => location.pathname.startsWith(p))) return null;

  // Position : juste au-dessus du BottomNav (qui mesure ~56px + safe-area).
  // On ajoute calc(env(safe-area-inset-bottom) + 56px) pour être collé.
  // z-45 (entre nav z-40 et compact header z-50) pour passer au-dessus
  // du CategoryTabs sticky qui est en z-40 — sinon la border-bottom des
  // catégories peut visuellement chevaucher le CTA quand ils se touchent.
  return (
    <div
      className="fixed left-0 right-0 z-[45] px-3 pointer-events-none md:hidden"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 56px + 8px)" }}
    >
      <button
        type="button"
        onClick={() => navigate("/panier")}
        className="pointer-events-auto group w-full max-w-2xl mx-auto flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-gradient-to-r from-[#0E3B2E] to-[#082A20] text-white shadow-xl shadow-[#0E3B2E]/30 active:scale-[0.99] transition-all animate-in slide-in-from-bottom-2 fade-in duration-300"
        aria-label={`Voir le panier — ${cartCount} article${cartCount > 1 ? "s" : ""}, total ${formatPrice(totalCents)}`}
      >
        <span className="flex items-center gap-3">
          <span className="relative w-9 h-9 rounded-full bg-[#C9A227] flex items-center justify-center shrink-0">
            <ShoppingCart size={18} className="text-[#0E3B2E]" strokeWidth={2.5} aria-hidden />
            <span className="absolute -top-1 -right-1 bg-white text-[#0E3B2E] text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center border-2 border-[#0E3B2E]">
              {cartCount > 9 ? "9+" : cartCount}
            </span>
          </span>
          <span className="text-left">
            <span className="block text-xs text-white/70 leading-none">
              Mon panier
            </span>
            <span className="block text-base font-bold tabular-nums leading-tight mt-0.5">
              {formatPrice(totalCents)}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-1 text-sm font-semibold text-[#C9A227]">
          Voir
          <ArrowRight
            size={16}
            className="transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </span>
      </button>
    </div>
  );
};
