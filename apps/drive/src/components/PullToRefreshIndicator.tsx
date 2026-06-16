import { Loader2 } from "lucide-react";
import { BRAND } from "@/config/brand";

interface Props {
  /** Décalage courant de la traction, en px. */
  pull: number;
  /** Seuil franchi : relâcher déclenchera le refresh. */
  armed: boolean;
  /** Refetch en cours. */
  refreshing: boolean;
}

const THRESHOLD = 72;

/**
 * Indicateur visuel du pull-to-refresh maison (cf. usePullToRefresh). Bandeau
 * qui descend depuis le haut en suivant la traction, libellé typographique
 * qui passe de « Tirez » → « Relâchez » → « Mise à jour ». Le cercle de
 * progression se remplit avec la traction ; le spinner n'apparaît que pendant
 * le refetch réel (état fonctionnel, pas un ornement).
 *
 * mobile-first : le hook ne renvoie jamais pull>0 sur desktop / reduced-motion,
 * donc ce composant reste invisible (translate -100%) dans ces cas.
 */
export const PullToRefreshIndicator = ({ pull, armed, refreshing }: Props) => {
  const active = pull > 0 || refreshing;
  // Progression 0→1 de la traction, plafonnée au seuil.
  const progress = Math.min(pull / THRESHOLD, 1);
  const label = refreshing
    ? "Mise à jour…"
    : armed
      ? "Relâchez pour rafraîchir"
      : "Tirez pour rafraîchir";

  return (
    <div
      aria-hidden={!refreshing}
      className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center md:hidden"
      style={{
        // On positionne le badge dans la zone tirée : il glisse avec le doigt.
        transform: `translateY(${active ? pull : 0}px)`,
        opacity: active ? 1 : 0,
        transition: refreshing
          ? "transform 200ms ease-out"
          : pull > 0
            ? "none"
            : "transform 220ms ease-out, opacity 220ms ease-out",
      }}
    >
      <div
        className="mt-2 flex items-center gap-2 rounded-full bg-sapin px-4 py-2 text-white shadow-lg shadow-sapin/30"
        style={{
          // Léger effet d'apparition : le badge grossit au fil de la traction.
          transform: `scale(${0.85 + progress * 0.15})`,
        }}
      >
        {refreshing ? (
          <Loader2 size={15} className="animate-spin text-gold-bright" aria-hidden />
        ) : (
          <span
            aria-hidden
            className="h-[15px] w-[15px] rounded-full border-2 border-white/30"
            style={{
              // Anneau de progression : l'arc or se révèle avec la traction.
              borderTopColor: armed ? BRAND.colors.accentBright : BRAND.colors.accent,
              transform: `rotate(${progress * 270}deg)`,
              transition: "transform 60ms linear",
            }}
          />
        )}
        <span className="text-[12px] font-semibold tracking-[0.01em]">{label}</span>
      </div>
      {/* Annonce lecteur d'écran : seulement à l'instant du refetch. */}
      <span aria-live="polite" className="sr-only">
        {refreshing ? "Mise à jour du catalogue" : ""}
      </span>
    </div>
  );
};
