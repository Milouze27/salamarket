import { Link } from "react-router-dom";
import { Sprout, ShieldCheck, Store, ChevronRight, QrCode } from "lucide-react";
import { useLatestLotsByProduct } from "@/hooks/useDlcBatch";

// ─────────────────────────────────────────────────────────────────
// TracabiliteFrise — frise animée du parcours viande halal :
//   Ferme  →  Abattoir certifié  →  Rayon
//
// Affichée sur la PDP pour les produits boucherie/charcuterie. Lit le
// dernier lot du produit via le batch partagé (useLatestLotsByProduct,
// une requete `produits_lots` dedupliquee). Le nom du certificateur, s'il
// existe, enrichit l'etape "Abattoir certifie". Si un lot existe, la frise
// draine vers /lot/{id} (page de tracabilite publique).
//
// Fallback gracieux : pas de lot trouve (ou table absente / encore en
// chargement) → on rend quand meme la frise generique non cliquable. On ne
// fabrique jamais un faux lien de preuve (meme regle que HalalBadgeLink).
//
// Charte : sapin / or / creme, pas de hex hors palette brand.ts.
// ─────────────────────────────────────────────────────────────────

interface Props {
  productId: string;
  /** Le produit est-il une viande certifiable (boucherie / charcuterie) ? */
  isCertifiable: boolean;
  className?: string;
}

interface Etape {
  icon: React.ReactNode;
  titre: string;
  sous_titre: string;
}

export const TracabiliteFrise = ({
  productId,
  isCertifiable,
  className,
}: Props) => {
  const { data } = useLatestLotsByProduct();
  if (!isCertifiable) return null;

  const lot = data?.get(productId) ?? null;
  const certifier = lot?.certifier_name?.trim() || null;

  const etapes: Etape[] = [
    {
      icon: <Sprout size={18} aria-hidden />,
      titre: "Ferme",
      sous_titre: "Élevage sélectionné",
    },
    {
      icon: <ShieldCheck size={18} aria-hidden />,
      titre: "Abattoir certifié",
      sous_titre: certifier ? `Certifié ${certifier}` : "Rituel halal contrôlé",
    },
    {
      icon: <Store size={18} aria-hidden />,
      titre: "Rayon",
      sous_titre: "Salamarket Toulouse",
    },
  ];

  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] font-bold text-[#8B6F0E]">
          <QrCode size={12} className="text-[#C9A227]" aria-hidden />
          Traçabilité
        </span>
        {lot && (
          <span className="shrink-0 inline-flex items-center gap-1 text-[12px] font-bold text-[#0E3B2E] underline underline-offset-2">
            Voir le lot
            <ChevronRight size={13} aria-hidden />
          </span>
        )}
      </div>

      {/* Frise : 3 etapes reliees par un trait. Anti-overflow : chaque
          colonne min-w-0, les libelles tronques sur 1 ligne. Animation
          d'entree sequencee (slide+fade), respectueuse de reduce-motion
          via les classes animate-in (Tailwind) deja utilisees dans l'app. */}
      <ol className="mt-4 flex items-stretch gap-1.5">
        {etapes.map((e, i) => (
          <li
            key={e.titre}
            className="flex-1 min-w-0 flex flex-col items-center text-center animate-in fade-in slide-in-from-bottom-2 duration-500 [animation-fill-mode:backwards]"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <div className="relative w-full flex items-center justify-center">
              {/* Trait gauche (sauf 1re etape) */}
              {i > 0 && (
                <span
                  aria-hidden
                  className="absolute left-0 right-1/2 top-1/2 -translate-y-1/2 h-[2px] bg-gradient-to-r from-[#C9A227]/20 to-[#C9A227]/55"
                />
              )}
              {/* Trait droit (sauf derniere etape) */}
              {i < etapes.length - 1 && (
                <span
                  aria-hidden
                  className="absolute left-1/2 right-0 top-1/2 -translate-y-1/2 h-[2px] bg-gradient-to-r from-[#C9A227]/55 to-[#C9A227]/20"
                />
              )}
              <span className="relative z-10 w-10 h-10 rounded-full bg-white text-[#0E3B2E] flex items-center justify-center shadow-sm ring-1 ring-[#C9A227]/35">
                {e.icon}
              </span>
            </div>
            <span className="mt-2 text-[12px] font-extrabold text-[#0E3B2E] leading-tight truncate max-w-full">
              {e.titre}
            </span>
            <span className="mt-0.5 text-[10.5px] text-[#3E2E0A]/65 leading-tight line-clamp-2">
              {e.sous_titre}
            </span>
          </li>
        ))}
      </ol>
    </>
  );

  const base =
    "block rounded-3xl border border-[#C9A227]/40 bg-[#FBF6E2] p-4 md:p-5";

  if (lot) {
    return (
      <Link
        to={`/lot/${lot.id}`}
        className={`${base} active:scale-[0.99] transition-transform hover:border-[#C9A227]/70 ${className ?? ""}`}
        aria-label="Ouvrir la traçabilité du lot de ce produit"
      >
        {inner}
      </Link>
    );
  }

  return (
    <div
      className={`${base} ${className ?? ""}`}
      aria-label="Parcours de traçabilité halal de ce produit"
    >
      {inner}
    </div>
  );
};

export default TracabiliteFrise;
