/* lib/db/pointage.ts — Pointage staff (check-in / check-out)
 * ──────────────────────────────────────────────────────────
 * Couche d'accès aux tables `pointages` / `shifts` (migration 0038).
 * Pattern maison : factory `supabase()` (peut être null en local-seed),
 * try/catch implicite via `error` Supabase, retour gracieux (jamais de
 * throw qui casse l'UI). Toute mutation échouée renvoie { ok:false } et
 * la page affiche un toast clair.
 *
 * Le check-in passe par le RPC `pointage_check_in` (résout le shift du
 * jour + détecte l'anomalie retard/sans_planning côté SQL). Le check-out
 * passe par `pointage_check_out`. L'édition admin (arrivée/départ) écrit
 * directement les colonnes check_in/check_out — la durée travaillée est
 * une colonne générée (duree_travaillee_min) donc recalculée par Postgres.
 */

import { supabase } from "@/lib/supabase";

/** Anomalie détectée par les helpers SQL au check-in / check-out. */
export type AnomaliePointage =
  | "aucune"
  | "sans_planning"
  | "retard"
  | "depart_anticipe"
  | "oubli"
  | "pause_trop_longue";

/** Ligne brute de la table `pointages` (colonnes exactes migration 0038). */
export interface Pointage {
  id: string;
  employe_id: string;
  depot_id: string;
  shift_id: string | null;
  jour: string; // date ISO (YYYY-MM-DD)
  check_in: string | null; // timestamptz ISO
  check_out: string | null; // timestamptz ISO
  pause_debut: string | null;
  pause_fin: string | null;
  device_id: string | null;
  anomalie: AnomaliePointage;
  /** Colonne générée par Postgres (lecture seule). Null tant que check_out null. */
  duree_travaillee_min: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Pointage enrichi du prénom/nom de l'employé (jointure). */
export interface PointageAvecEmploye extends Pointage {
  employe_nom: string | null;
  employe_prenom: string | null;
}

export interface MutationResult {
  ok: boolean;
  error?: string;
  pointageId?: string;
}

/** État du jour pour l'employé courant, dérivé de son pointage. */
export type EtatPointage = "pas_pointe" | "au_travail" | "en_pause" | "parti";

function todayISO(): string {
  // Date locale (Europe/Paris côté tablette) au format YYYY-MM-DD.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Liste les pointages d'un jour (par défaut aujourd'hui), enrichis du
 * prénom/nom de l'employé, triés par heure d'arrivée croissante.
 * Retourne [] en cas d'absence de Supabase ou d'erreur (UI gère l'empty).
 */
export async function listPointagesDuJour(
  date?: string,
): Promise<PointageAvecEmploye[]> {
  const sb = supabase();
  if (!sb) return [];
  const jour = date ?? todayISO();
  const { data, error } = await sb
    .from("pointages")
    .select(
      `id, employe_id, depot_id, shift_id, jour, check_in, check_out,
       pause_debut, pause_fin, device_id, anomalie, duree_travaillee_min,
       notes, created_at, updated_at,
       employes ( nom, prenom )`,
    )
    .eq("jour", jour)
    .order("check_in", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("[pointage] listPointagesDuJour error:", error);
    return [];
  }

  type EmpRef = { nom: string | null; prenom: string | null };
  return (data ?? []).map((raw) => {
    // La jointure `employes` revient en objet OU en tableau selon le typage
    // PostgREST. On passe par `unknown` pour éviter un cast direct invalide.
    const row = raw as unknown as Record<string, unknown> & {
      employes?: EmpRef | EmpRef[] | null;
    };
    const empField = row.employes;
    const emp: EmpRef | null = Array.isArray(empField)
      ? (empField[0] ?? null)
      : (empField ?? null);
    const { employes: _omit, ...rest } = row;
    return {
      ...(rest as unknown as Pointage),
      employe_nom: emp?.nom ?? null,
      employe_prenom: emp?.prenom ?? null,
    };
  });
}

/**
 * Récupère le pointage du jour d'un employé donné (le plus récent).
 * Sert à savoir si l'employé courant est pointé / au travail / parti.
 */
export async function getPointageDuJour(
  employeId: string,
  date?: string,
): Promise<Pointage | null> {
  const sb = supabase();
  if (!sb) return null;
  const jour = date ?? todayISO();
  const { data, error } = await sb
    .from("pointages")
    .select(
      `id, employe_id, depot_id, shift_id, jour, check_in, check_out,
       pause_debut, pause_fin, device_id, anomalie, duree_travaillee_min,
       notes, created_at, updated_at`,
    )
    .eq("employe_id", employeId)
    .eq("jour", jour)
    .order("check_in", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[pointage] getPointageDuJour error:", error);
    return null;
  }
  return (data as Pointage | null) ?? null;
}

/** Dérive l'état d'un pointage (utilisé pour le gros bouton du jour). */
export function etatDe(pointage: Pointage | null): EtatPointage {
  if (!pointage || !pointage.check_in) return "pas_pointe";
  if (pointage.check_out) return "parti";
  if (pointage.pause_debut && !pointage.pause_fin) return "en_pause";
  return "au_travail";
}

/**
 * Check-in de l'employé. Passe par le RPC SQL qui résout le shift du jour
 * et détecte l'anomalie (retard / sans planning). `depotId` requis : la
 * table impose depot_id NOT NULL.
 */
export async function clockIn(
  employeId: string,
  depotId: string,
  deviceId?: string,
): Promise<MutationResult> {
  const sb = supabase();
  if (!sb) {
    return { ok: false, error: "Supabase indisponible (mode hors-ligne)." };
  }
  const { data, error } = await sb.rpc("pointage_check_in", {
    p_employe_id: employeId,
    p_depot_id: depotId,
    p_device_id: deviceId ?? null,
  });
  if (error) {
    console.error("[pointage] clockIn error:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true, pointageId: (data as string | null) ?? undefined };
}

/**
 * Check-out de l'employé. Passe par le RPC SQL qui ferme le pointage
 * ouvert et détecte un départ anticipé. On accepte un employeId (cas
 * normal kiosk) — la table garantit un seul pointage ouvert par employé.
 */
export async function clockOut(employeId: string): Promise<MutationResult> {
  const sb = supabase();
  if (!sb) {
    return { ok: false, error: "Supabase indisponible (mode hors-ligne)." };
  }
  const { data, error } = await sb.rpc("pointage_check_out", {
    p_employe_id: employeId,
  });
  if (error) {
    console.error("[pointage] clockOut error:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true, pointageId: (data as string | null) ?? undefined };
}

/**
 * Édition admin/manager d'un pointage : corrige l'arrivée et/ou le départ.
 * `arrivee` / `depart` sont des timestamps ISO (ou null pour effacer).
 * La durée travaillée n'est PAS écrite : duree_travaillee_min est une
 * colonne générée, Postgres la recalcule à partir de check_in/check_out.
 */
export async function updatePointage(
  id: string,
  patch: { arrivee?: string | null; depart?: string | null },
  acteurId: string,
): Promise<MutationResult> {
  const sb = supabase();
  if (!sb) {
    return { ok: false, error: "Supabase indisponible (mode hors-ligne)." };
  }
  // L'écriture anon directe sur `pointages` est fermée (sécu #3) : la
  // correction passe par le RPC SECURITY DEFINER `pointage_corriger`, qui
  // vérifie que l'acteur est admin/manager. Le form fournit toujours les
  // deux horaires (arrivée + départ), on les transmet tels quels.
  const { error } = await sb.rpc("pointage_corriger", {
    p_acteur_id: acteurId,
    p_id: id,
    p_check_in: patch.arrivee ?? null,
    p_check_out: patch.depart ?? null,
  });
  if (error) {
    console.error("[pointage] updatePointage error:", error);
    return { ok: false, error: error.message };
  }
  return { ok: true, pointageId: id };
}

/**
 * Durée travaillée en minutes pour un pointage.
 * Privilégie la colonne générée (duree_travaillee_min, déjà nette de la
 * pause). Fallback : calcul JS à la volée si la colonne est absente mais
 * que check_in/check_out sont présents (ex. édition admin pas re-fetchée).
 */
export function computeHeures(pointage: Pointage): number | null {
  if (
    typeof pointage.duree_travaillee_min === "number" &&
    !Number.isNaN(pointage.duree_travaillee_min)
  ) {
    return pointage.duree_travaillee_min;
  }
  if (!pointage.check_in || !pointage.check_out) return null;
  const inMs = new Date(pointage.check_in).getTime();
  const outMs = new Date(pointage.check_out).getTime();
  if (Number.isNaN(inMs) || Number.isNaN(outMs) || outMs < inMs) return null;
  let minutes = Math.floor((outMs - inMs) / 60000);
  if (pointage.pause_debut && pointage.pause_fin) {
    const pDeb = new Date(pointage.pause_debut).getTime();
    const pFin = new Date(pointage.pause_fin).getTime();
    if (!Number.isNaN(pDeb) && !Number.isNaN(pFin) && pFin > pDeb) {
      minutes -= Math.floor((pFin - pDeb) / 60000);
    }
  }
  return Math.max(0, minutes);
}

/** Formate des minutes en "Hh MMm" (tabular-friendly). "·" si null. */
export function formatHeures(minutes: number | null): string {
  if (minutes === null) return "·";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Formate un timestamp ISO en heure locale HH:MM. "·" si null. */
export function formatHeureHM(iso: string | null): string {
  if (!iso) return "·";
  try {
    return new Date(iso).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "·";
  }
}

/** Convertit "HH:MM" (input type=time) en timestamp ISO sur le jour donné. */
export function timeToISO(jour: string, hhmm: string): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":");
  const d = new Date(`${jour}T${h.padStart(2, "0")}:${m.padStart(2, "0")}:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Extrait "HH:MM" (pour pré-remplir un input type=time) d'un ISO. "" si null. */
export function isoToTimeInput(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes(),
    ).padStart(2, "0")}`;
  } catch {
    return "";
  }
}
