import { fr } from "date-fns/locale";
import { format } from "date-fns-tz";

import { BRAND } from "@/config/brand";

import { RetraitCountdown } from "./RetraitCountdown";

// Récapitulatif de retrait en « carte d'embarquement » : créneau + magasin
// + numéro de commande mis en page comme un billet (gros chiffres tabulaires,
// séparateur perforé CSS). Pur affichage additif — lit les données déjà
// présentes sur la page de confirmation.

const PARIS_TZ = "Europe/Paris";

interface RetraitPassProps {
  orderShortId: string;
  slotStart: string;
  slotEnd: string;
}

// Découpe le créneau en blocs (jour relatif + plage horaire) pour la mise en
// page billet. Même logique de fuseau que OrderConfirmation (Europe/Paris).
function describeSlot(slotStart: string, slotEnd: string) {
  const startDate = new Date(slotStart);
  const endDate = new Date(slotEnd);

  const dayKey = (d: Date) => format(d, "yyyy-MM-dd", { timeZone: PARIS_TZ });
  const startKey = dayKey(startDate);
  const todayKey = dayKey(new Date());
  const tomorrowKey = dayKey(new Date(Date.now() + 24 * 60 * 60 * 1000));

  let dayLabel: string;
  if (startKey === todayKey) dayLabel = "Aujourd'hui";
  else if (startKey === tomorrowKey) dayLabel = "Demain";
  else
    dayLabel = format(startDate, "EEEE d MMMM", {
      timeZone: PARIS_TZ,
      locale: fr,
    });

  const startTime = format(startDate, "HH'h'mm", {
    timeZone: PARIS_TZ,
    locale: fr,
  });
  const endTime = format(endDate, "HH'h'mm", {
    timeZone: PARIS_TZ,
    locale: fr,
  });

  return { dayLabel, startTime, endTime };
}

export function RetraitPass({
  orderShortId,
  slotStart,
  slotEnd,
}: RetraitPassProps) {
  const { dayLabel, startTime, endTime } = describeSlot(slotStart, slotEnd);

  return (
    <div className="overflow-hidden rounded-2xl border border-sapin/15 bg-white shadow-[0_18px_40px_-22px_rgba(8,42,32,0.4)]">
      {/* Volet haut — créneau, l'info maîtresse du billet. */}
      <div className="px-6 pt-6 pb-7">
        <p className="text-[10px] uppercase tracking-[0.28em] font-bold text-gold-text">
          Carte de retrait
        </p>

        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] font-bold text-sapin/55">
              {dayLabel}
            </p>
            <p className="mt-1 text-[34px] leading-none font-extrabold tabular-nums tracking-[-0.03em] text-sapin">
              {startTime}
            </p>
          </div>
          <div className="pb-1 text-right">
            <p className="text-[11px] uppercase tracking-[0.16em] font-bold text-sapin/55">
              Jusqu'à
            </p>
            <p className="mt-1 text-[20px] leading-none font-bold tabular-nums tracking-[-0.02em] text-sapin/80">
              {endTime}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <RetraitCountdown slotStart={slotStart} />
        </div>
      </div>

      {/* Séparateur perforé — encoches latérales + pointillés, code du billet.
          Réalisé en pur CSS (radial-gradient pour les encoches, bordure
          pointillée pour la perforation). */}
      <div className="relative h-0 border-t border-dashed border-sapin/25">
        <span
          aria-hidden
          className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-cream"
        />
        <span
          aria-hidden
          className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-cream"
        />
      </div>

      {/* Volet bas — magasin + numéro de commande. */}
      <div className="grid grid-cols-[1fr_auto] gap-4 px-6 pt-6 pb-6">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-gold-text">
            Magasin
          </p>
          <p className="mt-1.5 text-[14px] font-semibold text-sapin">
            {BRAND.store.name}
          </p>
          <p className="text-[12px] text-ink/60">
            {BRAND.store.address} · {BRAND.store.postalCode} {BRAND.store.city}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.22em] font-bold text-gold-text">
            N° retrait
          </p>
          <p className="mt-1.5 select-allow font-mono text-[16px] font-semibold uppercase tabular-nums tracking-tight text-sapin">
            {orderShortId}
          </p>
        </div>
      </div>
    </div>
  );
}
