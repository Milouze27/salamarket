import type { Product } from "@/types/product";

// ────────────────────────────────────────────────────────────────────
// PrixAuKiloNote — comparateur €/kg pédagogique pour un produit 'unit'
// vendu en pack/pièce, posé sous le prix sur la PDP.
//
// Si le produit porte un poids (poidsMaxKg ou estimatedWeightKg), on dérive
// un prix au kilo indicatif pour rassurer sur le rapport qualité-prix
// (« soit ~X,XX €/kg »). LECTURE PURE des champs Product existants — aucun
// calcul de facturation touché, le prix payé reste product.priceCents.
//
// On ne s'active QUE pour unitType 'unit' : un produit 'weight' affiche déjà
// son €/kg natif, un 'weight_bracket' est un forfait taille (le €/kg n'a pas
// de sens stable). Si aucun poids exploitable → rien (return null), pas de
// chiffre inventé.
// ────────────────────────────────────────────────────────────────────

interface Props {
  product: Product;
}

export const PrixAuKiloNote = ({ product }: Props) => {
  const unitType = product.unitType ?? "unit";
  if (unitType !== "unit") return null;

  // Poids de référence : on privilégie le poids net renseigné
  // (estimatedWeightKg) puis, à défaut, la borne haute (poidsMaxKg). On
  // dérive un €/kg seulement si le poids est strictement positif.
  const refKg = product.estimatedWeightKg ?? product.poidsMaxKg ?? null;
  if (refKg == null || !(refKg > 0)) return null;

  const pricePerKg = product.priceCents / 100 / refKg;
  if (!Number.isFinite(pricePerKg) || pricePerKg <= 0) return null;

  const formatted = pricePerKg.toFixed(2).replace(".", ",");

  return (
    <p className="mt-1.5 text-[12.5px] text-[#0F1A14]/55">
      soit{" "}
      <span className="tabular-nums font-semibold text-[#0F1A14]/70">
        ~{formatted} €/kg
      </span>
    </p>
  );
};
