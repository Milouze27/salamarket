"use client";

/**
 * Couche d'accès aux données staff (shifts + pointages + vue presents).
 *
 * Pattern identique à lib/db/index.ts : si Supabase est branché on tape
 * la DB, sinon on tombe sur un fallback démo local pour que la page
 * reste utilisable même sans env vars (chez Otmane en démo iPad).
 *
 * Cf. supabase/migrations/0038_staff_pointage.sql pour le schéma.
 */

import { supabase } from "@/lib/supabase";
import type { Employe } from "@/lib/types/db";
import type {
  AnomaliePointage,
  EtatPresence,
  Pointage,
  Shift,
  StaffPresent,
} from "@/lib/types/staff-pointage";

/* ────────────────── Fallback démo local ──────────────────
 * Si pas de Supabase (mode démo iPad off-line), on alimente une
 * vue mémoire avec quelques pointages déjà ouverts pour que le
 * bandeau live ait quelque chose à montrer dès le premier paint.
 */
const LOCAL_PRESENTS: StaffPresent[] = [
  {
    pointage_id: "ptg-local-1",
    employe_id: "emp-otmane",
    employe_nom: "Jamal",
    employe_prenom: "Otmane",
    depot_id: "depot-particulier",
    depot_nom: "Particulier",
    check_in: new Date(Date.now() - 2 * 3600_000).toISOString(),
    pause_debut: null,
    pause_fin: null,
    etat: "en_service",
    fin_prevue: "18:00:00",
    anomalie: "aucune",
  },
  {
    pointage_id: "ptg-local-2",
    employe_id: "emp-ilyes",
    employe_nom: "Mehdi",
    employe_prenom: "Ilyes",
    depot_id: "depot-professionnel",
    depot_nom: "Professionnel",
    check_in: new Date(Date.now() - 4 * 3600_000).toISOString(),
    pause_debut: new Date(Date.now() - 15 * 60_000).toISOString(),
    pause_fin: null,
    etat: "en_pause",
    fin_prevue: "16:30:00",
    anomalie: "aucune",
  },
  {
    pointage_id: "ptg-local-3",
    employe_id: "emp-ahmed",
    employe_nom: "Nasri",
    employe_prenom: "Ahmed",
    depot_id: "depot-particulier",
    depot_nom: "Particulier",
    check_in: new Date(Date.now() - 30 * 60_000).toISOString(),
    pause_debut: null,
    pause_fin: null,
    etat: "en_service",
    fin_prevue: "20:00:00",
    anomalie: "retard",
  },
];

/* ────────────────── Présents (vue v_staff_presents) ────────────────── */

export async function listPresents(opts?: {
  depotId?: string;
}): Promise<StaffPresent[]> {
  const sb = supabase();
  if (sb) {
    let q = sb.from("v_staff_presents").select("*");
    if (opts?.depotId) q = q.eq("depot_id", opts.depotId);
    const { data, error } = await q.order("check_in", { ascending: true });
    if (error) {
      // Vue peut ne pas exister en local (migration pas appliquée). On
      // retombe silencieusement sur le seed pour ne pas casser la démo.
      console.warn("[pointage-data] v_staff_presents indispo:", error.message);
      return filterLocal(opts?.depotId);
    }
    return data as StaffPresent[];
  }
  return filterLocal(opts?.depotId);
}

function filterLocal(depotId?: string): StaffPresent[] {
  if (!depotId) return LOCAL_PRESENTS;
  return LOCAL_PRESENTS.filter((p) => p.depot_id === depotId);
}

/* ────────────────── Shifts du jour ────────────────── */

export async function listShiftsDuJour(opts?: {
  depotId?: string;
  jour?: string; // YYYY-MM-DD, default = today
}): Promise<Shift[]> {
  const jour = opts?.jour ?? new Date().toISOString().slice(0, 10);
  const sb = supabase();
  if (sb) {
    let q = sb.from("shifts").select("*").eq("jour", jour);
    if (opts?.depotId) q = q.eq("depot_id", opts.depotId);
    const { data, error } = await q.order("heure_debut");
    if (error) {
      console.warn("[pointage-data] shifts indispo:", error.message);
      return [];
    }
    return data as Shift[];
  }
  return [];
}

/* ────────────────── Employés d'un dépôt (kiosk grid) ────────────────── */

/** Renvoie les employés actifs assignés à un dépôt. Le kiosk les
 *  affiche en grille de tuiles tap → PIN. */
export async function listEmployesPourKiosk(
  depotId: string,
): Promise<Employe[]> {
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb
      .from("employes")
      .select("*")
      .eq("depot_principal_id", depotId)
      .eq("is_active", true)
      .order("prenom", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Employe[];
  }
  // Local fallback : on importe à la volée pour éviter un cycle.
  const { listEmployes } = await import("@/lib/db");
  return listEmployes(depotId);
}

/* ────────────────── Anomalies du jour (cockpit) ────────────────── */

export interface AnomalieDuJour {
  pointage_id: string;
  employe_id: string;
  employe_nom: string;
  employe_prenom: string | null;
  depot_id: string;
  anomalie: AnomaliePointage;
  check_in: string | null;
  check_out: string | null;
}

export async function listAnomaliesDuJour(opts?: {
  depotId?: string;
}): Promise<AnomalieDuJour[]> {
  const today = new Date().toISOString().slice(0, 10);
  const sb = supabase();
  if (sb) {
    let q = sb
      .from("pointages")
      .select(
        "id, employe_id, depot_id, anomalie, check_in, check_out, employes(nom, prenom)",
      )
      .eq("jour", today)
      .neq("anomalie", "aucune");
    if (opts?.depotId) q = q.eq("depot_id", opts.depotId);
    const { data, error } = await q.order("check_in", { ascending: false });
    if (error) {
      console.warn("[pointage-data] anomalies indispo:", error.message);
      return [];
    }
    type Row = {
      id: string;
      employe_id: string;
      depot_id: string;
      anomalie: AnomaliePointage;
      check_in: string | null;
      check_out: string | null;
      employes?:
        | { nom: string; prenom: string | null }
        | { nom: string; prenom: string | null }[]
        | null;
    };
    return ((data ?? []) as unknown as Row[]).map((r) => {
      const emp = Array.isArray(r.employes) ? r.employes[0] : r.employes;
      return {
        pointage_id: r.id,
        employe_id: r.employe_id,
        employe_nom: emp?.nom ?? "—",
        employe_prenom: emp?.prenom ?? null,
        depot_id: r.depot_id,
        anomalie: r.anomalie,
        check_in: r.check_in,
        check_out: r.check_out,
      };
    });
  }
  // Démo locale : on dérive du seed des presents qui ont une anomalie.
  return filterLocal(opts?.depotId)
    .filter((p) => p.anomalie !== "aucune")
    .map((p) => ({
      pointage_id: p.pointage_id,
      employe_id: p.employe_id,
      employe_nom: p.employe_nom,
      employe_prenom: p.employe_prenom,
      depot_id: p.depot_id,
      anomalie: p.anomalie,
      check_in: p.check_in,
      check_out: null,
    }));
}

/* ────────────────── Aggregat pour bandeau (resumé live) ────────────────── */

export interface LiveResume {
  presents_total: number;
  presents_en_pause: number;
  prevus_total: number;
  retards: number;
  presents: StaffPresent[];
}

export async function fetchLiveResume(opts?: {
  depotId?: string;
}): Promise<LiveResume> {
  const [presents, shifts] = await Promise.all([
    listPresents(opts),
    listShiftsDuJour({ depotId: opts?.depotId }),
  ]);
  const presents_total = presents.length;
  const presents_en_pause = presents.filter(
    (p) => p.etat === ("en_pause" as EtatPresence),
  ).length;
  const retards = presents.filter((p) => p.anomalie === "retard").length;
  return {
    presents_total,
    presents_en_pause,
    prevus_total: shifts.length,
    retards,
    presents,
  };
}

/* ────────────────── Wrapper POST /api/pointage ────────────────── */

import type { PointageRequestBody, PointageResponse } from "@/lib/types/staff-pointage";

export async function submitPointage(
  body: PointageRequestBody,
): Promise<PointageResponse> {
  const res = await fetch("/api/pointage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as PointageResponse;
}

/* ────────────────── Utilitaires d'affichage ────────────────── */

export function dureeDepuis(iso: string): string {
  const start = new Date(iso).getTime();
  const minsTotal = Math.max(0, Math.floor((Date.now() - start) / 60_000));
  const h = Math.floor(minsTotal / 60);
  const m = minsTotal % 60;
  if (h === 0) return `${m}'`;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

export function anomalieLabel(a: AnomaliePointage): string {
  switch (a) {
    case "retard":
      return "Retard";
    case "depart_anticipe":
      return "Parti tôt";
    case "sans_planning":
      return "Sans planning";
    case "oubli":
      return "Oubli pointage";
    case "pause_trop_longue":
      return "Pause longue";
    default:
      return "OK";
  }
}

/** Renvoie un type Pointage minimal pour les tests UI / mocks. */
export function emptyPointage(employeId: string, depotId: string): Pointage {
  return {
    id: "tmp-" + Date.now(),
    employe_id: employeId,
    depot_id: depotId,
    shift_id: null,
    jour: new Date().toISOString().slice(0, 10),
    check_in: null,
    check_out: null,
    pause_debut: null,
    pause_fin: null,
    device_id: null,
    anomalie: "aucune",
    duree_travaillee_min: null,
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
