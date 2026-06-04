"use client";

/**
 * /v2/cockpit — Le "Sabah el khir Otmane".
 *
 * Le but : 30 secondes en marchant dans le dépôt à 8h05, thumb-scroll,
 * Otmane sait ce qu'il doit faire aujourd'hui. PAS de tableau, PAS
 * d'export, PAS de filtres. Juste des cartes empilables qu'on tape
 * pour aller plus loin.
 *
 * Architecture :
 *   - Client component → fetch /api/cockpit/snapshot au mount
 *   - Realtime channel sur sorties_stock et v_dlc_alerts (par ex casse
 *     ajoutée à 8h05 par un préparateur → la card se met à jour live)
 *   - Pas de SSR : le PIN login est côté client (V2Shell redirige) et
 *     les latences supabase server-side ne sont pas optimisées en cold-
 *     start Vercel. Le `cache-control: private, max-age=60` côté API
 *     fait office de SSR-cache léger.
 *
 * Routing : page intégrée plus tard via /v2 hub (orchestrateur). Pour
 * la démo : navigation directe /v2/cockpit après login.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Clock,
  Flame,
  PackageX,
  RefreshCw,
} from "lucide-react";
import { V2Shell } from "@/components/v2/V2Shell";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { useV2 } from "@/lib/v2-store";
import { supabase } from "@/lib/supabase";
import { getHijriContext } from "@/lib/hijri";
import { HeroKpi } from "@/components/cockpit/hero-kpi";
import { AlertCard, AlertCardRow } from "@/components/cockpit/alert-card";
import { RamadanCard } from "@/components/cockpit/ramadan-card";
import { CompetitorCard } from "@/components/cockpit/competitor-card";
import { MorningBriefCard } from "@/components/cockpit/morning-brief";
import type { CockpitSnapshot } from "@/app/api/cockpit/snapshot/route";
import type { CockpitBriefing } from "@/app/api/cockpit/briefing/route";

function formatEur(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function timeAgo(iso: string): string {
  const dt = new Date(iso);
  const diffS = Math.floor((Date.now() - dt.getTime()) / 1000);
  if (diffS < 60) return "il y a quelques sec.";
  if (diffS < 3600) return `il y a ${Math.floor(diffS / 60)} min`;
  return dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export default function CockpitPage() {
  const router = useRouter();
  const employe = useV2((s) => s.currentEmploye);
  const depot = useV2((s) => s.currentDepot);

  const [snap, setSnap] = useState<CockpitSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // MYTH-02 — copilote "3 choses avant 10h". Le brief est calculé une
  // fois par matin (cache sessionStorage clé date+dépôt) pour ne PAS
  // relancer le scoreur + l'IA à chaque render/refresh.
  const [briefing, setBriefing] = useState<CockpitBriefing | null>(null);
  const [briefLoading, setBriefLoading] = useState(true);

  const loadSnapshot = useCallback(async () => {
    try {
      // HOTFIX vague 7 : /api/cockpit/snapshot exige x-internal-secret.
      // Server action loadCockpitSnapshot injecte le secret côté serveur.
      const { loadCockpitSnapshot } = await import("@/lib/actions/cockpit");
      const r = await loadCockpitSnapshot(depot?.id);
      if (!r.ok || !r.data) {
        throw new Error(r.error ?? "Erreur");
      }
      setSnap(r.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur chargement");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [depot]);

  // Brief du matin — chargé séparément du snapshot (il fait son propre
  // appel snapshot côté serveur + reformulation IA, ce qui peut prendre
  // quelques secondes). On le cache par session/matin. `force` saute le
  // cache (bouton Sync). Résilient : un échec n'impacte pas le cockpit.
  const loadBriefing = useCallback(
    async (force = false) => {
      const todayKey = new Date().toISOString().slice(0, 10);
      const cacheKey = `cockpit-brief:${todayKey}:${depot?.id ?? "all"}`;
      if (!force && typeof window !== "undefined") {
        try {
          const cached = window.sessionStorage.getItem(cacheKey);
          if (cached) {
            setBriefing(JSON.parse(cached) as CockpitBriefing);
            setBriefLoading(false);
            return;
          }
        } catch {
          /* cache illisible → on recalcule */
        }
      }
      setBriefLoading(true);
      try {
        const { loadCockpitBriefing } = await import("@/lib/actions/cockpit");
        const r = await loadCockpitBriefing(depot?.id);
        if (r.ok && r.data) {
          setBriefing(r.data);
          if (typeof window !== "undefined") {
            try {
              window.sessionStorage.setItem(cacheKey, JSON.stringify(r.data));
            } catch {
              /* quota plein → tant pis, pas de cache */
            }
          }
        }
        // Échec silencieux : le brief reste null → la card affiche le
        // skeleton puis disparaît si vraiment rien. Pas de crash cockpit.
      } catch {
        /* le briefing ne casse JAMAIS le cockpit */
      } finally {
        setBriefLoading(false);
      }
    },
    [depot],
  );

  useEffect(() => {
    void loadSnapshot();
    void loadBriefing();
  }, [loadSnapshot, loadBriefing]);

  // Realtime : si une casse est saisie pendant qu'Otmane regarde la page,
  // on rafraîchit le snapshot. Channel scope minimal pour pas spammer.
  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    const channel = sb
      .channel("cockpit-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sorties_stock" },
        () => {
          void loadSnapshot();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "competitor_intel" },
        () => {
          void loadSnapshot();
        },
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [loadSnapshot]);

  function handleRefresh() {
    setRefreshing(true);
    void loadSnapshot();
    void loadBriefing(true); // force = recalcule le brief (saute le cache matin)
  }

  // Fallback hijri si snap pas encore chargé (pour ne PAS attendre le réseau
  // avant d'afficher "Sabah el khir Otmane, Ramadan dans 28 jours").
  const hijriLocal = useMemo(() => getHijriContext(), []);
  const prenom = employe?.prenom ?? "Otmane";
  const salutation = snap?.salutation ?? "Sabah el khir";
  const hijriMessage = snap?.hijri.message ?? hijriLocal.message;
  const hijriEnCours = snap?.hijri.en_cours ?? hijriLocal.en_cours;
  const hijriProchainLib =
    snap?.hijri.prochain_libelle ?? hijriLocal.prochain?.libelle ?? null;
  const hijriJours =
    snap?.hijri.jours_jusqua ?? hijriLocal.jours_jusqua;
  const hijriImpact = snap?.hijri.impact_ca ?? hijriLocal.prochain?.impact_ca ?? null;
  const hijriDateDebut = hijriLocal.prochain?.date_debut ?? null;
  const fenetreHijri = hijriLocal.fenetre_90j.map((x) => ({
    libelle: x.event.libelle,
    jours: x.jours_jusqua,
    impact: x.event.impact_ca,
  }));

  return (
    <V2Shell wide>
      <PageAccentStripe accent="sapin-or" />

      <div className="px-4 sm:px-5 md:px-8 pt-3 pb-2 flex items-center justify-between gap-3 max-w-7xl mx-auto w-full">
        <div className="flex flex-col">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-[var(--accent-gold-dim)]">
            Cockpit matin
          </p>
          <p className="text-[12.5px] text-[var(--text-secondary)] tabular">
            {snap ? `Mis à jour ${timeAgo(snap.generated_at)}` : "Chargement…"}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 min-h-[44px] md:min-h-0 md:h-9 px-4 rounded-full bg-[var(--surface-2)] border border-[var(--border-card)] text-[13px] md:text-[12px] font-bold text-[var(--text-primary)] active:scale-[0.97] transition disabled:opacity-50"
          aria-label="Actualiser le cockpit"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
            strokeWidth={2.4}
          />
          Sync
        </button>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
        className="px-4 sm:px-5 md:px-8 flex flex-col gap-4 max-w-7xl mx-auto w-full"
      >
        {/* ZONE 0 — Brief du matin (MYTH-02 copilote). En HAUT, avant les KPI :
            les 3 actions calculées pendant la nuit, deep-linkées. On masque
            la card uniquement si le brief a fini de charger ET qu'il n'y a
            ni action ni message zen (cas d'échec total → on ne pollue pas). */}
        {(briefLoading ||
          briefing === null ||
          briefing.actions.length > 0 ||
          briefing.zen_message !== null) && (
          <MorningBriefCard
            prenom={prenom}
            actions={briefing?.actions ?? []}
            zenMessage={briefing?.zen_message ?? null}
            iaReformule={briefing?.ia_reformule ?? false}
            loading={briefLoading && briefing === null}
            onAction={(href) => router.push(href)}
          />
        )}

        {/* ZONE 1 — Hero KPI (full width sur desktop pour rester impact-first) */}
        <HeroKpi
          prenom={prenom}
          salutation={salutation}
          hijriMessage={hijriMessage}
          hijriEnCours={hijriEnCours}
          caHier={snap?.ventes_hier?.ca_ttc ?? null}
          deltaN1Pct={snap?.delta_n1_pct ?? null}
          pctTarget={snap?.ventes_hier?.pct_target ?? null}
          nbTickets={snap?.ventes_hier?.nb_tickets ?? null}
          loading={loading}
        />

        {/* Grille responsive des autres cards — empilées sur mobile,
            2 cols sur tablette, 3 cols sur desktop. BUG-006 fix. */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* ZONE 2 — Calendrier hijri */}
        <RamadanCard
          message={hijriMessage}
          joursJusqua={hijriJours}
          libelle={hijriProchainLib}
          dateDebutIso={hijriDateDebut}
          enCours={hijriEnCours}
          impactCa={hijriImpact}
          fenetre={fenetreHijri}
          onSeasonalTap={() => router.push("/v2/admin/ramadan")}
        />

        {/* ZONE 3 — DLC */}
        <AlertCard
          icon={Clock}
          tone={snap && snap.dlc.count_critique > 0 ? "danger" : "warn"}
          eyebrow={`${snap?.dlc.count_total ?? 0} réfs en DLC courte`}
          title={
            snap && snap.dlc.count_total > 0
              ? `${snap.dlc.count_total} produits à remiser aujourd'hui`
              : "Aucune DLC critique"
          }
          metric={snap ? formatEur(snap.dlc.valeur_eur) : undefined}
          hint={
            snap && snap.dlc.valeur_eur > 0
              ? `Valeur estimée de remise — ${snap.dlc.count_critique} en J-1 / forcés`
              : undefined
          }
          onTap={
            snap && snap.dlc.count_total > 0
              ? () => router.push("/v2/admin/alertes-dlc")
              : undefined
          }
        >
          {snap?.dlc.top.slice(0, 3).map((d) => (
            <AlertCardRow
              key={d.lot_id}
              label={d.produit_nom}
              meta={`${d.jours_restants <= 0 ? "Périmé" : `J-${d.jours_restants}`} · ${d.remise_suggeree_pct}% remise`}
              value={
                d.quantite_recue
                  ? `${d.quantite_recue} u`
                  : `${d.niveau_alerte}`
              }
              accent={
                d.niveau_alerte === "forcé" || d.niveau_alerte === "critique"
                  ? "danger"
                  : "warn"
              }
            />
          ))}
        </AlertCard>

        {/* ZONE 4 — Stockout prédictif */}
        <AlertCard
          icon={PackageX}
          tone={snap && snap.stockout.count_out > 0 ? "danger" : "warn"}
          eyebrow={`${snap?.stockout.count_total ?? 0} SKU sous tension`}
          title={
            snap && snap.stockout.count_total > 0
              ? `${snap.stockout.count_total} produits vont taper rupture`
              : "Stock sain partout"
          }
          metric={
            snap && snap.stockout.count_out > 0
              ? `${snap.stockout.count_out}`
              : undefined
          }
          hint={
            snap && snap.stockout.top[0]
              ? `Phase ${snap.stockout.top[0].phase_courante} · ×${snap.stockout.top[0].multiplicateur.toFixed(2)}`
              : undefined
          }
          onTap={
            snap && snap.stockout.count_total > 0
              ? () => router.push("/v2/admin")
              : undefined
          }
        >
          {snap?.stockout.top.slice(0, 3).map((s) => (
            <AlertCardRow
              key={`${s.produit_id}-${s.depot_nom}`}
              label={s.produit_nom}
              meta={`${s.depot_nom} · stock ${s.stock_actuel}`}
              value={
                s.days_cover === null
                  ? "⚠"
                  : s.days_cover < 1
                    ? "rupture"
                    : `${s.days_cover.toFixed(1)} j`
              }
              accent={
                s.tier === "out" || s.tier === "blocker"
                  ? "danger"
                  : s.tier === "crit"
                    ? "warn"
                    : "neutral"
              }
            />
          ))}
        </AlertCard>

        {/* ZONE 5 — Casse 24h */}
        {snap?.casse_24h && snap.casse_24h.nb_evenements > 0 && (
          <AlertCard
            icon={Flame}
            tone={
              snap.casse_24h.delta_pct !== null && snap.casse_24h.delta_pct > 30
                ? "danger"
                : "warn"
            }
            eyebrow="Casse soirée"
            title={
              snap.casse_24h.delta_pct !== null && snap.casse_24h.delta_pct > 0
                ? `Casse hier soir +${snap.casse_24h.delta_pct.toFixed(0)}%`
                : "Casse hier soir"
            }
            metric={formatEur(snap.casse_24h.total_eur_24h)}
            hint={
              snap.casse_24h.top_categorie
                ? `Surtout sur ${snap.casse_24h.top_categorie} · vs ${formatEur(snap.casse_24h.total_eur_7j_avg)} moy. 7j`
                : `${snap.casse_24h.nb_evenements} événements`
            }
            onTap={() => router.push("/v2/sortie")}
          />
        )}

        {/* ZONE 6 — Competitor intel */}
        <CompetitorCard
          rows={snap?.competitor ?? []}
          onAddRelevé={() => {
            // Démo : route placeholder, l'orchestrateur branchera plus tard.
            router.push("/v2/admin");
          }}
        />
        </div>{/* /grid responsive */}

        {/* Footer : warnings dev/admin */}
        {snap && snap.warnings.length > 0 && (
          <div
            className="rounded-[16px] p-3 flex items-start gap-2.5 border"
            style={{
              background: "var(--warning-soft)",
              borderColor: "color-mix(in srgb, var(--warning) 22%, transparent)",
            }}
          >
            <AlertTriangle
              className="w-4 h-4 text-[var(--warning)] shrink-0 mt-0.5"
              strokeWidth={2.4}
            />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--warning)]">
                Warnings cockpit
              </p>
              <ul className="text-[12px] text-[var(--text-secondary)] mt-1 list-disc list-inside space-y-0.5">
                {snap.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {error && (
          <div
            className="rounded-[16px] p-3 text-[13px] text-[var(--danger)] border"
            style={{
              background: "var(--danger-soft)",
              borderColor: "color-mix(in srgb, var(--danger) 24%, transparent)",
            }}
          >
            <p className="font-bold mb-1">Snapshot indisponible</p>
            <p className="text-[12px]">{error}</p>
          </div>
        )}

        {/* Spacer pour le nav-stack + safe-area iOS */}
        <div className="h-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]" />
      </motion.div>
    </V2Shell>
  );
}
