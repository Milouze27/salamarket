import { BRAND } from "@/config/brand";

/**
 * FraicheurBadge — « Préparé ce matin » pour les rayons frais.
 *
 * Affiché sur la PDP (sous les pills caractéristiques) pour boucherie,
 * charcuterie, frais et fruits & légumes. Dérivé de la CATÉGORIE
 * uniquement — aucune donnée serveur, aucune date réelle.
 *
 * Charte : pas de pastille ni d'icône décorative — hiérarchie par la typo
 * (libellé sapin en graisse forte + ligne de contexte secondaire). Tokens
 * BRAND, jamais de hex en dur pour le texte.
 */
const RAYONS_FRAIS = new Set([
  "boucherie",
  "charcuterie",
  "frais",
  "fruits-legumes",
]);

interface Props {
  category: string;
  className?: string;
}

export const FraicheurBadge = ({ category, className }: Props) => {
  if (!RAYONS_FRAIS.has(category)) return null;

  return (
    <p
      className={`inline-flex flex-col leading-tight ${className ?? ""}`}
      aria-label="Rayon frais : préparé ce matin en magasin"
    >
      <span
        className="text-[13px] font-extrabold tracking-[-0.01em]"
        style={{ color: BRAND.colors.primaryDark }}
      >
        Préparé ce matin
      </span>
      <span
        className="text-[11px] font-medium"
        style={{ color: BRAND.colors.textSecondary }}
      >
        Mis en rayon le jour même
      </span>
    </p>
  );
};

export default FraicheurBadge;
