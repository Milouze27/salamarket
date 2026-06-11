"use client";

/**
 * /v2/admin/casse-anomalies — Détection d'anomalies de démarque / casse.
 *
 * Pour Otmane / Ahmed (admin) : "ta casse Boucherie cette semaine est à
 * +2.8σ vs ta baseline 28 jours. Regarde — d'habitude 12€/jour, là 47€."
 *
 * Tout le calcul vit dans lib/db/casse.ts (z-score par catégorie). La page ne
 * fait qu'orchestrer : KPI, liste triée par z décroissant, et un graphe
 * basculable (casse par catégorie · pic horaire). Données réelles dans ~20j →
 * EmptyState soigné, jamais de crash si baseline vide (z-score → fallback).
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
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { EditorialEyebrow } from "@/components/v2/EditorialEyebrow";
import { EmptyState } from "@/components/v2/EmptyState";
import { useV2 } from "@/lib/v2-store";
import {
  computeAnomalies,
  getPicHoraire,
  listCassesRecentes,
  SORTIE_TYPE_LABEL,
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

type GrapheMode = "categorie" | "horaire";

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CasseAnomaliesPage() {
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
    <V2Shell hideNav wide>
      <PageAccentStripe accent="bordeaux" />

      <header className="px-4 sm:px-5 pt-7">
        <BackButton />
        <EditorialEyebrow num="01" label="Démarque" className="mt-3" />
        <h1 className="h1-display mt-1">
          Casse <span className="gold">anomalies</span>
        </h1>
        <p className="body-md text-text-secondary mt-2 max-w-prose">
          Z-score de la casse 7 jours par catégorie, comparé à ta baseline 28
          jours glissants. Au-delà de 1.5σ on lève une vigilance · au-delà de
          2.5σ une alerte.
        </p>
      </header>

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
      <section className="px-4 sm:px-5 mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2.5 max-w-7xl mx-auto w-full">
        <KpiCard
          variant="neutral"
          icon={<PackageX className="w-4 h-4" />}
          eyebrow="CASSE 7 JOURS"
          value={fmtEur(casseTotale7j)}
          label="valorisée prix magasin"
        />
        <KpiCard
          variant="danger"
          icon={<AlertOctagon className="w-4 h-4" />}
          eyebrow="ALERTES"
          value={`${nbAlerte}`}
          label="catégories au-delà de 2.5σ"
        />
        <KpiCard
          variant="warn"
          icon={<AlertTriangle className="w-4 h-4" />}
          eyebrow="VIGILANCE"
          value={`${nbWarning}`}
          label="catégories au-delà de 1.5σ"
        />
        <KpiCard
          variant="gold"
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
        <section className="px-4 sm:px-5 mt-5 max-w-7xl mx-auto w-full">
          <div className="bg-[var(--surface-1)] border border-rule rounded-[20px] p-4 shadow-card">
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
              <ResponsiveContainer width="100%" height="100%" minHeight={180}>
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
      <section className="px-4 sm:px-5 mt-5 pb-[max(3rem,env(safe-area-inset-bottom))] max-w-7xl mx-auto w-full">
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
            <ul className="space-y-2.5">
              {anomalies.map((a) => (
                <AnomalieCard key={a.categorie} a={a} />
              ))}
            </ul>
          </>
        )}
      </section>

      {/* CASSES RÉCENTES — liste brute des déclarations (tous types). C'est ce
          que le staff attend en venant ici (une casse fraîche n'est pas une
          « anomalie » statistique). */}
      <section className="px-4 sm:px-5 mt-2 pb-[max(3rem,env(safe-area-inset-bottom))] max-w-7xl mx-auto w-full">
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
          <ul className="space-y-2">
            {recentes.map((c) => (
              <li
                key={c.id}
                className="bg-[var(--surface-1)] border border-rule rounded-2xl px-4 py-3 flex items-center gap-3"
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
        )}
      </section>
    </V2Shell>
  );
}

// ── Carte catégorie ──────────────────────────────────────────────────────────

function AnomalieCard({ a }: { a: CasseAnomalie }) {
  const meta = NIVEAU_META[a.niveau];
  const ecartPositif = a.ecart_eur >= 0;

  return (
    <li
      className={`rounded-2xl p-4 border border-rule ${meta.bg} ${
        a.niveau === "alerte"
          ? "border-[var(--status-danger)]/40"
          : a.niveau === "warning"
            ? "border-[var(--status-warning)]/40"
            : ""
      }`}
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
      bg: "bg-[var(--status-danger-bg)]",
      chip: "bg-[var(--status-danger)] text-white",
      value: "text-[var(--status-danger-text)]",
    },
    warn: {
      bg: "bg-[var(--status-warning-bg)]",
      chip: "bg-[var(--status-warning)] text-[var(--text-on-gold)]",
      value: "text-[var(--status-warning-text)]",
    },
    gold: {
      bg: "bg-[var(--accent-gold-soft)]",
      chip: "bg-[var(--accent-gold-bright)] text-[var(--text-on-gold)]",
      value: "text-[var(--or-text)]",
    },
    neutral: {
      bg: "bg-[var(--surface-1)] border border-rule",
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
      <p
        className={`text-[24px] font-extrabold tabular leading-tight mt-2 ${palette.value}`}
      >
        {value}
      </p>
      <p className="text-[11px] text-text-secondary mt-0.5">{label}</p>
    </div>
  );
}
