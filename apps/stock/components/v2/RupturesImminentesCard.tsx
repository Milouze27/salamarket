"use client";

/**
 * RupturesImminentesCard — card "Ruptures imminentes" pour le cockpit F1.
 *
 * Lit `v_stockout_critiques` filtrée sur les tiers `crit` / `blocker` /
 * `out`, max 3 lignes. Lien vers /v2/forecast en bas. Visuel cohérent
 * avec les autres cards admin (DriveDashboardSection, DlcBanner) :
 *   - white bg, border-rule, shadow-card, rounded-[20px]
 *   - éyebrow numéroté + chip "Hijri × N.NN" si phase boost
 *   - tabular nums sur days_cover
 *
 * Le composant gère son loading state (skeleton 3 lignes) et un empty
 * state positif quand tout va bien.
 *
 * NB : composant autonome. Le parent (cockpit page) n'a qu'à le
 * rendre — il fait sa requête tout seul.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Moon,
  PackageX,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useV2 } from "@/lib/v2-store";
import type { StockoutTier } from "@/lib/forecast/holt";
import { resolveHijriContext } from "@/lib/forecast/hijri";

interface Row {
  produit_id: string;
  depot_id: string;
  produit_nom: string;
  depot_nom: string;
  days_cover: number | null;
  velocity_adj: number;
  multiplicateur: number;
  tier: StockoutTier;
}

const TIER_RANK: Record<StockoutTier, number> = {
  out: 0,
  blocker: 1,
  crit: 2,
  warn: 3,
  ok: 4,
};

const TIER_CHIP: Record<StockoutTier, string> = {
  out: "bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger-border)]",
  blocker:
    "bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger-border)]",
  crit: "bg-[var(--danger-soft)] text-[var(--danger)] border border-[var(--danger-border)]",
  warn: "bg-[var(--warning-soft)] text-[var(--warning)] border border-[var(--warning-border)]",
  ok: "bg-[var(--success-soft)] text-[var(--success)] border border-[var(--success-border)]",
};

const TIER_LABEL: Record<StockoutTier, string> = {
  out: "Rupture",
  blocker: "Bloquant",
  crit: "Critique",
  warn: "Surveille",
  ok: "OK",
};

function formatDays(d: number | null): string {
  if (d === null) return "·";
  if (d < 1) return `${Math.round(d * 24)} h`;
  return `${d.toFixed(1)} j`;
}

export function RupturesImminentesCard({
  scopeAllDepots = false,
  maxRows = 3,
  className = "",
}: {
  /** Si true, ignore le dépôt courant (vue admin multi-dépôts). */
  scopeAllDepots?: boolean;
  maxRows?: number;
  className?: string;
}) {
  const depot = useV2((s) => s.currentDepot);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const hijriCtx = useMemo(() => resolveHijriContext(new Date()), []);
  const isHijriBoost = hijriCtx.phase !== "normal";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const sb = supabase();
      if (!sb) {
        if (!cancelled) {
          setRows([]);
          setLoading(false);
        }
        return;
      }
      let q = sb
        .from("v_stockout_critiques")
        .select(
          "produit_id, depot_id, produit_nom, depot_nom, days_cover, velocity_adj, multiplicateur, tier",
        )
        .in("tier", ["out", "blocker", "crit"])
        .limit(maxRows);
      if (!scopeAllDepots && depot?.id) {
        q = q.eq("depot_id", depot.id);
      }
      const { data, error } = await q;
      if (cancelled) return;
      if (error) {
        // Vue absente (migration pas jouée) ou RLS → empty state silencieux.
        console.warn(
          "[RupturesImminentesCard] view query failed:",
          error.message,
        );
        setRows([]);
      } else {
        const sorted = ((data ?? []) as Row[]).sort((a, b) => {
          const rankDiff = TIER_RANK[a.tier] - TIER_RANK[b.tier];
          if (rankDiff !== 0) return rankDiff;
          const da = a.days_cover ?? 999;
          const db = b.days_cover ?? 999;
          return da - db;
        });
        setRows(sorted);
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [depot?.id, scopeAllDepots, maxRows]);

  return (
    <div
      className={`bg-[var(--surface-1)] border border-[var(--border-card)] shadow-[var(--shadow-card)] rounded-[20px] p-4 ${className}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--danger-soft)] text-[var(--danger)]">
            <AlertTriangle className="w-4 h-4" />
          </span>
          <div>
            <p className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[var(--accent-gold-dim)]">
              03 · Forecast
            </p>
            <p className="text-[14.5px] font-extrabold text-text-primary leading-tight">
              Ruptures imminentes
            </p>
          </div>
        </div>
        {isHijriBoost && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--accent-gold-soft)] text-[var(--accent-gold-dim)] border border-[var(--border-premium)]">
            <Moon className="w-3 h-3" />
            Hijri actif
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-14 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-success-soft rounded-xl px-3 py-4 text-center">
          <CheckCircle2 className="w-5 h-5 text-success mx-auto" />
          <p className="text-[12.5px] font-bold text-text-primary mt-1.5">
            Aucune rupture imminente
          </p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            Tous tes produits ont &gt; 3 j de couverture.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={`${r.produit_id}-${r.depot_id}`}
              className="flex items-center gap-3 bg-[var(--danger-soft)] border border-[var(--danger-border)] rounded-xl px-3 py-2"
            >
              <span className="inline-flex items-center justify-center w-2 h-2 rounded-full shrink-0 bg-[var(--danger)]" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-text-primary truncate">
                  {r.produit_nom}
                </p>
                <p className="text-[11px] text-text-tertiary truncate">
                  {r.depot_nom}
                  {r.multiplicateur > 1.1
                    ? ` · × ${r.multiplicateur.toFixed(2)} hijri`
                    : ""}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[13px] font-extrabold tabular text-[var(--danger)] leading-none">
                  {formatDays(r.days_cover)}
                </p>
                <span
                  className={`mt-1 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${TIER_CHIP[r.tier]}`}
                >
                  {TIER_LABEL[r.tier]}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/v2/forecast"
        className="mt-3 flex items-center justify-between text-[12.5px] font-bold text-primary px-1 py-1 active:opacity-70"
      >
        <span className="inline-flex items-center gap-1.5">
          <PackageX className="w-3.5 h-3.5" />
          Voir le forecast complet
        </span>
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
