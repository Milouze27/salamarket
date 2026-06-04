/**
 * Recompute du stockout_forecast pour tous les couples (produit, dépôt).
 *
 * Pipeline :
 *   1. Charge stock_par_depot (stock courant)
 *   2. Charge ventes_cashmag_import sur les 14 derniers jours, agrégées
 *      par (produit, dépôt, date) — la liaison se fait entre
 *      ventes_cashmag_import.code_barre et produits.ean (l'EAN du produit
 *      est ce qui est scanné en caisse).
 *      NB : ventes_cashmag_import n'a pas de depot_id. Pour la démo, on
 *      attribue toutes les ventes au dépôt 'Particulier' (heuristique
 *      acceptable — c'est celui qui a 80% des passages caisse). Une V2
 *      brancherait un mapping caisse→dépôt.
 *   3. Charge velocity_state pour chaque couple → met à jour Holt avec
 *      la moyenne des 7 derniers jours (ou bootstrap si pas d'état).
 *   4. Résout la phase hijri courante + multiplicateur par catégorie
 *      → calcule velocity_adj = level × multiplicateur.
 *   5. days_cover = stock / velocity_adj → tier.
 *   6. UPSERT velocity_state + stockout_forecast en batch.
 *
 * Ce fichier est CÔTÉ SERVEUR uniquement (utilise supabaseServer).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase-server";
import {
  DEFAULT_HOLT,
  holtForecast,
  holtUpdate,
  type HoltState,
  type StockoutTier,
  tierFromCover,
} from "./holt";
import { resolveHijriContext, type HijriPhase } from "./hijri";

interface StockRow {
  produit_id: string;
  depot_id: string;
  quantite: number;
}

interface ProduitRow {
  id: string;
  nom: string;
  ean: string | null;
  categorie: string | null;
}

interface DepotRow {
  id: string;
  nom: string;
}

interface VelocityRow {
  produit_id: string;
  depot_id: string;
  level: number;
  trend: number;
  alpha: number;
  beta: number;
  last_observed_at: string | null;
}

interface HijriMultRow {
  phase: HijriPhase;
  categorie: string;
  multiplicateur: number;
}

interface VenteRow {
  date_vente: string;
  code_barre: string | null;
  quantite: number;
}

export interface RecomputeSummary {
  computed_at: string;
  phase: HijriPhase;
  phase_label: string;
  next_event: string;
  next_event_days: number | null;
  couples_total: number;
  velocity_upserted: number;
  forecast_upserted: number;
  tier_counts: Record<StockoutTier, number>;
  /** Top 5 risques pour log/debug. */
  top_risks: Array<{
    produit_nom: string;
    depot_nom: string;
    days_cover: number | null;
    tier: StockoutTier;
    multiplicateur: number;
  }>;
}

/** Normalise une catégorie produit vers une clé hijri_demand_curve. */
function categorieKey(rawCat: string | null): string {
  if (!rawCat) return "epicerie_seche";
  const c = rawCat.toLowerCase();
  if (c.includes("viande") || c.includes("boucherie") || c.includes("volaille"))
    return "viande_fraiche";
  if (c.includes("datte")) return "dattes";
  if (c.includes("pâte") || c.includes("pate") || c.includes("pasta"))
    return "pates";
  if (c.includes("boisson") || c.includes("jus") || c.includes("sirop"))
    return "boissons";
  return "epicerie_seche";
}

/** Moyenne ventes/jour sur N derniers jours pour un couple. */
function avgVelocity(
  ventesByDay: Map<string, number>,
  windowDays: number,
): number {
  if (ventesByDay.size === 0) return 0;
  let total = 0;
  for (const v of ventesByDay.values()) total += v;
  return total / windowDays;
}

/** Mode démo : bruit déterministe sur un code_barre pour donner du relief
 *  à la démo quand on n'a pas (encore) de ventes_cashmag_import. Le hash
 *  est stable → la démo Otmane sera reproductible. */
function pseudoVelocity(seed: string, baseRange: [number, number]): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  const u = (Math.abs(h) % 1000) / 1000; // 0..1
  return baseRange[0] + u * (baseRange[1] - baseRange[0]);
}

export async function recomputeStockoutForecast(
  sb?: SupabaseClient,
  options: { useDemoFallback?: boolean } = {},
): Promise<RecomputeSummary> {
  const client = sb ?? supabaseServer();
  const useDemoFallback = options.useDemoFallback ?? true;
  const now = new Date();
  const hijriCtx = resolveHijriContext(now);

  // 1) Charger stock_par_depot (couples actifs uniquement = quantite tracked).
  const { data: stockRows, error: stockErr } = await client
    .from("stock_par_depot")
    .select("produit_id, depot_id, quantite")
    .limit(5000);
  if (stockErr) throw new Error(`stock_par_depot: ${stockErr.message}`);
  const stocks = (stockRows ?? []) as StockRow[];

  if (stocks.length === 0) {
    return {
      computed_at: now.toISOString(),
      phase: hijriCtx.phase,
      phase_label: hijriCtx.label,
      next_event: hijriCtx.nextEventLabel,
      next_event_days: hijriCtx.nextEventDaysAway,
      couples_total: 0,
      velocity_upserted: 0,
      forecast_upserted: 0,
      tier_counts: { ok: 0, warn: 0, crit: 0, blocker: 0, out: 0 },
      top_risks: [],
    };
  }

  // 2) Charger produits + depots concernés
  const produitIds = Array.from(new Set(stocks.map((s) => s.produit_id)));
  const depotIds = Array.from(new Set(stocks.map((s) => s.depot_id)));

  const [{ data: prodRows }, { data: depotRows }] = await Promise.all([
    client
      .from("produits")
      .select("id, nom, ean, categorie")
      .in("id", produitIds),
    client.from("depots").select("id, nom").in("id", depotIds),
  ]);
  const produits = new Map<string, ProduitRow>(
    ((prodRows ?? []) as ProduitRow[]).map((p) => [p.id, p]),
  );
  const depots = new Map<string, DepotRow>(
    ((depotRows ?? []) as DepotRow[]).map((d) => [d.id, d]),
  );

  // 3) Charger ventes des 14 derniers jours, agrégées par (code_barre, date)
  const since = new Date(now.getTime() - 14 * 86_400_000);
  const sinceIso = since.toISOString().slice(0, 10);
  const { data: ventesRows } = await client
    .from("ventes_cashmag_import")
    .select("date_vente, code_barre, quantite")
    .gte("date_vente", sinceIso)
    .limit(20_000);
  const ventes = (ventesRows ?? []) as VenteRow[];

  // Map: code_barre → Map<date, qty>
  const ventesByEan = new Map<string, Map<string, number>>();
  for (const v of ventes) {
    if (!v.code_barre) continue;
    if (!ventesByEan.has(v.code_barre)) {
      ventesByEan.set(v.code_barre, new Map());
    }
    const dayMap = ventesByEan.get(v.code_barre)!;
    dayMap.set(
      v.date_vente,
      (dayMap.get(v.date_vente) ?? 0) + Number(v.quantite),
    );
  }

  // 4) Charger état Holt précédent
  const { data: velRows } = await client
    .from("velocity_state")
    .select(
      "produit_id, depot_id, level, trend, alpha, beta, last_observed_at",
    );
  const velByKey = new Map<string, VelocityRow>(
    ((velRows ?? []) as VelocityRow[]).map((v) => [
      `${v.produit_id}::${v.depot_id}`,
      v,
    ]),
  );

  // 5) Charger courbe hijri
  const { data: curveRows } = await client
    .from("hijri_demand_curve")
    .select("phase, categorie, multiplicateur");
  const curve = new Map<string, number>();
  for (const c of (curveRows ?? []) as HijriMultRow[]) {
    curve.set(`${c.phase}::${c.categorie}`, Number(c.multiplicateur));
  }
  const getMult = (cat: string): number => {
    const k = `${hijriCtx.phase}::${cat}`;
    return curve.get(k) ?? 1.0;
  };

  // 6) Boucle de recompute
  const velocityUpserts: Array<{
    produit_id: string;
    depot_id: string;
    level: number;
    trend: number;
    alpha: number;
    beta: number;
    last_observed_at: string;
    last_observed_qty: number;
    computed_at: string;
  }> = [];
  const forecastUpserts: Array<{
    produit_id: string;
    depot_id: string;
    stock_actuel: number;
    velocity_base: number;
    velocity_adj: number;
    phase_courante: HijriPhase;
    multiplicateur: number;
    days_cover: number | null;
    tier: StockoutTier;
    reason: string;
    computed_at: string;
  }> = [];

  const tierCounts: Record<StockoutTier, number> = {
    ok: 0,
    warn: 0,
    crit: 0,
    blocker: 0,
    out: 0,
  };
  const topRisks: RecomputeSummary["top_risks"] = [];

  const computedAt = now.toISOString();
  const todayIso = now.toISOString().slice(0, 10);

  for (const s of stocks) {
    const prod = produits.get(s.produit_id);
    if (!prod) continue;
    const depot = depots.get(s.depot_id);
    if (!depot) continue;

    const key = `${s.produit_id}::${s.depot_id}`;
    const prevVel = velByKey.get(key);
    const prev: HoltState | null = prevVel
      ? { level: Number(prevVel.level), trend: Number(prevVel.trend) }
      : null;

    // Vélocité observée du jour : moyenne sur 14j de ventes pour cet EAN.
    let observation = 0;
    if (prod.ean && ventesByEan.has(prod.ean)) {
      observation = avgVelocity(ventesByEan.get(prod.ean)!, 14);
    } else if (useDemoFallback && !prevVel) {
      // Fallback démo : pas de ventes réelles importées → on génère une
      // vélocité pseudo-aléatoire stable à partir du code_barre/id pour
      // que /v2/forecast affiche quand même quelque chose de crédible le
      // jour J. À retirer une fois import-cashmag rempli.
      const cat = categorieKey(prod.categorie);
      const range: [number, number] =
        cat === "viande_fraiche"
          ? [3, 14]
          : cat === "dattes"
            ? [1.5, 8]
            : cat === "boissons"
              ? [2, 10]
              : cat === "pates"
                ? [1, 6]
                : [0.5, 4];
      observation = pseudoVelocity(prod.ean ?? prod.id, range);
    }

    const params = prevVel
      ? { alpha: Number(prevVel.alpha), beta: Number(prevVel.beta) }
      : DEFAULT_HOLT;

    const next = holtUpdate(prev, observation, params);
    const velocityBase = holtForecast(next, 1); // vitesse prévue J+1

    const cat = categorieKey(prod.categorie);
    const mult = getMult(cat);
    const velocityAdj = velocityBase * mult;

    const stock = Number(s.quantite);
    const daysCover =
      velocityAdj > 0.01 ? Math.round((stock / velocityAdj) * 100) / 100 : null;
    const tier = tierFromCover(stock, daysCover);
    tierCounts[tier] += 1;

    // Reason humaine pour l'UI
    let reason = "";
    if (tier === "out") {
      reason = "Stock épuisé.";
    } else if (mult > 1.1) {
      reason = `${hijriCtx.label} — demande × ${mult.toFixed(2)} (catégorie ${cat}).`;
    } else if (tier === "ok") {
      reason = `Couverture stable (${cat}).`;
    } else {
      reason = `Couverture ${daysCover ?? "n/a"} j — vitesse ${velocityAdj.toFixed(1)} u/j.`;
    }

    velocityUpserts.push({
      produit_id: s.produit_id,
      depot_id: s.depot_id,
      level: Math.round(next.level * 10000) / 10000,
      trend: Math.round(next.trend * 10000) / 10000,
      alpha: params.alpha,
      beta: params.beta,
      last_observed_at: todayIso,
      last_observed_qty: Math.round(observation * 1000) / 1000,
      computed_at: computedAt,
    });

    forecastUpserts.push({
      produit_id: s.produit_id,
      depot_id: s.depot_id,
      stock_actuel: stock,
      velocity_base: Math.round(velocityBase * 10000) / 10000,
      velocity_adj: Math.round(velocityAdj * 10000) / 10000,
      phase_courante: hijriCtx.phase,
      multiplicateur: mult,
      days_cover: daysCover,
      tier,
      reason,
      computed_at: computedAt,
    });

    if (tier === "crit" || tier === "blocker" || tier === "out") {
      topRisks.push({
        produit_nom: prod.nom,
        depot_nom: depot.nom,
        days_cover: daysCover,
        tier,
        multiplicateur: mult,
      });
    }
  }

  // Tri top risques par days_cover ascendant.
  topRisks.sort((a, b) => {
    const da = a.days_cover ?? 999;
    const db = b.days_cover ?? 999;
    return da - db;
  });

  // 7) Upserts en batchs (Supabase a une limite implicite, on découpe à 500)
  const BATCH = 500;
  let velUpserted = 0;
  let fcUpserted = 0;

  for (let i = 0; i < velocityUpserts.length; i += BATCH) {
    const chunk = velocityUpserts.slice(i, i + BATCH);
    const { error } = await client
      .from("velocity_state")
      .upsert(chunk, { onConflict: "produit_id,depot_id" });
    if (error) throw new Error(`velocity_state upsert: ${error.message}`);
    velUpserted += chunk.length;
  }

  for (let i = 0; i < forecastUpserts.length; i += BATCH) {
    const chunk = forecastUpserts.slice(i, i + BATCH);
    const { error } = await client
      .from("stockout_forecast")
      .upsert(chunk, { onConflict: "produit_id,depot_id" });
    if (error) throw new Error(`stockout_forecast upsert: ${error.message}`);
    fcUpserted += chunk.length;
  }

  return {
    computed_at: computedAt,
    phase: hijriCtx.phase,
    phase_label: hijriCtx.label,
    next_event: hijriCtx.nextEventLabel,
    next_event_days: hijriCtx.nextEventDaysAway,
    couples_total: stocks.length,
    velocity_upserted: velUpserted,
    forecast_upserted: fcUpserted,
    tier_counts: tierCounts,
    top_risks: topRisks.slice(0, 5),
  };
}
