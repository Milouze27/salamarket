"use client";

/**
 * Typographic product thumbnail.
 * Replaces remote image URLs with a brand-coloured tile + 2-letter initials.
 * Color is derived from the product category — see CATEGORY_COLOR.
 */

interface ProductThumbnailProps {
  /** Product name — used to extract the 2-letter glyph. */
  nom: string;
  /** Product category — drives the background color. */
  categorie?: string | null;
  /** Pixel size of the square (default 48). */
  size?: number;
  /** Tailwind classes for sizing — overrides `size` when provided. */
  className?: string;
  /** Visual rounding ; defaults to 8px (rounded-lg). */
  rounded?: "lg" | "xl" | "2xl" | "full";
}

/**
 * Palette désaturée sapin/or — 4 tons, plus aucun arc-en-ciel.
 * Le mur de tiles doit ressembler à "un mur de livres reliés", uniforme
 * et lisible, plutôt qu'à un kaléidoscope. Catégories froides (viande,
 * frais, surgelés, traiteur) en sapin plein avec initiale or. Épicerie/
 * boissons en sapin légèrement plus pâle (toujours initiale or). Maison/
 * hygiène/bazar en cream avec initiale sapin. Fallback = nuit + or.
 */
type TileTone = "sapin" | "sapin-soft" | "cream" | "night";

const CATEGORY_TONE: Record<string, TileTone> = {
  // Froid + boucherie + frais → sapin plein
  Boucherie: "sapin",
  Charcuterie: "sapin",
  Surgelés: "sapin",
  Frais: "sapin",
  Traiteur: "sapin",
  // Épicerie + boissons → sapin légèrement plus pâle
  Épicerie: "sapin-soft",
  "Épicerie sèche": "sapin-soft",
  Boissons: "sapin-soft",
  "Produits du Maghreb": "sapin-soft",
  Maghreb: "sapin-soft",
  Conserves: "sapin-soft",
  "Fruits & Légumes": "sapin-soft",
  "F&L": "sapin-soft",
  // Maison + hygiène + bazar → cream avec initiale sapin
  Hygiène: "cream",
  Maison: "cream",
  Bazar: "cream",
};

const TONE_BG: Record<TileTone, string> = {
  sapin: "#0E3B2E",
  "sapin-soft": "#2A4F40", // sapin + 15% lightness — lisible, calme
  cream: "#FAF7EE",
  night: "#082A20",
};

/* Ces couleurs sont volontairement HORS thème : la vignette doit garder la
   même apparence de jour comme de nuit (« un mur de livres reliés »). C'est
   la seule entorse assumée à la règle « pas de hex en dur ».
   31/08/2026 — l'or #C9A227 sur le sapin pâle #2A4F40 mesurait 3,79:1 au
   pixel, sous le seuil de 4,5 pour les initiales de 12 px du tableau Stock.
   L'or brillant #DDB31C sur le même fond mesure 4,60:1. Les trois autres
   tons étaient déjà au-dessus (5,16 / 6,37 / 11,65). */
const TONE_FG: Record<TileTone, string> = {
  sapin: "#C9A227",
  "sapin-soft": "#DDB31C",
  cream: "#0E3B2E",
  night: "#C9A227",
};

const ROUND_CLS: Record<NonNullable<ProductThumbnailProps["rounded"]>, string> = {
  lg: "rounded-lg",
  xl: "rounded-xl",
  "2xl": "rounded-2xl",
  full: "rounded-full",
};

function getInitials(nom: string): string {
  const trimmed = nom.trim();
  if (!trimmed) return "?";
  // Try first 2 word-initials; fall back to first 2 chars.
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export function ProductThumbnail({
  nom,
  categorie,
  size = 48,
  className,
  rounded = "lg",
}: ProductThumbnailProps) {
  const tone: TileTone = (categorie && CATEGORY_TONE[categorie]) || "night";
  const bg = TONE_BG[tone];
  const fg = TONE_FG[tone];
  const initials = getInitials(nom);
  // Font size scales with tile size — but caps so big tiles don't over-blow.
  const fontPx = Math.max(10, Math.min(28, Math.round(size * 0.4)));
  const style = className
    ? { backgroundColor: bg, color: fg }
    : { backgroundColor: bg, color: fg, width: size, height: size, fontSize: fontPx };

  return (
    <div
      role="img"
      aria-label={`Vignette ${nom}`}
      className={
        className
          ? `${className} ${ROUND_CLS[rounded]} shrink-0 inline-flex items-center justify-center font-extrabold tracking-[-0.04em] select-none`
          : `${ROUND_CLS[rounded]} shrink-0 inline-flex items-center justify-center font-extrabold tracking-[-0.04em] select-none`
      }
      style={style}
    >
      {initials}
    </div>
  );
}
