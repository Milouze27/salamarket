/**
 * GET /api/cockpit/briefing?depot_id=<uuid>
 *
 * MYTH-02 — Le copilote proactif "3 choses avant 10h".
 *
 * Le cerveau qui bosse pendant qu'Otmane dort : au lieu de lui montrer
 * 6 cartes de données brutes (cockpit/snapshot), on lui mâche le travail
 * et on lui sort LES 3 ACTIONS prioritaires du jour, formulées en langage
 * direct ("Otmane, démarque 4 réfs avant ce soir sinon casse"), chacune
 * deep-linkée vers l'écran d'action.
 *
 * PIPELINE en 3 étages :
 *
 *   1. COLLECTE — on réutilise le snapshot existant (DLC, stockout, casse,
 *      hijri) + une requête écarts réception (alertes_surplus en_attente).
 *      Un seul aller-retour pour le snapshot (déjà tout en Promise.all).
 *
 *   2. SCOREUR métier (déterministe, PAS de l'IA) — chaque candidat est
 *      noté par une logique de priorité explicite :
 *        DLC-forcé (à démarquer aujourd'hui sinon casse certaine)
 *          > rupture-blocker (days_cover < lead time → vente perdue)
 *          > pic saisonnier hijri (Ramadan/Aïd approche → préparer le stock)
 *          > écart réception non validé (argent qui dort / litige fournisseur)
 *          > casse anormale (delta soirée > 30% → fuite à comprendre)
 *      On garde le TOP 3.
 *
 *   3. REFORMULATION IA (optionnelle, résiliente) — on demande à Claude
 *      (via /api/assistant, déjà auth x-internal-secret) de réécrire les
 *      3 bullets en ton direct "Otmane, ...". Si l'IA timeout/échoue, on
 *      FALLBACK sur les bullets bruts du scoreur. Le briefing ne casse
 *      JAMAIS le cockpit — au pire on renvoie les libellés métier.
 *
 * AUTH : x-internal-secret (comme snapshot/assistant). Donnée interne staff.
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import type { CockpitSnapshot } from "@/app/api/cockpit/snapshot/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─── Types renvoyés au client ─────────────────────────────────────
export type BriefingCategorie =
  | "dlc_force"
  | "rupture_blocker"
  | "pic_hijri"
  | "ecart_reception"
  | "casse_anormale";

export interface BriefingAction {
  /** Catégorie métier (pour l'icône + le tone côté UI). */
  categorie: BriefingCategorie;
  /** Score de priorité (plus haut = plus urgent). Debug/tri. */
  score: number;
  /** Phrase impérative courte, formulée en ton direct. */
  texte: string;
  /** Métadonnée optionnelle (€ en jeu, nb réfs, J-x). */
  meta: string | null;
  /** Route interne vers l'écran d'action (deep-link). */
  href: string;
  /** Tone visuel suggéré. */
  tone: "danger" | "warn" | "info";
}

export interface CockpitBriefing {
  generated_at: string;
  /** Vrai si l'IA a reformulé (sinon = fallback scoreur brut). */
  ia_reformule: boolean;
  /** 0 à 3 actions. Vide = "tout est sous contrôle". */
  actions: BriefingAction[];
  /** Message d'accroche si rien d'urgent. */
  zen_message: string | null;
  warnings: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────
function fmtEur(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

async function resolveOrigin(req: Request): Promise<string> {
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    process.env.VERCEL_URL ??
    "localhost:3000";
  const proto =
    req.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Candidat brut produit par le scoreur, avant top-3 + reformulation. */
interface Candidat extends BriefingAction {
  /** Libellé brut métier servant de prompt à l'IA (et de fallback). */
  brut: string;
}

// ─── Scoreur métier (cœur du copilote) ────────────────────────────
/**
 * Pondère les candidats à partir du snapshot + écarts réception.
 *
 * Barème (base par catégorie, + bonus dynamique) :
 *   DLC forcé          : 1000 + 12/réf forcée + valeur_eur/10  (casse certaine)
 *   Rupture blocker    :  800 + 25/SKU out/blocker             (vente perdue)
 *   Pic hijri critique :  600 si ≤ 21j, dégressif jusqu'à 90j  (préparation)
 *   Écart réception    :  400 + 8/écart en attente             (argent qui dort)
 *   Casse anormale     :  300 si delta > 30%                   (fuite à comprendre)
 *
 * Les bases sont espacées de 200pts pour que l'ordre catégoriel domine,
 * tout en laissant les bonus départager au sein d'une même catégorie.
 */
function scoreCandidats(
  snap: CockpitSnapshot,
  ecartsReceptionEnAttente: number,
): Candidat[] {
  const cands: Candidat[] = [];

  // ── 1) DLC forcé — à démarquer AUJOURD'HUI sinon casse ──
  const dlcForce = snap.dlc.top.filter(
    (d) => d.niveau_alerte === "forcé" || d.jours_restants <= 0,
  );
  const dlcCritique = snap.dlc.top.filter((d) => d.niveau_alerte === "critique");
  // nb total forcé/critique calculé sur les compteurs globaux du snapshot
  const nbForceCrit = snap.dlc.count_critique;
  if (dlcForce.length > 0 || dlcCritique.length > 0 || nbForceCrit > 0) {
    const nbAff = Math.max(dlcForce.length + dlcCritique.length, nbForceCrit, 1);
    const valeur = snap.dlc.valeur_eur;
    const score = 1000 + dlcForce.length * 12 + valeur / 10;
    const exemple = dlcForce[0] ?? dlcCritique[0] ?? snap.dlc.top[0];
    const meta = valeur > 0 ? `${fmtEur(valeur)} en jeu` : `${nbAff} réfs`;
    const brut =
      `Démarquer ${nbAff} réf${nbAff > 1 ? "s" : ""} en DLC courte avant ce soir` +
      (exemple ? ` (ex : ${exemple.produit_nom})` : "") +
      (valeur > 0 ? ` — ${fmtEur(valeur)} de marchandise à sauver` : "");
    cands.push({
      categorie: "dlc_force",
      score,
      texte: brut,
      brut,
      meta,
      href: "/v2/admin/alertes-dlc",
      tone: "danger",
    });
  }

  // ── 2) Rupture blocker — days_cover < lead time → vente perdue ──
  const blockers = snap.stockout.top.filter(
    (s) => s.tier === "out" || s.tier === "blocker",
  );
  const nbBlocker = snap.stockout.count_out;
  if (blockers.length > 0 || nbBlocker > 0) {
    const nbAff = Math.max(blockers.length, nbBlocker, 1);
    const score = 800 + nbAff * 25;
    const exemple = blockers[0] ?? snap.stockout.top[0];
    const meta = `${nbAff} SKU`;
    const brut =
      `Commander ${nbAff} produit${nbAff > 1 ? "s" : ""} qui ${nbAff > 1 ? "vont" : "va"} taper rupture avant la prochaine livraison` +
      (exemple ? ` (ex : ${exemple.produit_nom}` +
        (exemple.days_cover !== null
          ? ` — ${exemple.days_cover.toFixed(1)} j de couverture)`
          : ")")
        : "");
    cands.push({
      categorie: "rupture_blocker",
      score,
      texte: brut,
      brut,
      meta,
      href: "/v2/po",
      tone: "danger",
    });
  }

  // ── 3) Pic saisonnier hijri — Ramadan/Aïd approche ──
  // On ne déclenche que pour impact fort/critique ET fenêtre proche (≤ 21j),
  // OU si l'événement est en cours. Au-delà, ça reste informatif (RamadanCard),
  // pas une "action à faire avant 10h".
  const impact = snap.hijri.impact_ca;
  const jours = snap.hijri.jours_jusqua;
  const enCours = snap.hijri.en_cours;
  const libelle = snap.hijri.prochain_libelle ?? "événement halal";
  const fortOuCritique = impact === "critique" || impact === "fort";
  if (fortOuCritique && (enCours || (jours !== null && jours > 0 && jours <= 21))) {
    // Plus c'est proche, plus c'est urgent : 600 base, +bonus inverse aux jours.
    const proximite = enCours ? 21 : 21 - (jours ?? 21);
    const score = 600 + proximite * 4 + (impact === "critique" ? 30 : 0);
    const quand = enCours
      ? "en cours"
      : jours === 1
        ? "demain"
        : `dans ${jours} j`;
    const meta = enCours ? "pic en cours" : `J-${jours}`;
    const brut = enCours
      ? `${libelle} : ajuste tes commandes et la prépa, c'est le pic`
      : `Anticiper ${libelle} (${quand}) : passer les commandes pic maintenant pour ne pas être à sec`;
    cands.push({
      categorie: "pic_hijri",
      score,
      texte: brut,
      brut,
      meta,
      href: "/v2/forecast",
      tone: enCours ? "warn" : "info",
    });
  }

  // ── 4) Écart réception non validé — argent qui dort / litige ──
  if (ecartsReceptionEnAttente > 0) {
    const score = 400 + ecartsReceptionEnAttente * 8;
    const meta = `${ecartsReceptionEnAttente} en attente`;
    const brut =
      `Valider ${ecartsReceptionEnAttente} écart${ecartsReceptionEnAttente > 1 ? "s" : ""} de réception en attente` +
      ` (surplus/manquant fournisseur à trancher)`;
    cands.push({
      categorie: "ecart_reception",
      score,
      texte: brut,
      brut,
      meta,
      href: "/v2/admin/alertes-surplus",
      tone: "warn",
    });
  }

  // ── 5) Casse anormale — delta soirée > 30% → fuite ──
  const casse = snap.casse_24h;
  if (casse && casse.delta_pct !== null && casse.delta_pct > 30) {
    const score = 300 + Math.min(casse.delta_pct, 200);
    const cat = casse.top_categorie ? ` (surtout ${casse.top_categorie})` : "";
    const meta = `+${casse.delta_pct.toFixed(0)}%`;
    const brut =
      `Comprendre la casse d'hier soir : +${casse.delta_pct.toFixed(0)}% vs moyenne 7j${cat}` +
      ` — ${fmtEur(casse.total_eur_24h)} parti`;
    cands.push({
      categorie: "casse_anormale",
      score,
      texte: brut,
      brut,
      meta,
      href: "/v2/sortie",
      tone: "warn",
    });
  }

  // Tri décroissant par score, top 3.
  return cands.sort((a, b) => b.score - a.score).slice(0, 3);
}

// ─── Reformulation IA (résiliente) ────────────────────────────────
/**
 * Demande à Claude de réécrire les bullets en ton direct "Otmane, ...".
 * Contrat strict : 3 lignes max, une par bullet d'entrée, même ordre,
 * pas de markdown. On parse les lignes et on remappe sur les candidats
 * (l'ordre est préservé). Si l'IA échoue ou renvoie un format inattendu,
 * on lève → le caller fallback sur les bruts.
 *
 * Timeout 6s : on ne fait JAMAIS attendre Otmane plus que ça. Au-delà,
 * fallback bruts.
 */
async function reformulerViaIA(
  origin: string,
  internalSecret: string,
  candidats: Candidat[],
  contexteHijri: string,
): Promise<string[]> {
  const liste = candidats
    .map((c, i) => `${i + 1}. ${c.brut}`)
    .join("\n");

  const prompt = [
    "Tu es le copilote matin d'Otmane, le gérant de Salam Market (boucherie/épicerie halal à Toulouse).",
    "Il arrive au dépôt à 8h. Voici les 3 actions prioritaires que le moteur a calculées :",
    "",
    liste,
    "",
    contexteHijri ? `Contexte : ${contexteHijri}` : "",
    "",
    "Réécris CHACUNE en une phrase impérative, directe, qui commence par un verbe d'action.",
    "Ton : tutoiement, chaleureux mais cash, comme un bras droit qui connaît le terrain.",
    "Garde les chiffres EXACTS. Pas de markdown, pas de numéro, pas d'emoji.",
    "Réponds EXACTEMENT 3 lignes (une par action, même ordre), rien d'autre.",
  ]
    .filter(Boolean)
    .join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${origin}/api/assistant`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`assistant HTTP ${res.status}`);
    const json = (await res.json()) as { answer?: string; error?: string };
    if (json.error || !json.answer) throw new Error(json.error ?? "no answer");

    // Parse : on garde les lignes non vides, on nettoie les préfixes
    // numériques/tirets/markdown que Claude pourrait glisser.
    const lignes = json.answer
      .split("\n")
      .map((l) =>
        l
          .trim()
          .replace(/^\s*(?:\d+[.)]\s*|[-*•]\s*)/, "")
          .replace(/\*\*/g, "")
          .trim(),
      )
      .filter((l) => l.length > 0);

    if (lignes.length < candidats.length) {
      // L'IA n'a pas rendu assez de lignes → format douteux, on fallback.
      throw new Error(
        `format IA inattendu : ${lignes.length}/${candidats.length} lignes`,
      );
    }
    return lignes.slice(0, candidats.length);
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Handler ──────────────────────────────────────────────────────
export async function GET(req: Request) {
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) {
    console.error("[cockpit/briefing] INTERNAL_API_SECRET non configuré, refus.");
    return NextResponse.json(
      { error: "briefing misconfigured (INTERNAL_API_SECRET missing)" },
      { status: 503 },
    );
  }
  const provided = req.headers.get("x-internal-secret");
  if (provided !== internalSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const depotId = url.searchParams.get("depot_id");
  const wantsIA = url.searchParams.get("ia") !== "0"; // ?ia=0 force le mode brut
  const generatedAt = new Date().toISOString();
  const warnings: string[] = [];
  const origin = await resolveOrigin(req);

  // ── 1) COLLECTE — snapshot (réutilise toute l'agrégation) + écarts ──
  const params = depotId ? `?depot_id=${encodeURIComponent(depotId)}` : "";
  const [snapRes, ecartsRes] = await Promise.allSettled([
    fetch(`${origin}/api/cockpit/snapshot${params}`, {
      headers: { "x-internal-secret": internalSecret },
      cache: "no-store",
    }).then((r) => {
      if (!r.ok) throw new Error(`snapshot HTTP ${r.status}`);
      return r.json() as Promise<CockpitSnapshot>;
    }),
    // Écarts réception non validés : alertes_surplus en_attente.
    (async () => {
      let sb;
      try {
        sb = supabaseServer();
      } catch {
        return 0; // pas de Supabase → 0 écart (mode dégradé)
      }
      const q = sb
        .from("alertes_surplus")
        .select("id", { count: "exact", head: true })
        .eq("statut", "en_attente");
      const { count, error } = await q;
      if (error) throw new Error(error.message);
      return count ?? 0;
    })(),
  ]);

  if (snapRes.status !== "fulfilled") {
    // Sans snapshot, on ne peut rien scorer. On renvoie un briefing vide
    // mais valide (le cockpit ne casse pas, il affichera le mode zen ou
    // ses propres cartes).
    const reason =
      snapRes.status === "rejected"
        ? snapRes.reason instanceof Error
          ? snapRes.reason.message
          : String(snapRes.reason)
        : "inconnu";
    const empty: CockpitBriefing = {
      generated_at: generatedAt,
      ia_reformule: false,
      actions: [],
      zen_message: "Brief indisponible — consulte les cartes ci-dessous.",
      warnings: [`Snapshot inaccessible (${reason})`],
    };
    return NextResponse.json(empty, {
      headers: { "cache-control": "private, max-age=30" },
    });
  }

  const snap = snapRes.value;

  let ecarts = 0;
  if (ecartsRes.status === "fulfilled") {
    ecarts = ecartsRes.value;
  } else {
    warnings.push("Écarts réception inaccessibles — exclus du briefing");
  }

  // ── 2) SCOREUR métier ──
  const candidats = scoreCandidats(snap, ecarts);

  // Rien d'urgent → mode zen.
  if (candidats.length === 0) {
    const zen: CockpitBriefing = {
      generated_at: generatedAt,
      ia_reformule: false,
      actions: [],
      zen_message: "Tout est sous contrôle ☕",
      warnings: [...snap.warnings.slice(0, 2), ...warnings],
    };
    return NextResponse.json(zen, {
      headers: { "cache-control": "private, max-age=60" },
    });
  }

  // ── 3) REFORMULATION IA (résiliente) ──
  let iaReformule = false;
  let actions: BriefingAction[];
  if (wantsIA) {
    const contexteHijri =
      snap.hijri.message && snap.hijri.message !== "Pas d'événement hijri majeur en vue"
        ? snap.hijri.message
        : "";
    try {
      const lignes = await reformulerViaIA(
        origin,
        internalSecret,
        candidats,
        contexteHijri,
      );
      actions = candidats.map((c, i) => ({
        categorie: c.categorie,
        score: c.score,
        texte: lignes[i] ?? c.brut,
        meta: c.meta,
        href: c.href,
        tone: c.tone,
      }));
      iaReformule = true;
    } catch (e) {
      // FALLBACK : bullets bruts du scoreur. Le briefing ne casse JAMAIS.
      warnings.push(
        `IA indisponible, brief brut (${e instanceof Error ? e.message : String(e)})`,
      );
      actions = candidats.map(({ brut: _brut, ...rest }) => rest);
    }
  } else {
    actions = candidats.map(({ brut: _brut, ...rest }) => rest);
  }

  const briefing: CockpitBriefing = {
    generated_at: generatedAt,
    ia_reformule: iaReformule,
    actions,
    zen_message: null,
    warnings,
  };

  return NextResponse.json(briefing, {
    // Cache court : un brief par session matin. Le client cache aussi
    // (sessionStorage) pour ne pas recalculer à chaque render.
    headers: { "cache-control": "private, max-age=120" },
  });
}
