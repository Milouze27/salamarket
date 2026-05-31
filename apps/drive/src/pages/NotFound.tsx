import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Compass, Home, ShoppingBag } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="min-h-dvh bg-[#FAF7EE] flex flex-col">
      <AppHeader showBack title="Page introuvable" />

      <div className="mx-auto w-full max-w-[460px] flex-1 flex flex-col">
        {/* Header gradient sapin — cohérent avec /v2 Stock */}
        <header className="bg-gradient-to-br from-[#0E3B2E] via-[#0E3B2E] to-[#082A20] rounded-b-[28px] px-6 pt-10 pb-12 text-[#FAF7EE]">
          <p className="text-[10px] uppercase tracking-[0.32em] font-bold text-[#C9A227]">
            404 · introuvable
          </p>
          <h1 className="mt-3 text-[34px] sm:text-[40px] leading-[1.05] font-extrabold tracking-[-0.03em] text-[#FAF7EE]">
            Cette page n&apos;existe pas
          </h1>
          <p className="mt-3 text-[14.5px] leading-[1.55] text-[#FAF7EE]/75 max-w-[38ch]">
            L&apos;adresse a peut&#8209;être changé, ou ce produit n&apos;est plus au
            catalogue. Reprenons les courses sereinement.
          </p>
        </header>

        {/* Cards actions sur fond crème */}
        <div className="flex-1 px-5 pt-7 pb-10 space-y-3">
          <Link
            to="/"
            className="bg-white rounded-2xl shadow-[0_8px_24px_-12px_rgba(8,42,32,0.18)] border border-[#0E3B2E]/10 p-4 flex items-center gap-4 active:scale-[0.99] transition-transform"
          >
            <span className="w-11 h-11 rounded-xl bg-[#0E3B2E] text-white flex items-center justify-center shrink-0">
              <Home className="w-5 h-5" aria-hidden />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-bold text-[#0E3B2E]">
                Retour au catalogue
              </p>
              <p className="text-[12px] text-[#0F1A14]/60 mt-0.5">
                Tous les produits frais Salamarket
              </p>
            </div>
          </Link>

          <Link
            to="/panier"
            className="bg-white rounded-2xl shadow-[0_8px_24px_-12px_rgba(8,42,32,0.18)] border border-[#0E3B2E]/10 p-4 flex items-center gap-4 active:scale-[0.99] transition-transform"
          >
            <span className="w-11 h-11 rounded-xl bg-[#C9A227]/20 text-[#0E3B2E] flex items-center justify-center shrink-0">
              <ShoppingBag className="w-5 h-5" aria-hidden />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-bold text-[#0E3B2E]">
                Voir mon panier
              </p>
              <p className="text-[12px] text-[#0F1A14]/60 mt-0.5">
                Reprendre ma commande en cours
              </p>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-full bg-white rounded-2xl shadow-[0_8px_24px_-12px_rgba(8,42,32,0.18)] border border-[#0E3B2E]/10 p-4 flex items-center gap-4 active:scale-[0.99] transition-transform text-left"
          >
            <span className="w-11 h-11 rounded-xl bg-[#FAF7EE] border border-[#0E3B2E]/10 text-[#0E3B2E] flex items-center justify-center shrink-0">
              <Compass className="w-5 h-5" aria-hidden />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-bold text-[#0E3B2E]">
                Page précédente
              </p>
              <p className="text-[12px] text-[#0F1A14]/60 mt-0.5">
                Revenir d&apos;où je viens
              </p>
            </div>
          </button>

          <p className="text-[11px] text-[#0F1A14]/45 text-center pt-5">
            Salamarket Drive · supermarché halal Toulouse
          </p>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
