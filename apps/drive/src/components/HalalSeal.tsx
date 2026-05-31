import { cn } from "@/lib/utils";

/**
 * HalalSeal — sceau circulaire "Halal · Certifié · Salamarket".
 *
 * Asset signature de la marque. Avant DSN-17 il était redessiné inline
 * (mêmes 3 lignes, mais tailles/tracking légèrement différents) dans
 * EditorialIntro (88/110px) et OnboardingFlow (120/140px), avec un risque
 * de dérive visuelle entre écrans. Ce composant unique garantit un rendu
 * pixel-identique partout : cercle crème, ring or animé (.halal-seal-ring,
 * pulse 4.5s, prefers-reduced-motion respecté côté index.css) et hiérarchie
 * typo (kicker or / "Certifié" extrabold sapin / "Salamarket").
 *
 * `size` pilote toutes les dimensions de façon proportionnée — aucun
 * réglage manuel par l'appelant :
 *   - sm : 88px  (hero EditorialIntro mobile)
 *   - md : 110px (hero EditorialIntro desktop, défaut)
 *   - lg : 120px (onboarding mobile)
 *   - xl : 140px (onboarding desktop)
 *
 * Purement décoratif (aria-hidden) : le signal "halal certifié" lisible
 * par lecteur d'écran est porté par le texte courant ou par un aria-label
 * sur le conteneur appelant.
 */

type HalalSealSize = "sm" | "md" | "lg" | "xl";

interface SealTokens {
  box: number; // diamètre du cercle (px)
  ring: number; // inset du ring or (px)
  kicker: number; // font-size "Halal" (px)
  title: number; // font-size "Certifié" (px)
  brand: number; // font-size "Salamarket" (px)
}

const TOKENS: Record<HalalSealSize, SealTokens> = {
  sm: { box: 88, ring: 6, kicker: 9, title: 14, brand: 8 },
  md: { box: 110, ring: 6, kicker: 10, title: 16, brand: 9 },
  lg: { box: 120, ring: 8, kicker: 11, title: 18, brand: 9 },
  xl: { box: 140, ring: 8, kicker: 12, title: 20, brand: 10 },
};

interface HalalSealProps {
  size?: HalalSealSize;
  /** Classe additionnelle pour l'ombre / le positionnement par l'appelant. */
  className?: string;
}

export const HalalSeal = ({ size = "md", className }: HalalSealProps) => {
  const t = TOKENS[size];

  return (
    <div
      aria-hidden
      className={cn(
        "relative rounded-full bg-[#FAF7EE] flex flex-col items-center justify-center text-center",
        className,
      )}
      style={{ width: t.box, height: t.box }}
    >
      {/* Ring or animé — micro-pulse via .halal-seal-ring (cf. index.css) */}
      <span
        className="halal-seal-ring absolute rounded-full border-[1.5px] border-[#C9A227]/55"
        style={{ inset: t.ring }}
      />
      <span
        className="relative uppercase font-bold text-[#C9A227] leading-tight"
        style={{ fontSize: t.kicker, letterSpacing: "0.2em" }}
      >
        Halal
      </span>
      <span
        className="relative font-extrabold text-[#0E3B2E] leading-tight"
        style={{ fontSize: t.title, letterSpacing: "-0.02em" }}
      >
        Certifié
      </span>
      <span
        className="relative uppercase font-semibold text-[#0E3B2E]/55 mt-0.5"
        style={{ fontSize: t.brand, letterSpacing: "0.22em" }}
      >
        Salamarket
      </span>
    </div>
  );
};

export default HalalSeal;
