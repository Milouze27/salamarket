import { Link } from "react-router-dom";
import { BRAND, formatStoreLocation } from "@/config/brand";

/**
 * Footer global — affiché sur les pages utilitaires (légal, compte, etc.).
 * NB : la Home (Index.tsx) garde son propre footer éditorial "poster"
 * (display massif + ligne légale courte). Ce Footer est la version
 * structurée avec navigation légale, pour les pages où l'on a besoin
 * de l'accessibilité des liens Mentions / CGV / Confidentialité.
 */
export const Footer = () => {
  return (
    <footer className="bg-[#082A20] text-[#FAF7EE] mt-16">
      <div className="max-w-7xl mx-auto px-6 md:px-8 py-12 md:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-10 md:gap-12">
          {/* Bloc marque */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.32em] font-bold text-[#C9A227] mb-3">
              Salamarket
            </p>
            <p className="text-[14px] leading-[1.6] text-[#FAF7EE]/75 max-w-xs">
              Drive halal indépendant à Toulouse. K &amp; A FOOD —
              {" "}{BRAND.store.address}, {BRAND.store.postalCode} {BRAND.store.city}.
            </p>
          </div>

          {/* Horaires magasin */}
          <div>
            <p className="text-[10px] uppercase tracking-[0.32em] font-bold text-[#FAF7EE]/80 mb-3">
              Horaires retrait
            </p>
            <ul className="space-y-1.5 text-[14px] text-[#FAF7EE]/75">
              {BRAND.store.hours.map((h) => (
                <li key={h.days} className="flex justify-between gap-4 max-w-[260px]">
                  <span>{h.days}</span>
                  <span className="tabular-nums text-[#FAF7EE]/90">{h.time}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Légal */}
          <nav aria-label="Liens légaux">
            <p className="text-[10px] uppercase tracking-[0.32em] font-bold text-[#FAF7EE]/80 mb-3">
              Légal
            </p>
            <ul className="space-y-2 text-[14px]">
              <li>
                <Link
                  to="/a-propos"
                  className="text-[#FAF7EE]/85 hover:text-[#C9A227] transition-colors underline-offset-2 hover:underline"
                >
                  À propos
                </Link>
              </li>
              <li>
                <Link
                  to="/mentions-legales"
                  className="text-[#FAF7EE]/85 hover:text-[#C9A227] transition-colors underline-offset-2 hover:underline"
                >
                  Mentions légales
                </Link>
              </li>
              <li>
                <Link
                  to="/cgv"
                  className="text-[#FAF7EE]/85 hover:text-[#C9A227] transition-colors underline-offset-2 hover:underline"
                >
                  CGV
                </Link>
              </li>
              <li>
                <Link
                  to="/confidentialite"
                  className="text-[#FAF7EE]/85 hover:text-[#C9A227] transition-colors underline-offset-2 hover:underline"
                >
                  Politique de confidentialité
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-12 pt-6 border-t border-[#FAF7EE]/15 flex flex-wrap justify-between gap-x-6 gap-y-2 text-[12px] text-[#FAF7EE]/55">
          <span>
            © {new Date().getFullYear()} K &amp; A FOOD · {formatStoreLocation(BRAND.store)}
          </span>
          <span className="tabular-nums">SIRET 802 773 812</span>
        </div>
      </div>
    </footer>
  );
};
