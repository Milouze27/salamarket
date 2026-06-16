import * as ProgressPrimitive from "@radix-ui/react-progress";
import { useCartTotalCents } from "@/hooks/useCartSummary";
import { MIN_ORDER_CENTS } from "@/lib/constants";
import { formatPrice } from "@/lib/format";

/**
 * Jauge "plus que X € pour le minimum de commande" — barre de progression
 * Radix animée vers MIN_ORDER_CENTS. Une fois le seuil franchi, bascule en
 * état "Minimum atteint" (barre sapin pleine + libellé sapin).
 *
 * Lecture seule via useCartTotalCents (même base que le sous-total affiché,
 * remise DLC incluse) ; n'influence en rien le checkout. Rappel pédagogique
 * placé dans le récap, en plus de la jauge de la barre d'action en bas.
 */
export const MinOrderGauge = () => {
  const totalCents = useCartTotalCents();
  const reached = totalCents >= MIN_ORDER_CENTS;
  const pct = Math.min(
    100,
    Math.round((totalCents / MIN_ORDER_CENTS) * 100),
  );
  const remaining = Math.max(0, MIN_ORDER_CENTS - totalCents);

  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-sapin-deep">
          {reached ? (
            "Minimum de commande atteint"
          ) : (
            <>
              Plus que{" "}
              <span className="tabular-nums">{formatPrice(remaining)}</span>{" "}
              pour le minimum
            </>
          )}
        </span>
        <span className="text-[12px] text-muted tabular-nums">
          {formatPrice(totalCents)} / {formatPrice(MIN_ORDER_CENTS)}
        </span>
      </div>
      <ProgressPrimitive.Root
        value={pct}
        max={100}
        aria-label="Progression vers le minimum de commande"
        className="relative h-2 w-full overflow-hidden rounded-full bg-sapin/10"
      >
        <ProgressPrimitive.Indicator
          className={`h-full w-full rounded-full transition-transform duration-500 ease-out ${
            reached
              ? "bg-sapin"
              : "bg-gradient-to-r from-sapin to-gold"
          }`}
          style={{ transform: `translateX(-${100 - pct}%)` }}
        />
      </ProgressPrimitive.Root>
    </div>
  );
};
