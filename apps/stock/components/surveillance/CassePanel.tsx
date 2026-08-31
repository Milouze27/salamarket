"use client";

/**
 * CassePanel — détection d'anomalies de démarque / casse, extrait de
 * /v2/admin/casse-anomalies pour la page Surveillance à onglets.
 *
 * Tout le calcul vit dans lib/db/casse.ts (z-score par catégorie). Le panneau
 * orchestre : KPI, liste triée par z décroissant, graphe basculable (casse par
 * catégorie · pic horaire) et casses récentes. Le header de page (BackButton +
 * titre) et le wrapper V2Shell ont été retirés au profit du header hôte.
 *
 * LOIS L99 : tokens var(--status-*), aucun hex de status, aucun tiret em (·),
 * tabular-nums sur €/z-score, cibles >=44px, responsive iPad, dark natif.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { motion } from "framer-motion";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Loader2,
  PackageX,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { EditorialEyebrow } from "@/components/v2/EditorialEyebrow";
import { EmptyState } from "@/components/v2/EmptyState";
import { DataTable } from "@/components/v2/DataTable";
import { useV2 } from "@/lib/v2-store";
import {
  computeAnomalies,
  getPicHoraire,
  listCassesRecentes,
  SORTIE_TYPE_LABEL,
  Z_ALERTE,
  Z_WARNING,
  type CasseAnomalie,
  type CassePicHoraire,
  type CasseRecenteItem,
  type NiveauAnomalie,
} from "@/lib/db/casse";

// ── Formatters ───────────────────────────────────────────────────────────────

function fmtEur(n: number, max = 0): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: max,
    maximumFractionDigits: max,
  }).format(n);
}

function fmtZ(z: number | null): string {
  if (z === null) return "n/a";
  const s = z >= 0 ? "+" : "";
  return `${s}${z.toFixed(1)}σ`;
}

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

// ── Style par niveau (tokens uniquement) ─────────────────────────────────────

const NIVEAU_META: Record<
  NiveauAnomalie,
  { label: string; bg: string; chip: string; text: string; barColor: string }
> = {
  alerte: {
    label: "Alerte",
    bg: "bg-[var(--status-danger-bg)]",
    chip: "bg-[var(--status-danger)] text-white",
    text: "text-[var(--status-danger-text)]",
    barColor: "var(--status-danger)",
  },
  warning: {
    label: "Vigilance",
    bg: "bg-[var(--status-warning-bg)]",
    chip: "bg-[var(--status-warning)] text-[var(--text-on-gold)]",
    text: "text-[var(--status-warning-text)]",
    barColor: "var(--status-warning)",
  },
  normal: {
    label: "Normal",
    bg: "bg-[var(--surface-1)]",
    chip: "bg-[var(--status-success)] text-[var(--text-on-gold)]",
    text: "text-[var(--status-success-text)]",
    barColor: "var(--status-success)",
  },
};

/** Couleur de gravité par niveau — filet de ligne du tableau. */
const NIVEAU_ACCENT: Record<NiveauAnomalie, string | null> = {
  alerte: "var(--status-danger)",
  warning: "var(--status-warning)",
  normal: null,
};

/** Ordre de gravité décroissante — tri de la colonne « Niveau ». */
const NIVEAU_RANG: Record<NiveauAnomalie, number> = {
  alerte: 0,
  warning: 1,
  normal: 2,
};

/** Couleur d'un type de perte — pastille de la colonne « Motif ». */
function couleurType(type: string): string {
  if (type === "demarque_inconnue") return "var(--status-danger)";
  if (type === "perime_dlc" || type === "perime_ddm") return "var(--accent-gold)";
  if (type === "autre") return "var(--text-tertiary)";
  return "var(--status-warning)";
}

/**
 * Filet vertical de tête de ligne. Volontairement PLUS restrictif que la
 * pastille : mesuré à 1920 px, marquer les six types de perte posait un filet
 * sur 24 lignes sur 28. Seule la démarque inconnue le garde — c'est la seule
 * ligne sans explication ni responsable.
 */
function filetGravite(type: string): string | null {
  return type === "demarque_inconnue" ? "var(--status-danger)" : null;
}

/** Date + heure pour les tableaux du poste de travail (l'écran a la place). */
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
function Pastille({
  couleur,
  texte,
}: {
  couleur: string | null;
  texte: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: couleur ?? "var(--status-success)" }}
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

/** Plafond serveur de listCassesRecentes (3e argument, valeur par défaut). */
const PLAFOND_RECENTES = 60;

type GrapheMode = "categorie" | "horaire";

// ── Panneau ──────────────────────────────────────────────────────────────────

export function CassePanel() {
  const depot = useV2((s) => s.currentDepot);
  const [anomalies, setAnomalies] = useState<CasseAnomalie[]>([]);
  const [pic, setPic] = useState<CassePicHoraire[]>([]);
  const [recentes, setRecentes] = useState<CasseRecenteItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allDepots, setAllDepots] = useState(false);
  const [graphe, setGraphe] = useState<GrapheMode>("categorie");

  const days = 7;

  const load = useCallback(async () => {
    const depotId = allDepots ? undefined : depot?.id;
    try {
      const [a, p, r] = await Promise.all([
        computeAnomalies(days, depotId),
        getPicHoraire(depotId),
        listCassesRecentes(14, depotId),
      ]);
      setAnomalies(a);
      setPic(p);
      setRecentes(r);
      setLoadError(null);
    } catch (e) {
      // On ne montre plus une liste vide muette : une panne DB se distingue
      // d'un « rien déclaré ».
      const msg = e instanceof Error ? e.message : "Chargement échoué";
      console.error("[casse-anomalies] load échoué:", e);
      setLoadError(msg);
    }
  }, [allDepots, depot?.id]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  // ── KPI ──
  const casseTotale7j = useMemo(
    () => anomalies.reduce((s, a) => s + a.observe_total_eur, 0),
    [anomalies],
  );
  const nbAlerte = useMemo(
    () => anomalies.filter((a) => a.niveau === "alerte").length,
    [anomalies],
  );
  const nbWarning = useMemo(
    () => anomalies.filter((a) => a.niveau === "warning").length,
    [anomalies],
  );
  const nbAnomalies = nbAlerte + nbWarning;

  // ── Données graphe ──
  const dataCategorie = useMemo(
    () =>
      anomalies
        .filter((a) => a.observe_total_eur > 0)
        .slice(0, 8)
        .map((a) => ({
          name: a.categorie,
          valeur: a.observe_total_eur,
          color: NIVEAU_META[a.niveau].barColor,
        })),
    [anomalies],
  );

  const dataHoraire = useMemo(() => {
    // Agrège la valeur perdue par heure (0..23), tous jours confondus.
    const parHeure = new Map<number, number>();
    for (const p of pic) {
      parHeure.set(p.heure, (parHeure.get(p.heure) ?? 0) + p.valeur_perdue_eur);
    }
    return Array.from({ length: 24 }, (_, h) => ({
      name: `${String(h).padStart(2, "0")}h`,
      valeur: Math.round((parHeure.get(h) ?? 0) * 100) / 100,
    })).filter((_, h) => {
      // Garde la plage d'amplitude commerce (6h→23h) pour densifier le graphe.
      return h >= 6 && h <= 23;
    });
  }, [pic]);

  const picPire = useMemo(() => {
    if (pic.length === 0) return null;
    return pic.reduce((best, p) =>
      p.valeur_perdue_eur > best.valeur_perdue_eur ? p : best,
    );
  }, [pic]);

  const hasData = anomalies.length > 0 || pic.length > 0;
  const dataActive = graphe === "categorie" ? dataCategorie : dataHoraire;

  return (
    <>
      {/* Toolbar : scope dépôt + refresh */}
      <section className="px-4 sm:px-5 mt-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAllDepots((v) => !v)}
            className="pill-filter min-h-[44px] md:min-h-0"
            data-active={allDepots}
          >
            {allDepots ? "Tous dépôts" : (depot?.nom ?? "Dépôt courant")}
          </button>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="ml-auto inline-flex items-center gap-1.5 min-h-[44px] md:min-h-0 px-4 py-2 rounded-full bg-primary text-white text-[13px] md:text-[12px] font-bold active:scale-[0.97] disabled:opacity-60"
          >
            {refreshing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Rafraîchir
          </button>
        </div>
      </section>

      {/* KPI grid */}
      <section className="px-4 sm:px-5 mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2.5 w-full lg:max-w-[1000px]">
        <KpiCard
          variant="neutral"
          riseIndex={0}
          icon={<PackageX className="w-4 h-4" />}
          eyebrow="CASSE 7 JOURS"
          value={fmtEur(casseTotale7j)}
          label="valorisée prix magasin"
        />
        <KpiCard
          variant="danger"
          riseIndex={1}
          icon={<AlertOctagon className="w-4 h-4" />}
          eyebrow="ALERTES"
          value={`${nbAlerte}`}
          label="catégories au-delà de 2.5σ"
        />
        <KpiCard
          variant="warn"
          riseIndex={2}
          icon={<AlertTriangle className="w-4 h-4" />}
          eyebrow="VIGILANCE"
          value={`${nbWarning}`}
          label="catégories au-delà de 1.5σ"
        />
        <KpiCard
          variant="gold"
          riseIndex={3}
          icon={<Clock className="w-4 h-4" />}
          eyebrow="PIRE CRÉNEAU"
          value={
            picPire
              ? `${JOURS[(picPire.jour_semaine - 1 + 7) % 7]} ${String(picPire.heure).padStart(2, "0")}h`
              : "n/a"
          }
          label={
            picPire ? `${fmtEur(picPire.valeur_perdue_eur)} perdus` : "90 j"
          }
        />
      </section>

      {/* Graphe basculable */}
      {(dataCategorie.length > 0 || dataHoraire.some((d) => d.valeur > 0)) && (
        <section className="px-4 sm:px-5 mt-5 w-full lg:max-w-[1000px]">
          <div className="lg rise-in p-4">
            <div className="flex items-center justify-between gap-3 mb-1">
              <p className="section-eyebrow">
                <BarChart3 className="w-3 h-3" />
                {graphe === "categorie"
                  ? "Casse par catégorie · 7 j"
                  : "Pic horaire · 90 j"}
              </p>
              <div className="inline-flex bg-[var(--surface-2)] rounded-full p-0.5 gap-0.5">
                <GrapheToggle
                  active={graphe === "categorie"}
                  onClick={() => setGraphe("categorie")}
                  icon={<BarChart3 className="w-3.5 h-3.5" />}
                  label="Catégorie"
                />
                <GrapheToggle
                  active={graphe === "horaire"}
                  onClick={() => setGraphe("horaire")}
                  icon={<Clock className="w-3.5 h-3.5" />}
                  label="Horaire"
                />
              </div>
            </div>

            <motion.div
              key={graphe}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
              className="h-[200px] -mx-2 mt-3"
            >
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={180}
              >
                <BarChart
                  data={dataActive}
                  margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--border-light)"
                    strokeDasharray="3 4"
                  />
                  <XAxis
                    dataKey="name"
                    tick={{
                      fill: "var(--text-tertiary)",
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                    tickLine={false}
                    axisLine={false}
                    interval={graphe === "horaire" ? 1 : 0}
                    angle={graphe === "categorie" ? -18 : 0}
                    textAnchor={graphe === "categorie" ? "end" : "middle"}
                    height={graphe === "categorie" ? 44 : 20}
                  />
                  <YAxis
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`
                    }
                    tick={{
                      fill: "var(--text-tertiary)",
                      fontSize: 10,
                      fontWeight: 600,
                    }}
                    tickLine={false}
                    axisLine={false}
                    width={30}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--surface-2)", opacity: 0.5 }}
                    wrapperStyle={{ outline: "none", zIndex: 50 }}
                    contentStyle={{
                      background: "var(--surface-3)",
                      border: "1px solid var(--border-light)",
                      borderRadius: 12,
                      boxShadow: "var(--shadow-card-lg)",
                      padding: "10px 12px",
                      fontSize: 12,
                    }}
                    labelStyle={{
                      color: "var(--text-secondary)",
                      fontSize: 11,
                      fontWeight: 600,
                      marginBottom: 4,
                    }}
                    itemStyle={{
                      color: "var(--text-primary)",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                    formatter={(value) => [fmtEur(Number(value), 2), "Casse"]}
                  />
                  <Bar
                    dataKey="valeur"
                    radius={[5, 5, 0, 0]}
                    isAnimationActive
                    animationDuration={420}
                    fill="var(--status-danger)"
                  >
                    {graphe === "categorie" &&
                      dataCategorie.map((d, i) => (
                        <Cell key={i} fill={d.color} />
                      ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          </div>
        </section>
      )}

      {/* Liste catégories triées par z-score décroissant */}
      <section className="px-4 sm:px-5 mt-5 pb-[max(3rem,env(safe-area-inset-bottom))] w-full">
        {loading ? (
          <div className="bg-[var(--surface-1)] border border-rule rounded-2xl p-10 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <p className="text-sm text-text-secondary">Analyse en cours…</p>
          </div>
        ) : !hasData ? (
          <div className="bg-[var(--surface-1)] border border-rule rounded-[20px]">
            <EmptyState
              icon={ShieldCheck}
              title="Pas encore de signal de casse"
              description="L'historique de casse se construit. Dès qu'une catégorie aura assez de données (baseline 28 j), les anomalies de démarque apparaîtront ici."
              cta={{ label: "Saisir une sortie", href: "/v2/sortie" }}
            />
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between mb-3">
              <p className="label-caps text-text-tertiary">
                {anomalies.length} catégorie
                {anomalies.length > 1 ? "s" : ""}
              </p>
              {nbAnomalies === 0 && (
                <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[var(--status-success-text)]">
                  <CheckCircle2 className="w-4 h-4" />
                  Aucune anomalie
                </span>
              )}
            </div>
            {/* ── POSTE DE TRAVAIL (≥ lg) : tableau ──────────────────────
              La carte portait observé, baseline, σ, écart et z-score en
              phrase courante. Le tableau les met en colonnes comparables,
              triables, et ajoute le total cassé sur 7 j. */}
            <div className="hidden lg:block">
              <DataTable<CasseAnomalie>
                rows={anomalies}
                getKey={(a) => a.categorie}
                caption={`Anomalies de casse par catégorie, ${anomalies.length} ligne${anomalies.length > 1 ? "s" : ""}`}
                defaultSort={{ key: "z", dir: "desc" }}
                emptyLabel="Aucune catégorie analysable."
                rowAccent={(a) => NIVEAU_ACCENT[a.niveau]}
                columns={[
                  {
                    key: "categorie",
                    label: "Catégorie",
                    width: "230px",
                    sort: (a, b) => a.categorie.localeCompare(b.categorie, "fr"),
                    render: (a) => (
                      <span
                        className="font-semibold truncate block"
                        style={{ color: "var(--text-primary)" }}
                        title={a.categorie}
                      >
                        {a.categorie}
                      </span>
                    ),
                  },
                  {
                    key: "niveau",
                    label: "Niveau",
                    width: "128px",
                    sort: (a, b) => NIVEAU_RANG[a.niveau] - NIVEAU_RANG[b.niveau],
                    render: (a) => (
                      <Pastille
                        couleur={NIVEAU_ACCENT[a.niveau]}
                        texte={NIVEAU_META[a.niveau].label}
                      />
                    ),
                  },
                  {
                    key: "observe",
                    label: "Observé / jour",
                    width: "132px",
                    align: "right",
                    sort: (a, b) => a.observe_jour_eur - b.observe_jour_eur,
                    render: (a) => (
                      <span
                        className="font-bold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {fmtEur(a.observe_jour_eur, 2)}
                      </span>
                    ),
                  },
                  {
                    key: "baseline",
                    label: "Baseline 28 j",
                    width: "132px",
                    align: "right",
                    xlOnly: true,
                    sort: (a, b) => a.baseline_mu_eur - b.baseline_mu_eur,
                    render: (a) => (
                      <span style={{ color: "var(--text-secondary)" }}>
                        {fmtEur(a.baseline_mu_eur, 2)}
                      </span>
                    ),
                  },
                  {
                    key: "sigma",
                    label: "Écart-type σ",
                    width: "124px",
                    align: "right",
                    xlOnly: true,
                    sort: (a, b) => a.baseline_sigma_eur - b.baseline_sigma_eur,
                    render: (a) => (
                      <span style={{ color: "var(--text-secondary)" }}>
                        {a.baseline_sigma_eur > 0
                          ? fmtEur(a.baseline_sigma_eur, 2)
                          : "—"}
                      </span>
                    ),
                  },
                  {
                    key: "ecart",
                    label: "Écart / jour",
                    width: "128px",
                    align: "right",
                    sort: (a, b) => a.ecart_eur - b.ecart_eur,
                    render: (a) => (
                      <span
                        className="font-semibold"
                        style={{
                          color:
                            a.ecart_eur > 0
                              ? (NIVEAU_ACCENT[a.niveau] ??
                                "var(--text-primary)")
                              : "var(--status-success-text)",
                        }}
                      >
                        {a.ecart_eur > 0 ? "+" : ""}
                        {fmtEur(a.ecart_eur, 2)}
                      </span>
                    ),
                  },
                  {
                    key: "z",
                    label: "z-score",
                    width: "112px",
                    align: "right",
                    // Baseline indisponible = pas de z : ces lignes vont au
                    // fond du tri, elles ne sont ni bonnes ni mauvaises.
                    sort: (a, b) =>
                      (a.z_score ?? Number.NEGATIVE_INFINITY) -
                      (b.z_score ?? Number.NEGATIVE_INFINITY),
                    render: (a) => (
                      <span
                        className="font-bold"
                        style={{
                          color:
                            a.z_score === null
                              ? "var(--text-tertiary)"
                              : (NIVEAU_ACCENT[a.niveau] ??
                                "var(--text-secondary)"),
                        }}
                        title={
                          a.baseline_indisponible
                            ? "Baseline insuffisante : pas de z-score fiable"
                            : undefined
                        }
                      >
                        {fmtZ(a.z_score)}
                      </span>
                    ),
                  },
                  {
                    key: "total",
                    label: "Total cassé · 7 j",
                    width: "148px",
                    align: "right",
                    sort: (a, b) => a.observe_total_eur - b.observe_total_eur,
                    render: (a) => (
                      <span
                        className="font-bold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {fmtEur(a.observe_total_eur, 2)}
                      </span>
                    ),
                  },
                ]}
              />
              <NoteTableau>
                {anomalies.length} catégorie{anomalies.length > 1 ? "s" : ""}{" "}
                affichée{anomalies.length > 1 ? "s" : ""} · liste complète, sans
                plafond. Seuils : vigilance à {Z_WARNING.toLocaleString("fr-FR")} σ, alerte
                à {Z_ALERTE.toLocaleString("fr-FR")} σ.
              </NoteTableau>
            </div>

            {/* ── TERRAIN (< lg) : cartes au pouce, inchangées ───────────── */}
            <ul className="lg:hidden space-y-2.5">
              {anomalies.map((a, idx) => (
                <AnomalieCard key={a.categorie} a={a} riseIndex={idx} />
              ))}
            </ul>
          </>
        )}
      </section>

      {/* CASSES RÉCENTES — liste brute des déclarations (tous types). C'est ce
          que le staff attend en venant ici (une casse fraîche n'est pas une
          « anomalie » statistique). */}
      <section className="px-4 sm:px-5 mt-2 pb-[max(3rem,env(safe-area-inset-bottom))] w-full">
        <EditorialEyebrow num="04" label="Casses récentes" className="mt-3" />
        <p className="text-[12.5px] text-text-secondary mt-1.5 mb-3 max-w-[46ch]">
          Tes déclarations de casse / démarque des 14 derniers jours, la plus
          récente en haut.
        </p>
        {loadError ? (
          <div className="bg-[var(--status-danger-bg,#fdecec)] border border-[var(--status-danger-border,#f3c0c0)] rounded-2xl p-4 text-[13px] text-[var(--status-danger-text,#a8231a)]">
            Liste indisponible : {loadError}
          </div>
        ) : loading ? (
          <div className="bg-[var(--surface-1)] border border-rule rounded-2xl p-6 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
            <p className="text-sm text-text-secondary">Chargement…</p>
          </div>
        ) : recentes.length === 0 ? (
          <div className="bg-[var(--surface-1)] border border-rule rounded-2xl p-5 text-[13px] text-text-secondary">
            Aucune casse déclarée sur les 14 derniers jours.
          </div>
        ) : (
          <>
            {/* ── POSTE DE TRAVAIL (≥ lg) : tableau ──────────────────────
              La vignette portait produit, quantité, motif et heure en trois
              lignes. Le tableau les met en colonnes triables et sépare le
              motif codifié de la précision saisie à la main. */}
            <div className="hidden lg:block">
              <DataTable<CasseRecenteItem>
                rows={recentes}
                getKey={(c) => c.id}
                caption={`Casses déclarées sur 14 jours, ${recentes.length} ligne${recentes.length > 1 ? "s" : ""}`}
                defaultSort={{ key: "quand", dir: "desc" }}
                emptyLabel="Aucune casse déclarée."
                rowAccent={(c) => filetGravite(c.type)}
                columns={[
                  {
                    key: "quand",
                    label: "Horodatage",
                    width: "165px",
                    sort: (a, b) => a.created_at.localeCompare(b.created_at),
                    render: (c) => (
                      <span
                        className="tabular-nums"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {dateHeureTableau(c.created_at)}
                      </span>
                    ),
                  },
                  {
                    key: "produit",
                    label: "Produit",
                    width: "300px",
                    sort: (a, b) =>
                      a.produit_nom.localeCompare(b.produit_nom, "fr"),
                    render: (c) => (
                      <span
                        className="font-semibold truncate block"
                        style={{ color: "var(--text-primary)" }}
                        title={c.produit_nom}
                      >
                        {c.produit_nom}
                      </span>
                    ),
                  },
                  {
                    key: "quantite",
                    label: "Quantité",
                    width: "104px",
                    align: "right",
                    sort: (a, b) => a.quantite - b.quantite,
                    render: (c) => (
                      <span
                        className="font-bold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {c.quantite}
                      </span>
                    ),
                  },
                  {
                    key: "motif",
                    label: "Motif",
                    width: "200px",
                    sort: (a, b) =>
                      (SORTIE_TYPE_LABEL[a.type] ?? a.type).localeCompare(
                        SORTIE_TYPE_LABEL[b.type] ?? b.type,
                        "fr",
                      ),
                    render: (c) => (
                      <Pastille
                        couleur={couleurType(c.type)}
                        texte={SORTIE_TYPE_LABEL[c.type] ?? c.type}
                      />
                    ),
                  },
                  {
                    key: "precision",
                    label: "Précision saisie",
                    render: (c) => (
                      <span
                        className="truncate block"
                        style={{ color: "var(--text-tertiary)" }}
                        title={c.motif_libre ?? undefined}
                      >
                        {c.motif_libre ?? "—"}
                      </span>
                    ),
                  },
                ]}
              />
              <NoteTableau>
                {recentes.length} déclaration
                {recentes.length > 1 ? "s" : ""} affichée
                {recentes.length > 1 ? "s" : ""} · la requête plafonne à{" "}
                {PLAFOND_RECENTES} sur 14 jours. Elle ne ramène ni l&apos;opérateur,
                ni la valeur perdue, ni la photo : ces trois colonnes ne sont pas
                affichables ici.
              </NoteTableau>
            </div>

            {/* ── TERRAIN (< lg) : vignettes au pouce, inchangées ────────── */}
            <ul className="lg:hidden space-y-2">
            {recentes.map((c, idx) => (
              <li
                key={c.id}
                className="lg rise-in px-4 py-3 flex items-center gap-3"
                style={{ ["--i" as string]: Math.min(idx, 8) }}
              >
                <span className="w-9 h-9 rounded-xl bg-cream flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 text-text-tertiary" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-bold text-text-primary leading-tight truncate">
                    {c.produit_nom}
                    <span className="text-text-tertiary font-semibold">
                      {" "}
                      × {c.quantite}
                    </span>
                  </p>
                  <p className="text-[12px] text-text-secondary mt-0.5 truncate">
                    {SORTIE_TYPE_LABEL[c.type] ?? c.type}
                    {c.motif_libre ? ` · ${c.motif_libre}` : ""}
                  </p>
                </div>
                <time className="text-[11.5px] text-text-tertiary tabular shrink-0">
                  {new Date(c.created_at).toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </li>
            ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}

// ── Carte catégorie ──────────────────────────────────────────────────────────

function AnomalieCard({
  a,
  riseIndex,
}: {
  a: CasseAnomalie;
  riseIndex?: number;
}) {
  const meta = NIVEAU_META[a.niveau];
  const ecartPositif = a.ecart_eur >= 0;
  // Carte « normale » = surface neutre élevée → verre. Les niveaux alerte /
  // vigilance gardent leur fond coloré sémantique (lisibilité + sens).
  const isNeutral = a.niveau === "normal";

  return (
    <li
      className={`rise-in p-4 ${
        isNeutral
          ? "lg"
          : `rounded-2xl border border-rule ${meta.bg} ${
              a.niveau === "alerte"
                ? "border-[var(--status-danger)]/40"
                : "border-[var(--status-warning)]/40"
            }`
      }`}
      style={riseIndex != null ? { ["--i" as string]: Math.min(riseIndex, 8) } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[15px] font-extrabold text-text-primary truncate">
              {a.categorie}
            </h3>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-extrabold uppercase tracking-wide ${meta.chip}`}
            >
              {a.niveau === "alerte" ? (
                <AlertOctagon className="w-3 h-3" />
              ) : a.niveau === "warning" ? (
                <AlertTriangle className="w-3 h-3" />
              ) : (
                <CheckCircle2 className="w-3 h-3" />
              )}
              {meta.label}
            </span>
          </div>
          <p className="text-[12px] text-text-secondary mt-1.5 tabular">
            Observé{" "}
            <strong className="text-text-primary">
              {fmtEur(a.observe_jour_eur, 2)}
            </strong>
            /jour · baseline{" "}
            <strong className="text-text-primary">
              {fmtEur(a.baseline_mu_eur, 2)}
            </strong>
            {a.baseline_sigma_eur > 0 && (
              <> · σ {fmtEur(a.baseline_sigma_eur, 2)}</>
            )}
          </p>
          {a.baseline_indisponible ? (
            <p className="text-[11px] text-text-tertiary mt-1">
              Baseline insuffisante · pas de z-score fiable pour l&apos;instant
            </p>
          ) : (
            <p
              className={`text-[11.5px] mt-1 tabular font-semibold ${
                ecartPositif ? meta.text : "text-[var(--status-success-text)]"
              }`}
            >
              {ecartPositif ? "+" : ""}
              {fmtEur(a.ecart_eur, 2)}/jour vs baseline
            </p>
          )}
        </div>

        {/* Z-score en gros */}
        <div className="text-right shrink-0">
          <p
            className={`text-[26px] font-extrabold tabular leading-none ${meta.text}`}
          >
            {fmtZ(a.z_score)}
          </p>
          <p className="text-[10px] text-text-tertiary uppercase tracking-wide mt-1 flex items-center justify-end gap-1">
            {a.z_score != null && a.z_score > 0 ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <Activity className="w-3 h-3" />
            )}
            z-score
          </p>
        </div>
      </div>

      {/* Total 7j */}
      <div className="mt-3 pt-3 border-t border-rule flex items-center justify-between">
        <span className="text-[11px] text-text-tertiary uppercase tracking-wide">
          Total cassé · 7 j
        </span>
        <span className="text-[14px] font-extrabold text-text-primary tabular">
          {fmtEur(a.observe_total_eur, 2)}
        </span>
      </div>
    </li>
  );
}

// ── Toggle graphe ────────────────────────────────────────────────────────────

function GrapheToggle({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
        active ? "bg-primary text-white" : "text-text-secondary"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ── KpiCard ──────────────────────────────────────────────────────────────────

function KpiCard({
  variant,
  riseIndex,
  icon,
  eyebrow,
  value,
  label,
}: {
  variant: "danger" | "warn" | "gold" | "neutral";
  riseIndex?: number;
  icon: React.ReactNode;
  eyebrow: string;
  value: string;
  label: string;
}) {
  const palette = {
    danger: {
      bg: "bg-[var(--status-danger-bg)] rounded-2xl",
      chip: "bg-[var(--status-danger)] text-white",
      value: "text-[var(--status-danger-text)]",
    },
    warn: {
      bg: "bg-[var(--status-warning-bg)] rounded-2xl",
      chip: "bg-[var(--status-warning)] text-[var(--text-on-gold)]",
      value: "text-[var(--status-warning-text)]",
    },
    gold: {
      bg: "bg-[var(--accent-gold-soft)] rounded-2xl",
      chip: "bg-[var(--accent-gold-bright)] text-[var(--text-on-gold)]",
      value: "text-[var(--or-text)]",
    },
    // Seule KPI sur surface neutre élevée → verre. Les variantes colorées
    // restent solides (couleur = sens, lisibilité préservée).
    neutral: {
      bg: "lg lg-hover",
      chip: "bg-primary text-white",
      value: "text-text-primary",
    },
  }[variant];

  return (
    <div
      className={`rise-in p-3.5 ${palette.bg}`}
      style={riseIndex != null ? { ["--i" as string]: riseIndex } : undefined}
    >
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
      <p
        className={`text-[24px] font-extrabold tabular leading-tight mt-2 ${palette.value}`}
      >
        {value}
      </p>
      <p className="text-[11px] text-text-secondary mt-0.5">{label}</p>
    </div>
  );
}
