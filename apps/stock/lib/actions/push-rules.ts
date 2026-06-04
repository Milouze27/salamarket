/**
 * MYTH-08 — Moteur de règles push (notifications intelligentes).
 * ──────────────────────────────────────────────────────────────────
 * Transforme les signaux métier (DLC, ruptures, casse) en push
 * notifications iPhone ACTIONNABLES pour le staff, sans spam.
 *
 * Câblé sur les crons existants :
 *   - /api/cron/dlc-scan  (horaire)  → règle DLC forcé du jour
 *   - /api/cron/forecast  (6h)       → règle rupture blocker + casse anormale
 *
 * Trois garde-fous structurels (sinon le staff coupe les notifs) :
 *   1. QUIET HOURS — pas de push entre 21h et 8h (heure de Paris).
 *      Le magasin est fermé, personne ne veut être réveillé.
 *   2. DEDUP — chaque alerte logique a une `rule_key` déterministe
 *      (cf. table push_dedup). Une fenêtre = un push max. Le cron DLC
 *      tourne 24×/jour mais "X réfs à démarquer" ne part qu'une fois
 *      le matin.
 *   3. ACTIONNABLE — chaque push embarque une `url` deep-link qui ouvre
 *      la PWA sur le BON écran (alertes DLC, cockpit ruptures, casse).
 *
 * Le moteur est volontairement défensif : toute erreur (table absente,
 * push KO, dedup KO) est avalée et loggée — il ne doit JAMAIS faire
 * échouer le cron porteur (dlc-scan / forecast restent verts).
 *
 * Pas de "use server" : ces fonctions sont appelées server-side depuis
 * les route handlers de cron, pas depuis des composants client.
 */

import { supabaseServer } from "@/lib/supabase-server";

// ─── Fenêtre horaire (Europe/Paris) ─────────────────────────────────
// On lit l'heure de Paris via Intl plutôt que l'heure serveur (UTC sur
// Vercel) pour que "pas de push la nuit" colle au vécu du magasin.
const QUIET_START_HOUR = 21; // 21h00 → silence
const QUIET_END_HOUR = 8; //  8h00 → réveil

export function parisHourNow(now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    hour12: false,
    timeZone: "Europe/Paris",
  }).format(now);
  // "08" → 8, "00" (minuit) → 0
  return parseInt(h, 10) % 24;
}

export function parisDayIso(now: Date = new Date()): string {
  // YYYY-MM-DD côté Paris (sv-SE rend ISO directement).
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Paris",
  }).format(now);
}

/** True si on est dans la plage silencieuse [21h, 8h[. */
export function isQuietHour(now: Date = new Date()): boolean {
  const h = parisHourNow(now);
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

/** "am" avant midi, "pm" l'après-midi — pour scoper les rule_key. */
export function parisHalfDay(now: Date = new Date()): "am" | "pm" {
  return parisHourNow(now) < 12 ? "am" : "pm";
}

// ─── Push interne (réutilise la route durcie /api/push/send) ─────────
interface InternalPush {
  title: string;
  body: string;
  url: string;
  tag: string;
  urgent?: boolean;
}

interface RuleOutcome {
  rule: string;
  fired: boolean;
  reason: string;
  sent?: number;
}

/**
 * Envoie un push via la route interne durcie (header x-internal-secret).
 * On passe par HTTP plutôt que d'appeler webpush en direct pour réutiliser
 * la logique de désactivation des subscriptions mortes (410/404) déjà
 * éprouvée dans /api/push/send.
 */
async function deliver(origin: string, push: InternalPush): Promise<number> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    console.error("[push-rules] INTERNAL_API_SECRET absent, push annulé.");
    return 0;
  }
  try {
    const res = await fetch(`${origin}/api/push/send`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": secret,
      },
      body: JSON.stringify(push),
    });
    const json = (await res.json().catch(() => ({}))) as { sent?: number };
    return res.ok ? (json.sent ?? 0) : 0;
  } catch (err) {
    console.error("[push-rules] deliver failed:", err);
    return 0;
  }
}

/**
 * Pose un verrou de dedup. Retourne `true` si la rule_key était LIBRE
 * (donc on peut pousser), `false` si elle a déjà été poussée dans sa
 * fenêtre (on s'abstient). On INSERT d'abord : si l'insert réussit le
 * verrou est à nous, s'il viole la PK c'est que quelqu'un l'a déjà pris.
 *
 * Best-effort : si la table n'existe pas (migration pas encore appliquée)
 * on renvoie `true` pour ne pas bloquer la feature — pire cas = un push
 * de plus, pas un crash.
 */
async function claimDedup(
  ruleKey: string,
  meta?: Record<string, unknown>,
): Promise<boolean> {
  const sb = supabaseServer();
  try {
    const { error } = await sb
      .from("push_dedup")
      .insert({ rule_key: ruleKey, meta: meta ?? null });
    if (!error) return true;
    // 23505 = unique_violation → déjà poussé cette fenêtre.
    if (error.code === "23505") return false;
    // Table absente / autre erreur → on log et on autorise (fail-open).
    console.warn("[push-rules] dedup insert non-bloquant:", error.message);
    return true;
  } catch (err) {
    console.warn("[push-rules] dedup exception non-bloquante:", err);
    return true;
  }
}

/** Purge best-effort des verrous de plus de 7 jours (housekeeping). */
async function purgeOldDedup(): Promise<void> {
  const sb = supabaseServer();
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
  try {
    await sb.from("push_dedup").delete().lt("sent_at", cutoff);
  } catch {
    /* non bloquant */
  }
}

// ════════════════════════════════════════════════════════════════════
// RÈGLE 1 — DLC forcé du jour (déclenchée par le cron dlc-scan)
// ════════════════════════════════════════════════════════════════════
/**
 * "X réfs à démarquer aujourd'hui." Le matin, si des lots passent en
 * niveau 'forcé' (DLC ≤ aujourd'hui), on alerte une fois pour la journée.
 * Deep-link → /v2/admin/alertes-dlc.
 */
async function ruleDlcForce(origin: string): Promise<RuleOutcome> {
  const rule = "dlc_force";
  const sb = supabaseServer();

  const { data, error } = await sb
    .from("v_dlc_alerts")
    .select("lot_id, produit_nom")
    .eq("niveau_alerte", "forcé")
    .limit(200);

  if (error) {
    return { rule, fired: false, reason: `query: ${error.message}` };
  }
  const lots = data ?? [];
  if (lots.length === 0) {
    return { rule, fired: false, reason: "aucun lot forcé" };
  }

  // Un seul push par jour pour ce bloc.
  const ruleKey = `dlc_force:${parisDayIso()}`;
  const free = await claimDedup(ruleKey, { count: lots.length });
  if (!free) {
    return { rule, fired: false, reason: "déjà poussé aujourd'hui" };
  }

  const n = lots.length;
  const sample = lots[0] as { produit_nom?: string } | undefined;
  const body =
    n === 1
      ? `${sample?.produit_nom ?? "1 référence"} : DLC atteinte, à démarquer ou retirer maintenant.`
      : `${n} références ont atteint leur DLC. Démarque ou retrait à faire aujourd'hui.`;

  const sent = await deliver(origin, {
    title: n === 1 ? "1 réf à démarquer aujourd'hui" : `${n} réfs à démarquer aujourd'hui`,
    body,
    url: "/v2/admin/alertes-dlc",
    tag: "dlc-force",
    urgent: true,
  });

  return { rule, fired: true, reason: `${n} lots forcés`, sent };
}

// ════════════════════════════════════════════════════════════════════
// RÈGLE 2 — Rupture imminente (déclenchée par le cron forecast)
// ════════════════════════════════════════════════════════════════════
/**
 * "Rupture imminente sur Y." Les tiers 'blocker' et 'out' du forecast
 * sont les ruptures qui font perdre des ventes. On alerte une fois par
 * demi-journée (am/pm) pour éviter le matraquage toutes les 6h.
 * Deep-link → /v2/cockpit.
 */
async function ruleStockoutBlocker(origin: string): Promise<RuleOutcome> {
  const rule = "stockout_blocker";
  const sb = supabaseServer();

  const { data, error } = await sb
    .from("v_stockout_critiques")
    .select("produit_nom, tier, days_cover")
    .in("tier", ["blocker", "out"])
    .limit(200);

  if (error) {
    return { rule, fired: false, reason: `query: ${error.message}` };
  }
  const rows = (data ?? []) as Array<{
    produit_nom: string;
    tier: string;
    days_cover: number | null;
  }>;
  if (rows.length === 0) {
    return { rule, fired: false, reason: "aucune rupture blocker" };
  }

  const ruleKey = `stockout_blocker:${parisDayIso()}:${parisHalfDay()}`;
  const free = await claimDedup(ruleKey, { count: rows.length });
  if (!free) {
    return { rule, fired: false, reason: "déjà poussé cette demi-journée" };
  }

  const n = rows.length;
  const worst = rows[0];
  const body =
    n === 1
      ? `${worst.produit_nom} : ${worst.tier === "out" ? "rupture en cours" : "rupture imminente"}. Lancer un réassort.`
      : `${n} produits en rupture imminente ou épuisés. Vérifier le réassort dans le cockpit.`;

  const sent = await deliver(origin, {
    title: n === 1 ? "Rupture imminente" : `${n} ruptures imminentes`,
    body,
    url: "/v2/cockpit",
    tag: "stockout-blocker",
    urgent: true,
  });

  return { rule, fired: true, reason: `${n} ruptures`, sent };
}

// ════════════════════════════════════════════════════════════════════
// RÈGLE 3 — Pic de casse anormal (déclenchée par le cron forecast)
// ════════════════════════════════════════════════════════════════════
/**
 * "Casse anormale rayon Z." On compare la casse en € des dernières 24h,
 * par dépôt, au seuil mu+2σ de la baseline 28j (vue v_casse_baseline_28j).
 * Si un dépôt dépasse nettement sa baseline, on alerte (une fois/jour/dépôt).
 * Deep-link → /v2/admin (vue casse).
 *
 * Best-effort total : la baseline est une vue matérialisée parfois vide
 * en environnement de démo. Toute absence de données = règle silencieuse.
 */
async function ruleCasseAnomalie(origin: string): Promise<RuleOutcome> {
  const rule = "casse_anomalie";
  const sb = supabaseServer();

  // Casse des dernières 24h par dépôt (valeur € via prix_drive_cents).
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const TYPES = [
    "casse_manipulation",
    "casse_client",
    "perime_dlc",
    "perime_ddm",
    "defaut_fournisseur",
  ];

  const { data: sorties, error: sErr } = await sb
    .from("sorties_stock")
    .select("depot_id, quantite, produit_id, produits(prix_drive_cents), depots(nom)")
    .in("type", TYPES)
    .gte("created_at", since)
    .limit(5000);

  if (sErr) {
    return { rule, fired: false, reason: `query: ${sErr.message}` };
  }
  // Le client typé Supabase infère les relations jointes comme tableaux
  // (produits / depots). On normalise via `firstOf` pour rester robuste
  // quelle que soit la forme (objet OU [objet]).
  const firstOf = <T>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  const lines = (sorties ?? []) as unknown as Array<{
    depot_id: string;
    quantite: number;
    produits: { prix_drive_cents: number | null } | Array<{ prix_drive_cents: number | null }> | null;
    depots: { nom: string | null } | Array<{ nom: string | null }> | null;
  }>;
  if (lines.length === 0) {
    return { rule, fired: false, reason: "aucune casse 24h" };
  }

  // Somme € par dépôt.
  const byDepot = new Map<string, { eur: number; nom: string }>();
  for (const l of lines) {
    const prod = firstOf(l.produits);
    const depot = firstOf(l.depots);
    const prix = (prod?.prix_drive_cents ?? 0) / 100;
    const cur = byDepot.get(l.depot_id) ?? {
      eur: 0,
      nom: depot?.nom ?? "dépôt",
    };
    cur.eur += Number(l.quantite) * prix;
    byDepot.set(l.depot_id, cur);
  }

  // Baseline 28j (mu/sigma/jour) par dépôt — on agrège la vue par dépôt.
  const { data: baseline } = await sb
    .from("v_casse_baseline_28j")
    .select("depot_id, mu_eur, sigma_eur");
  const baseByDepot = new Map<string, { mu: number; sigma: number }>();
  for (const b of (baseline ?? []) as Array<{
    depot_id: string;
    mu_eur: number | null;
    sigma_eur: number | null;
  }>) {
    const prev = baseByDepot.get(b.depot_id) ?? { mu: 0, sigma: 0 };
    prev.mu += Number(b.mu_eur ?? 0);
    prev.sigma = Math.max(prev.sigma, Number(b.sigma_eur ?? 0));
    baseByDepot.set(b.depot_id, prev);
  }

  // Cherche le dépôt le plus anormal (au-dessus de mu + 2σ, plancher 30 €).
  let worst: { nom: string; eur: number; mu: number } | null = null;
  for (const [depotId, agg] of byDepot) {
    const base = baseByDepot.get(depotId);
    // Sans baseline fiable, seuil absolu de 50 € sur 24h pour éviter le
    // faux positif sur un magasin qui démarre.
    const seuil = base
      ? Math.max(base.mu + 2 * base.sigma, 30)
      : 50;
    if (agg.eur > seuil) {
      if (!worst || agg.eur > worst.eur) {
        worst = { nom: agg.nom, eur: agg.eur, mu: base?.mu ?? 0 };
      }
    }
  }

  if (!worst) {
    return { rule, fired: false, reason: "casse dans la norme" };
  }

  // Un push/jour/dépôt.
  const ruleKey = `casse_anomalie:${worst.nom}:${parisDayIso()}`;
  const free = await claimDedup(ruleKey, { eur: Math.round(worst.eur) });
  if (!free) {
    return { rule, fired: false, reason: "déjà poussé aujourd'hui" };
  }

  const eur = Math.round(worst.eur);
  const vs =
    worst.mu > 0
      ? ` (≈ ${Math.round((worst.eur / worst.mu) * 100)} % de la moyenne)`
      : "";
  const sent = await deliver(origin, {
    title: "Casse anormale détectée",
    body: `${worst.nom} : ${eur} € de casse sur 24h${vs}. Vérifier ce qui se passe.`,
    url: "/v2/admin",
    tag: "casse-anomalie",
    urgent: true,
  });

  return { rule, fired: true, reason: `${eur}€ sur ${worst.nom}`, sent };
}

// ════════════════════════════════════════════════════════════════════
// Orchestrateurs appelés par les crons
// ════════════════════════════════════════════════════════════════════
export interface PushRulesReport {
  ran: boolean;
  quiet_hours: boolean;
  outcomes: RuleOutcome[];
}

/**
 * Évalue les règles déclenchées par le cron DLC (horaire).
 * Aujourd'hui : règle DLC forcé. Respecte les quiet hours.
 */
export async function runDlcPushRules(
  origin: string,
  now: Date = new Date(),
): Promise<PushRulesReport> {
  if (isQuietHour(now)) {
    return { ran: false, quiet_hours: true, outcomes: [] };
  }
  const outcomes: RuleOutcome[] = [];
  try {
    outcomes.push(await ruleDlcForce(origin));
  } catch (err) {
    outcomes.push({
      rule: "dlc_force",
      fired: false,
      reason: err instanceof Error ? err.message : "exception",
    });
  }
  void purgeOldDedup();
  return { ran: true, quiet_hours: false, outcomes };
}

/**
 * Évalue les règles déclenchées par le cron forecast (6h).
 * Aujourd'hui : rupture blocker + casse anormale. Respecte les quiet hours.
 */
export async function runForecastPushRules(
  origin: string,
  now: Date = new Date(),
): Promise<PushRulesReport> {
  if (isQuietHour(now)) {
    return { ran: false, quiet_hours: true, outcomes: [] };
  }
  const outcomes: RuleOutcome[] = [];
  for (const fn of [ruleStockoutBlocker, ruleCasseAnomalie]) {
    try {
      outcomes.push(await fn(origin));
    } catch (err) {
      outcomes.push({
        rule: fn.name,
        fired: false,
        reason: err instanceof Error ? err.message : "exception",
      });
    }
  }
  void purgeOldDedup();
  return { ran: true, quiet_hours: false, outcomes };
}
