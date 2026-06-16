import { getBrackets } from "@salamarket/shared";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/product";

// ────────────────────────────────────────────────────────────────────
// WeightRangeBadge — note typographique sous le titre produit, réutilisable
// catalogue + PDP, pour les produits au poids.
//
//   - weight_bracket : lit getBrackets() et affiche la fourchette de prix.
//       · plusieurs brackets → « de X à Y € selon la taille »
//       · un seul bracket (cas V1) → « à partir de X € · <plage de poids> »
//         (honnête : un seul prix forfait, pas une vraie fourchette)
//   - weight         : « X,XX €/kg · pesé en magasin »
//
// Rendu sobre : pas de pastille décorative, pas de picto. Hiérarchie par la
// typo (poids du prix vs reste en secondaire). LECTURE PURE des helpers
// @salamarket/shared — aucun calcul de facturation.
//
// Renvoie null pour les produits 'unit' (rien à dire) ou si les champs poids
// manquent → pas d'affichage bancal.
// ────────────────────────────────────────────────────────────────────

const fmtEur = (eur: number): string =>
  `${eur.toFixed(2).replace(".", ",")} €`;

interface Props {
  product: Product;
  className?: string;
}

export const WeightRangeBadge = ({ product, className }: Props) => {
  const unitType = product.unitType ?? "unit";

  if (unitType === "weight") {
    if (product.pricePerKg == null || !(product.pricePerKg > 0)) return null;
    const perKg = product.pricePerKg.toFixed(2).replace(".", ",");
    return (
      <p
        className={cn(
          "text-[12.5px] text-[#0F1A14]/60 leading-snug",
          className,
        )}
      >
        <span className="tabular-nums font-bold text-[#0E3B2E]">
          {perKg} €/kg
        </span>{" "}
        · pesé en magasin
      </p>
    );
  }

  if (unitType === "weight_bracket") {
    const brackets = getBrackets(product);
    if (brackets.length === 0) return null;

    const prices = brackets.map((b) => b.prix);
    const min = Math.min(...prices);
    const max = Math.max(...prices);

    return (
      <p
        className={cn(
          "text-[12.5px] text-[#0F1A14]/60 leading-snug",
          className,
        )}
      >
        {max > min ? (
          <>
            de{" "}
            <span className="tabular-nums font-bold text-[#0E3B2E]">
              {fmtEur(min)}
            </span>{" "}
            à{" "}
            <span className="tabular-nums font-bold text-[#0E3B2E]">
              {fmtEur(max)}
            </span>{" "}
            selon la taille
          </>
        ) : (
          <>
            à partir de{" "}
            <span className="tabular-nums font-bold text-[#0E3B2E]">
              {fmtEur(min)}
            </span>{" "}
            · {brackets[0].label}
          </>
        )}
      </p>
    );
  }

  return null;
};
