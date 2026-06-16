import { BRAND } from "@/config/brand";

/**
 * ProvenanceNote — note éditoriale d'origine sur la PDP.
 *
 * Mapping STATIQUE par catégorie (placeholders cohérents marque, aucune donnée
 * serveur) : fruits & légumes → « Circuit court Occitanie », boucherie /
 * charcuterie → « Origine France ». Complète la frise de traçabilité halal
 * existante (TracabiliteFrise) sans la dupliquer : ici on reste sur une note
 * sobre texte + hairline, pas une frise ni un encart certifié.
 *
 * Charte : hiérarchie par la typo, pas d'icône décorative, tokens BRAND.
 */
interface Provenance {
  origine: string;
  detail: string;
}

const PROVENANCE_PAR_CATEGORIE: Record<string, Provenance> = {
  "fruits-legumes": {
    origine: "Circuit court Occitanie",
    detail: "Producteurs de la région, livrés au plus court",
  },
  boucherie: {
    origine: "Origine France",
    detail: "Élevages français sélectionnés",
  },
  charcuterie: {
    origine: "Origine France",
    detail: "Préparation française, recettes maison",
  },
};

interface Props {
  category: string;
  className?: string;
}

export const ProvenanceNote = ({ category, className }: Props) => {
  const data = PROVENANCE_PAR_CATEGORIE[category];
  if (!data) return null;

  return (
    <div
      className={`border-t border-[#0E3B2E]/12 pt-3 ${className ?? ""}`}
      aria-label={`Provenance : ${data.origine}`}
    >
      <p
        className="text-[14px] font-extrabold tracking-[-0.01em]"
        style={{ color: BRAND.colors.primaryDark }}
      >
        {data.origine}
      </p>
      <p
        className="mt-0.5 text-[12px] font-medium"
        style={{ color: BRAND.colors.textSecondary }}
      >
        {data.detail}
      </p>
    </div>
  );
};

export default ProvenanceNote;
