"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  Eye,
  FileText,
  History,
  Loader2,
  PackageCheck,
  PackageX,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { supabase } from "@/lib/supabase";
import { useV2 } from "@/lib/v2-store";

type Tab = "sorties" | "demarque" | "surplus" | "historique";

interface SortieSuspecte {
  id: string;
  type: string;
  motif_libre: string | null;
  quantite: number;
  photo_url: string;
  ia_coherence_score: number;
  ia_coherence_notes: string | null;
  created_at: string;
  produits: { nom: string } | null;
  employes: { prenom: string | null; nom: string } | null;
  depots: { nom: string } | null;
}

interface AlerteSurplus {
  id: string;
  bdl_id: string | null;
  code_barre_scanne: string;
  produit_id: string | null;
  quantite_surplus: number;
  signale_par: string | null;
  signale_le: string;
  statut: "en_attente" | "accepte" | "refuse";
  decideur: string | null;
  decide_le: string | null;
  photo_preuve_url: string | null;
  notes: string | null;
  produits: { id: string; nom: string; ean: string | null } | null;
  bons_de_livraison: {
    id: string;
    numero_bdl: string;
    fournisseurs: { id: string; nom: string } | null;
  } | null;
}

interface DemarqueRow {
  produit: string;
  ean: string;
  entrees: number;
  ventes: number;
  sorties_tracees: number;
  stock_theorique: number;
  stock_physique: number;
  ecart: number;
  valeur: number;
}

function fr(n: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fr2(n: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function timeAgoFr(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "à l'instant";
  if (d < 3600) return `il y a ${Math.floor(d / 60)} min`;
  if (d < 86400) return `il y a ${Math.floor(d / 3600)} h`;
  return `il y a ${Math.floor(d / 86400)} j`;
}

function nameOf(p: { prenom: string | null; nom: string } | null) {
  if (!p) return "—";
  return `${p.prenom ?? ""} ${p.nom}`.trim();
}

export default function AlertesPage() {
  const searchParams = useSearchParams();
  const employe = useV2((s) => s.currentEmploye);
  const [tab, setTab] = useState<Tab>(
    searchParams.get("tab") === "surplus" ? "surplus" : "sorties",
  );
  const [sorties, setSorties] = useState<SortieSuspecte[]>([]);
  const [surplus, setSurplus] = useState<AlerteSurplus[]>([]);
  const [demarque, setDemarque] = useState<DemarqueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortiesError, setSortiesError] = useState(false);
  const [detail, setDetail] = useState<SortieSuspecte | null>(null);
  const [surplusDetail, setSurplusDetail] = useState<AlerteSurplus | null>(null);
  const [surplusSubmitting, setSurplusSubmitting] = useState(false);

  // Garde rôle (defense-in-depth) : seuls admin/manager peuvent modérer une
  // sortie suspecte (altère le score d'audit IA + push collègue). La nav est
  // déjà restreinte côté V2Shell, mais on revérifie au point d'action — la
  // RLS sur sorties_stock reste à durcir côté DB (migration sécu séparée).
  const canModerate =
    employe?.role === "admin" || employe?.role === "manager";

  /** Action ACCEPTER : marque la sortie comme reviewed (score → 1.0
   *  pour la sortir du filtre lt(0.7)) + préfixe note + reload. */
  async function handleAccept(d: SortieSuspecte) {
    if (!canModerate) {
      toast.error("Action réservée aux managers");
      return;
    }
    const sb = supabase();
    if (!sb) return;
    const note = `[✓ Accepté par ${employe?.prenom ?? "admin"} le ${new Date().toLocaleString("fr-FR")}] ${d.ia_coherence_notes ?? ""}`;
    // Écriture anon directe fermée (sécu #14) : modération via RPC SECURITY
    // DEFINER `moderer_sortie`, qui revérifie le rôle admin/manager côté SQL.
    const { error } = await sb.rpc("moderer_sortie", {
      p_acteur_id: employe?.id ?? "",
      p_sortie_id: d.id,
      p_action: "accept",
      p_note: note,
    });
    if (error) {
      toast.error("Erreur : " + error.message);
      return;
    }
    toast.success("Sortie acceptée et tracée");
    setDetail(null);
    void loadAll();
  }

  /** Action CLARIFICATION : push notif iPhone à l'employé ayant fait
   *  la sortie. La sortie reste flagged pour review ultérieure. */
  async function handleClarification(d: SortieSuspecte) {
    if (!canModerate) {
      toast.error("Action réservée aux managers");
      return;
    }
    const sb = supabase();
    if (!sb) return;
    // Trouve employe.id depuis le name (pas dispo direct sur SortieSuspecte)
    const empName = nameOf(d.employes);
    // SECURITY : vue publique anon-safe.
    const { data: emps } = await sb
      .from("employes_public")
      .select("id, prenom, nom")
      .eq("is_active", true);
    const targetEmp = (
      (emps ?? []) as Array<{
        id: string;
        prenom: string | null;
        nom: string;
      }>
    ).find((e) => `${e.prenom ?? ""} ${e.nom}`.trim() === empName);
    if (!targetEmp) {
      toast.error(`Employé "${empName}" introuvable`);
      return;
    }
    const note = `[⚠ Clarification demandée par ${employe?.prenom ?? "admin"} le ${new Date().toLocaleString("fr-FR")}] ${d.ia_coherence_notes ?? ""}`;
    const { error: noteErr } = await sb.rpc("moderer_sortie", {
      p_acteur_id: employe?.id ?? "",
      p_sortie_id: d.id,
      p_action: "clarifier",
      p_note: note,
    });
    if (noteErr) {
      // Ne pas notifier une clarification qui n'a pas été enregistrée.
      console.error("[alertes] enregistrement clarification échoué:", noteErr);
      toast.error("Impossible d'enregistrer la clarification · réessaie");
      return;
    }
    // Push notif iPhone vers l'employé
    // HOTFIX vague 7 : passer par server action (x-internal-secret).
    void import("@/lib/actions/push-send")
      .then((m) =>
        m.sendPush({
          title: `🔍 Clarification demandée`,
          body: `${employe?.prenom ?? "Admin"} te demande de clarifier la sortie ${d.type} de ${d.produits?.nom ?? "produit"}.`,
          url: "/v2/sortie",
          tag: `clarif-${d.id}`,
          urgent: true,
          employe_ids: [targetEmp.id],
        }),
      )
      .catch((e) => console.warn("[push clarif] fail:", e));
    toast.warning(`Clarification demandée à ${empName} (push iPhone envoyée)`, {
      duration: 4000,
    });
    setDetail(null);
    void loadAll();
  }

  /** Action REJETER : marque la sortie comme rejetée (score 0.99 pour
   *  la sortir du filtre) + revert mental du stock à faire à la main
   *  (pas d'undo automatique pour préserver l'audit). */
  async function handleReject(d: SortieSuspecte) {
    if (!canModerate) {
      toast.error("Action réservée aux managers");
      return;
    }
    const sb = supabase();
    if (!sb) return;
    const note = `[✗ REJETÉ par ${employe?.prenom ?? "admin"} le ${new Date().toLocaleString("fr-FR")}] ${d.ia_coherence_notes ?? ""}`;
    const { error } = await sb.rpc("moderer_sortie", {
      p_acteur_id: employe?.id ?? "",
      p_sortie_id: d.id,
      p_action: "reject",
      p_note: note,
    });
    if (error) {
      toast.error("Erreur : " + error.message);
      return;
    }
    toast.error("Sortie rejetée — stock à corriger manuellement", {
      duration: 4500,
    });
    setDetail(null);
    void loadAll();
  }

  /** Décision surplus fournisseur : accepter (facturer) ou refuser (retourner).
   *  Persistance directe sur alertes_surplus (statut + décideur + horodatage). */
  async function decideSurplus(
    alerte: AlerteSurplus,
    statut: "accepte" | "refuse",
  ) {
    const sb = supabase();
    if (!sb) return;
    setSurplusSubmitting(true);
    try {
      const { error } = await sb
        .from("alertes_surplus")
        .update({
          statut,
          decideur: employe?.id ?? null,
          decide_le: new Date().toISOString(),
        })
        .eq("id", alerte.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success(
        statut === "accepte"
          ? "Surplus accepté · facture fournisseur à émettre"
          : "Surplus refusé · à retourner au fournisseur",
      );
      setSurplusDetail(null);
      void loadAll();
    } finally {
      setSurplusSubmitting(false);
    }
  }

  async function loadAll() {
    setLoading(true);
    const sb = supabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    // 1. Sorties suspectes (score IA < 0.7)
    // NB : on NE joint PAS `employes` directement — anon n'a plus SELECT sur
    // cette table depuis le lockdown PII (migration 20260531000021). Le join
    // PostgREST `employes(prenom,nom)` renvoyait un 401 permission denied qui
    // faisait échouer TOUTE la requête → faux « aucune sortie suspecte ». On
    // récupère l'employe_id ici et on résout le nom via la vue employes_public.
    const { data: dsorties, error: sortiesErr } = await sb
      .from("sorties_stock")
      .select(
        `id, type, motif_libre, quantite, photo_url, ia_coherence_score, ia_coherence_notes, created_at, employe_id,
         produits (nom),
         depots (nom)`,
      )
      .lt("ia_coherence_score", 0.7)
      .order("created_at", { ascending: false })
      .limit(50);
    if (sortiesErr) {
      console.error(
        "[alertes] chargement sorties suspectes échoué:",
        sortiesErr,
      );
      toast.error("Impossible de charger les sorties suspectes");
      setSortiesError(true);
      setSorties([]);
    } else {
      setSortiesError(false);
      // Résolution des noms d'employés via la vue anon-safe.
      const rows = (dsorties ?? []) as unknown as Array<
        Omit<SortieSuspecte, "employes"> & { employe_id: string | null }
      >;
      const ids = [
        ...new Set(rows.map((r) => r.employe_id).filter(Boolean)),
      ] as string[];
      const empMap = new Map<string, { prenom: string | null; nom: string }>();
      if (ids.length > 0) {
        const { data: emps } = await sb
          .from("employes_public")
          .select("id, prenom, nom")
          .in("id", ids);
        for (const e of (emps ?? []) as Array<{
          id: string;
          prenom: string | null;
          nom: string;
        }>) {
          empMap.set(e.id, { prenom: e.prenom, nom: e.nom });
        }
      }
      setSorties(
        rows.map((r) => ({
          ...r,
          employes: r.employe_id ? (empMap.get(r.employe_id) ?? null) : null,
        })) as unknown as SortieSuspecte[],
      );
    }

    // 2. Surplus
    const { data: dsurplus, error: surplusErr } = await sb
      .from("alertes_surplus")
      .select(
        `id, bdl_id, code_barre_scanne, produit_id, quantite_surplus, signale_par, signale_le, statut,
         decideur, decide_le, photo_preuve_url, notes,
         produits (id, nom, ean),
         bons_de_livraison (id, numero_bdl, fournisseurs (id, nom))`,
      )
      .order("signale_le", { ascending: false });
    if (surplusErr) {
      console.error("[alertes] chargement surplus échoué:", surplusErr);
      toast.error("Impossible de charger les surplus");
    }
    setSurplus((dsurplus ?? []) as unknown as AlerteSurplus[]);

    // 3. Démarque — heuristique simple : produits avec écart négatif suspect
    //    Compute approximatif depuis sorties + commandes_drive sur 7 derniers jours
    //    En l'absence de table de ventes magasin temps réel, on synthétise des
    //    rows depuis ce qui est traçable. Pour la démo on inclut Coca Zero hardcodé
    //    + on dérive depuis stock_par_depot quantite anormalement basse.
    // Pas de données factices : on n'affiche AUCUNE démarque inventée
    // (le proprio pourrait agir sur de faux écarts). Le calcul réel —
    // stock théorique (entrées réception − ventes cashmag − sorties tracées)
    // comparé au stock physique — sera branché quand l'historique cashmag
    // sera consolidé. En attendant, l'onglet affiche l'état vide honnête.
    setDemarque([]);

    setLoading(false);
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const kpi = useMemo(() => {
    const urgent = sorties.filter((s) => s.ia_coherence_score < 0.5).length;
    const demarqueValue = demarque.reduce((s, r) => s + r.valeur, 0);
    const surplusEnAttente = surplus.filter((s) => s.statut === "en_attente");
    const surplusValue = surplusEnAttente.reduce(
      (s, r) => s + r.quantite_surplus * 7.5,
      0,
    );
    return {
      urgentes: urgent + surplusEnAttente.length,
      demarqueValue,
      surplusValue,
      surplusCount: surplusEnAttente.length,
    };
  }, [sorties, demarque, surplus]);

  // La démarque reste vide tant que l'historique cashmag n'est pas consolidé
  // (cf. setDemarque([]) plus haut). On masque l'onglet + le KPI tant qu'il n'y
  // a aucune ligne pour ne pas afficher d'indicateur mort à 0 €.
  const showDemarque = demarque.length > 0;

  // Si l'onglet Démarque était sélectionné mais devient masqué, retomber sur Sorties.
  useEffect(() => {
    if (!showDemarque && tab === "demarque") setTab("sorties");
  }, [showDemarque, tab]);

  return (
    <V2Shell hideNav>
      <PageAccentStripe accent="bordeaux" />
      <header className="px-5 pt-7">
        <BackButton />
        <p className="section-eyebrow mt-3">
          <ShieldAlert className="w-3 h-3" />
          Centre d&apos;alertes IA
        </p>
        <h1 className="h1 text-text-primary mt-1">
          Alertes &amp; surveillance
        </h1>
        <p className="body-md text-text-secondary mt-1">
          Sorties suspectes, démarque détectée et surplus fournisseurs. Pour
          décision Otmane / Ahmed.
        </p>
      </header>

      {/* KPI top */}
      <section className="px-5 mt-5 grid grid-cols-2 gap-2.5">
        <KpiCard
          variant="danger"
          icon={<AlertCircle className="w-4 h-4" />}
          eyebrow="URGENT"
          value={`${kpi.urgentes}`}
          label="alertes à traiter"
        />
        {showDemarque && (
          <KpiCard
            variant="warn"
            icon={<TrendingDown className="w-4 h-4" />}
            eyebrow="DÉMARQUE 7J"
            value={fr(kpi.demarqueValue)}
            label="à enquêter"
          />
        )}
        <KpiCard
          variant="primary"
          icon={<Truck className="w-4 h-4" />}
          eyebrow="SURPLUS"
          value={fr(kpi.surplusValue)}
          label={`${kpi.surplusCount} à refacturer`}
        />
        <KpiCard
          variant="neutral"
          icon={<Sparkles className="w-4 h-4" />}
          eyebrow="IA SCORE"
          value={`${sorties.filter((s) => s.ia_coherence_score < 0.5).length}`}
          label="sorties < 0.5"
        />
      </section>

      {/* Tabs — pas de sticky pour éviter de passer derrière le shell header */}
      <nav className="px-5 mt-5 pt-2 pb-3" role="tablist">
        <div className="flex gap-1 overflow-x-auto -mx-1 px-1 scrollbar-hide [mask-image:linear-gradient(to_right,transparent,#000_10px,#000_calc(100%-24px),transparent)]">
          <TabBtn active={tab === "sorties"} onClick={() => setTab("sorties")}>
            <PackageX className="w-3.5 h-3.5" />
            Sorties&nbsp;
            <Badge>{sorties.length}</Badge>
          </TabBtn>
          {showDemarque && (
            <TabBtn
              active={tab === "demarque"}
              onClick={() => setTab("demarque")}
            >
              <TrendingDown className="w-3.5 h-3.5" />
              Démarque&nbsp;
              <Badge>{demarque.length}</Badge>
            </TabBtn>
          )}
          <TabBtn active={tab === "surplus"} onClick={() => setTab("surplus")}>
            <Truck className="w-3.5 h-3.5" />
            Surplus&nbsp;
            <Badge>
              {surplus.filter((s) => s.statut === "en_attente").length}
            </Badge>
          </TabBtn>
          <TabBtn
            active={tab === "historique"}
            onClick={() => setTab("historique")}
          >
            <History className="w-3.5 h-3.5" />
            Historique
          </TabBtn>
        </div>
      </nav>

      <section className="px-5 pb-12">
        {loading ? (
          <div className="bg-white border border-rule rounded-2xl p-10 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <p className="text-sm text-text-secondary">Chargement…</p>
          </div>
        ) : tab === "sorties" ? (
          <SortiesPanel
            sorties={sorties}
            error={sortiesError}
            onRetry={() => void loadAll()}
            onDetail={(s) => setDetail(s)}
          />
        ) : tab === "demarque" ? (
          <DemarquePanel rows={demarque} />
        ) : tab === "surplus" ? (
          <SurplusPanel
            items={surplus}
            onDetail={(s) => setSurplusDetail(s)}
          />
        ) : (
          <HistoriquePanel
            sorties={sorties.filter((s) => s.ia_coherence_score >= 0.7)}
            surplus={surplus.filter((s) => s.statut !== "en_attente")}
          />
        )}
      </section>

      {/* Detail modal sortie */}
      <AnimatePresence>
        {detail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end justify-center"
            onClick={() => setDetail(null)}
          >
            <motion.div
              initial={{ y: 80 }}
              animate={{ y: 0 }}
              exit={{ y: 80 }}
              transition={{ type: "spring", damping: 26, stiffness: 280 }}
              className="bg-white w-full max-w-[460px] rounded-t-[28px] p-6 pb-10 shadow-card-lg max-h-[88vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-3">
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-bold uppercase tracking-wide ${
                    detail.ia_coherence_score < 0.5
                      ? "bg-danger-soft text-danger"
                      : "bg-warning-soft text-warning"
                  }`}
                >
                  <Bell className="w-3 h-3" />
                  {detail.ia_coherence_score < 0.5
                    ? "Alerte rouge"
                    : "À clarifier"}
                </span>
                <button onClick={() => setDetail(null)}>
                  <X className="w-5 h-5 text-text-tertiary" />
                </button>
              </div>
              <h2 className="text-[19px] font-extrabold text-text-primary">
                {detail.produits?.nom ?? "Produit inconnu"}
              </h2>
              <p className="text-[12px] text-text-secondary mt-1">
                Sortie de {detail.quantite} unité
                {detail.quantite > 1 ? "s" : ""} ·{" "}
                {detail.type.replace(/_/g, " ")}
              </p>

              {detail.photo_url && (
                <div className="mt-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    loading="lazy"
                    decoding="async"
                    src={detail.photo_url}
                    alt="Preuve"
                    className="w-full aspect-[4/3] object-cover rounded-2xl border border-rule"
                  />
                </div>
              )}

              <div className="mt-4 bg-cream rounded-2xl p-4 border border-rule">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <p className="label-caps text-text-primary">
                    Analyse IA Claude Vision
                  </p>
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1 h-1.5 rounded-full bg-white overflow-hidden">
                    <div
                      className={`h-full ${
                        detail.ia_coherence_score < 0.5
                          ? "bg-danger"
                          : detail.ia_coherence_score < 0.7
                            ? "bg-warning"
                            : "bg-success"
                      }`}
                      style={{ width: `${detail.ia_coherence_score * 100}%` }}
                    />
                  </div>
                  <span className="text-[14px] font-extrabold tabular text-text-primary">
                    {(detail.ia_coherence_score * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-[12.5px] text-text-secondary leading-relaxed">
                  {detail.ia_coherence_notes ?? "Pas de note IA."}
                </p>
              </div>

              <dl className="mt-4 space-y-2.5 text-[13px]">
                <Row label="Employé" value={nameOf(detail.employes)} />
                <Row label="Dépôt" value={detail.depots?.nom ?? "—"} />
                <Row label="Quand" value={timeAgoFr(detail.created_at)} />
                <Row label="Motif libre" value={detail.motif_libre ?? "—"} />
              </dl>

              <div className="mt-6 space-y-2">
                <button
                  onClick={() => void handleAccept(detail)}
                  className="w-full bg-success text-white rounded-[18px] py-3.5 font-bold flex items-center justify-center gap-2 active:scale-[0.99]"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Accepter la sortie
                </button>
                <button
                  onClick={() => void handleClarification(detail)}
                  className="w-full bg-white border border-rule text-text-primary rounded-[18px] py-3 font-bold flex items-center justify-center gap-2 active:scale-[0.99]"
                >
                  <Eye className="w-4 h-4" />
                  Demander clarification employé
                </button>
                <button
                  onClick={() => void handleReject(detail)}
                  className="w-full text-danger text-[13px] font-bold py-2"
                >
                  Rejeter la sortie
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detail modal surplus */}
      <AnimatePresence>
        {surplusDetail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end justify-center"
            onClick={() => setSurplusDetail(null)}
          >
            <motion.div
              initial={{ y: 80 }}
              animate={{ y: 0 }}
              exit={{ y: 80 }}
              transition={{ type: "spring", damping: 26, stiffness: 280 }}
              className="bg-white w-full max-w-[460px] rounded-t-[28px] p-6 pb-10 shadow-card-lg max-h-[88vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-3">
                <p className="label-caps text-danger">Surplus signalé</p>
                <button onClick={() => setSurplusDetail(null)}>
                  <X className="w-5 h-5 text-text-tertiary" />
                </button>
              </div>
              <h2 className="text-[20px] font-extrabold text-text-primary">
                {surplusDetail.produits?.nom ?? "Produit inconnu"}
              </h2>
              <p className="text-[12px] font-mono bg-cream text-text-tertiary inline-block px-2 py-1 rounded-lg mt-2">
                {surplusDetail.code_barre_scanne}
              </p>

              <dl className="mt-5 space-y-3 text-[13px]">
                <Row
                  label="Fournisseur"
                  value={
                    surplusDetail.bons_de_livraison?.fournisseurs?.nom ?? "—"
                  }
                />
                <Row
                  label="N° BDL"
                  value={surplusDetail.bons_de_livraison?.numero_bdl ?? "—"}
                />
                <Row
                  label="Quantité en surplus"
                  value={`${surplusDetail.quantite_surplus} unité${surplusDetail.quantite_surplus > 1 ? "s" : ""}`}
                />
                <Row
                  label="Signalé"
                  value={timeAgoFr(surplusDetail.signale_le)}
                />
                <Row
                  label="Statut"
                  value={
                    surplusDetail.statut === "en_attente"
                      ? "En attente"
                      : surplusDetail.statut === "accepte"
                        ? "Accepté"
                        : "Refusé"
                  }
                />
              </dl>

              {surplusDetail.notes && (
                <div className="mt-4 bg-cream rounded-2xl p-3">
                  <p className="label-caps text-text-tertiary mb-1">Note</p>
                  <p className="text-[13px] text-text-primary leading-relaxed">
                    {surplusDetail.notes}
                  </p>
                </div>
              )}

              {surplusDetail.photo_preuve_url && (
                <div className="mt-4">
                  <p className="label-caps text-text-tertiary mb-1.5">
                    Photo preuve
                  </p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    loading="lazy"
                    decoding="async"
                    src={surplusDetail.photo_preuve_url}
                    alt="Preuve"
                    className="w-full aspect-[4/3] object-cover rounded-2xl border border-rule"
                  />
                </div>
              )}

              {surplusDetail.statut === "en_attente" && (
                <div className="mt-6 space-y-2.5">
                  <button
                    onClick={() => void decideSurplus(surplusDetail, "accepte")}
                    disabled={surplusSubmitting}
                    className="w-full bg-success text-white rounded-[18px] py-4 px-5 flex items-center justify-between font-bold shadow-card-lg active:scale-[0.99] disabled:opacity-50"
                  >
                    <span className="text-left">
                      <span className="block label-caps text-white/80">
                        ACCEPTER
                      </span>
                      <span className="block text-[14px] font-extrabold">
                        Facturer au fournisseur
                      </span>
                    </span>
                    {surplusSubmitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <FileText className="w-5 h-5" />
                    )}
                  </button>
                  <button
                    onClick={() => void decideSurplus(surplusDetail, "refuse")}
                    disabled={surplusSubmitting}
                    className="w-full bg-white border border-rule text-text-primary rounded-[18px] py-3.5 px-5 flex items-center justify-between font-bold active:scale-[0.99] disabled:opacity-50"
                  >
                    <span className="text-left">
                      <span className="block label-caps text-text-tertiary">
                        REFUSER
                      </span>
                      <span className="block text-[14px] font-extrabold">
                        Retourner au fournisseur
                      </span>
                    </span>
                    {surplusSubmitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <RotateCcw className="w-5 h-5" />
                    )}
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </V2Shell>
  );
}

function KpiCard({
  variant,
  icon,
  eyebrow,
  value,
  label,
}: {
  variant: "danger" | "warn" | "primary" | "neutral";
  icon: React.ReactNode;
  eyebrow: string;
  value: string;
  label: string;
}) {
  const palette: Record<typeof variant, string> = {
    danger: "bg-white border-danger/30 text-danger",
    warn: "bg-white border-warning/30 text-warning",
    primary: "bg-white border-primary/20 text-primary",
    neutral: "bg-white border-rule text-text-primary",
  };
  return (
    <div className={`border-2 rounded-2xl p-3.5 ${palette[variant]}`}>
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="text-[10px] font-bold uppercase tracking-wide">
          {eyebrow}
        </p>
      </div>
      <p className="text-[19px] font-extrabold mt-1.5 tabular text-text-primary leading-none">
        {value}
      </p>
      <p className="text-[11px] text-text-secondary mt-1">{label}</p>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold shrink-0 transition-colors ${
        active
          ? "bg-primary text-white"
          : "bg-white border border-rule text-text-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-0.5 bg-black/15 text-current rounded-full px-1.5 py-0.5 text-[10px] tabular">
      {children}
    </span>
  );
}

function SortiesPanel({
  sorties,
  error,
  onRetry,
  onDetail,
}: {
  sorties: SortieSuspecte[];
  error: boolean;
  onRetry: () => void;
  onDetail: (s: SortieSuspecte) => void;
}) {
  // État d'ERREUR distinct de l'état vide : ne JAMAIS afficher « aucune sortie
  // suspecte » quand le chargement a échoué (faux négatif dangereux pour le
  // proprio qui croirait l'IA verte alors qu'on n'a rien pu lire).
  if (error) {
    return (
      <div className="bg-danger-soft border border-danger/30 rounded-2xl p-6 text-center">
        <AlertTriangle className="w-7 h-7 text-danger mx-auto mb-2" />
        <p className="font-bold text-text-primary">
          Impossible de charger les sorties suspectes
        </p>
        <p className="text-xs text-text-secondary mt-1">
          Le centre d&apos;alertes n&apos;a pas pu lire les données. Ce
          n&apos;est pas un « tout va bien ».
        </p>
        <button
          onClick={onRetry}
          className="mt-4 bg-danger text-white rounded-full px-5 py-2 text-[13px] font-bold active:scale-[0.98] transition-transform"
        >
          Réessayer
        </button>
      </div>
    );
  }
  if (sorties.length === 0) {
    return (
      <div className="bg-success-soft border border-success/20 rounded-2xl p-6 text-center">
        <CheckCircle2 className="w-7 h-7 text-success mx-auto mb-2" />
        <p className="font-bold text-text-primary">Aucune sortie suspecte</p>
        <p className="text-xs text-text-secondary mt-1">
          Toutes les sorties récentes ont un score IA ≥ 0.7.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2.5 mt-1">
      {sorties.map((s) => {
        const isRed = s.ia_coherence_score < 0.5;
        return (
          <button
            key={s.id}
            onClick={() => onDetail(s)}
            className={`w-full bg-white border rounded-2xl p-3.5 flex items-center gap-3 text-left active:scale-[0.99] transition-transform ${
              isRed ? "border-danger/40 shadow-card" : "border-warning/30"
            }`}
          >
            <span
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                isRed
                  ? "bg-danger-soft text-danger"
                  : "bg-warning-soft text-warning"
              }`}
            >
              <PackageX className="w-5 h-5" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-bold text-text-primary truncate">
                {s.produits?.nom ?? "Produit"}
              </p>
              <p className="text-[11.5px] text-text-secondary mt-0.5 truncate">
                {nameOf(s.employes)} · {s.depots?.nom} ·{" "}
                {timeAgoFr(s.created_at)}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p
                className={`text-[14px] font-extrabold tabular ${
                  isRed ? "text-danger" : "text-warning"
                }`}
              >
                {(s.ia_coherence_score * 100).toFixed(0)}%
              </p>
              <p className="text-[10px] uppercase font-bold tracking-wide text-text-tertiary mt-0.5">
                score IA
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function DemarquePanel({ rows }: { rows: DemarqueRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="bg-cream border border-rule rounded-2xl p-6 text-center">
        <TrendingDown className="w-7 h-7 text-text-tertiary mx-auto mb-2" />
        <p className="text-sm text-text-primary font-bold">
          Aucune démarque détectée
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3 mt-1">
      {rows.map((r) => (
        <div
          key={r.ean}
          className="bg-white border border-danger/30 rounded-2xl p-4 shadow-card"
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <p className="text-[14px] font-extrabold text-text-primary truncate">
                {r.produit}
              </p>
              <p className="text-[11px] mono text-text-tertiary mt-0.5">
                {r.ean}
              </p>
            </div>
            <span className="bg-danger text-white text-[11px] font-bold px-2.5 py-1 rounded-full">
              {r.ecart} u.
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center mb-2">
            <Stat label="Entrées" value={`+${r.entrees}`} />
            <Stat label="Ventes" value={`−${r.ventes}`} />
            <Stat label="Sorties" value={`−${r.sorties_tracees}`} />
            <Stat
              label="Théo / Réel"
              value={`${r.stock_theorique}/${r.stock_physique}`}
            />
          </div>
          <p className="text-[11.5px] text-text-secondary text-center pt-2 border-t border-rule">
            Valeur démarque :{" "}
            <b className="text-danger tabular">{fr2(r.valeur)}</b>
          </p>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase font-bold text-text-tertiary tracking-wide">
        {label}
      </p>
      <p className="text-[13px] font-extrabold text-text-primary tabular mt-0.5">
        {value}
      </p>
    </div>
  );
}

function SurplusPanel({
  items,
  onDetail,
}: {
  items: AlerteSurplus[];
  onDetail: (s: AlerteSurplus) => void;
}) {
  const pending = items.filter((i) => i.statut === "en_attente");
  const historique = items.filter((i) => i.statut !== "en_attente");
  return (
    <div className="space-y-3 mt-1">
      {pending.length === 0 ? (
        <div className="bg-success-soft border border-success/20 rounded-2xl p-6 text-center">
          <PackageCheck className="w-7 h-7 text-success mx-auto mb-2" />
          <p className="font-bold text-text-primary">
            Aucun surplus en attente
          </p>
          <p className="text-xs text-text-secondary mt-1">
            Tous les surplus signalés ont été traités.
          </p>
        </div>
      ) : (
        <>
          <p className="label-caps text-text-tertiary">
            {pending.length} surplus en attente — accepter (facturer
            fournisseur) ou refuser (retourner)
          </p>
          {pending.map((s) => (
            <SurplusCard
              key={s.id}
              alerte={s}
              onClick={() => onDetail(s)}
            />
          ))}
        </>
      )}

      {historique.length > 0 && (
        <div className="mt-7">
          <p className="label-caps text-text-tertiary mb-2">
            Historique ({historique.length})
          </p>
          <div className="space-y-2 opacity-80">
            {historique.slice(0, 10).map((s) => (
              <SurplusCard
                key={s.id}
                alerte={s}
                onClick={() => onDetail(s)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SurplusCard({
  alerte,
  onClick,
}: {
  alerte: AlerteSurplus;
  onClick: () => void;
}) {
  const isPending = alerte.statut === "en_attente";
  return (
    <button
      onClick={onClick}
      className={`w-full bg-white border rounded-2xl p-3.5 flex items-center gap-3 text-left active:scale-[0.99] transition-transform ${
        isPending ? "border-danger/40 shadow-card" : "border-rule"
      }`}
    >
      <span
        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
          isPending
            ? "bg-danger-soft text-danger"
            : alerte.statut === "accepte"
              ? "bg-success-soft text-success"
              : "bg-cream text-text-tertiary"
        }`}
      >
        {isPending ? (
          <AlertTriangle className="w-5 h-5" />
        ) : alerte.statut === "accepte" ? (
          <CheckCircle2 className="w-5 h-5" />
        ) : (
          <X className="w-5 h-5" />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-bold text-text-primary truncate">
          {alerte.produits?.nom ?? "Produit inconnu"}
        </p>
        <p className="text-[11.5px] text-text-secondary mt-0.5 truncate">
          {alerte.bons_de_livraison?.fournisseurs?.nom ?? "—"} · BDL{" "}
          {alerte.bons_de_livraison?.numero_bdl ?? "—"}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[15px] font-extrabold text-text-primary tabular">
          +{alerte.quantite_surplus}
        </p>
        <p className="text-[10px] text-text-tertiary mt-0.5">
          {timeAgoFr(alerte.signale_le)}
        </p>
      </div>
    </button>
  );
}

function HistoriquePanel({
  sorties,
  surplus,
}: {
  sorties: SortieSuspecte[];
  surplus: AlerteSurplus[];
}) {
  const merged = [
    ...sorties.slice(0, 15).map((s) => ({
      kind: "sortie" as const,
      ts: s.created_at,
      title: s.produits?.nom ?? "Produit",
      sub: `${nameOf(s.employes)} · ${s.type.replace(/_/g, " ")}`,
      val: `${(s.ia_coherence_score * 100).toFixed(0)}%`,
    })),
    ...surplus.slice(0, 15).map((s) => ({
      kind: "surplus" as const,
      ts: s.signale_le,
      title: s.produits?.nom ?? "Produit",
      sub: `Surplus ${s.bons_de_livraison?.fournisseurs?.nom ?? ""} · ${s.statut}`,
      val: `+${s.quantite_surplus}`,
    })),
  ]
    .sort((a, b) => (a.ts > b.ts ? -1 : 1))
    .slice(0, 30);

  if (merged.length === 0) {
    return (
      <p className="text-center text-sm text-text-tertiary py-6">
        Aucun historique.
      </p>
    );
  }
  return (
    <div className="space-y-2 mt-1 opacity-90">
      {merged.map((m, i) => (
        <div
          key={i}
          className="bg-white border border-rule rounded-xl p-3 flex items-center gap-3"
        >
          <span
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              m.kind === "sortie"
                ? "bg-cream text-primary"
                : "bg-gold-soft text-primary-dark"
            }`}
          >
            {m.kind === "sortie" ? (
              <PackageX className="w-4 h-4" />
            ) : (
              <Truck className="w-4 h-4" />
            )}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-text-primary truncate">
              {m.title}
            </p>
            <p className="text-[11px] text-text-secondary mt-0.5 truncate">
              {m.sub} · {timeAgoFr(m.ts)}
            </p>
          </div>
          <p className="text-[12.5px] font-extrabold text-text-primary tabular shrink-0">
            {m.val}
          </p>
        </div>
      ))}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-text-tertiary text-[11.5px] font-bold uppercase tracking-wide">
        {label}
      </span>
      <span className="font-bold text-text-primary text-right">{value}</span>
    </div>
  );
}
