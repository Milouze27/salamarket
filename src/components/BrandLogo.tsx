import { cn } from "@/lib/utils";

interface Props {
  size?: "sm" | "lg";
  className?: string;
}

// Logo horizontal officiel Salamarket Drive — version TRANSPARENTE
// (tout doré, fond transparent). Conçu pour s'afficher sur fond sombre
// (sapin), où le doré brille pleinement. Le bg sapin du Header met en
// valeur l'identité brand de manière premium.
export const BrandLogo = ({ size = "lg", className }: Props) => {
  const heightClass = size === "lg" ? "h-9" : "h-7";

  return (
    <span
      className={cn(
        "inline-block active:scale-95 transition-transform",
        className,
      )}
    >
      <img
        src="/brand/logo-horizontal-transparent.png"
        alt="Salamarket Drive"
        className={cn(heightClass, "w-auto")}
        width={size === "lg" ? 130 : 100}
        height={size === "lg" ? 36 : 28}
      />
    </span>
  );
};
