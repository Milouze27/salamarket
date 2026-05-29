// supabase/functions/auto-generate-pos/index.ts
//
// Cron quotidien 06:00 Europe/Paris (à configurer via pg_cron ou
// supabase functions schedule). Délègue à l'endpoint Next.js
// /api/po/auto-generate qui contient la logique métier (et a accès au
// supabase service-role via env). On garde la logique côté Next pour
// éviter de la dupliquer en Deno + Node.
//
// Schedule cron à appliquer côté Supabase :
//   select cron.schedule(
//     'auto-generate-pos',
//     '0 6 * * *',          -- 06:00 UTC ≈ 07:00/08:00 Paris (été/hiver)
//     $$ select net.http_post(
//          url := 'https://salam-stock.vercel.app/api/po/auto-generate',
//          headers := jsonb_build_object('Content-Type','application/json'),
//          body := '{}'::jsonb
//        ) $$
//   );
//
// Ou bien un appel direct depuis cette edge function si on préfère
// piloter le cron côté Supabase :

// @ts-expect-error — Deno runtime (Supabase edge), résolu via npm: spec.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const TARGET_URL =
  Deno.env.get("AUTO_PO_TARGET_URL") ??
  "https://salam-stock.vercel.app/api/po/auto-generate";

const SHARED_SECRET = Deno.env.get("AUTO_PO_SHARED_SECRET") ?? "";

serve(async (req: Request) => {
  // Optionnel : on rejette les invocations non autorisées si on a
  // configuré un shared secret (le cron Supabase enverra le header).
  if (SHARED_SECRET) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${SHARED_SECRET}`) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
  }

  const startedAt = Date.now();
  try {
    const res = await fetch(TARGET_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "cron-edge", at: new Date().toISOString() }),
    });
    const json = await res.json();
    return new Response(
      JSON.stringify({
        ok: res.ok,
        upstream_status: res.status,
        elapsed_ms: Date.now() - startedAt,
        result: json,
      }),
      { status: res.ok ? 200 : 502, headers: { "content-type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ ok: false, error: msg, elapsed_ms: Date.now() - startedAt }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});
