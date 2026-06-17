"use client";

/* /v2/po — Dashboard des bons de commande
 * ──────────────────────────────────────
 * Le coup de massue : Otmane ouvre, voit 3 PO suggérés par l'algo, dont
 * un BLOQUÉ parce que le certif halal de Reghalal/ARGML a expiré il y a
 * 12 jours. Impossible chez Cashmag/Lightspeed/Aya Market.
 *
 * UX :
 *   - drawer (PoDrawer) au tap, pas un modal (règle UX du projet)
 *   - mobile-first, scrollable, accent or pour POs à valider
 *   - tabs simples : "À valider" / "En cours" / "Reçues"
 *   - bouton "Régénérer" en haut → POST /api/po/auto-generate (manuel)
 *
 * Le filtre par défaut isole les brouillons (à valider). C'est là que
 * vit la valeur business : zéro friction entre "l'algo a vu" et "le
 * camion arrive demain".
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Building2,
  ChevronRight,
  ClipboardList,
  RefreshCw,
  Send,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { EditorialEyebrow } from "@/components/v2/EditorialEyebrow";
import { EmptyState as SharedEmptyState } from "@/components/shared/EmptyState";
import { CertHalalBadge } from "@/components/po/cert-halal-badge";
import { PoDrawer } from "@/components/po/po-drawer";
import { supabase } from "@/lib/supabase";
import {
  certifAlerte,
  STATUT_LABELS,
  type PurchaseOrderWithJoin,
} from "@/lib/types/po";

type Tab = "a_valider" | "en_cours" | "recues";

function eur(n: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function dateFr(iso: string | null) {
  if (!iso) return "—";
  return new Date(
    iso + (iso.length === 10 ? "T00:00:00" : ""),
  ).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

export default function PoDashboardPage() {
  const [pos, setPos] = useState<PurchaseOrderWithJoin[]>([]);
  const [tab, setTab] = useState<Tab>("a_valider");
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [drawer, setDrawer] = useState<PurchaseOrderWithJoin | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const sb = supabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    const { data, error } = await sb
      .from("purchase_orders")
      .select(
        `
        id, numero_po, fournisseur_id, depot_destination_id, statut,
        date_creation, date_envoi, date_livraison_prevue, date_reception,
        total_ht, total_ttc, email_envoye_a, email_message_id, bdl_id, notes,
        certif_organisme_snapshot, certif_numero_snapshot, certif_expire_le_snapshot,
        created_at, updated_at,
        fournisseurs:fournisseur_id ( nom, email_commandes, certif_organisme, certif_numero, certif_expire_le ),
        depots:depot_destination_id ( nom ),
        purchase_order_lignes ( id, po_id, produit_id, reference_fourn, quantite_commandee, quantite_recue, prix_achat_ht, tva_pct, ligne_total_ht, notes )
      `,
      )
      .order("date_creation", { ascending: false })
      .limit(200);
    if (error) {
      console.error("[v2/po] load error", error);
      toast.error("Impossible de charger les commandes");
    } else {
      setPos((data ?? []) as unknown as PurchaseOrderWithJoin[]);
    }
    setLoading(false);
  }

  async function regenerate() {
    setRegenerating(true);
    try {
      const res = await fetch("/api/po/auto-generate", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Erreur");
      toast.success(`${json.created ?? 0} brouillon(s) suggéré(s) par l'algo`);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setRegenerating(false);
    }
  }

  async function sendPo(poId: string) {
    setSending(true);
    try {
      // Server action (injecte x-internal-secret côté serveur) au lieu d'un
      // fetch direct : la route /api/po/send refuse les appels externes.
      const { sendPoAction } = await import("@/lib/actions/po");
      const r = await sendPoAction(poId);
      if (!r.ok) throw new Error(r.error ?? "Erreur d'envoi");
      toast.success(`Email envoyé à ${r.email}`);
      setDrawer(null);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }

  const counts = useMemo(() => {
    const a_valider = pos.filter((p) => p.statut === "brouillon").length;
    const en_cours = pos.filter(
      (p) =>
        p.statut === "envoyee" ||
        p.statut === "confirmee" ||
        p.statut === "partiellement_recue",
    ).length;
    const recues = pos.filter(
      (p) => p.statut === "recue" || p.statut === "annulee",
    ).length;
    return { a_valider, en_cours, recues };
  }, [pos]);

  const filtered = useMemo(() => {
    if (tab === "a_valider") return pos.filter((p) => p.statut === "brouillon");
    if (tab === "en_cours")
      return pos.filter(
        (p) =>
          p.statut === "envoyee" ||
          p.statut === "confirmee" ||
          p.statut === "partiellement_recue",
      );
    return pos.filter((p) => p.statut === "recue" || p.statut === "annulee");
  }, [pos, tab]);

  const totalAValider = useMemo(
    () =>
      pos
        .filter((p) => p.statut === "brouillon")
        .reduce((s, p) => s + (Number(p.total_ht) || 0), 0),
    [pos],
  );

  const blockedCount = useMemo(
    () =>
      pos.filter(
        (p) =>
          p.statut === "brouillon" &&
          ["expiree", "manquante"].includes(
            certifAlerte(p.fournisseurs?.certif_expire_le),
          ),
      ).length,
    [pos],
  );

  return (
    <V2Shell>
      <PageAccentStripe accent="sapin-or" />
      <div className="px-5 pt-4 pb-fab-stack">
        <BackButton href="/v2/admin" />

        {/* Hero */}
        <header className="mt-4 mb-5">
          <EditorialEyebrow num="01" label="Approvisionnement" />
          <h1 className="h1-display mt-2">
            Commandes <em className="gold">fournisseurs</em>
          </h1>
          <p
            className="body-md mt-2"
            style={{ color: "var(--text-secondary)" }}
          >
            L&apos;algo prépare les bons. Tu valides, le grossiste reçoit. Halal
            vérifié à chaque envoi.
          </p>
        </header>

        {/* KPI row */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <KpiCard
            label="À valider"
            value={String(counts.a_valider)}
            sub={counts.a_valider > 0 ? eur(totalAValider) : "—"}
            accent="gold"
          />
          <KpiCard
            label="En cours"
            value={String(counts.en_cours)}
            sub="chez fourn."
            accent="neutral"
          />
          <KpiCard
            label="Bloquées"
            value={String(blockedCount)}
            sub="certif halal"
            accent={blockedCount > 0 ? "danger" : "success"}
          />
        </div>

        {/* Action row */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <button
            type="button"
            onClick={regenerate}
            disabled={regenerating}
            className="btn-primary"
            style={{ minHeight: 44 }}
          >
            {regenerating ? (
              <>
                <RefreshCw size={16} className="animate-spin" /> Calcul en
                cours…
              </>
            ) : (
              <>
                <Sparkles size={16} /> Régénérer les suggestions
              </>
            )}
          </button>
          <Link
            href="/v2/fournisseurs"
            className="btn-ghost"
            style={{ minHeight: 44 }}
          >
            <Building2 size={16} /> Fournisseurs &amp; certifs
          </Link>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 scrollbar-none overflow-x-auto">
          <TabBtn
            label="À valider"
            count={counts.a_valider}
            active={tab === "a_valider"}
            onClick={() => setTab("a_valider")}
          />
          <TabBtn
            label="En cours"
            count={counts.en_cours}
            active={tab === "en_cours"}
            onClick={() => setTab("en_cours")}
          />
          <TabBtn
            label="Reçues"
            count={counts.recues}
            active={tab === "recues"}
            onClick={() => setTab("recues")}
          />
        </div>

        {/* List */}
        {loading ? (
          <SkeletonList />
        ) : filtered.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <ul className="space-y-3">
            {filtered.map((po) => {
              const alerte = certifAlerte(po.fournisseurs?.certif_expire_le);
              const blocked = alerte === "expiree" || alerte === "manquante";
              return (
                <motion.li
                  key={po.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <button
                    type="button"
                    onClick={() => setDrawer(po)}
                    className="card card-tappable w-full text-left flex flex-col gap-3"
                    style={{ padding: 16 }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p
                          className="label-caps mb-1"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {po.numero_po} · {STATUT_LABELS[po.statut]}
                        </p>
                        <h3
                          className="h3 truncate"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {po.fournisseurs?.nom ?? "Fournisseur"}
                        </h3>
                        <p className="body-sm mt-0.5">
                          <Truck
                            size={12}
                            className="inline mr-1"
                            style={{ verticalAlign: -2 }}
                          />
                          {po.depots?.nom ?? "—"} ·{" "}
                          {po.date_livraison_prevue
                            ? `livraison ${dateFr(po.date_livraison_prevue)}`
                            : "livraison non planifiée"}
                        </p>
                      </div>
                      <p
                        className="font-bold tabular text-[18px]"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {eur(po.total_ht ?? 0)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <CertHalalBadge
                        organisme={po.fournisseurs?.certif_organisme ?? null}
                        numero={po.fournisseurs?.certif_numero}
                        expireLe={po.fournisseurs?.certif_expire_le}
                        size="sm"
                      />
                      <span
                        className="inline-flex items-center gap-1 text-[13px] font-semibold"
                        style={{
                          color: blocked
                            ? "var(--danger)"
                            : "var(--primary-green)",
                        }}
                      >
                        {blocked ? (
                          <>
                            <ShieldAlert size={14} /> Envoi bloqué
                          </>
                        ) : po.statut === "brouillon" ? (
                          <>
                            Valider <ChevronRight size={14} />
                          </>
                        ) : (
                          <>
                            Voir <ChevronRight size={14} />
                          </>
                        )}
                      </span>
                    </div>
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>

      <PoDrawer
        po={drawer}
        onClose={() => setDrawer(null)}
        onSend={sendPo}
        sending={sending}
      />
    </V2Shell>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: "gold" | "danger" | "success" | "neutral";
}) {
  const color = {
    gold: "var(--accent-gold)",
    danger: "var(--danger)",
    success: "var(--success)",
    neutral: "var(--text-secondary)",
  }[accent];
  return (
    <div className="card" style={{ padding: 14 }}>
      <p
        className="label-caps mb-1.5"
        style={{ color: "var(--text-secondary)", fontSize: 10 }}
      >
        {label}
      </p>
      <p
        className="font-bold tabular leading-none"
        style={{ fontSize: 28, color: "var(--text-primary)" }}
      >
        {value}
      </p>
      <p className="text-[12px] font-semibold mt-1 tabular" style={{ color }}>
        {sub}
      </p>
    </div>
  );
}

function TabBtn({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pill-filter press-btn"
      data-active={active}
      style={{ minHeight: 44 }}
    >
      {label}
      <span
        className="tabular"
        style={{
          background: active ? "rgba(255,255,255,0.18)" : "var(--bg-cream)",
          color: active ? "white" : "var(--text-secondary)",
          padding: "1px 7px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        {count}
      </span>
    </button>
  );
}

function SkeletonList() {
  return (
    <ul className="space-y-3">
      {[0, 1, 2].map((i) => (
        <li key={i} className="card" style={{ padding: 16 }}>
          <div className="skeleton h-4 w-1/3 mb-2" />
          <div className="skeleton h-6 w-2/3 mb-3" />
          <div className="skeleton h-4 w-24" />
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const map = {
    a_valider: {
      Icon: ShoppingCart,
      title: "Aucun brouillon en attente",
      sub: "L'algo n'a rien à suggérer. Clique \"Régénérer\" pour relancer le calcul.",
    },
    en_cours: {
      Icon: Send,
      title: "Aucune commande envoyée",
      sub: "Valide un brouillon depuis l'onglet À valider.",
    },
    recues: {
      Icon: ClipboardList,
      title: "Pas encore d'historique",
      sub: "Les commandes reçues s'affichent ici une fois le BDL scanné.",
    },
  }[tab];
  return (
    <div className="card" style={{ padding: 8 }}>
      <SharedEmptyState
        icon={map.Icon}
        title={map.title}
        description={map.sub}
        compact
      />
    </div>
  );
}
