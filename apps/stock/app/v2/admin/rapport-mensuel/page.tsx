"use client";

/* /v2/admin/rapport-mensuel — Rapport comptable (mensuel + récap fiscal Z)
 * ────────────────────────────────────────────────────────────────────────
 * POSTE DE TRAVAIL (>= 1024 px) — 31/08/2026
 * Un rapport comptable se lit en tableau et en colonnes. Avant travaux la
 * page empilait quatre cartes pleine largeur : a 1440 px il fallait faire
 * defiler pour voir le CA magasin sous le CA consolide.
 * A partir de 1024 px :
 *   - la ventilation de TVA devient un vrai tableau (taux, base HT, TVA,
 *     TTC) — la colonne TTC existe en base et n'etait pas affichee ;
 *   - « Ventes magasin » et « Ventes drive » se placent cote a cote ;
 *   - les tops produits deviennent des tableaux ;
 *   - les actions (PDF, CSV, email) passent dans une colonne collante.
 * Sous 1024 px : pas un pixel ne change.
 *
 * DONNEES SENSIBLES — cette page affiche des montants reels. Aucun montant,
 * aucun nom de client ne doit partir en console, en titre de page ni en nom
 * de fichier de capture.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowDownRight, ArrowUpRight,
  Calendar,
  Download, FileSpreadsheet, FileText,
  Loader2, Mail, Receipt, ShoppingBag, Store, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { DataTable } from "@/components/v2/DataTable";
import { GlassTabs, GlassTabPanel } from "@/components/v2/GlassTabs";
import type { MonthlyReport } from "@/lib/cashbox/monthly-report";
import type { DailyZSummary } from "@/lib/cashbox/daily-z";
import { downloadOrShareBlob, base64ToBlob } from "@/lib/download-helper";
import { DownloadCompleteBar } from "@/components/v2/DownloadCompleteBar";
import { formatTvaRateFr } from "@/lib/cashbox/tva";

const fr2 = (n: number) => new Intl.NumberFormat("fr-FR", {
  style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(n);

// ADM-14 — défaut = MOIS EN COURS (1ère option du combo, cohérent avec le
// titre de la page). Évite l'ambiguïté « Mai sélectionné alors qu'on est en
// juin » : l'utilisateur choisit explicitement un mois clos passé via le
// sélecteur s'il le souhaite.
function currentMonthYYYYMM() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(v: string) {
  const [y, m] = v.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

// Un « top produit » doit nommer un PRODUIT, pas un n° de ticket. Les imports
// Cashmag sans détail-ligne portent une désignation synthétique du type
// « Ticket J1-20260610 #134 » : ce n'est pas un produit, on l'écarte du Top.
// On retire aussi le mot « démo » des libellés (rapport destiné au comptable).
function isTicketLabel(designation: string): boolean {
  return /^ticket\b/i.test(designation.trim());
}
function cleanProduitLabel(designation: string): string {
  return designation
    .replace(/\bd[ée]mo\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Un delta n'a de sens qu'avec un mois précédent comparable. Au tout premier
// mois de données (le précédent est vide ou quasi nul), le % explose
// (« +8355 % ») et n'a aucune valeur : on l'affiche « 1er mois » à la place.
const EVOLUTION_MAX_PCT = 500;

/** Plafond du tableau « top produits » sur ordinateur. Ecrit a l'ecran sous
 *  le tableau : un .slice() muet laisserait croire a une liste complete. */
const TOP_DESKTOP = 10;
function evolutionIsMeaningful(evo: number | null): evo is number {
  return evo !== null && Math.abs(evo) <= EVOLUTION_MAX_PCT;
}

// ── Récap fiscal (Z) — helpers absorbés depuis l'ancienne page recap-fiscal ──

function formatDateFr(iso: string) {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatHeureFr(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso)
    .toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Paris",
    })
    .replace(":", "h");
}

function yesterdayIsoParis() {
  const now = new Date();
  const paris = new Date(
    now.toLocaleString("en-US", { timeZone: "Europe/Paris" }),
  );
  paris.setDate(paris.getDate() - 1);
  return paris.toISOString().slice(0, 10);
}

/**
 * ADM-09 — garde-fou sur les toasts loading (z-pdf / z-csv / z-email).
 * Affiche le toast de chargement et arme un timeout : si l'opération
 * n'aboutit pas dans `ms` (échec silencieux du palier <a>/Share côté iOS,
 * download qui ne résout jamais), le toast bascule en erreur au lieu de
 * tourner indéfiniment. Renvoie un `clear()` à appeler dès qu'une issue
 * (succès/erreur/annulation) est traitée.
 */
function loadingToastWithTimeout(
  id: string,
  message: string,
  ms = 15000,
): () => void {
  toast.loading(message, { id });
  const timer = setTimeout(() => {
    toast.error("Délai dépassé — réessaie le téléchargement.", { id });
  }, ms);
  return () => clearTimeout(timer);
}

type Vue = "mensuel" | "recap";

export default function RapportComptablePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Vue initiale lue depuis l'URL (?vue=mensuel|recap), défaut « mensuel ».
  const [vue, setVue] = useState<Vue>(
    searchParams.get("vue") === "recap" ? "recap" : "mensuel",
  );

  function changeVue(next: Vue) {
    setVue(next);
    // Reflète la vue dans l'URL sans recharger la page ni perdre l'état.
    router.replace(`/v2/admin/rapport-mensuel?vue=${next}`, { scroll: false });
  }

  // ── Vue mensuelle ──
  const [mois, setMois] = useState(currentMonthYYYYMM());
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(true);

  // ── Vue récap fiscal (Z) ──
  const [date, setDate] = useState(yesterdayIsoParis());
  const [summary, setSummary] = useState<DailyZSummary | null>(null);
  const [loadingZ, setLoadingZ] = useState(true);
  const fetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [downloaded, setDownloaded] = useState<{ filename: string } | null>(null);

  useEffect(() => {
    setLoadingReport(true);
    // HOTFIX vague 7 : /api/cashbox/monthly-report* exige x-internal-secret.
    // On passe par les server actions qui injectent le secret côté serveur.
    (async () => {
      try {
        const { fetchMonthlyReport } = await import("@/lib/actions/cashbox");
        const r = await fetchMonthlyReport(mois);
        if (!r.ok || !r.data) {
          toast.error(r.error ?? "Erreur");
          setReport(null);
        } else {
          setReport(r.data as unknown as MonthlyReport);
        }
      } finally {
        setLoadingReport(false);
      }
    })();
  }, [mois]);

  useEffect(() => {
    // Debounce 300ms : le date-picker peut déclencher plusieurs changements
    // rapides (clavier, flèches) → on évite de spammer l'API daily-z.
    setLoadingZ(true);
    if (fetchTimer.current) clearTimeout(fetchTimer.current);
    // HOTFIX sécu : /api/cashbox/daily-z* exige x-internal-secret. On passe
    // par la server action qui injecte le secret côté serveur.
    fetchTimer.current = setTimeout(() => {
      (async () => {
        try {
          const { fetchDailyZ } = await import("@/lib/actions/cashbox");
          const r = await fetchDailyZ(date);
          if (!r.ok || !r.data) {
            toast.error(r.error ?? "Erreur", { id: "z-error" });
            setSummary(null);
          } else {
            setSummary(r.data as unknown as DailyZSummary);
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Erreur");
          setSummary(null);
        } finally {
          setLoadingZ(false);
        }
      })();
    }, 300);
    return () => {
      if (fetchTimer.current) clearTimeout(fetchTimer.current);
    };
  }, [date]);

  // Ventilation de TVA mise a plat pour le tableau du poste de travail.
  // Meme source que la liste du telephone : report.consolidation.tva_par_taux.
  const lignesTva = useMemo(() => {
    if (!report) return [];
    const lignes = Object.entries(report.consolidation.tva_par_taux)
      .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
      .map(([taux, v]) => ({ taux, ...v, total: false }));
    if (!lignes.length) return lignes;
    // Ligne de total DANS le tableau, pas a cote : un total pose sous le
    // tableau se retrouvait aligne sous la colonne TTC alors qu'il additionne
    // la colonne TVA. Un comptable lisait « 3 728,45 € de TTC ».
    return [
      ...lignes,
      {
        taux: "__total",
        base_ht: lignes.reduce((s, l) => s + l.base_ht, 0),
        tva: lignes.reduce((s, l) => s + l.tva, 0),
        ttc: lignes.reduce((s, l) => s + l.ttc, 0),
        total: true,
      },
    ];
  }, [report]);

  const monthOptions = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now); d.setMonth(d.getMonth() - i);
      const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      out.push({ value: v, label: monthLabel(v) });
    }
    return out;
  }, []);

  // ── Actions vue mensuelle ──

  async function downloadPdf() {
    toast.loading("Génération PDF…", { id: "rep-pdf" });
    const filename = `salam-rapport-mensuel-${mois}.pdf`;
    // HOTFIX vague 7 : passe par server action (x-internal-secret).
    const { fetchMonthlyReportPdf } = await import("@/lib/actions/cashbox");
    const bin = await fetchMonthlyReportPdf(mois);
    if (!bin.ok || !bin.base64) {
      toast.error(bin.error ?? "Erreur", { id: "rep-pdf" });
      return;
    }
    const blob = base64ToBlob(bin.base64, bin.contentType ?? "application/pdf");
    const r = await downloadOrShareBlob({
      blob,
      filename: bin.filename ?? filename,
      contentType: "application/pdf",
      shareTitle: `Rapport mensuel ${mois}`,
    });
    if (r.success) {
      toast.success(
        r.strategy === "share" ? "PDF partagé"
        : r.strategy === "newtab" ? "PDF ouvert dans Safari"
        : "PDF téléchargé",
        { id: "rep-pdf" }
      );
      setDownloaded({ filename });
    } else if (r.strategy === "cancelled") {
      toast.dismiss("rep-pdf");
    } else {
      toast.error(r.error ?? "Erreur", { id: "rep-pdf" });
    }
  }

  async function downloadCsv() {
    toast.loading("Génération CSV…", { id: "rep-csv" });
    const filename = `salam-rapport-mensuel-${mois}.csv`;
    // HOTFIX vague 7 : passe par server action (x-internal-secret).
    const { fetchMonthlyReportCsv } = await import("@/lib/actions/cashbox");
    const bin = await fetchMonthlyReportCsv(mois);
    if (!bin.ok || !bin.base64) {
      toast.error(bin.error ?? "Erreur", { id: "rep-csv" });
      return;
    }
    const blob = base64ToBlob(bin.base64, bin.contentType ?? "text/csv; charset=utf-8");
    const r = await downloadOrShareBlob({
      blob,
      filename: bin.filename ?? filename,
      contentType: "text/csv",
      shareTitle: `Rapport CSV ${mois}`,
    });
    if (r.success) {
      toast.success(
        r.strategy === "share" ? "CSV partagé"
        : r.strategy === "newtab" ? "CSV ouvert dans Safari"
        : "CSV téléchargé",
        { id: "rep-csv" }
      );
      setDownloaded({ filename });
    } else if (r.strategy === "cancelled") {
      toast.dismiss("rep-csv");
    } else {
      toast.error(r.error ?? "Erreur", { id: "rep-csv" });
    }
  }

  // ── Actions vue récap fiscal (Z) ──

  async function downloadZPdf() {
    const clearGuard = loadingToastWithTimeout("z-pdf", "Génération du PDF…");
    const filename = `salam-drive-Z-${date}.pdf`;
    // HOTFIX sécu : passe par server action (x-internal-secret).
    const { fetchDailyZPdf } = await import("@/lib/actions/cashbox");
    const bin = await fetchDailyZPdf(date);
    if (!bin.ok || !bin.base64) {
      clearGuard();
      toast.error(bin.error ?? "Erreur", { id: "z-pdf" });
      return;
    }
    const blob = base64ToBlob(bin.base64, bin.contentType ?? "application/pdf");
    const r = await downloadOrShareBlob({
      blob,
      filename: bin.filename ?? filename,
      contentType: "application/pdf",
      shareTitle: `Récap fiscal ${date}`,
    });
    clearGuard();
    if (r.success) {
      toast.success(
        r.strategy === "share"
          ? "PDF partagé"
          : r.strategy === "newtab"
            ? "PDF ouvert dans Safari"
            : "PDF téléchargé",
        { id: "z-pdf" },
      );
      setDownloaded({ filename });
    } else if (r.strategy === "cancelled") {
      toast.dismiss("z-pdf");
    } else {
      toast.error(r.error ?? "Erreur", { id: "z-pdf" });
    }
  }

  async function downloadZCsv() {
    const clearGuard = loadingToastWithTimeout("z-csv", "Génération du CSV…");
    const filename = `salam-drive-Z-${date}.csv`;
    // HOTFIX sécu : passe par server action (x-internal-secret).
    const { fetchDailyZCsv } = await import("@/lib/actions/cashbox");
    const bin = await fetchDailyZCsv(date);
    if (!bin.ok || !bin.base64) {
      clearGuard();
      toast.error(bin.error ?? "Erreur", { id: "z-csv" });
      return;
    }
    const blob = base64ToBlob(bin.base64, bin.contentType ?? "text/csv; charset=utf-8");
    const r = await downloadOrShareBlob({
      blob,
      filename: bin.filename ?? filename,
      contentType: "text/csv",
      shareTitle: `Récap fiscal CSV ${date}`,
    });
    clearGuard();
    if (r.success) {
      toast.success(
        r.strategy === "share"
          ? "CSV partagé"
          : r.strategy === "newtab"
            ? "CSV ouvert dans Safari"
            : "CSV téléchargé",
        { id: "z-csv" },
      );
      setDownloaded({ filename });
    } else if (r.strategy === "cancelled") {
      toast.dismiss("z-csv");
    } else {
      toast.error(r.error ?? "Erreur", { id: "z-csv" });
    }
  }

  async function sendZEmail() {
    const clearGuard = loadingToastWithTimeout("z-email", "Envoi par email…");
    try {
      // HOTFIX vague 7 : passer par server action (x-internal-secret).
      const { sendInternalNotify } = await import("@/lib/actions/notify");
      const r = await sendInternalNotify({
        kind: "daily_z_email",
        payload: {
          date,
          pdf_url: `/api/cashbox/daily-z-pdf?date=${date}`,
          csv_url: `/api/cashbox/daily-z-csv?date=${date}`,
        },
      });
      if (!r.ok) throw new Error(r.error ?? "Envoi échoué");
      clearGuard();
      toast.success("Email envoyé à l'adresse comptable configurée", {
        id: "z-email",
      });
    } catch (e) {
      clearGuard();
      toast.error(e instanceof Error ? e.message : "Erreur", { id: "z-email" });
    }
  }

  return (
    /* Deux familles de page dans un seul ecran : le rapport mensuel est un
       tableau de bord (layout wide), le recap fiscal est le fac-simile d'un
       ticket Z — un document a largeur naturelle (layout flow). */
    <V2Shell hideNav layout={vue === "recap" ? "flow" : "wide"}>
      <header className="px-5 pt-7 lg:px-5">
        <BackButton />
        <p className="section-eyebrow mt-3"><FileText className="w-3 h-3" />Rapport comptable</p>
        <h1 className="h1 text-text-primary mt-1">
          {vue === "mensuel"
            ? monthLabel(mois).replace(/^./, (c) => c.toUpperCase())
            : "Salam Drive · Z du jour"}
        </h1>
        <p className="body-md text-text-secondary mt-1">
          {vue === "mensuel"
            ? "Ventes magasin (Cashmag) + ventes Drive, pour ton expert-comptable."
            : "Document récapitulatif des ventes Drive. À transmettre au comptable avec le Z magasin Cashmag."}
        </p>

        {/* Sélecteur de vue */}
        <GlassTabs<Vue>
          ariaLabel="Type de rapport"
          className="mt-5"
          value={vue}
          onChange={changeVue}
          items={[
            { value: "mensuel", label: "Rapport mensuel" },
            { value: "recap", label: "Récap fiscal (Z)" },
          ]}
        />

        {/* Sélecteur de période, selon la vue */}
        {vue === "mensuel" ? (
          <div className="mt-5">
            <label className="label-caps text-text-tertiary block mb-2">Mois</label>
            <select value={mois} onChange={(e) => setMois(e.target.value)} className="input-field max-w-[260px] font-bold text-text-primary">
              {monthOptions.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        ) : (
          <div className="mt-5">
            <label className="label-caps text-text-tertiary block mb-2">
              <Calendar className="w-3 h-3 inline mr-1" />
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="input-field max-w-[220px] font-bold text-text-primary tabular"
            />
          </div>
        )}
      </header>

      <GlassTabPanel tabKey={vue}>
      {vue === "mensuel" ? (
        loadingReport ? (
          <section className="px-5 mt-6">
            <div className="bg-white border border-rule rounded-[20px] p-10 flex items-center justify-center gap-3">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <p className="text-sm text-text-secondary">Calcul du rapport…</p>
            </div>
          </section>
        ) : !report ? (
          <section className="px-5 mt-6"><p className="text-text-secondary text-sm">Aucune donnée.</p></section>
        ) : (
          <>
            {report.magasin.partial && (
              <section className="px-5 mt-4">
                <div className="bg-warning-soft border border-warning/30 rounded-[16px] p-3.5 flex items-start gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-warning mt-1.5 shrink-0" />
                  <div className="text-[12px]">
                    <p className="font-bold text-warning">Données magasin partielles</p>
                    <p className="text-text-secondary mt-0.5">
                      Pensez à importer le CSV Cashmag de {monthLabel(mois)}.{" "}
                      <a href="/v2/admin/import-cashmag" className="text-primary font-bold underline">Importer</a>
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* POSTE DE TRAVAIL : rapport a gauche, actions collees a droite,
              a partir de 1280 px SEULEMENT. Mesure a 1024 px : un volet
              d'actions de 320 px ne laissait que 412 px au rapport.
              Sous 1280 px ces deux div ne portent que `min-w-0` (sans effet
              en flux normal) : la pile de sections du telephone est intacte. */}
            <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-6 xl:items-start xl:px-5 xl:mt-5">
            <div className="min-w-0">
            <section className="px-5 mt-5 xl:px-0 xl:mt-0">
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}
                className="bg-white border border-rule rounded-[20px] p-5 shadow-card">
                <p className="section-eyebrow"><TrendingUp className="w-3 h-3" />CA total consolidé</p>
                <p className="text-[32px] font-extrabold text-text-primary mt-1.5 tabular leading-none">
                  {fr2(report.consolidation.ca_ttc_total)}
                </p>
                {evolutionIsMeaningful(report.consolidation.evolution_vs_mois_precedent) ? (
                  <p className={`mt-2 inline-flex items-center gap-1 text-[12px] font-bold tabular ${report.consolidation.evolution_vs_mois_precedent >= 0 ? "text-success" : "text-danger"}`}>
                    {report.consolidation.evolution_vs_mois_precedent >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                    {report.consolidation.evolution_vs_mois_precedent >= 0 ? "+" : ""}
                    {report.consolidation.evolution_vs_mois_precedent.toFixed(1)}%
                    <span className="text-text-tertiary font-medium ml-1">vs mois précédent</span>
                  </p>
                ) : (
                  <p className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium tabular text-text-tertiary">
                    1er mois de données — pas de comparaison
                  </p>
                )}
                {/* ADM-07 — barre de RÉPARTITION (pas une alerte) : on bannit
                  l'or (réservé aux états d'alerte) et on utilise deux teintes
                  sapin de la marque pour distinguer Magasin / Drive. */}
                <div className="mt-4 h-2 rounded-full bg-cream overflow-hidden flex">
                  <div className="bg-primary h-full" style={{ width: `${report.consolidation.repartition.magasin_pct}%` }} />
                  <div className="bg-primary-hover h-full" style={{ width: `${report.consolidation.repartition.drive_pct}%` }} />
                </div>
                <div className="flex justify-between mt-2 text-[11px]">
                  <span className="inline-flex items-center gap-1.5 text-text-secondary">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />Magasin {report.consolidation.repartition.magasin_pct.toFixed(0)}%
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-text-secondary">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-hover" />Drive {report.consolidation.repartition.drive_pct.toFixed(0)}%
                  </span>
                </div>
                <div className="mt-5 border-t border-rule pt-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-text-secondary mb-2">Ventilation TVA collectée</p>
                  {/* >= lg : vrai tableau. La colonne TTC existe en base
                    (tva_par_taux[taux].ttc) et n'etait affichee nulle part —
                    c'est la colonne que le comptable additionne. */}
                  <div className="hidden lg:block">
                    <DataTable
                      rows={lignesTva}
                      getKey={(l) => l.taux}
                      caption="Ventilation de la TVA collectée par taux"
                      columns={[
                        {
                          key: "taux",
                          label: "Taux",
                          width: "140px",
                          render: (l) => (
                            <span className={`text-text-primary tabular ${l.total ? "font-extrabold" : "font-bold"}`}>
                              {l.total ? "Total" : `TVA ${formatTvaRateFr(l.taux)}`}
                            </span>
                          ),
                        },
                        {
                          key: "base",
                          label: "Base HT",
                          align: "right",
                          render: (l) => (
                            <span className={l.total ? "font-extrabold text-text-primary" : "text-text-secondary"}>
                              {fr2(l.base_ht)}
                            </span>
                          ),
                        },
                        {
                          key: "tva",
                          label: "TVA collectée",
                          align: "right",
                          render: (l) => (
                            <span className={`text-text-primary ${l.total ? "font-extrabold" : "font-bold"}`}>
                              {fr2(l.tva)}
                            </span>
                          ),
                        },
                        {
                          key: "ttc",
                          label: "TTC",
                          align: "right",
                          render: (l) => (
                            <span className={l.total ? "font-extrabold text-text-primary" : "text-text-secondary"}>
                              {fr2(l.ttc)}
                            </span>
                          ),
                        },
                      ]}
                      emptyLabel="Aucune TVA collectée sur la période."
                    />
                  </div>
                  {/* &lt; lg : la liste au pouce, inchangee. */}
                  <div className="space-y-1.5 lg:hidden">
                    {Object.entries(report.consolidation.tva_par_taux).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])).map(([rate, v]) => (
                      <div key={rate} className="flex items-baseline text-[12.5px]">
                        <span className="w-[80px] font-bold text-text-primary tabular">TVA {formatTvaRateFr(rate)}</span>
                        <span className="flex-1 text-right tabular font-bold text-text-primary">{fr2(v.tva)}</span>
                        <span className="ml-3 text-text-tertiary text-[10.5px] tabular w-[110px] text-right">base {fr2(v.base_ht)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </section>

            {/* Magasin / Drive cote a cote seulement au-dela de 1800 px. Mesure a
              1536 px (le palier 2xl) : les deux cartes tombaient a 390 px, le
              tableau des tops produits a 155 px de colonne « Produit », et
              CHAQUE nom passait sur deux lignes. Empilees, elles disposent de
              842 px a 1536 px. Le palier est donc ecrit en clair. */}
            <div className="min-[1800px]:grid min-[1800px]:grid-cols-2 min-[1800px]:gap-5">
            <section className="px-5 mt-5 xl:px-0">
              <SectionCard icon={<Store className="w-3 h-3" />} eyebrow="Ventes magasin"
                ca={report.magasin.ca_ttc} m1l="Tickets" m1v={report.magasin.nb_tickets.toString()}
                m2l="Panier moyen" m2v={fr2(report.magasin.panier_moyen)} top={report.magasin.top_produits}
                hint={report.magasin.last_import_at ? `Importé ${new Date(report.magasin.last_import_at).toLocaleDateString("fr-FR")}` : "Aucun import Cashmag"} />
            </section>

            <section className="px-5 mt-5 xl:px-0">
              <SectionCard icon={<ShoppingBag className="w-3 h-3" />} eyebrow="Ventes drive"
                ca={report.drive.ca_ttc} m1l="Commandes" m1v={report.drive.nb_tickets.toString()}
                m2l="Panier moyen" m2v={fr2(report.drive.panier_moyen)} top={report.drive.top_produits}
                hint={`Frais Stripe ${fr2(report.drive.frais_stripe)} · Net ${fr2(report.drive.net)}`} />
            </section>
            </div>
            </div>

            <aside className="xl:sticky xl:top-4">
            <section className="px-5 mt-6 space-y-2.5 xl:px-0 xl:mt-0">
              <p className="section-eyebrow mb-2"><FileText className="w-3 h-3" />Pour ton comptable</p>
              <button onClick={downloadPdf}
                className="w-full bg-primary text-white rounded-[18px] py-3.5 px-4 flex items-center justify-between shadow-card active:scale-[0.99] transition-transform">
                <span className="inline-flex items-center gap-2.5"><FileText className="w-5 h-5" />
                  <span className="font-bold text-[14px]">Télécharger PDF mensuel</span></span>
                <Download className="w-4 h-4" />
              </button>
              <button onClick={downloadCsv}
                className="w-full bg-white border border-rule rounded-[18px] py-3.5 px-4 flex items-center justify-between active:scale-[0.99] transition-transform">
                <span className="inline-flex items-center gap-2.5 text-text-primary"><FileSpreadsheet className="w-5 h-5 text-primary" />
                  <span className="font-bold text-[14px]">CSV détaillé (4 sections)</span></span>
                <Download className="w-4 h-4 text-text-secondary" />
              </button>
              <button onClick={async () => {
                toast.loading("Envoi…", { id: "rep-email" });
                try {
                  // HOTFIX vague 7 : server action injecte x-internal-secret.
                  const { sendInternalNotify } = await import("@/lib/actions/notify");
                  const r = await sendInternalNotify({
                    kind: "monthly_report_email",
                    payload: {
                      mois,
                      ca_total: report.consolidation.ca_ttc_total,
                      pdf_url: `/api/cashbox/monthly-report-pdf?mois=${mois}`,
                      csv_url: `/api/cashbox/monthly-report-csv?mois=${mois}`,
                    },
                  });
                  if (!r.ok) throw new Error(r.error ?? "Échec");
                  toast.success("Email envoyé au comptable", { id: "rep-email" });
                } catch (e) { toast.error(e instanceof Error ? e.message : "Erreur", { id: "rep-email" }); }
              }}
                className="w-full bg-cream border border-rule rounded-[18px] py-3 px-4 flex items-center gap-2.5 active:scale-[0.99] transition-transform">
                <Mail className="w-4 h-4 text-primary" />
                <span className="font-semibold text-[13px] text-text-primary">Envoyer par email au comptable</span>
              </button>
              <p className="text-[10.5px] text-text-tertiary text-center pt-1">
                Cron auto : envoi le 1er de chaque mois à 06h00.
              </p>
            </section>
            </aside>
            </div>
          </>
        )
      ) : (
        <>
          {/* POSTE DE TRAVAIL : le ticket Z est un DOCUMENT, il garde une
            largeur naturelle (620 px) ; les actions se rangent a cote.
            Le couple est cale a GAUCHE, sur le bord du titre : centre, il
            demarrait 98 px a droite de l'en-tete (releve a 1440 px).
            Etirer un fac-simile de ticket sur 1650 px n'aurait aucun sens :
            c'est pour ca que cette vue passe en layout="flow". */}
          <div className="lg:grid lg:grid-cols-[minmax(0,620px)_300px] lg:gap-6 lg:items-start lg:px-5 lg:mt-6 lg:max-w-[980px]">
          {/* TICKET Z */}
          <section className="px-5 mt-6 lg:px-0 lg:mt-0">
            {loadingZ ? (
              <div className="bg-white border border-rule rounded-[20px] p-10 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
                <p className="text-sm text-text-secondary">
                  Génération du récap fiscal…
                </p>
              </div>
            ) : !summary || summary.status === "no_data" ? (
              <div className="bg-white border border-rule rounded-[20px] p-8 text-center">
                <Receipt className="w-8 h-8 text-text-tertiary mx-auto mb-3" />
                <p className="text-sm font-bold text-text-primary">
                  Aucune vente Drive le {formatDateFr(date)}
                </p>
                <p className="text-xs text-text-secondary mt-1.5">
                  Si tu attends des données, vérifie que les commandes Drive du jour
                  ont bien été validées.
                </p>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
                className="bg-white border-2 border-dashed border-line-medium rounded-[20px] p-5 shadow-card mono text-[12.5px] leading-relaxed text-text-primary"
                style={{
                  fontFamily:
                    'ui-monospace, "SF Mono", "Menlo", "JetBrains Mono", monospace',
                }}
              >
                {/* Header magasin */}
                <div className="text-center mb-3">
                  <p className="font-extrabold text-[14px]">SALAM MARKET DRIVE</p>
                  <p className="text-text-secondary text-[11px] mt-0.5">
                    K &amp; A FOOD — SIRET 802 773 812
                  </p>
                  <p className="text-text-secondary text-[11px]">
                    8 av. Larrieu-Thibaud, 31100 Toulouse
                  </p>
                </div>

                <div className="border-t border-line-medium my-2" />

                <div className="text-center mb-3">
                  <p className="font-extrabold uppercase text-[13px]">
                    Récap fiscal journalier
                  </p>
                  <p className="mt-1">
                    Date : <span className="font-bold">{formatDateFr(date)}</span>
                  </p>
                  <p className="text-text-secondary text-[11px] mt-0.5">
                    Émis le{" "}
                    {new Date(summary.generated_at).toLocaleString("fr-FR", {
                      timeZone: "Europe/Paris",
                    })}
                  </p>
                </div>

                <div className="border-t border-line-medium my-2" />

                {/* Compteurs */}
                <div className="space-y-1.5">
                  <Row
                    label="Nombre de commandes"
                    value={summary.nb_commandes.toString()}
                  />
                  <Row
                    label="1ère commande"
                    value={formatHeureFr(summary.premiere_commande_at)}
                  />
                  <Row
                    label="Dernière commande"
                    value={formatHeureFr(summary.derniere_commande_at)}
                  />
                </div>

                <div className="border-t border-line-medium my-3" />

                {/* CA */}
                <div className="space-y-1.5">
                  <Row label="CA TTC" value={formatEurFr(summary.ca_ttc)} bold />
                  <Row label="CA HT" value={formatEurFr(summary.ca_ht)} />
                </div>

                <div className="border-t border-line-medium my-3" />

                {/* TVA */}
                <p className="font-bold uppercase text-[11px] tracking-wide text-text-secondary mb-1">
                  TVA collectée
                </p>
                <div className="space-y-1">
                  {Object.entries(summary.tva_par_taux)
                    .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
                    .map(([rate, v]) => (
                      <div key={rate} className="flex items-baseline">
                        <span className="w-[88px] tabular">TVA {formatTvaRateFr(rate)}</span>
                        <span className="flex-1 tabular text-right">
                          {formatEurFr(v.tva)}
                        </span>
                        <span className="text-text-tertiary text-[10.5px] tabular ml-3 w-[110px] text-right">
                          base {formatEurFr(v.base_ht)}
                        </span>
                      </div>
                    ))}
                  <Row
                    label="Total TVA"
                    value={formatEurFr(summary.tva_totale)}
                    bold
                  />
                </div>

                <div className="border-t border-line-medium my-3" />

                {/* Mode paiement */}
                <p className="font-bold uppercase text-[11px] tracking-wide text-text-secondary mb-1">
                  Mode de paiement
                </p>
                <div className="space-y-1">
                  {Object.entries(summary.modes_paiement).map(([mode, ttc]) => (
                    <Row
                      key={mode}
                      label={mode === "stripe" ? "Stripe (CB online)" : mode}
                      value={formatEurFr(ttc)}
                    />
                  ))}
                </div>

                <div className="border-t border-line-medium my-3" />

                {/* Net */}
                <div className="space-y-1.5">
                  <Row
                    label="Frais Stripe"
                    value={`− ${formatEurFr(summary.frais_stripe)}`}
                  />
                  <Row
                    label="NET ENCAISSÉ"
                    value={formatEurFr(summary.net_encaisse)}
                    bold
                    highlight
                  />
                  <Row
                    label="Panier moyen"
                    value={formatEurFr(summary.panier_moyen)}
                  />
                </div>

                <div className="border-t border-line-medium my-3" />

                <p className="text-center text-[10.5px] text-text-secondary leading-relaxed">
                  Document non fiscal au sens NF525.
                  <br />À conserver pour la comptabilité.
                </p>
              </motion.div>
            )}
          </section>

          {/* Actions */}
          {summary && summary.status === "ok" && (
            <section className="px-5 mt-5 space-y-2.5 lg:px-0 lg:mt-0 lg:sticky lg:top-4">
              <button
                onClick={downloadZPdf}
                className="w-full bg-primary text-white rounded-[18px] py-3.5 px-4 flex items-center justify-between shadow-card active:scale-[0.99] transition-transform"
              >
                <span className="inline-flex items-center gap-2.5">
                  <FileText className="w-5 h-5" />
                  <span className="font-bold text-[14px]">Télécharger PDF</span>
                </span>
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={downloadZCsv}
                className="w-full bg-white border border-rule rounded-[18px] py-3.5 px-4 flex items-center justify-between active:scale-[0.99] transition-transform"
              >
                <span className="inline-flex items-center gap-2.5 text-text-primary">
                  <FileSpreadsheet className="w-5 h-5 text-primary" />
                  <span className="font-bold text-[14px]">
                    CSV détaillé (ligne par ligne)
                  </span>
                </span>
                <Download className="w-4 h-4 text-text-secondary" />
              </button>
              <button
                onClick={sendZEmail}
                className="w-full bg-cream border border-rule rounded-[18px] py-3 px-4 flex items-center justify-between active:scale-[0.99] transition-transform"
              >
                <span className="inline-flex items-center gap-2.5 text-text-primary">
                  <Mail className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-[13px]">
                    Envoyer par email au comptable
                  </span>
                </span>
              </button>
              <p className="text-[10.5px] text-text-tertiary text-center pt-1">
                Cron auto : envoi quotidien à 23h59 (Europe/Paris).
              </p>
            </section>
          )}
          </div>
        </>
      )}
      </GlassTabPanel>

      <DownloadCompleteBar
        filename={downloaded?.filename ?? null}
        onDismiss={() => setDownloaded(null)}
        backLabel="Retour à l'admin"
        backHref="/v2/admin"
      />
    </V2Shell>
  );
}

function formatEurFr(n: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function SectionCard({ icon, eyebrow, ca, m1l, m1v, m2l, m2v, top, hint }: {
  icon: React.ReactNode; eyebrow: string; ca: number;
  m1l: string; m1v: string; m2l: string; m2v: string;
  top: Array<{ designation: string; quantite: number; ca: number }>; hint: string;
}) {
  // On n'affiche que de VRAIS produits : on écarte les désignations qui sont
  // des n° de ticket (Cashmag sans détail-ligne) et on nettoie le mot « démo ».
  const topProduits = top
    .filter((p) => !isTicketLabel(p.designation))
    .map((p) => ({ ...p, designation: cleanProduitLabel(p.designation) }));
  return (
    <div className="bg-white border border-rule rounded-[20px] p-5 shadow-card">
      <p className="section-eyebrow">{icon}{eyebrow}</p>
      <p className="text-[22px] font-extrabold text-text-primary mt-1.5 tabular leading-none">{fr2(ca)}</p>
      <p className="text-[11px] text-text-tertiary mt-1.5">{hint}</p>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-tertiary font-bold">{m1l}</p>
          <p className="text-[15px] font-extrabold text-text-primary tabular mt-1">{m1v}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-text-tertiary font-bold">{m2l}</p>
          <p className="text-[15px] font-extrabold text-text-primary tabular mt-1">{m2v}</p>
        </div>
      </div>
      {topProduits.length > 0 && (
        <div className="mt-4 border-t border-rule pt-3">
          {/* >= lg : tableau, jusqu'a 10 produits. Le plafond est ECRIT
            sous la liste, jamais implicite. */}
          <div className="hidden lg:block">
            <p className="text-[10px] uppercase tracking-wide text-text-tertiary font-bold mb-1">
              Top {Math.min(topProduits.length, TOP_DESKTOP)} produits
            </p>
            <DataTable
              rows={topProduits.slice(0, TOP_DESKTOP)}
              getKey={(p) => p.designation}
              caption="Meilleures ventes de la période"
              columns={[
                {
                  key: "designation",
                  label: "Produit",
                  render: (p) => (
                    <span className="font-semibold text-text-primary">{p.designation}</span>
                  ),
                },
                {
                  key: "quantite",
                  label: "Quantité",
                  width: "110px",
                  align: "right",
                  sort: (a, b) => a.quantite - b.quantite,
                  render: (p) => <span className="text-text-secondary">{p.quantite}</span>,
                },
                {
                  key: "ca",
                  label: "CA TTC",
                  width: "130px",
                  align: "right",
                  sort: (a, b) => a.ca - b.ca,
                  render: (p) => (
                    <span className="font-bold text-text-primary">{fr2(p.ca)}</span>
                  ),
                },
              ]}
              emptyLabel="Aucun produit identifié sur la période."
            />
            <p className="text-[11px] text-text-tertiary mt-2">
              {topProduits.length > TOP_DESKTOP
                ? `Liste plafonnée aux ${TOP_DESKTOP} premiers produits sur ${topProduits.length} identifiés.`
                : `${topProduits.length} produit${topProduits.length > 1 ? "s" : ""} identifié${topProduits.length > 1 ? "s" : ""} — liste complète.`}
            </p>
          </div>
          <p className="text-[10px] uppercase tracking-wide text-text-tertiary font-bold mb-2 lg:hidden">Top {Math.min(topProduits.length, 5)} produits</p>
          <ul className="space-y-1.5 lg:hidden">
            {topProduits.slice(0, 5).map((p, idx) => (
              <li key={p.designation} className="flex items-baseline gap-2 text-[12px]">
                <span className="text-text-tertiary w-4 tabular">{idx + 1}.</span>
                <span className="flex-1 truncate text-text-primary font-semibold">{p.designation}</span>
                <span className="text-text-tertiary tabular text-[10.5px]">×{p.quantite}</span>
                <span className="font-bold text-text-primary tabular w-[84px] text-right">{fr2(p.ca)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  highlight,
}: {
  label: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline ${
        highlight
          ? "bg-primary text-white -mx-2 px-3 py-1.5 rounded-md my-1"
          : ""
      }`}
    >
      <span
        className={`flex-1 ${bold ? "font-bold" : ""} ${
          highlight ? "" : "text-text-secondary"
        } text-[12px] uppercase tracking-wide`}
      >
        {label}
      </span>
      <span
        className={`tabular text-right ${bold ? "font-extrabold" : "font-semibold"} ${
          highlight ? "text-white" : "text-text-primary"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
