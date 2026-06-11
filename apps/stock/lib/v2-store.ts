"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { safeJsonStorage } from "./utils/safe-storage";
import { supabase } from "@/lib/supabase";
import type { Depot, Employe, EmployeRole } from "@/lib/types/db";

interface V2State {
  hydrated: boolean;
  setHydrated: (v: boolean) => void;

  /** Depot currently active in the UI. Null until first selection. */
  currentDepot: Depot | null;
  setCurrentDepot: (d: Depot | null) => void;

  /** Employee logged in via PIN. */
  currentEmploye: Employe | null;
  setCurrentEmploye: (e: Employe | null) => void;
  logoutEmploye: () => void;
}

export const useV2 = create<V2State>()(
  persist(
    (set) => ({
      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),

      currentDepot: null,
      setCurrentDepot: (d) => set({ currentDepot: d }),

      currentEmploye: null,
      setCurrentEmploye: (e) => set({ currentEmploye: e }),
      logoutEmploye: () => set({ currentEmploye: null }),
    }),
    {
      name: "salam-v2-store",
      // BUG-003 — safeJsonStorage purge auto les clés JSON corrompues
      // (DevTools, écriture interrompue, migration foirée). Sans ça
      // Zustand rehydrate throw → spinner infini sur /v2.
      storage: safeJsonStorage,
      partialize: (s) => ({
        currentDepot: s.currentDepot,
        currentEmploye: s.currentEmploye,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);

/* ────────────────── CRUD Équipe (admin/manager) ──────────────────
 *
 * L'app Stock se connecte avec la clé anon (login par PIN, sans JWT
 * Supabase) : elle ne peut donc pas muter `employes` directement (RLS
 * manager_write_employes). On passe par les RPC SECURITY DEFINER de la
 * migration 20260612000050 qui portent la garde de rôle en interne
 * (l'appelant transmet son employe_id ; le serveur vérifie qu'il est
 * admin/manager). Aucun PIN clair ne transite jamais en lecture.
 *
 * Fallback gracieux : si Supabase est absent (mode démo local) ou si la
 * RPC n'existe pas encore (migration non appliquée), on renvoie un état
 * vide / une erreur lisible — l'UI ne crashe pas.
 */

export interface EmployeAdmin {
  id: string;
  nom: string;
  prenom: string | null;
  role: EmployeRole;
  depot_principal_id: string | null;
  is_active: boolean;
  a_un_pin: boolean;
}

/** Détecte une RPC absente (migration pas encore appliquée) pour fallback. */
function rpcManquante(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("could not find") ||
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("function public.")
  );
}

/** Liste TOUS les employés (actifs + désactivés) pour l'écran admin. */
export async function listEmployesAdmin(
  acteurId: string,
): Promise<{ data: EmployeAdmin[]; error: string | null }> {
  const sb = supabase();
  if (!sb) return { data: [], error: null };
  const { data, error } = await sb.rpc("admin_list_employes", {
    p_acteur_id: acteurId,
  });
  if (error) {
    if (rpcManquante(error.message)) return { data: [], error: null };
    return { data: [], error: error.message };
  }
  return { data: (data ?? []) as EmployeAdmin[], error: null };
}

/** Crée un employé + définit son PIN (hash bcrypt côté serveur). */
export async function createEmployeAdmin(input: {
  acteurId: string;
  nom: string;
  prenom: string | null;
  role: EmployeRole;
  depotPrincipalId: string | null;
  pin: string;
}): Promise<{ id: string | null; error: string | null }> {
  const sb = supabase();
  if (!sb)
    return { id: null, error: "Supabase indisponible (mode démo local)." };
  const { data, error } = await sb.rpc("admin_create_employe", {
    p_acteur_id: input.acteurId,
    p_nom: input.nom,
    p_prenom: input.prenom,
    p_role: input.role,
    p_depot_principal_id: input.depotPrincipalId,
    p_pin: input.pin,
  });
  if (error) return { id: null, error: error.message };
  return { id: (data as string) ?? null, error: null };
}

/** Met à jour rôle / nom / dépôt d'un employé. */
export async function updateEmployeAdmin(input: {
  acteurId: string;
  id: string;
  nom: string;
  prenom: string | null;
  role: EmployeRole;
  depotPrincipalId: string | null;
}): Promise<{ error: string | null }> {
  const sb = supabase();
  if (!sb) return { error: "Supabase indisponible (mode démo local)." };
  const { error } = await sb.rpc("admin_update_employe", {
    p_acteur_id: input.acteurId,
    p_id: input.id,
    p_nom: input.nom,
    p_prenom: input.prenom,
    p_role: input.role,
    p_depot_principal_id: input.depotPrincipalId,
  });
  return { error: error?.message ?? null };
}

/** Active / désactive un employé. */
export async function setEmployeActifAdmin(
  acteurId: string,
  id: string,
  actif: boolean,
): Promise<{ error: string | null }> {
  const sb = supabase();
  if (!sb) return { error: "Supabase indisponible (mode démo local)." };
  const { error } = await sb.rpc("admin_set_employe_actif", {
    p_acteur_id: acteurId,
    p_id: id,
    p_actif: actif,
  });
  return { error: error?.message ?? null };
}

/** Réinitialise le PIN d'un employé (hash bcrypt côté serveur). */
export async function setEmployePinAdmin(
  acteurId: string,
  id: string,
  pin: string,
): Promise<{ error: string | null }> {
  const sb = supabase();
  if (!sb) return { error: "Supabase indisponible (mode démo local)." };
  const { error } = await sb.rpc("admin_set_employe_pin", {
    p_acteur_id: acteurId,
    p_id: id,
    p_pin: pin,
  });
  return { error: error?.message ?? null };
}
