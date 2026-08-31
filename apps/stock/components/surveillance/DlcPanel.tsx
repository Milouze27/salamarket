"use client";

/**
 * DlcPanel — contenu du centre d'alertes DLC, extrait de
 * /v2/admin/alertes-dlc pour être monté dans la page Surveillance à onglets.
 *
 * Toute la logique métier est conservée à l'identique (chargement v_dlc_alerts,
 * normalisation remise, markdownProduit, planche promo, démarque de masse).
 * Seuls le header de page (BackButton + titre) et le wrapper V2Shell ont été
 * retirés : le header est désormais celui de la page hôte Surveillance.
 *
 * RÈGLE DLC dépassée (jours_restants < 0) : un produit dont la DLC est passée
 * NE DOIT PAS être soldé/affiché en promo anti-gaspi (vente de produit périmé).
 * On le distingue en « À RETIRER ».
 */

import { useEffect, useMemo, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  PackageX,
  Printer,
  Tag,
  Trash2,
  TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/v2/DataTable";
import { supabase } from "@/lib/supabase";
import { normalizeRemiseDlc } from "@/lib/dlc";

type Niveau = "forcé" | "critique" | "attention" | "surveillance" | "ok";

interface DlcAlert {
  lot_id: string;
  produit_id: string;
  produit_nom: string;
  produit_categorie: string | null;
  dlc: string; // ISO date
  jours_restants: number;
  niveau_alerte: Niveau;
  remise_suggeree_pct: number;
  quantite_recue: number | null;
  unite: string | null;
}

const NIVEAU_LABEL: Record<Niveau, string> = {
  forcé: "Forcé",
  critique: "Critique",
  attention: "Attention",
  surveillance: "Surveillance",
  ok: "OK",
};

const NIVEAU_STYLE: Record<
  Niveau,
  { bg: string; text: string; border: string; chipBg: string }
> = {
  forcé: {
    bg: "bg-danger-soft",
    text: "text-danger",
    border: "border-[color:var(--danger-border)]",
    chipBg: "bg-danger text-white",
  },
  critique: {
    bg: "bg-danger-soft",
    text: "text-danger",
    border: "border-[color:var(--danger-border)]",
    chipBg: "bg-danger text-white",
  },
  // 31/08/2026 — les quatre hex figés ici (#FEF3E2, #92400E, #D97706, #FBF4D4,
  // #C9A227, #3A2D08) ne s'inversaient pas en thème nuit : un ambre pâle opaque
  // restait clair sur fond abyssal. Passés aux tokens de statut.
  attention: {
    bg: "bg-[var(--status-warning-bg)]",
    text: "text-[color:var(--status-warning-text)]",
    border: "border-[color:var(--status-warning)]/40",
    chipBg: "bg-[color:var(--status-warning)] text-[color:var(--text-on-gold)]",
  },
  surveillance: {
    bg: "bg-[var(--accent-gold-soft)]",
    text: "text-[color:var(--or-text)]",
    border: "border-[color:var(--accent-gold)]/40",
    chipBg:
      "bg-[color:var(--accent-gold-bright)] text-[color:var(--text-on-gold)]",
  },
  ok: {
    bg: "bg-[var(--surface-1)]",
    text: "text-text-secondary",
    border: "border-rule",
    chipBg: "bg-success text-white",
  },
};

/** Couleur de gravité d'un niveau, en token — sert au filet de ligne. */
const NIVEAU_ACCENT: Record<Niveau, string> = {
  forcé: "var(--danger)",
  critique: "var(--danger)",
  attention: "var(--warning)",
  surveillance: "var(--accent-gold)",
  ok: "var(--success)",
};

/** Ordre de gravité décroissante — tri de la colonne « Niveau ». */
const NIVEAU_RANG: Record<Niveau, number> = {
  forcé: 0,
  critique: 1,
  attention: 2,
  surveillance: 3,
  ok: 4,
};

/** Date complète pour le tableau du poste de travail (l'écran a la place). */
function fmtDateTableau(iso: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
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

/** Ce que le tableau NE montre pas : plafond serveur, sources absentes. */
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

/** Plafond de la requête v_dlc_alerts (cf. load()). */
const PLAFOND_DLC = 200;

function fmtDateFr(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}

function joursLabel(j: number) {
  if (j < 0) {
    const n = Math.abs(j);
    // MGR-14 : accord FR — « 1 j passé » au singulier, « N j passés » au pluriel.
    return `${n} j passé${n > 1 ? "s" : ""}`;
  }
  if (j === 0) return "Aujourd'hui";
  if (j === 1) return "J-1";
  return `J-${j}`;
}

/** DLC dépassée → le produit est périmé : on retire, on ne solde pas. */
function estPerime(a: DlcAlert): boolean {
  return a.jours_restants < 0;
}

export function DlcPanel() {
  const [alerts, setAlerts] = useState<DlcAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  // MGR-13 : la vue v_dlc_alerts se calcule depuis les lots/DLC, pas depuis le
  // prix remisé → après application la ligne reste identique. On marque
  // localement les lots déjà démarqués pour basculer le bouton en état
  // « appliquée » (non re-cliquable) tant qu'on reste sur la page.
  const [appliedLots, setAppliedLots] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    const sb = supabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    const { data, error } = await sb
      .from("v_dlc_alerts")
      .select(
        "lot_id, produit_id, produit_nom, produit_categorie, dlc, jours_restants, niveau_alerte, remise_suggeree_pct, quantite_recue, unite",
      )
      .neq("niveau_alerte", "ok")
      .order("jours_restants", { ascending: true })
      .limit(200);
    if (error) {
      toast.error("Erreur chargement DLC : " + error.message);
      setAlerts([]);
      setLoading(false);
      return;
    }
    // BUG-018 — normalise la remise au chargement : la vue SQL peut
    // renvoyer 0% pour un lot FORCÉ si la catégorie n'a pas de règle
    // dans dlc_pricing_rules. Le helper applique le plancher métier
    // (FORCÉ → 50%, CRITIQUE → 40%, ATTENTION → 20%).
    const rows = (data ?? []) as DlcAlert[];
    const normalized: DlcAlert[] = rows.map((r) => ({
      ...r,
      remise_suggeree_pct: normalizeRemiseDlc(
        r.niveau_alerte,
        r.remise_suggeree_pct,
      ),
    }));
    setAlerts(normalized);
    setAppliedLots(new Set());
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  /* __QA_RECETTE__ */
  useEffect(() => {
    const NOMS = ["Poulet fermier entier", "Merguez maison 500 g", "Yaourt brebis nature", "Dattes Deglet Nour 1 kg", "Msemen surgelé x6", "Steak haché 15% MG", "Lait ribot 1 L", "Feta AOP 200 g", "Pain pita complet", "Harissa artisanale 90 g", "Olives Kalamata 500 g", "Semoule fine 5 kg", "Beurre demi-sel 250 g", "Miel de jujubier 500 g", "Thon albacore 200 g", "Fromage halloumi 250 g", "Coriandre fraîche botte", "Poivron rouge kg", "Agneau gigot kg", "Boulettes kefta 400 g", "Crème fraîche 20 cl", "Jus de grenade 1 L", "Amandes émondées 500 g", "Cornes de gazelle x8", "Tomate grappe kg", "Escalope de dinde kg", "Concentré de tomate", "Pois chiches secs 1 kg", "Zaatar libanais 100 g", "Chorba prête 400 ml", "Baklava plateau 500 g", "Sardines à l'huile", "Œufs plein air x12"];
    const CATS = ["Boucherie", "Crèmerie", "Épicerie salée", "Traiteur", "Fruits & légumes", "Boulangerie"];
    const N: Niveau[] = ["forcé", "critique", "attention", "surveillance"];
    const rows: DlcAlert[] = NOMS.map((nom, i) => {
      const j = i - 3;
      const niveau: Niveau = j < 0 ? "forcé" : j <= 1 ? "critique" : j <= 3 ? "attention" : N[3];
      const d = new Date(Date.UTC(2026, 7, 31) + j * 86400000);
      return {
        lot_id: `LOT-2608-${String(1200 + i * 7)}`,
        produit_id: `p-${i}`,
        produit_nom: nom,
        produit_categorie: CATS[i % CATS.length],
        dlc: d.toISOString().slice(0, 10),
        jours_restants: j,
        niveau_alerte: niveau,
        remise_suggeree_pct: normalizeRemiseDlc(niveau, 0),
        quantite_recue: ((i * 13) % 47) + 2,
        unite: i % 3 === 0 ? "kg" : "u",
      };
    });
    setAlerts(rows);
    setLoading(false);
  }, []);

  const kpi = useMemo(() => {
    const groups = { forcé: 0, critique: 0, attention: 0, surveillance: 0 };
    let valeurRemise = 0;
    for (const a of alerts) {
      if (a.niveau_alerte in groups) {
        groups[a.niveau_alerte as keyof typeof groups] += 1;
      }
      // Démarque potentielle = remise réellement applicable. Les périmés
      // (DLC dépassée) ne sont pas soldés → exclus du chiffrage remise.
      if (estPerime(a)) continue;
      // Heuristique démarque potentielle = qté * remise%/100 * 8€/u moyen (mock).
      valeurRemise +=
        (a.quantite_recue ?? 0) * (a.remise_suggeree_pct / 100) * 8;
    }
    return { ...groups, total: alerts.length, valeurRemise };
  }, [alerts]);

  /**
   * Applique une vraie remise DLC au prix de vente d'un produit, sur tous
   * les dépôts où il a un prix. Idempotent : on calcule TOUJOURS depuis le
   * prix de base (prix_vente_avant_remise), jamais en cascade. Retourne le
   * nombre de lignes mises à jour. Lève en cas d'erreur DB.
   */
  async function markdownProduit(
    produitId: string,
    remisePct: number,
  ): Promise<number> {
    const sb = supabase();
    if (!sb) throw new Error("Hors ligne");
    const { data: rows, error: selErr } = await sb
      .from("stock_par_depot")
      .select("id, prix_vente, prix_vente_avant_remise")
      .eq("produit_id", produitId)
      .not("prix_vente", "is", null);
    if (selErr) throw new Error(selErr.message);
    if (!rows || rows.length === 0) return 0;
    let updated = 0;
    for (const r of rows as Array<{
      id: string;
      prix_vente: number | null;
      prix_vente_avant_remise: number | null;
    }>) {
      const base = Number(r.prix_vente_avant_remise ?? r.prix_vente ?? 0);
      if (base <= 0) continue;
      const newPrix = Math.round(base * (1 - remisePct / 100) * 100) / 100;
      const { error: upErr } = await sb
        .from("stock_par_depot")
        .update({
          prix_vente: newPrix,
          prix_vente_avant_remise: base,
          remise_dlc_pct: remisePct,
          demarque_at: new Date().toISOString(),
        })
        .eq("id", r.id);
      if (upErr) throw new Error(upErr.message);
      updated++;
    }
    return updated;
  }

  async function applyRemise(a: DlcAlert) {
    setActing(`apply:${a.lot_id}`);
    try {
      const n = await markdownProduit(a.produit_id, a.remise_suggeree_pct);
      if (n === 0) {
        toast.error(
          `Aucun prix de vente à remiser pour ${a.produit_nom} — renseigne-le d'abord.`,
        );
        return;
      }
      toast.success(
        `Remise -${a.remise_suggeree_pct}% appliquée — ${a.produit_nom} (${n} dépôt${n > 1 ? "s" : ""})`,
        { duration: 3000 },
      );
      // MGR-13 : marque tous les lots de ce produit comme démarqués (la remise
      // s'applique au produit, donc à tous ses lots affichés).
      setAppliedLots((prev) => {
        const next = new Set(prev);
        for (const al of alerts) {
          if (al.produit_id === a.produit_id) next.add(al.lot_id);
        }
        return next;
      });
    } catch (e) {
      toast.error(
        `Erreur application remise : ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setActing(null);
    }
  }

  /**
   * PDF-03 — Imprimer l'étiquette PROMO DLC en 1 tap : prix barré +
   * prix soldé (remise DLC), pour coller sur le produit démarqué.
   * Le prix de base est récupéré depuis stock_par_depot.prix_vente.
   */
  async function printPromo(a: DlcAlert) {
    setActing(`promo:${a.lot_id}`);
    try {
      const sb = supabase();
      let prixTtc = 0;
      let prixKg: number | null = null;
      if (sb) {
        const { data: stockRow } = await sb
          .from("stock_par_depot")
          .select("prix_vente")
          .eq("produit_id", a.produit_id)
          .not("prix_vente", "is", null)
          .order("prix_vente", { ascending: false })
          .limit(1)
          .maybeSingle();
        prixTtc = (stockRow?.prix_vente as number | null) ?? 0;
        const { data: prod } = await sb
          .from("produits")
          .select("price_per_kg")
          .eq("id", a.produit_id)
          .maybeSingle();
        prixKg = (prod?.price_per_kg as number | null) ?? null;
      }
      if (prixTtc <= 0) {
        toast.error(
          "Prix de vente introuvable pour ce produit — renseigne-le avant d'imprimer la promo.",
        );
        return;
      }
      const { buildPromoDlcPdf } = await import("@/lib/labels/gondole");
      const blob = await buildPromoDlcPdf({
        produitNom: a.produit_nom,
        prixTtc,
        prixKg,
        dlc: a.dlc,
        lot: a.lot_id,
        remisePct: a.remise_suggeree_pct,
      });
      const url = URL.createObjectURL(blob);
      const a2 = document.createElement("a");
      a2.href = url;
      a2.download = `promo-dlc-${a.lot_id}.pdf`;
      a2.click();
      URL.revokeObjectURL(url);
      toast.success(
        `Promo -${a.remise_suggeree_pct}% générée — ${a.produit_nom}`,
      );
    } catch (e) {
      console.error(e);
      toast.error("Erreur génération promo");
    } finally {
      setActing(null);
    }
  }

  /**
   * Planche promo du jour : un seul PDF multipage avec TOUTES les étiquettes
   * promo DLC éligibles (non périmées, remise > 0). On récupère les prix en
   * deux requêtes groupées (anti N+1) plutôt qu'une requête par lot.
   */
  async function printPlancheDuJour() {
    // Éligibles = encore vendables avec une remise réelle. Dédup par produit
    // (un même produit peut avoir plusieurs lots DLC → une seule étiquette).
    const eligibles = alerts.filter(
      (a) => !estPerime(a) && a.remise_suggeree_pct > 0,
    );
    const parProduit = new Map<string, DlcAlert>();
    for (const a of eligibles) {
      if (!parProduit.has(a.produit_id)) parProduit.set(a.produit_id, a);
    }
    const lignes = [...parProduit.values()];
    if (lignes.length === 0) {
      toast.info("Aucune étiquette promo à imprimer aujourd'hui");
      return;
    }
    setActing("__planche__");
    try {
      const produitIds = lignes.map((a) => a.produit_id);
      // Map prix de vente max par produit (sur tous les dépôts) + prix/kg.
      const prixParProduit = new Map<string, number>();
      const kgParProduit = new Map<string, number | null>();
      const sb = supabase();
      if (sb) {
        const { data: stockRows } = await sb
          .from("stock_par_depot")
          .select("produit_id, prix_vente")
          .in("produit_id", produitIds)
          .not("prix_vente", "is", null);
        for (const r of (stockRows ?? []) as Array<{
          produit_id: string;
          prix_vente: number | null;
        }>) {
          const p = Number(r.prix_vente ?? 0);
          if (p <= 0) continue;
          const prev = prixParProduit.get(r.produit_id) ?? 0;
          if (p > prev) prixParProduit.set(r.produit_id, p);
        }
        const { data: prods } = await sb
          .from("produits")
          .select("id, price_per_kg")
          .in("id", produitIds);
        for (const p of (prods ?? []) as Array<{
          id: string;
          price_per_kg: number | null;
        }>) {
          kgParProduit.set(p.id, (p.price_per_kg as number | null) ?? null);
        }
      }

      const inputs = lignes
        .map((a) => {
          const prixTtc = prixParProduit.get(a.produit_id) ?? 0;
          if (prixTtc <= 0) return null;
          return {
            produitNom: a.produit_nom,
            prixTtc,
            prixKg: kgParProduit.get(a.produit_id) ?? null,
            dlc: a.dlc,
            lot: a.lot_id,
            remisePct: a.remise_suggeree_pct,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      if (inputs.length === 0) {
        toast.error(
          "Aucun prix de vente renseigné sur les lots éligibles — impossible de générer la planche.",
        );
        return;
      }

      const { buildPromoDlcBatchPdf } = await import("@/lib/labels/gondole");
      const blob = await buildPromoDlcBatchPdf(inputs);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `planche-promo-dlc-${new Date().toISOString().slice(0, 10)}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      const ignores = lignes.length - inputs.length;
      toast.success(
        `Planche promo générée — ${inputs.length} étiquette${inputs.length > 1 ? "s" : ""}${ignores > 0 ? ` · ${ignores} sans prix ignoré${ignores > 1 ? "s" : ""}` : ""}`,
        { duration: 3000 },
      );
    } catch (e) {
      console.error(e);
      toast.error("Erreur génération de la planche promo");
    } finally {
      setActing(null);
    }
  }

  async function forceAllDemarque() {
    // Lots forcés ENCORE vendables (DLC non dépassée) : un périmé se retire,
    // il ne se solde pas.
    const forces = alerts.filter(
      (a) => a.niveau_alerte === "forcé" && !estPerime(a),
    );
    if (forces.length === 0) {
      toast.info("Aucun lot forcé encore vendable à démarquer");
      return;
    }
    setActing("__bulk__");
    try {
      // Dédup par produit (plusieurs lots forcés du même produit = 1 remise).
      const parProduit = new Map<string, DlcAlert>();
      for (const a of forces) {
        if (!parProduit.has(a.produit_id)) parProduit.set(a.produit_id, a);
      }
      let okLots = 0;
      let sansPrix = 0;
      for (const a of parProduit.values()) {
        const n = await markdownProduit(a.produit_id, a.remise_suggeree_pct);
        if (n > 0) okLots++;
        else sansPrix++;
      }
      if (okLots > 0) {
        toast.success(
          `${okLots} produit${okLots > 1 ? "s" : ""} démarqué${okLots > 1 ? "s" : ""}${sansPrix > 0 ? ` · ${sansPrix} sans prix ignoré${sansPrix > 1 ? "s" : ""}` : ""}`,
          { duration: 3000 },
        );
        // MGR-13 : marque les lots démarqués (tous les forcés encore vendables).
        setAppliedLots((prev) => {
          const next = new Set(prev);
          for (const al of forces) next.add(al.lot_id);
          return next;
        });
      } else {
        toast.error("Aucun prix de vente à remiser sur les lots forcés.");
      }
    } catch (e) {
      toast.error(
        `Erreur démarque : ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setActing(null);
    }
  }

  // Lots forcés ENCORE vendables = éligibles à la démarque de masse.
  // Les forcés périmés (DLC dépassée) sont à retirer, pas à solder.
  const forceCount = alerts.filter(
    (a) => a.niveau_alerte === "forcé" && !estPerime(a),
  ).length;
  const perimeCount = alerts.filter((a) => estPerime(a)).length;

  // Étiquettes promo éligibles (produits distincts, non périmés, remise > 0) :
  // alimente la « planche promo du jour » à imprimer en un seul PDF.
  const plancheCount = useMemo(() => {
    const ids = new Set<string>();
    for (const a of alerts) {
      if (estPerime(a) || a.remise_suggeree_pct <= 0) continue;
      ids.add(a.produit_id);
    }
    return ids.size;
  }, [alerts]);

  return (
    <>
      {/* KPI */}
      <section className="px-4 sm:px-5 mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:max-w-[1000px]">
        <KpiCard
          variant="danger"
          riseIndex={0}
          icon={<AlertOctagon className="w-4 h-4" />}
          eyebrow="FORCÉ + CRITIQUE"
          value={`${kpi.forcé + kpi.critique}`}
          label="à traiter aujourd'hui"
        />
        <KpiCard
          variant="warn"
          riseIndex={1}
          icon={<AlertTriangle className="w-4 h-4" />}
          eyebrow="ATTENTION"
          value={`${kpi.attention}`}
          label="J-2 / J-3"
        />
        <KpiCard
          variant="gold"
          riseIndex={2}
          icon={<TrendingDown className="w-4 h-4" />}
          eyebrow="SURVEILLANCE"
          value={`${kpi.surveillance}`}
          label="J-4 → J-7"
        />
        <KpiCard
          variant="neutral"
          riseIndex={3}
          icon={<Tag className="w-4 h-4" />}
          eyebrow="REMISE TOTALE"
          value={`-${Math.round(kpi.valeurRemise)} €`}
          label="démarque potentielle estimée"
        />
      </section>

      {/* Bandeau « à retirer » — lots dont la DLC est dépassée (périmés).
          On ne les solde pas, on les sort du rayon (PDF-P2/STK-19). */}
      {perimeCount > 0 && (
        <section className="px-4 sm:px-5 mt-5">
          <div className="flex items-center gap-3 bg-danger-soft border-2 border-[color:var(--danger-border)] rounded-[16px] p-3.5">
            <Trash2 className="w-5 h-5 text-danger shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-extrabold text-danger">
                {perimeCount} lot{perimeCount > 1 ? "s" : ""} à retirer du rayon
              </p>
              <p className="text-[11.5px] text-danger/80">
                DLC dépassée — ne pas vendre ni solder, retirer immédiatement.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Actions groupées — planche promo + démarque de masse des forcés */}
      {(plancheCount > 0 || forceCount > 0) && (
        <section className="px-4 sm:px-5 mt-3 space-y-2.5 lg:space-y-0 lg:flex lg:flex-wrap lg:gap-2.5">
          {plancheCount > 0 && (
            <button
              onClick={() => void printPlancheDuJour()}
              disabled={acting === "__planche__"}
              className="w-full lg:w-auto min-h-[48px] lg:min-h-[42px] bg-primary text-white rounded-[18px] lg:rounded-full py-3.5 lg:py-2 lg:px-5 text-[15px] lg:text-[13.5px] font-bold flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-60"
            >
              {acting === "__planche__" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              Planche promo du jour ({plancheCount})
            </button>
          )}
          {forceCount > 0 && (
            <button
              onClick={() => void forceAllDemarque()}
              disabled={acting === "__bulk__"}
              className="w-full lg:w-auto min-h-[48px] lg:min-h-[42px] bg-danger text-white rounded-[18px] lg:rounded-full py-3.5 lg:py-2 lg:px-5 text-[15px] lg:text-[13.5px] font-bold flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-60"
            >
              {acting === "__bulk__" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <PackageX className="w-4 h-4" />
              )}
              Démarquer les forcés éligibles ({forceCount})
            </button>
          )}
        </section>
      )}

      {/* Liste */}
      <section className="px-4 sm:px-5 mt-6 pb-[max(3rem,env(safe-area-inset-bottom))]">
        {loading ? (
          <div className="bg-[var(--surface-1)] border border-rule rounded-2xl p-10 flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <p className="text-sm text-text-secondary">Chargement…</p>
          </div>
        ) : alerts.length === 0 ? (
          <div className="bg-success-soft border border-success/20 rounded-2xl p-8 text-center">
            <CheckCircle2 className="w-7 h-7 text-success mx-auto mb-2" />
            <p className="font-bold text-text-primary">Aucune alerte DLC</p>
            <p className="text-xs text-text-secondary mt-1">
              Tous les lots ont plus de 7 jours devant eux.
            </p>
          </div>
        ) : (
          <>
            {/* ── POSTE DE TRAVAIL (≥ lg) : tableau ────────────────────────
              La vignette portait produit, lot, jours restants, quantité,
              remise et niveau sur six lignes empilées. Le tableau porte les
              mêmes données sur UNE ligne, plus la date limite complète, et se
              trie par jours restants pour attaquer les pires d'abord. */}
            <div className="hidden lg:block">
              <DataTable<DlcAlert>
                rows={alerts}
                getKey={(a) => a.lot_id}
                caption={`Alertes DLC, ${alerts.length} lot${alerts.length > 1 ? "s" : ""}`}
                defaultSort={{ key: "jours", dir: "asc" }}
                emptyLabel="Aucune alerte DLC."
                rowAccent={(a) => NIVEAU_ACCENT[a.niveau_alerte]}
                columns={[
                  {
                    key: "niveau",
                    label: "Niveau",
                    width: "134px",
                    sort: (a, b) =>
                      NIVEAU_RANG[a.niveau_alerte] - NIVEAU_RANG[b.niveau_alerte],
                    render: (a) => (
                      <Pastille
                        couleur={NIVEAU_ACCENT[a.niveau_alerte]}
                        texte={NIVEAU_LABEL[a.niveau_alerte]}
                      />
                    ),
                  },
                  {
                    key: "produit",
                    label: "Produit",
                    width: "260px",
                    sort: (a, b) =>
                      a.produit_nom.localeCompare(b.produit_nom, "fr"),
                    render: (a) => (
                      <span
                        className="font-semibold truncate block"
                        style={{ color: "var(--text-primary)" }}
                        title={a.produit_nom}
                      >
                        {a.produit_nom}
                      </span>
                    ),
                  },
                  {
                    key: "categorie",
                    label: "Catégorie",
                    width: "150px",
                    xlOnly: true,
                    sort: (a, b) =>
                      (a.produit_categorie ?? "").localeCompare(
                        b.produit_categorie ?? "",
                        "fr",
                      ),
                    render: (a) => (
                      <span
                        className="truncate block"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {a.produit_categorie ?? "—"}
                      </span>
                    ),
                  },
                  {
                    key: "lot",
                    label: "Lot",
                    width: "170px",
                    xlOnly: true,
                    render: (a) => (
                      <span
                        className="mono truncate block text-[12px]"
                        style={{ color: "var(--text-tertiary)" }}
                        title={a.lot_id}
                      >
                        {a.lot_id}
                      </span>
                    ),
                  },
                  {
                    key: "dlc",
                    label: "Date limite",
                    width: "122px",
                    sort: (a, b) => a.dlc.localeCompare(b.dlc),
                    render: (a) => (
                      <span
                        className="tabular-nums"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {fmtDateTableau(a.dlc)}
                      </span>
                    ),
                  },
                  {
                    key: "jours",
                    label: "Jours restants",
                    width: "132px",
                    align: "right",
                    sort: (a, b) => a.jours_restants - b.jours_restants,
                    render: (a) => (
                      <span
                        className="font-bold"
                        style={{ color: NIVEAU_ACCENT[a.niveau_alerte] }}
                      >
                        {joursLabel(a.jours_restants)}
                      </span>
                    ),
                  },
                  {
                    key: "quantite",
                    label: "Quantité",
                    width: "112px",
                    align: "right",
                    sort: (a, b) =>
                      (a.quantite_recue ?? 0) - (b.quantite_recue ?? 0),
                    render: (a) => (
                      <span style={{ color: "var(--text-primary)" }}>
                        {a.quantite_recue != null
                          ? `${a.quantite_recue} ${a.unite ?? ""}`.trim()
                          : "—"}
                      </span>
                    ),
                  },
                  {
                    key: "remise",
                    label: "Remise",
                    width: "100px",
                    align: "right",
                    sort: (a, b) =>
                      (estPerime(a) ? -1 : a.remise_suggeree_pct) -
                      (estPerime(b) ? -1 : b.remise_suggeree_pct),
                    render: (a) =>
                      // Périmé = à jeter : aucune remise ne s'applique, on
                      // n'affiche donc PAS de « -50 % » qui contredirait
                      // l'action « à retirer » de la colonne suivante.
                      estPerime(a) ? (
                        <span style={{ color: "var(--text-tertiary)" }}>—</span>
                      ) : (
                        <span
                          className="font-bold"
                          style={{
                            color:
                              a.remise_suggeree_pct > 0
                                ? "var(--danger)"
                                : "var(--text-tertiary)",
                          }}
                        >
                          {a.remise_suggeree_pct > 0
                            ? `-${a.remise_suggeree_pct} %`
                            : "—"}
                        </span>
                      ),
                  },
                  {
                    key: "action",
                    label: "Action",
                    width: "212px",
                    render: (a) => {
                      if (estPerime(a)) {
                        return (
                          <span
                            className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap"
                            style={{ color: "var(--danger)" }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            À retirer du rayon
                          </span>
                        );
                      }
                      if (a.remise_suggeree_pct <= 0) {
                        return (
                          <span style={{ color: "var(--text-tertiary)" }}>—</span>
                        );
                      }
                      if (appliedLots.has(a.lot_id)) {
                        return (
                          <span
                            className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap"
                            style={{ color: "var(--success)" }}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Remise appliquée
                          </span>
                        );
                      }
                      const busy =
                        acting === `apply:${a.lot_id}` ||
                        acting === `promo:${a.lot_id}`;
                      return (
                        <span className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void applyRemise(a)}
                            disabled={busy}
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold bg-primary text-white disabled:opacity-60"
                          >
                            {acting === `apply:${a.lot_id}` ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Tag className="w-3 h-3" />
                            )}
                            Remise -{a.remise_suggeree_pct} %
                          </button>
                          <button
                            type="button"
                            onClick={() => void printPromo(a)}
                            disabled={busy}
                            aria-label={`Imprimer l'étiquette promo de ${a.produit_nom}`}
                            title="Imprimer l'étiquette promo"
                            className="inline-flex items-center justify-center rounded-full w-7 h-7 border border-rule disabled:opacity-60"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {acting === `promo:${a.lot_id}` ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Printer className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </span>
                      );
                    },
                  },
                ]}
              />
              <NoteTableau>
                {alerts.length} lot{alerts.length > 1 ? "s" : ""} affiché
                {alerts.length > 1 ? "s" : ""} · la requête ne remonte que les{" "}
                {PLAFOND_DLC} lots les plus proches de leur DLC. La vue
                v_dlc_alerts ne porte ni dépôt ni valeur marchande : ces deux
                colonnes ne sont pas affichables ici.
              </NoteTableau>
            </div>

            {/* ── TERRAIN (< lg) : vignettes au pouce, inchangées ────────── */}
            <ul className="lg:hidden space-y-2.5">
            {alerts.map((a, idx) => {
              const style = NIVEAU_STYLE[a.niveau_alerte];
              const isApplying = acting === `apply:${a.lot_id}`;
              const isPrinting = acting === `promo:${a.lot_id}`;
              return (
                <li
                  key={a.lot_id}
                  className={`lg rise-in border-2 p-4 ${style.border}`}
                  style={{ ["--i" as string]: Math.min(idx, 8) }}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${style.chipBg}`}
                        >
                          {NIVEAU_LABEL[a.niveau_alerte]}
                        </span>
                        <span className="text-[10.5px] font-bold uppercase tracking-wide text-text-tertiary">
                          {a.produit_categorie ?? "—"}
                        </span>
                      </div>
                      <p className="text-[14.5px] font-extrabold text-text-primary mt-1.5 truncate">
                        {a.produit_nom}
                      </p>
                      <p className="text-[11px] mono text-text-tertiary mt-0.5">
                        Lot {a.lot_id}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`text-[16px] font-extrabold tabular ${style.text}`}
                      >
                        {joursLabel(a.jours_restants)}
                      </p>
                      <p className="text-[10.5px] font-bold uppercase tracking-wide text-text-tertiary mt-0.5">
                        DLC {fmtDateFr(a.dlc)}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-rule">
                    <Stat
                      label="Quantité"
                      value={
                        a.quantite_recue != null
                          ? `${a.quantite_recue} ${a.unite ?? ""}`.trim()
                          : "—"
                      }
                    />
                    {/* Lot périmé (DLC dépassée) = à jeter : aucune remise ne
                        s'applique. Afficher « -50% » ici contredirait le badge
                        « ni vente ni promo ». On neutralise donc la valeur. */}
                    <Stat
                      label="Remise"
                      value={estPerime(a) ? "—" : `-${a.remise_suggeree_pct}%`}
                      strong={!estPerime(a) && a.remise_suggeree_pct > 0}
                    />
                    <Stat
                      label="Niveau"
                      value={NIVEAU_LABEL[a.niveau_alerte]}
                    />
                  </div>

                  {/* DLC dépassée → on retire, jamais de promo/remise sur un
                      produit périmé (PDF-P2-PROMO-DLC-PERIMEE). */}
                  {estPerime(a) ? (
                    <div className="mt-3 flex items-center gap-2 bg-danger-soft border border-[color:var(--danger-border)] rounded-[14px] px-3 py-2.5">
                      <Trash2 className="w-4 h-4 text-danger shrink-0" />
                      <p className="text-[12.5px] font-bold text-danger">
                        À retirer du rayon — DLC dépassée, ni vente ni promo.
                      </p>
                    </div>
                  ) : (
                    a.remise_suggeree_pct > 0 && (
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        {appliedLots.has(a.lot_id) ? (
                          <div className="min-h-[44px] bg-success-soft border border-success/30 text-success rounded-[14px] py-3 text-[13.5px] font-bold flex items-center justify-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4" />
                            Remise appliquée
                          </div>
                        ) : (
                          <button
                            onClick={() => void applyRemise(a)}
                            disabled={isApplying || isPrinting}
                            className="min-h-[44px] bg-primary text-white rounded-[14px] py-3 text-[13.5px] font-bold flex items-center justify-center gap-1.5 active:scale-[0.99] disabled:opacity-60"
                          >
                            {isApplying ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Tag className="w-4 h-4" />
                            )}
                            Remise -{a.remise_suggeree_pct}%
                          </button>
                        )}
                        <button
                          onClick={() => void printPromo(a)}
                          disabled={isApplying || isPrinting}
                          className="min-h-[44px] bg-danger text-white rounded-[14px] py-3 text-[13.5px] font-bold flex items-center justify-center gap-1.5 active:scale-[0.99] disabled:opacity-60"
                        >
                          {isPrinting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Printer className="w-4 h-4" />
                          )}
                          Imprimer promo
                        </button>
                      </div>
                    )
                  )}
                </li>
              );
            })}
            </ul>
          </>
        )}
      </section>
    </>
  );
}

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
  const palette: Record<typeof variant, string> = {
    danger: "border-[color:var(--danger-border)] text-danger",
    warn: "border-[color:var(--status-warning)]/30 text-[color:var(--status-warning-text)]",
    gold: "border-[color:var(--accent-gold)]/40 text-[color:var(--or-text)]",
    neutral: "text-text-primary",
  };
  return (
    <div
      className={`lg lg-hover rise-in border-2 p-3.5 ${palette[variant]}`}
      style={riseIndex != null ? { ["--i" as string]: riseIndex } : undefined}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="text-[10px] font-bold uppercase tracking-wide">
          {eyebrow}
        </p>
      </div>
      <p className="text-[20px] font-extrabold mt-1.5 tabular text-text-primary leading-none">
        {value}
      </p>
      <p className="text-[11px] text-text-secondary mt-1">{label}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="text-center">
      <p className="text-[10px] uppercase font-bold text-text-tertiary tracking-wide">
        {label}
      </p>
      <p
        className={`text-[13px] tabular mt-0.5 ${
          strong
            ? "font-extrabold text-danger"
            : "font-bold text-text-primary"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
