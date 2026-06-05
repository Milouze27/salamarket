"use client";

/**
 * /v2/labo — Labo · recettes & marges
 * ────────────────────────────────────
 * Cockpit production traiteur / charcuterie / boucherie transformée.
 *
 * Trois étages, rythme volontairement varié (pas de grille monotone) :
 *   (a) Bandeau MARGE — un héros sapin/or qui montre la marge HT générée
 *       sur la période (sélecteur 7/30/90 j en pills), + CA potentiel HT,
 *       marge % moyenne, rendement matière moyen.
 *   (b) RECETTES — catalogue des templates avec coût main d'œuvre théorique
 *       (le catalogue produits n'a pas de prix d'achat → coût matières non
 *       chiffrable au niveau template, on l'assume honnêtement).
 *   (c) PRODUCTIONS récentes — date, recette, rendement %, marge € HT.
 *
 * Données : lib/db/labo.ts (anon SELECT, fallback gracieux). Vide = normal
 * tant que le labo n'a rien saisi — l'empty state l'explique sans alarmer.
 *
 * LOIS L99 : tokens only (jamais d'hex thème en dur), middot · jamais —,
 * tabular-nums sur €/%/kg, cibles ≥44px, inputs ≥16px, responsive, dark
 * natif, motion sobre.
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Beaker,
  ChefHat,
  Clock,
  CalendarDays,
  Coins,
  Factory,
  Gauge,
  Layers,
  Loader2,
  Percent,
  TrendingUp,
} from "lucide-react";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { EditorialEyebrow } from "@/components/v2/EditorialEyebrow";
import { EmptyState } from "@/components/v2/EmptyState";
import { GlossaryTerm } from "@/components/v2/GlossaryTerm";
import {
  listRecettes,
  listProductions,
  getProductionsKpi,
  type Recette,
  type ProductionRecente,
  type KpiAgrege,
  type ProductionKpi,
  type KpiPeriod,
} from "@/lib/db/labo";

/* ───────────────────────── Formatters ───────────────────────── */

const eur = (v: number | null): string =>
  v === null
    ? "·"
    : new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: v !== 0 && Math.abs(v) < 100 ? 2 : 0,
      }).format(v);

const pct = (v: number | null): string =>
  v === null
    ? "·"
    : `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

const dateCourt = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
};

const STATUT_RECETTE: Record<Recette["statut"], string> = {
  active: "Active",
  draft: "Brouillon",
  archived: "Archivée",
};

const STATUT_PROD: Record<ProductionRecente["statut"], string> = {
  en_cours: "En cours",
  terminee: "Terminée",
  archivee: "Archivée",
};

const PERIODS: KpiPeriod[] = [7, 30, 90];

/** Couleur d'une marge % : sapin si saine, ambre si fine, danger si négative. */
function margeTone(pctVal: number | null): string {
  if (pctVal === null) return "var(--text-tertiary)";
  if (pctVal < 0) return "var(--status-danger-text)";
  if (pctVal < 15) return "var(--status-warning-text)";
  return "var(--success)";
}

/* ───────────────────────── Page ───────────────────────── */

export default function LaboPage() {
  const [period, setPeriod] = useState<KpiPeriod>(30);
  const [kpi, setKpi] = useState<KpiAgrege | null>(null);
  const [kpiLignes, setKpiLignes] = useState<ProductionKpi[]>([]);
  const [recettes, setRecettes] = useState<Recette[]>([]);
  const [productions, setProductions] = useState<ProductionRecente[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpiLoading, setKpiLoading] = useState(false);

  // Recettes + productions : chargés une fois (indépendants de la période).
  useEffect(() => {
    let alive = true;
    void (async () => {
      setLoading(true);
      const [recs, prods] = await Promise.all([
        listRecettes(),
        listProductions(12),
      ]);
      if (!alive) return;
      setRecettes(recs);
      setProductions(prods);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // KPI : rechargés à chaque changement de période.
  useEffect(() => {
    let alive = true;
    void (async () => {
      setKpiLoading(true);
      const { agrege, lignes } = await getProductionsKpi(period);
      if (!alive) return;
      setKpi(agrege);
      setKpiLignes(lignes);
      setKpiLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [period]);

  // Marge ligne à ligne, indexée par production_id, pour enrichir la liste
  // des productions récentes (la vue/calcul KPI ne couvre que les terminées).
  const margeParProd = useMemo(() => {
    const m = new Map<string, ProductionKpi>();
    for (const l of kpiLignes) m.set(l.id, l);
    return m;
  }, [kpiLignes]);

  const hasAnyData =
    recettes.length > 0 || productions.length > 0 || kpiLignes.length > 0;

  return (
    <V2Shell wide>
      <PageAccentStripe accent="sapin-or" />

      <header className="px-4 sm:px-5 pt-7 max-w-7xl mx-auto w-full">
        <BackButton href="/v2" />
        <EditorialEyebrow num="07" label="Labo" className="mt-3" />
        <h1 className="h1-display mt-1">
          Recettes &amp; <span className="gold">marges</span>
        </h1>
        <p
          className="body-md mt-2 max-w-prose"
          style={{ color: "var(--text-secondary)" }}
        >
          Le poste production en un coup d&apos;œil :{" "}
          <GlossaryTerm
            term="rendement matière"
            def="Quantité sortie ÷ quantité entrée. 100 % = aucune perte ; < 100 % = chutes, parage, évaporation."
          />{" "}
          et marge réelle par lot, recettes chiffrées à la main d&apos;œuvre.
        </p>
      </header>

      {/* ───────── (a) Bandeau MARGE + sélecteur période ───────── */}
      <section className="px-4 sm:px-5 mt-5 max-w-7xl mx-auto w-full">
        {/* Pills période */}
        <div
          className="flex items-center gap-2 mb-3"
          role="group"
          aria-label="Période d'analyse des marges"
        >
          <span
            className="label-caps mr-1 hidden sm:inline"
            style={{ color: "var(--text-tertiary)" }}
          >
            Période
          </span>
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              data-active={period === p}
              aria-pressed={period === p}
              className="pill-filter min-h-[44px] md:min-h-0"
            >
              {p} j
            </button>
          ))}
          {kpiLoading && (
            <Loader2
              className="w-4 h-4 animate-spin ml-1"
              style={{ color: "var(--text-tertiary)" }}
              aria-hidden
            />
          )}
        </div>

        {/* Héros marge — gradient sapin→or, l'instant "wow" du pitch */}
        <div
          className="relative overflow-hidden rounded-[22px] p-5 sm:p-6"
          style={{
            background:
              "linear-gradient(135deg, var(--primary-green) 0%, var(--primary-green-hover) 58%, var(--accent-gold) 150%)",
            color: "#fff",
          }}
        >
          <div
            aria-hidden
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 92% 8%, rgba(255,255,255,0.22) 0%, transparent 55%)",
            }}
          />
          <div className="relative">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white/15 backdrop-blur-sm shrink-0">
                <TrendingUp className="w-5 h-5 text-[var(--accent-gold-bright)]" />
              </span>
              <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[var(--accent-gold-bright)]">
                Marge HT générée · {period} derniers jours
              </p>
            </div>

            <p className="text-[40px] sm:text-[48px] font-extrabold tabular leading-none mt-3">
              {eur(kpi?.marge_eur_total ?? 0)}
            </p>
            <p className="text-[13px] text-white/85 mt-1.5 flex items-center gap-1.5 flex-wrap">
              <span className="tabular font-bold">
                {eur(kpi?.marge_eur_par_jour ?? 0)}
              </span>
              <span className="text-white/70">/ jour produit actif</span>
              {kpi && kpi.nb_productions > 0 && (
                <span className="text-white/70">
                  · {kpi.nb_productions}{" "}
                  {kpi.nb_productions > 1 ? "productions" : "production"}{" "}
                  terminée
                  {kpi.nb_productions > 1 ? "s" : ""}
                </span>
              )}
            </p>

            {/* Sous-KPI : 3 colonnes au pied du héros */}
            <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-white/15">
              <HeroSubKpi
                icon={<Percent className="w-3.5 h-3.5" />}
                label="Marge moy."
                value={pct(kpi?.marge_pct_moyenne ?? null)}
              />
              <HeroSubKpi
                icon={<Coins className="w-3.5 h-3.5" />}
                label="CA potentiel HT"
                value={eur(kpi?.ca_potentiel_ht_total ?? 0)}
              />
              <HeroSubKpi
                icon={<Gauge className="w-3.5 h-3.5" />}
                label="Rendement moy."
                value={pct(kpi?.rendement_pct_moyen ?? null)}
              />
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="px-4 sm:px-5 mt-8 max-w-7xl mx-auto w-full">
          <div
            className="rounded-2xl p-10 flex items-center justify-center gap-2"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-card)",
            }}
          >
            <Loader2
              className="w-5 h-5 animate-spin"
              style={{ color: "var(--accent-gold)" }}
            />
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Chargement du labo…
            </p>
          </div>
        </div>
      ) : !hasAnyData ? (
        <section className="px-4 sm:px-5 mt-2 max-w-7xl mx-auto w-full">
          <div
            className="rounded-[22px]"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-card)",
            }}
          >
            <EmptyState
              icon={Beaker}
              title="Le labo n'a encore rien produit"
              description="Aucune recette ni production pour l'instant · les vraies données arriveront bientôt. Cet écran chiffrera alors coûts, rendement et marge par lot."
            />
          </div>
        </section>
      ) : (
        <>
          {/* ───────── (b) RECETTES ───────── */}
          <section className="px-4 sm:px-5 mt-9 max-w-7xl mx-auto w-full">
            <SectionHead
              icon={<ChefHat className="w-4 h-4" />}
              eyebrow="Catalogue"
              title="Recettes"
              count={recettes.length}
            />

            {recettes.length === 0 ? (
              <div
                className="rounded-2xl p-6 text-center mt-3"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-card)",
                }}
              >
                <p
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Aucune recette enregistrée · les templates de production
                  apparaîtront ici.
                </p>
              </div>
            ) : (
              <ul className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {recettes.map((r, i) => (
                  <RecetteCard key={r.id} recette={r} index={i} />
                ))}
              </ul>
            )}
          </section>

          {/* ───────── (c) PRODUCTIONS récentes ───────── */}
          <section className="px-4 sm:px-5 mt-9 pb-[max(3rem,env(safe-area-inset-bottom))] max-w-7xl mx-auto w-full">
            <SectionHead
              icon={<Factory className="w-4 h-4" />}
              eyebrow="Atelier"
              title="Productions récentes"
              count={productions.length}
            />

            {productions.length === 0 ? (
              <div
                className="rounded-2xl p-6 text-center mt-3"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-card)",
                }}
              >
                <p
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Aucune production lancée · le premier lot s&apos;affichera ici
                  avec son rendement et sa marge.
                </p>
              </div>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {productions.map((p, i) => (
                  <ProductionRow
                    key={p.id}
                    prod={p}
                    kpi={margeParProd.get(p.id) ?? null}
                    index={i}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </V2Shell>
  );
}

/* ───────────────────────── Sous-composants ───────────────────────── */

function HeroSubKpi({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-white/65 flex items-center gap-1">
        {icon}
        <span className="truncate">{label}</span>
      </p>
      <p className="text-[15px] sm:text-[17px] font-extrabold tabular leading-tight mt-1">
        {value}
      </p>
    </div>
  );
}

function SectionHead({
  icon,
  eyebrow,
  title,
  count,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  count: number;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <p
          className="label-caps flex items-center gap-1.5"
          style={{ color: "var(--text-tertiary)" }}
        >
          <span style={{ color: "var(--accent-gold)" }}>{icon}</span>
          {eyebrow}
        </p>
        <h2 className="h2 mt-0.5" style={{ color: "var(--text-primary)" }}>
          {title}
        </h2>
      </div>
      <span
        className="tabular text-[13px] font-bold shrink-0"
        style={{ color: "var(--text-tertiary)" }}
      >
        {count}
      </span>
    </div>
  );
}

function RecetteCard({ recette, index }: { recette: Recette; index: number }) {
  const r = recette;
  const isActive = r.statut === "active";
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(index * 0.02, 0.16) }}
      className="card"
      style={{ padding: 14 }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="h3 truncate" style={{ color: "var(--text-primary)" }}>
            {r.nom}
          </h3>
          <p
            className="body-sm mt-0.5 flex items-center gap-1.5 flex-wrap"
            style={{ color: "var(--text-secondary)" }}
          >
            {r.categorie ? (
              <span>{r.categorie}</span>
            ) : (
              <span style={{ color: "var(--text-tertiary)" }}>
                Sans catégorie
              </span>
            )}
            <span style={{ color: "var(--text-tertiary)" }}>
              · v{r.version}
            </span>
          </p>
        </div>
        <span
          className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide"
          style={
            isActive
              ? {
                  background: "var(--status-success-bg)",
                  color: "var(--status-success-text)",
                }
              : {
                  background: "var(--status-neutral-bg)",
                  color: "var(--status-neutral-text)",
                }
          }
        >
          {STATUT_RECETTE[r.statut]}
        </span>
      </div>

      <div
        className="grid grid-cols-3 gap-2 mt-3 pt-3"
        style={{ borderTop: "1px solid var(--border-card)" }}
      >
        <MiniStat
          icon={<Layers className="w-3 h-3" />}
          label="Ingréd."
          value={`${r.nb_ingredients}`}
        />
        <MiniStat
          icon={<Clock className="w-3 h-3" />}
          label="Postes MO"
          value={`${r.nb_postes_mo}`}
        />
        <MiniStat
          icon={<Coins className="w-3 h-3" />}
          label="Coût MO"
          value={eur(r.cout_total_theo)}
          strong
        />
      </div>
    </motion.li>
  );
}

function MiniStat({
  icon,
  label,
  value,
  strong = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div>
      <p
        className="text-[9.5px] font-bold uppercase tracking-wide flex items-center gap-1"
        style={{ color: "var(--text-tertiary)" }}
      >
        {icon}
        {label}
      </p>
      <p
        className="tabular mt-0.5"
        style={{
          fontSize: strong ? 14 : 13,
          fontWeight: strong ? 800 : 700,
          color: strong ? "var(--text-gold)" : "var(--text-primary)",
        }}
      >
        {value}
      </p>
    </div>
  );
}

function ProductionRow({
  prod,
  kpi,
  index,
}: {
  prod: ProductionRecente;
  kpi: ProductionKpi | null;
  index: number;
}) {
  const p = prod;
  const terminee = p.statut === "terminee";

  // Marge : on privilégie le KPI ligne (vue/calcul) ; à défaut le champ
  // marge_calculee stocké sur la production. null si on ne sait pas.
  const margeEur = kpi?.marge_eur_ht ?? p.marge_calculee ?? null;
  const margePct = kpi?.marge_pct_ht ?? null;
  const rendement = kpi?.rendement_pct ?? null;

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(index * 0.03, 0.18) }}
      className="card"
      style={{ padding: 14 }}
    >
      <div className="flex items-center gap-3">
        {/* Date en pastille */}
        <div
          className="shrink-0 rounded-xl px-2.5 py-2 text-center"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-card)",
            minWidth: 56,
          }}
        >
          <p
            className="text-[10px] font-bold uppercase tracking-wide flex items-center justify-center gap-1"
            style={{ color: "var(--text-tertiary)" }}
          >
            <CalendarDays className="w-3 h-3" aria-hidden />
          </p>
          <p
            className="text-[13px] font-extrabold tabular leading-tight mt-0.5"
            style={{ color: "var(--text-primary)" }}
          >
            {dateCourt(p.date_production)}
          </p>
        </div>

        {/* Recette + statut */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3
              className="h3 truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {p.recette ?? "Production libre"}
            </h3>
            <span
              className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-md text-[9.5px] font-bold uppercase tracking-wide"
              style={
                terminee
                  ? {
                      background: "var(--status-success-bg)",
                      color: "var(--status-success-text)",
                    }
                  : {
                      background: "var(--status-neutral-bg)",
                      color: "var(--status-neutral-text)",
                    }
              }
            >
              {STATUT_PROD[p.statut]}
            </span>
          </div>
          {p.lot_numero && (
            <p
              className="text-[11px] mono mt-0.5 truncate"
              style={{ color: "var(--text-tertiary)" }}
            >
              Lot {p.lot_numero}
            </p>
          )}
        </div>

        {/* Marge € à droite */}
        <div className="text-right shrink-0">
          <p
            className="text-[16px] font-extrabold tabular leading-none"
            style={{ color: margeTone(margePct) }}
          >
            {eur(margeEur)}
          </p>
          <p
            className="text-[9.5px] font-bold uppercase tracking-wide mt-1"
            style={{ color: "var(--text-tertiary)" }}
          >
            marge HT
          </p>
        </div>
      </div>

      {/* Détail rendement / marge % — seulement si on a des chiffres */}
      {(rendement !== null || margePct !== null) && (
        <div
          className="grid grid-cols-2 gap-2 mt-3 pt-3"
          style={{ borderTop: "1px solid var(--border-card)" }}
        >
          <MiniStat
            icon={<Gauge className="w-3 h-3" />}
            label="Rendement"
            value={pct(rendement)}
          />
          <MiniStat
            icon={<Percent className="w-3 h-3" />}
            label="Marge %"
            value={pct(margePct)}
            strong
          />
        </div>
      )}
    </motion.li>
  );
}
