import { Link, NavLink, useNavigate } from "react-router-dom";
import { ArrowLeft, BookOpen, Factory, LineChart } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  title?: string;
}

const TABS = [
  { to: "/v2/labo/recettes", label: "Recettes", icon: BookOpen },
  { to: "/v2/labo/productions", label: "Productions", icon: Factory },
  { to: "/v2/labo/marges", label: "Marges", icon: LineChart },
];

/**
 * Shell pour toutes les pages /labo/*. Header sticky avec navigation
 * tabs, bouton retour vers le backoffice admin, et zone de contenu
 * scrollable. Mobile-first : tabs en bottom sur mobile (à venir) mais
 * pour l'instant top-only pour rester simple.
 */
export const LaboShell = ({ children, title }: Props) => {
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh bg-[#FAF7EE]">
      <header
        className="sticky top-0 z-30 bg-[#FAF7EE]/95 backdrop-blur-md border-b border-[#0E3B2E]/12"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => navigate("/v2/labo")}
              aria-label="Retour au labo"
              className="w-9 h-9 -ml-1 rounded-full hover:bg-white flex items-center justify-center text-[#0E3B2E] active:scale-90 transition-transform"
            >
              <ArrowLeft size={20} aria-hidden />
            </button>
            <h1 className="font-bold text-base sm:text-lg text-[#0E3B2E] tracking-tight truncate">
              Labo{" "}
              {title ? (
                <span className="font-normal text-[#0E3B2E]/70">· {title}</span>
              ) : null}
            </h1>
          </div>
          <Link
            to="/"
            className="text-xs text-[#0E3B2E]/70 hover:text-[#0E3B2E]"
            aria-label="Voir la boutique"
          >
            Boutique
          </Link>
        </div>
        <nav
          aria-label="Navigation labo"
          className="border-t border-[#0E3B2E]/8 bg-white"
        >
          <div className="max-w-6xl mx-auto px-2 sm:px-4 flex">
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  cn(
                    "flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 sm:px-5 py-3 text-sm font-medium border-b-2 transition-colors",
                    isActive
                      ? "border-[#0E3B2E] text-[#0E3B2E]"
                      : "border-transparent text-[#0E3B2E]/60 hover:text-[#0E3B2E]",
                  )
                }
              >
                <tab.icon size={16} aria-hidden />
                {tab.label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-24">
        {children}
      </main>
    </div>
  );
};
