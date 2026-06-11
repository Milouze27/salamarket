/**
 * Hijri (Drive) — util dates côté client B2C.
 *
 * Version allégée du moteur saisonnier de Stock (apps/stock/lib/hijri.ts).
 * Ici on n'a pas besoin des multiplicateurs de demande / checklists staff :
 * le Drive veut juste savoir, pour la home, quelle OCCASION est en cours
 * (Ramadan / Aïd) pour :
 *   1. afficher un bandeau contextuel (RamadanBanner),
 *   2. brancher le BundleCarousel sur la bonne occasion (occasion_bundles.occasion).
 *
 * Dates MFCM Paris — MIROIR du seed `hijri_events` (migration 0034) et de
 * apps/stock/lib/hijri.ts. Si tu changes l'une, change les autres.
 *
 * Pas de dépendance réseau : tout est calculé localement à partir d'un petit
 * tableau hardcodé. Aucune lecture Supabase ici.
 */

export type HijriEventType =
  | "ramadan_debut"
  | "ramadan_fin_10j"
  | "aid_fitr"
  | "aid_adha"
  | "achoura";

/** Occasions canoniques de la table `occasion_bundles.occasion`. */
export type OccasionBundleKey =
  | "ramadan_iftar"
  | "eid_fitr"
  | "eid_adha"
  | "achoura"
  | "general";

interface HijriEvent {
  type: HijriEventType;
  /** Début de la fenêtre d'affichage (ISO YYYY-MM-DD). */
  date_debut: string;
  /** Fin de la fenêtre d'affichage (ISO YYYY-MM-DD). */
  date_fin: string;
  annee_hijri: number;
}

/**
 * Fenêtres d'événements. Pour le Drive on étend volontairement les fenêtres
 * Ramadan jusqu'au début de l'Aïd al-Fitr (le mois entier compte côté client)
 * et on garde les bornes officielles pour les Aïd.
 *
 * Mirroir des dates de hijri_events (cf. apps/stock/lib/hijri.ts).
 */
const HIJRI_EVENTS: HijriEvent[] = [
  // 1447 (2026)
  { type: "ramadan_debut",   date_debut: "2026-02-18", date_fin: "2026-03-19", annee_hijri: 1447 },
  { type: "ramadan_fin_10j", date_debut: "2026-03-10", date_fin: "2026-03-19", annee_hijri: 1447 },
  { type: "aid_fitr",        date_debut: "2026-03-20", date_fin: "2026-03-22", annee_hijri: 1447 },
  { type: "aid_adha",        date_debut: "2026-05-27", date_fin: "2026-05-29", annee_hijri: 1447 },
  { type: "achoura",         date_debut: "2026-06-26", date_fin: "2026-06-26", annee_hijri: 1448 },
  // 1448 (2027)
  { type: "ramadan_debut",   date_debut: "2027-02-08", date_fin: "2027-03-09", annee_hijri: 1448 },
  { type: "aid_fitr",        date_debut: "2027-03-10", date_fin: "2027-03-12", annee_hijri: 1448 },
  { type: "aid_adha",        date_debut: "2027-05-17", date_fin: "2027-05-19", annee_hijri: 1448 },
  // 1449 (2028)
  { type: "ramadan_debut",   date_debut: "2028-01-28", date_fin: "2028-02-26", annee_hijri: 1449 },
  { type: "aid_fitr",        date_debut: "2028-02-27", date_fin: "2028-03-01", annee_hijri: 1449 },
  { type: "aid_adha",        date_debut: "2028-05-06", date_fin: "2028-05-08", annee_hijri: 1449 },
  // 1450 (2029)
  { type: "ramadan_debut",   date_debut: "2029-01-16", date_fin: "2029-02-14", annee_hijri: 1450 },
  { type: "aid_fitr",        date_debut: "2029-02-15", date_fin: "2029-02-17", annee_hijri: 1450 },
  { type: "aid_adha",        date_debut: "2029-04-25", date_fin: "2029-04-27", annee_hijri: 1450 },
  // 1451 (2030)
  { type: "ramadan_debut",   date_debut: "2030-01-06", date_fin: "2030-02-04", annee_hijri: 1451 },
  { type: "aid_fitr",        date_debut: "2030-02-05", date_fin: "2030-02-07", annee_hijri: 1451 },
  { type: "aid_adha",        date_debut: "2030-04-14", date_fin: "2030-04-16", annee_hijri: 1451 },
];

/** Fenêtre d'anticipation (jours) : on bascule l'app en mode fête dès J-7. */
const PRE_WINDOW_DAYS = 7;

/** Parse YYYY-MM-DD en Date locale minuit (évite la dérive UTC -1h à Paris). */
function parseDateLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/** Aujourd'hui à minuit, fuseau local. */
function todayLocal(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

/** Mapping type d'événement → occasion canonique occasion_bundles. */
const EVENT_TO_OCCASION: Record<HijriEventType, OccasionBundleKey> = {
  ramadan_debut: "ramadan_iftar",
  ramadan_fin_10j: "ramadan_iftar",
  aid_fitr: "eid_fitr",
  aid_adha: "eid_adha",
  achoura: "achoura",
};

export interface DriveHijriContext {
  /** Occasion canonique active (pour filtrer occasion_bundles), ou null. */
  occasion: OccasionBundleKey | null;
  /** Type d'événement pivot retenu, ou null hors fenêtre. */
  type: HijriEventType | null;
  /** True si on est DANS la fenêtre d'affichage (vs en pré-fenêtre J-7). */
  en_cours: boolean;
  /** Jours jusqu'au début de l'événement (≤0 = déjà commencé). */
  jours_jusqua: number;
  /** True si on est dans les 10 dernières nuits de Ramadan. */
  dix_dernieres_nuits: boolean;
}

/**
 * Résout le contexte hijri du jour pour le Drive.
 *
 * Priorité : un événement EN COURS prime sur une pré-fenêtre ; à priorité
 * égale, le plus imminent gagne. Hors de toute fenêtre (et hors pré-fenêtre
 * J-7) → occasion null (la home reste neutre, pas de bandeau fête).
 */
export function getDriveHijriContext(
  today: Date = todayLocal(),
): DriveHijriContext {
  const todayMs = today.getTime();

  const enriched = HIJRI_EVENTS.map((e) => {
    const debut = parseDateLocal(e.date_debut);
    const fin = parseDateLocal(e.date_fin);
    const enCours = debut.getTime() <= todayMs && fin.getTime() >= todayMs;
    const joursDebut = Math.round((debut.getTime() - todayMs) / 86_400_000);
    return { event: e, debut, fin, enCours, joursDebut };
  });

  type Cand = {
    type: HijriEventType;
    enCours: boolean;
    joursDebut: number;
    /** Score de priorité : en cours (2) > pré-fenêtre (1). */
    priorite: number;
    proximite: number;
  };
  const cands: Cand[] = [];

  for (const x of enriched) {
    if (x.enCours) {
      cands.push({
        type: x.event.type,
        enCours: true,
        joursDebut: x.joursDebut,
        priorite: 2,
        proximite: 0,
      });
      continue;
    }
    if (x.joursDebut > 0 && x.joursDebut <= PRE_WINDOW_DAYS) {
      cands.push({
        type: x.event.type,
        enCours: false,
        joursDebut: x.joursDebut,
        priorite: 1,
        proximite: x.joursDebut,
      });
    }
  }

  if (cands.length === 0) {
    return {
      occasion: null,
      type: null,
      en_cours: false,
      jours_jusqua: 0,
      dix_dernieres_nuits: false,
    };
  }

  cands.sort((a, b) =>
    b.priorite !== a.priorite
      ? b.priorite - a.priorite
      : a.proximite - b.proximite,
  );
  const winner = cands[0];

  // Les 10 dernières nuits : un événement ramadan_fin_10j en cours.
  const dixDernieres = enriched.some(
    (x) => x.event.type === "ramadan_fin_10j" && x.enCours,
  );

  return {
    occasion: EVENT_TO_OCCASION[winner.type],
    type: winner.type,
    en_cours: winner.enCours,
    jours_jusqua: winner.joursDebut,
    dix_dernieres_nuits: dixDernieres,
  };
}
