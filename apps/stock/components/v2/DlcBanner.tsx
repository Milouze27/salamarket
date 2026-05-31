"use client";

/**
 * DlcBanner — bannière compacte d'alertes DLC pour les pages staff.
 *
 * S'affiche en haut des pages quand des lots approchent leur DLC.
 * Lit `v_dlc_alerts` (créée par la migration 0032) via supabase client.
 *
 * 3 niveaux visuels (du plus fort au plus subtil) :
 *   - `forcé` ou `critique` → rouge danger, pulse animé
 *   - `attention`           → ambre/warning
 *   - `surveillance`        → jaune subtil
 *
 * Auto-hide si aucune alerte. Click → `/v2/admin/alertes-dlc`.
 * Pas de props : le composant fetch lui-même pour pouvoir être posé
 * sur n'importe quelle page sans plomberie.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Niveau = "forcé" | "critique" | "attention" | "surveillance" | "ok";

interface AlertRow {
  lot_id: string;
  niveau_alerte: Niveau;
}

interface Counts {
  forcé: number;
  critique: number;
  attention: number;
  surveillance: number;
  total: number;
}

const ZERO: Counts = {
  forcé: 0,
  critique: 0,
  attention: 0,
  surveillance: 0,
  total: 0,
};

/** Style le plus fort présent dans le set d'alertes. */
function strongestLevel(c: Counts): "critique" | "attention" | "surveillance" | null {
  if (c.forcé > 0 || c.critique > 0) return "critique";
  if (c.attention > 0) return "attention";
  if (c.surveillance > 0) return "surveillance";
  return null;
}

const PALETTE: Record<
  "critique" | "attention" | "surveillance",
  { bg: string; border: string; text: string; dot: string; pulse: boolean }
> = {
  critique: {
    bg: "bg-[#FBE9E7]",
    border: "border-[#E5483D]/40",
    text: "text-[#A8231A]",
    dot: "bg-[#E5483D]",
    pulse: true,
  },
  attention: {
    bg: "bg-[#FEF3E2]",
    border: "border-[#D97706]/40",
    text: "text-[#92400E]",
    dot: "bg-[#D97706]",
    pulse: false,
  },
  surveillance: {
    bg: "bg-[#FBF4D4]",
    border: "border-[#C9A227]/40",
    text: "text-[#8B6F0E]",
    dot: "bg-[#C9A227]",
    pulse: false,
  },
};

export function DlcBanner() {
  const [counts, setCounts] = useState<Counts>(ZERO);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const sb = supabase();
      if (!sb) {
        // Pas de Supabase → on n'affiche rien (mode démo local).
        setLoaded(true);
        return;
      }

      const { data, error } = await sb
        .from("v_dlc_alerts")
        .select("lot_id, niveau_alerte")
        .neq("niveau_alerte", "ok");

      if (cancelled) return;

      if (error) {
        console.warn("[DlcBanner] fetch error:", error.message);
        setLoaded(true);
        return;
      }

      const rows = (data ?? []) as AlertRow[];
      const next: Counts = { ...ZERO };
      for (const r of rows) {
        if (r.niveau_alerte === "forcé") next.forcé += 1;
        else if (r.niveau_alerte === "critique") next.critique += 1;
        else if (r.niveau_alerte === "attention") next.attention += 1;
        else if (r.niveau_alerte === "surveillance") next.surveillance += 1;
      }
      next.total = rows.length;
      setCounts(next);
      setLoaded(true);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Hide pendant le fetch initial ET si aucune alerte → ne prend pas de place.
  if (!loaded || counts.total === 0) return null;

  const level = strongestLevel(counts);
  if (!level) return null;

  const p = PALETTE[level];

  // Détail textuel : on liste les niveaux non-nuls dans l'ordre de gravité.
  const parts: string[] = [];
  if (counts.forcé > 0) parts.push(`${counts.forcé} forcé`);
  if (counts.critique > 0) parts.push(`${counts.critique} critique`);
  if (counts.attention > 0) parts.push(`${counts.attention} attention`);
  if (counts.surveillance > 0) parts.push(`${counts.surveillance} surveillance`);

  return (
    <Link
      href="/v2/admin/alertes-dlc"
      className={`flex items-center gap-3 mx-4 mt-3 px-3.5 py-3 min-h-[48px] rounded-2xl border ${p.bg} ${p.border} card-tappable outline-none focus-visible:ring-2 focus-visible:ring-primary/30`}
      aria-label={`${counts.total} lots en alerte DLC — voir détails`}
    >
      <span className="relative flex items-center justify-center shrink-0">
        <AlertTriangle className={`w-4 h-4 ${p.text}`} strokeWidth={2.4} />
        {p.pulse && (
          <>
            <span
              className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${p.dot}`}
              aria-hidden
            />
            <span
              className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${p.dot} animate-ping opacity-75`}
              aria-hidden
            />
          </>
        )}
      </span>
      <div className="flex-1 min-w-0">
        <p className={`text-[12.5px] font-extrabold leading-tight ${p.text}`}>
          {counts.total} lot{counts.total > 1 ? "s" : ""} en alerte DLC
        </p>
        <p className={`text-[10.5px] mt-0.5 font-semibold leading-tight ${p.text} opacity-80 truncate`}>
          {parts.join(" · ")}
        </p>
      </div>
      <ChevronRight className={`w-4 h-4 ${p.text} shrink-0`} />
    </Link>
  );
}
