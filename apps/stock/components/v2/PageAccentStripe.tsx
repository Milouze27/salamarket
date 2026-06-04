"use client";

/**
 * Filet 4px de couleur en tout en haut de chaque page V2.
 * Permet à Otmane de reconnaître la fonction de la page d'un coup d'œil.
 *
 * Token-driven (dark par défaut) : on pointe sur les vars thème-aware au lieu
 * d'hex en dur. En dark le sapin/or/danger remontent en luminosité (primary
 * #1B6A4A, gold-bright #F2D469, danger #FF7062) → le filet reste lisible sur
 * l'abysse au lieu de se fondre. En jour ils retombent sur la charte cream.
 *
 * Rôle couleur :
 *   - sapin    primary-green (réception, étiquettes)
 *   - bordeaux danger        (sortie)
 *   - or       gold-bright    (transfert, inventaire)
 *   - foncé    surface-3      (stock — neutre profond, lisible des 2 côtés)
 *   - sapin+or / or+sapin     gradients (preparation, admin)
 */
type Accent =
  | "sapin"
  | "bordeaux"
  | "or"
  | "fonce"
  | "sapin-or"
  | "or-sapin";

const STYLE: Record<Accent, React.CSSProperties> = {
  sapin: { background: "var(--primary-green)" },
  bordeaux: { background: "var(--danger)" },
  or: { background: "var(--accent-gold-bright)" },
  fonce: { background: "var(--surface-3)" },
  "sapin-or": {
    background:
      "linear-gradient(90deg, var(--accent-gold-bright) 0%, var(--primary-green) 100%)",
  },
  "or-sapin": {
    background:
      "linear-gradient(90deg, var(--primary-green) 0%, var(--accent-gold-bright) 100%)",
  },
};

export function PageAccentStripe({ accent }: { accent: Accent }) {
  return (
    <div
      aria-hidden
      className="h-1 w-full"
      style={STYLE[accent]}
    />
  );
}
