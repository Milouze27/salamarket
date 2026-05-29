// Edge function dlc-scan
// ───────────────────────
// Bet 2 — DLC alerts engine.
// Lecture-only endpoint qui scanne `v_dlc_alerts` (créée par la migration
// 0032) et renvoie les lots dont le niveau d'alerte ≠ 'ok'.
//
// Le frontend staff (DlcBanner, page /v2/admin/alertes-dlc) consomme ce
// endpoint pour afficher les badges, KPI et tableau de remises suggérées.
//
// Phase 1 (post-démo) : cette fonction deviendra un cron qui
//   1. push les remises calculées vers Cashmag
//   2. envoie une push notif iPhone aux managers
//   3. logge dans `dlc_actions` pour traçabilité
// Pour la démo, c'est juste un GET JSON.
//
// Auth :
//   - GET avec apikey anon Supabase → OK (la vue v_dlc_alerts a un
//     `grant select to anon, authenticated`).
//   - Pas de check service-role : c'est un read public sur des données
//     internes non sensibles (DLC produits, pas de PII).
//
// Env vars :
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY (fallback si l'anon RLS bloque)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface DlcAlertRow {
  lot_id: string;
  produit_id: string;
  produit_nom: string;
  produit_categorie: string | null;
  dlc: string;            // ISO date
  jours_restants: number;
  niveau_alerte: "forcé" | "critique" | "attention" | "surveillance" | "ok";
  remise_suggeree_pct: number;
  quantite_recue: number | null;
  unite: string | null;
}

interface Summary {
  forcé: number;
  critique: number;
  attention: number;
  surveillance: number;
  total: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "Supabase env vars not configured" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // On exclut 'ok' côté SQL pour ne renvoyer que ce qui doit être actionné.
  // Tri : forcé d'abord (jours_restants négatifs), puis critique (J-1), puis
  // attention (J-2/J-3), puis surveillance (J-4 → J-7). `jours_restants asc`
  // suffit pour cet ordre.
  const { data, error } = await supabase
    .from("v_dlc_alerts")
    .select(
      "lot_id, produit_id, produit_nom, produit_categorie, dlc, jours_restants, niveau_alerte, remise_suggeree_pct, quantite_recue, unite",
    )
    .neq("niveau_alerte", "ok")
    .order("jours_restants", { ascending: true })
    .limit(200);

  if (error) {
    console.error("[dlc-scan] query error:", error);
    return json({ error: error.message }, 500);
  }

  const alerts = (data ?? []) as DlcAlertRow[];

  const summary: Summary = {
    forcé: 0,
    critique: 0,
    attention: 0,
    surveillance: 0,
    total: alerts.length,
  };
  for (const a of alerts) {
    if (a.niveau_alerte in summary) {
      summary[a.niveau_alerte as keyof Summary] =
        (summary[a.niveau_alerte as keyof Summary] as number) + 1;
    }
  }

  console.log(
    `[dlc-scan] returning ${alerts.length} alerts ` +
      `(forcé=${summary.forcé}, critique=${summary.critique}, ` +
      `attention=${summary.attention}, surveillance=${summary.surveillance})`,
  );

  return json({
    scanned_at: new Date().toISOString(),
    summary,
    alerts,
  });
});
