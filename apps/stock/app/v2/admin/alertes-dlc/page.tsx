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
 * Actions démo (pas de write réel encore) :
 *   - "Appliquer la remise" → toast confirmant le push Cashmag (mock)
 *   - "Tout marquer en démarque" sur les lots forcé → mock
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
  if (j < 0) return `${Math.abs(j)} j passés`;
  if (j === 0) return "Aujourd'hui";
  if (j === 1) return "J-1";
  return `J-${j}`;
}

export default function AlertesDlcPage() {
  const [alerts, setAlerts] = useState<DlcAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

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
      // Heuristique démarque potentielle = qté * remise%/100 * 8€/u moyen (mock).
      valeurRemise +=
        (a.quantite_recue ?? 0) * (a.remise_suggeree_pct / 100) * 8;
    }
    return { ...groups, total: alerts.length, valeurRemise };
  }, [alerts]);

  async function applyRemise(a: DlcAlert) {
    setActing(`apply:${a.lot_id}`);
    // Démo : pas de write vers Cashmag, juste un feedback.
    await new Promise((r) => setTimeout(r, 350));
    toast.success(
      `Remise ${a.remise_suggeree_pct}% appliquée — ${a.produit_nom} (${a.lot_id})`,
      { duration: 3000 },
    );
    setActing(null);
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
    const forces = alerts.filter((a) => a.niveau_alerte === "forcé");
    if (forces.length === 0) {
      toast.info("Aucun lot forcé à démarquer");
      return;
    }
    setActing("__bulk__");
    await new Promise((r) => setTimeout(r, 500));
    toast.success(
      `${forces.length} lot${forces.length > 1 ? "s" : ""} marqué${forces.length > 1 ? "s" : ""} en démarque`,
      {
        duration: 3000,
      },
    );
    setActing(null);
  }

  const forceCount = alerts.filter((a) => a.niveau_alerte === "forcé").length;

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
          label="estimation démo"
        />
      </section>

      {/* Bulk action */}
      {forceCount > 0 && (
        <section className="px-4 sm:px-5 mt-5">
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
            Tout marquer en démarque ({forceCount})
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
                    <Stat
                      label="Remise"
                      value={`-${a.remise_suggeree_pct}%`}
                      strong={a.remise_suggeree_pct > 0}
                    />
                    <Stat
                      label="Niveau"
                      value={NIVEAU_LABEL[a.niveau_alerte]}
                    />
                  </div>

                  {a.remise_suggeree_pct > 0 && (
                    <div className="grid grid-cols-2 gap-2 mt-3">
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
