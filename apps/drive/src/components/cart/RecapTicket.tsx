import { BRAND } from "@/config/brand";
import { formatPrice } from "@/lib/format";
import { computePrixEstime } from "@salamarket/shared";
import type { CartItem } from "@/stores/cartStore";

/**
 * Sous-total en centimes d'une ligne — même logique que Cart.tsx :
 * la remise DLC (lignes 'unit') prime sur le prix plein, sinon
 * computePrixEstime gère unit / weight / weight_bracket.
 */
const lineCents = (item: CartItem): number => {
  if (
    item.unitType === "unit" &&
    item.dlcUnitPriceCents != null &&
    Number.isFinite(item.dlcUnitPriceCents)
  ) {
    return Math.round(item.dlcUnitPriceCents) * item.quantity;
  }
  const qty =
    item.unitType === "weight"
      ? (item.quantiteKg ?? 0) * item.quantity
      : item.quantity;
  return Math.round(
    computePrixEstime(item.product, qty, item.bracketIndex ?? 0) * 100,
  );
};

const OTHER_SLUG = "__autres__";
const OTHER_NAME = "Autres";

/**
 * Récap "ticket de caisse" — regroupe les lignes du panier par rayon
 * (BRAND.categories) et affiche un sous-total par rayon. Mise en page ticket :
 * séparateurs pointillés, chiffres tabulaires, libellés courts.
 *
 * Pur affichage dérivé des items (mêmes montants que le récap principal),
 * aucune action. Ne rend rien si le panier ne couvre qu'un seul rayon — le
 * récapitulatif principal suffit alors, un ticket à une ligne serait du bruit.
 */
export const RecapTicket = ({ items }: { items: CartItem[] }) => {
  // Ordre des rayons = ordre BRAND.categories (cohérent avec la nav catalogue),
  // "Autres" rejeté en fin pour les catégories hors taxonomie connue.
  const nameBySlug = new Map(BRAND.categories.map((c) => [c.slug, c.name]));

  const totals = new Map<string, number>();
  for (const item of items) {
    const slug = nameBySlug.has(item.product.category)
      ? item.product.category
      : OTHER_SLUG;
    totals.set(slug, (totals.get(slug) ?? 0) + lineCents(item));
  }

  if (totals.size < 2) return null;

  const order = [...BRAND.categories.map((c) => c.slug), OTHER_SLUG];
  const rows = order
    .filter((slug) => totals.has(slug))
    .map((slug) => ({
      slug,
      name: slug === OTHER_SLUG ? OTHER_NAME : (nameBySlug.get(slug) as string),
      cents: totals.get(slug) as number,
    }));

  return (
    <section
      className="rounded-2xl border border-line bg-cream/60 px-4 py-4"
      aria-label="Détail par rayon"
    >
      <p className="text-[10px] uppercase tracking-[0.28em] font-bold text-gold-text">
        Détail par rayon
      </p>
      <ul className="mt-3 space-y-2.5">
        {rows.map((row) => (
          <li
            key={row.slug}
            className="flex items-baseline gap-2 text-[13.5px]"
          >
            <span className="text-ink-soft">{row.name}</span>
            <span
              aria-hidden
              className="flex-1 self-end border-b border-dotted border-line-medium translate-y-[-3px]"
            />
            <span className="font-semibold text-ink tabular-nums">
              {formatPrice(row.cents)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
};
