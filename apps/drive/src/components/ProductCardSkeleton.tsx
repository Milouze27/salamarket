// Shimmer custom (gradient horizontal qui défile). Aligné AU PIXEL sur la
// structure de ProductCard (aspect-square + bloc info px-1 pt-3.5 pb-1 :
// titre 2 lignes min-h-[2.5em], prix, meta) pour zéro layout-shift au
// remplacement skeleton → carte réelle.
const SHIMMER_BG =
  "bg-[linear-gradient(90deg,#E8E4D8_0%,#F2F2EE_50%,#E8E4D8_100%)] bg-[length:200%_100%] animate-skeleton-shimmer";

export const ProductCardSkeleton = () => (
  <div className="flex flex-col" aria-hidden>
    <div className={`aspect-square w-full rounded-3xl ${SHIMMER_BG}`} />
    <div className="flex flex-col gap-1 px-1 pt-3.5 pb-1">
      {/* Titre — réserve la même hauteur que h3 line-clamp-2 (min-h-[2.5em]) */}
      <div className="min-h-[2.5em] flex flex-col gap-1.5">
        <div className={`h-3.5 w-[85%] rounded ${SHIMMER_BG}`} />
        <div className={`h-3.5 w-3/5 rounded ${SHIMMER_BG}`} />
      </div>
      <div className="mt-1 flex flex-col gap-1">
        <div className={`h-4 w-2/5 rounded ${SHIMMER_BG}`} />
        <div className={`h-2.5 w-1/3 rounded ${SHIMMER_BG}`} />
      </div>
    </div>
  </div>
);
