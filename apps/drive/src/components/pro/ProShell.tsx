// Shell visuel Drive Pro : header brand sapin + accent or + slot nav.
// Visuellement cohérent avec la palette Salamarket (sapin #0E3B2E / or
// #C9A227 via tokens) tout en restant distinct du AppHeader Particulier
// via la nav tabs.

import { Link, useLocation, useNavigate } from "react-router-dom";
import { ReactNode } from "react";
import { ArrowLeft, LogOut, ShoppingBag } from "lucide-react";
import { useProCartStore } from "@/stores/proCart";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  title?: string;
  showBack?: boolean;
  showCart?: boolean;
  children: ReactNode;
}

const NAV_ITEMS: { to: string; label: string }[] = [
  { to: "/pro/catalogue", label: "Catalogue" },
  { to: "/pro/commandes", label: "Mes commandes" },
  { to: "/pro/factures", label: "Factures" },
  { to: "/pro/compte", label: "Mon compte" },
];

export const ProShell = ({
  title,
  showBack = false,
  showCart = true,
  children,
}: Props) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuth();
  const count = useProCartStore((s) =>
    s.items.reduce((sum, i) => sum + i.quantite_conditionnements, 0),
  );

  const goBack = () => {
    if (location.key !== "default") navigate(-1);
    else navigate("/pro/catalogue");
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/pro/login", { replace: true });
  };

  return (
    <div className="min-h-dvh bg-cream flex flex-col">
      <header
        className="sticky top-0 z-40 bg-sapin text-white border-b border-gold/30"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {showBack && (
              <button
                onClick={goBack}
                aria-label="Retour"
                className="w-9 h-9 -ml-2 rounded-full hover:bg-white/10 flex items-center justify-center active:scale-95 transition-transform"
              >
                <ArrowLeft size={20} aria-hidden />
              </button>
            )}
            <Link
              to="/pro/catalogue"
              className="flex items-center gap-2 min-w-0"
            >
              <span className="text-xs uppercase tracking-widest text-gold-bright font-semibold">
                Drive Pro
              </span>
              {title && (
                <>
                  <span className="opacity-30">·</span>
                  <h1 className="font-semibold text-sm truncate">{title}</h1>
                </>
              )}
            </Link>
          </div>
          <div className="flex items-center gap-1">
            {showCart && (
              <button
                onClick={() => navigate("/pro/panier")}
                aria-label={`Voir le panier${count > 0 ? ` (${count})` : ""}`}
                className="relative w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center active:scale-95 transition-transform"
              >
                <ShoppingBag size={20} aria-hidden />
                {count > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-sapin text-[10px] font-bold flex items-center justify-center border border-sapin">
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </button>
            )}
            {user && (
              <button
                onClick={handleSignOut}
                aria-label="Se déconnecter"
                className="w-9 h-9 rounded-full hover:bg-white/10 flex items-center justify-center active:scale-95 transition-transform"
              >
                <LogOut size={18} aria-hidden />
              </button>
            )}
          </div>
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? "border-gold-bright text-gold-bright"
                    : "border-transparent text-white/70 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
};
