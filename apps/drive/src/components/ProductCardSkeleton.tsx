// Shimmer custom (gradient horizontal qui défile). Aligné sur la nouvelle
// ProductCard photo-led (aspect-square, pricing Chronodrive sous l'image).
const SHIMMER_BG =
  "bg-[linear-gradient(90deg,#E8E4D8_0%,#F2F2EE_50%,#E8E4D8_100%)] bg-[length:200%_100%] animate-skeleton-shimmer";

export const ProductCardSkeleton = () => (
  <div className="flex flex-col">
    <div className={`aspect-square w-full rounded-3xl ${SHIMMER_BG}`} />
    <div className="flex flex-col gap-2 px-1 pt-3.5">
      <div className={`h-3.5 w-3/4 rounded ${SHIMMER_BG}`} />
      <div className={`h-3.5 w-2/3 rounded ${SHIMMER_BG}`} />
      <div className={`mt-1 h-4 w-2/5 rounded ${SHIMMER_BG}`} />
    </div>
  </div>
);
