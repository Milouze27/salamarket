"use client";

/**
 * /v2/forecast — Moteur de stockout prédictif (Holt + courbe hijri).
 *
 * Pour Otmane : "regarde — à J-28 du Ramadan, l'algo a déjà mis tes
 * dattes Medjool en alerte. 3.2 j de stock, target 8. Aya Market n'a
 * pas ça."
 *
 * Source : view `v_stockout_critiques` (migration 0035). Tout est
 * pré-trié SQL : out → blocker → crit → warn, ascending par days_cover.
 *
 * Filtre par tier en pills horizontales (scroll-x sur mobile).
 * Action principale par ligne : "Préparer commande" → /v2/admin (où
 * l'orchestrateur PO drafté pourra se brancher plus tard — pour l'instant
 * mock toast).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Loader2,
  Moon,
  PackageX,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { EditorialEyebrow } from "@/components/v2/EditorialEyebrow";
import { supabase } from "@/lib/supabase";
import { useV2 } from "@/lib/v2-store";
import { resolveHijriContext, formatHijri } from "@/lib/forecast/hijri";
import type { StockoutTier } from "@/lib/forecast/holt";

type HijriPhase =
  | "normal"
  | "pre_ramadan_j7"
  | "ramadan_debut"
  | "ramadan_milieu"
  | "ramadan_fin_10j"
  | "aid_fitr_j3"
  | "pre_aid_adha_j7"
  | "aid_adha_j3"
  | "achoura_j3";

interface ForecastRow {
  produit_id: string;
  depot_id: string;
  produit_nom: string;
  code_barre: string | null;
  depot_nom: string;
  stock_actuel: number;
  velocity_adj: number;
  days_cover: number | null;
  tier: StockoutTier;
  phase_courante: HijriPhase;
  multiplicateur: number;
  reason: string | null;
  computed_at: string;
}

const TIER_LABEL: Record<StockoutTier, string> = {
  out: "Rupture",
  blocker: "Bloquant",
  crit: "Critique",
  warn: "À surveiller",
  ok: "OK",
};

const TIER_STYLE: Record<
  StockoutTier,
  { chip: string; border: string; daysColor: string; bg: string }
> = {
  out: {
    chip: "bg-[#A8231A] text-white",
    border: "border-[#A8231A]/60",
    daysColor: "text-[#8A1A12]",
    bg: "bg-[#FBE9E7]",
  },
  blocker: {
    chip: "bg-[#A8231A] text-white",
    border: "border-[#A8231A]/40",
    daysColor: "text-[#A8231A]",
    bg: "bg-[#FBE9E7]",
  },
  crit: {
    chip: "bg-[#E5483D] text-white",
    border: "border-[#E5483D]/40",
    daysColor: "text-[#A8231A]",
    bg: "bg-[#FBE9E7]",
  },
  warn: {
    chip: "bg-[#D97706] text-white",
    border: "border-[#D97706]/40",
    daysColor: "text-[#92400E]",
    bg: "bg-[#FEF3E2]",
  },
  ok: {
    chip: "bg-success text-white",
    border: "border-success/30",
    daysColor: "text-success",
    bg: "bg-success-soft",
  },
};

const FILTERS: Array<{ key: "all" | StockoutTier; label: string }> = [
  { key: "all", label: "Tout" },
  { key: "out", label: "Rupture" },
  { key: "blocker", label: "Bloquant" },
  { key: "crit", label: "Critique" },
  { key: "warn", label: "Surveille" },
];

function formatDays(d: number | null): string {
  if (d === null) return "—";
  if (d < 1) return `${Math.round(d * 24)} h`;
  return `${d.toFixed(1)} j`;
}

function recommendedOrder(row: ForecastRow): {
  qty: number;
  unit: string;
  rationale: string;
} {
  // Suggestion = couverture cible 8 jours × vélocité ajustée.
  const target = 8;
  const need = Math.max(0, target * row.velocity_adj - row.stock_actuel);
  // Arrondi pratique (carton ~12 unités, on arrondit au carton supérieur).
  const qty = Math.max(1, Math.ceil(need / 12));
  return {
    qty,
    unit: "cartons",
    rationale: `Vise ${target} j de couverture (vitesse ajustée ${row.velocity_adj.toFixed(1)} u/j × phase × ${row.multiplicateur.toFixed(2)}).`,
  };
}

export default function ForecastPage() {
  const depot = useV2((s) => s.currentDepot);
  const [rows, setRows] = useState<ForecastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [filter, setFilter] = useState<"all" | StockoutTier>("all");
  const [allDepots, setAllDepots] = useState(false);

  const hijriCtx = useMemo(() => resolveHijriContext(new Date()), []);

  const load = useCallback(async () => {
    setLoading(true);
    const sb = supabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    let query = sb
      .from("v_stockout_critiques")
      .select(
        "produit_id, depot_id, produit_nom, code_barre, depot_nom, stock_actuel, velocity_adj, days_cover, tier, phase_courante, multiplicateur, reason, computed_at",
      )
      .limit(300);
    if (!allDepots && depot?.id) {
      query = query.eq("depot_id", depot.id);
    }
    const { data, error } = await query;
    if (error) {
      // La vue v_stockout_critiques n'existe peut-être pas encore en local
      // (migration 0035 pas jouée). Plutôt qu'un toast d'erreur qui fait
      // peur, on log silencieusement et on laisse l'empty state expliquer.
      console.warn("[forecast] view query failed:", error.message);
      setRows([]);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as ForecastRow[]);
    setLoading(false);
  }, [allDepots, depot?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<StockoutTier, number> = {
      ok: 0,
      warn: 0,
      crit: 0,
      blocker: 0,
      out: 0,
    };
    for (const r of rows) c[r.tier] = (c[r.tier] ?? 0) + 1;
    return c;
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => r.tier === filter);
  }, [rows, filter]);

  async function handleRecompute() {
    setRecomputing(true);
    try {
      const res = await fetch("/api/forecast/recompute", { method: "POST" });
      const json = (await res.json()) as {
        ok?: boolean;
        couples_total?: number;
        forecast_upserted?: number;
        duration_ms?: number;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        toast.error(`Recompute échoué : ${json.error ?? "erreur inconnue"}`);
      } else {
        toast.success(
          `Recompute OK · ${json.forecast_upserted ?? 0} couples · ${json.duration_ms ?? 0} ms`,
          { duration: 3000 },
        );
        await load();
      }
    } catch (err) {
      toast.error(
        `Recompute exception : ${err instanceof Error ? err.message : "erreur"}`,
      );
    } finally {
      setRecomputing(false);
    }
  }

  async function handleDraftPO(row: ForecastRow) {
    const rec = recommendedOrder(row);
    // Démo : mock. La vraie intégration PO arrivera quand /v2/admin
    // intègrera le module purchase-orders (migration 0036 déjà prête).
    toast.success(
      `Commande draftée : ${rec.qty} ${rec.unit} de ${row.produit_nom}`,
      { description: rec.rationale, duration: 4500 },
    );
  }

  const lastComputedAt = rows[0]?.computed_at
    ? new Date(rows[0].computed_at)
    : null;
  const lastComputedLabel = lastComputedAt
    ? lastComputedAt.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <V2Shell hideNav>
      <PageAccentStripe accent="sapin-or" />
      <header className="px-4 sm:px-5 pt-7">
        <BackButton />
        <EditorialEyebrow num="01" label="Forecast" className="mt-3" />
        <h1 className="h1-display mt-1">
          Ruptures <span className="gold">imminentes</span>
        </h1>
        <p className="body-md text-text-secondary mt-2 max-w-prose">
          Lissage Holt sur 14 jours × courbe de demande hijri.
          L&apos;algo ajuste la vélocité par phase Ramadan / Aïd avant de
          calculer les jours de couverture.
        </p>
      </header>

      {/* Bandeau contexte hijri — c'est LE moment "wow" du pitch */}
      <section className="px-4 sm:px-5 mt-5">
        <div
          className="relative overflow-hidden rounded-[22px] p-5 text-white"
          style={{
            background:
              "linear-gradient(135deg, #0E3B2E 0%, #14523F 60%, #C9A227 140%)",
          }}
        >
          <div
            aria-hidden
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 95% 5%, rgba(255,255,255,0.20) 0%, transparent 55%)",
            }}
          />
          <div className="relative flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm shrink-0">
              <Moon className="w-5 h-5 text-[#F4E9C4]" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#F4E9C4]">
                Phase courante · {formatHijri(hijriCtx.hijri)}
              </p>
              <p className="text-[17px] font-extrabold leading-tight mt-1">
                {hijriCtx.label}
              </p>
              {hijriCtx.nextEventDaysAway !== null && (
                <p className="text-[12.5px] text-white/85 mt-1.5 flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Prochain pic — <strong>{hijriCtx.nextEventLabel}</strong>{" "}
                    dans <strong>{hijriCtx.nextEventDaysAway} jours</strong>
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* KPI grid */}
      <section className="px-4 sm:px-5 mt-4 grid grid-cols-2 gap-2.5">
        <KpiCard
          variant="danger"
          icon={<AlertOctagon className="w-4 h-4" />}
          eyebrow="RUPTURES + BLOQUANT"
          value={`${counts.out + counts.blocker}`}
          label="à commander aujourd'hui"
        />
        <KpiCard
          variant="warn"
          icon={<AlertTriangle className="w-4 h-4" />}
          eyebrow="CRITIQUE"
          value={`${counts.crit}`}
          label="< 3 jours de couverture"
        />
        <KpiCard
          variant="gold"
          icon={<TrendingUp className="w-4 h-4" />}
          eyebrow="À SURVEILLER"
          value={`${counts.warn}`}
          label="< 7 jours"
        />
        <KpiCard
          variant="neutral"
          icon={<Sparkles className="w-4 h-4" />}
          eyebrow="DERNIER CALCUL"
          value={lastComputedLabel}
          label={rows.length > 0 ? `${rows.length} couples surveillés` : "Aucun calcul"}
        />
      </section>

      {/* Toolbar : filter pills + scope toggle + recompute */}
      <section className="px-4 sm:px-5 mt-5">
        <div className="flex items-center gap-2 mb-3">
          <button
            type="button"
            onClick={() => setAllDepots((v) => !v)}
            className="pill-filter min-h-[44px] md:min-h-0"
            data-active={allDepots}
          >
            {allDepots ? "Tous dépôts" : depot?.nom ?? "Dépôt courant"}
          </button>
          <button
            type="button"
            onClick={() => void handleRecompute()}
            disabled={recomputing}
            className="ml-auto inline-flex items-center gap-1.5 min-h-[44px] md:min-h-0 px-4 py-2 rounded-full bg-primary text-white text-[13px] md:text-[12px] font-bold active:scale-[0.97] disabled:opacity-60"
          >
            {recomputing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Recompute
          </button>
        </div>

        <div className="scroll-x-fade -mx-1">
          <div className="flex gap-2 px-1 overflow-x-auto scrollbar-none">
            {FILTERS.map((f) => {
              const n = f.key === "all" ? rows.length : counts[f.key];
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  data-active={filter === f.key}
                  className="pill-filter shrink-0 min-h-[44px] md:min-h-0"
                >
                  {f.label}
                  <span className="ml-1 tabular text-[11px] opacity-80">
                    {n}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Liste */}
      <section className="px-4 sm:px-5 mt-5 pb-[max(3rem,env(safe-area-inset-bottom))]">
        {loading ? (
          <div className="bg-white border border-rule rounded-2xl p-10 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <p className="text-sm text-text-secondary">Chargement…</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <EmptyState onRecompute={() => void handleRecompute()} recomputing={recomputing} hasRows={rows.length > 0} filter={filter} />
        ) : (
          <ul className="space-y-2.5">
            {filteredRows.map((r) => {
              const style = TIER_STYLE[r.tier];
              const rec = recommendedOrder(r);
              return (
                <li
                  key={`${r.produit_id}-${r.depot_id}`}
                  className={`bg-white border-2 rounded-2xl p-4 ${style.border}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${style.chip}`}
                        >
                          {TIER_LABEL[r.tier]}
                        </span>
                        <span className="text-[10.5px] font-bold uppercase tracking-wide text-text-tertiary">
                          {r.depot_nom}
                        </span>
                        {r.multiplicateur > 1.1 && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[#F4E9C4] text-[#8B6F0E]">
                            × {r.multiplicateur.toFixed(2)} hijri
                          </span>
                        )}
                      </div>
                      <p className="text-[14.5px] font-extrabold text-text-primary mt-1.5 truncate">
                        {r.produit_nom}
                      </p>
                      {r.code_barre && (
                        <p className="text-[11px] mono text-text-tertiary mt-0.5 truncate">
                          EAN {r.code_barre}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-[18px] font-extrabold tabular leading-none ${style.daysColor}`}>
                        {formatDays(r.days_cover)}
                      </p>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary mt-1">
                        couverture
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-rule">
                    <Stat label="Stock" value={`${r.stock_actuel}`} />
                    <Stat label="Vitesse" value={`${r.velocity_adj.toFixed(1)} /j`} />
                    <Stat label="Reco" value={`${rec.qty} ${rec.unit}`} strong />
                  </div>

                  {r.reason && (
                    <p className={`mt-3 text-[12px] leading-snug rounded-xl px-3 py-2 ${style.bg} text-text-primary`}>
                      {r.reason}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleDraftPO(r)}
                    className="w-full mt-3 bg-primary text-white rounded-[14px] min-h-[44px] py-3 md:py-2.5 text-[14px] md:text-[13px] font-bold flex items-center justify-center gap-2 active:scale-[0.99]"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    Préparer commande · {rec.qty} {rec.unit}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </V2Shell>
  );
}

function EmptyState({
  onRecompute,
  recomputing,
  hasRows,
  filter,
}: {
  onRecompute: () => void;
  recomputing: boolean;
  hasRows: boolean;
  filter: "all" | StockoutTier;
}) {
  if (hasRows && filter !== "all") {
    return (
      <div className="bg-white border border-rule rounded-2xl p-8 text-center">
        <CheckCircle2 className="w-7 h-7 text-success mx-auto mb-2" />
        <p className="font-bold text-text-primary">
          Aucune ligne en {TIER_LABEL[filter as StockoutTier].toLowerCase()}
        </p>
        <p className="text-xs text-text-secondary mt-1">
          Change de filtre pour voir les autres niveaux.
        </p>
      </div>
    );
  }
  return (
    <div className="bg-cream border border-rule rounded-2xl p-8 text-center">
      <PackageX className="w-7 h-7 text-text-tertiary mx-auto mb-2" />
      <p className="font-bold text-text-primary">
        Pas encore de calcul de stockout
      </p>
      <p className="text-xs text-text-secondary mt-1 max-w-[34ch] mx-auto">
        Lance un premier recompute pour initialiser les niveaux Holt et
        peupler la vue.
      </p>
      <button
        type="button"
        onClick={onRecompute}
        disabled={recomputing}
        className="mt-4 inline-flex items-center gap-1.5 min-h-[44px] px-5 py-2.5 rounded-full bg-primary text-white text-[14px] font-bold active:scale-[0.97] disabled:opacity-60"
      >
        {recomputing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <RefreshCw className="w-4 h-4" />
        )}
        Lancer le recompute
      </button>
    </div>
  );
}

function Stat({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary">
        {label}
      </p>
      <p
        className={`tabular mt-0.5 ${
          strong
            ? "text-[14px] font-extrabold text-primary"
            : "text-[13px] font-bold text-text-primary"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function KpiCard({
  variant,
  icon,
  eyebrow,
  value,
  label,
}: {
  variant: "danger" | "warn" | "gold" | "neutral";
  icon: React.ReactNode;
  eyebrow: string;
  value: string;
  label: string;
}) {
  const palette = {
    danger: {
      bg: "bg-[#FBE9E7]",
      chip: "bg-[#A8231A] text-white",
      value: "text-[#8A1A12]",
    },
    warn: {
      bg: "bg-[#FEF3E2]",
      chip: "bg-[#D97706] text-white",
      value: "text-[#92400E]",
    },
    gold: {
      bg: "bg-[#FBF4D4]",
      chip: "bg-[#C9A227] text-[#3A2D08]",
      value: "text-[#8B6F0E]",
    },
    neutral: {
      bg: "bg-white border border-rule",
      chip: "bg-primary text-white",
      value: "text-text-primary",
    },
  }[variant];

  return (
    <div className={`rounded-2xl p-3.5 ${palette.bg}`}>
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center justify-center w-6 h-6 rounded-md ${palette.chip}`}
        >
          {icon}
        </span>
        <span className="text-[10px] font-extrabold uppercase tracking-wide text-text-secondary">
          {eyebrow}
        </span>
      </div>
      <p className={`text-[24px] font-extrabold tabular leading-tight mt-2 ${palette.value}`}>
        {value}
      </p>
      <p className="text-[11px] text-text-secondary mt-0.5">{label}</p>
    </div>
  );
}
