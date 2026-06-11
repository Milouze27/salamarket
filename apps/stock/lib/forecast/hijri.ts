/**
 * Hijri calendar helpers — phase resolver pour le moteur de stockout.
 *
 * Le moteur prédictif a besoin de savoir : "où est-on dans l'année hijri
 * aujourd'hui ?" → réponse = une enum `HijriPhase` qui matche
 * `hijri_demand_curve.phase` (migration 0035). On multiplie ensuite la
 * vitesse Holt par le multiplicateur de la phase × catégorie.
 *
 * IMPORTANT : on n'a PAS de lib hijri (constraint "don't add npm deps").
 * On utilise donc `Intl.DateTimeFormat('en-US-u-ca-islamic-umalqura')`
 * disponible nativement dans Node 20+ et tous les navigateurs modernes.
 * C'est le calendrier officiel saoudien — celui qu'utilise la majorité
 * de la communauté halal en France.
 *
 * Précision suffisante pour notre besoin (à ±1 jour près sur les bords
 * de mois, ce qui est dans la marge des annonces officielles de toute
 * façon — l'observation lunaire reste l'autorité finale).
 *
 * Phases gérées (chaque clé = enum SQL `hijri_phase`) :
 *   - normal           : par défaut, hors fenêtre
 *   - pre_ramadan_j7   : 7 derniers jours de Cha'ban (mois 8)
 *   - ramadan_debut    : jours 1-10 de Ramadan (mois 9)
 *   - ramadan_milieu   : jours 11-20
 *   - ramadan_fin_10j  : jours 21-30 (10 dernières nuits, laylat al-qadr)
 *   - aid_fitr_j3      : Chawwal (mois 10) jours 1-3
 *   - pre_aid_adha_j7  : 7 jours avant le 10 Dhul Hijja (mois 12)
 *   - aid_adha_j3      : Dhul Hijja jours 10-12
 *   - achoura_j3       : Muharram (mois 1) jours 9-11
 */

export type HijriPhase =
  | "normal"
  | "pre_ramadan_j7"
  | "ramadan_debut"
  | "ramadan_milieu"
  | "ramadan_fin_10j"
  | "aid_fitr_j3"
  | "pre_aid_adha_j7"
  | "aid_adha_j3"
  | "achoura_j3";

export interface HijriDate {
  /** Année hijri (ex 1447). */
  year: number;
  /** Mois 1-12 (1=Muharram, 9=Ramadan, 12=Dhul Hijja). */
  month: number;
  /** Jour 1-30. */
  day: number;
}

/**
 * Convertit une date grégorienne en date hijri (Umm al-Qura).
 * Utilise `Intl.DateTimeFormat` — pas de dépendance externe.
 */
export function toHijri(date: Date): HijriDate {
  const fmt = new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: "Europe/Paris",
  });
  const parts = fmt.formatToParts(date);
  let year = 0;
  let month = 0;
  let day = 0;
  for (const p of parts) {
    if (p.type === "year") year = parseInt(p.value.replace(/[^0-9]/g, ""), 10);
    if (p.type === "month") month = parseInt(p.value, 10);
    if (p.type === "day") day = parseInt(p.value, 10);
  }
  return { year, month, day };
}

/**
 * Nombre approximatif de jours entre `from` et `to` (positif si `to`
 * est dans le futur). Calcul grossier suffisant pour des fenêtres < 60j.
 */
export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * Cherche la prochaine date grégorienne où le calendrier hijri sera
 * (`targetMonth`, `targetDay`) — utile pour calculer "dans combien de
 * jours commence Ramadan ?".
 *
 * Algo brute-force : on avance jour par jour pendant max 400 jours
 * (un cycle hijri complet = ~355j). C'est négligeable en perf et plus
 * simple/sûr qu'une conversion inverse fait main.
 */
export function nextGregorianForHijri(
  from: Date,
  targetMonth: number,
  targetDay: number,
): Date | null {
  for (let i = 0; i <= 400; i++) {
    const candidate = new Date(from.getTime() + i * 86_400_000);
    const h = toHijri(candidate);
    if (h.month === targetMonth && h.day === targetDay) return candidate;
  }
  return null;
}

/**
 * Phase hijri courante à la date donnée (UTC par défaut). Renvoie aussi
 * un label humain pour affichage UI + le multiplicateur de proximité
 * (1.0 si on est dedans, ramp linéaire 0.0→1.0 sur les J-X de pré-phase).
 *
 * Ordre de priorité si plusieurs phases se chevauchent (cas rare mais
 * possible quand les Aïd tombent près de la fin d'un mois) :
 *   aid_adha > aid_fitr > pre_aid_adha > ramadan_fin > ramadan_milieu
 *   > ramadan_debut > pre_ramadan > achoura > normal
 */
export interface HijriContext {
  phase: HijriPhase;
  hijri: HijriDate;
  /** Label FR pour l'UI (ex "Ramadan — 2e décade"). */
  label: string;
  /** Si phase = pre_*, combien de jours avant le début. Sinon null. */
  daysUntilNext: number | null;
  /** Nom de la prochaine grosse fête à venir, pour le storytelling UI. */
  nextEventLabel: string;
  nextEventDate: Date | null;
  /** Nb de jours jusqu'au prochain événement. */
  nextEventDaysAway: number | null;
}

const PHASE_LABEL: Record<HijriPhase, string> = {
  normal: "Période normale",
  pre_ramadan_j7: "Pré-Ramadan (J-7)",
  ramadan_debut: "Ramadan — 1re décade",
  ramadan_milieu: "Ramadan — 2e décade",
  ramadan_fin_10j: "Ramadan — 10 dernières nuits",
  aid_fitr_j3: "Aïd al-Fitr (J+1 à J+3)",
  pre_aid_adha_j7: "Pré-Aïd al-Adha (J-7)",
  aid_adha_j3: "Aïd al-Adha (J à J+2)",
  achoura_j3: "Achoura",
};

/** Label FR d'une phase hijri (pour l'UI, jamais l'enum brute). Accepte une
 *  string libre (ex. valeur DB) → fallback « Période normale » si inconnue. */
export function hijriPhaseLabel(phase: HijriPhase | string): string {
  return PHASE_LABEL[phase as HijriPhase] ?? "Période normale";
}

export function resolveHijriContext(now: Date = new Date()): HijriContext {
  const hijri = toHijri(now);

  // Détection phase courante (ordre = priorité décroissante).
  let phase: HijriPhase = "normal";

  // Aïd al-Adha : 10/11/12 Dhul Hijja (mois 12).
  if (hijri.month === 12 && hijri.day >= 10 && hijri.day <= 12) {
    phase = "aid_adha_j3";
  }
  // Aïd al-Fitr : 1/2/3 Chawwal (mois 10).
  else if (hijri.month === 10 && hijri.day <= 3) {
    phase = "aid_fitr_j3";
  }
  // Pré-Aïd al-Adha : 3 → 9 Dhul Hijja (les 7 jours qui précèdent le 10).
  else if (hijri.month === 12 && hijri.day >= 3 && hijri.day <= 9) {
    phase = "pre_aid_adha_j7";
  }
  // Ramadan (mois 9).
  else if (hijri.month === 9) {
    if (hijri.day >= 21) phase = "ramadan_fin_10j";
    else if (hijri.day >= 11) phase = "ramadan_milieu";
    else phase = "ramadan_debut";
  }
  // Pré-Ramadan : derniers 7 jours de Cha'ban (mois 8, jours 22-30 environ).
  else if (hijri.month === 8 && hijri.day >= 22) {
    phase = "pre_ramadan_j7";
  }
  // Achoura : 9/10/11 Muharram (mois 1).
  else if (hijri.month === 1 && hijri.day >= 9 && hijri.day <= 11) {
    phase = "achoura_j3";
  }

  // Calcul du prochain événement clé (Ramadan ou Aïd selon ce qui vient).
  const nextRamadanStart = nextGregorianForHijri(now, 9, 1);
  const nextAidAdha = nextGregorianForHijri(now, 12, 10);
  const nextAchoura = nextGregorianForHijri(now, 1, 10);

  const candidates: Array<{ label: string; date: Date | null }> = [
    { label: "Ramadan", date: nextRamadanStart },
    { label: "Aïd al-Adha", date: nextAidAdha },
    { label: "Achoura", date: nextAchoura },
  ];
  const futureSorted = candidates
    .filter((c) => c.date && c.date.getTime() > now.getTime())
    .sort((a, b) => (a.date!.getTime() - b.date!.getTime()));
  const nextEvent = futureSorted[0] ?? { label: "Ramadan", date: null };
  const nextEventDaysAway = nextEvent.date ? daysBetween(now, nextEvent.date) : null;

  // Si phase = pre_* on note combien de jours avant le début "réel".
  let daysUntilNext: number | null = null;
  if (phase === "pre_ramadan_j7" && nextRamadanStart) {
    daysUntilNext = daysBetween(now, nextRamadanStart);
  } else if (phase === "pre_aid_adha_j7" && nextAidAdha) {
    daysUntilNext = daysBetween(now, nextAidAdha);
  }

  return {
    phase,
    hijri,
    label: PHASE_LABEL[phase],
    daysUntilNext,
    nextEventLabel: nextEvent.label,
    nextEventDate: nextEvent.date,
    nextEventDaysAway,
  };
}

/**
 * Format hijri humain : "14 Ramadan 1447".
 */
const HIJRI_MONTH_FR = [
  "",
  "Muharram",
  "Safar",
  "Rabi al-awwal",
  "Rabi al-thani",
  "Joumada al-oula",
  "Joumada al-thania",
  "Rajab",
  "Cha'ban",
  "Ramadan",
  "Chawwal",
  "Dhul Qi'da",
  "Dhul Hijja",
];

export function formatHijri(h: HijriDate): string {
  const m = HIJRI_MONTH_FR[h.month] ?? `M${h.month}`;
  return `${h.day} ${m} ${h.year}`;
}
