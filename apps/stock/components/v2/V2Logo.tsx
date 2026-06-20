interface V2LogoProps {
  size?: number;
  /** Conservé pour compat appelants ; le badge sapin + marque or est unique. */
  variant?: "light" | "dark";
  className?: string;
}

/**
 * V2Logo — marque Salamarket : badge sapin arrondi + « M » à notch surmonté
 * de l'arche ogivale dorée. PNG haute résolution (public/brand/logo-badge.png,
 * 256px rendu depuis le tracé vectoriel) → net et bien visible même petit, sur
 * fond clair comme sombre (le badge plein ressort, contrairement au SVG nu).
 */
export function V2Logo({ size = 28, className = "" }: V2LogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/logo-badge.png"
      alt="Salamarket"
      width={size}
      height={size}
      className={className}
      style={{
        // Dimensions verrouillées : le header est un flex serré qui écrasait
        // l'img à ~8px (min-width auto + shrink). min*/flexShrink figent le carré.
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        flexShrink: 0,
        objectFit: "contain",
        borderRadius: Math.round(size * 0.28),
        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        display: "block",
      }}
    />
  );
}
