/**
 * Types pour la feature Staff Pointage Kiosk (migration 0038).
 *
 * Otmane (manager K&A FOOD) pilote 16 FTE sur 3 dépôts à la main.
 * Le kiosk iPad + bandeau "qui est là maintenant" résout 80% du
 * problème (saisie excel → automatique) en 3 jours.
 *
 * Cf. /Users/mac/salamarket/supabase/migrations/0038_staff_pointage.sql
 */

export type RoleJour =
  | "caisse"
  | "rayon"
  | "reception"
  | "boucherie"
  | "livraison"
  | "manager"
  | "polyvalent";

export type AnomaliePointage =
  | "aucune"
  | "sans_planning"
  | "retard"
  | "depart_anticipe"
  | "oubli"
  | "pause_trop_longue";

export type PointageAction = "in" | "pause_start" | "pause_end" | "out";

export type EtatPresence = "en_service" | "en_pause";

/** Ligne table `shifts` (planning prévu). */
export interface Shift {
  id: string;
  employe_id: string;
  depot_id: string;
  jour: string; // ISO date YYYY-MM-DD
  heure_debut: string; // HH:MM:SS
  heure_fin: string; // HH:MM:SS
  pause_minutes: number;
  role_jour: RoleJour;
  est_ramadan: boolean;
  cree_par: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Ligne table `pointages` (événements scan). */
export interface Pointage {
  id: string;
  employe_id: string;
  depot_id: string;
  shift_id: string | null;
  jour: string;
  check_in: string | null;
  check_out: string | null;
  pause_debut: string | null;
  pause_fin: string | null;
  device_id: string | null;
  anomalie: AnomaliePointage;
  /** Computed column en SQL (generated always as). */
  duree_travaillee_min: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Ligne de la vue `v_staff_presents` — qui est là maintenant. */
export interface StaffPresent {
  pointage_id: string;
  employe_id: string;
  employe_nom: string;
  employe_prenom: string | null;
  depot_id: string;
  depot_nom: string;
  check_in: string;
  pause_debut: string | null;
  pause_fin: string | null;
  etat: EtatPresence;
  fin_prevue: string | null; // HH:MM:SS de la fin de shift planifiée
  anomalie: AnomaliePointage;
}

/** Body POST /api/pointage */
export interface PointageRequestBody {
  employe_id: string;
  pin: string;
  depot_id: string;
  action: PointageAction;
  device_id?: string;
}

/** Réponse POST /api/pointage */
export type PointageResponse =
  | {
      ok: true;
      action: PointageAction;
      pointage_id: string;
      employe_nom: string;
      employe_prenom: string | null;
      anomalie: AnomaliePointage;
      timestamp: string;
    }
  | {
      ok: false;
      error: string;
      code:
        | "invalid_pin"
        | "employe_not_found"
        | "already_checked_in"
        | "not_checked_in"
        | "already_on_break"
        | "not_on_break"
        | "invalid_body"
        | "server_error";
    };
