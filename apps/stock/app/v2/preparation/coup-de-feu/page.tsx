"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  Clock,
  Flame,
  PackageCheck,
  PartyPopper,
  Scale,
  Timer,
} from "lucide-react";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { EditorialEyebrow } from "@/components/v2/EditorialEyebrow";
import { ClientTypeBadgeGroup } from "@/components/v2/ClientTypeBadge";
import {
  listCommandesDrive,
  listLignesPourCommandeAvecUnitType,
  type CommandeDriveLigneWithUnitType,
} from "@/lib/db";
import type { CommandeDriveLigne, ProduitUnitType } from "@/lib/types/db";
import { supabase } from "@/lib/supabase";
import {
  clientTypeFromZone,
  formatHeure,
  formatRelativeToCreneau,
  getUrgencyTier,
  refCommande,
  type CommandeWithLignes,
  type UrgencyTier,
} from "../_logic";

/**
 * Mode « coup de feu » — vue ultra-dense pensée pour le rush du retrait Drive.
 * On ne montre QUE le travail restant (à préparer + en préparation), trié par
 * créneau le plus proche en tête, avec de gros tap targets et un compteur de
 * temps live. Objectif : le préparateur attaque toujours la commande la plus
 * imminente sans réfléchir, et voit d'un coup d'œil ce qui chauffe.
 */

// Tick global : on force un re-render toutes les 30s pour rafraîchir les
// libellés relatifs ("Dans 12min" → "Dans 11min") et reclasser les tiers.
function useNowTick(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const TIER_STYLE: Record<
  UrgencyTier,
  { label: string; badge: string; cardBorder: string }
> = {
  urgent: {
    label: "Urgent",
    badge: "bg-danger-soft text-danger",
    cardBorder: "var(--danger)",
  },
  normal: {
    label: "À suivre",
    badge: "bg-warning-soft text-warning",
    cardBorder: "var(--border-card)",
  },
  late: {
    label: "Plus tard",
    badge: "bg-success-soft text-success",
    cardBorder: "var(--border-card)",
  },
};

export default function CoupDeFeuPage() {
  const [commandes, setCommandes] = useState<CommandeWithLignes[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const reloadSeqRef = useRef(0);
  const mountedRef = useRef(true);
  const now = useNowTick();

  // Charge les lignes de toutes les commandes en UNE requête (pas de N+1),
  // avec repli per-commande gracieux (mode local seed / erreur batch).
  async function loadLignesByCommande(
    ids: string[],
  ): Promise<Map<string, CommandeDriveLigneWithUnitType[]>> {
    const map = new Map<string, CommandeDriveLigneWithUnitType[]>();
    if (ids.length === 0) return map;
    const sb = supabase();
    if (sb) {
      try {
        const { data, error } = await sb
          .from("commandes_drive_lignes")
          .select("*, produits(unit_type, nom, categorie)")
          .in("commande_id", ids);
        if (error) throw error;
        type Row = CommandeDriveLigne & {
          produits?: {
            unit_type?: ProduitUnitType | null;
            nom?: string | null;
            categorie?: string | null;
          } | null;
        };
        for (const r of (data ?? []) as Row[]) {
          const ligne: CommandeDriveLigneWithUnitType = {
            ...r,
            produit_unit_type: r.produits?.unit_type ?? null,
            produit_nom: r.produits?.nom ?? null,
            produit_categorie: r.produits?.categorie ?? null,
          };
          const list = map.get(ligne.commande_id) ?? [];
          list.push(ligne);
          map.set(ligne.commande_id, list);
        }
        return map;
      } catch (e) {
        console.error("[coup-de-feu] batch lignes échoué, fallback N+1:", e);
      }
    }
    const lists = await Promise.all(
      ids.map((id) => listLignesPourCommandeAvecUnitType(id)),
    );
    ids.forEach((id, i) => map.set(id, lists[i]));
    return map;
  }

  const reload = useCallback(async () => {
    const seq = ++reloadSeqRef.current;
    try {
      const cmds = await listCommandesDrive();
      const lignesByCmd = await loadLignesByCommande(cmds.map((c) => c.id));
      const enriched: CommandeWithLignes[] = cmds.map((c) => ({
        ...c,
        lignes: lignesByCmd.get(c.id) ?? [],
      }));
      if (seq !== reloadSeqRef.current || !mountedRef.current) return;
      setCommandes(
        enriched.filter(
          (c) => c.statut !== "annule" && c.statut_paiement !== "echec",
        ),
      );
    } catch (e) {
      console.error("[coup-de-feu] chargement échoué:", e);
    } finally {
      if (seq === reloadSeqRef.current && mountedRef.current) {
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void reload();
    const sb = supabase();
    if (!sb) {
      const t = setInterval(() => void reload(), 12_000);
      return () => {
        mountedRef.current = false;
        clearInterval(t);
      };
    }
    // Coalescing des events Realtime en rafale (statut + lignes) → 1 reload.
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        if (mountedRef.current) void reload();
      }, 250);
    };
    const ch = sb
      .channel("coup-de-feu-drive")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "commandes_drive" },
        scheduleReload,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "commandes_drive_lignes" },
        scheduleReload,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && mountedRef.current) setIsLive(true);
      });
    return () => {
      mountedRef.current = false;
      if (debounce) clearTimeout(debounce);
      ch.unsubscribe();
    };
  }, [reload]);

  // Rush = travail restant uniquement (à préparer + en préparation), trié
  // par créneau le plus proche en tête. `now` en dépendance pour reclasser
  // les tiers à chaque tick (une commande passe "normal" → "urgent" seule).
  const rush = useMemo(() => {
    void now; // force le recalcul à chaque tick d'horloge
    return commandes
      .filter(
        (c) => c.statut === "a_preparer" || c.statut === "en_preparation",
      )
      .sort((a, b) => a.creneau_retrait.localeCompare(b.creneau_retrait));
  }, [commandes, now]);

  const urgentCount = useMemo(
    () => rush.filter((c) => getUrgencyTier(c.creneau_retrait) === "urgent").length,
    [rush],
  );

  return (
    <V2Shell wide>
      <PageAccentStripe accent="or-sapin" />
      <header className="px-5 pt-7">
        <BackButton label="Préparation" />
        <div className="flex items-end justify-between gap-3 mt-3">
          <div className="min-w-0">
            <EditorialEyebrow num="01" label="Coup de feu" />
            <h1 className="h1-display mt-3 inline-flex items-center gap-2">
              <Flame
                className="w-7 h-7 shrink-0"
                style={{ color: "var(--danger)" }}
                aria-hidden
              />
              <span>
                Coup de <span className="gold">feu</span>.
              </span>
            </h1>
          </div>
          <span
            className={`inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${
              isLive ? "bg-success-soft text-success" : "text-text-tertiary"
            }`}
            style={isLive ? undefined : { background: "var(--surface-2)" }}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isLive ? "bg-success animate-pulse" : "bg-text-tertiary"
              }`}
            />
            {isLive ? "Temps réel" : "Polling 12s"}
          </span>
        </div>
        <p className="mt-2 text-[12px] leading-snug text-text-secondary">
          Les commandes du créneau le plus proche en tête. On attaque du haut
          vers le bas.
        </p>

        {/* Bandeau compteurs du rush */}
        {!loading && (
          <div className="mt-4 flex items-stretch gap-2">
            <div
              className="flex-1 rounded-2xl border px-3.5 py-3"
              style={{
                background: "var(--surface-1)",
                borderColor: "var(--border-light)",
              }}
            >
              <p className="label-caps text-text-tertiary">À préparer</p>
              <p className="text-[22px] font-extrabold tabular text-text-primary mt-0.5">
                {rush.length}
              </p>
            </div>
            <div
              className="flex-1 rounded-2xl border px-3.5 py-3"
              style={{
                background:
                  urgentCount > 0 ? "var(--danger-soft)" : "var(--surface-1)",
                borderColor:
                  urgentCount > 0
                    ? "var(--danger-border)"
                    : "var(--border-light)",
              }}
            >
              <p
                className={`label-caps ${
                  urgentCount > 0 ? "text-danger" : "text-text-tertiary"
                }`}
              >
                Urgent · &lt;30min
              </p>
              <p
                className={`text-[22px] font-extrabold tabular mt-0.5 inline-flex items-center gap-1.5 ${
                  urgentCount > 0 ? "text-danger" : "text-text-primary"
                }`}
              >
                {urgentCount > 0 && (
                  <Timer className="w-4 h-4 shrink-0 animate-pulse" aria-hidden />
                )}
                {urgentCount}
              </p>
            </div>
          </div>
        )}
      </header>

      {loading ? (
        <p className="px-5 py-10 text-center text-text-secondary">
          Chargement…
        </p>
      ) : rush.length === 0 ? (
        <div className="px-5 mt-8">
          <div
            className="border rounded-2xl px-5 py-10 flex flex-col items-center text-center"
            style={{
              background: "var(--surface-2)",
              borderColor: "var(--border-light)",
            }}
          >
            <span
              className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
              style={{
                background: "var(--surface-1)",
                boxShadow: "inset 0 0 0 1px var(--accent-gold-hairline)",
              }}
            >
              <PartyPopper
                className="w-7 h-7"
                style={{ color: "var(--accent-gold-dim)" }}
                strokeWidth={1.8}
                aria-hidden
              />
            </span>
            <p className="text-[15px] font-extrabold text-text-primary">
              Rush terminé.
            </p>
            <p className="text-[13px] text-text-secondary mt-1 max-w-[28ch]">
              Aucune commande en attente de préparation. Tu peux souffler.
            </p>
          </div>
        </div>
      ) : (
        // Liste dense : une rangée par commande, créneau proche en tête.
        // Sur md+ (shell wide 820px) on passe en 2 colonnes pour exploiter
        // la largeur sans perdre la densité.
        <div className="px-5 mt-5 space-y-2 md:space-y-0 md:grid md:grid-cols-2 md:gap-2.5 md:items-start pb-nav-stack">
          <AnimatePresence initial={false}>
            {rush.map((cmd) => {
              const tier = getUrgencyTier(cmd.creneau_retrait);
              const style = TIER_STYLE[tier];
              const totalLignes = cmd.lignes.length;
              const prepares = cmd.lignes.filter(
                (l) => l.statut_preparation === "prepare",
              ).length;
              const types = Array.from(
                new Set(
                  cmd.lignes.map((l) =>
                    clientTypeFromZone(l.zone_preparation),
                  ),
                ),
              );
              const nbAPeser = cmd.lignes.filter(
                (l) =>
                  l.produit_unit_type === "weight" ||
                  l.produit_unit_type === "weight_bracket",
              ).length;
              const enCours = cmd.statut === "en_preparation";
              return (
                <motion.div
                  key={cmd.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  <Link
                    href={`/v2/preparation/${cmd.id}`}
                    className="block rounded-2xl border bg-card-bg shadow-card active:scale-[0.99] transition-transform"
                    style={{
                      borderColor: style.cardBorder,
                      ...(tier === "urgent"
                        ? {
                            boxShadow:
                              "0 0 0 1px var(--danger-border), inset 3px 0 0 var(--danger)",
                          }
                        : {}),
                    }}
                  >
                    {/* Tap target généreux : toute la rangée est cliquable,
                        min-h 64px + chevron d'action explicite à droite. */}
                    <div className="flex items-center gap-3 px-3.5 py-3 min-h-[64px]">
                      {/* Bloc temps : grosse info, alignée à gauche */}
                      <div className="shrink-0 w-[78px]">
                        <span
                          className={`inline-flex items-center gap-1 text-[12px] font-extrabold px-2 py-0.5 rounded-full ${style.badge}`}
                          title={`Créneau : ${formatHeure(cmd.creneau_retrait)}`}
                        >
                          <Clock className="w-3 h-3 shrink-0" aria-hidden />
                          {formatRelativeToCreneau(cmd.creneau_retrait)}
                        </span>
                        <p className="text-[10.5px] tabular text-text-tertiary mt-1 pl-1">
                          {formatHeure(cmd.creneau_retrait)}
                        </p>
                      </div>

                      {/* Identité commande + client (anti-overflow : truncate) */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-[14px] font-extrabold text-text-primary truncate">
                            {refCommande(cmd)}
                          </p>
                          {enCours && (
                            <span className="shrink-0 text-[9.5px] font-bold uppercase tracking-wide bg-warning-soft text-warning px-1.5 py-0.5 rounded-full">
                              En cours
                            </span>
                          )}
                        </div>
                        <p className="text-[11.5px] text-text-secondary truncate">
                          {cmd.client_nom}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <ClientTypeBadgeGroup size="sm" types={types} />
                          <span className="text-[10.5px] tabular text-text-tertiary">
                            {prepares}/{totalLignes} préparés
                          </span>
                          {nbAPeser > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wide bg-gold-soft text-primary-dark px-1.5 py-0.5 rounded-full">
                              <Scale className="w-2.5 h-2.5" aria-hidden />
                              {nbAPeser} à peser
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action : gros bouton "Préparer" (44px) */}
                      <span
                        className="shrink-0 inline-flex items-center justify-center gap-1 min-h-[44px] px-3.5 rounded-full text-[12.5px] font-bold text-white bg-primary"
                        aria-hidden
                      >
                        {prepares > 0 ? "Continuer" : "Préparer"}
                        <ChevronRight className="w-4 h-4" />
                      </span>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Repère bas de liste : ce qui est prêt n'est plus dans le rush */}
          <div className="md:col-span-2 pt-2">
            <p className="text-[11px] text-text-tertiary inline-flex items-center gap-1.5">
              <PackageCheck className="w-3.5 h-3.5 shrink-0" aria-hidden />
              Les commandes marquées prêtes quittent le coup de feu.
            </p>
          </div>
        </div>
      )}
    </V2Shell>
  );
}
