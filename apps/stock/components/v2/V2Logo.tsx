interface V2LogoProps {
  size?: number;
  /** Conservé pour compat appelants ; le badge est toujours sapin + marque or. */
  variant?: "light" | "dark";
  className?: string;
}

/**
 * V2Logo — vraie marque Salamarket : le « M » surmonté de l'arche ogivale
 * dorée (extraite du logo officiel, public/brand/mark.png), posée sur un badge
 * sapin arrondi. Remplace l'ancien placeholder « S ».
 */
export function V2Logo({ size = 28, className = "" }: V2LogoProps) {
  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center shrink-0 overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.34),
        background: "linear-gradient(165deg, #0e3b2e, #082a20)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 2px rgba(0,0,0,0.25)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/mark.png"
        alt=""
        width={Math.round(size * 0.66)}
        height={Math.round(size * 0.66)}
        style={{ objectFit: "contain", display: "block" }}
      />
    </span>
  );
}
