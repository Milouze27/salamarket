// Edge function forecast-stockouts
// ─────────────────────────────────
// Bet 3 (compagnon de Bet 2 DLC) — moteur prédictif de stockout.
//
// Recalcule `velocity_state` (Holt α=0.35 β=0.10) et `stockout_forecast`
// (vitesse ajustée × multiplicateur hijri courant → days_cover → tier)
// pour tous les couples (produit, dépôt) actifs.
//
// CRON :
//   - Horaire toutes les heures de 06:00 à 22:00 (Europe/Paris)
//   - Toutes les 15 min pendant fenêtre iftar Ramadan
//   Configurer dans supabase/config.toml :
//     [[functions.forecast-stockouts]]
//     schedule = "0 6-22 * * *"
//   Le boost iftar Ramadan est géré par le scheduler externe (Vercel
//   cron ou supabase pg_cron) qui hit cette function avec un schedule
//   spécifique pendant Ramadan.
//
// AUTH :
//   - GET ou POST avec apikey anon OK (lecture/écriture via RLS anon_all
//     posée par la migration 0035).
//   - Si CRON_SECRET défini, on exige Bearer.
//
// ENV :
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY  (bypass RLS pour upserts batch)
//   - CRON_SECRET (optionnel)
//
// NB : la logique Holt + hijri est dupliquée ici (en Deno standalone)
// plutôt qu'importée — l'edge function ne peut pas importer du code
// Next/Node de apps/stock/. La source de vérité reste apps/stock/lib/
// forecast/, ce fichier doit être maintenu en miroir.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ─── Hijri (Umm al-Qura via Intl) ──────────────────────────────────
type HijriPhase =
  | "normal"
  | "pre_ramadan_j7"
  | "ramadan_debut"
  | "ramadan_milieu"
  | "ramadan_fin_10j"
  | "aid_fitr_j3"
  | "pre_aid_adha_j7"
  | "aid_adha_j3"
  | "achoura_j3";

interface HijriDate {
  year: number;
  month: number;
  day: number;
}

function toHijri(date: Date): HijriDate {
  const fmt = new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: "Europe/Paris",
  });
  const parts = fmt.formatToParts(date);
  let year = 0;
  let month = 0;
  let day = 0;
  for (const p of parts) {
    if (p.type === "year") year = parseInt(p.value.replace(/[^0-9]/g, ""), 10);
    if (p.type === "month") month = parseInt(p.value, 10);
    if (p.type === "day") day = parseInt(p.value, 10);
  }
  return { year, month, day };
}

function resolveHijriPhase(now: Date): { phase: HijriPhase; hijri: HijriDate } {
  const h = toHijri(now);
  let phase: HijriPhase = "normal";
  if (h.month === 12 && h.day >= 10 && h.day <= 12) phase = "aid_adha_j3";
  else if (h.month === 10 && h.day <= 3) phase = "aid_fitr_j3";
  else if (h.month === 12 && h.day >= 3 && h.day <= 9) phase = "pre_aid_adha_j7";
  else if (h.month === 9) {
    if (h.day >= 21) phase = "ramadan_fin_10j";
    else if (h.day >= 11) phase = "ramadan_milieu";
    else phase = "ramadan_debut";
  } else if (h.month === 8 && h.day >= 22) phase = "pre_ramadan_j7";
  else if (h.month === 1 && h.day >= 9 && h.day <= 11) phase = "achoura_j3";
  return { phase, hijri: h };
}

// ─── Holt smoothing ────────────────────────────────────────────────
interface HoltState {
  level: number;
  trend: number;
}

function holtUpdate(
  prev: HoltState | null,
  obs: number,
  alpha: number,
  beta: number,
): HoltState {
  if (!prev) return { level: Math.max(0, obs), trend: 0 };
  const predicted = prev.level + prev.trend;
  const newLevel = alpha * obs + (1 - alpha) * predicted;
  const newTrend = beta * (newLevel - prev.level) + (1 - beta) * prev.trend;
  return { level: Math.max(0, newLevel), trend: newTrend };
}

function holtForecast(s: HoltState, h: number): number {
  return Math.max(0, s.level + h * s.trend);
}

type StockoutTier = "ok" | "warn" | "crit" | "blocker" | "out";

function tierFromCover(stock: number, cover: number | null): StockoutTier {
  if (stock <= 0) return "out";
  if (cover === null) return "ok";
  if (cover < 1.5) return "blocker";
  if (cover < 3) return "crit";
  if (cover < 7) return "warn";
  return "ok";
}

function categorieKey(raw: string | null): string {
  if (!raw) return "epicerie_seche";
  const c = raw.toLowerCase();
  if (c.includes("viande") || c.includes("boucherie") || c.includes("volaille"))
    return "viande_fraiche";
  if (c.includes("datte")) return "dattes";
  if (c.includes("pâte") || c.includes("pate") || c.includes("pasta")) return "pates";
  if (c.includes("boisson") || c.includes("jus") || c.includes("sirop"))
    return "boissons";
  return "epicerie_seche";
}

function pseudoVelocity(seed: string, lo: number, hi: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const u = (Math.abs(h) % 1000) / 1000;
  return lo + u * (hi - lo);
}

// ─── Handler ───────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const secret = Deno.env.get("CRON_SECRET");
  if (secret) {
    const auth = req.headers.get("authorization");
    const url = new URL(req.url);
    if (auth !== `Bearer ${secret}` && url.searchParams.get("secret") !== secret) {
      return json({ error: "unauthorized" }, 401);
    }
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return json({ error: "Supabase env vars missing" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const t0 = Date.now();
  const now = new Date();
  const { phase, hijri } = resolveHijriPhase(now);
  const computedAt = now.toISOString();
  const todayIso = computedAt.slice(0, 10);

  // 1) Stock courant
  const { data: stocks, error: stockErr } = await supabase
    .from("stock_par_depot")
    .select("produit_id, depot_id, quantite")
    .limit(5000);
  if (stockErr) return json({ error: `stock_par_depot: ${stockErr.message}` }, 500);

  if (!stocks || stocks.length === 0) {
    return json({
      ok: true,
      computed_at: computedAt,
      phase,
      hijri,
      couples_total: 0,
      forecast_upserted: 0,
    });
  }

  const produitIds = Array.from(new Set(stocks.map((s) => s.produit_id)));
  const depotIds = Array.from(new Set(stocks.map((s) => s.depot_id)));

  const [{ data: prods }, { data: depots }, { data: vels }, { data: curve }] =
    await Promise.all([
      supabase
        .from("produits")
        .select("id, nom, code_barre, categorie")
        .in("id", produitIds),
      supabase.from("depots").select("id, nom").in("id", depotIds),
      supabase
        .from("velocity_state")
        .select("produit_id, depot_id, level, trend, alpha, beta"),
      supabase.from("hijri_demand_curve").select("phase, categorie, multiplicateur"),
    ]);

  const prodMap = new Map<string, { nom: string; code_barre: string | null; categorie: string | null }>();
  for (const p of (prods ?? []) as Array<{ id: string; nom: string; code_barre: string | null; categorie: string | null }>) {
    prodMap.set(p.id, { nom: p.nom, code_barre: p.code_barre, categorie: p.categorie });
  }
  const depotMap = new Map<string, string>();
  for (const d of (depots ?? []) as Array<{ id: string; nom: string }>) {
    depotMap.set(d.id, d.nom);
  }
  const velMap = new Map<string, { level: number; trend: number; alpha: number; beta: number }>();
  for (const v of (vels ?? []) as Array<{ produit_id: string; depot_id: string; level: number; trend: number; alpha: number; beta: number }>) {
    velMap.set(`${v.produit_id}::${v.depot_id}`, v);
  }
  const curveMap = new Map<string, number>();
  for (const c of (curve ?? []) as Array<{ phase: HijriPhase; categorie: string; multiplicateur: number }>) {
    curveMap.set(`${c.phase}::${c.categorie}`, Number(c.multiplicateur));
  }
  const getMult = (cat: string) => curveMap.get(`${phase}::${cat}`) ?? 1.0;

  // 2) Ventes 14j
  const sinceIso = new Date(now.getTime() - 14 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const { data: ventes } = await supabase
    .from("ventes_cashmag_import")
    .select("date_vente, code_barre, quantite")
    .gte("date_vente", sinceIso)
    .limit(20_000);
  const ventesByEan = new Map<string, number>(); // total 14j
  for (const v of (ventes ?? []) as Array<{ code_barre: string | null; quantite: number }>) {
    if (!v.code_barre) continue;
    ventesByEan.set(v.code_barre, (ventesByEan.get(v.code_barre) ?? 0) + Number(v.quantite));
  }

  // 3) Boucle
  const velUp: Array<Record<string, unknown>> = [];
  const fcUp: Array<Record<string, unknown>> = [];
  const tierCounts: Record<StockoutTier, number> = {
    ok: 0,
    warn: 0,
    crit: 0,
    blocker: 0,
    out: 0,
  };

  for (const s of stocks as Array<{ produit_id: string; depot_id: string; quantite: number }>) {
    const prod = prodMap.get(s.produit_id);
    if (!prod) continue;

    const key = `${s.produit_id}::${s.depot_id}`;
    const prev = velMap.get(key);
    const prevState: HoltState | null = prev
      ? { level: Number(prev.level), trend: Number(prev.trend) }
      : null;

    let obs = 0;
    if (prod.code_barre && ventesByEan.has(prod.code_barre)) {
      obs = ventesByEan.get(prod.code_barre)! / 14;
    } else if (!prev) {
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
      obs = pseudoVelocity(prod.code_barre ?? s.produit_id, range[0], range[1]);
    }

    const alpha = prev ? Number(prev.alpha) : 0.35;
    const beta = prev ? Number(prev.beta) : 0.1;
    const next = holtUpdate(prevState, obs, alpha, beta);
    const velBase = holtForecast(next, 1);
    const cat = categorieKey(prod.categorie);
    const mult = getMult(cat);
    const velAdj = velBase * mult;
    const stock = Number(s.quantite);
    const cover =
      velAdj > 0.01 ? Math.round((stock / velAdj) * 100) / 100 : null;
    const tier = tierFromCover(stock, cover);
    tierCounts[tier] += 1;

    let reason = "";
    if (tier === "out") reason = "Stock épuisé.";
    else if (mult > 1.1)
      reason = `Phase hijri ${phase} — demande × ${mult.toFixed(2)} (${cat}).`;
    else if (tier === "ok") reason = `Couverture stable (${cat}).`;
    else reason = `Couverture ${cover ?? "n/a"} j — vitesse ${velAdj.toFixed(1)} u/j.`;

    velUp.push({
      produit_id: s.produit_id,
      depot_id: s.depot_id,
      level: Math.round(next.level * 10000) / 10000,
      trend: Math.round(next.trend * 10000) / 10000,
      alpha,
      beta,
      last_observed_at: todayIso,
      last_observed_qty: Math.round(obs * 1000) / 1000,
      computed_at: computedAt,
    });
    fcUp.push({
      produit_id: s.produit_id,
      depot_id: s.depot_id,
      stock_actuel: stock,
      velocity_base: Math.round(velBase * 10000) / 10000,
      velocity_adj: Math.round(velAdj * 10000) / 10000,
      phase_courante: phase,
      multiplicateur: mult,
      days_cover: cover,
      tier,
      reason,
      computed_at: computedAt,
    });
  }

  // 4) Upsert batchs de 500
  const BATCH = 500;
  for (let i = 0; i < velUp.length; i += BATCH) {
    const chunk = velUp.slice(i, i + BATCH);
    const { error } = await supabase
      .from("velocity_state")
      .upsert(chunk, { onConflict: "produit_id,depot_id" });
    if (error) {
      console.error("[forecast-stockouts] velocity upsert error:", error);
      return json({ error: `velocity_state: ${error.message}` }, 500);
    }
  }
  for (let i = 0; i < fcUp.length; i += BATCH) {
    const chunk = fcUp.slice(i, i + BATCH);
    const { error } = await supabase
      .from("stockout_forecast")
      .upsert(chunk, { onConflict: "produit_id,depot_id" });
    if (error) {
      console.error("[forecast-stockouts] forecast upsert error:", error);
      return json({ error: `stockout_forecast: ${error.message}` }, 500);
    }
  }

  const ms = Date.now() - t0;
  console.log(
    `[forecast-stockouts] ok phase=${phase} couples=${stocks.length} ` +
      `crit+blocker+out=${tierCounts.crit + tierCounts.blocker + tierCounts.out} ` +
      `duration=${ms}ms`,
  );

  return json({
    ok: true,
    computed_at: computedAt,
    duration_ms: ms,
    phase,
    hijri,
    couples_total: stocks.length,
    velocity_upserted: velUp.length,
    forecast_upserted: fcUp.length,
    tier_counts: tierCounts,
  });
});
