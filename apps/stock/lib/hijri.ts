/**
 * Hijri events — calendrier 2026-2030
 *
 * Source de vérité : table `hijri_events` (migration 0034), mais on
 * hardcode aussi ici une copie pour deux raisons :
 *   1. Fallback si Supabase down ou env vars manquantes → le cockpit
 *      doit toujours pouvoir dire "Ramadan dans 28 jours", c'est le
 *      détail qui WOW Otmane.
 *   2. Calcul des deltas (jours-jusqu'à) côté serveur sans roundtrip
 *      réseau supplémentaire dans l'endpoint snapshot.
 *
 * Dates MFCM Paris (Mosquée Fédération Calcul Musulman). On garde la
 * granularité fine (ramadan_debut, milieu, fin_10j, aid_fitr, aid_adha,
 * achoura) pour pouvoir afficher des contextes précis :
 *   • "Ramadan dans 28 jours" (vs ramadan_debut)
 *   • "10 derniers jours de Ramadan dans 18j" (vs ramadan_fin_10j)
 *   • "Aïd al-Adha dans 9 jours — sacrifice mouton" (vs aid_adha)
 *
 * NOTE 2026-05-31 : Mouloud (Mawlid an-Nabi) et Rajab retirés du seed.
 * Mawlid n'est pas un Eid (les seuls Eids sont Eid al-Fitr et Eid al-Adha)
 * et est considéré bid'a par certaines écoles (salafi/wahhabi). On évite
 * de prendre parti dans une boucherie halal qui sert toutes les écoles.
 * Les types enum sont conservés pour backward compat (cf migration 20260531000010).
 *
 * IMPORTANT : ces dates sont conformes au seed SQL. Si tu changes
 * l'une, change l'autre.
 */

export type HijriEventType =
  | "ramadan_debut"
  | "ramadan_milieu"
  | "ramadan_fin_10j"
  | "ramadan_fin"
  | "aid_fitr"
  | "aid_adha"
  | "achoura"
  | "mouloud"
  | "rajab"
  | "chaabane_15";

export type HijriImpact = "faible" | "moyen" | "fort" | "critique";

export interface HijriEvent {
  evenement: HijriEventType;
  date_debut: string; // ISO YYYY-MM-DD
  date_fin: string;
  annee_hijri: number;
  libelle: string;
  impact_ca: HijriImpact;
}

/** Mirrors `insert into hijri_events` from migration 0034. */
export const HIJRI_EVENTS: HijriEvent[] = [
  // 1447 (2026)
  { evenement: "ramadan_debut",    date_debut: "2026-02-18", date_fin: "2026-02-18", annee_hijri: 1447, libelle: "Ramadan 1447 — début",         impact_ca: "critique" },
  { evenement: "ramadan_milieu",   date_debut: "2026-03-05", date_fin: "2026-03-05", annee_hijri: 1447, libelle: "Ramadan 1447 — mi-Ramadan",    impact_ca: "fort" },
  { evenement: "ramadan_fin_10j",  date_debut: "2026-03-10", date_fin: "2026-03-19", annee_hijri: 1447, libelle: "Ramadan 1447 — 10 derniers j", impact_ca: "critique" },
  { evenement: "aid_fitr",         date_debut: "2026-03-20", date_fin: "2026-03-22", annee_hijri: 1447, libelle: "Aïd al-Fitr 1447",             impact_ca: "critique" },
  { evenement: "aid_adha",         date_debut: "2026-05-27", date_fin: "2026-05-29", annee_hijri: 1447, libelle: "Aïd al-Adha 1447",             impact_ca: "critique" },
  { evenement: "achoura",          date_debut: "2026-06-26", date_fin: "2026-06-26", annee_hijri: 1448, libelle: "Achoura 1448",                 impact_ca: "moyen" },
  // 1448 (2027)
  { evenement: "ramadan_debut",    date_debut: "2027-02-08", date_fin: "2027-02-08", annee_hijri: 1448, libelle: "Ramadan 1448 — début",         impact_ca: "critique" },
  { evenement: "ramadan_fin_10j",  date_debut: "2027-02-28", date_fin: "2027-03-09", annee_hijri: 1448, libelle: "Ramadan 1448 — 10 derniers j", impact_ca: "critique" },
  { evenement: "aid_fitr",         date_debut: "2027-03-10", date_fin: "2027-03-12", annee_hijri: 1448, libelle: "Aïd al-Fitr 1448",             impact_ca: "critique" },
  { evenement: "aid_adha",         date_debut: "2027-05-17", date_fin: "2027-05-19", annee_hijri: 1448, libelle: "Aïd al-Adha 1448",             impact_ca: "critique" },
  // 1449 (2028)
  { evenement: "ramadan_debut",    date_debut: "2028-01-28", date_fin: "2028-01-28", annee_hijri: 1449, libelle: "Ramadan 1449 — début",         impact_ca: "critique" },
  { evenement: "aid_fitr",         date_debut: "2028-02-27", date_fin: "2028-03-01", annee_hijri: 1449, libelle: "Aïd al-Fitr 1449",             impact_ca: "critique" },
  { evenement: "aid_adha",         date_debut: "2028-05-06", date_fin: "2028-05-08", annee_hijri: 1449, libelle: "Aïd al-Adha 1449",             impact_ca: "critique" },
  // 1450 (2029)
  { evenement: "ramadan_debut",    date_debut: "2029-01-16", date_fin: "2029-01-16", annee_hijri: 1450, libelle: "Ramadan 1450 — début",         impact_ca: "critique" },
  { evenement: "aid_fitr",         date_debut: "2029-02-15", date_fin: "2029-02-17", annee_hijri: 1450, libelle: "Aïd al-Fitr 1450",             impact_ca: "critique" },
  { evenement: "aid_adha",         date_debut: "2029-04-25", date_fin: "2029-04-27", annee_hijri: 1450, libelle: "Aïd al-Adha 1450",             impact_ca: "critique" },
  // 1451 (2030)
  { evenement: "ramadan_debut",    date_debut: "2030-01-06", date_fin: "2030-01-06", annee_hijri: 1451, libelle: "Ramadan 1451 — début",         impact_ca: "critique" },
  { evenement: "aid_fitr",         date_debut: "2030-02-05", date_fin: "2030-02-07", annee_hijri: 1451, libelle: "Aïd al-Fitr 1451",             impact_ca: "critique" },
  { evenement: "aid_adha",         date_debut: "2030-04-14", date_fin: "2030-04-16", annee_hijri: 1451, libelle: "Aïd al-Adha 1451",             impact_ca: "critique" },
];

/** Parse YYYY-MM-DD as a Paris-midnight Date (avoids TZ drift). */
function parseDateLocal(iso: string): Date {
  // new Date("YYYY-MM-DD") parses as UTC, which drifts -1h in Paris.
  // We want the calendar date interpreted locally, midnight.
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** Today at midnight in local TZ. */
function todayLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

/** Whole days between two midnight-aligned dates (a - today). */
function daysUntil(target: Date): number {
  const today = todayLocal();
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / 86_400_000);
}

export interface HijriContext {
  /** L'événement le plus proche dans les 90 prochains jours, ou actuellement en cours. */
  prochain: HijriEvent | null;
  /** Nombre de jours jusqu'au début de l'événement. Négatif si déjà commencé. */
  jours_jusqua: number | null;
  /** True si la date actuelle tombe DANS la fenêtre date_debut..date_fin. */
  en_cours: boolean;
  /** Message humain prêt pour le hero : "Ramadan dans 28 jours" / "On est dans les 10 derniers jours de Ramadan". */
  message: string;
  /** Tous les événements à venir dans les 90j (utile pour planning). */
  fenetre_90j: Array<{ event: HijriEvent; jours_jusqua: number }>;
}

const LABEL_COURT: Record<HijriEventType, string> = {
  ramadan_debut: "Ramadan",
  ramadan_milieu: "mi-Ramadan",
  ramadan_fin_10j: "les 10 derniers jours de Ramadan",
  ramadan_fin: "fin de Ramadan",
  aid_fitr: "l'Aïd al-Fitr",
  aid_adha: "l'Aïd al-Adha",
  achoura: "Achoura",
  mouloud: "Mouloud",
  rajab: "Rajab",
  chaabane_15: "Chaâbane",
};

/**
 * Calcule le contexte hijri du jour : quel est le prochain événement
 * critique, dans combien de jours, est-ce qu'on est déjà dedans.
 *
 * Logique de priorité :
 *   1. Si on est DANS la fenêtre d'un événement (date_debut ≤ today ≤ date_fin),
 *      on le renvoie en `en_cours = true`.
 *   2. Sinon, on renvoie le prochain événement à venir (impact 'critique'
 *      ou 'fort' uniquement — un event à 4 mois on s'en moque).
 *   3. Si rien dans les 90j, on renvoie l'événement le plus proche absolu.
 */
export function getHijriContext(today: Date = todayLocal()): HijriContext {
  const todayMs = today.getTime();

  const enriched = HIJRI_EVENTS.map((e) => {
    const debut = parseDateLocal(e.date_debut);
    const fin = parseDateLocal(e.date_fin);
    return {
      event: e,
      debut,
      fin,
      jours_jusqua_debut: Math.round((debut.getTime() - todayMs) / 86_400_000),
      jours_jusqua_fin: Math.round((fin.getTime() - todayMs) / 86_400_000),
    };
  });

  // 1) En cours ?
  const enCours = enriched.find(
    (x) => x.debut.getTime() <= todayMs && x.fin.getTime() >= todayMs,
  );

  if (enCours) {
    return {
      prochain: enCours.event,
      jours_jusqua: enCours.jours_jusqua_debut,
      en_cours: true,
      message: `On est dans ${LABEL_COURT[enCours.event.evenement]}`,
      // BUG-020 : on exclut l'événement déjà mis en avant (enCours) du
      // listing 90j pour éviter le doublon visuel (titre + 1ère ligne
      // timeline avec la même valeur J).
      fenetre_90j: enriched
        .filter(
          (x) =>
            x.jours_jusqua_debut > 0 &&
            x.jours_jusqua_debut <= 120 &&
            x.event.evenement !== enCours.event.evenement,
        )
        .map((x) => ({ event: x.event, jours_jusqua: x.jours_jusqua_debut })),
    };
  }

  // 2) Prochain critique/fort dans 90j
  const futurs = enriched
    .filter((x) => x.jours_jusqua_debut > 0)
    .sort((a, b) => a.jours_jusqua_debut - b.jours_jusqua_debut);

  const prochainImpactant = futurs.find(
    (x) =>
      x.jours_jusqua_debut <= 90 &&
      (x.event.impact_ca === "critique" || x.event.impact_ca === "fort"),
  );

  const choisi = prochainImpactant ?? futurs[0] ?? null;

  if (!choisi) {
    return {
      prochain: null,
      jours_jusqua: null,
      en_cours: false,
      message: "Pas d'événement hijri majeur en vue",
      fenetre_90j: [],
    };
  }

  const j = choisi.jours_jusqua_debut;
  const label = LABEL_COURT[choisi.event.evenement];
  let message: string;
  if (j === 0) message = `${capitalize(label)} commence aujourd'hui`;
  else if (j === 1) message = `${capitalize(label)} demain`;
  else message = `${capitalize(label)} dans ${j} jours`;

  return {
    prochain: choisi.event,
    jours_jusqua: j,
    en_cours: false,
    message,
    // BUG-020 : on exclut l'événement déjà choisi pour le hero du listing
    // timeline, sinon la card affiche "Achoura J-26" en grand ET
    // "Achoura J-26" en première ligne — doublon visuel. On élargit la
    // fenêtre à 120j pour garder les events suivants visibles.
    fenetre_90j: futurs
      .filter(
        (x) =>
          x.jours_jusqua_debut <= 120 &&
          x.event.evenement !== choisi.event.evenement,
      )
      .map((x) => ({ event: x.event, jours_jusqua: x.jours_jusqua_debut })),
  };
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

// ════════════════════════════════════════════════════════════════════
// MYTH-05 — Mode saisonnier ACTIONNABLE
//
// Le calendrier hijri ne sert à rien s'il ne déclenche pas une ACTION.
// Ici on transforme "Ramadan dans 7 jours" en : un mode visible, une
// checklist de constitution de stocks, des multiplicateurs de demande
// par catégorie (alignés sur la table hijri_demand_curve / lib/forecast),
// et un compte à rebours hero. C'est ce qui rend le moat hijri MYTHOS :
// l'app ne sait pas seulement QUAND, elle dit QUOI FAIRE.
// ════════════════════════════════════════════════════════════════════

/** Les 4 modes saisonniers majeurs qui justifient un plan de réassort. */
export type SeasonalModeKind =
  | "pre_ramadan"
  | "ramadan"
  | "pre_aid_adha"
  | "aid_adha";

/** Catégories métier sur lesquelles on raisonne en demande (clés alignées
 *  sur lib/forecast/recompute.ts categorieKey + hijri_demand_curve). */
export type DemandCategorie =
  | "viande_fraiche"
  | "dattes"
  | "pates"
  | "epicerie_seche"
  | "boissons";

export interface CategorieMultiplier {
  categorie: DemandCategorie;
  /** Libellé humain pour la card / page. */
  label: string;
  /** Multiplicateur de demande appliqué pendant la fenêtre saisonnière. */
  multiplicateur: number;
}

export interface ChecklistItem {
  /** Clé stable pour persistance locale d'un cochage UI. */
  key: string;
  label: string;
  /** Catégorie reliée, pour cross-link avec le réassort. */
  categorie: DemandCategorie | null;
}

export interface SeasonalMode {
  kind: SeasonalModeKind;
  /** Titre court pour bannières ("Mode Ramadan", "Mode Aïd al-Adha"). */
  titre: string;
  /** Sous-titre humain ("Pré-Ramadan — constituez les stocks"). */
  sous_titre: string;
  /** Compte à rebours hero ("J-7 avant Aïd al-Adha"). */
  countdown_label: string;
  /** Jours jusqu'à l'événement pivot (≤0 = en cours). */
  jours_jusqua: number;
  /** True si on est DANS la fête/le mois (pas en pré-fenêtre). */
  en_cours: boolean;
  /** Le multiplicateur le plus fort actif (pour la pastille de la card). */
  multiplicateur_max: number;
  /** Multiplicateurs par catégorie (triés décroissant). */
  multiplicateurs: CategorieMultiplier[];
  /** Checklist de constitution de stocks à cocher. */
  checklist: ChecklistItem[];
}

const CAT_LABEL: Record<DemandCategorie, string> = {
  viande_fraiche: "Viande fraîche",
  dattes: "Dattes",
  pates: "Pâtes & semoule",
  epicerie_seche: "Épicerie sèche",
  boissons: "Boissons",
};

/**
 * Courbe de demande hardcodée — MIROIR de la table hijri_demand_curve
 * (migration 20260530000004). On garde une copie côté code pour deux
 * raisons identiques à HIJRI_EVENTS : fallback si Supabase down, et
 * affichage instantané sans roundtrip. On mappe les phases fines du
 * moteur forecast (pre_ramadan_j7, ramadan_debut, …) vers le multiplicateur
 * le plus saillant du MODE (ce qu'Otmane doit anticiper sur la fenêtre).
 *
 * IMPORTANT : si tu changes la table SQL, change cette copie.
 */
const SEASONAL_MULT: Record<SeasonalModeKind, Record<DemandCategorie, number>> = {
  // Pré-Ramadan = constitution massive des foyers (dattes en pic d'achat).
  pre_ramadan: {
    dattes: 4.5,
    epicerie_seche: 1.6,
    pates: 1.4,
    viande_fraiche: 1.35,
    boissons: 1.3,
  },
  // Ramadan = on prend le pic du mois (1re décade + 10 dernières nuits).
  ramadan: {
    dattes: 3.2,
    viande_fraiche: 1.8,
    boissons: 1.85,
    pates: 1.55,
    epicerie_seche: 1.45,
  },
  // Pré-Aïd al-Adha = sacrifice, le mouton/viande explose.
  pre_aid_adha: {
    viande_fraiche: 2.2,
    epicerie_seche: 1.4,
    dattes: 1.2,
    pates: 1.15,
    boissons: 1.15,
  },
  // Aïd al-Adha = pic absolu viande.
  aid_adha: {
    viande_fraiche: 3.0,
    epicerie_seche: 1.5,
    boissons: 1.3,
    dattes: 1.2,
    pates: 1.1,
  },
};

const SEASONAL_CHECKLIST: Record<SeasonalModeKind, ChecklistItem[]> = {
  pre_ramadan: [
    { key: "dattes", label: "Constituer le stock de dattes (rupture ftour)", categorie: "dattes" },
    { key: "semoule", label: "Semoule, vermicelle & pâtes chorba/harira", categorie: "pates" },
    { key: "epices", label: "Épices : cumin, gingembre, smen, tomate", categorie: "epicerie_seche" },
    { key: "boissons", label: "Sirops, jus & laits fermentés pour le ftour", categorie: "boissons" },
    { key: "viande", label: "Sécuriser l'appro viande (premiers ftours)", categorie: "viande_fraiche" },
    { key: "horaires", label: "Adapter horaires d'ouverture (soirée)", categorie: null },
  ],
  ramadan: [
    { key: "dattes", label: "Réassort dattes en continu (forte rotation)", categorie: "dattes" },
    { key: "viande", label: "Viande fraîche quotidienne pour le ftour", categorie: "viande_fraiche" },
    { key: "boissons", label: "Boissons : ne jamais tomber en rupture le soir", categorie: "boissons" },
    { key: "pates", label: "Pâtes & semoule (chorba tous les soirs)", categorie: "pates" },
    { key: "laylat", label: "Renforcer pour les 10 dernières nuits", categorie: null },
  ],
  pre_aid_adha: [
    { key: "mouton", label: "Confirmer les commandes mouton/agneau", categorie: "viande_fraiche" },
    { key: "boucherie", label: "Renforcer l'équipe boucherie (pic sacrifice)", categorie: null },
    { key: "epices", label: "Épices & accompagnements de fête", categorie: "epicerie_seche" },
    { key: "charbon", label: "Charbon, brochettes & consommables grillade", categorie: "epicerie_seche" },
    { key: "froid", label: "Vérifier capacité chambre froide", categorie: null },
  ],
  aid_adha: [
    { key: "viande", label: "Tenir le pic viande (×3 demande)", categorie: "viande_fraiche" },
    { key: "frais", label: "Réassort frais & accompagnements", categorie: "epicerie_seche" },
    { key: "boissons", label: "Boissons pour les repas de fête", categorie: "boissons" },
    { key: "post", label: "Anticiper le creux post-Aïd (ne pas surcommander)", categorie: null },
  ],
};

const MODE_TITRE: Record<SeasonalModeKind, string> = {
  pre_ramadan: "Mode pré-Ramadan",
  ramadan: "Mode Ramadan",
  pre_aid_adha: "Mode pré-Aïd al-Adha",
  aid_adha: "Mode Aïd al-Adha",
};

const MODE_SOUS_TITRE: Record<SeasonalModeKind, string> = {
  pre_ramadan: "Constituez les stocks avant le premier ftour",
  ramadan: "Pic de demande — réassort en continu",
  pre_aid_adha: "Sécurisez la viande avant le sacrifice",
  aid_adha: "Pic absolu viande — tenez la cadence",
};

function buildMode(
  kind: SeasonalModeKind,
  joursJusqua: number,
  enCours: boolean,
  eventLabel: string,
): SeasonalMode {
  const multMap = SEASONAL_MULT[kind];
  const multiplicateurs: CategorieMultiplier[] = (
    Object.keys(multMap) as DemandCategorie[]
  )
    .map((cat) => ({
      categorie: cat,
      label: CAT_LABEL[cat],
      multiplicateur: multMap[cat],
    }))
    .sort((a, b) => b.multiplicateur - a.multiplicateur);

  const multiplicateurMax = multiplicateurs[0]?.multiplicateur ?? 1;

  let countdown: string;
  if (enCours) countdown = `${eventLabel} en cours`;
  else if (joursJusqua === 0) countdown = `${eventLabel} aujourd'hui`;
  else if (joursJusqua === 1) countdown = `J-1 avant ${eventLabel}`;
  else countdown = `J-${joursJusqua} avant ${eventLabel}`;

  return {
    kind,
    titre: MODE_TITRE[kind],
    sous_titre: MODE_SOUS_TITRE[kind],
    countdown_label: countdown,
    jours_jusqua: joursJusqua,
    en_cours: enCours,
    multiplicateur_max: multiplicateurMax,
    multiplicateurs,
    checklist: SEASONAL_CHECKLIST[kind],
  };
}

/**
 * Résout le MODE SAISONNIER actif (ou null hors fenêtre). Un mode
 * s'active dès J-7 d'un événement majeur et reste actif pendant la
 * fête / le mois.
 *
 * Fenêtres d'activation :
 *   • pre_ramadan  : J-7 → J-1 avant le début de Ramadan
 *   • ramadan      : pendant tout le mois de Ramadan (date_debut..fin)
 *   • pre_aid_adha : J-7 → J-1 avant l'Aïd al-Adha
 *   • aid_adha     : pendant les 3 jours de l'Aïd al-Adha
 *
 * Priorité si chevauchement (rare) : la fête EN COURS prime sur une
 * pré-fenêtre ; Aïd al-Adha prime sur Ramadan ; le plus proche prime.
 *
 * Réutilise getHijriContext() pour ne pas dupliquer la logique de dates.
 */
export function getSeasonalMode(today: Date = todayLocal()): SeasonalMode | null {
  const todayMs = today.getTime();
  const PRE_WINDOW = 7; // jours d'anticipation

  const enriched = HIJRI_EVENTS.map((e) => {
    const debut = parseDateLocal(e.date_debut);
    const fin = parseDateLocal(e.date_fin);
    return {
      event: e,
      debut,
      fin,
      joursDebut: Math.round((debut.getTime() - todayMs) / 86_400_000),
      joursFin: Math.round((fin.getTime() - todayMs) / 86_400_000),
    };
  });

  type Cand = { mode: SeasonalMode; priorite: number; proximite: number };
  const cands: Cand[] = [];

  for (const x of enriched) {
    const ev = x.event.evenement;
    const enCours = x.debut.getTime() <= todayMs && x.fin.getTime() >= todayMs;
    const inPreWindow = x.joursDebut > 0 && x.joursDebut <= PRE_WINDOW;

    // Ramadan : fenêtre = du début au fin_10j (couvre tout le mois utile).
    if (ev === "ramadan_debut") {
      if (inPreWindow) {
        cands.push({
          mode: buildMode("pre_ramadan", x.joursDebut, false, "Ramadan"),
          priorite: 2,
          proximite: x.joursDebut,
        });
      }
    }
    // Tout événement Ramadan en cours → mode ramadan.
    if (
      (ev === "ramadan_debut" ||
        ev === "ramadan_milieu" ||
        ev === "ramadan_fin_10j" ||
        ev === "ramadan_fin") &&
      enCours
    ) {
      cands.push({
        mode: buildMode("ramadan", x.joursDebut, true, "Ramadan"),
        priorite: 3,
        proximite: 0,
      });
    }
    // Aïd al-Adha : pré-fenêtre + en cours.
    if (ev === "aid_adha") {
      if (inPreWindow) {
        cands.push({
          mode: buildMode("pre_aid_adha", x.joursDebut, false, "l'Aïd al-Adha"),
          priorite: 4,
          proximite: x.joursDebut,
        });
      }
      if (enCours) {
        cands.push({
          mode: buildMode("aid_adha", x.joursDebut, true, "l'Aïd al-Adha"),
          priorite: 5,
          proximite: 0,
        });
      }
    }
  }

  if (cands.length === 0) return null;

  // Priorité décroissante, puis proximité (le plus imminent gagne).
  cands.sort((a, b) =>
    b.priorite !== a.priorite ? b.priorite - a.priorite : a.proximite - b.proximite,
  );
  return cands[0].mode;
}

/** Salutation contextuelle selon l'heure (matin = "Sabah el khir"). */
export function getSalutation(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 11) return "Sabah el khir";
  if (h < 18) return "Salam";
  return "Msa el khir";
}
