import { BRAND } from "@/config/brand";

/**
 * GarantieFraicheur — ruban de réassurance « Garanti frais ou remboursé ».
 *
 * Posé en bas de PDP, au moment de l'ajout panier, pour renforcer la confiance.
 * Promesse en une phrase forte typographique sur fond sapin doux. Statique,
 * additif, réutilisable.
 *
 * Charte : aucune icône ornementale — la force vient de la TYPO (graisse,
 * taille, contraste sapin sur voile clair). Tokens BRAND, jamais de hex en dur.
 */
interface Props {
  className?: string;
}

export const GarantieFraicheur = ({ className }: Props) => {
  return (
    <section
      className={`rounded-3xl p-5 md:p-6 ${className ?? ""}`}
      style={{ backgroundColor: `${BRAND.colors.primary}0F` }}
      aria-label="Garantie fraîcheur"
    >
      <p
        className="text-[18px] md:text-[20px] font-extrabold leading-snug tracking-[-0.015em]"
        style={{ color: BRAND.colors.primaryDark }}
      >
        Garanti frais ou remboursé.
      </p>
      <p
        className="mt-1.5 text-[13px] font-medium leading-relaxed max-w-[48ch]"
        style={{ color: BRAND.colors.textSecondary }}
      >
        Un produit qui ne vous convient pas au retrait ? On vous le rembourse,
        sans discuter.
      </p>
    </section>
  );
};

export default GarantieFraicheur;
