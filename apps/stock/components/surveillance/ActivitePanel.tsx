"use client";

/**
 * ActivitePanel — activité complète (réceptions, sorties, transferts), extrait
 * de /v2/admin/activite pour la page Surveillance à onglets.
 *
 * Logique conservée à l'identique : chargement des mouvements tous dépôts,
 * snapshot cockpit (leaderboard + heatmap, résilient), fusion + groupement par
 * jour, filtres. Le header de page (bouton retour + titre) a été retiré au
 * profit du header hôte ; le compteur total est exposé via onCount pour que la
 * page hôte puisse l'afficher dans son sous-libellé.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Repeat2,
  Sparkles,
} from "lucide-react";
import { Leaderboard } from "@/components/v2/Leaderboard";
import { HeatmapVentes } from "@/components/v2/HeatmapVentes";
import {
  listDepots,
  listEmployes,
  listReceptions,
  listSorties,
  listTransferts,
} from "@/lib/db";
import type { CockpitSnapshot } from "@/app/api/cockpit/snapshot/route";
import type {
  Depot,
  Employe,
  Reception,
  SortieStock,
  SortieType,
  TransfertInterDepot,
} from "@/lib/types/db";

const SORTIE_LABEL: Record<SortieType, string> = {
  casse_manipulation: "Casse manip.",
  casse_client: "Casse client",
  perime_dlc: "Périmé DLC",
  perime_ddm: "Périmé DDM",
  defaut_fournisseur: "Défaut fourn.",
  demarque_inconnue: "Démarque inconnue",
  autre: "Autre motif",
};

type Filter = "all" | "rec" | "sor" | "trf";

interface ActivityRow {
  type: "rec" | "sor" | "trf";
  date: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  item: any;
}

export function ActivitePanel({
  onCount,
}: {
  onCount?: (total: number) => void;
}) {
  const [depots, setDepots] = useState<Depot[]>([]);
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [receptions, setReceptions] = useState<Reception[]>([]);
  const [sorties, setSorties] = useState<SortieStock[]>([]);
  const [transferts, setTransferts] = useState<TransfertInterDepot[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  // V8 — agrégats activité (leaderboard préparateurs + heatmap ventes).
  // Chargés via le snapshot cockpit ; résilients (échec → cartes masquées).
  const [snap, setSnap] = useState<CockpitSnapshot | null>(null);

  useEffect(() => {
    void load();
    void loadSnap();
  }, []);

  async function loadSnap() {
    try {
      const { loadCockpitSnapshot } = await import("@/lib/actions/cockpit");
      const r = await loadCockpitSnapshot();
      if (r.ok && r.data) setSnap(r.data);
    } catch {
      /* le snapshot ne casse JAMAIS la page activité */
    }
  }

  async function load() {
    setLoading(true);
    const ds = await listDepots();
    setDepots(ds);
    setEmployes(await listEmployes());

    const allRec: Reception[] = [];
    const allSor: SortieStock[] = [];
    for (const d of ds) {
      allRec.push(...(await listReceptions({ depotId: d.id, limit: 200 })));
      allSor.push(...(await listSorties({ depotId: d.id, limit: 200 })));
    }
    setReceptions(allRec);
    setSorties(allSor);
    setTransferts(await listTransferts({ limit: 200 }));
    setLoading(false);
  }

  const merged = useMemo<ActivityRow[]>(() => {
    const all: ActivityRow[] = [
      ...receptions.map((r) => ({ type: "rec" as const, date: r.created_at, item: r })),
      ...sorties.map((s) => ({ type: "sor" as const, date: s.created_at, item: s })),
      ...transferts.map((t) => ({ type: "trf" as const, date: t.created_at, item: t })),
    ];
    return all
      .filter((r) => filter === "all" || r.type === filter)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [receptions, sorties, transferts, filter]);

  const counts = {
    rec: receptions.length,
    sor: sorties.length,
    trf: transferts.length,
    all: receptions.length + sorties.length + transferts.length,
  };

  // Remonte le total à la page hôte (sous-libellé du header Surveillance).
  useEffect(() => {
    onCount?.(counts.all);
  }, [counts.all, onCount]);

  // Group by day
  const grouped = useMemo(() => {
    const out = new Map<string, ActivityRow[]>();
    for (const r of merged) {
      const key = r.date.slice(0, 10);
      const arr = out.get(key) ?? [];
      arr.push(r);
      out.set(key, arr);
    }
    return Array.from(out.entries());
  }, [merged]);

  return (
    <>
      <section className="px-4 sm:px-5 mt-5">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:-mx-5 sm:px-5 scrollbar-none">
          <FilterPill
            active={filter === "all"}
            onClick={() => setFilter("all")}
            label={`Tout · ${counts.all}`}
          />
          <FilterPill
            active={filter === "rec"}
            onClick={() => setFilter("rec")}
            label={`Réceptions · ${counts.rec}`}
            icon={<ArrowDownToLine className="w-3 h-3 text-success" />}
          />
          <FilterPill
            active={filter === "sor"}
            onClick={() => setFilter("sor")}
            label={`Sorties · ${counts.sor}`}
            icon={<ArrowUpRight className="w-3 h-3 text-warning" />}
          />
          <FilterPill
            active={filter === "trf"}
            onClick={() => setFilter("trf")}
            label={`Transferts · ${counts.trf}`}
            icon={<Repeat2 className="w-3 h-3 text-primary-dark" />}
          />
        </div>
      </section>

      {/* V8 — Performance staff : leaderboard préparateurs + heatmap ventes.
          Affichés seulement si le snapshot expose des agrégats (fallback
          gracieux : tables absentes → null → rien ne s'affiche). */}
      {(snap?.leaderboard || snap?.heatmap) && (
        <section className="px-4 sm:px-5 mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {snap?.leaderboard && <Leaderboard data={snap.leaderboard} />}
          {snap?.heatmap && <HeatmapVentes data={snap.heatmap} />}
        </section>
      )}

      {loading ? (
        <div className="px-4 sm:px-5 py-10 text-center text-text-secondary">
          Chargement…
        </div>
      ) : merged.length === 0 ? (
        <div className="px-4 sm:px-5 py-10 text-center">
          <Sparkles className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
          <p className="text-sm text-text-secondary">
            Aucun mouvement à afficher.
          </p>
        </div>
      ) : (
        <section className="px-4 sm:px-5 mt-5 pb-nav-stack space-y-5">
          {grouped.map(([day, rows], gi) => (
            <div
              key={day}
              className="rise-in"
              style={{ ["--i" as string]: Math.min(gi, 8) }}
            >
              <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-text-tertiary mb-2 sticky top-[var(--header-height,56px)] bg-cream py-1">
                {formatDay(day)} · {rows.length}
              </p>
              <div className="lg divide-y divide-rule overflow-hidden">
                {rows.map((row, i) => (
                  <Row key={i} row={row} depots={depots} employes={employes} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[40px] rounded-full text-[12.5px] font-bold whitespace-nowrap border transition-colors active:scale-[0.98] ${
        active
          ? "bg-primary text-white border-primary"
          : "bg-white text-text-primary border-rule"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Row({
  row,
  depots,
  employes,
}: {
  row: ActivityRow;
  depots: Depot[];
  employes: Employe[];
}) {
  if (row.type === "rec") {
    const r = row.item as Reception;
    const d = depots.find((x) => x.id === r.depot_id);
    const e = employes.find((x) => x.id === r.employe_id);
    return (
      <a
        href="/v2/reception"
        className="tap px-3 py-3 min-h-[56px] flex items-center gap-3 active:bg-cream transition-colors"
      >
        <span className="w-9 h-9 rounded-xl bg-success-soft text-success flex items-center justify-center shrink-0">
          <ArrowDownToLine className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-text-primary truncate">
            Réception {r.fournisseur ?? "—"} → {d?.nom ?? "?"}
          </p>
          <p className="text-[11px] text-text-secondary">
            {e?.prenom} {e?.nom} · {formatTime(row.date)}
          </p>
        </div>
        <span className="text-text-tertiary text-xs">→</span>
      </a>
    );
  }
  if (row.type === "sor") {
    const s = row.item as SortieStock;
    const d = depots.find((x) => x.id === s.depot_id);
    const e = employes.find((x) => x.id === s.employe_id);
    const lowScore =
      s.ia_coherence_score !== null && s.ia_coherence_score < 0.6;
    return (
      <a
        href={lowScore ? `/v2/admin/alertes?sortie=${s.id}` : "/v2/admin/alertes"}
        className="tap px-3 py-3 min-h-[56px] flex items-center gap-3 active:bg-cream transition-colors"
      >
        <span
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            lowScore ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"
          }`}
        >
          <ArrowUpRight className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-text-primary truncate">
            Sortie {SORTIE_LABEL[s.type] ?? s.type} × {s.quantite} · {d?.nom}
          </p>
          <p className="text-[11px] text-text-secondary">
            {e?.prenom} {e?.nom} · {formatTime(row.date)}
            {s.ia_coherence_score !== null && (
              <> · IA {Math.round(s.ia_coherence_score * 100)}%</>
            )}
          </p>
        </div>
        <span className="text-text-tertiary text-xs">→</span>
      </a>
    );
  }
  // transfert
  const t = row.item as TransfertInterDepot;
  const ds = depots.find((x) => x.id === t.depot_source_id);
  const dd = depots.find((x) => x.id === t.depot_destination_id);
  const e = employes.find((x) => x.id === t.employe_id);
  return (
    <a
      href="/v2/transfert"
      className="tap px-3 py-2.5 flex items-center gap-3 active:bg-cream transition-colors"
    >
      <span className="w-9 h-9 rounded-xl bg-gold-soft text-primary-dark flex items-center justify-center shrink-0">
        <Repeat2 className="w-4 h-4" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-text-primary truncate">
          Transfert {ds?.nom} → {dd?.nom} · qté {t.quantite}
        </p>
        <p className="text-[11px] text-text-secondary">
          {e?.prenom} {e?.nom} · {formatTime(row.date)}
        </p>
      </div>
      <span className="text-text-tertiary text-xs">→</span>
    </a>
  );
}

function formatDay(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  const diff = (today.getTime() - dt.getTime()) / 86400000;
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Hier";
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
