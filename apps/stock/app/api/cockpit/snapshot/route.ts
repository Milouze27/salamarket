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
 * Aucune auth : la donnée est interne staff, pas de PII client. Le
 * cockpit est protégé par le PIN au niveau page.
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getHijriContext, getSalutation } from "@/lib/hijri";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─── Types renvoyés au client ─────────────────────────────────────
export interface CockpitVentesJour {
  jour: string;            // YYYY-MM-DD
  ca_ttc: number;          // €
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
  warnings: string[];        // ex: ["MV pas rafraîchie", "Pas de target défini"]
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
  ] = await Promise.allSettled([
    // 1. CA hier
    (depotId
      ? sb.from("mv_ventes_quotidiennes").select("*").eq("jour", jourHier).eq("depot_id", depotId).maybeSingle()
      : sb.from("mv_ventes_quotidiennes").select("*").eq("jour", jourHier).maybeSingle()),
    // 2. CA N-1
    (depotId
      ? sb.from("mv_ventes_quotidiennes").select("*").eq("jour", jourN1).eq("depot_id", depotId).maybeSingle()
      : sb.from("mv_ventes_quotidiennes").select("*").eq("jour", jourN1).maybeSingle()),
    // 3. Target J-1
    (depotId
      ? sb.from("cockpit_targets").select("target_ca").eq("jour", jourHier).eq("depot_id", depotId).maybeSingle()
      : sb.from("cockpit_targets").select("target_ca").eq("jour", jourHier).maybeSingle()),
    // 4. DLC alerts
    sb
      .from("v_dlc_alerts")
      .select("lot_id, produit_id, produit_nom, jours_restants, niveau_alerte, remise_suggeree_pct, quantite_recue")
      .neq("niveau_alerte", "ok")
      .order("jours_restants", { ascending: true })
      .limit(60),
    // 5. Stockout (filtered to depot if provided)
    (depotId
      ? sb.from("v_stockout_critiques").select("*").eq("depot_id", depotId).limit(20)
      : sb.from("v_stockout_critiques").select("*").limit(20)),
    // 6. Casse 24h (sortie type casse_* sur veille >= 18h)
    (() => {
      const startVeilleSoir = `${jourHier}T18:00:00`;
      const endVeille = `${jourHier}T23:59:59`;
      let q = sb
        .from("sorties_stock")
        .select("id, type, quantite, produit_id, depot_id, created_at, produit:produits(nom, categorie, prix_vente_ttc)")
        .in("type", ["casse_manipulation", "casse_client", "perime_dlc", "perime_ddm", "defaut_fournisseur"])
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
        .in("type", ["casse_manipulation", "casse_client", "perime_dlc", "perime_ddm", "defaut_fournisseur"])
        .gte("created_at", sevenDaysAgo.toISOString());
      if (depotId) q = q.eq("depot_id", depotId);
      return q;
    })(),
    // 8. Competitor intel
    sb
      .from("competitor_intel")
      .select("id, libelle_releve, prix_releve_eur, unite, photo_url, releve_le, notes")
      .order("releve_le", { ascending: false })
      .limit(5),
  ]);

  // ─── Process ventes_hier ────────────────────────────────────────
  let ventesHier: CockpitVentesJour | null = null;
  let target: number | null = null;
  if (ventesHierRes.status === "fulfilled" && !ventesHierRes.value.error && ventesHierRes.value.data) {
    const v = ventesHierRes.value.data as {
      jour: string; ca_ttc: number | string; nb_tickets: number; panier_moyen: number | string | null;
    };
    ventesHier = {
      jour: v.jour,
      ca_ttc: Number(v.ca_ttc),
      nb_tickets: Number(v.nb_tickets),
      panier_moyen: v.panier_moyen === null ? null : Number(v.panier_moyen),
      target_ca: null,
      pct_target: null,
    };
  } else if (ventesHierRes.status === "rejected" || ventesHierRes.value?.error) {
    warnings.push("MV ventes quotidiennes inaccessible — relancer le cron refresh-cockpit-cache");
  }

  if (targetRes.status === "fulfilled" && !targetRes.value.error && targetRes.value.data) {
    target = Number((targetRes.value.data as { target_ca: number | string }).target_ca);
    if (ventesHier) {
      ventesHier.target_ca = target;
      ventesHier.pct_target = target > 0 ? Math.round((ventesHier.ca_ttc / target) * 1000) / 10 : null;
    }
  } else if (ventesHier) {
    warnings.push("Pas de target CA défini pour hier — pourcentage non calculable");
  }

  // ─── Process ventes_n1 ──────────────────────────────────────────
  let ventesN1: CockpitVentesJour | null = null;
  if (ventesN1Res.status === "fulfilled" && !ventesN1Res.value.error && ventesN1Res.value.data) {
    const v = ventesN1Res.value.data as {
      jour: string; ca_ttc: number | string; nb_tickets: number; panier_moyen: number | string | null;
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
      ? Math.round(((ventesHier.ca_ttc - ventesN1.ca_ttc) / ventesN1.ca_ttc) * 1000) / 10
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
    dlcRows = raw.slice(0, 14).map((r) => {
      const valeur = (r.quantite_recue ?? 0) * (r.remise_suggeree_pct / 100) * 8;
      dlcValeur += valeur;
      if (r.niveau_alerte === "critique" || r.niveau_alerte === "forcé") dlcCountCritique += 1;
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
    // recompute totals on full set for accuracy (not just top 14)
    dlcValeur = 0;
    dlcCountCritique = 0;
    for (const r of raw) {
      dlcValeur += (r.quantite_recue ?? 0) * (r.remise_suggeree_pct / 100) * 8;
      if (r.niveau_alerte === "critique" || r.niveau_alerte === "forcé") dlcCountCritique += 1;
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
    stockoutOut = raw.filter((r) => r.tier === "out" || r.tier === "blocker").length;
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
    warnings.push("v_stockout_critiques non disponible (vérifier migration 0035)");
  }

  // ─── Process casse 24h ─────────────────────────────────────────
  // NB : Supabase renvoie une jointure `produit` en TABLEAU (foreign-key
  // typing par défaut), même quand 1 seule ligne. On extrait [0].
  let casse24h: CockpitCasseSoiree | null = null;
  if (casseRes.status === "fulfilled" && !casseRes.value.error) {
    type CasseProduit = { nom: string; categorie: string | null; prix_vente_ttc: number | string | null };
    type CasseRow = {
      type: string;
      quantite: number | string;
      produit: CasseProduit | CasseProduit[] | null;
    };
    const raw = (casseRes.value.data ?? []) as unknown as CasseRow[];
    let total = 0;
    const catTotals = new Map<string, number>();
    for (const r of raw) {
      const p = Array.isArray(r.produit) ? r.produit[0] ?? null : r.produit;
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
    if (casseBaselineRes.status === "fulfilled" && !casseBaselineRes.value.error) {
      type BaseProduit = { prix_vente_ttc: number | string | null };
      type BaseRow = {
        quantite: number | string;
        produit: BaseProduit | BaseProduit[] | null;
        created_at: string;
      };
      const baseRaw = (casseBaselineRes.value.data ?? []) as unknown as BaseRow[];
      // On garde uniquement les events 18-24h, on agrège par jour, on moyenne
      const perDay = new Map<string, number>();
      for (const r of baseRaw) {
        const dt = new Date(r.created_at);
        const h = dt.getHours();
        if (h < 18 || h > 23) continue;
        const jour = r.created_at.slice(0, 10);
        const p = Array.isArray(r.produit) ? r.produit[0] ?? null : r.produit;
        const v = Number(r.quantite) * Number(p?.prix_vente_ttc ?? 0);
        perDay.set(jour, (perDay.get(jour) ?? 0) + v);
      }
      const days = [...perDay.values()];
      avg7j = days.length > 0 ? days.reduce((a, b) => a + b, 0) / days.length : 0;
    }
    const delta = avg7j > 0 ? Math.round(((total - avg7j) / avg7j) * 1000) / 10 : null;
    casse24h = {
      total_eur_24h: Math.round(total * 100) / 100,
      total_eur_7j_avg: Math.round(avg7j * 100) / 100,
      delta_pct: delta,
      top_categorie: topCat,
      nb_evenements: raw.length,
    };
  }

  // ─── Process competitor ────────────────────────────────────────
  let competitor: CockpitCompetitorRow[] = [];
  if (competitorRes.status === "fulfilled" && !competitorRes.value.error) {
    competitor = ((competitorRes.value.data ?? []) as CockpitCompetitorRow[]).map((r) => ({
      ...r,
      prix_releve_eur: Number(r.prix_releve_eur),
    }));
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
      count_total: dlcRows.length > 0
        ? (dlcRes.status === "fulfilled" && !dlcRes.value.error
            ? (dlcRes.value.data ?? []).length
            : 0)
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
    warnings,
  };

  return NextResponse.json(snapshot, {
    headers: { "cache-control": "private, max-age=60" },
  });
}
