import { useMemo } from "react";
import { fr } from "date-fns/locale";
import { format } from "date-fns-tz";
import type { UserOrder } from "@/hooks/useUserOrders";
import { formatPrice } from "@/lib/format";

const PARIS_TZ = "Europe/Paris";

// ─────────────────────────────────────────────────────────────────
// OrdersTimelineDecor — frise éditoriale en tête de "Mes commandes".
// Regroupe les commandes DÉJÀ chargées (useUserOrders) par mois et
// affiche, pour chaque mois, le nombre de commandes + le total cumulé
// en gros chiffres tabulaires. Présentation pure, lecture seule, aucune
// requête nouvelle. Hiérarchie par la typo, zéro picto décoratif.
// ─────────────────────────────────────────────────────────────────

interface MonthGroup {
  key: string;
  label: string;
  count: number;
  totalCents: number;
}

export const OrdersTimelineDecor = ({ orders }: { orders: UserOrder[] }) => {
  const groups = useMemo<MonthGroup[]>(() => {
    const byMonth = new Map<string, MonthGroup>();
    for (const o of orders) {
      const d = new Date(o.created_at);
      if (Number.isNaN(d.getTime())) continue;
      const key = format(d, "yyyy-MM", { timeZone: PARIS_TZ });
      const existing = byMonth.get(key);
      if (existing) {
        existing.count += 1;
        existing.totalCents += o.total_cents ?? 0;
      } else {
        byMonth.set(key, {
          key,
          // "juin 2026" — capitalisé à l'affichage.
          label: format(d, "MMMM yyyy", { timeZone: PARIS_TZ, locale: fr }),
          count: 1,
          totalCents: o.total_cents ?? 0,
        });
      }
    }
    // useUserOrders trie déjà du plus récent au plus ancien ; l'ordre
    // d'insertion de la Map conserve donc l'ordre chronologique inverse.
    return [...byMonth.values()];
  }, [orders]);

  // Une frise n'a de sens qu'avec au moins deux mois à mettre en regard.
  if (groups.length < 2) return null;

  return (
    <section
      aria-label="Vos commandes par mois"
      className="mb-4 rounded-2xl border border-border bg-white px-5 py-4 shadow-sm"
    >
      <ol className="flex flex-col">
        {groups.map((g, idx) => (
          <li
            key={g.key}
            className="relative flex items-baseline justify-between gap-4 py-2.5 pl-4 border-l-2 border-sapin/15"
          >
            {/* Point de frise sur la ligne verticale — repère fonctionnel
                de la timeline, pas un ornement décoratif. */}
            <span
              aria-hidden
              className="absolute left-[-5px] top-[1.05rem] h-2 w-2 rounded-full bg-gold ring-2 ring-white"
            />
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-ink capitalize leading-tight">
                {g.label}
              </p>
              <p className="text-[12px] text-ink-faint mt-0.5">
                {g.count} commande{g.count > 1 ? "s" : ""}
                {idx === 0 && (
                  <span className="text-gold-text font-semibold">
                    {" "}
                    <span aria-hidden>·</span> ce mois-ci
                  </span>
                )}
              </p>
            </div>
            <p className="shrink-0 text-[22px] font-extrabold text-sapin tabular-nums tracking-[-0.02em] leading-none">
              {formatPrice(g.totalCents)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
};

export default OrdersTimelineDecor;
