// Edge function casse-weekly-digest
// ─────────────────────────────────────
// Cron Supabase miroir du cron Vercel (`apps/stock/app/api/cron/
// casse-weekly-digest/route.ts`). Mêmes données, même HTML, deux
// déclencheurs indépendants — si l'un tombe, l'autre passe.
//
// Schedule (à configurer dans Supabase Dashboard → Database → Cron) :
//   '0 6 * * 1'   (lundi 06h UTC ≈ 07h-08h Europe/Paris selon DST)
//   timezone : Europe/Paris idéalement (Supabase pg_cron supporte
//              SET TIMEZONE, sinon laisser UTC et accepter le drift
//              de 1h en hiver — non-bloquant pour le digest)
//
// Auth : appel HTTP avec apikey service-role (Supabase l'ajoute auto).
//
// Env vars :
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//   - RESEND_API_KEY
//   - EMAIL_FROM (ex: "stock@salam-market.fr")
//   - CASSE_DIGEST_RECIPIENTS (CSV : "otmane@kafood.fr,ahmed@kafood.fr")

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ─── Types (miroirs de apps/stock/lib/casse-digest/index.ts) ───────

interface TopProduit {
  produit_nom: string;
  depot_nom: string;
  valeur_eur: number;
  qte: number;
  ecart_sigma: number | null;
  baseline_mu_eur: number | null;
}

interface PicHoraire {
  depot_nom: string;
  jour_label: string;
  heure_label: string;
  valeur_perdue_eur_90j: number;
  nb_employes_distincts: number;
}

interface Action {
  priorite: "haute" | "moyenne" | "basse";
  titre: string;
  detail: string;
}

interface RamadanContext {
  date_debut_estimee: string;
  jours_restants: number;
  message: string;
}

interface Digest {
  generated_at: string;
  semaine_label: string;
  total_eur_semaine: number;
  total_eur_semaine_precedente: number;
  delta_pct: number | null;
  top_produits: TopProduit[];
  pic_horaire: PicHoraire | null;
  actions: Action[];
  ramadan_proche: RamadanContext | null;
  depots: Array<{ depot_id: string; depot_nom: string; valeur_eur: number }>;
}

const CASSE_TYPES = [
  "casse_manipulation",
  "casse_client",
  "perime_dlc",
  "perime_ddm",
  "defaut_fournisseur",
];

const JOURS_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

const RAMADAN_DATES: Record<number, string> = {
  2026: "2026-02-17",
  2027: "2027-02-07",
  2028: "2028-01-27",
  2029: "2029-01-16",
};

function startOfIsoWeek(ref: Date): Date {
  const d = new Date(ref);
  const dow = d.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function fmtJour(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
}

function nextRamadan(today: Date): RamadanContext | null {
  const year = today.getUTCFullYear();
  for (const y of [year, year + 1]) {
    const ds = RAMADAN_DATES[y];
    if (!ds) continue;
    const ramadan = new Date(`${ds}T00:00:00Z`);
    const jours = Math.ceil((ramadan.getTime() - today.getTime()) / 86_400_000);
    if (jours > 0 && jours <= 35) {
      return {
        date_debut_estimee: ds,
        jours_restants: jours,
        message:
          jours <= 14
            ? `Ramadan dans ${jours}j — pic conso historique +25%, ajuster commandes viande/laitages dès maintenant`
            : `Ramadan dans ${jours}j — préparer le plan d'approvisionnement Sodrune cette semaine`,
      };
    }
  }
  return null;
}

async function computeDigest(
  supabase: ReturnType<typeof createClient>,
  now: Date,
): Promise<Digest> {
  const startThisWeek = startOfIsoWeek(now);
  const endLastWeek = new Date(startThisWeek);
  endLastWeek.setUTCSeconds(endLastWeek.getUTCSeconds() - 1);
  const startLastWeek = new Date(startThisWeek);
  startLastWeek.setUTCDate(startLastWeek.getUTCDate() - 7);
  const startWeekBefore = new Date(startLastWeek);
  startWeekBefore.setUTCDate(startWeekBefore.getUTCDate() - 7);

  const [weekResp, prevResp] = await Promise.all([
    supabase
      .from("sorties_stock")
      .select("depot_id, quantite, produits!inner(prix_vente_ttc)")
      .in("type", CASSE_TYPES)
      .gte("created_at", startLastWeek.toISOString())
      .lte("created_at", endLastWeek.toISOString()),
    supabase
      .from("sorties_stock")
      .select("depot_id, quantite, produits!inner(prix_vente_ttc)")
      .in("type", CASSE_TYPES)
      .gte("created_at", startWeekBefore.toISOString())
      .lt("created_at", startLastWeek.toISOString()),
  ]);

  type RawProd = { prix_vente_ttc: number | string | null };
  type RawRow = {
    depot_id: string;
    quantite: number | string;
    produits: RawProd | RawProd[] | null;
  };

  const sumValeur = (rows: unknown): number => {
    const arr = (rows as RawRow[] | null) ?? [];
    return arr.reduce((acc, r) => {
      const prod = Array.isArray(r.produits) ? r.produits[0] : r.produits;
      const px = prod?.prix_vente_ttc ?? 0;
      return acc + Number(r.quantite ?? 0) * Number(px);
    }, 0);
  };

  const total_eur_semaine = sumValeur(weekResp.data);
  const total_eur_semaine_precedente = sumValeur(prevResp.data);
  const delta_pct =
    total_eur_semaine_precedente > 0
      ? Math.round(
          ((total_eur_semaine - total_eur_semaine_precedente) /
            total_eur_semaine_precedente) *
            100,
        )
      : null;

  // Top produits
  const topResp = await supabase
    .from("v_casse_digest_semaine")
    .select("*")
    .order("valeur_eur", { ascending: false })
    .limit(3);

  type DigestRow = {
    depot_id: string;
    depot_nom: string;
    produit_id: string;
    produit_nom: string;
    qte: number;
    valeur_eur: number;
    baseline_mu_eur: number | null;
    baseline_sigma_eur: number | null;
    ecart_sigma: number | null;
  };

  const top_produits: TopProduit[] = ((topResp.data as DigestRow[]) ?? []).map((r) => ({
    produit_nom: r.produit_nom,
    depot_nom: r.depot_nom,
    valeur_eur: Number(r.valeur_eur ?? 0),
    qte: Number(r.qte ?? 0),
    ecart_sigma: r.ecart_sigma !== null ? Number(r.ecart_sigma) : null,
    baseline_mu_eur: r.baseline_mu_eur !== null ? Number(r.baseline_mu_eur) : null,
  }));

  const depotMap = new Map<string, { depot_id: string; depot_nom: string; valeur_eur: number }>();
  for (const r of (topResp.data as DigestRow[]) ?? []) {
    const prev = depotMap.get(r.depot_id);
    if (prev) prev.valeur_eur += Number(r.valeur_eur ?? 0);
    else depotMap.set(r.depot_id, {
      depot_id: r.depot_id,
      depot_nom: r.depot_nom,
      valeur_eur: Number(r.valeur_eur ?? 0),
    });
  }
  const depots = Array.from(depotMap.values()).sort((a, b) => b.valeur_eur - a.valeur_eur);

  // Pic horaire
  const picResp = await supabase
    .from("v_casse_pic_horaire")
    .select("*")
    .order("valeur_perdue_eur", { ascending: false })
    .limit(500);

  type PicRow = {
    depot_id: string;
    jour_semaine: number;
    heure: number;
    user_hash: string;
    valeur_perdue_eur: number;
  };

  let pic_horaire: PicHoraire | null = null;
  if (picResp.data && picResp.data.length > 0) {
    const buckets = new Map<string, { depot_id: string; jour: number; heure: number; valeur: number; users: Set<string> }>();
    for (const r of picResp.data as PicRow[]) {
      const k = `${r.depot_id}|${r.jour_semaine}|${r.heure}`;
      const v = Number(r.valeur_perdue_eur ?? 0);
      const prev = buckets.get(k);
      if (prev) {
        prev.valeur += v;
        prev.users.add(r.user_hash);
      } else {
        buckets.set(k, {
          depot_id: r.depot_id,
          jour: r.jour_semaine,
          heure: r.heure,
          valeur: v,
          users: new Set([r.user_hash]),
        });
      }
    }
    const top = Array.from(buckets.values()).sort((a, b) => b.valeur - a.valeur)[0];
    if (top) {
      const depotNom =
        depots.find((d) => d.depot_id === top.depot_id)?.depot_nom ?? "Dépôt principal";
      pic_horaire = {
        depot_nom: depotNom,
        jour_label: JOURS_FR[top.jour - 1] ?? `jour ${top.jour}`,
        heure_label: `${String(top.heure).padStart(2, "0")}h-${String(top.heure + 1).padStart(2, "0")}h`,
        valeur_perdue_eur_90j: Math.round(top.valeur * 100) / 100,
        nb_employes_distincts: top.users.size,
      };
    }
  }

  // Actions
  const actions: Action[] = [];
  const worstSigma = top_produits
    .filter((p) => p.ecart_sigma !== null && p.ecart_sigma > 1.5)
    .sort((a, b) => (b.ecart_sigma ?? 0) - (a.ecart_sigma ?? 0))[0];
  if (worstSigma) {
    actions.push({
      priorite: "haute",
      titre: `${worstSigma.produit_nom} — écart ${worstSigma.ecart_sigma}σ vs baseline 28j`,
      detail: `Casse ${worstSigma.valeur_eur.toFixed(0)}€ cette semaine sur ${worstSigma.depot_nom}. Vérifier DLC du lot en cours, négocier reprise avec Sodrune si DLC < 5j.`,
    });
  }
  if (pic_horaire && pic_horaire.valeur_perdue_eur_90j > 50) {
    actions.push({
      priorite: "moyenne",
      titre: `Pic récurrent ${pic_horaire.jour_label} ${pic_horaire.heure_label} sur ${pic_horaire.depot_nom}`,
      detail: `${pic_horaire.valeur_perdue_eur_90j.toFixed(0)}€ perdus sur 90j à ce créneau, ${pic_horaire.nb_employes_distincts} employé(s) impliqué(s). Ajouter un check 15 min avant fin de shift.`,
    });
  }
  const ramadan_proche = nextRamadan(now);
  if (ramadan_proche) {
    actions.push({
      priorite: ramadan_proche.jours_restants <= 14 ? "haute" : "moyenne",
      titre: `Préparer Ramadan ${new Date(ramadan_proche.date_debut_estimee).getUTCFullYear()}`,
      detail: ramadan_proche.message + ". Historique K&A : +20% commandes viande, +15% laitages.",
    });
  }
  while (actions.length < 3) {
    actions.push({
      priorite: "basse",
      titre: "Brief équipe : rotation FIFO sur fruits/légumes",
      detail: "Rappeler la règle FIFO au check du matin. Réduit la perte F&L de 20-25%.",
    });
  }

  const semaine_label = `Semaine du ${fmtJour(startLastWeek)} au ${fmtJour(endLastWeek)}`;

  return {
    generated_at: now.toISOString(),
    semaine_label,
    total_eur_semaine: Math.round(total_eur_semaine * 100) / 100,
    total_eur_semaine_precedente: Math.round(total_eur_semaine_precedente * 100) / 100,
    delta_pct,
    top_produits,
    pic_horaire,
    actions: actions.slice(0, 3),
    ramadan_proche,
    depots,
  };
}

// ─── HTML inline (allégé — version complète dans apps/stock/lib) ────
function renderHtml(d: Digest): string {
  const C = {
    sapin: "#0E3B2E",
    gold: "#C9A227",
    cream: "#FAF7EE",
    white: "#FFFFFF",
    text: "#0F1A14",
    textMuted: "#5A6470",
    border: "#E8E4D8",
    danger: "#E5483D",
    success: "#2D7A4F",
  };
  const fmtEur = (n: number) =>
    n.toLocaleString("fr-FR", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    });
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const deltaBadge = d.delta_pct === null
    ? `<span style="padding:4px 10px;border-radius:999px;background:${C.cream};color:${C.textMuted};font-size:12px;font-weight:600;">premier point</span>`
    : `<span style="padding:4px 10px;border-radius:999px;background:${d.delta_pct > 0 ? "#FEF2F1" : "#E8F5EE"};color:${d.delta_pct > 0 ? C.danger : C.success};font-size:12px;font-weight:700;">${d.delta_pct > 0 ? "+" : ""}${d.delta_pct}% vs S-1</span>`;

  const top = d.top_produits.map((p, i) => `
    <tr>
      <td style="padding:14px 16px;border-bottom:1px solid ${C.border};">
        <span style="color:${C.gold};font-weight:700;font-size:18px;">${i + 1}</span>
        <strong style="color:${C.text};font-size:15px;margin-left:8px;">${escape(p.produit_nom)}</strong>
        <div style="color:${C.textMuted};font-size:12px;margin-left:30px;">${escape(p.depot_nom)} · ${p.qte.toFixed(p.qte < 10 ? 2 : 0)} unités</div>
      </td>
      <td style="padding:14px 16px;border-bottom:1px solid ${C.border};text-align:right;">
        <div style="color:${C.sapin};font-weight:700;">${fmtEur(p.valeur_eur)}</div>
        ${p.ecart_sigma !== null && p.ecart_sigma > 1 ? `<div style="color:${C.danger};font-size:12px;font-weight:600;">+${p.ecart_sigma}σ</div>` : ""}
      </td>
    </tr>`).join("");

  const actions = d.actions.map((a, i) => `
    <div style="background:${C.white};border:1px solid ${C.border};border-radius:12px;padding:16px 18px;margin-bottom:10px;">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:6px;">
        <span style="width:24px;height:24px;line-height:24px;text-align:center;background:${C.sapin};color:${C.white};border-radius:50%;font-weight:700;font-size:12px;display:inline-block;">${i + 1}</span>
        <span style="font-size:11px;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.05em;">${a.priorite}</span>
      </div>
      <div style="color:${C.text};font-weight:600;font-size:15px;margin-bottom:6px;">${escape(a.titre)}</div>
      <div style="color:${C.textMuted};font-size:13px;line-height:1.55;">${escape(a.detail)}</div>
    </div>`).join("");

  const picBlock = d.pic_horaire ? `
    <div style="background:${C.sapin};border-radius:12px;padding:20px;margin-top:24px;">
      <div style="color:${C.gold};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Pic horaire dominant (90j)</div>
      <div style="color:${C.white};font-size:18px;font-weight:600;margin-top:8px;">
        <span style="color:${C.gold};">${escape(d.pic_horaire.jour_label)}</span> · <span style="color:${C.gold};">${escape(d.pic_horaire.heure_label)}</span> · ${escape(d.pic_horaire.depot_nom)}
      </div>
      <div style="color:#D7E0DA;font-size:13px;margin-top:8px;">
        ${d.pic_horaire.valeur_perdue_eur_90j.toFixed(0)}€ cumulés · ${d.pic_horaire.nb_employes_distincts} employé(s) anonymisé(s)
      </div>
    </div>` : "";

  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:${C.cream};font-family:-apple-system,'Plus Jakarta Sans',sans-serif;color:${C.text};padding:24px;">
  <div style="max-width:600px;margin:0 auto;">
    <div style="color:${C.gold};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;">Salam Stock · Digest hebdo</div>
    <h1 style="color:${C.sapin};font-size:24px;margin:4px 0 0 0;">Casse de la semaine</h1>
    <div style="color:${C.textMuted};font-size:13px;margin-bottom:20px;">${escape(d.semaine_label)}</div>
    <div style="background:${C.sapin};border-radius:16px;padding:28px 24px;">
      <div style="color:${C.gold};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;">Total casse semaine</div>
      <div style="color:${C.white};font-size:42px;font-weight:700;margin-top:6px;line-height:1;">${fmtEur(d.total_eur_semaine)}</div>
      <div style="margin-top:12px;">${deltaBadge} <span style="color:#D7E0DA;font-size:13px;margin-left:8px;">S-1 : ${fmtEur(d.total_eur_semaine_precedente)}</span></div>
    </div>
    <div style="margin-top:24px;color:${C.textMuted};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Top 3 produits qui pèsent</div>
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.white};border:1px solid ${C.border};border-radius:12px;overflow:hidden;">
      ${top || `<tr><td style="padding:24px;text-align:center;color:${C.textMuted};">Aucune casse cette semaine.</td></tr>`}
    </table>
    ${picBlock}
    <div style="margin-top:28px;color:${C.textMuted};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:12px;">3 actions pour ta réunion lundi</div>
    ${actions}
    <div style="border-top:1px solid ${C.border};padding-top:18px;margin-top:24px;color:${C.textMuted};font-size:11px;line-height:1.6;">
      Salam Stock · Identifiants employés anonymisés (SHA-256) · Baseline glissante 28j
    </div>
  </div>
</body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
  const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "onboarding@resend.dev";
  const RECIPIENTS = (Deno.env.get("CASSE_DIGEST_RECIPIENTS") ?? "")
    .split(/[,;]\s*/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "Missing Supabase env vars" }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Support ?now=ISO pour tests manuels
  const url = new URL(req.url);
  const nowParam = url.searchParams.get("now");
  const now = nowParam ? new Date(nowParam) : new Date();

  let digest: Digest;
  try {
    digest = await computeDigest(supabase, now);
  } catch (err) {
    console.error("[casse-weekly-digest] compute failed:", err);
    return json({ error: err instanceof Error ? err.message : "compute" }, 500);
  }

  // Dry-run si pas de Resend ou pas de destinataire
  if (!RESEND_KEY || RESEND_KEY.includes("PLACEHOLDER") || RECIPIENTS.length === 0) {
    return json({
      ok: true,
      dry_run: true,
      reason: !RESEND_KEY
        ? "RESEND_API_KEY non configurée"
        : RECIPIENTS.length === 0
        ? "CASSE_DIGEST_RECIPIENTS vide"
        : "ok",
      digest,
    });
  }

  const html = renderHtml(digest);
  const subject = `Casse semaine : ${digest.total_eur_semaine.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}${digest.delta_pct !== null ? ` (${digest.delta_pct > 0 ? "+" : ""}${digest.delta_pct}% vs S-1)` : ""} · 3 actions concrètes`;

  const resendResp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `Salam Stock <${EMAIL_FROM}>`,
      to: RECIPIENTS,
      subject,
      html,
    }),
  });

  const resendJson = await resendResp.json().catch(() => ({}));
  console.log(
    `[casse-weekly-digest] sent=${resendResp.ok} total=${digest.total_eur_semaine}€ delta=${digest.delta_pct ?? "n/a"}%`,
  );

  return json(
    {
      ok: resendResp.ok,
      sent_at: new Date().toISOString(),
      recipients: RECIPIENTS,
      subject,
      total_eur: digest.total_eur_semaine,
      delta_pct: digest.delta_pct,
      resend: resendJson,
    },
    resendResp.ok ? 200 : 502,
  );
});
