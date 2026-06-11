"use client";

/**
 * HeatmapVentes — chaleur des ventes magasin par jour de semaine × heure.
 *
 * Data : agrégats `heatmap` de /api/cockpit/snapshot (ventes_cashmag_import,
 * date_vente + heure_vente, sur 14 jours). Le serveur ne renvoie que les
 * cellules non vides ; on reconstruit la grille pleine ici.
 *
 * On borne l'affichage aux heures d'ouverture pertinentes (7h→22h) pour
 * éviter une grille géante de cases vides. Couleur = sapin avec opacité
 * proportionnelle au CA de la cellule (vs cellule la plus chaude).
 * Mobile-first : scroll horizontal si la grille déborde.
 */
import { Flame } from "lucide-react";
import type { CockpitHeatmap } from "@/app/api/cockpit/snapshot/route";

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const HEURE_MIN = 7;
const HEURE_MAX = 22; // inclus

function formatEur(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function HeatmapVentes({
  data,
}: {
  data: CockpitHeatmap | null | undefined;
}) {
  const cells = data?.cells ?? [];

  // Index (jour,heure) → CA pour lookup O(1) à l'affichage.
  const map = new Map<string, number>();
  let maxCa = 0;
  for (const c of cells) {
    if (c.heure < HEURE_MIN || c.heure > HEURE_MAX) continue;
    map.set(`${c.jour_semaine}-${c.heure}`, c.ca_eur);
    if (c.ca_eur > maxCa) maxCa = c.ca_eur;
  }

  const heures: number[] = [];
  for (let h = HEURE_MIN; h <= HEURE_MAX; h++) heures.push(h);

  const aucuneVente = maxCa <= 0;

  return (
    <section className="bg-white border border-rule rounded-2xl overflow-hidden">
      <header className="px-4 py-3.5 border-b border-rule flex items-center gap-2">
        <Flame className="w-4 h-4 text-warning shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-extrabold text-text-primary truncate">
            Chaleur des ventes magasin
          </p>
          <p className="text-[11px] text-text-secondary">
            CA par créneau · {data?.fenetre_jours ?? 14} derniers jours
            {data?.pic_heure !== null && data?.pic_heure !== undefined
              ? ` · pic à ${data.pic_heure}h`
              : ""}
          </p>
        </div>
        {data && data.ca_total_eur > 0 && (
          <span className="text-[11px] font-bold text-text-tertiary tabular-nums shrink-0">
            {formatEur(data.ca_total_eur)}
          </span>
        )}
      </header>

      {aucuneVente ? (
        <div className="px-4 py-8 text-center">
          <Flame className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
          <p className="text-[12.5px] text-text-secondary">
            Pas encore de ventes magasin importées sur la période.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto p-3 scrollbar-none">
          <table className="border-separate border-spacing-[3px] mx-auto">
            <thead>
              <tr>
                <th className="w-8" aria-hidden />
                {heures.map((h) => (
                  <th
                    key={h}
                    className="text-[9px] font-bold text-text-tertiary tabular-nums text-center w-6 pb-1"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {JOURS.map((jour, ji) => (
                <tr key={jour}>
                  <td className="text-[10px] font-bold text-text-secondary pr-1 text-right w-8">
                    {jour}
                  </td>
                  {heures.map((h) => {
                    const ca = map.get(`${ji}-${h}`) ?? 0;
                    const ratio = maxCa > 0 ? ca / maxCa : 0;
                    // Opacité plancher pour les cellules avec un peu de CA,
                    // afin qu'elles restent visibles sans noyer le pic.
                    const opacity =
                      ca > 0 ? 0.18 + ratio * 0.82 : 0;
                    return (
                      <td key={h} className="p-0">
                        <div
                          className="w-6 h-6 rounded-[5px] border border-rule"
                          style={{
                            background:
                              ca > 0
                                ? `color-mix(in srgb, var(--primary-green) ${Math.round(
                                    opacity * 100,
                                  )}%, var(--bg-cream))`
                                : "var(--bg-cream)",
                          }}
                          title={
                            ca > 0
                              ? `${jour} ${h}h · ${formatEur(ca)}`
                              : `${jour} ${h}h · —`
                          }
                          aria-label={`${jour} ${h}h ${
                            ca > 0 ? formatEur(ca) : "aucune vente"
                          }`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Légende d'intensité */}
          <div className="flex items-center justify-end gap-1.5 mt-2 pr-1">
            <span className="text-[9.5px] font-semibold text-text-tertiary">
              moins
            </span>
            {[0.2, 0.45, 0.7, 1].map((o) => (
              <span
                key={o}
                className="w-3.5 h-3.5 rounded-[4px] border border-rule"
                style={{
                  background: `color-mix(in srgb, var(--primary-green) ${Math.round(
                    o * 100,
                  )}%, var(--bg-cream))`,
                }}
              />
            ))}
            <span className="text-[9.5px] font-semibold text-text-tertiary">
              plus
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
