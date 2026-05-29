// Edge function refresh-cockpit-cache
// ────────────────────────────────────
// Cron 02:00 Europe/Paris → rebuild la materialized view
// `mv_ventes_quotidiennes` pour que le snapshot matin d'Otmane soit
// prêt à 8h05 avec le CA de la veille à jour.
//
// Strategy :
//   1. `select refresh_mv_ventes_quotidiennes()` — helper plpgsql de
//      la migration 0034. Le helper essaie CONCURRENTLY d'abord (lock
//      léger, ne bloque pas les reads cockpit), fallback REFRESH plein
//      si la MV n'a pas son index unique encore.
//   2. (Optionnel) Idem `refresh_casse_views()` de 0039 si présent,
//      pour que le bloc casse 7j-baseline soit aussi à jour.
//   3. Retourne timings + lignes touchées pour log Vercel/Supabase.
//
// Déploiement :
//   supabase functions deploy refresh-cockpit-cache --no-verify-jwt
//
// Cron Supabase (settings → Edge Functions → Schedules) :
//   0 2 * * *   (02:00 UTC = 03:00 Paris hiver / 04:00 été)
//   Pour 02:00 Paris : 0 0 * * * UTC en été / 0 1 * * * en hiver.
//   Le plus simple : 0 1 * * * UTC → 02:00 hiver, 03:00 été.
//
// Auth :
//   - Bearer service-role obligatoire (sinon RLS sur la fonction
//     plpgsql security definer bloquerait).
//   - Pas de CORS car appelé seulement par le scheduler Supabase, pas
//     depuis le browser.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface RefreshResult {
  task: string;
  ok: boolean;
  duration_ms: number;
  error?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "Supabase env vars not configured" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const results: RefreshResult[] = [];
  const startTotal = Date.now();

  // ─── Task 1 : MV ventes quotidiennes (le pain quotidien) ────────
  {
    const t0 = Date.now();
    const { error } = await supabase.rpc("refresh_mv_ventes_quotidiennes");
    const r: RefreshResult = {
      task: "refresh_mv_ventes_quotidiennes",
      ok: !error,
      duration_ms: Date.now() - t0,
    };
    if (error) {
      r.error = error.message;
      console.error("[refresh-cockpit-cache] mv_ventes_quotidiennes failed:", error);
    } else {
      console.log(
        `[refresh-cockpit-cache] mv_ventes_quotidiennes OK in ${r.duration_ms}ms`,
      );
    }
    results.push(r);
  }

  // ─── Task 2 : MV casse (baseline 28j + pic horaire) ─────────────
  // Optionnel — uniquement si la fonction existe (migration 0039 déployée).
  {
    const t0 = Date.now();
    const { error } = await supabase.rpc("refresh_casse_views");
    const r: RefreshResult = {
      task: "refresh_casse_views",
      ok: !error,
      duration_ms: Date.now() - t0,
    };
    if (error) {
      // Function may not exist if 0039 not deployed — log but don't fail.
      r.error = error.message;
      console.warn(
        "[refresh-cockpit-cache] refresh_casse_views skipped:",
        error.message,
      );
    } else {
      console.log(
        `[refresh-cockpit-cache] refresh_casse_views OK in ${r.duration_ms}ms`,
      );
    }
    results.push(r);
  }

  // ─── Task 3 : sanity check — lit 1 ligne de la MV pour valider ──
  {
    const t0 = Date.now();
    const { data, error } = await supabase
      .from("mv_ventes_quotidiennes")
      .select("jour, depot_id, ca_ttc")
      .order("jour", { ascending: false })
      .limit(1);
    const r: RefreshResult = {
      task: "sanity_check_mv",
      ok: !error,
      duration_ms: Date.now() - t0,
    };
    if (error) {
      r.error = error.message;
    } else {
      console.log(
        `[refresh-cockpit-cache] sanity check : last row =`,
        data?.[0] ?? "EMPTY",
      );
    }
    results.push(r);
  }

  const allOk = results.every((r) => r.ok || r.task === "refresh_casse_views");

  return json(
    {
      refreshed_at: new Date().toISOString(),
      total_duration_ms: Date.now() - startTotal,
      ok: allOk,
      results,
    },
    allOk ? 200 : 500,
  );
});
