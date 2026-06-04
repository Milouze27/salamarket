"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gauge,
  PackageOpen,
  ShieldCheck,
  ShoppingBag,
  Timer,
  TrendingUp,
  Users,
  Wifi,
  XCircle,
} from "lucide-react";
import {
  listCommandesDrive,
  listDriveRevenueByDay,
  listLignesPourCommande,
  listProduitsNomsByIds,
} from "@/lib/db";
import { supabase } from "@/lib/supabase";
import type {
  CommandeDrive,
  CommandeDriveLigne,
  CommandeDriveStatus,
} from "@/lib/types/db";
import {
  DriveRevenueChart,
  type DriveRevenueDataPoint,
} from "./DriveRevenueChart";

interface CommandeAggreg extends CommandeDrive {
  lignes: CommandeDriveLigne[];
}

const STATUT_META: Record<
  CommandeDriveStatus,
  { label: string; icon: typeof Clock; bg: string; fg: string }
> = {
  a_preparer: {
    label: "À préparer",
    icon: Clock,
    bg: "bg-danger-soft",
    fg: "text-danger",
  },
  en_preparation: {
    label: "En préparation",
    icon: Clock,
    bg: "bg-warning-soft",
    fg: "text-warning",
  },
  pret: {
    label: "Prête à retirer",
    icon: CheckCircle2,
    bg: "bg-success-soft",
    fg: "text-success",
  },
  retire: {
    label: "Retirée",
    icon: PackageOpen,
    bg: "bg-cream",
    fg: "text-text-secondary",
  },
  annule: {
    label: "Annulée",
    icon: XCircle,
    bg: "bg-danger-soft",
    fg: "text-danger",
  },
};

function formatEUR(n: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatCreneau(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (isToday) return `Aujourd'hui · ${time}`;
  if (isTomorrow) return `Demain · ${time}`;
  return (
    d.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }) + ` · ${time}`
  );
}

/**
 * Écart signé en minutes entre le créneau et maintenant.
 * Positif = créneau futur (temps restant), négatif = créneau dépassé (retard).
 */
function minutesUntil(iso: string, nowMs: number): number {
  return Math.round((new Date(iso).getTime() - nowMs) / 60_000);
}

/** Libellé court "dans 12 min" / "il y a 8 min" / "il y a 1 h 05". */
function formatDelta(deltaMin: number): string {
  const late = deltaMin < 0;
  const abs = Math.abs(deltaMin);
  let body: string;
  if (abs < 60) {
    body = `${abs} min`;
  } else {
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    body = m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
  }
  return late ? `il y a ${body}` : `dans ${body}`;
}

/** Seuil "imminent" : commande à retirer dans les 30 prochaines minutes. */
const IMMINENT_WINDOW_MIN = 30;

export function DriveDashboardSection() {
  const [commandes, setCommandes] = useState<CommandeAggreg[]>([]);
  const [revenue, setRevenue] = useState<DriveRevenueDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveStatus, setLiveStatus] = useState<
    "connecting" | "live" | "offline"
  >("connecting");
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  // Résolution id produit → { nom, categorie } pour afficher le top en clair.
  const [produitNoms, setProduitNoms] = useState<
    Map<string, { nom: string; categorie: string | null }>
  >(new Map());
  // Horloge interne : fait avancer les calculs de retard/imminence même
  // sans nouvel event Realtime (un créneau bascule "en retard" tout seul).
  const [nowMs, setNowMs] = useState(() => Date.now());

  /**
   * Fetch combiné commandes + CA par jour. Appelé au mount ET à chaque
   * event Realtime sur commandes_drive (ou son fallback polling).
   */
  const refetch = useCallback(async () => {
    try {
      const [aPreparer, enPrep, pret, retire, annule] = await Promise.all([
        listCommandesDrive("a_preparer"),
        listCommandesDrive("en_preparation"),
        listCommandesDrive("pret"),
        listCommandesDrive("retire"),
        listCommandesDrive("annule"),
      ]);
      const all = [...aPreparer, ...enPrep, ...pret, ...retire, ...annule];
      const enriched = await Promise.all(
        all.map(async (c) => ({
          ...c,
          lignes: await listLignesPourCommande(c.id),
        })),
      );
      setCommandes(enriched);

      // Résout les noms des produits référencés par les lignes actives,
      // en une requête `.in('id', ids)` (pas par commande).
      const ids = enriched
        .filter((c) => c.statut !== "annule")
        .flatMap((c) => c.lignes.map((l) => l.produit_id));
      const noms = await listProduitsNomsByIds(ids).catch(() => new Map());
      setProduitNoms(noms);

      const rev = await listDriveRevenueByDay({ days: 90 }).catch(() => []);
      setRevenue(rev);
      setLastUpdate(new Date());
      setNowMs(Date.now());
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Tick horloge 30s : recalcule retards/imminence sans refetch réseau.
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Subscription Supabase Realtime sur commandes_drive + lignes
  // Quand une nouvelle commande arrive (INSERT) ou change (UPDATE),
  // on re-fetch tout le bloc (commandes + revenue). Debounce 600ms
  // pour éviter les rafales sur un import en bulk.
  const refetchDebouncedRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const scheduleRefetch = useCallback(() => {
    if (refetchDebouncedRef.current) clearTimeout(refetchDebouncedRef.current);
    refetchDebouncedRef.current = setTimeout(() => {
      void refetch();
    }, 600);
  }, [refetch]);

  useEffect(() => {
    const sb = supabase();
    if (!sb) {
      setLiveStatus("offline");
      return;
    }
    const channel = sb
      .channel("v2-admin-drive")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "commandes_drive" },
        () => scheduleRefetch(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "commandes_drive_lignes" },
        () => scheduleRefetch(),
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setLiveStatus("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          setLiveStatus("offline");
      });

    // Fallback polling 20s en cas de Realtime cassé
    const poll = setInterval(() => {
      if (liveStatus !== "live") void refetch();
    }, 20_000);

    return () => {
      clearInterval(poll);
      if (refetchDebouncedRef.current)
        clearTimeout(refetchDebouncedRef.current);
      void sb.removeChannel(channel);
    };
  }, [refetch, scheduleRefetch, liveStatus]);

  // KPI par statut
  const byStatut = useMemo(() => {
    const counts: Record<CommandeDriveStatus, number> = {
      a_preparer: 0,
      en_preparation: 0,
      pret: 0,
      retire: 0,
      annule: 0,
    };
    for (const c of commandes) counts[c.statut]++;
    return counts;
  }, [commandes]);

  // CA du jour
  const todayCA = useMemo(() => {
    const today = new Date().toDateString();
    return commandes
      .filter(
        (c) =>
          c.statut !== "annule" &&
          new Date(c.created_at).toDateString() === today,
      )
      .reduce((s, c) => s + Number(c.total_ttc), 0);
  }, [commandes]);

  // Créneaux à venir (24h)
  const upcomingSlots = useMemo(() => {
    const now = Date.now();
    const tomorrow = now + 24 * 3600 * 1000;
    const byCreneau = new Map<string, CommandeAggreg[]>();
    commandes
      .filter((c) => c.statut !== "annule" && c.statut !== "retire")
      .filter((c) => {
        const t = new Date(c.creneau_retrait).getTime();
        return t >= now && t <= tomorrow;
      })
      .forEach((c) => {
        const key = c.creneau_retrait;
        const list = byCreneau.get(key) ?? [];
        list.push(c);
        byCreneau.set(key, list);
      });
    return Array.from(byCreneau.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, 5);
  }, [commandes]);

  // Suivi retrait : retards, imminences (≤30 min) et file des urgences.
  // Concerne les commandes pas encore prêtes ni retirées/annulées.
  const pickupTracking = useMemo(() => {
    const open = commandes.filter(
      (c) => c.statut === "a_preparer" || c.statut === "en_preparation",
    );
    let enRetard = 0;
    let imminent = 0;
    const urgentes = open
      .map((c) => ({ c, delta: minutesUntil(c.creneau_retrait, nowMs) }))
      .sort((a, b) => a.delta - b.delta); // plus en retard / plus urgent d'abord
    for (const { delta } of urgentes) {
      if (delta < 0) enRetard++;
      else if (delta <= IMMINENT_WINDOW_MIN) imminent++;
    }
    return {
      enRetard,
      imminent,
      urgentes: urgentes.slice(0, 5),
      hasOpen: open.length > 0,
    };
  }, [commandes, nowMs]);

  // Capacité & pilotage retraits (Otmane). Trois KPI dérivés UNIQUEMENT de
  // colonnes réellement présentes côté commandes_drive / lignes :
  //   (a) temps moyen de préparation = moyenne(max(prepare_at) - created_at)
  //       sur les commandes du jour dont la prépa est terminée (pret|retire).
  //       commandes_drive n'a pas de `pret_at` → on dérive du dernier
  //       `prepare_at` des lignes (horodatage réel de fin de prépa).
  //   (b) préparateurs actifs = nb d'employés distincts (prepare_par_employe_id)
  //       sur les lignes des commandes en_preparation. Fallback propre si
  //       aucune ligne n'est encore affectée : nb de commandes en cours.
  //   (c) taux de retrait = retire / (pret + retire) en %.
  // Tout KPI non calculable faute de donnée affiche un placeholder "-".
  const PREP_TARGET_MIN = 15;
  const capacite = useMemo(() => {
    const today = new Date().toDateString();

    // (a) Temps moyen de prépa du jour (minutes).
    const durations: number[] = [];
    for (const c of commandes) {
      if (c.statut !== "pret" && c.statut !== "retire") continue;
      if (new Date(c.created_at).toDateString() !== today) continue;
      const ends = c.lignes
        .map((l) => l.prepare_at)
        .filter((t): t is string => Boolean(t))
        .map((t) => new Date(t).getTime());
      if (ends.length === 0) continue;
      const start = new Date(c.created_at).getTime();
      const mins = (Math.max(...ends) - start) / 60_000;
      if (Number.isFinite(mins) && mins >= 0) durations.push(mins);
    }
    const avgPrepMin =
      durations.length > 0
        ? durations.reduce((s, m) => s + m, 0) / durations.length
        : null;

    // (b) Préparateurs actifs (employés distincts sur lignes en cours).
    const enPrep = commandes.filter((c) => c.statut === "en_preparation");
    const prepareurs = new Set<string>();
    for (const c of enPrep) {
      for (const l of c.lignes) {
        if (l.prepare_par_employe_id) prepareurs.add(l.prepare_par_employe_id);
      }
    }
    const preparateursActifs =
      prepareurs.size > 0 ? prepareurs.size : enPrep.length > 0 ? null : 0;
    // null = on a des commandes en cours mais aucune ligne affectée à un
    // employé identifiable → on n'invente pas, fallback sur le nb de commandes.
    const commandesEnCours = enPrep.length;

    // (c) Taux de retrait sur les commandes prêtes/retirées.
    const pret = byStatut.pret;
    const retire = byStatut.retire;
    const denom = pret + retire;
    const tauxRetrait = denom > 0 ? (retire / denom) * 100 : null;

    return {
      avgPrepMin,
      prepCount: durations.length,
      preparateursActifs,
      commandesEnCours,
      tauxRetrait,
      retire,
      denom,
    };
  }, [commandes, byStatut]);

  // Top 5 produits (par quantité totale), résolus en noms + catégorie.
  const topProduits = useMemo(() => {
    const byProduit = new Map<string, number>();
    for (const c of commandes) {
      if (c.statut === "annule") continue;
      for (const l of c.lignes) {
        byProduit.set(
          l.produit_id,
          (byProduit.get(l.produit_id) ?? 0) + Number(l.quantite),
        );
      }
    }
    return Array.from(byProduit.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([produitId, qty]) => {
        const info = produitNoms.get(produitId);
        return {
          produitId,
          qty,
          nom: info?.nom ?? null,
          categorie: info?.categorie ?? null,
        };
      });
  }, [commandes, produitNoms]);

  const recent = useMemo(
    () =>
      [...commandes]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 8),
    [commandes],
  );

  if (loading) {
    return (
      <section className="px-5 mt-5 space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="border border-rule rounded-[20px] p-5 space-y-2"
            style={{ background: "var(--surface-1)" }}
          >
            <div className="skeleton h-3 w-32" />
            <div className="skeleton h-6 w-24" />
          </div>
        ))}
      </section>
    );
  }

  if (commandes.length === 0) {
    return (
      <section className="px-5 mt-5">
        <div
          className="border border-rule rounded-[20px] p-5 text-center"
          style={{ background: "var(--surface-1)" }}
        >
          <ShoppingBag className="w-8 h-8 text-text-tertiary mx-auto mb-3" />
          <p className="text-sm font-bold text-text-primary">
            Pas encore de commande drive
          </p>
          <p className="text-xs text-text-secondary mt-1.5 max-w-[280px] mx-auto">
            Les commandes passées sur Salamarket Drive apparaîtront ici
            automatiquement.
          </p>
        </div>
      </section>
    );
  }

  const liveLabel =
    liveStatus === "live"
      ? "Temps réel"
      : liveStatus === "connecting"
        ? "Connexion…"
        : "Polling 20s";
  const liveDotColor =
    liveStatus === "live"
      ? "var(--success)"
      : liveStatus === "connecting"
        ? "var(--warning)"
        : "var(--text-tertiary)";
  const sinceUpdate = Math.floor((Date.now() - lastUpdate.getTime()) / 1000);

  return (
    <>
      {/* CHART CA Drive : courbe néon violet */}
      <section className="px-5 mt-5">
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-[11px] inline-flex items-center gap-1.5 font-bold uppercase tracking-wide text-text-secondary">
            <span className="relative inline-flex">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: liveDotColor }}
              />
              {liveStatus === "live" && (
                <span
                  className="absolute inset-0 w-2 h-2 rounded-full animate-ping"
                  style={{ background: liveDotColor, opacity: 0.55 }}
                />
              )}
            </span>
            {liveLabel}
          </p>
          <p className="text-[10.5px] text-text-tertiary tabular">
            {sinceUpdate < 5
              ? "à l'instant"
              : sinceUpdate < 60
                ? `il y a ${sinceUpdate}s`
                : `il y a ${Math.floor(sinceUpdate / 60)} min`}
          </p>
        </div>
        <DriveRevenueChart data={revenue} initialPeriod={30} />
      </section>

      {/* KPI ligne */}
      <section className="px-5 mt-5">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 0.61, 0.36, 1] }}
          className="border border-rule rounded-[20px] p-5 shadow-card"
          style={{ background: "var(--surface-1)" }}
        >
          <p className="section-eyebrow">
            <TrendingUp className="w-3 h-3" />
            Drive aujourd&apos;hui
          </p>
          <p className="text-[28px] font-extrabold tracking-tight text-text-primary mt-1.5 tabular leading-none">
            {formatEUR(todayCA)}
          </p>
          <p className="text-[12px] text-text-secondary mt-1">
            {byStatut.en_preparation + byStatut.pret} commande
            {byStatut.en_preparation + byStatut.pret > 1 ? "s" : ""} active
            {byStatut.en_preparation + byStatut.pret > 1 ? "s" : ""}
          </p>
          <div className="grid grid-cols-4 gap-2 mt-4">
            {(Object.keys(STATUT_META) as CommandeDriveStatus[]).map((s) => {
              const meta = STATUT_META[s];
              const Icon = meta.icon;
              return (
                <div key={s} className="text-center">
                  <span
                    className={`inline-flex w-9 h-9 rounded-xl items-center justify-center ${meta.bg} ${meta.fg} mb-1`}
                  >
                    <Icon className="w-4 h-4" strokeWidth={2.2} />
                  </span>
                  <p className="text-[15px] font-extrabold text-text-primary tabular leading-none">
                    {byStatut[s]}
                  </p>
                  <p className="text-[9.5px] text-text-tertiary uppercase tracking-wide font-bold mt-1 leading-tight">
                    {meta.label}
                  </p>
                </div>
              );
            })}
          </div>
        </motion.div>
      </section>

      {/* Suivi retrait : retard / imminence (SLA) */}
      <section className="px-5 mt-7">
        <p className="section-eyebrow mb-3">
          <Timer className="w-3 h-3" />
          En retard &amp; à venir
        </p>
        <div
          className="border border-rule rounded-[20px] p-5 shadow-card"
          style={{ background: "var(--surface-1)" }}
        >
          {/* Chips compteurs */}
          <div className="flex flex-wrap items-center gap-2">
            {pickupTracking.enRetard > 0 ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-extrabold tabular"
                style={{
                  background: "var(--danger-soft)",
                  color: "var(--danger)",
                }}
              >
                <AlertTriangle className="w-3.5 h-3.5" strokeWidth={2.4} />
                {pickupTracking.enRetard} en retard
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold"
                style={{
                  background: "var(--success-soft)",
                  color: "var(--success)",
                }}
              >
                <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2.4} />
                Aucun retard
              </span>
            )}
            {pickupTracking.imminent > 0 && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-extrabold tabular"
                style={{
                  background: "var(--accent-gold-soft)",
                  color: "var(--accent-gold)",
                }}
              >
                <Clock className="w-3.5 h-3.5" strokeWidth={2.4} />
                {pickupTracking.imminent} imminente
                {pickupTracking.imminent > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* File des urgences */}
          {pickupTracking.urgentes.length > 0 ? (
            <ul className="mt-3.5 -mb-1 divide-y divide-rule">
              {pickupTracking.urgentes.map(({ c, delta }) => {
                const late = delta < 0;
                const imminent = !late && delta <= IMMINENT_WINDOW_MIN;
                const tone = late
                  ? "var(--danger)"
                  : imminent
                    ? "var(--accent-gold)"
                    : "var(--text-secondary)";
                return (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 py-2.5 first:pt-0"
                  >
                    <span
                      className="inline-flex w-8 h-8 rounded-lg items-center justify-center shrink-0"
                      style={{
                        background: late
                          ? "var(--danger-soft)"
                          : imminent
                            ? "var(--accent-gold-soft)"
                            : "var(--surface-2)",
                        color: tone,
                      }}
                    >
                      {late ? (
                        <AlertTriangle className="w-4 h-4" strokeWidth={2.2} />
                      ) : (
                        <Clock className="w-4 h-4" strokeWidth={2.2} />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-text-primary leading-tight truncate">
                        {c.numero_commande}
                      </p>
                      <p className="text-[11px] text-text-secondary mt-0.5 truncate">
                        {c.client_nom}
                      </p>
                    </div>
                    <p
                      className="text-[12.5px] font-extrabold tabular shrink-0 text-right"
                      style={{ color: tone }}
                    >
                      {formatDelta(delta)}
                    </p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[12px] text-text-secondary mt-3">
              {pickupTracking.hasOpen
                ? "Toutes les commandes en cours sont dans les temps."
                : "Aucune commande en cours de préparation."}
            </p>
          )}
        </div>
      </section>

      {/* Capacité & retraits : pilotage charge prépa (Otmane). */}
      <section className="px-5 mt-7">
        <p className="section-eyebrow mb-3">
          <Gauge className="w-3 h-3" />
          Capacité &amp; retraits
        </p>
        <div
          className="border border-rule rounded-[20px] p-5 shadow-card"
          style={{ background: "var(--surface-1)" }}
        >
          <div className="grid grid-cols-3 gap-3">
            {/* (a) Temps moyen de préparation vs cible 15 min */}
            <div className="text-center">
              <span
                className="inline-flex w-9 h-9 rounded-xl items-center justify-center mb-1.5"
                style={{
                  background:
                    capacite.avgPrepMin === null
                      ? "var(--surface-2)"
                      : capacite.avgPrepMin <= PREP_TARGET_MIN
                        ? "var(--success-soft)"
                        : "var(--warning-soft)",
                  color:
                    capacite.avgPrepMin === null
                      ? "var(--text-tertiary)"
                      : capacite.avgPrepMin <= PREP_TARGET_MIN
                        ? "var(--success)"
                        : "var(--warning)",
                }}
              >
                <Timer className="w-4 h-4" strokeWidth={2.2} />
              </span>
              <p
                className="text-[19px] font-extrabold tabular leading-none text-text-primary"
                style={
                  capacite.avgPrepMin === null
                    ? undefined
                    : {
                        color:
                          capacite.avgPrepMin <= PREP_TARGET_MIN
                            ? "var(--success)"
                            : "var(--warning)",
                      }
                }
              >
                {capacite.avgPrepMin === null
                  ? "-"
                  : `${Math.round(capacite.avgPrepMin)} min`}
              </p>
              <p className="text-[9.5px] text-text-tertiary uppercase tracking-wide font-bold mt-1 leading-tight">
                Prépa moy.
              </p>
              <p className="text-[10px] text-text-secondary mt-0.5 tabular leading-tight">
                {capacite.avgPrepMin === null
                  ? "aucune prépa terminée"
                  : `cible ${PREP_TARGET_MIN} min · ${capacite.prepCount} cmd`}
              </p>
            </div>

            {/* (b) Préparateurs actifs (employés distincts en cours) */}
            <div className="text-center">
              <span
                className="inline-flex w-9 h-9 rounded-xl items-center justify-center mb-1.5"
                style={{
                  background: "var(--primary-green-soft)",
                  color: "var(--text-primary)",
                }}
              >
                <Users className="w-4 h-4" strokeWidth={2.2} />
              </span>
              <p className="text-[19px] font-extrabold tabular leading-none text-text-primary">
                {capacite.preparateursActifs ?? "-"}
              </p>
              <p className="text-[9.5px] text-text-tertiary uppercase tracking-wide font-bold mt-1 leading-tight">
                Préparateurs
              </p>
              <p className="text-[10px] text-text-secondary mt-0.5 tabular leading-tight">
                {capacite.preparateursActifs === null
                  ? `${capacite.commandesEnCours} cmd en cours`
                  : capacite.preparateursActifs === 0
                    ? "aucune prépa active"
                    : `${capacite.commandesEnCours} cmd en cours`}
              </p>
            </div>

            {/* (c) Taux de retrait = retire / (pret + retire) */}
            <div className="text-center">
              <span
                className="inline-flex w-9 h-9 rounded-xl items-center justify-center mb-1.5"
                style={{
                  background: "var(--accent-gold-soft)",
                  color: "var(--accent-gold)",
                }}
              >
                <PackageOpen className="w-4 h-4" strokeWidth={2.2} />
              </span>
              <p className="text-[19px] font-extrabold tabular leading-none text-text-primary">
                {capacite.tauxRetrait === null
                  ? "-"
                  : `${Math.round(capacite.tauxRetrait)} %`}
              </p>
              <p className="text-[9.5px] text-text-tertiary uppercase tracking-wide font-bold mt-1 leading-tight">
                Taux retrait
              </p>
              <p className="text-[10px] text-text-secondary mt-0.5 tabular leading-tight">
                {capacite.tauxRetrait === null
                  ? "aucune commande prête"
                  : `${capacite.retire}/${capacite.denom} retirées`}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Créneaux à venir 24h */}
      {upcomingSlots.length > 0 && (
        <section className="px-5 mt-7">
          <p className="section-eyebrow mb-3">
            <Clock className="w-3 h-3" />
            Créneaux 24h
          </p>
          <div
            className="border border-rule rounded-[20px] divide-y divide-rule overflow-hidden"
            style={{ background: "var(--surface-1)" }}
          >
            {upcomingSlots.map(([creneau, cmds]) => {
              const total = cmds.reduce((s, c) => s + Number(c.total_ttc), 0);
              return (
                <div
                  key={creneau}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <span className="inline-flex w-9 h-9 rounded-xl bg-gold-soft text-primary-dark items-center justify-center shrink-0">
                    <Clock className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-text-primary leading-tight">
                      {formatCreneau(creneau)}
                    </p>
                    <p className="text-[11px] text-text-secondary mt-0.5">
                      {cmds.length} commande{cmds.length > 1 ? "s" : ""}
                    </p>
                  </div>
                  <p className="text-[14px] font-extrabold text-primary tabular shrink-0">
                    {formatEUR(total)}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Top produits */}
      {topProduits.length > 0 && (
        <section className="px-5 mt-7">
          <p className="section-eyebrow mb-3">
            <ShoppingBag className="w-3 h-3" />
            Top 5 produits commandés
          </p>
          <div
            className="border border-rule rounded-[20px] divide-y divide-rule overflow-hidden"
            style={{ background: "var(--surface-1)" }}
          >
            {topProduits.map(({ produitId, qty, nom, categorie }, idx) => (
              <div
                key={produitId}
                className="flex items-center gap-3 px-4 py-3"
              >
                <span
                  className={`inline-flex w-7 h-7 rounded-full items-center justify-center text-[12px] font-extrabold ${
                    idx === 0
                      ? "bg-primary text-text-ondark"
                      : "bg-cream text-text-primary"
                  } tabular shrink-0`}
                >
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-text-primary leading-tight truncate">
                    {nom ?? `Produit ${produitId.slice(0, 8)}`}
                  </p>
                  {categorie && (
                    <p className="text-[11px] text-text-secondary mt-0.5 truncate">
                      {categorie}
                    </p>
                  )}
                </div>
                <p className="text-[14px] font-extrabold text-primary tabular shrink-0">
                  &times;{qty}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Commandes récentes */}
      <section className="px-5 mt-7 mb-2">
        <p className="section-eyebrow mb-3">
          <AlertCircle className="w-3 h-3" />
          Commandes récentes
        </p>
        <div
          className="border border-rule rounded-[20px] divide-y divide-rule overflow-hidden"
          style={{ background: "var(--surface-1)" }}
        >
          {recent.map((c) => {
            const meta = STATUT_META[c.statut];
            const Icon = meta.icon;
            return (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={`inline-flex w-9 h-9 rounded-xl items-center justify-center ${meta.bg} ${meta.fg} shrink-0`}
                >
                  <Icon className="w-4 h-4" strokeWidth={2.2} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-text-primary leading-tight truncate">
                    {c.numero_commande}
                  </p>
                  <p className="text-[11px] text-text-secondary mt-0.5 truncate">
                    {c.client_nom} · {meta.label.toLowerCase()}
                  </p>
                </div>
                <p className="text-[13px] font-extrabold text-text-primary tabular shrink-0">
                  {formatEUR(Number(c.total_ttc))}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
