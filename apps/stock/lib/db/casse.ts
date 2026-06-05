/* lib/db/casse.ts — Casse / démarque : baseline 28j, casse récente, z-scores.
 *
 * NB: pas de "use client". Comme lib/supabase, ce module sert côté client
 * (dashboard /v2/admin/casse-anomalies) et reste appelable côté server si
 * besoin (digest, cron). La factory supabase() marche sur les deux runtimes.
 *
 * Source de vérité SQL (migrations 20260530000008 puis correctif
 * 20260604000001 — casse valorisée au VRAI prix de vente magasin) :
 *
 *   - v_casse_baseline_28j : 1 ligne par (produit_id, depot_id) sur 28j.
 *       mu_eur     = moyenne JOURNALIÈRE de la valeur cassée (€/jour-de-casse)
 *       sigma_eur  = écart-type échantillon de cette valeur journalière
 *       p95_eur, total_eur_28j, total_qte_28j, nb_jours_avec_casse, computed_at
 *     → PAS de colonne catégorie : on joint produits(categorie) pour agréger.
 *
 *   - v_casse_pic_horaire : heat-map heure × jour-semaine sur 90j.
 *       depot_id, jour_semaine (1=lun..7=dim), heure (0..23),
 *       user_hash (md5 GDPR), nb_evenements, valeur_perdue_eur
 *
 *   - sorties_stock : event-log brut. On agrège la casse récente (N jours)
 *       par catégorie via jointure produits, en réutilisant la même règle de
 *       valorisation que les vues : prix_drive_cents/100 sinon price_per_kg.
 *
 * Tout est gracieux : si Supabase absent ou vue/table non jouée en local,
 * on renvoie [] sans throw — le dashboard affiche un EmptyState clair.
 */

import { supabase } from "@/lib/supabase";

/** Types de sortie comptabilisés comme casse/démarque pour la baseline.
 *  Aligné EXACTEMENT sur le WHERE des vues SQL (les 5 types valorisés). */
export const CASSE_TYPES = [
  "casse_manipulation",
  "casse_client",
  "perime_dlc",
  "perime_ddm",
  "defaut_fournisseur",
] as const;
export type CasseType = (typeof CASSE_TYPES)[number];

/** Catégorie agrégée de la baseline 28j (moyenne + écart-type journaliers). */
export interface CasseBaselineCategorie {
  categorie: string;
  /** Moyenne JOURNALIÈRE de la valeur cassée sur la catégorie (€/jour). */
  mu_eur: number;
  /** Écart-type de cette valeur journalière (€). Combiné depuis les produits. */
  sigma_eur: number;
  /** Total cassé sur 28 jours (€), pour contexte. */
  total_eur_28j: number;
  /** Nombre de produits de la catégorie ayant cassé au moins 1 jour. */
  nb_produits: number;
}

/** Casse récente agrégée par catégorie sur la fenêtre demandée. */
export interface CasseRecenteCategorie {
  categorie: string;
  /** Valeur totale cassée sur la fenêtre (€). */
  total_eur: number;
  /** Quantité totale cassée (unités/kg selon produit). */
  total_qte: number;
  /** Nombre d'événements de casse. */
  nb_evenements: number;
  /** Valeur cassée moyenne PAR JOUR sur la fenêtre (€/jour) — base du z-score. */
  moyenne_jour_eur: number;
}

export type NiveauAnomalie = "normal" | "warning" | "alerte";

/** Seuils de z-score (valeur absolue) — cf. consigne CASSE-ANOMALIES. */
export const Z_WARNING = 1.5;
export const Z_ALERTE = 2.5;

/** Une catégorie scorée : casse récente vs baseline, z-score, niveau. */
export interface CasseAnomalie {
  categorie: string;
  /** Casse observée moyenne par jour sur la fenêtre récente (€/jour). */
  observe_jour_eur: number;
  /** Casse totale sur la fenêtre récente (€). */
  observe_total_eur: number;
  /** Baseline 28j : moyenne journalière (€/jour). */
  baseline_mu_eur: number;
  /** Baseline 28j : écart-type (€). */
  baseline_sigma_eur: number;
  /** Écart en € entre observé/jour et baseline/jour (peut être négatif). */
  ecart_eur: number;
  /** z = (observé − mu) / sigma. null si baseline indisponible/sigma nul. */
  z_score: number | null;
  niveau: NiveauAnomalie;
  /** True si on n'a pas pu calculer un z fiable (pas de baseline / sigma=0). */
  baseline_indisponible: boolean;
}

/** Point de la heat-map pic horaire (lecture directe de la vue 90j). */
export interface CassePicHoraire {
  jour_semaine: number; // 1=lun..7=dim
  heure: number; // 0..23
  nb_evenements: number;
  valeur_perdue_eur: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const UNCAT = "Sans catégorie";

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

function normCat(c: unknown): string {
  const s = typeof c === "string" ? c.trim() : "";
  return s.length > 0 ? s : UNCAT;
}

/** Valorisation unitaire identique aux vues SQL : prix Drive sinon prix/kg. */
function prixUnitaire(prixDriveCents: unknown, pricePerKg: unknown): number {
  const drive = prixDriveCents == null ? null : num(prixDriveCents) / 100;
  if (drive != null && drive > 0) return drive;
  const kg = pricePerKg == null ? null : num(pricePerKg);
  return kg != null && kg > 0 ? kg : 0;
}

interface BaselineRow {
  produit_id: string;
  mu_eur: number | string | null;
  sigma_eur: number | string | null;
  total_eur_28j: number | string | null;
  produits: { categorie: string | null } | null;
}

interface SortieRow {
  quantite: number | string | null;
  created_at: string;
  produits: {
    categorie: string | null;
    prix_drive_cents: number | string | null;
    price_per_kg: number | string | null;
  } | null;
}

// ── 1) Baseline 28 jours, agrégée par catégorie ──────────────────────────────

/**
 * Lit v_casse_baseline_28j (1 ligne par produit×dépôt) et agrège par catégorie.
 *
 * Agrégation statistique : la baseline d'une catégorie = somme des baselines
 * produit. Pour une somme de variables (la casse catégorie un jour donné = la
 * somme des casses produit), la moyenne s'additionne (mu_cat = Σ mu_produit) et,
 * sous hypothèse d'indépendance, la variance s'additionne aussi
 * (sigma_cat = √(Σ sigma_produit²)). C'est l'approximation retenue, cohérente
 * avec une comparaison "casse totale de la catégorie aujourd'hui".
 *
 * @param depotId optionnel — restreint au dépôt courant si fourni.
 */
export async function getCasseBaseline(
  depotId?: string,
): Promise<CasseBaselineCategorie[]> {
  const sb = supabase();
  if (!sb) return [];
  try {
    let q = sb
      .from("v_casse_baseline_28j")
      .select(
        "produit_id, mu_eur, sigma_eur, total_eur_28j, produits(categorie)",
      )
      .limit(2000);
    if (depotId) q = q.eq("depot_id", depotId);
    const { data, error } = await q;
    if (error) {
      console.warn("[casse] baseline query failed:", error.message);
      return [];
    }
    const rows = (data ?? []) as unknown as BaselineRow[];

    const acc = new Map<
      string,
      { mu: number; varSum: number; total: number; nb: number }
    >();
    for (const r of rows) {
      const cat = normCat(r.produits?.categorie);
      const cur = acc.get(cat) ?? { mu: 0, varSum: 0, total: 0, nb: 0 };
      const sigma = num(r.sigma_eur);
      cur.mu += num(r.mu_eur);
      cur.varSum += sigma * sigma;
      cur.total += num(r.total_eur_28j);
      cur.nb += 1;
      acc.set(cat, cur);
    }

    return Array.from(acc.entries())
      .map(([categorie, v]) => ({
        categorie,
        mu_eur: round2(v.mu),
        sigma_eur: round2(Math.sqrt(v.varSum)),
        total_eur_28j: round2(v.total),
        nb_produits: v.nb,
      }))
      .sort((a, b) => b.total_eur_28j - a.total_eur_28j);
  } catch (err) {
    console.warn("[casse] baseline exception:", err);
    return [];
  }
}

// ── 2) Casse récente (N jours) agrégée par catégorie ─────────────────────────

/**
 * Agrège sorties_stock (types casse / perime / defaut_fournisseur) sur les
 * `days` derniers jours, par catégorie, valorisée au prix de vente magasin
 * (même règle que les vues SQL).
 */
export async function getCasseRecente(
  days = 7,
  depotId?: string,
): Promise<CasseRecenteCategorie[]> {
  const sb = supabase();
  if (!sb) return [];
  const fenetre = Math.max(1, days);
  try {
    const since = new Date(
      Date.now() - fenetre * 24 * 60 * 60 * 1000,
    ).toISOString();
    let q = sb
      .from("sorties_stock")
      .select(
        "quantite, created_at, produits(categorie, prix_drive_cents, price_per_kg)",
      )
      .in("type", CASSE_TYPES as unknown as string[])
      .gte("created_at", since)
      .limit(5000);
    if (depotId) q = q.eq("depot_id", depotId);
    const { data, error } = await q;
    if (error) {
      console.warn("[casse] recente query failed:", error.message);
      return [];
    }
    const rows = (data ?? []) as unknown as SortieRow[];

    const acc = new Map<string, { total: number; qte: number; nb: number }>();
    for (const r of rows) {
      const cat = normCat(r.produits?.categorie);
      const qte = num(r.quantite);
      const pu = prixUnitaire(
        r.produits?.prix_drive_cents,
        r.produits?.price_per_kg,
      );
      const cur = acc.get(cat) ?? { total: 0, qte: 0, nb: 0 };
      cur.total += qte * pu;
      cur.qte += qte;
      cur.nb += 1;
      acc.set(cat, cur);
    }

    return Array.from(acc.entries())
      .map(([categorie, v]) => ({
        categorie,
        total_eur: round2(v.total),
        total_qte: round3(v.qte),
        nb_evenements: v.nb,
        moyenne_jour_eur: round2(v.total / fenetre),
      }))
      .sort((a, b) => b.total_eur - a.total_eur);
  } catch (err) {
    console.warn("[casse] recente exception:", err);
    return [];
  }
}

// ── 3) Anomalies : z-score par catégorie ─────────────────────────────────────

/**
 * Croise casse récente (moyenne/jour) et baseline 28j (mu/sigma journaliers)
 * pour calculer un z-score par catégorie et un niveau d'anomalie.
 *
 *   z = (observé/jour − mu) / sigma
 *   |z| >= 2.5 → alerte · |z| >= 1.5 → warning · sinon normal
 *
 * Fallback si baseline absente ou sigma nul (catégorie jamais vue sur 28j, ou
 * casse parfaitement constante) : z = null, niveau "normal", et on signale
 * baseline_indisponible pour que l'UI le dise honnêtement. Aucune fabrication
 * de z artificiel — on ne crie pas à l'anomalie sans repère statistique.
 */
export async function computeAnomalies(
  days = 7,
  depotId?: string,
): Promise<CasseAnomalie[]> {
  const [baseline, recente] = await Promise.all([
    getCasseBaseline(depotId),
    getCasseRecente(days, depotId),
  ]);

  const baseByCat = new Map(baseline.map((b) => [b.categorie, b]));
  const cats = new Set<string>([
    ...baseline.map((b) => b.categorie),
    ...recente.map((r) => r.categorie),
  ]);

  const out: CasseAnomalie[] = [];
  for (const categorie of cats) {
    const r = recente.find((x) => x.categorie === categorie);
    const b = baseByCat.get(categorie);
    const observeJour = r?.moyenne_jour_eur ?? 0;
    const observeTotal = r?.total_eur ?? 0;
    const mu = b?.mu_eur ?? 0;
    const sigma = b?.sigma_eur ?? 0;
    const baselineIndispo = !b || sigma <= 0;

    let z: number | null = null;
    let niveau: NiveauAnomalie = "normal";
    if (!baselineIndispo) {
      z = round2((observeJour - mu) / sigma);
      const az = Math.abs(z);
      if (az >= Z_ALERTE) niveau = "alerte";
      else if (az >= Z_WARNING) niveau = "warning";
    }

    out.push({
      categorie,
      observe_jour_eur: observeJour,
      observe_total_eur: observeTotal,
      baseline_mu_eur: mu,
      baseline_sigma_eur: sigma,
      ecart_eur: round2(observeJour - mu),
      z_score: z,
      niveau,
      baseline_indisponible: baselineIndispo,
    });
  }

  // Tri par z-score décroissant (les anomalies positives en tête). Les
  // catégories sans baseline (z null) descendent, triées par casse observée.
  return out.sort((a, b) => {
    if (a.z_score != null && b.z_score != null) return b.z_score - a.z_score;
    if (a.z_score != null) return -1;
    if (b.z_score != null) return 1;
    return b.observe_total_eur - a.observe_total_eur;
  });
}

// ── 4) Pic horaire (heat-map 90j) ────────────────────────────────────────────

/**
 * Lit v_casse_pic_horaire et agrège par (jour_semaine, heure) en sommant sur
 * tous les user_hash (la vue distingue les employés pour le digest GDPR ; côté
 * dashboard anomalies, on ne montre qu'un volume agrégé, jamais le hash).
 */
export async function getPicHoraire(
  depotId?: string,
): Promise<CassePicHoraire[]> {
  const sb = supabase();
  if (!sb) return [];
  try {
    let q = sb
      .from("v_casse_pic_horaire")
      .select("jour_semaine, heure, nb_evenements, valeur_perdue_eur")
      .limit(5000);
    if (depotId) q = q.eq("depot_id", depotId);
    const { data, error } = await q;
    if (error) {
      console.warn("[casse] pic horaire query failed:", error.message);
      return [];
    }
    const rows = (data ?? []) as unknown as CassePicHoraire[];

    const acc = new Map<string, CassePicHoraire>();
    for (const r of rows) {
      const j = num(r.jour_semaine);
      const h = num(r.heure);
      const key = `${j}-${h}`;
      const cur = acc.get(key) ?? {
        jour_semaine: j,
        heure: h,
        nb_evenements: 0,
        valeur_perdue_eur: 0,
      };
      cur.nb_evenements += num(r.nb_evenements);
      cur.valeur_perdue_eur += num(r.valeur_perdue_eur);
      acc.set(key, cur);
    }

    return Array.from(acc.values())
      .map((p) => ({ ...p, valeur_perdue_eur: round2(p.valeur_perdue_eur) }))
      .sort((a, b) => b.valeur_perdue_eur - a.valeur_perdue_eur);
  } catch (err) {
    console.warn("[casse] pic horaire exception:", err);
    return [];
  }
}

// ── arrondis ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}
