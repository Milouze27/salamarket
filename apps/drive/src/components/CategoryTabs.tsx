import { useEffect, useRef } from "react";
import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";

interface Props {
  active: string;
  onChange: (slug: string) => void;
}

const ITEMS = [
  { slug: "all", name: "Tout" },
  ...BRAND.categories.map(({ slug, name }) => ({ slug, name })),
];

// Helper — preference for View Transitions if browser supports it. Wraps a
// state update so the underline glides FLIP-style. Graceful degradation =
// the underline just snaps (still works, no error).
function withViewTransition(fn: () => void) {
  // @ts-expect-error - startViewTransition is not yet in lib.dom for all TS versions
  if (typeof document !== "undefined" && document.startViewTransition) {
    // @ts-expect-error - same
    document.startViewTransition(fn);
  } else {
    fn();
  }
}

// Nav rayons — rail éditorial typographique. Numérotation tabulaire or +
// label uppercase tracking large. Pas de fond pill (transparent), seul
// l'item actif porte une bordure or qui glisse FLIP via View Transitions.
// Scroll horizontal snap, fade gradient sur les bords.
export const CategoryTabs = ({ active, onChange }: Props) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const activeBtnRef = useRef<HTMLButtonElement>(null);

  // Auto-scroll horizontal pour amener l'item actif dans la zone visible.
  useEffect(() => {
    const btn = activeBtnRef.current;
    const track = trackRef.current;
    if (!btn || !track) return;
    const btnLeft = btn.offsetLeft;
    const btnRight = btnLeft + btn.offsetWidth;
    const viewLeft = track.scrollLeft;
    const viewRight = viewLeft + track.clientWidth;
    if (btnLeft < viewLeft || btnRight > viewRight) {
      track.scrollTo({
        left: btnLeft - 24,
        behavior: "smooth",
      });
    }
  }, [active]);

  const handleSelect = (slug: string) => {
    withViewTransition(() => onChange(slug));
  };

  return (
    <nav
      id="nos-rayons"
      aria-label="Filtrer par rayon"
      className="sticky z-40 bg-[#FAF7EE]/95 backdrop-blur-md border-b border-[#0E3B2E]/12"
      style={{ top: "calc(env(safe-area-inset-top) + 3.5rem)" }}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-8">
        {/* Pagination "03" + label — visible desktop, sobre sur mobile */}
        <div className="hidden md:flex items-end gap-4 pt-9 pb-5">
          <span className="text-[26px] font-extrabold text-[#C9A227] tabular-nums leading-none tracking-[-0.04em]">
            03
          </span>
          <span aria-hidden className="h-px flex-1 max-w-[80px] bg-[#0E3B2E]/25 mb-2" />
          <span className="text-[10px] uppercase tracking-[0.32em] font-bold text-[#0E3B2E] mb-1.5">
            Nos rayons
          </span>
          <span aria-hidden className="flex-1 h-px bg-[#0E3B2E]/12 mb-2" />
        </div>

        {/* Wrapper avec fade edges */}
        <div className="relative -mx-6 md:mx-0">
          {/* Fade gauche */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 md:w-4 z-10 bg-gradient-to-r from-[#FAF7EE] to-transparent"
          />
          {/* Fade droite */}
          <div
            aria-hidden
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 md:w-4 z-10 bg-gradient-to-l from-[#FAF7EE] to-transparent"
          />

          <div
            ref={trackRef}
            className="flex items-stretch gap-5 md:gap-7 overflow-x-auto scrollbar-none px-6 md:px-2 py-2 snap-x snap-mandatory"
            style={{ scrollbarWidth: "none" }}
          >
            {ITEMS.map((item, idx) => {
              const isActive = active === item.slug;
              // Numbering: "01" onwards (Tout = "00")
              const num = String(idx).padStart(2, "0");
              return (
                <button
                  key={item.slug}
                  ref={isActive ? activeBtnRef : undefined}
                  type="button"
                  onClick={() => handleSelect(item.slug)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    // min-h-[44px] sur mobile pour respecter Apple HIG.
                    // Sur desktop on garde le compact (md:min-h-0).
                    "group relative shrink-0 snap-start flex items-center gap-2 min-h-[44px] md:min-h-0 py-2 px-1 border-b-2 transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A227]/40 rounded-sm",
                    isActive
                      ? "border-[#C9A227]"
                      : "border-transparent hover:border-[#C9A227]/40",
                  )}
                  style={
                    isActive
                      ? { viewTransitionName: "category-underline" }
                      : undefined
                  }
                >
                  <span
                    className={cn(
                      "text-[10px] font-bold tabular-nums transition-colors",
                      isActive
                        ? "text-[#C9A227]"
                        : "text-[#C9A227]/60 group-hover:text-[#C9A227]",
                    )}
                  >
                    {num}
                  </span>
                  <span
                    className={cn(
                      "text-[12px] md:text-[13px] font-semibold uppercase tracking-[0.18em] transition-colors",
                      isActive
                        ? "text-[#0E3B2E]"
                        : "text-[#0F1A14]/55 group-hover:text-[#0E3B2E]",
                    )}
                  >
                    {item.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default CategoryTabs;
