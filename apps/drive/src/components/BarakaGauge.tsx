import { Sparkles } from "lucide-react";
import { BARAKA_PALIER } from "@/hooks/useLoyalty";

/**
 * Jauge Cagnotte Baraka — affiche le solde de points fidélité du client et
 * sa progression vers le palier suivant. Animée (largeur de barre en
 * transition) et mobile-first. Tous les libellés restent courts pour ne
 * jamais déborder (anti-overflow). Couleurs alignées sur la DA panier
 * (sapin #0E3B2E / or #C9A227 / crème #FAF7EE), cohérentes avec Cart.tsx.
 *
 * Rendue uniquement quand le client est connecté ET a au moins 1 point :
 * inutile d'occuper l'écran avec une cagnotte vide pour un visiteur anonyme.
 */
export const BarakaGauge = ({
  points,
  nextPalier,
  progress,
}: {
  points: number;
  nextPalier: number;
  progress: number;
}) => {
  const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
  const reste = Math.max(0, nextPalier - points);

  return (
    <div className="rounded-2xl border border-[#C9A227]/40 bg-gradient-to-br from-[#FBF6E2] to-[#FAF7EE] p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#0E3B2E]/[0.06]">
            <Sparkles size={16} className="text-[#C9A227]" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.24em] font-bold text-[#C9A227] leading-tight">
              Cagnotte Baraka
            </p>
            <p className="text-[13px] text-[#0F1A14]/70 truncate">
              {reste > 0
                ? `Plus que ${reste} pt${reste > 1 ? "s" : ""} pour ${nextPalier} pts`
                : "Palier atteint, profitez-en"}
            </p>
          </div>
        </div>
        <p className="shrink-0 text-right">
          <span className="text-[22px] font-extrabold text-[#0E3B2E] tabular-nums tracking-[-0.02em]">
            {points}
          </span>
          <span className="ml-1 text-[11px] font-semibold text-[#0E3B2E]/60">
            pts
          </span>
        </p>
      </div>

      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#0E3B2E]/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={BARAKA_PALIER}
        aria-valuenow={points % BARAKA_PALIER}
        aria-label="Progression de la cagnotte Baraka"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#0E3B2E] to-[#C9A227] transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-2 text-[11px] text-[#0F1A14]/55">
        1 point par euro dépensé, crédité au retrait de votre commande.
      </p>
    </div>
  );
};
