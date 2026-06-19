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
 * Vignettes d'affichage en lecture seule (pas d'interaction).
 */
import { Camera } from "lucide-react";
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

/**
 * HOTFIX-VAGUE7 — derive titre dynamique depuis le relevé le plus récent
 * qui a un delta calculable. Format : "<Concurrent> · prix <produit> ±N%".
 *
 * Heuristique :
 *   - rows arrive trié releve_le desc (cf. snapshot route).
 *   - On prend le 1er relevé avec delta_pct != null (donc produit matché
 *     en base avec prix_drive_cents non-null).
 *   - Fallback : si aucun delta dispo mais des rows existent, on prend
 *     le libellé du plus récent sans delta.
 *   - Si rows vide → caller utilise titre "à activer".
 */
function deriveTitle(rows: CockpitCompetitorRow[]): {
  eyebrow: string;
  title: string;
  sub: string;
} {
  if (rows.length === 0) {
    return {
      eyebrow: "Intel concurrent · à activer",
      title: "Aucun relevé concurrent",
      sub: "Tape « Relevé » pour photographier prix Aya Market",
    };
  }

  // Tronque le libellé produit pour rester lisible sur 1 ligne mobile.
  const truncProduit = (s: string): string => {
    const clean = s.replace(/\s+/g, " ").trim();
    return clean.length > 28 ? clean.slice(0, 26) + "…" : clean;
  };

  // Défensif : prend le 1er relevé avec un delta numérique (pas undefined,
  // pas null). Sans cette garde, si l'API n'a pas encore exposé delta_pct
  // (cas où la version client est en avance sur le déploiement serveur),
  // on aurait crashé sur .toFixed(1).
  const hasNumericDelta = (r: CockpitCompetitorRow): boolean =>
    typeof r.delta_pct === "number" && Number.isFinite(r.delta_pct);
  const withDelta = rows.find(hasNumericDelta);
  const r = withDelta ?? rows[0];
  const concurrent = r.concurrent_nom || "Aya Market";
  const produit = truncProduit(r.libelle_releve);

  if (!hasNumericDelta(r)) {
    return {
      eyebrow: "Intel concurrent",
      title: `${concurrent} · ${produit}`,
      sub: "Prix relevé sans équivalent Salam mappé",
    };
  }

  // À ce stade r.delta_pct est numérique fini (validé par hasNumericDelta).
  const delta = r.delta_pct as number;
  const sign = delta > 0 ? "+" : "";
  const pct = `${sign}${delta.toFixed(1)}%`;
  // Convention : delta_pct = (concurrent - salam) / salam.
  //   - positif → concurrent + cher → on est mieux placés (titre vert)
  //   - négatif → concurrent - cher → menace pricing (titre orange)
  const sub =
    delta > 0
      ? "Salam mieux placé · 200m du dépôt"
      : delta < 0
        ? "Concurrent plus agressif · à investiguer"
        : "Prix alignés · 200m du dépôt";

  return {
    eyebrow: "Intel concurrent",
    title: `${concurrent} · prix ${produit} ${pct}`,
    sub,
  };
}

export function CompetitorCard({ rows, onAddRelevé }: CompetitorCardProps) {
  const empty = rows.length === 0;
  const titleData = deriveTitle(rows);

  return (
    <div className="lg p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--accent-gold-dim)]">
            {titleData.eyebrow}
          </p>
          <p className="text-[16px] font-bold text-[var(--text-primary)] leading-tight mt-0.5">
            {titleData.title}
          </p>
          <p className="text-[11.5px] text-[var(--text-tertiary)] mt-0.5">
            {titleData.sub}
          </p>
        </div>
        {onAddRelevé && (
          <button
            type="button"
            onClick={onAddRelevé}
            className="tap inline-flex items-center gap-1.5 min-h-[44px] md:min-h-0 md:h-9 px-4 rounded-full bg-[var(--primary-green)] text-white text-[13px] md:text-[12px] font-bold shrink-0"
            aria-label="Ajouter un relevé"
          >
            <Camera className="w-3.5 h-3.5" strokeWidth={2.4} />
            Relevé
          </button>
        )}
      </div>

      {empty && (
        <div className="rounded-2xl border border-dashed border-[var(--border-card)] py-6 text-center">
          <p className="text-[13px] font-semibold text-[var(--text-secondary)]">
            Aucun prix Aya Market relevé cette semaine.
          </p>
          <p className="text-[11.5px] text-[var(--text-tertiary)] mt-1">
            Tape « Relevé » pour photographier agneau, poulet, merguez.
          </p>
        </div>
      )}

      {!empty && (
        <div className="-mx-1 px-1 flex gap-2.5 overflow-x-auto scrollbar-none snap-x snap-mandatory">
          {rows.map((r, i) => (
            <article
              key={r.id}
              className="rise-in snap-start shrink-0 w-[150px] bg-[var(--surface-0)] border border-[var(--border-card)] rounded-2xl overflow-hidden"
              style={{ ["--i" as string]: i }}
            >
              {/* Photo */}
              <div
                className="w-full aspect-square bg-[var(--surface-2)] flex items-center justify-center"
                style={{
                  backgroundImage: r.photo_url ? `url(${r.photo_url})` : "none",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                {!r.photo_url && (
                  <Camera
                    className="w-6 h-6 text-[var(--text-tertiary)]"
                    strokeWidth={1.8}
                    aria-hidden
                  />
                )}
              </div>
              {/* Info */}
              <div className="px-2.5 py-2 flex flex-col gap-0.5">
                <p
                  className="text-[12px] font-bold text-[var(--text-primary)] truncate leading-tight"
                  title={r.libelle_releve}
                >
                  {r.libelle_releve}
                </p>
                <div className="flex items-baseline justify-between gap-1">
                  <p className="text-[15px] font-extrabold text-[var(--accent-gold-bright)] tabular">
                    {formatEur(r.prix_releve_eur)}
                  </p>
                  {r.unite && (
                    <p className="text-[10.5px] font-semibold text-[var(--text-tertiary)]">
                      /{r.unite}
                    </p>
                  )}
                </div>
                <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
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
