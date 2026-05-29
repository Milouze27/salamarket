import { ShoppingBag, ArrowLeft } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { BRAND } from "@/config/brand";
import { useCartCount } from "@/hooks/useCartSummary";
import { HeaderUserMenu } from "@/components/HeaderUserMenu";

interface Props {
  showBack?: boolean;
  title?: string;
}

export const AppHeader = ({ showBack = false, title }: Props) => {
  const navigate = useNavigate();
  const location = useLocation();
  const count = useCartCount();

  // Back safe : navigate(-1) seulement si l'on a un historique SPA
  // (location.key !== "default"). Sinon (PWA installée ouverte direct
  // sur l'URL, deep-link, notif push), retour à l'accueil. window.
  // history.length n'est pas fiable en PWA.
  const goBack = () => {
    if (location.key !== "default") {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  return (
    <header
      className="sticky top-0 z-40 bg-[#FAF7EE]/95 backdrop-blur-md border-b border-[#0E3B2E]/12"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {showBack && (
            <button
              onClick={goBack}
              aria-label="Retour"
              className="w-10 h-10 -ml-2 rounded-full hover:bg-white flex items-center justify-center text-[#0E3B2E] active:scale-90 transition-transform"
            >
              <ArrowLeft size={22} aria-hidden />
            </button>
          )}
          {title ? (
            <h1 className="font-semibold text-base text-text truncate">
              {title}
            </h1>
          ) : (
            <h1 className="font-bold text-lg text-[#0E3B2E] tracking-tight truncate">
              {BRAND.name}
            </h1>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => navigate("/panier")}
            aria-label={
              count > 0
                ? `Voir le panier (${count} article${count > 1 ? "s" : ""})`
                : "Voir le panier"
            }
            className="relative w-10 h-10 rounded-full hover:bg-white flex items-center justify-center text-text active:scale-90 transition-transform"
          >
            <ShoppingBag size={22} aria-hidden />
            {count > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#C9A227] text-[#0E3B2E] text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-sm">
                {count > 9 ? "9+" : count}
              </span>
            )}
          </button>
          <HeaderUserMenu />
        </div>
      </div>
    </header>
  );
};
