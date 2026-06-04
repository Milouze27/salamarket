/**
 * EditorialEyebrow — eyebrow numéroté style magazine
 *
 * Pattern Drive porté sur Stock : `01 · L'INDEX` en or saturé,
 * tracking 0.18em, font-weight 700, 12px. Le numéro tabular
 * pour rester aligné si on stacke plusieurs eyebrows. Le séparateur
 * est un middot discret (L99 : l'em-dash reste réservé au contenu).
 *
 * Usage :
 *   <EditorialEyebrow num="01" label="Le hub" />
 *   <EditorialEyebrow num="02" label="Espace manager" count={4} />
 *
 * Auto-pad le numéro à 2 chiffres ("1" → "01"). Si `num` est
 * absent, on rend juste le label (utile pour une variante non
 * numérotée mais avec la même typo or).
 */
import type { ReactNode } from "react";

interface EditorialEyebrowProps {
  num?: string | number;
  label: ReactNode;
  /** Compteur tabular affiché à droite, ex "· 12 commandes". */
  count?: ReactNode;
  className?: string;
}

function pad2(v: string | number): string {
  const s = String(v);
  return s.length === 1 ? `0${s}` : s;
}

export function EditorialEyebrow({
  num,
  label,
  count,
  className = "",
}: EditorialEyebrowProps) {
  return (
    <p className={`eyebrow ${className}`}>
      {num !== undefined && (
        <>
          <span className="num">{pad2(num)}</span>
          <span aria-hidden className="text-text-tertiary/40">
            {" · "}
          </span>
        </>
      )}
      <span>{label}</span>
      {count !== undefined && (
        <>
          <span aria-hidden className="text-text-tertiary/40">
            {" · "}
          </span>
          <span className="num">{count}</span>
        </>
      )}
    </p>
  );
}
