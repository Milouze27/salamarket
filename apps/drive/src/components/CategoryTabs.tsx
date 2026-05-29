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

// Nav rayons — pagination éditoriale "03 / Nos rayons" en header, scroll
// horizontal des chips sous-jacent. Sticky sur fond crème, hairline gold
// sous la chip active. Registre supermarché pro (lisible, balayage
// rapide) sans pills SaaS génériques.
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

        <div
          ref={trackRef}
          className="flex items-center gap-1.5 md:gap-3 overflow-x-auto scrollbar-none -mx-6 md:mx-0 px-6 md:px-0 py-3.5"
          style={{ scrollbarWidth: "none" }}
        >
          {ITEMS.map((item) => {
            const isActive = active === item.slug;
            return (
              <button
                key={item.slug}
                ref={isActive ? activeBtnRef : undefined}
                type="button"
                onClick={() => onChange(item.slug)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative shrink-0 px-3.5 md:px-4 py-1.5 text-[13px] md:text-[14px] font-semibold whitespace-nowrap transition-colors rounded-md",
                  isActive
                    ? "text-[#0E3B2E]"
                    : "text-[#0F1A14]/55 hover:text-[#0E3B2E]",
                )}
              >
                <span className="relative z-10">{item.name}</span>
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute left-3.5 right-3.5 md:left-4 md:right-4 -bottom-[1px] h-[2.5px] bg-[#C9A227] rounded-full"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default CategoryTabs;
