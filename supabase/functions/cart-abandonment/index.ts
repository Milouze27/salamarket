// Edge function cart-abandonment
// ─────────────────────────────────────
// Relance panier abandonné en deux vagues (H+1, H+24), destinée à être
// déclenchée par un cron (Supabase pg_cron ou Vercel) toutes les ~15 min.
//
// Pour chaque event `cart_abandonment_events` non récupéré (recovered=false)
// dont le panier dépasse le minimum de commande (total_cents >= 1500) :
//   • si emailed_h1=false ET créé il y a > 1h        → mail "vague 1"
//   • sinon si emailed_h24=false ET créé il y a > 24h → mail "vague 24h"
// puis on marque le flag correspondant (emailed_h1 / emailed_h24) à true.
//
// Best-effort PAR event : un échec (Resend down, ligne corrompue…) est
// loggé et on continue le batch. Réponse JSON { processed, sent }.
//
// Auth (comme les autres crons du projet) : on accepte un header
//   x-internal-secret: <CRON_SECRET>   OU   Authorization: Bearer <CRON_SECRET>
// Si CRON_SECRET n'est pas défini, on n'exige rien (pratique en dev /
// invocation service-role interne).
//
// Env vars :
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//   - RESEND_API_KEY
//   - EMAIL_FROM (ex: "drive@salam-market.fr")
//   - DRIVE_BASE_URL (ex: "https://salamarket-drive.vercel.app") — lien retour
//   - CRON_SECRET (optionnel, garde l'endpoint)

// @ts-expect-error — Deno runtime (Supabase edge), résolu côté plateforme.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Minimum de commande Drive : on ne relance pas un panier qui ne pourrait
// de toute façon pas être commandé (15,00 € = 1500 cents).
const MIN_ORDER_CENTS = 1500;

interface CartAbandonmentEvent {
  id: string;
  email: string | null;
  total_cents: number | null;
  recovered: boolean | null;
  emailed_h1: boolean | null;
  emailed_h24: boolean | null;
  created_at: string;
}

const C = {
  sapin: "#0E3B2E",
  gold: "#C9A227",
  cream: "#FAF7EE",
  white: "#FFFFFF",
  text: "#0F1A14",
  textMuted: "#5A6470",
  border: "#E8E4D8",
};

const fmtEur = (cents: number) =>
  (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// HTML de relance — branding sapin/or, mobile-first, lien retour panier.
function renderHtml(
  totalCents: number,
  backUrl: string,
  wave: "h1" | "h24",
): string {
  const intro =
    wave === "h1"
      ? "Vous avez laissé de bons produits dans votre panier. Ils vous attendent toujours."
      : "Votre panier est encore là. Finalisez votre commande avant qu'un article ne parte.";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:${C.cream};font-family:-apple-system,'Plus Jakarta Sans',sans-serif;color:${C.text};padding:24px;">
  <div style="max-width:560px;margin:0 auto;">
    <div style="color:${C.gold};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;">Salam Market · Drive</div>
    <h1 style="color:${C.sapin};font-size:24px;margin:6px 0 0 0;line-height:1.2;">Votre panier vous attend chez Salam Market</h1>
    <p style="color:${C.textMuted};font-size:15px;line-height:1.6;margin:14px 0 0 0;">${intro}</p>
    <div style="background:${C.white};border:1px solid ${C.border};border-radius:16px;padding:24px;margin-top:22px;text-align:center;">
      <div style="color:${C.textMuted};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Montant du panier</div>
      <div style="color:${C.sapin};font-size:34px;font-weight:700;margin-top:6px;line-height:1;">${fmtEur(totalCents)}</div>
      <a href="${escapeHtml(backUrl)}" style="display:inline-block;margin-top:20px;background:${C.sapin};color:${C.white};text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:999px;">Reprendre ma commande</a>
    </div>
    <p style="color:${C.textMuted};font-size:13px;line-height:1.6;margin-top:22px;">Retrait gratuit en magasin · Frais du jour · Halal certifié.</p>
    <div style="border-top:1px solid ${C.border};padding-top:18px;margin-top:24px;color:${C.textMuted};font-size:11px;line-height:1.6;">
      Salam Market · 8 av. Larrieu-Thibaud, Toulouse · Vous recevez cet email car un panier a été laissé sur notre Drive.
    </div>
  </div>
</body></html>`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
  const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "onboarding@resend.dev";
  const DRIVE_BASE_URL =
    Deno.env.get("DRIVE_BASE_URL") ?? "https://salamarket-drive.vercel.app";
  const CRON_SECRET = Deno.env.get("CRON_SECRET");

  // Auth garde-fou : x-internal-secret OU Bearer CRON_SECRET (si configuré).
  if (CRON_SECRET) {
    const headerSecret = req.headers.get("x-internal-secret");
    const auth = req.headers.get("authorization");
    if (headerSecret !== CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
      return json({ error: "unauthorized" }, 401);
    }
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "Missing Supabase env vars" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const now = new Date();
  const h1Cutoff = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const h24Cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // On ne tire que les paniers non récupérés au-dessus du minimum de
  // commande, avec au moins une vague non encore envoyée. Le détail
  // (h1 mûr / h24 mûr) est tranché en JS car deux fenêtres temporelles
  // distinctes sont plus lisibles ainsi qu'en SQL imbriqué.
  let events: CartAbandonmentEvent[] = [];
  try {
    const { data, error } = await supabase
      .from("cart_abandonment_events")
      .select(
        "id, email, total_cents, recovered, emailed_h1, emailed_h24, created_at",
      )
      .eq("recovered", false)
      .gte("total_cents", MIN_ORDER_CENTS)
      .or("emailed_h1.eq.false,emailed_h24.eq.false")
      .lte("created_at", h1Cutoff)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw error;
    events = (data as CartAbandonmentEvent[]) ?? [];
  } catch (err) {
    console.error("[cart-abandonment] fetch failed:", err);
    return json(
      { error: err instanceof Error ? err.message : "fetch failed" },
      500,
    );
  }

  const canSend = !!RESEND_KEY && !RESEND_KEY.includes("PLACEHOLDER");

  let processed = 0;
  let sent = 0;

  for (const ev of events) {
    processed += 1;
    try {
      const total = Number(ev.total_cents ?? 0);
      if (total < MIN_ORDER_CENTS) continue;

      const email = (ev.email ?? "").trim();
      if (!email.includes("@")) continue;

      const created = new Date(ev.created_at).getTime();
      const h1Ready = !ev.emailed_h1 && ev.created_at <= h1Cutoff;
      const h24Ready = !ev.emailed_h24 && ev.created_at <= h24Cutoff;

      // Priorité à la vague la plus tardive due. On envoie au plus un mail
      // par event et par run.
      let wave: "h1" | "h24" | null = null;
      if (h24Ready) wave = "h24";
      else if (h1Ready) wave = "h1";
      if (!wave) continue;
      void created; // (lisibilité : created déjà borné par la requête)

      const backUrl = `${DRIVE_BASE_URL}/panier?utm_source=relance&utm_medium=email&utm_campaign=cart_abandonment_${wave}`;

      // Dry-run propre si Resend non configuré : on ne marque PAS le flag
      // (sinon on "consommerait" la relance sans email réel).
      if (canSend) {
        const resendResp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `Salam Market <${EMAIL_FROM}>`,
            to: [email],
            subject: "Votre panier vous attend chez Salam Market",
            html: renderHtml(total, backUrl, wave),
          }),
        });
        if (!resendResp.ok) {
          const body = await resendResp.text().catch(() => "");
          console.error(
            `[cart-abandonment] resend failed event=${ev.id} status=${resendResp.status} ${body}`,
          );
          continue; // best-effort : on n'écrit pas le flag, retry au prochain run
        }
      }

      const patch =
        wave === "h24" ? { emailed_h24: true } : { emailed_h1: true };
      const { error: updErr } = await supabase
        .from("cart_abandonment_events")
        .update(patch)
        .eq("id", ev.id);
      if (updErr) {
        console.error(
          `[cart-abandonment] flag update failed event=${ev.id}:`,
          updErr,
        );
        // L'email est parti mais le flag n'a pas pu s'écrire : on ne compte
        // pas comme "sent" pour éviter de masquer le risque de doublon.
        continue;
      }

      if (canSend) sent += 1;
    } catch (err) {
      console.error(`[cart-abandonment] event ${ev.id} failed:`, err);
      // best-effort : un event KO n'arrête pas le batch.
    }
  }

  console.log(
    `[cart-abandonment] processed=${processed} sent=${sent} dry_run=${!canSend}`,
  );

  return json({ processed, sent, dry_run: !canSend });
});
