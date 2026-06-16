import { BRAND, STATUS } from "@/config/brand";
import { ratingFor } from "@/lib/productSignals";

/**
 * RatingStatic — note étoiles statique et sobre, sous le prix de la PDP.
 *
 * La note est DÉTERMINISTE (hash de product.id → 4,4–4,9, cf.
 * lib/productSignals) : pas de backend d'avis, signal « confiance » de démo
 * stable entre renders. On ne la présente JAMAIS comme un avis temps réel : le
 * libellé « note indicative » et l'aria-label sont explicites.
 *
 * Charte : étoiles minimalistes (jauge pleine/vide en or, fonctionnelles à la
 * lecture, pas décoratives) + valeur tabulaire. Tokens BRAND.
 */
interface Props {
  productId: string;
  className?: string;
}

// 5 étoiles dessinées via une jauge or en pourcentage (pas d'icône lucide
// décorative) : on superpose une rangée « pleine » clippée sur une rangée
// « vide » pour rendre les demi-étoiles proprement.
const STAR = "★★★★★";

export const RatingStatic = ({ productId, className }: Props) => {
  const note = ratingFor(productId);
  const pct = (note / 5) * 100;
  const noteFr = note.toFixed(1).replace(".", ",");

  return (
    <span
      className={`inline-flex items-center gap-2 ${className ?? ""}`}
      aria-label={`Note indicative ${noteFr} sur 5`}
    >
      <span
        className="relative inline-block text-[13px] leading-none tracking-[0.1em] select-none"
        aria-hidden
      >
        {/* Rangée vide (gabarit) */}
        <span style={{ color: BRAND.colors.border }}>{STAR}</span>
        {/* Rangée pleine clippée à la note */}
        <span
          className="absolute inset-0 overflow-hidden whitespace-nowrap"
          style={{ width: `${pct}%`, color: BRAND.colors.accent }}
        >
          {STAR}
        </span>
      </span>
      <span
        className="text-[12px] font-bold tabular-nums"
        style={{ color: BRAND.colors.primaryDark }}
      >
        {noteFr}
      </span>
      <span
        className="text-[11px] font-medium"
        style={{ color: STATUS.neutralText }}
      >
        note indicative
      </span>
    </span>
  );
};

export default RatingStatic;
