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
 * achoura, mouloud) pour pouvoir afficher des contextes précis :
 *   • "Ramadan dans 28 jours" (vs ramadan_debut)
 *   • "10 derniers jours de Ramadan dans 18j" (vs ramadan_fin_10j)
 *   • "Aïd al-Adha dans 9 jours — sacrifice mouton" (vs aid_adha)
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
  { evenement: "mouloud",          date_debut: "2026-08-25", date_fin: "2026-08-25", annee_hijri: 1448, libelle: "Mouloud 1448",                 impact_ca: "faible" },
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
 *      ou 'fort' uniquement — Mouloud à 4 mois on s'en moque).
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
      fenetre_90j: enriched
        .filter((x) => x.jours_jusqua_debut > 0 && x.jours_jusqua_debut <= 90)
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
    fenetre_90j: futurs
      .filter((x) => x.jours_jusqua_debut <= 90)
      .map((x) => ({ event: x.event, jours_jusqua: x.jours_jusqua_debut })),
  };
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/** Salutation contextuelle selon l'heure (matin = "Sabah el khir"). */
export function getSalutation(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 11) return "Sabah el khir";
  if (h < 18) return "Salam";
  return "Msa el khir";
}
