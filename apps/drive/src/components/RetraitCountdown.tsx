import { useEffect, useState } from "react";

// Compte à rebours sobre avant le créneau de retrait. Dérivé de la date de
// début du créneau, rafraîchi à la minute via setInterval (nettoyé au
// démontage). Passé l'échéance, on s'arrête proprement sur « C'est
// aujourd'hui ! ». Logique date pure, pur affichage additif.

interface RetraitCountdownProps {
  /** Début du créneau (ISO 8601). */
  slotStart: string;
}

// Renvoie le libellé « Retrait dans 14 h 20 » (ou variantes) à partir du
// delta en millisecondes. Au-delà / à l'échéance → null (géré par l'appelant).
function formatRemaining(diffMs: number): string | null {
  if (diffMs <= 0) return null;

  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  if (days >= 1) {
    return hours > 0 ? `${days} j ${hours} h` : `${days} j`;
  }
  if (hours >= 1) {
    return `${hours} h ${String(minutes).padStart(2, "0")}`;
  }
  return `${minutes} min`;
}

export function RetraitCountdown({ slotStart }: RetraitCountdownProps) {
  const startMs = new Date(slotStart).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Rafraîchi à la minute. Si l'échéance est déjà passée, inutile de
    // continuer à ticker.
    if (Number.isNaN(startMs)) return;
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [startMs]);

  if (Number.isNaN(startMs)) return null;

  const label = formatRemaining(startMs - now);

  return (
    <div className="flex items-baseline gap-2.5">
      <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-gold-text">
        {label ? "Retrait dans" : "Retrait"}
      </span>
      <span className="text-[15px] font-bold tabular-nums text-sapin">
        {label ?? "C'est aujourd'hui !"}
      </span>
    </div>
  );
}
