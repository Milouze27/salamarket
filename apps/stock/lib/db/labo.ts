/* lib/db/labo.ts — couche données du module LABO (recettes & marges)
 * ──────────────────────────────────────────────────────────────────
 * Lecture seule, client anon (les tables recettes/productions sont en
 * SELECT ouvert anon, WRITE service_role only — cf. migration
 * 20260531000022_recettes_lockdown.sql). Aucune écriture ici.
 *
 * Doctrine fallback gracieux (comme /v2/forecast & /v2/fournisseurs) :
 *   - supabase() peut être null (pas d'env) → on renvoie [] / KPI vide.
 *   - une requête en erreur (vue/table absente en local, RLS) → on log
 *     en warn et on renvoie un défaut neutre, JAMAIS de throw. Données
 *     vides = état normal tant que le labo n'a rien saisi (réel à venir).
 *
 * ⚠ v_productions_kpi : la définition archivée (0025) référence des
 * colonnes qui n'existent pas sur les tables 0024 réelles
 * (productions_inputs.quantite/prix_unitaire, productions.recette).
 * Elle peut donc échouer au runtime. getProductionsKpi() tente d'abord
 * la vue, puis retombe sur un calcul équivalent à partir des tables
 * brutes (inputs.cout_total, couts_indirects.montant, outputs ×
 * prix_vente). On ne dépend ainsi PAS de la correction manuelle de la vue.
 */

import { supabase } from "@/lib/supabase";

/* ───────────────────────── Types ───────────────────────── */

export interface Recette {
  id: string;
  nom: string;
  categorie: string | null;
  version: number;
  statut: "draft" | "active" | "archived";
  notes: string | null;
  created_at: string;
  /** Coût main d'œuvre théorique (Σ durée/60 × taux horaire chargé).
   *  Seul coût chiffrable au niveau TEMPLATE : le catalogue produits n'a
   *  pas de prix d'achat, donc le coût matières réel n'apparaît qu'à la
   *  production (productions_inputs.cout_unitaire_ht). */
  cout_main_oeuvre_theo: number | null;
  /** Total théorique connu = main d'œuvre (matières non templatées). */
  cout_total_theo: number | null;
  /** Nombre d'ingrédients (pour la densité d'info en carte). */
  nb_ingredients: number;
  /** Nombre de postes de main d'œuvre. */
  nb_postes_mo: number;
}

/** Ligne KPI d'une production terminée. Tolère l'absence de certaines
 *  colonnes selon que la donnée vienne de la vue ou du fallback calculé. */
export interface ProductionKpi {
  id: string;
  lot_numero: string | null;
  date_production: string;
  /** Nom de recette résolu (la vue expose `recette`, le fallback joint). */
  recette: string | null;
  cout_matieres: number;
  cout_indirects: number;
  cout_total: number;
  ca_potentiel_ttc: number | null;
  ca_potentiel_ht: number | null;
  rendement_pct: number | null;
  marge_eur_ht: number | null;
  marge_pct_ht: number | null;
}

/** Production récente (vue liste, indépendante du statut terminé). */
export interface ProductionRecente {
  id: string;
  lot_numero: string | null;
  date_production: string;
  statut: "en_cours" | "terminee" | "archivee";
  recette: string | null;
  cout_total_calcule: number | null;
  marge_calculee: number | null;
}

export type KpiPeriod = 7 | 30 | 90;

export interface KpiAgrege {
  /** Marge HT cumulée sur la période (€). */
  marge_eur_total: number;
  /** Marge HT moyenne par jour de production actif (€/j). */
  marge_eur_par_jour: number;
  /** Marge % HT moyenne (pondérée CA) sur la période. */
  marge_pct_moyenne: number | null;
  /** CA potentiel HT cumulé sur la période (€). */
  ca_potentiel_ht_total: number;
  /** Rendement matière moyen (%) sur la période. */
  rendement_pct_moyen: number | null;
  /** Nombre de productions terminées prises en compte. */
  nb_productions: number;
}

/* ───────────────────────── Helpers ───────────────────────── */

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function isoNDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Résout le nom de recette d'un embed PostgREST. Le client typé infère un
 * embed to-one tantôt comme objet, tantôt comme tableau ; à l'exécution
 * PostgREST renvoie un objet (FK to-one). On tolère les deux formes.
 */
function embedNom(
  rel:
    | { nom: string | null }
    | Array<{ nom: string | null }>
    | null
    | undefined,
): string | null {
  if (!rel) return null;
  if (Array.isArray(rel)) return rel[0]?.nom ?? null;
  return rel.nom ?? null;
}

/* ───────────────────────── Recettes ───────────────────────── */

/**
 * Liste les recettes actives + draft (pas archived), enrichies de leur
 * coût théorique (matières via ingredients.produit.cout, main d'œuvre via
 * recettes_main_oeuvre). Tri : actives d'abord, puis nom.
 */
export async function listRecettes(): Promise<Recette[]> {
  const sb = supabase();
  if (!sb) return [];

  // Lecture en un seul round-trip via embeds PostgREST. On NE joint pas
  // produits : le catalogue n'a pas de prix d'achat (seul prix_drive_cents
  // = prix de vente). Le coût matières théorique n'est donc pas chiffrable
  // au niveau template — il n'apparaît qu'à la production réelle
  // (productions_inputs.cout_unitaire_ht). On compte juste les ingrédients
  // (densité) + on chiffre la main d'œuvre.
  const { data, error } = await sb
    .from("recettes")
    .select(
      `
      id, nom, categorie, version, statut, notes, created_at,
      recettes_ingredients ( id ),
      recettes_main_oeuvre ( duree_minutes, taux_horaire_charge )
    `,
    )
    .neq("statut", "archived")
    .order("statut")
    .order("nom");

  if (error) {
    console.warn("[labo] listRecettes (embed) failed:", error.message);
    // Fallback : recettes brutes sans coût (si un embed casse en local).
    return listRecettesPlain(sb);
  }

  type Row = {
    id: string;
    nom: string;
    categorie: string | null;
    version: number;
    statut: Recette["statut"];
    notes: string | null;
    created_at: string;
    recettes_ingredients?: Array<{ id: string }> | null;
    recettes_main_oeuvre?: Array<{
      duree_minutes: number | null;
      taux_horaire_charge: number | null;
    }> | null;
  };

  return ((data ?? []) as Row[]).map((r) => {
    const ings = r.recettes_ingredients ?? [];
    const mos = r.recettes_main_oeuvre ?? [];

    // Main d'œuvre : Σ (durée/60) × taux horaire chargé. null si aucun poste
    // chiffré → on n'invente pas un 0 trompeur.
    let coutMo: number | null = null;
    for (const mo of mos) {
      const dur = num(mo.duree_minutes);
      const taux = num(mo.taux_horaire_charge);
      if (dur !== null && taux !== null)
        coutMo = (coutMo ?? 0) + (dur / 60) * taux;
    }
    const coutMoArr = coutMo !== null ? Math.round(coutMo * 100) / 100 : null;

    return {
      id: r.id,
      nom: r.nom,
      categorie: r.categorie,
      version: r.version,
      statut: r.statut,
      notes: r.notes,
      created_at: r.created_at,
      cout_main_oeuvre_theo: coutMoArr,
      cout_total_theo: coutMoArr,
      nb_ingredients: ings.length,
      nb_postes_mo: mos.length,
    };
  });
}

/** Fallback ultra-robuste : recettes sans coût (si l'embed produits casse). */
async function listRecettesPlain(
  sb: NonNullable<ReturnType<typeof supabase>>,
): Promise<Recette[]> {
  const { data, error } = await sb
    .from("recettes")
    .select("id, nom, categorie, version, statut, notes, created_at")
    .neq("statut", "archived")
    .order("nom");
  if (error) {
    console.warn("[labo] listRecettesPlain failed:", error.message);
    return [];
  }
  return (
    (data ?? []) as Array<
      Omit<
        Recette,
        | "cout_main_oeuvre_theo"
        | "cout_total_theo"
        | "nb_ingredients"
        | "nb_postes_mo"
      >
    >
  ).map((r) => ({
    ...r,
    cout_main_oeuvre_theo: null,
    cout_total_theo: null,
    nb_ingredients: 0,
    nb_postes_mo: 0,
  }));
}

/* ───────────────────────── Productions (liste) ───────────────────────── */

/**
 * Productions récentes, toutes statuts, triées date desc. Joint le nom de
 * recette pour l'affichage. limit par défaut 12.
 */
export async function listProductions(
  limit = 12,
): Promise<ProductionRecente[]> {
  const sb = supabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from("productions")
    .select(
      `
      id, lot_numero, date_production, statut,
      cout_total_calcule, marge_calculee,
      recettes ( nom )
    `,
    )
    .order("date_production", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[labo] listProductions failed:", error.message);
    return [];
  }

  type Row = {
    id: string;
    lot_numero: string | null;
    date_production: string;
    statut: ProductionRecente["statut"];
    cout_total_calcule: number | null;
    marge_calculee: number | null;
    recettes?: { nom: string | null } | Array<{ nom: string | null }> | null;
  };

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    lot_numero: r.lot_numero,
    date_production: r.date_production,
    statut: r.statut,
    recette: embedNom(r.recettes),
    cout_total_calcule: num(r.cout_total_calcule),
    marge_calculee: num(r.marge_calculee),
  }));
}

/* ───────────────────────── KPI marges ───────────────────────── */

/**
 * KPI agrégés sur la période (7 / 30 / 90 j) à partir des productions
 * terminées. Tente d'abord la vue v_productions_kpi ; en cas d'échec
 * (vue absente / colonnes invalides), retombe sur un calcul équivalent
 * depuis les tables brutes. Renvoie aussi le détail ligne à ligne pour
 * la section "productions récentes" enrichie.
 */
export async function getProductionsKpi(periodDays: KpiPeriod): Promise<{
  agrege: KpiAgrege;
  lignes: ProductionKpi[];
}> {
  const sb = supabase();
  const empty: KpiAgrege = {
    marge_eur_total: 0,
    marge_eur_par_jour: 0,
    marge_pct_moyenne: null,
    ca_potentiel_ht_total: 0,
    rendement_pct_moyen: null,
    nb_productions: 0,
  };
  if (!sb) return { agrege: empty, lignes: [] };

  const since = isoNDaysAgo(periodDays);

  // 1) Tentative via la vue dédiée (chemin nominal si corrigée en prod).
  const viaView = await tryProductionsKpiView(sb, since);
  const lignes = viaView ?? (await computeKpiFromTables(sb, since));

  return { agrege: aggregate(lignes, periodDays), lignes };
}

/** Lit v_productions_kpi. Renvoie null si la vue échoue (fallback requis). */
async function tryProductionsKpiView(
  sb: NonNullable<ReturnType<typeof supabase>>,
  since: string,
): Promise<ProductionKpi[] | null> {
  const { data, error } = await sb
    .from("v_productions_kpi")
    .select(
      "id, lot_numero, date_production, recette, cout_matieres, cout_indirects, cout_total, ca_potentiel_ttc, ca_potentiel_ht, rendement_pct, marge_eur_ht, marge_pct_ht",
    )
    .gte("date_production", since)
    .order("date_production", { ascending: false });

  if (error) {
    console.warn(
      "[labo] v_productions_kpi indisponible, fallback tables:",
      error.message,
    );
    return null;
  }

  type Row = Record<string, unknown> & {
    id: string;
    date_production: string;
  };

  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    lot_numero: (r.lot_numero as string | null) ?? null,
    date_production: r.date_production,
    recette: (r.recette as string | null) ?? null,
    cout_matieres: num(r.cout_matieres) ?? 0,
    cout_indirects: num(r.cout_indirects) ?? 0,
    cout_total: num(r.cout_total) ?? 0,
    ca_potentiel_ttc: num(r.ca_potentiel_ttc),
    ca_potentiel_ht: num(r.ca_potentiel_ht),
    rendement_pct: num(r.rendement_pct),
    marge_eur_ht: num(r.marge_eur_ht),
    marge_pct_ht: num(r.marge_pct_ht),
  }));
}

/**
 * Recalcule les KPI depuis les tables 0024 réelles quand la vue échoue.
 * - cout_matieres   = Σ productions_inputs.cout_total (colonne générée)
 * - cout_indirects  = Σ productions_couts_indirects.montant
 * - ca_potentiel_ttc = Σ outputs.quantite_reelle_produite × prix_vente_ttc
 * - ca_potentiel_ht  ≈ ca_ttc / (1 + 5.5%) [TVA alimentaire par défaut]
 * - rendement_pct   = Σ outputs.qty / Σ inputs.qty × 100
 */
async function computeKpiFromTables(
  sb: NonNullable<ReturnType<typeof supabase>>,
  since: string,
): Promise<ProductionKpi[]> {
  const { data: prods, error } = await sb
    .from("productions")
    .select(
      `
      id, lot_numero, date_production, statut,
      recettes ( nom ),
      productions_inputs ( quantite_reelle_consommee, cout_total ),
      productions_outputs ( quantite_reelle_produite, prix_vente_unitaire_ttc ),
      productions_couts_indirects ( montant )
    `,
    )
    .eq("statut", "terminee")
    .gte("date_production", since)
    .order("date_production", { ascending: false });

  if (error) {
    console.warn("[labo] computeKpiFromTables failed:", error.message);
    return [];
  }

  const TVA_ALIM = 5.5; // taux par défaut produits alimentaires halal

  type Row = {
    id: string;
    lot_numero: string | null;
    date_production: string;
    recettes?: { nom: string | null } | Array<{ nom: string | null }> | null;
    productions_inputs?: Array<{
      quantite_reelle_consommee: number | null;
      cout_total: number | null;
    }> | null;
    productions_outputs?: Array<{
      quantite_reelle_produite: number | null;
      prix_vente_unitaire_ttc: number | null;
    }> | null;
    productions_couts_indirects?: Array<{ montant: number | null }> | null;
  };

  return ((prods ?? []) as unknown as Row[]).map((p) => {
    const inputs = p.productions_inputs ?? [];
    const outputs = p.productions_outputs ?? [];
    const indirects = p.productions_couts_indirects ?? [];

    const coutMat = inputs.reduce((s, i) => s + (num(i.cout_total) ?? 0), 0);
    const coutInd = indirects.reduce((s, c) => s + (num(c.montant) ?? 0), 0);
    const coutTotal = coutMat + coutInd;

    const inputQty = inputs.reduce(
      (s, i) => s + (num(i.quantite_reelle_consommee) ?? 0),
      0,
    );
    const outputQty = outputs.reduce(
      (s, o) => s + (num(o.quantite_reelle_produite) ?? 0),
      0,
    );

    const caTtc = outputs.reduce((s, o) => {
      const q = num(o.quantite_reelle_produite);
      const pu = num(o.prix_vente_unitaire_ttc);
      return q !== null && pu !== null ? s + q * pu : s;
    }, 0);
    const caHt = outputs.length > 0 ? caTtc / (1 + TVA_ALIM / 100) : null;

    const margeEur = caHt !== null ? caHt - coutTotal : null;
    const margePct =
      caHt !== null && caHt > 0
        ? Math.round((margeEur! / caHt) * 100 * 100) / 100
        : null;
    const rendement =
      inputQty > 0
        ? Math.round((outputQty / inputQty) * 100 * 100) / 100
        : null;

    return {
      id: p.id,
      lot_numero: p.lot_numero,
      date_production: p.date_production,
      recette: embedNom(p.recettes),
      cout_matieres: Math.round(coutMat * 100) / 100,
      cout_indirects: Math.round(coutInd * 100) / 100,
      cout_total: Math.round(coutTotal * 100) / 100,
      ca_potentiel_ttc:
        outputs.length > 0 ? Math.round(caTtc * 100) / 100 : null,
      ca_potentiel_ht: caHt !== null ? Math.round(caHt * 100) / 100 : null,
      rendement_pct: rendement,
      marge_eur_ht: margeEur !== null ? Math.round(margeEur * 100) / 100 : null,
      marge_pct_ht: margePct,
    };
  });
}

/** Agrège les lignes KPI en indicateurs de tête. */
function aggregate(lignes: ProductionKpi[], periodDays: number): KpiAgrege {
  if (lignes.length === 0) {
    return {
      marge_eur_total: 0,
      marge_eur_par_jour: 0,
      marge_pct_moyenne: null,
      ca_potentiel_ht_total: 0,
      rendement_pct_moyen: null,
      nb_productions: 0,
    };
  }

  let margeTotal = 0;
  let caTotal = 0;
  let rendSum = 0;
  let rendCount = 0;
  const joursActifs = new Set<string>();

  for (const l of lignes) {
    if (l.marge_eur_ht !== null) margeTotal += l.marge_eur_ht;
    if (l.ca_potentiel_ht !== null) caTotal += l.ca_potentiel_ht;
    if (l.rendement_pct !== null) {
      rendSum += l.rendement_pct;
      rendCount += 1;
    }
    joursActifs.add(l.date_production);
  }

  // Marge %/jour : on lisse sur le nombre de jours réels de production
  // (joursActifs) plutôt que sur la fenêtre entière — sinon une boîte qui
  // ne produit que 4 j sur 30 verrait sa marge/j artificiellement écrasée.
  const diviseurJours = Math.max(joursActifs.size, 1);

  // Marge % moyenne pondérée par le CA (une grosse prod pèse plus).
  const margePctMoy =
    caTotal > 0 ? Math.round((margeTotal / caTotal) * 100 * 100) / 100 : null;

  return {
    marge_eur_total: Math.round(margeTotal * 100) / 100,
    marge_eur_par_jour: Math.round((margeTotal / diviseurJours) * 100) / 100,
    marge_pct_moyenne: margePctMoy,
    ca_potentiel_ht_total: Math.round(caTotal * 100) / 100,
    rendement_pct_moyen:
      rendCount > 0 ? Math.round((rendSum / rendCount) * 100) / 100 : null,
    nb_productions: lignes.length,
  };
}
