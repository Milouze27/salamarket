"use client";

/**
 * CompetitorCard — intel Aya Market.
 *
 * Aya Market est à 200m du dépôt Particulier. Otmane y envoie un
 * collaborateur 1x/semaine relever les prix. Aujourd'hui c'est dans
 * un cahier. Demain c'est ici : photo + prix + un seul tap pour
 * comparer ("on est 12% plus cher sur le poulet").
 *
 * Affiche les 5 derniers relevés en thumbnail row scrollable horizontale.
 * Tap → preview photo full + bouton "ajuster mon prix".
 */
import { Eye, Camera } from "lucide-react";
import type { CockpitCompetitorRow } from "@/app/api/cockpit/snapshot/route";

interface CompetitorCardProps {
  rows: CockpitCompetitorRow[];
  onAddRelevé?: () => void;
}

function formatEur(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n);
}

function formatRelativeDate(iso: string): string {
  const dt = new Date(iso);
  const now = new Date();
  const diffH = Math.floor((now.getTime() - dt.getTime()) / 3_600_000);
  if (diffH < 1) return "À l'instant";
  if (diffH < 24) return `Il y a ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "Hier";
  if (diffD < 7) return `Il y a ${diffD}j`;
  return dt.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function CompetitorCard({ rows, onAddRelevé }: CompetitorCardProps) {
  const empty = rows.length === 0;

  return (
    <div
      className="bg-white border border-[#E8E4D8] rounded-[22px] p-4 sm:p-5"
      style={{ boxShadow: "0 2px 12px rgba(14, 59, 46, 0.06)" }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-flex w-11 h-11 rounded-xl items-center justify-center shrink-0 bg-[#FAF7EE] text-[#0E3B2E] border border-[#E8E4D8]"
          >
            <Eye className="w-5 h-5" strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#5A6470]">
              Intel concurrent
            </p>
            <p className="text-[16px] font-bold text-[#0F1A14] leading-tight mt-0.5">
              Aya Market
            </p>
            <p className="text-[11.5px] text-[#7B8693] mt-0.5">
              200m — 5 derniers relevés
            </p>
          </div>
        </div>
        {onAddRelevé && (
          <button
            type="button"
            onClick={onAddRelevé}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-[#0E3B2E] text-white text-[12px] font-bold active:scale-[0.97] transition-transform shrink-0"
            aria-label="Ajouter un relevé"
          >
            <Camera className="w-3.5 h-3.5" strokeWidth={2.4} />
            Relevé
          </button>
        )}
      </div>

      {empty && (
        <div className="rounded-[16px] border border-dashed border-[#E8E4D8] py-6 text-center">
          <p className="text-[13px] font-semibold text-[#5A6470]">
            Pas encore de relevé.
          </p>
          <p className="text-[11.5px] text-[#7B8693] mt-1">
            Envoie un collaborateur cette semaine.
          </p>
        </div>
      )}

      {!empty && (
        <div className="-mx-1 px-1 flex gap-2.5 overflow-x-auto scrollbar-none snap-x snap-mandatory">
          {rows.map((r) => (
            <article
              key={r.id}
              className="snap-start shrink-0 w-[150px] bg-[#FAF7EE] border border-[#E8E4D8] rounded-[14px] overflow-hidden"
            >
              {/* Photo */}
              <div
                className="w-full aspect-square bg-[#E8E4D8] flex items-center justify-center"
                style={{
                  backgroundImage: r.photo_url ? `url(${r.photo_url})` : "none",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                {!r.photo_url && (
                  <Camera
                    className="w-6 h-6 text-[#B3AC95]"
                    strokeWidth={1.8}
                    aria-hidden
                  />
                )}
              </div>
              {/* Info */}
              <div className="px-2.5 py-2 flex flex-col gap-0.5">
                <p
                  className="text-[12px] font-bold text-[#0F1A14] truncate leading-tight"
                  title={r.libelle_releve}
                >
                  {r.libelle_releve}
                </p>
                <div className="flex items-baseline justify-between gap-1">
                  <p className="text-[15px] font-extrabold text-[#0E3B2E] tabular">
                    {formatEur(r.prix_releve_eur)}
                  </p>
                  {r.unite && (
                    <p className="text-[10.5px] font-semibold text-[#7B8693]">
                      /{r.unite}
                    </p>
                  )}
                </div>
                <p className="text-[10px] text-[#7B8693] mt-0.5">
                  {formatRelativeDate(r.releve_le)}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
