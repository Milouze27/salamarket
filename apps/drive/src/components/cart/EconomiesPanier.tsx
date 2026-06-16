import { formatPrice } from "@/lib/format";
import type { CartItem } from "@/stores/cartStore";

/**
 * Bandeau "Vous économisez X" — somme, en mémoire, les écarts prix plein →
 * prix DLC capturés sur les lignes 'unit' anti-gaspi (dlcUnitPriceCents).
 *
 * Le prix plein est product.priceCents, le prix remisé dlcUnitPriceCents.
 * L'économie d'une ligne = (plein − remisé) × quantity, plancher à 0 (une
 * remise ne peut jamais creuser une économie négative). Rendu uniquement si
 * l'économie totale est strictement positive — sinon le bandeau n'a rien à
 * dire et n'occupe pas l'écran.
 *
 * Pur affichage dérivé des items du store : aucune écriture, aucune action.
 */
export const EconomiesPanier = ({ items }: { items: CartItem[] }) => {
  const savingsCents = items.reduce((sum, i) => {
    if (
      i.unitType !== "unit" ||
      i.dlcUnitPriceCents == null ||
      !Number.isFinite(i.dlcUnitPriceCents)
    ) {
      return sum;
    }
    const perUnit = i.product.priceCents - Math.round(i.dlcUnitPriceCents);
    if (perUnit <= 0) return sum;
    return sum + perUnit * i.quantity;
  }, 0);

  if (savingsCents <= 0) return null;

  return (
    <div className="flex items-baseline justify-between gap-3 rounded-2xl border border-sapin/15 bg-sapin/[0.06] px-4 py-3.5">
      <span className="text-[13px] font-semibold text-sapin-deep">
        Grâce aux dates courtes, vous économisez
      </span>
      <span className="text-[17px] font-extrabold tabular-nums tracking-[-0.02em] text-gold-text">
        {formatPrice(savingsCents)}
      </span>
    </div>
  );
};
