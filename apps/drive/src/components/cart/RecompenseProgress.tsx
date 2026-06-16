import { formatPrice } from "@/lib/format";

// ─────────────────────────────────────────────────────────────────
// RecompenseProgress — jauge calme « Plus que X € pour gagner un café
// offert au retrait ». Pur dérivé du total panier (centimes), aucun
// écrit serveur. Palier statique configurable ci-dessous.
//
// Sobre par design : une barre sapin→or, une phrase typographique. Pas
// de confettis, pas de picto décoratif (la récompense reste un clin
// d'œil au comptoir, géré humainement au retrait — purement éditorial).
// ─────────────────────────────────────────────────────────────────

/** Palier de récompense (centimes). Ajustable sans toucher le rendu. */
const RECOMPENSE_PALIER_CENTS = 4000; // 40 € → café offert au retrait
const RECOMPENSE_LABEL = "un café offert au retrait";

export const RecompenseProgress = ({ totalCents }: { totalCents: number }) => {
  // Sous le seuil minimum d'affichage : panier quasi vide, rien à montrer
  // (la jauge minimum de commande couvre déjà ce moment-là).
  if (totalCents <= 0) return null;

  const atteint = totalCents >= RECOMPENSE_PALIER_CENTS;
  const reste = Math.max(0, RECOMPENSE_PALIER_CENTS - totalCents);
  const pct = Math.min(
    100,
    Math.round((totalCents / RECOMPENSE_PALIER_CENTS) * 100),
  );

  return (
    <section
      className="rounded-2xl border border-gold/30 bg-white px-4 py-3.5"
      aria-label="Progression vers une récompense"
    >
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="text-[13px] font-semibold text-sapin leading-snug">
          {atteint ? (
            <>
              Récompense débloquée <span aria-hidden>·</span>{" "}
              <span className="text-gold-text">{RECOMPENSE_LABEL}</span>
            </>
          ) : (
            <>
              Plus que{" "}
              <span className="tabular-nums text-gold-text">
                {formatPrice(reste)}
              </span>{" "}
              pour gagner {RECOMPENSE_LABEL}
            </>
          )}
        </p>
        <span className="shrink-0 text-[11px] font-bold tabular-nums text-ink-faint">
          {pct}%
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-sapin/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={RECOMPENSE_PALIER_CENTS}
        aria-valuenow={Math.min(totalCents, RECOMPENSE_PALIER_CENTS)}
        aria-label="Progression vers la récompense"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-sapin to-gold transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </section>
  );
};

export default RecompenseProgress;
