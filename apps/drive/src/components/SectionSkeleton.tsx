import { ProductCardSkeleton } from "@/components/ProductCardSkeleton";

// ─────────────────────────────────────────────────────────────────
// SectionSkeleton — placeholder shimmer pour un carrousel vitrine.
//
// Réutilise ProductCardSkeleton (donc la classe animate-skeleton-shimmer
// déjà définie en tailwind) et reprend AU PIXEL la grammaire des rayons
// d'accueil (RecentlyViewed / SelectionSaison) : en-tête typo + rangée de
// cartes en scroll horizontal mobile / grille desktop. Objectif : zéro
// layout-shift au remplacement skeleton → contenu réel, et un chargement
// soigné plutôt qu'un vide pendant useProducts.
//
// Additif : ne lit aucune donnée, purement présentationnel. Pas de picto
// décoratif — un bloc shimmer tient lieu d'eyebrow/titre.
// ─────────────────────────────────────────────────────────────────

const SHIMMER =
  "bg-[linear-gradient(90deg,#E8E4D8_0%,#F2F2EE_50%,#E8E4D8_100%)] bg-[length:200%_100%] animate-skeleton-shimmer";

interface Props {
  /** Nombre de cartes placeholder (défaut 6, comme un carrousel plein). */
  count?: number;
  /** Marges verticales — alignées sur les sections d'accueil. */
  className?: string;
}

export const SectionSkeleton = ({ count = 6, className }: Props) => (
  <section
    aria-hidden
    className={`max-w-7xl mx-auto px-6 md:px-8 ${className ?? "mt-8 md:mt-10"}`}
  >
    {/* En-tête : voile eyebrow + titre, mêmes hauteurs que les vrais
        carrousels (eyebrow ~10px, titre ~20-26px). */}
    <div className="mb-5 md:mb-6 flex flex-col gap-2">
      <div className={`h-2.5 w-32 rounded ${SHIMMER}`} />
      <div className={`h-6 w-44 md:h-7 md:w-56 rounded-md ${SHIMMER}`} />
    </div>

    {/* Rangée de cartes — même flex/grid + largeurs que RecentlyViewed /
        SelectionSaison pour un swap sans saut. overflow-hidden : les
        cartes hors-écran ne créent pas de scrollbar parasite. */}
    <ul className="flex md:grid md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-6 -mx-6 md:mx-0 px-6 md:px-0 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <li
          key={i}
          className="shrink-0 w-[42%] sm:w-[30%] md:w-auto"
        >
          <ProductCardSkeleton />
        </li>
      ))}
    </ul>
  </section>
);

export default SectionSkeleton;
