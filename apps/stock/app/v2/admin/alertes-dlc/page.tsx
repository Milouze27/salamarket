"use client";

/**
 * /v2/admin/alertes-dlc — Centre d'alertes DLC (Bet 2).
 *
 * Pour Otmane/Ahmed (rôle admin) : liste tous les lots dont la DLC
 * approche, avec niveau d'alerte, remise suggérée et actions rapides.
 *
 * Source : view `v_dlc_alerts` (migration 0032). Pas d'aggrégation
 * côté client — tout est calculé côté SQL.
 *
 * Actions RÉELLES (écriture stock_par_depot, migration 20260608000005) :
 *   - "Appliquer la remise" → baisse le prix_vente du produit (tous dépôts)
 *     de remise_suggeree_pct, idempotent via prix_vente_avant_remise.
 *   - "Démarquer les lots éligibles" → applique la remise aux lots forcés
 *     ENCORE vendables (DLC non dépassée).
 *   - "Imprimer promo" → PDF étiquette prix barré/soldé.
 *
 * RÈGLE DLC dépassée (jours_restants < 0) : un produit dont la DLC est passée
 * NE DOIT PAS être soldé/affiché en promo anti-gaspi (vente de produit périmé).
 * On le distingue en « À RETIRER » : pas de bouton remise/promo, le staff le
 * sort du rayon (PDF-P2-PROMO-DLC-PERIMEE, STK-19).
 */

import { useEffect, useMemo, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  PackageX,
  Printer,
  Tag,
  Trash2,
  TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { EditorialEyebrow } from "@/components/v2/EditorialEyebrow";
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
    bg: "bg-[#FBE9E7]",
    text: "text-[#8A1A12]",
    border: "border-[#A8231A]/50",
    chipBg: "bg-[#A8231A] text-white",
  },
  critique: {
    bg: "bg-[#FBE9E7]",
    text: "text-[#A8231A]",
    border: "border-[#E5483D]/40",
    chipBg: "bg-[#E5483D] text-white",
  },
  attention: {
    bg: "bg-[#FEF3E2]",
    text: "text-[#92400E]",
    border: "border-[#D97706]/40",
    chipBg: "bg-[#D97706] text-white",
  },
  surveillance: {
    bg: "bg-[#FBF4D4]",
    text: "text-[color:var(--or-text)]",
    border: "border-[color:var(--accent-gold)]/40",
    chipBg: "bg-[#C9A227] text-[#3A2D08]",
  },
  ok: {
    bg: "bg-white",
    text: "text-text-secondary",
    border: "border-rule",
    chipBg: "bg-success text-white",
  },
};

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

export default function AlertesDlcPage() {
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

  return (
    <V2Shell hideNav>
      <PageAccentStripe accent="bordeaux" />
      <header className="px-4 sm:px-5 pt-7">
        <BackButton />
        <EditorialEyebrow num="01" label="DLC" className="mt-3" />
        <h1 className="h1-display mt-1">
          Alertes <span className="gold">DLC</span>
        </h1>
        <p className="body-md text-text-secondary mt-2 max-w-prose">
          Lots qui approchent leur date limite. Remises suggérées calculées
          d&apos;après les règles anti-gaspi par catégorie.
        </p>
      </header>

      {/* KPI */}
      <section className="px-4 sm:px-5 mt-5 grid grid-cols-2 gap-2.5">
        <KpiCard
          variant="danger"
          icon={<AlertOctagon className="w-4 h-4" />}
          eyebrow="FORCÉ + CRITIQUE"
          value={`${kpi.forcé + kpi.critique}`}
          label="à traiter aujourd'hui"
        />
        <KpiCard
          variant="warn"
          icon={<AlertTriangle className="w-4 h-4" />}
          eyebrow="ATTENTION"
          value={`${kpi.attention}`}
          label="J-2 / J-3"
        />
        <KpiCard
          variant="gold"
          icon={<TrendingDown className="w-4 h-4" />}
          eyebrow="SURVEILLANCE"
          value={`${kpi.surveillance}`}
          label="J-4 → J-7"
        />
        <KpiCard
          variant="neutral"
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
          <div className="flex items-center gap-3 bg-[#FBE9E7] border-2 border-[#A8231A]/50 rounded-[16px] p-3.5">
            <Trash2 className="w-5 h-5 text-[#8A1A12] shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-extrabold text-[#8A1A12]">
                {perimeCount} lot{perimeCount > 1 ? "s" : ""} à retirer du rayon
              </p>
              <p className="text-[11.5px] text-[#8A1A12]/80">
                DLC dépassée — ne pas vendre ni solder, retirer immédiatement.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Bulk action — uniquement les forcés ENCORE vendables */}
      {forceCount > 0 && (
        <section className="px-4 sm:px-5 mt-3">
          <button
            onClick={() => void forceAllDemarque()}
            disabled={acting === "__bulk__"}
            className="w-full min-h-[48px] bg-[#A8231A] text-white rounded-[18px] py-3.5 text-[15px] font-bold flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-60"
          >
            {acting === "__bulk__" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <PackageX className="w-4 h-4" />
            )}
            Démarquer les forcés éligibles ({forceCount})
          </button>
        </section>
      )}

      {/* Liste */}
      <section className="px-4 sm:px-5 mt-6 pb-[max(3rem,env(safe-area-inset-bottom))]">
        {loading ? (
          <div className="bg-white border border-rule rounded-2xl p-10 flex items-center justify-center gap-2">
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
          <ul className="space-y-2.5">
            {alerts.map((a) => {
              const style = NIVEAU_STYLE[a.niveau_alerte];
              const isApplying = acting === `apply:${a.lot_id}`;
              const isPrinting = acting === `promo:${a.lot_id}`;
              return (
                <li
                  key={a.lot_id}
                  className={`bg-white border-2 rounded-2xl p-4 ${style.border}`}
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
                    <div className="mt-3 flex items-center gap-2 bg-[#FBE9E7] border border-[#A8231A]/40 rounded-[14px] px-3 py-2.5">
                      <Trash2 className="w-4 h-4 text-[#8A1A12] shrink-0" />
                      <p className="text-[12.5px] font-bold text-[#8A1A12]">
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
                          className="min-h-[44px] bg-[#A8231A] text-white rounded-[14px] py-3 text-[13.5px] font-bold flex items-center justify-center gap-1.5 active:scale-[0.99] disabled:opacity-60"
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
        )}
      </section>
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
  variant: "danger" | "warn" | "gold" | "neutral";
  icon: React.ReactNode;
  eyebrow: string;
  value: string;
  label: string;
}) {
  const palette: Record<typeof variant, string> = {
    danger: "border-[#E5483D]/30 text-[#A8231A]",
    warn: "border-[#D97706]/30 text-[#92400E]",
    gold: "border-[color:var(--accent-gold)]/40 text-[color:var(--or-text)]",
    neutral: "border-rule text-text-primary",
  };
  return (
    <div className={`bg-white border-2 rounded-2xl p-3.5 ${palette[variant]}`}>
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
            ? "font-extrabold text-[#A8231A]"
            : "font-bold text-text-primary"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
