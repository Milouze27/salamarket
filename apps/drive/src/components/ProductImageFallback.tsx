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
import { BRAND } from "@/config/brand";

export const isPlaceholderUrl = (url?: string | null) =>
  !url || url.includes("placehold.co") || url.includes("placeholder.com");

// Palette décorative par CATÉGORIE — uniquement pour le visuel de
// remplacement quand un produit n'a pas de photo. Ces teintes (rouge
// boucherie, bleu poissonnerie, vert légumes…) n'ont pas d'équivalent
// dans les tokens de marque BRAND.colors : ce sont des accents purement
// illustratifs, regroupés ici comme source unique locale. Le fallback
// générique, lui, réutilise les vrais tokens sapin/or de BRAND.colors.
const CATEGORY_PALETTE = {
  beefRedFrom:   "#7A1F1A", beefRedTo:   "#3D0F0C",
  charcFrom:     "#A23E2A", charcTo:     "#4F1A12",
  fishFrom:      "#1E5F7A", fishTo:      "#0C2E3D",
  fruitFrom:     "#9C4221", fruitTo:     "#4A1C0E",
  legumeFrom:    "#2D5F2F", legumeTo:    "#0F2D11",
  cremeFrom:     "#F1E5C8", cremeTo:     "#C9A864",
  epiceFrom:     "#8B6F3D", epiceTo:     "#3D2F18",
  patisFrom:     "#C9892F", patisTo:     "#5A3D14",
  biscuitFrom:   "#A8772E", biscuitTo:   "#4D330C",
  boissonFrom:   "#1A5F4A", boissonTo:   "#0A2E22",
  goldIcon:      "#F5C77E",
  blueIcon:      "#7FD4E8",
  peachIcon:     "#FFD89B",
  greenIcon:     "#A8D89B",
  darkIcon:      "#3E2E0A",
  creamIcon:     "#FFE9C4",
  mintIcon:      "#A8E8C9",
} as const;

// Les gradients sont posés en CSS inline (linear-gradient 135deg = to-br)
// plutôt qu'en classes Tailwind `from-[#…] to-[#…]` : le JIT Tailwind ne
// peut pas générer des classes construites dynamiquement à partir de
// variables, donc on évite toute classe arbitraire interpolée.
const map: Record<
  string,
  { Icon: typeof Beef; from: string; to: string; accent: string; label: string }
> = {
  boucherie:    { Icon: Beef,       from: CATEGORY_PALETTE.beefRedFrom, to: CATEGORY_PALETTE.beefRedTo, accent: CATEGORY_PALETTE.goldIcon,  label: "Boucherie" },
  charcuterie:  { Icon: Drumstick,  from: CATEGORY_PALETTE.charcFrom,   to: CATEGORY_PALETTE.charcTo,   accent: CATEGORY_PALETTE.goldIcon,  label: "Charcuterie" },
  poissonnerie: { Icon: Fish,       from: CATEGORY_PALETTE.fishFrom,    to: CATEGORY_PALETTE.fishTo,    accent: CATEGORY_PALETTE.blueIcon,  label: "Poissonnerie" },
  fruits:       { Icon: Apple,      from: CATEGORY_PALETTE.fruitFrom,   to: CATEGORY_PALETTE.fruitTo,   accent: CATEGORY_PALETTE.peachIcon, label: "Fruits" },
  legumes:      { Icon: Leaf,       from: CATEGORY_PALETTE.legumeFrom,  to: CATEGORY_PALETTE.legumeTo,  accent: CATEGORY_PALETTE.greenIcon, label: "Légumes" },
  cremerie:     { Icon: Milk,       from: CATEGORY_PALETTE.cremeFrom,   to: CATEGORY_PALETTE.cremeTo,   accent: CATEGORY_PALETTE.darkIcon,  label: "Crémerie" },
  epicerie:     { Icon: Wheat,      from: CATEGORY_PALETTE.epiceFrom,   to: CATEGORY_PALETTE.epiceTo,   accent: CATEGORY_PALETTE.goldIcon,  label: "Épicerie" },
  patisserie:   { Icon: Croissant,  from: CATEGORY_PALETTE.patisFrom,   to: CATEGORY_PALETTE.patisTo,   accent: CATEGORY_PALETTE.creamIcon, label: "Pâtisserie" },
  biscuiterie:  { Icon: Cookie,     from: CATEGORY_PALETTE.biscuitFrom, to: CATEGORY_PALETTE.biscuitTo, accent: CATEGORY_PALETTE.creamIcon, label: "Biscuiterie" },
  boissons:     { Icon: GlassWater, from: CATEGORY_PALETTE.boissonFrom, to: CATEGORY_PALETTE.boissonTo, accent: CATEGORY_PALETTE.mintIcon,  label: "Boissons" },
};
// Fallback générique : tokens de marque (sapin → sapin nuit, accent or).
const fallback = {
  Icon: Package,
  from: BRAND.colors.primary,
  to: BRAND.colors.primaryDark,
  accent: BRAND.colors.accent,
  label: "Salamarket",
};

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
      className="relative w-full h-full flex flex-col items-center justify-center gap-3 overflow-hidden"
      style={{
        backgroundImage: `linear-gradient(135deg, ${fb.from}, ${fb.to})`,
      }}
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
