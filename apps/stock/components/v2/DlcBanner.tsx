"use client";

/**
 * DlcBanner — bannière compacte d'alertes DLC pour les pages staff.
 *
 * S'affiche en haut des pages quand des lots approchent leur DLC.
 * Lit `v_dlc_alerts` (créée par la migration 0032) via supabase client.
 *
 * 3 niveaux visuels (du plus fort au plus subtil), dark par défaut :
 *   - `forcé` ou `critique` → danger lumineux, pulse animé, palier démarque
 *   - `attention`           → warning ambre, palier -20%
 *   - `surveillance`        → warning atténué, simple veille
 *
 * Doctrine dark MYTHOS : surface translucide soft (--danger-soft /
 * --warning-soft) posée sur la card, hairline du même teint, texte status
 * lumineux. Aucune grande surface or. Le palier démarque (ATTENTION -20% /
 * CRITIQUE -40% / FORCÉ -50%, cf. lib/dlc.ts) s'affiche en chip tabular-nums.
 *
 * Auto-hide si aucune alerte. Click → `/v2/admin/alertes-dlc`.
 * Pas de props : le composant fetch lui-même pour pouvoir être posé
 * sur n'importe quelle page sans plomberie.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { DLC_MIN_DISCOUNT_PCT } from "@/lib/dlc";

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

type Level = "critique" | "attention" | "surveillance";

/**
 * Palette token-driven (dark par défaut, suit le thème jour via les mêmes
 * vars). On pointe sur les status tokens : surface = soft translucide,
 * texte/dot/hairline = couleur status lumineuse. Zéro hex hardcodé.
 *
 * `palier` = clé lib/dlc.ts pour afficher le plancher de démarque (%).
 */
const PALETTE: Record<
  Level,
  {
    surfaceVar: string;
    textVar: string;
    pulse: boolean;
    /** Niveau lib/dlc.ts pour le % de démarque affiché en chip. */
    palier: "critique" | "attention" | null;
    /** Libellé court du palier. */
    palierLabel: string | null;
  }
> = {
  critique: {
    surfaceVar: "--danger-soft",
    textVar: "--danger",
    pulse: true,
    palier: "critique",
    palierLabel: "CRITIQUE",
  },
  attention: {
    surfaceVar: "--warning-soft",
    textVar: "--warning",
    pulse: false,
    palier: "attention",
    palierLabel: "ATTENTION",
  },
  surveillance: {
    surfaceVar: "--warning-soft",
    textVar: "--warning",
    pulse: false,
    palier: null,
    palierLabel: null,
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
  // forcé est plus grave que critique : on remonte le plancher démarque le
  // plus agressif présent dans le set (FORCÉ -50% > CRITIQUE -40%).
  const demarquePct =
    counts.forcé > 0
      ? DLC_MIN_DISCOUNT_PCT.forcé
      : p.palier
        ? DLC_MIN_DISCOUNT_PCT[p.palier]
        : 0;
  const palierLabel = counts.forcé > 0 ? "FORCÉ" : p.palierLabel;

  // Détail textuel : on liste les niveaux non-nuls dans l'ordre de gravité.
  const parts: string[] = [];
  if (counts.forcé > 0) parts.push(`${counts.forcé} forcé`);
  if (counts.critique > 0) parts.push(`${counts.critique} critique`);
  if (counts.attention > 0) parts.push(`${counts.attention} attention`);
  if (counts.surveillance > 0) parts.push(`${counts.surveillance} surveillance`);

  const statusColor = `var(${p.textVar})`;

  return (
    <Link
      href="/v2/admin/alertes-dlc"
      className="flex items-center gap-3 mx-4 mt-3 px-3.5 py-3 min-h-[48px] rounded-2xl border card-tappable outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary-ring)]"
      style={{
        background: `var(${p.surfaceVar})`,
        borderColor: statusColor,
        // hairline status discret : le border token serait trop neutre ici,
        // on garde la teinte status mais atténuée par la surface soft.
        borderWidth: 1,
      }}
      aria-label={`${counts.total} lots en alerte DLC — voir détails`}
    >
      <span className="relative flex items-center justify-center shrink-0">
        <AlertTriangle className="w-4 h-4" style={{ color: statusColor }} strokeWidth={2.4} />
        {p.pulse && (
          <>
            <span
              className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
              style={{ background: statusColor }}
              aria-hidden
            />
            <span
              className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full animate-ping opacity-75"
              style={{ background: statusColor }}
              aria-hidden
            />
          </>
        )}
      </span>
      <div className="flex-1 min-w-0">
        <p
          className="text-[12.5px] font-extrabold leading-tight"
          style={{ color: statusColor }}
        >
          {counts.total} lot{counts.total > 1 ? "s" : ""} en alerte DLC
        </p>
        <p
          className="text-[10.5px] mt-0.5 font-semibold leading-tight opacity-80 truncate"
          style={{ color: statusColor }}
        >
          {parts.join(" · ")}
        </p>
      </div>
      {palierLabel && demarquePct > 0 && (
        <span
          className="shrink-0 inline-flex items-center gap-1 px-2 h-6 rounded-full text-[10px] font-extrabold tracking-wide tabular-nums"
          style={{
            color: statusColor,
            background: "var(--surface-2)",
            boxShadow: `inset 0 0 0 1px ${statusColor}`,
          }}
          aria-label={`Palier démarque ${palierLabel} moins ${demarquePct} pourcent`}
        >
          {palierLabel} −{demarquePct}%
        </span>
      )}
      <ChevronRight className="w-4 h-4 shrink-0" style={{ color: statusColor }} />
    </Link>
  );
}
