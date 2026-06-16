import { BRAND } from "@/config/brand";
import { isPopulaire } from "@/lib/productSignals";

/**
 * PopulaireNote — signal social calme « Souvent commandé » posé en coin de
 * carte produit. Affiché sur ~20 % des cartes, sélection DÉTERMINISTE par un
 * hash de product.id (cf. lib/productSignals) : statique entre les renders,
 * jamais de random qui clignote.
 *
 * Rendu volontairement textuel et discret (pas de pastille décorative, pas
 * d'icône ornementale) : hiérarchie par la typo (graisse + couleur sapin sur
 * voile crème léger). Additif, lit l'id produit uniquement.
 */
interface Props {
  productId: string;
  className?: string;
}

export const PopulaireNote = ({ productId, className }: Props) => {
  if (!isPopulaire(productId)) return null;

  return (
    <span
      className={`pointer-events-none inline-flex items-center rounded-full bg-[#FAF7EE]/95 backdrop-blur px-2 h-[20px] text-[9px] font-extrabold uppercase tracking-[0.06em] shadow-sm ring-1 ring-black/5 ${className ?? ""}`}
      style={{ color: BRAND.colors.primaryDark }}
    >
      Souvent commandé
    </span>
  );
};

export default PopulaireNote;
