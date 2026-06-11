"use client";

/**
 * Leaderboard — classement des préparateurs Drive (cadence & ponctualité).
 *
 * Data : agrégats `leaderboard` de /api/cockpit/snapshot, calculés sans
 * migration à partir de commandes_drive_lignes (prepare_par_employe_id,
 * prepare_at) joints au créneau de retrait de la commande.
 *
 *   - Cadence  = nombre de lignes préparées sur la fenêtre (14 j).
 *   - Ponctualité = part de lignes préparées AVANT le créneau de retrait.
 *
 * Charte crème (page admin/activite). Mobile-first, anti-overflow sur les
 * prénoms longs (truncate), barre de cadence proportionnelle au leader.
 */
import { Crown, Medal, Timer, Trophy } from "lucide-react";
import type { CockpitLeaderboard } from "@/app/api/cockpit/snapshot/route";

function ponctualiteTone(pct: number | null): {
  bg: string;
  text: string;
  label: string;
} {
  if (pct === null)
    return {
      bg: "bg-cream",
      text: "text-text-tertiary",
      label: "—",
    };
  if (pct >= 90)
    return {
      bg: "bg-success-soft",
      text: "text-success",
      label: `${pct.toFixed(0)}%`,
    };
  if (pct >= 70)
    return {
      bg: "bg-gold-soft",
      text: "text-primary-dark",
      label: `${pct.toFixed(0)}%`,
    };
  return {
    bg: "bg-warning-soft",
    text: "text-warning",
    label: `${pct.toFixed(0)}%`,
  };
}

function rankBadge(i: number) {
  if (i === 0)
    return (
      <span className="w-7 h-7 rounded-full bg-gold-soft text-primary-dark flex items-center justify-center shrink-0">
        <Crown className="w-3.5 h-3.5" />
      </span>
    );
  if (i === 1)
    return (
      <span className="w-7 h-7 rounded-full bg-cream text-text-secondary flex items-center justify-center shrink-0">
        <Medal className="w-3.5 h-3.5" />
      </span>
    );
  if (i === 2)
    return (
      <span className="w-7 h-7 rounded-full bg-cream text-text-secondary flex items-center justify-center shrink-0">
        <Medal className="w-3.5 h-3.5" />
      </span>
    );
  return (
    <span className="w-7 h-7 rounded-full bg-cream text-text-tertiary flex items-center justify-center shrink-0 text-[12px] font-extrabold tabular-nums">
      {i + 1}
    </span>
  );
}

export function Leaderboard({
  data,
}: {
  data: CockpitLeaderboard | null | undefined;
}) {
  const rows = data?.top ?? [];
  const maxLignes = rows.reduce(
    (m, r) => Math.max(m, r.lignes_preparees),
    0,
  );

  return (
    <section className="bg-white border border-rule rounded-2xl overflow-hidden">
      <header className="px-4 py-3.5 border-b border-rule flex items-center gap-2">
        <Trophy className="w-4 h-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-extrabold text-text-primary truncate">
            Préparateurs Drive
          </p>
          <p className="text-[11px] text-text-secondary">
            Cadence &amp; ponctualité · {data?.fenetre_jours ?? 14} derniers
            jours
          </p>
        </div>
        {data && data.total_lignes > 0 && (
          <span className="text-[11px] font-bold text-text-tertiary tabular-nums shrink-0">
            {data.total_lignes} lignes
          </span>
        )}
      </header>

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <Timer className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
          <p className="text-[12.5px] text-text-secondary">
            Aucune préparation enregistrée sur la période.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-rule">
          {rows.map((r, i) => {
            const tone = ponctualiteTone(r.ponctualite_pct);
            const pct =
              maxLignes > 0 ? (r.lignes_preparees / maxLignes) * 100 : 0;
            const nom = `${r.prenom ?? ""} ${r.nom ?? ""}`.trim() || "Préparateur";
            return (
              <li
                key={r.employe_id}
                className="px-3 py-3 flex items-center gap-3"
              >
                {rankBadge(i)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-bold text-text-primary truncate">
                      {nom}
                    </p>
                    <span className="text-[13px] font-extrabold text-text-primary tabular-nums shrink-0">
                      {r.lignes_preparees}
                    </span>
                  </div>
                  {/* Barre de cadence proportionnelle au leader */}
                  <div className="mt-1.5 h-1.5 rounded-full bg-cream overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(pct, 4)}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold ${tone.bg} ${tone.text}`}
                    >
                      <Timer className="w-3 h-3" />
                      Ponctuel {tone.label}
                    </span>
                    {r.en_retard > 0 && (
                      <span className="text-[10.5px] font-semibold text-text-tertiary tabular-nums">
                        {r.en_retard} en retard
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
