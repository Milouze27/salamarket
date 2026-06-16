import type { UserOrder } from "@/hooks/useUserOrders";

// ─────────────────────────────────────────────────────────────────
// FideliteStreak — palier de fidélité « fidèle du quartier ». Pur
// dérivé client du nombre de commandes distinctes (useUserOrders), aucun
// écrit serveur. Libellés typographiques, zéro picto décoratif.
//
// Paliers sobres, du plus haut au plus bas — on prend le premier atteint.
// ─────────────────────────────────────────────────────────────────

const PALIERS: { seuil: number; titre: string }[] = [
  { seuil: 20, titre: "Pilier du quartier" },
  { seuil: 10, titre: "Fidèle du quartier" },
  { seuil: 5, titre: "Habitué du quartier" },
  { seuil: 1, titre: "Bienvenue au marché" },
];

export const FideliteStreak = ({ orders }: { orders: UserOrder[] }) => {
  const count = orders.length;
  if (count === 0) return null;

  const palier = PALIERS.find((p) => count >= p.seuil);
  if (!palier) return null;

  return (
    <section
      aria-label="Votre fidélité"
      className="rounded-2xl border border-border bg-white px-5 py-4 shadow-sm flex items-baseline justify-between gap-4"
    >
      <div className="min-w-0">
        <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-ink-faint">
          Votre fidélité
        </p>
        <p className="text-[17px] font-bold text-sapin mt-1 leading-tight">
          {palier.titre}
        </p>
      </div>
      <p className="shrink-0 text-right leading-none">
        <span className="block text-[26px] font-extrabold text-gold-text tabular-nums tracking-[-0.02em]">
          {count}
        </span>
        <span className="block text-[11px] text-ink-faint mt-1">
          commande{count > 1 ? "s" : ""}
        </span>
      </p>
    </section>
  );
};

export default FideliteStreak;
