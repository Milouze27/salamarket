import {
  Apple,
  Beef,
  Cookie,
  Croissant,
  Drumstick,
  Fish,
  GlassWater,
  Leaf,
  Milk,
  Package,
  Wheat,
} from "lucide-react";

export const isPlaceholderUrl = (url?: string | null) =>
  !url || url.includes("placehold.co") || url.includes("placeholder.com");

const map: Record<
  string,
  { Icon: typeof Beef; gradient: string; accent: string; label: string }
> = {
  boucherie:    { Icon: Beef,       gradient: "from-[#7A1F1A] to-[#3D0F0C]", accent: "#F5C77E", label: "Boucherie" },
  charcuterie:  { Icon: Drumstick,  gradient: "from-[#A23E2A] to-[#4F1A12]", accent: "#F5C77E", label: "Charcuterie" },
  poissonnerie: { Icon: Fish,       gradient: "from-[#1E5F7A] to-[#0C2E3D]", accent: "#7FD4E8", label: "Poissonnerie" },
  fruits:       { Icon: Apple,      gradient: "from-[#9C4221] to-[#4A1C0E]", accent: "#FFD89B", label: "Fruits" },
  legumes:      { Icon: Leaf,       gradient: "from-[#2D5F2F] to-[#0F2D11]", accent: "#A8D89B", label: "Légumes" },
  cremerie:     { Icon: Milk,       gradient: "from-[#F1E5C8] to-[#C9A864]", accent: "#3E2E0A", label: "Crémerie" },
  epicerie:     { Icon: Wheat,      gradient: "from-[#8B6F3D] to-[#3D2F18]", accent: "#F5C77E", label: "Épicerie" },
  patisserie:   { Icon: Croissant,  gradient: "from-[#C9892F] to-[#5A3D14]", accent: "#FFE9C4", label: "Pâtisserie" },
  biscuiterie:  { Icon: Cookie,     gradient: "from-[#A8772E] to-[#4D330C]", accent: "#FFE9C4", label: "Biscuiterie" },
  boissons:     { Icon: GlassWater, gradient: "from-[#1A5F4A] to-[#0A2E22]", accent: "#A8E8C9", label: "Boissons" },
};
const fallback = { Icon: Package, gradient: "from-[#0E3B2E] to-[#082A20]", accent: "#C9A227", label: "Salamarket" };

interface Props {
  category?: string | null;
  size?: "sm" | "md" | "lg";
}

export const ProductImageFallback = ({ category, size = "md" }: Props) => {
  const fb = (category && map[category]) || fallback;
  const iconSize = size === "sm" ? 40 : size === "lg" ? 96 : 64;
  const labelSize = size === "sm" ? "text-[9px]" : size === "lg" ? "text-[12px]" : "text-[10px]";
  return (
    <div
      className={`relative w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-br ${fb.gradient} overflow-hidden`}
      aria-hidden
    >
      <div
        className="absolute inset-0 opacity-[0.08] mix-blend-overlay"
        style={{
          backgroundImage:
            "radial-gradient(circle at 30% 20%, white 1px, transparent 1.5px), radial-gradient(circle at 70% 60%, white 1px, transparent 1.5px)",
          backgroundSize: "24px 24px, 32px 32px",
        }}
      />
      <fb.Icon
        size={iconSize}
        strokeWidth={1.3}
        style={{ color: fb.accent }}
        className="relative drop-shadow-[0_4px_12px_rgba(0,0,0,0.25)]"
        aria-hidden
      />
      <span
        className={`relative ${labelSize} uppercase tracking-[0.22em] font-bold max-w-[80%] truncate text-center`}
        style={{ color: fb.accent, opacity: 0.85 }}
      >
        {fb.label}
      </span>
    </div>
  );
};
