interface V2LogoProps {
  size?: number;
  /** Conservé pour compat appelants ; le badge est toujours sapin + marque or. */
  variant?: "light" | "dark";
  className?: string;
}

/**
 * V2Logo — marque Salamarket : le « M » au notch central surmonté de l'arche
 * ogivale dorée, posée sur un badge sapin arrondi. SVG inline vectoriel
 * (net à toute taille, aucun bruit/crop — fini le placeholder « S » et le PNG).
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
      <svg
        width={Math.round(size * 0.6)}
        height={Math.round(size * 0.69)}
        viewBox="0 0 104 120"
        fill="none"
        stroke="#E8B53A"
        strokeWidth={6.6}
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ display: "block" }}
      >
        {/* arche ogivale */}
        <path d="M36 47 C27 41 26 32 31 23 C36 15 45 10 52 5 C59 10 68 15 73 23 C78 32 77 41 68 47" />
        {/* M monogramme avec notch central */}
        <path
          strokeWidth={11.5}
          d="M28 105 L28 56 L46 93 L52 84 L58 93 L76 56 L76 105"
        />
      </svg>
    </span>
  );
}
