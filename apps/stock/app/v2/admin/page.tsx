"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Bell,
  Boxes,
  Building2,
  CalendarClock,
  FileText,
  MonitorSmartphone,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { EditorialEyebrow } from "@/components/v2/EditorialEyebrow";
import { HeroActionCard } from "@/components/v2/HeroActionCard";
import { DlcBanner } from "@/components/v2/DlcBanner";
import { DriveDashboardSection } from "@/components/v2/DriveDashboardSection";
import { PushNotifCard } from "@/components/v2/PushNotifCard";
import { StockEditWindowCard } from "@/components/v2/StockEditWindowCard";
import { useV2 } from "@/lib/v2-store";
import {
  listDepots,
  listEmployes,
  listInventairesDuJour,
  listProduitsInDepot,
  listReceptions,
  listSorties,
  listTransferts,
} from "@/lib/db";
import type {
  Depot,
  Employe,
  InventaireTournant,
  Reception,
  SortieStock,
  TransfertInterDepot,
} from "@/lib/types/db";

interface DepotStats {
  depot: Depot;
  productCount: number;
  totalUnits: number;
  totalValue: number;
  /** Valorisation au COÛT d'achat (vraie valeur immobilisée). */
  totalCost: number;
  /** Marge brute potentielle si tout le stock est vendu au prix affiché. */
  margePotentielle: number;
  receptionsToday: number;
  sortiesToday: number;
  ecartsCount: number;
}

export default function V2AdminDashboardPage() {
  const router = useRouter();
  const employe = useV2((s) => s.currentEmploye);

  const [depots, setDepots] = useState<Depot[]>([]);
  const [stats, setStats] = useState<DepotStats[]>([]);
  const [recentReceptions, setRecentReceptions] = useState<Reception[]>([]);
  const [recentSorties, setRecentSorties] = useState<SortieStock[]>([]);
  const [recentTransferts, setRecentTransferts] = useState<
    TransfertInterDepot[]
  >([]);
  const [recentInventaires, setRecentInventaires] = useState<
    InventaireTournant[]
  >([]);
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [view, setView] = useState<"stock" | "drive">("stock");
  const [loading, setLoading] = useState(true);
  const [showAllDepots, setShowAllDepots] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const ds = await listDepots();
      setDepots(ds);
      const today = new Date().toISOString().slice(0, 10);
      const allEmployes = await listEmployes();
      setEmployes(allEmployes);

      const computed: DepotStats[] = await Promise.all(
        ds.map(async (d) => {
          const stock = await listProduitsInDepot(d.id);
          const receptions = await listReceptions({
            depotId: d.id,
            limit: 100,
          });
          const sorties = await listSorties({ depotId: d.id, limit: 100 });
          const inventaires = await listInventairesDuJour({ depotId: d.id });
          const isToday = (iso: string) => iso.slice(0, 10) === today;
          return {
            depot: d,
            productCount: stock.length,
            totalUnits: stock.reduce((s, p) => s + p.quantite, 0),
            totalValue: stock.reduce(
              (s, p) => s + p.quantite * (p.prix_vente ?? 0),
              0,
            ),
            totalCost: stock.reduce(
              (s, p) => s + p.quantite * (p.cout_achat_ht ?? 0),
              0,
            ),
            // Marge potentielle = (prix − coût) × quantité, uniquement sur les
            // lignes où le coût est connu (sinon on n'invente pas de marge).
            margePotentielle: stock.reduce(
              (s, p) =>
                p.cout_achat_ht != null && p.prix_vente != null
                  ? s + p.quantite * (p.prix_vente - p.cout_achat_ht)
                  : s,
              0,
            ),
            receptionsToday: receptions.filter((r) => isToday(r.created_at))
              .length,
            sortiesToday: sorties.filter((r) => isToday(r.created_at)).length,
            ecartsCount: inventaires.filter(
              (i) => i.quantite_comptee !== null && i.ecart !== 0,
            ).length,
          };
        }),
      );
      setStats(computed);

      const allReceptions: Reception[] = [];
      const allSorties: SortieStock[] = [];
      const allTransferts = await listTransferts({ limit: 30 });
      for (const d of ds) {
        allReceptions.push(
          ...(await listReceptions({ depotId: d.id, limit: 10 })),
        );
        allSorties.push(...(await listSorties({ depotId: d.id, limit: 10 })));
      }
      setRecentReceptions(
        allReceptions
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 8),
      );
      setRecentSorties(
        allSorties
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 8),
      );
      setRecentTransferts(allTransferts.slice(0, 5));

      // Inventaires aggregated
      const allInv: InventaireTournant[] = [];
      for (const d of ds) {
        allInv.push(...(await listInventairesDuJour({ depotId: d.id })));
      }
      setRecentInventaires(allInv.slice(0, 10));
    } catch (e) {
      // Sans ce garde, une erreur Supabase laissait le dashboard vide/figé.
      console.error("[admin] chargement dashboard échoué:", e);
      toast.error("Erreur de chargement du tableau de bord · réessaie");
    } finally {
      setLoading(false);
    }
  }

  const flaggedSorties = useMemo(
    () =>
      recentSorties.filter(
        (s) => s.ia_coherence_score !== null && s.ia_coherence_score < 0.6,
      ),
    [recentSorties],
  );

  const emptyReceptions = useMemo(
    () => recentReceptions.filter((r) => r.reception_vide === true),
    [recentReceptions],
  );

  const activityCount = useMemo(
    () =>
      recentReceptions.length + recentSorties.length + recentTransferts.length,
    [recentReceptions, recentSorties, recentTransferts],
  );

  const invEcartsCount = useMemo(
    () =>
      recentInventaires.filter(
        (i) => i.quantite_comptee !== null && i.ecart !== 0,
      ).length,
    [recentInventaires],
  );

  return (
    <V2Shell wide>
      <PageAccentStripe accent="or-sapin" />
      <header className="px-4 sm:px-5 pt-7">
        <BackButton />
        <EditorialEyebrow num="01" label="Cockpit admin" className="mt-3" />
        <h1 className="h1-display mt-3">
          Dashboard <span className="gold">global</span>.
        </h1>
        <p className="body-md text-text-secondary mt-3 max-w-[40ch]">
          {view === "stock"
            ? "Vision unifiée des 3 dépôts en temps réel."
            : "Activité drive client : commandes, créneaux, top produits."}
        </p>

        {/* Hero — assistant IA (action principale admin, entrée unique) */}
        <div className="mt-5">
          <HeroActionCard
            href="/v2/admin/assistant-ia"
            eyebrow="Pilote"
            title="Assistant IA Salam"
            desc="Pose une question sur les stocks, ventes, écarts — réponse instantanée."
            icon={Sparkles}
            badge="Nouveau"
          />
        </div>

        {/* TOGGLE Stock / Drive */}
        <div
          role="tablist"
          aria-label="Vue dashboard"
          className="inline-flex bg-card-bg border border-rule rounded-full p-1 mt-5 shadow-card"
        >
          {(["stock", "drive"] as const).map((v) => {
            const active = view === v;
            return (
              <button
                key={v}
                role="tab"
                aria-selected={active}
                onClick={() => setView(v)}
                className={`px-5 min-h-[44px] md:min-h-0 md:py-1.5 py-2 rounded-full text-[13px] md:text-[12.5px] font-bold transition-colors min-w-[96px] ${
                  active ? "bg-primary text-text-ondark" : "text-text-secondary"
                }`}
              >
                {v === "stock" ? "Vue Stock" : "Vue Drive"}
              </button>
            );
          })}
        </div>
      </header>

      {/* Pilotage du jour : déplacé sur le Cockpit (dashboard unique) pour
          éviter le doublon. /v2/cockpit porte désormais le PilotageStrip. */}

      {loading ? (
        <section className="px-4 sm:px-5 mt-5 space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-card-bg border border-rule rounded-[20px] p-4 space-y-3 shadow-card"
            >
              <div className="flex items-center gap-3">
                <div className="skeleton w-10 h-10" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-3.5 w-24" />
                  <div className="skeleton h-2.5 w-32" />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[0, 1, 2, 3].map((j) => (
                  <div key={j} className="space-y-1.5">
                    <div className="skeleton h-2 w-12" />
                    <div className="skeleton h-4 w-14" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      ) : view === "drive" ? (
        /* ───────── VUE DRIVE ───────── */
        <DriveDashboardSection />
      ) : (
        /* ───────── VUE STOCK ───────── */
        <>
          {/* ═══ PLAN 02 — OPÉRER : raccourcis terrain ═══ */}
          <EditorialEyebrow
            num="02"
            label="Opérer"
            className="px-4 sm:px-5 mt-7"
          />

          {/* DLC alerts bandeau */}
          <div className="px-4 sm:px-5 mt-3">
            <DlcBanner />
          </div>

          {/* Raccourcis terrain — destinations absentes du menu admin (drawer) */}
          <section className="px-4 sm:px-5 mt-4 flex flex-wrap gap-2">
            <OpChip
              href="/v2/admin/bons-reception"
              label="BR émis"
              icon={FileText}
              accent="success"
            />
            <OpChip
              href="/v2/admin/alertes-dlc"
              label="Alertes DLC"
              icon={CalendarClock}
              accent="warning"
            />
            <OpChip
              href="/v2/counter"
              label="Counter retrait"
              icon={MonitorSmartphone}
              accent="primary"
              external
            />
          </section>

          {/* ═══ PLAN 03 — PILOTER : activité, dépôts, alertes ═══ */}
          <EditorialEyebrow
            num="03"
            label="Piloter"
            className="px-4 sm:px-5 mt-8"
          />

          {/* ┌─ DÉPÔTS — état multi-dépôts ─┐ */}
          <p className="px-4 sm:px-5 mt-7 section-eyebrow">
            <Boxes className="w-3 h-3" />
            État des dépôts
          </p>
          <section className="px-4 sm:px-5 mt-2 space-y-3">
            {(showAllDepots ? stats : stats.slice(0, 3)).map((s, idx) => {
              const isEntrepot = s.depot.type === "entrepot";
              return (
                <motion.div
                  key={s.depot.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.22,
                    ease: [0.22, 0.61, 0.36, 1],
                    delay: idx * 0.05,
                  }}
                  className="bg-card-bg border border-rule rounded-[20px] shadow-card overflow-hidden active:scale-[0.99] transition-transform cursor-pointer"
                  onClick={() => router.push(`/v2/stock?depot=${s.depot.id}`)}
                  role="link"
                  aria-label={`Voir le stock du dépôt ${s.depot.nom}`}
                >
                  {/* C2-F — ruban couleur identifiant le dépôt (tokens : se
                      ré-éclaire en dark, garde la hiérarchie d'identité). */}
                  <div
                    aria-hidden
                    className="h-1.5 w-full"
                    style={{
                      background:
                        s.depot.nom === "Particulier"
                          ? "var(--accent-gold)"
                          : s.depot.nom === "Professionnel"
                            ? "var(--primary-green)"
                            : "var(--primary-green-dark)",
                    }}
                  />
                  <div className="p-4">
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          isEntrepot
                            ? "bg-primary-dark text-gold-bright"
                            : s.depot.nom === "Particulier"
                              ? "bg-gold-soft text-gold-bright"
                              : "bg-primary text-text-ondark"
                        }`}
                      >
                        <Building2 className="w-4 h-4" strokeWidth={2.2} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-bold text-text-primary leading-tight">
                          {s.depot.nom}
                        </p>
                        <p className="text-[10.5px] text-text-tertiary uppercase tracking-wide mt-0.5 leading-tight">
                          {isEntrepot
                            ? "Entrepôt back-office, pas de drive"
                            : "Point de vente"}
                        </p>
                      </div>
                      {isEntrepot && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-primary-dark text-gold-bright rounded-full px-2 py-0.5">
                          Back-office
                        </span>
                      )}
                      {s.ecartsCount > 0 && !isEntrepot && (
                        <span className="badge badge-warning text-[10px]">
                          <AlertTriangle className="w-3 h-3" />
                          {s.ecartsCount} écart{s.ecartsCount > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-4 text-left">
                      <Stat
                        label="Valeur stock"
                        value={`${Math.round(s.totalCost).toLocaleString("fr-FR")} €`}
                        gold
                        hint={
                          s.margePotentielle > 0
                            ? `marge +${Math.round(s.margePotentielle).toLocaleString("fr-FR")} €`
                            : "au coût d'achat"
                        }
                      />
                      <Stat
                        label="Mouvts"
                        value={`${s.receptionsToday}↓ ${s.sortiesToday}↑`}
                        hint="24h"
                      />
                    </div>
                  </div>
                </motion.div>
              );
            })}
            {!showAllDepots && stats.length > 3 && (
              <button
                onClick={() => setShowAllDepots(true)}
                className="w-full bg-card-bg border border-rule rounded-2xl py-3 text-sm font-bold text-primary inline-flex items-center justify-center gap-1.5 shadow-card active:scale-[0.99] transition-transform"
              >
                Voir les {stats.length - 3} autre
                {stats.length - 3 > 1 ? "s" : ""} dépôt
                {stats.length - 3 > 1 ? "s" : ""}
              </button>
            )}
            {showAllDepots && stats.length > 3 && (
              <button
                onClick={() => setShowAllDepots(false)}
                className="w-full text-xs font-bold text-text-secondary py-2"
              >
                Replier
              </button>
            )}
          </section>

          {/* EMPTY RECEPTIONS — workflow safety net */}
          {emptyReceptions.length > 0 && (
            <section className="px-4 sm:px-5 mt-7">
              <p className="label-caps text-warning mb-3 inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                Réceptions vides à vérifier
              </p>
              <div className="space-y-2">
                {emptyReceptions.map((r) => {
                  const d = depots.find((x) => x.id === r.depot_id);
                  const e = employes.find((x) => x.id === r.employe_id);
                  return (
                    <div
                      key={r.id}
                      className="bg-warning-soft border border-warning/30 rounded-2xl p-3 flex items-center gap-3"
                    >
                      <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-warning">
                          BL vide · {r.fournisseur ?? "Fournisseur ?"} →{" "}
                          {d?.nom ?? "?"}
                        </p>
                        <p className="text-[11px] text-text-secondary line-clamp-1">
                          Validé par {e?.prenom ?? "?"} {e?.nom ?? ""} sans
                          aucun scan — vérifier la livraison.
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* IA FLAGS — top 4, le reste sur /v2/admin/alertes */}
          {flaggedSorties.length > 0 && (
            <section className="px-4 sm:px-5 mt-7">
              <div className="flex items-center justify-between mb-3">
                <p className="label-caps text-danger inline-flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Alertes IA — sorties à réviser
                </p>
                {flaggedSorties.length > 4 && (
                  <a
                    href="/v2/admin/alertes"
                    className="text-[11px] font-bold text-danger inline-flex items-center gap-0.5"
                  >
                    Voir tout ({flaggedSorties.length}) →
                  </a>
                )}
              </div>
              <div className="space-y-2">
                {flaggedSorties.slice(0, 4).map((s) => (
                  <a
                    key={s.id}
                    href={`/v2/admin/alertes?sortie=${s.id}`}
                    className="bg-danger-soft border border-danger/20 rounded-2xl p-3 flex items-center gap-3 active:scale-[0.99] transition-transform cursor-pointer"
                    aria-label="Ouvrir le détail de l'alerte sur le dashboard alertes"
                  >
                    <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-danger">
                        Score {Math.round((s.ia_coherence_score ?? 0) * 100)}% ·{" "}
                        {s.type}
                      </p>
                      <p className="text-[11px] text-text-secondary line-clamp-1">
                        {s.ia_coherence_notes}
                      </p>
                    </div>
                    <span className="text-danger text-xs font-bold">→</span>
                  </a>
                ))}
                {flaggedSorties.length > 4 && (
                  <a
                    href="/v2/admin/alertes"
                    className="block bg-card-bg border border-rule rounded-2xl p-3 text-center text-[12px] font-bold text-danger active:scale-[0.99] transition-transform"
                  >
                    +{flaggedSorties.length - 4} autre
                    {flaggedSorties.length - 4 > 1 ? "s" : ""} alerte
                    {flaggedSorties.length - 4 > 1 ? "s" : ""} — Tout consulter
                    →
                  </a>
                )}
              </div>
            </section>
          )}

          {/* RECENT + INVENTAIRES — repliés en cartes-liens compactes vers
              leurs pages dédiées (allège l'empilement du cockpit). */}
          <section className="px-4 sm:px-5 mt-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <a
              href="/v2/admin/activite"
              className="bg-card-bg border border-rule rounded-2xl p-4 shadow-card active:scale-[0.99] transition-transform flex items-center gap-3"
              aria-label="Voir l'activité complète"
            >
              <div className="flex-1 min-w-0">
                <p className="label-caps text-primary inline-flex items-center gap-1.5">
                  Activité 24h
                  <span
                    aria-hidden
                    title="Données live"
                    className="inline-block w-1.5 h-1.5 rounded-full bg-success animate-pulse"
                  />
                </p>
                <p className="text-[12px] text-text-secondary mt-1">
                  {activityCount > 0
                    ? `${activityCount} mouvement${activityCount > 1 ? "s" : ""} · réceptions, sorties, transferts`
                    : "Aucun mouvement sur les dernières 24h"}
                </p>
              </div>
              <span className="text-primary text-sm font-bold">→</span>
            </a>

            {recentInventaires.length > 0 && (
              <a
                href="/v2/inventaire/historique"
                className="bg-card-bg border border-rule rounded-2xl p-4 shadow-card active:scale-[0.99] transition-transform flex items-center gap-3"
                aria-label="Voir les inventaires"
              >
                <div className="flex-1 min-w-0">
                  <p className="label-caps text-primary">Inventaires du jour</p>
                  <p className="text-[12px] text-text-secondary mt-1">
                    {recentInventaires.length} comptage
                    {recentInventaires.length > 1 ? "s" : ""}
                    {invEcartsCount > 0
                      ? ` · ${invEcartsCount} écart${invEcartsCount > 1 ? "s" : ""}`
                      : " · conformes"}
                  </p>
                </div>
                <span className="text-primary text-sm font-bold">→</span>
              </a>
            )}
          </section>

          {/* ═══ PLAN 04 — ADMINISTRER : notifs, emails, accès édition ═══ */}
          <EditorialEyebrow
            num="04"
            label="Administrer"
            className="px-4 sm:px-5 mt-9"
          />
          <p className="px-4 sm:px-5 mt-3 section-eyebrow">
            <Bell className="w-3 h-3" />
            Communication & notifs
          </p>
          <section className="px-4 sm:px-5 mt-2 grid grid-cols-1 gap-3 mb-[max(2rem,env(safe-area-inset-bottom))]">
            <PushNotifCard employeId={employe?.id ?? null} />
            <StockEditWindowCard
              employeId={employe?.id ?? null}
              employeRole={employe?.role}
            />
          </section>
        </>
      )}
    </V2Shell>
  );
}

/**
 * OpChip — raccourci terrain dark-native pour le plan OPÉRER.
 *
 * Surface-1 (card standard dark), bordure hairline, icône dans un carré
 * teinté par l'accent status, label gras. L'accent (or/danger/success/
 * warning/primary) reste un liseré + une icône colorée — jamais un fill
 * de grande surface (doctrine MYTHOS dark).
 */
function OpChip({
  href,
  label,
  icon: Icon,
  accent,
  external,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  accent: "gold" | "danger" | "success" | "warning" | "primary";
  external?: boolean;
}) {
  const tint: Record<typeof accent, string> = {
    gold: "bg-gold-soft text-gold-bright",
    danger: "bg-danger-soft text-danger",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    primary: "bg-[color:var(--primary-green-soft)] text-primary",
  };
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="inline-flex items-center gap-2 bg-card-bg border border-rule rounded-full pl-2 pr-4 min-h-[44px] md:min-h-0 md:py-1.5 py-1.5 text-[12.5px] md:text-[11.5px] font-bold text-text-primary shadow-card active:scale-[0.98] transition-transform"
    >
      <span
        aria-hidden
        className={`inline-flex w-7 h-7 rounded-full items-center justify-center shrink-0 ${tint[accent]}`}
      >
        <Icon className="w-3.5 h-3.5" strokeWidth={2.3} />
      </span>
      {label}
    </a>
  );
}

function Stat({
  label,
  value,
  hint,
  gold,
}: {
  label: string;
  value: string | number;
  hint?: string;
  gold?: boolean;
}) {
  return (
    <div>
      <p className="text-[9.5px] text-text-tertiary uppercase tracking-wide font-bold flex items-baseline gap-1">
        {label}
        {hint && (
          <span className="text-text-tertiary/80 normal-case tracking-normal font-medium whitespace-nowrap">
            · {hint}
          </span>
        )}
      </p>
      <p
        className={`text-[15px] font-extrabold mt-1 tracking-tight ${gold ? "text-gold-bright" : "text-text-primary"}`}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </p>
    </div>
  );
}

