/**
 * GET /api/cockpit/snapshot?depot_id=<uuid>
 *
 * Le endpoint matin d'Otmane. Un appel réseau → 6 zones de données :
 *
 *   1. ventes_hier      : MV mv_ventes_quotidiennes pour J-1 (vs target)
 *   2. ventes_n1        : même jour semaine N-1 (pour le delta %)
 *   3. dlc_alerts       : v_dlc_alerts (niveau ≠ ok), TOP 14 + valeur €
 *   4. stockout         : v_stockout_critiques (tier crit/blocker/out), TOP 8
 *   5. casse_24h        : sorties_stock type casse_* sur la veille soir (18h→fermeture)
 *   6. competitor_intel : 5 derniers relevés Aya Market (prix + photo)
 *   + hijri_context (calculé in-memory à partir de lib/hijri)
 *
 * Tout est servi en parallèle (Promise.all) pour rester sous 300ms.
 * Fallback dégradé : si la MV n'est pas refresh (par ex avant le premier
 * cron 02h), on fallback sur un select live sur ventes_cashmag_import.
 *
 * AUTH (HOTFIX vague 7) : require x-internal-secret. La donnée est interne
 * staff (CA hier, top stockouts, casse, competitor intel) — pas dispo
 * publiquement. Le PIN au niveau page protégeait l'UI, mais pas la route.
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getHijriContext, getSalutation } from "@/lib/hijri";
import { normalizeRemiseDlc } from "@/lib/dlc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─── Types renvoyés au client ─────────────────────────────────────
export interface CockpitVentesJour {
  jour: string; // YYYY-MM-DD
  ca_ttc: number; // €
  nb_tickets: number;
  panier_moyen: number | null;
  target_ca: number | null;
  pct_target: number | null; // ca_ttc / target_ca * 100
}

export interface CockpitDlcRow {
  lot_id: string;
  produit_id: string;
  produit_nom: string;
  jours_restants: number;
  niveau_alerte: "forcé" | "critique" | "attention" | "surveillance" | "ok";
  remise_suggeree_pct: number;
  quantite_recue: number | null;
  valeur_remise_estimee_eur: number; // qte * remise% * 8€ prox moyen
}

export interface CockpitStockoutRow {
  produit_id: string;
  produit_nom: string;
  depot_nom: string;
  stock_actuel: number;
  days_cover: number | null;
  tier: "warn" | "crit" | "blocker" | "out";
  phase_courante: string;
  multiplicateur: number;
  reason: string | null;
}

export interface CockpitCasseSoiree {
  total_eur_24h: number;
  total_eur_7j_avg: number; // moyenne 7j même tranche horaire (pour delta %)
  delta_pct: number | null; // (24h - 7j_avg) / 7j_avg * 100
  top_categorie: string | null;
  nb_evenements: number;
}

export interface CockpitCompetitorRow {
  id: string;
  libelle_releve: string;
  prix_releve_eur: number;
  unite: string | null;
  photo_url: string | null;
  releve_le: string;
  notes: string | null;
  // HOTFIX-VAGUE7 : champs dynamiques pour CompetitorCard
  concurrent_nom: string; // 'Aya Market' par défaut, peut varier
  prix_salam_eur: number | null; // prix Drive du produit Salam pour calcul delta
  delta_pct: number | null; // (releve - salam) / salam * 100 (positif = concurrent + cher)
}

// ─── Activité staff : leaderboard préparateurs + heatmap ventes ───
// V8 — agrégats pour /v2/admin/activite (Leaderboard + HeatmapVentes).
// Calculés sans migration à partir de :
//   - commandes_drive_lignes (prepare_par_employe_id, prepare_at, pese_at)
//     joints aux commandes (creneau_retrait) pour la ponctualité ;
//   - ventes_cashmag_import (date_vente, heure_vente) pour la heatmap.
export interface CockpitPreparateurRow {
  employe_id: string;
  prenom: string;
  nom: string;
  lignes_preparees: number; // cadence brute sur la fenêtre
  ponctuel: number; // lignes préparées AVANT le créneau de retrait
  en_retard: number; // lignes préparées APRÈS le créneau
  ponctualite_pct: number | null; // ponctuel / (ponctuel + retard) * 100
}

export interface CockpitLeaderboard {
  fenetre_jours: number; // profondeur d'analyse (ex. 14)
  total_lignes: number;
  top: CockpitPreparateurRow[];
}

export interface CockpitHeatmapCell {
  jour_semaine: number; // 0 = lundi … 6 = dimanche (ISO décalé)
  heure: number; // 0..23
  ca_eur: number;
  nb_lignes: number;
}

export interface CockpitHeatmap {
  fenetre_jours: number;
  ca_total_eur: number;
  pic_heure: number | null; // heure de CA max (tous jours confondus)
  cells: CockpitHeatmapCell[]; // uniquement les cellules non vides
}

export interface CockpitSnapshot {
  generated_at: string;
  salutation: string;
  hijri: {
    message: string;
    en_cours: boolean;
    prochain_libelle: string | null;
    jours_jusqua: number | null;
    impact_ca: "faible" | "moyen" | "fort" | "critique" | null;
  };
  ventes_hier: CockpitVentesJour | null;
  ventes_n1: CockpitVentesJour | null;
  delta_n1_pct: number | null;
  dlc: {
    count_total: number;
    count_critique: number;
    valeur_eur: number;
    top: CockpitDlcRow[];
  };
  stockout: {
    count_total: number;
    count_out: number;
    top: CockpitStockoutRow[];
  };
  casse_24h: CockpitCasseSoiree | null;
  competitor: CockpitCompetitorRow[];
  leaderboard: CockpitLeaderboard | null;
  heatmap: CockpitHeatmap | null;
  warnings: string[]; // ex: ["MV pas rafraîchie", "Pas de target défini"]
}

// ─── Helpers ──────────────────────────────────────────────────────
function yesterdayIsoParis(today: Date = new Date()): string {
  const parisStr = today.toLocaleString("en-US", { timeZone: "Europe/Paris" });
  const paris = new Date(parisStr);
  paris.setDate(paris.getDate() - 1);
  return paris.toISOString().slice(0, 10);
}

function sameDayLastWeekIso(today: Date = new Date()): string {
  const parisStr = today.toLocaleString("en-US", { timeZone: "Europe/Paris" });
  const paris = new Date(parisStr);
  paris.setDate(paris.getDate() - 8); // J-1 N-1 = J-8
  return paris.toISOString().slice(0, 10);
}

// ─── Handler ──────────────────────────────────────────────────────
export async function GET(req: Request) {
  // ─── AUTH : header x-internal-secret obligatoire (HOTFIX vague 7) ────
  // Caller : server action loadCockpitSnapshot (lib/actions/cockpit.ts)
  // qui ajoute le secret côté serveur. Bloque les scans externes.
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) {
    console.error(
      "[cockpit/snapshot] INTERNAL_API_SECRET non configuré, refus.",
    );
    return NextResponse.json(
      { error: "cockpit snapshot misconfigured (INTERNAL_API_SECRET missing)" },
      { status: 503 },
    );
  }
  const provided = req.headers.get("x-internal-secret");
  if (provided !== internalSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const depotId = url.searchParams.get("depot_id");
  const warnings: string[] = [];
  const generatedAt = new Date().toISOString();

  // Pas d'env Supabase ? On renvoie un snapshot minimal avec juste le hijri
  // (le cockpit reste démontrable hors-ligne en mode local-seed).
  let sb;
  try {
    sb = supabaseServer();
  } catch (e) {
    const hijri = getHijriContext();
    const empty: CockpitSnapshot = {
      generated_at: generatedAt,
      salutation: getSalutation(),
      hijri: {
        message: hijri.message,
        en_cours: hijri.en_cours,
        prochain_libelle: hijri.prochain?.libelle ?? null,
        jours_jusqua: hijri.jours_jusqua,
        impact_ca: hijri.prochain?.impact_ca ?? null,
      },
      ventes_hier: null,
      ventes_n1: null,
      delta_n1_pct: null,
      dlc: { count_total: 0, count_critique: 0, valeur_eur: 0, top: [] },
      stockout: { count_total: 0, count_out: 0, top: [] },
      casse_24h: null,
      competitor: [],
      leaderboard: null,
      heatmap: null,
      warnings: [
        "Supabase non configuré — snapshot dégradé. " +
          (e instanceof Error ? e.message : ""),
      ],
    };
    return NextResponse.json(empty, {
      headers: { "cache-control": "private, max-age=15" },
    });
  }

  const jourHier = yesterdayIsoParis();
  const jourN1 = sameDayLastWeekIso();

  // V8 — fenêtre d'analyse activité staff (leaderboard + heatmap).
  const ACTIVITE_FENETRE_JOURS = 14;
  const activiteDepuis = (() => {
    const d = new Date();
    d.setDate(d.getDate() - ACTIVITE_FENETRE_JOURS);
    return d;
  })();
  const activiteDepuisIso = activiteDepuis.toISOString();
  const activiteDepuisDate = activiteDepuisIso.slice(0, 10);

  // Run all queries in parallel — c'est la promesse "30s morning brief".
  const [
    ventesHierRes,
    ventesN1Res,
    targetRes,
    dlcRes,
    stockoutRes,
    casseRes,
    casseBaselineRes,
    competitorRes,
    prepLignesRes,
    employesRes,
    heatmapRes,
  ] = await Promise.allSettled([
    // 1. CA hier — mv_ventes_quotidiennes est CONSOLIDÉE (pas de colonne
    //    depot_id : le breakdown par dépôt est un TODO côté MV). Filtrer par
    //    depot_id provoquait une erreur SQL → CA vide quand un dépôt était
    //    sélectionné. On sert donc le CA tous dépôts confondus.
    sb
      .from("mv_ventes_quotidiennes")
      .select("*")
      .eq("jour", jourHier)
      .maybeSingle(),
    // 2. CA N-1 (idem, consolidé)
    sb
      .from("mv_ventes_quotidiennes")
      .select("*")
      .eq("jour", jourN1)
      .maybeSingle(),
    // 3. Target J-1
    depotId
      ? sb
          .from("cockpit_targets")
          .select("target_ca")
          .eq("jour", jourHier)
          .eq("depot_id", depotId)
          .maybeSingle()
      : sb
          .from("cockpit_targets")
          .select("target_ca")
          .eq("jour", jourHier)
          .maybeSingle(),
    // 4. DLC alerts
    sb
      .from("v_dlc_alerts")
      .select(
        "lot_id, produit_id, produit_nom, jours_restants, niveau_alerte, remise_suggeree_pct, quantite_recue",
      )
      .neq("niveau_alerte", "ok")
      .order("jours_restants", { ascending: true })
      .limit(60),
    // 5. Stockout (filtered to depot if provided)
    depotId
      ? sb
          .from("v_stockout_critiques")
          .select("*")
          .eq("depot_id", depotId)
          .limit(20)
      : sb.from("v_stockout_critiques").select("*").limit(20),
    // 6. Casse 24h (sortie type casse_* sur veille >= 18h)
    (() => {
      const startVeilleSoir = `${jourHier}T18:00:00`;
      const endVeille = `${jourHier}T23:59:59`;
      let q = sb
        .from("sorties_stock")
        .select(
          "id, type, quantite, produit_id, depot_id, created_at, produit:produits(nom, categorie, prix_vente_ttc)",
        )
        .in("type", [
          "casse_manipulation",
          "casse_client",
          "perime_dlc",
          "perime_ddm",
          "defaut_fournisseur",
        ])
        .gte("created_at", startVeilleSoir)
        .lte("created_at", endVeille);
      if (depotId) q = q.eq("depot_id", depotId);
      return q;
    })(),
    // 7. Baseline 7j même tranche (18-24h) → moyenne par soirée
    (() => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      let q = sb
        .from("sorties_stock")
        .select("id, quantite, produit:produits(prix_vente_ttc), created_at")
        .in("type", [
          "casse_manipulation",
          "casse_client",
          "perime_dlc",
          "perime_ddm",
          "defaut_fournisseur",
        ])
        .gte("created_at", sevenDaysAgo.toISOString());
      if (depotId) q = q.eq("depot_id", depotId);
      return q;
    })(),
    // 8. Competitor intel — HOTFIX-VAGUE7 : on JOIN produits pour avoir
    //    le prix Salam (prix_drive_cents) et le concurrent_nom, ce qui
    //    permet à CompetitorCard d'afficher dynamiquement le delta %.
    sb
      .from("competitor_intel")
      .select(
        "id, libelle_releve, prix_releve_eur, unite, photo_url, releve_le, notes, concurrent_nom, produit_id, produit:produits(id, prix_drive_cents)",
      )
      .order("releve_le", { ascending: false })
      .limit(5),
    // 9. V8 — lignes Drive préparées sur la fenêtre (leaderboard préparateurs).
    //    On JOIN la commande pour récupérer creneau_retrait (ponctualité).
    sb
      .from("commandes_drive_lignes")
      .select(
        "id, prepare_par_employe_id, prepare_at, pese_at, commande:commandes_drive(creneau_retrait)",
      )
      .not("prepare_par_employe_id", "is", null)
      .not("prepare_at", "is", null)
      .gte("prepare_at", activiteDepuisIso)
      .limit(5000),
    // 10. V8 — annuaire employés (pour afficher prénom/nom dans le leaderboard).
    sb.from("employes").select("id, prenom, nom"),
    // 11. V8 — ventes magasin sur la fenêtre (heatmap horaire jour×heure).
    sb
      .from("ventes_cashmag_import")
      .select("date_vente, heure_vente, prix_ttc, quantite")
      .gte("date_vente", activiteDepuisDate)
      .limit(20000),
  ]);

  // ─── Process ventes_hier ────────────────────────────────────────
  let ventesHier: CockpitVentesJour | null = null;
  let target: number | null = null;
  if (
    ventesHierRes.status === "fulfilled" &&
    !ventesHierRes.value.error &&
    ventesHierRes.value.data
  ) {
    const v = ventesHierRes.value.data as {
      jour: string;
      ca_ttc: number | string;
      nb_tickets: number;
      panier_moyen: number | string | null;
    };
    ventesHier = {
      jour: v.jour,
      ca_ttc: Number(v.ca_ttc),
      nb_tickets: Number(v.nb_tickets),
      panier_moyen: v.panier_moyen === null ? null : Number(v.panier_moyen),
      target_ca: null,
      pct_target: null,
    };
  } else if (
    ventesHierRes.status === "rejected" ||
    ventesHierRes.value?.error
  ) {
    warnings.push(
      "MV ventes quotidiennes inaccessible — relancer le cron refresh-cockpit-cache",
    );
  }

  if (
    targetRes.status === "fulfilled" &&
    !targetRes.value.error &&
    targetRes.value.data
  ) {
    target = Number(
      (targetRes.value.data as { target_ca: number | string }).target_ca,
    );
    if (ventesHier) {
      ventesHier.target_ca = target;
      ventesHier.pct_target =
        target > 0
          ? Math.round((ventesHier.ca_ttc / target) * 1000) / 10
          : null;
    }
  } else if (ventesHier) {
    warnings.push(
      "Pas de target CA défini pour hier — pourcentage non calculable",
    );
  }

  // ─── Process ventes_n1 ──────────────────────────────────────────
  let ventesN1: CockpitVentesJour | null = null;
  if (
    ventesN1Res.status === "fulfilled" &&
    !ventesN1Res.value.error &&
    ventesN1Res.value.data
  ) {
    const v = ventesN1Res.value.data as {
      jour: string;
      ca_ttc: number | string;
      nb_tickets: number;
      panier_moyen: number | string | null;
    };
    ventesN1 = {
      jour: v.jour,
      ca_ttc: Number(v.ca_ttc),
      nb_tickets: Number(v.nb_tickets),
      panier_moyen: v.panier_moyen === null ? null : Number(v.panier_moyen),
      target_ca: null,
      pct_target: null,
    };
  }

  const deltaN1Pct =
    ventesHier && ventesN1 && ventesN1.ca_ttc > 0
      ? Math.round(
          ((ventesHier.ca_ttc - ventesN1.ca_ttc) / ventesN1.ca_ttc) * 1000,
        ) / 10
      : null;

  // ─── Process DLC ────────────────────────────────────────────────
  type DlcInputRow = {
    lot_id: string;
    produit_id: string;
    produit_nom: string;
    jours_restants: number;
    niveau_alerte: CockpitDlcRow["niveau_alerte"];
    remise_suggeree_pct: number;
    quantite_recue: number | null;
  };
  let dlcRows: CockpitDlcRow[] = [];
  let dlcValeur = 0;
  let dlcCountCritique = 0;
  if (dlcRes.status === "fulfilled" && !dlcRes.value.error) {
    const raw = (dlcRes.value.data ?? []) as DlcInputRow[];
    // BUG-018 — normalise la remise (FORCÉ → ≥50%, CRITIQUE → ≥40%,
    // ATTENTION → ≥20%) avant TOUT calcul, sinon la valeur de démarque
    // estimée tombe à 0€ quand la vue SQL ne trouve pas de rule
    // matchante pour la catégorie du produit.
    const rawNormalized = raw.map((r) => ({
      ...r,
      remise_suggeree_pct: normalizeRemiseDlc(
        r.niveau_alerte,
        r.remise_suggeree_pct,
      ),
    }));
    dlcRows = rawNormalized.slice(0, 14).map((r) => {
      const valeur =
        (r.quantite_recue ?? 0) * (r.remise_suggeree_pct / 100) * 8;
      return {
        lot_id: r.lot_id,
        produit_id: r.produit_id,
        produit_nom: r.produit_nom,
        jours_restants: Number(r.jours_restants),
        niveau_alerte: r.niveau_alerte,
        remise_suggeree_pct: Number(r.remise_suggeree_pct),
        quantite_recue: r.quantite_recue,
        valeur_remise_estimee_eur: Math.round(valeur * 100) / 100,
      };
    });
    // Totaux calculés sur le full set normalisé (pas que le top 14).
    dlcValeur = 0;
    dlcCountCritique = 0;
    for (const r of rawNormalized) {
      dlcValeur += (r.quantite_recue ?? 0) * (r.remise_suggeree_pct / 100) * 8;
      if (r.niveau_alerte === "critique" || r.niveau_alerte === "forcé")
        dlcCountCritique += 1;
    }
  } else if (dlcRes.status === "rejected" || dlcRes.value?.error) {
    warnings.push("v_dlc_alerts non disponible (vérifier migration 0032)");
  }

  // ─── Process stockout ──────────────────────────────────────────
  type StockoutInput = {
    produit_id: string;
    produit_nom: string;
    depot_nom: string;
    stock_actuel: number | string;
    days_cover: number | string | null;
    tier: "warn" | "crit" | "blocker" | "out";
    phase_courante: string;
    multiplicateur: number | string;
    reason: string | null;
  };
  let stockoutRows: CockpitStockoutRow[] = [];
  let stockoutOut = 0;
  let stockoutTotal = 0;
  if (stockoutRes.status === "fulfilled" && !stockoutRes.value.error) {
    const raw = (stockoutRes.value.data ?? []) as StockoutInput[];
    stockoutTotal = raw.length;
    stockoutOut = raw.filter(
      (r) => r.tier === "out" || r.tier === "blocker",
    ).length;
    stockoutRows = raw.slice(0, 8).map((r) => ({
      produit_id: r.produit_id,
      produit_nom: r.produit_nom,
      depot_nom: r.depot_nom,
      stock_actuel: Number(r.stock_actuel),
      days_cover: r.days_cover === null ? null : Number(r.days_cover),
      tier: r.tier,
      phase_courante: r.phase_courante,
      multiplicateur: Number(r.multiplicateur),
      reason: r.reason,
    }));
  } else if (stockoutRes.status === "rejected" || stockoutRes.value?.error) {
    warnings.push(
      "v_stockout_critiques non disponible (vérifier migration 0035)",
    );
  }

  // ─── Process casse 24h ─────────────────────────────────────────
  // NB : Supabase renvoie une jointure `produit` en TABLEAU (foreign-key
  // typing par défaut), même quand 1 seule ligne. On extrait [0].
  let casse24h: CockpitCasseSoiree | null = null;
  if (casseRes.status === "fulfilled" && !casseRes.value.error) {
    type CasseProduit = {
      nom: string;
      categorie: string | null;
      prix_vente_ttc: number | string | null;
    };
    type CasseRow = {
      type: string;
      quantite: number | string;
      produit: CasseProduit | CasseProduit[] | null;
    };
    const raw = (casseRes.value.data ?? []) as unknown as CasseRow[];
    let total = 0;
    const catTotals = new Map<string, number>();
    for (const r of raw) {
      const p = Array.isArray(r.produit) ? (r.produit[0] ?? null) : r.produit;
      const prix = Number(p?.prix_vente_ttc ?? 0);
      const v = Number(r.quantite) * prix;
      total += v;
      const cat = p?.categorie ?? "Autre";
      catTotals.set(cat, (catTotals.get(cat) ?? 0) + v);
    }
    let topCat: string | null = null;
    let topVal = 0;
    for (const [c, v] of catTotals.entries()) {
      if (v > topVal) {
        topVal = v;
        topCat = c;
      }
    }
    // Baseline 7j moyenne
    let avg7j = 0;
    if (
      casseBaselineRes.status === "fulfilled" &&
      !casseBaselineRes.value.error
    ) {
      type BaseProduit = { prix_vente_ttc: number | string | null };
      type BaseRow = {
        quantite: number | string;
        produit: BaseProduit | BaseProduit[] | null;
        created_at: string;
      };
      const baseRaw = (casseBaselineRes.value.data ??
        []) as unknown as BaseRow[];
      // On garde uniquement les events 18-24h, on agrège par jour, on moyenne
      const perDay = new Map<string, number>();
      for (const r of baseRaw) {
        const dt = new Date(r.created_at);
        const h = dt.getHours();
        if (h < 18 || h > 23) continue;
        const jour = r.created_at.slice(0, 10);
        const p = Array.isArray(r.produit) ? (r.produit[0] ?? null) : r.produit;
        const v = Number(r.quantite) * Number(p?.prix_vente_ttc ?? 0);
        perDay.set(jour, (perDay.get(jour) ?? 0) + v);
      }
      const days = [...perDay.values()];
      avg7j =
        days.length > 0 ? days.reduce((a, b) => a + b, 0) / days.length : 0;
    }
    const delta =
      avg7j > 0 ? Math.round(((total - avg7j) / avg7j) * 1000) / 10 : null;
    casse24h = {
      total_eur_24h: Math.round(total * 100) / 100,
      total_eur_7j_avg: Math.round(avg7j * 100) / 100,
      delta_pct: delta,
      top_categorie: topCat,
      nb_evenements: raw.length,
    };
  }

  // ─── Process competitor ────────────────────────────────────────
  // HOTFIX-VAGUE7 : calcule prix_salam_eur (depuis produits.prix_drive_cents
  // récupéré via le JOIN), puis delta_pct = (releve - salam) / salam * 100.
  // Positif → concurrent plus cher → on est compétitif sur ce produit.
  // Négatif → concurrent moins cher → menace pricing à surveiller.
  type CompetitorRaw = {
    id: string;
    libelle_releve: string;
    prix_releve_eur: number | string;
    unite: string | null;
    photo_url: string | null;
    releve_le: string;
    notes: string | null;
    concurrent_nom: string | null;
    produit_id: string | null;
    produit:
      | { id: string; prix_drive_cents: number | null }
      | { id: string; prix_drive_cents: number | null }[]
      | null;
  };
  let competitor: CockpitCompetitorRow[] = [];
  if (competitorRes.status === "fulfilled" && !competitorRes.value.error) {
    const raw = (competitorRes.value.data ?? []) as unknown as CompetitorRaw[];
    competitor = raw.map((r) => {
      const releve = Number(r.prix_releve_eur);
      const produit = Array.isArray(r.produit)
        ? (r.produit[0] ?? null)
        : r.produit;
      const cents = produit?.prix_drive_cents ?? null;
      const prixSalam =
        cents !== null && cents !== undefined ? cents / 100 : null;
      const deltaPct =
        prixSalam !== null && prixSalam > 0
          ? Math.round(((releve - prixSalam) / prixSalam) * 1000) / 10
          : null;
      return {
        id: r.id,
        libelle_releve: r.libelle_releve,
        prix_releve_eur: releve,
        unite: r.unite,
        photo_url: r.photo_url,
        releve_le: r.releve_le,
        notes: r.notes,
        concurrent_nom: r.concurrent_nom || "Aya Market",
        prix_salam_eur: prixSalam,
        delta_pct: deltaPct,
      };
    });
  }

  // ─── V8 : Leaderboard préparateurs ─────────────────────────────
  // Cadence = nb de lignes préparées sur la fenêtre. Ponctualité =
  // part de lignes préparées AVANT le créneau de retrait de la commande.
  // Une ligne sans créneau (legacy) compte en cadence mais pas en
  // ponctualité (ni ponctuel ni retard). Fallback gracieux : si la table
  // ou le JOIN est absent, on renvoie null → la page masque la carte.
  let leaderboard: CockpitLeaderboard | null = null;
  if (prepLignesRes.status === "fulfilled" && !prepLignesRes.value.error) {
    type PrepRow = {
      id: string;
      prepare_par_employe_id: string | null;
      prepare_at: string | null;
      pese_at: string | null;
      commande:
        | { creneau_retrait: string | null }
        | { creneau_retrait: string | null }[]
        | null;
    };
    type EmpRow = { id: string; prenom: string | null; nom: string | null };
    const empMap = new Map<string, EmpRow>();
    if (employesRes.status === "fulfilled" && !employesRes.value.error) {
      for (const e of (employesRes.value.data ?? []) as EmpRow[]) {
        empMap.set(e.id, e);
      }
    }
    const rows = (prepLignesRes.value.data ?? []) as unknown as PrepRow[];
    const agg = new Map<
      string,
      { lignes: number; ponctuel: number; retard: number }
    >();
    for (const r of rows) {
      const empId = r.prepare_par_employe_id;
      if (!empId || !r.prepare_at) continue;
      const cur = agg.get(empId) ?? { lignes: 0, ponctuel: 0, retard: 0 };
      cur.lignes += 1;
      const cmd = Array.isArray(r.commande)
        ? (r.commande[0] ?? null)
        : r.commande;
      const creneau = cmd?.creneau_retrait ?? null;
      if (creneau) {
        const prepMs = new Date(r.prepare_at).getTime();
        const creneauMs = new Date(creneau).getTime();
        if (Number.isFinite(prepMs) && Number.isFinite(creneauMs)) {
          if (prepMs <= creneauMs) cur.ponctuel += 1;
          else cur.retard += 1;
        }
      }
      agg.set(empId, cur);
    }
    const top: CockpitPreparateurRow[] = [...agg.entries()]
      .map(([employe_id, v]) => {
        const denom = v.ponctuel + v.retard;
        const emp = empMap.get(employe_id);
        return {
          employe_id,
          prenom: emp?.prenom ?? "",
          nom: emp?.nom ?? "Préparateur",
          lignes_preparees: v.lignes,
          ponctuel: v.ponctuel,
          en_retard: v.retard,
          ponctualite_pct:
            denom > 0 ? Math.round((v.ponctuel / denom) * 1000) / 10 : null,
        };
      })
      .sort((a, b) => b.lignes_preparees - a.lignes_preparees)
      .slice(0, 12);
    leaderboard = {
      fenetre_jours: ACTIVITE_FENETRE_JOURS,
      total_lignes: rows.length,
      top,
    };
  } else if (
    prepLignesRes.status === "rejected" ||
    prepLignesRes.value?.error
  ) {
    warnings.push(
      "Leaderboard préparateurs indisponible (commandes_drive_lignes)",
    );
  }

  // ─── V8 : Heatmap horaire des ventes magasin ───────────────────
  // Grille jour-de-semaine × heure. On agrège le CA (prix_ttc * quantite)
  // par (jour ISO lundi=0, heure de heure_vente). On ne renvoie que les
  // cellules non vides (la grille pleine est reconstruite côté client).
  let heatmap: CockpitHeatmap | null = null;
  if (heatmapRes.status === "fulfilled" && !heatmapRes.value.error) {
    type VenteRow = {
      date_vente: string;
      heure_vente: string | null;
      prix_ttc: number | string | null;
      quantite: number | string | null;
    };
    const rows = (heatmapRes.value.data ?? []) as VenteRow[];
    const cellMap = new Map<string, { ca: number; nb: number }>();
    const caParHeure = new Array<number>(24).fill(0);
    let caTotal = 0;
    for (const r of rows) {
      // jour de semaine : getDay() → 0=dimanche. On décale en lundi=0.
      const d = new Date(`${r.date_vente}T00:00:00`);
      if (Number.isNaN(d.getTime())) continue;
      const js = (d.getDay() + 6) % 7; // lundi=0 … dimanche=6
      // heure_vente = "HH:MM:SS" ; si absent on ne place pas la vente.
      const hStr = r.heure_vente;
      let heure = -1;
      if (hStr && hStr.length >= 2) {
        const parsed = parseInt(hStr.slice(0, 2), 10);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 23)
          heure = parsed;
      }
      if (heure < 0) continue;
      const ca = Number(r.quantite ?? 0) * Number(r.prix_ttc ?? 0);
      const key = `${js}-${heure}`;
      const cur = cellMap.get(key) ?? { ca: 0, nb: 0 };
      cur.ca += ca;
      cur.nb += 1;
      cellMap.set(key, cur);
      caParHeure[heure] += ca;
      caTotal += ca;
    }
    let picHeure: number | null = null;
    let picVal = 0;
    for (let h = 0; h < 24; h++) {
      if (caParHeure[h] > picVal) {
        picVal = caParHeure[h];
        picHeure = h;
      }
    }
    const cells: CockpitHeatmapCell[] = [...cellMap.entries()].map(
      ([key, v]) => {
        const [js, h] = key.split("-").map((x) => parseInt(x, 10));
        return {
          jour_semaine: js,
          heure: h,
          ca_eur: Math.round(v.ca * 100) / 100,
          nb_lignes: v.nb,
        };
      },
    );
    heatmap = {
      fenetre_jours: ACTIVITE_FENETRE_JOURS,
      ca_total_eur: Math.round(caTotal * 100) / 100,
      pic_heure: picHeure,
      cells,
    };
  } else if (heatmapRes.status === "rejected" || heatmapRes.value?.error) {
    warnings.push("Heatmap ventes indisponible (ventes_cashmag_import)");
  }

  // ─── Hijri context ─────────────────────────────────────────────
  const hijri = getHijriContext();

  const snapshot: CockpitSnapshot = {
    generated_at: generatedAt,
    salutation: getSalutation(),
    hijri: {
      message: hijri.message,
      en_cours: hijri.en_cours,
      prochain_libelle: hijri.prochain?.libelle ?? null,
      jours_jusqua: hijri.jours_jusqua,
      impact_ca: hijri.prochain?.impact_ca ?? null,
    },
    ventes_hier: ventesHier,
    ventes_n1: ventesN1,
    delta_n1_pct: deltaN1Pct,
    dlc: {
      count_total:
        dlcRows.length > 0
          ? dlcRes.status === "fulfilled" && !dlcRes.value.error
            ? (dlcRes.value.data ?? []).length
            : 0
          : 0,
      count_critique: dlcCountCritique,
      valeur_eur: Math.round(dlcValeur * 100) / 100,
      top: dlcRows,
    },
    stockout: {
      count_total: stockoutTotal,
      count_out: stockoutOut,
      top: stockoutRows,
    },
    casse_24h: casse24h,
    competitor,
    leaderboard,
    heatmap,
    warnings,
  };

  return NextResponse.json(snapshot, {
    headers: { "cache-control": "private, max-age=60" },
  });
}
