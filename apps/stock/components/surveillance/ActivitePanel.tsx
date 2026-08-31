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
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Repeat2,
  Sparkles,
} from "lucide-react";
import { Leaderboard } from "@/components/v2/Leaderboard";
import { HeatmapVentes } from "@/components/v2/HeatmapVentes";
import { DataTable } from "@/components/v2/DataTable";
import {
  listDepots,
  listEmployes,
  listProduitsNomsByIds,
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

/** Plafond serveur, identique pour les trois sources (cf. load()). */
const PLAFOND_PAR_SOURCE = 200;

/** Libellé + couleur d'un type de mouvement, pour la pastille du tableau. */
const MOUVEMENT: Record<
  ActivityRow["type"],
  { label: string; couleur: string }
> = {
  rec: { label: "Réception", couleur: "var(--success)" },
  sor: { label: "Sortie", couleur: "var(--warning)" },
  trf: { label: "Transfert", couleur: "var(--accent-gold)" },
};

/**
 * Une ligne de journal aplatie pour le tableau du poste de travail : les trois
 * sources (réception / sortie / transfert) n'ont pas les mêmes colonnes, on
 * les ramène à un dénominateur commun UNE fois, plutôt qu'à chaque cellule.
 *
 * Ce que les tables ne portent PAS, et qui reste donc à « — » :
 *   - une réception n'a pas de produit ni de quantité (ils vivent dans ses
 *     lignes, `receptions_lignes`, non chargées ici) ;
 *   - un transfert et une réception n'ont pas de score IA (propre aux sorties).
 */
interface LigneActivite {
  cle: string;
  type: ActivityRow["type"];
  date: string;
  produit: string | null;
  quantite: number | null;
  depot: string;
  operateur: string;
  detail: string | null;
  scoreIa: number | null;
  /** Filet de gravité : seulement ce qui mérite un coup d'œil. */
  accent: string | null;
  href: string;
}

/** Date + heure pour le tableau du poste de travail (l'écran a la place). */
function dateHeureTableau(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Statut lisible dans un tableau : pastille de couleur + libellé en clair. */
function Pastille({ couleur, texte }: { couleur: string; texte: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: couleur }}
      />
      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
        {texte}
      </span>
    </span>
  );
}

/** Ce que le tableau NE montre pas : plafond serveur, colonnes absentes. */
function NoteTableau({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[12.5px] mt-2.5 px-3"
      style={{ color: "var(--text-tertiary)" }}
    >
      {children}
    </p>
  );
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
  // Les tables sorties/transferts ne portent qu'un produit_id : sans ce
  // dictionnaire, la colonne « Produit » du tableau n'afficherait qu'un UUID.
  const [produitNoms, setProduitNoms] = useState<Map<string, string>>(
    () => new Map(),
  );
  const [loading, setLoading] = useState(true);
  const router = useRouter();
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
      allRec.push(
        ...(await listReceptions({ depotId: d.id, limit: PLAFOND_PAR_SOURCE })),
      );
      allSor.push(
        ...(await listSorties({ depotId: d.id, limit: PLAFOND_PAR_SOURCE })),
      );
    }
    const allTrf = await listTransferts({ limit: PLAFOND_PAR_SOURCE });
    setReceptions(allRec);
    setSorties(allSor);
    setTransferts(allTrf);
    setLoading(false);

    // Noms de produits en UNE requête groupée, après l'affichage : la colonne
    // se remplit dès qu'elle arrive, et un échec ne casse jamais le journal.
    try {
      const noms = await listProduitsNomsByIds([
        ...allSor.map((s) => s.produit_id),
        ...allTrf.map((t) => t.produit_id),
      ]);
      setProduitNoms(new Map([...noms].map(([id, p]) => [id, p.nom])));
    } catch {
      /* le libellé produit ne casse JAMAIS la page activité */
    }
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

  // Journal aplati pour le tableau du poste de travail (≥ lg).
  const lignes = useMemo<LigneActivite[]>(() => {
    const nomDepot = (id: string | null | undefined) =>
      depots.find((d) => d.id === id)?.nom ?? "—";
    const nomEmploye = (id: string | null | undefined) => {
      const e = employes.find((x) => x.id === id);
      return e ? `${e.prenom ?? ""} ${e.nom}`.trim() : "—";
    };
    const nomProduit = (id: string | null | undefined) =>
      (id ? produitNoms.get(id) : null) ?? null;

    return merged.map((row, i) => {
      if (row.type === "rec") {
        const r = row.item as Reception;
        return {
          cle: `rec-${r.id ?? i}`,
          type: "rec" as const,
          date: row.date,
          produit: null,
          quantite: null,
          depot: nomDepot(r.depot_id),
          operateur: nomEmploye(r.employe_id),
          detail: [
            r.fournisseur ?? null,
            // Le libellé « BL » n'est pas ajouté si le numéro le porte déjà :
            // certains fournisseurs numérotent « BL-26-4100 ».
            r.numero_bl
              ? /^bl/i.test(r.numero_bl)
                ? r.numero_bl
                : `BL ${r.numero_bl}`
              : null,
            r.reception_vide ? "réception vide" : null,
          ]
            .filter(Boolean)
            .join(" · "),
          scoreIa: null,
          // Une livraison arrivée vide est une anomalie, pas une routine.
          accent: r.reception_vide ? "var(--warning)" : null,
          href: "/v2/reception",
        };
      }
      if (row.type === "sor") {
        const s = row.item as SortieStock;
        const suspecte =
          s.ia_coherence_score !== null && s.ia_coherence_score < 0.6;
        return {
          cle: `sor-${s.id ?? i}`,
          type: "sor" as const,
          date: row.date,
          produit: nomProduit(s.produit_id),
          quantite: s.quantite,
          depot: nomDepot(s.depot_id),
          operateur: nomEmploye(s.employe_id),
          detail: [SORTIE_LABEL[s.type] ?? s.type, s.motif_libre ?? null]
            .filter(Boolean)
            .join(" · "),
          scoreIa: s.ia_coherence_score,
          accent: suspecte ? "var(--danger)" : null,
          href: suspecte ? `/v2/admin/alertes?sortie=${s.id}` : "/v2/admin/alertes",
        };
      }
      const t = row.item as TransfertInterDepot;
      return {
        cle: `trf-${t.id ?? i}`,
        type: "trf" as const,
        date: row.date,
        produit: nomProduit(t.produit_id),
        quantite: t.quantite,
        depot: `${nomDepot(t.depot_source_id)} → ${nomDepot(t.depot_destination_id)}`,
        operateur: nomEmploye(t.employe_id),
        detail: null,
        scoreIa: null,
        accent: null,
        href: "/v2/transfert",
      };
    });
  }, [merged, depots, employes, produitNoms]);

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
          {/* ── POSTE DE TRAVAIL (≥ lg) : tableau ──────────────────────────
            La vignette portait le mouvement, l'opérateur et l'heure sur deux
            lignes, et regroupait par jour parce qu'un téléphone n'a pas la
            place d'une date complète. Le tableau porte la date entière, le
            produit, la quantité, le dépôt et le score IA sur une ligne : plus
            besoin d'en-têtes de jour. */}
          <div className="hidden lg:block">
            <DataTable<LigneActivite>
              rows={lignes}
              getKey={(l) => l.cle}
              caption={`Journal d'activité, ${lignes.length} mouvement${lignes.length > 1 ? "s" : ""}`}
              defaultSort={{ key: "quand", dir: "desc" }}
              emptyLabel="Aucun mouvement à afficher."
              onRowClick={(l) => router.push(l.href)}
              rowAccent={(l) => l.accent}
              columns={[
                {
                  key: "quand",
                  label: "Horodatage",
                  width: "165px",
                  sort: (a, b) => a.date.localeCompare(b.date),
                  render: (l) => (
                    <span
                      className="tabular-nums"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {dateHeureTableau(l.date)}
                    </span>
                  ),
                },
                {
                  key: "mouvement",
                  label: "Mouvement",
                  width: "142px",
                  sort: (a, b) =>
                    MOUVEMENT[a.type].label.localeCompare(
                      MOUVEMENT[b.type].label,
                      "fr",
                    ),
                  render: (l) => (
                    <Pastille
                      couleur={MOUVEMENT[l.type].couleur}
                      texte={MOUVEMENT[l.type].label}
                    />
                  ),
                },
                {
                  key: "produit",
                  label: "Produit",
                  width: "250px",
                  sort: (a, b) =>
                    (a.produit ?? "").localeCompare(b.produit ?? "", "fr"),
                  render: (l) => (
                    <span
                      className="font-semibold truncate block"
                      style={{
                        color: l.produit
                          ? "var(--text-primary)"
                          : "var(--text-tertiary)",
                      }}
                      title={
                        l.produit ??
                        (l.type === "rec"
                          ? "Une réception porte ses produits dans ses lignes de bon de livraison"
                          : undefined)
                      }
                    >
                      {l.produit ?? "—"}
                    </span>
                  ),
                },
                {
                  key: "quantite",
                  label: "Quantité",
                  width: "104px",
                  align: "right",
                  sort: (a, b) => (a.quantite ?? -1) - (b.quantite ?? -1),
                  render: (l) => (
                    <span
                      className="font-bold"
                      style={{
                        color:
                          l.quantite == null
                            ? "var(--text-tertiary)"
                            : "var(--text-primary)",
                      }}
                    >
                      {l.quantite ?? "—"}
                    </span>
                  ),
                },
                {
                  key: "depot",
                  label: "Dépôt",
                  width: "210px",
                  sort: (a, b) => a.depot.localeCompare(b.depot, "fr"),
                  render: (l) => (
                    <span
                      className="truncate block"
                      style={{ color: "var(--text-secondary)" }}
                      title={l.depot}
                    >
                      {l.depot}
                    </span>
                  ),
                },
                {
                  key: "operateur",
                  label: "Opérateur",
                  width: "170px",
                  sort: (a, b) => a.operateur.localeCompare(b.operateur, "fr"),
                  render: (l) => (
                    <span
                      className="truncate block"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {l.operateur}
                    </span>
                  ),
                },
                {
                  key: "detail",
                  label: "Détail",
                  xlOnly: true,
                  render: (l) => (
                    <span
                      className="truncate block"
                      style={{ color: "var(--text-tertiary)" }}
                      title={l.detail ?? undefined}
                    >
                      {l.detail && l.detail.length > 0 ? l.detail : "—"}
                    </span>
                  ),
                },
                {
                  key: "ia",
                  label: "Score IA",
                  width: "104px",
                  align: "right",
                  xlOnly: true,
                  sort: (a, b) => (a.scoreIa ?? 2) - (b.scoreIa ?? 2),
                  render: (l) =>
                    l.scoreIa === null ? (
                      <span style={{ color: "var(--text-tertiary)" }}>—</span>
                    ) : (
                      <span
                        className="font-bold"
                        style={{
                          color:
                            l.scoreIa < 0.6
                              ? "var(--danger)"
                              : "var(--text-secondary)",
                        }}
                      >
                        {Math.round(l.scoreIa * 100)} %
                      </span>
                    ),
                },
              ]}
            />
            <NoteTableau>
              {lignes.length} mouvement{lignes.length > 1 ? "s" : ""} affiché
              {lignes.length > 1 ? "s" : ""} · la requête plafonne à{" "}
              {PLAFOND_PAR_SOURCE} réceptions et {PLAFOND_PAR_SOURCE} sorties par
              dépôt, plus {PLAFOND_PAR_SOURCE} transferts. Une réception n&apos;a
              ni produit ni quantité propres : ils vivent dans ses lignes de bon
              de livraison, non chargées ici.
            </NoteTableau>
          </div>

          {/* ── TERRAIN (< lg) : journal groupé par jour, inchangé ───────── */}
          <div className="lg:hidden space-y-5">
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
          </div>
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
          : // Pas de `bg-white` : en thème nuit (le défaut), le fond blanc
            // restait blanc sous un `text-text-primary` devenu clair — pastille
            // illisible. Le token suit le thème.
            "bg-[var(--surface-1)] text-text-primary border-rule"
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
