import { Check, ChefHat, Clock, Package, PackageCheck } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";

const PARIS_TZ = "Europe/Paris";

/**
 * Étapes canoniques de la frise (FR) — alignées sur commandes_drive.statut.
 * La liste Drive agrège deux sources : `orders` (statuts EN) et
 * `commandes_drive` (statuts FR). On normalise tout vers ces 4 étapes.
 */
type Step = "a_preparer" | "en_preparation" | "pret" | "retire";

const STEPS: {
  key: Step;
  label: string;
  hint: string;
  Icon: typeof Clock;
}[] = [
  {
    key: "a_preparer",
    label: "Commande reçue",
    hint: "Nous avons bien reçu votre commande",
    Icon: Clock,
  },
  {
    key: "en_preparation",
    label: "En préparation",
    hint: "Votre commande est en cours de préparation",
    Icon: ChefHat,
  },
  {
    key: "pret",
    label: "Prête pour retrait",
    hint: "Présentez-vous en magasin pour récupérer votre commande",
    Icon: Package,
  },
  {
    key: "retire",
    label: "Retirée",
    hint: "Commande remise · merci de votre confiance",
    Icon: PackageCheck,
  },
];

/** Mappe n'importe quel statut (EN ou FR) vers une étape canonique de la frise. */
const normalizeStatus = (status: string): Step | "annule" => {
  switch (status) {
    // commandes_drive (FR)
    case "a_preparer":
      return "a_preparer";
    case "en_preparation":
      return "en_preparation";
    case "pret":
      return "pret";
    case "retire":
      return "retire";
    case "annule":
      return "annule";
    // orders legacy (EN)
    case "pending":
    case "confirmed":
      return "a_preparer";
    case "preparing":
      return "en_preparation";
    case "ready":
      return "pret";
    case "picked_up":
      return "retire";
    case "cancelled":
      return "annule";
    default:
      return "a_preparer";
  }
};

/**
 * Calcule l'heure de retrait estimée à partir du créneau.
 * La table n'a pas de timestamps par statut : on dérive l'ETA du
 * `creneau_retrait` (slot_start) plutôt que d'inventer des horodatages.
 */
const formatEta = (slotStart: string | null): string | null => {
  if (!slotStart) return null;
  const start = toZonedTime(new Date(slotStart), PARIS_TZ);
  if (Number.isNaN(start.getTime())) return null;
  return format(start, "HH'h'mm", { locale: fr });
};

interface OrderStatusTimelineProps {
  status: string;
  /** ISO date — creneau_retrait / pickup_slot.slot_start. */
  slotStart?: string | null;
  className?: string;
}

export const OrderStatusTimeline = ({
  status,
  slotStart,
  className = "",
}: OrderStatusTimelineProps) => {
  const current = normalizeStatus(status);
  const eta = formatEta(slotStart ?? null);

  // Commande annulée : on sort de la frise linéaire avec un état dédié.
  if (current === "annule") {
    return (
      <div
        className={`rounded-2xl border border-destructive/30 bg-destructive/5 p-4 ${className}`}
      >
        <p className="text-sm font-semibold text-destructive">
          Commande annulée
        </p>
        <p className="mt-1 text-xs text-muted">
          Cette commande a été annulée. Contactez le magasin pour toute
          question.
        </p>
      </div>
    );
  }

  const currentIdx = STEPS.findIndex((s) => s.key === current);
  const isReady = current === "pret";
  const isDone = current === "retire";

  return (
    <div className={className}>
      {/* Bandeau ETA / état mis en valeur */}
      <div
        className={`mb-4 flex items-center gap-3 rounded-2xl border p-3.5 ${
          isReady
            ? "border-success/30 bg-success/5"
            : isDone
              ? "border-border bg-muted/40"
              : "border-sapin/20 bg-sapin/5"
        }`}
      >
        <span
          aria-hidden
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            isReady
              ? "bg-success text-white"
              : isDone
                ? "bg-sapin text-white"
                : "bg-sapin/10 text-sapin"
          }`}
        >
          {isReady ? (
            <Package size={20} />
          ) : isDone ? (
            <Check size={20} />
          ) : (
            <Clock size={20} />
          )}
        </span>
        <div className="min-w-0">
          {isReady ? (
            <>
              <p className="text-sm font-bold text-success">
                Prête pour retrait
              </p>
              <p className="text-xs text-muted">
                Présentez-vous en magasin pour récupérer votre commande.
              </p>
            </>
          ) : isDone ? (
            <>
              <p className="text-sm font-bold text-text">Commande retirée</p>
              <p className="text-xs text-muted">
                Merci de votre confiance · à bientôt.
              </p>
            </>
          ) : eta ? (
            <>
              <p className="text-sm font-bold text-sapin">
                Prêt vers <span className="tabular-nums">{eta}</span>
              </p>
              <p className="text-xs text-muted">
                Estimation basée sur votre créneau de retrait.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-sapin">
                Préparation en cours
              </p>
              <p className="text-xs text-muted">
                Vous serez prévenu dès que votre commande sera prête.
              </p>
            </>
          )}
        </div>
      </div>

      {/* Frise verticale */}
      <ol className="relative flex flex-col">
        {STEPS.map((step, idx) => {
          const done = idx < currentIdx;
          const active = idx === currentIdx;
          const isLast = idx === STEPS.length - 1;
          const reached = done || active;
          const { Icon } = step;

          return (
            <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0">
              {/* Ligne verticale reliant les étapes */}
              {!isLast && (
                <span
                  aria-hidden
                  className={`absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5 ${
                    done ? "bg-sapin" : "bg-border"
                  }`}
                />
              )}

              {/* Pastille */}
              <span
                aria-hidden
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  done
                    ? "border-sapin bg-sapin text-white"
                    : active
                      ? "border-sapin bg-white text-sapin ring-4 ring-sapin/10"
                      : "border-border bg-white text-muted"
                }`}
              >
                {done ? <Check size={16} /> : <Icon size={16} />}
              </span>

              {/* Texte de l'étape */}
              <div className="min-w-0 pt-0.5">
                <p
                  className={`text-sm font-semibold ${
                    active ? "text-sapin" : reached ? "text-text" : "text-muted"
                  }`}
                >
                  {step.label}
                </p>
                {active && (
                  <p className="mt-0.5 text-xs text-muted">{step.hint}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default OrderStatusTimeline;
