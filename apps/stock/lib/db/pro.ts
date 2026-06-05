/* lib/db/pro.ts — Couche data B2B PRO (admin staff).
 *
 * NB: pas de "use client". Comme lib/supabase, ce module sert côté client
 * (pages /v2/admin/comptes-pro|commandes-pro|factures-pro) et reste appelable
 * côté server si besoin (digest, cron). La factory supabase() marche sur les
 * deux runtimes.
 *
 * Source de vérité SQL : migration 0025_drive_pro.sql (+ 0028 self-register).
 * Tables LIVE :
 *   - comptes_pro            : comptes clients pro (resto, traiteur, école…)
 *   - commandes_pro          : commandes pro + workflow validation/facturation
 *   - commandes_pro_lignes   : lignes de commande pro
 *
 * Tout est gracieux : si Supabase absent, on renvoie [] sans throw — la page
 * affiche un EmptyState clair. Les mutations renvoient { error } pour que la
 * page toast proprement.
 */

import { supabase } from "@/lib/supabase";

/* ─────────────────────────── Enums (alignés CHECK SQL) ─────────────────── */

export type CompteProStatut =
  | "en_validation"
  | "actif"
  | "suspendu"
  | "archive";

export type ConditionsPaiement = "comptant" | "30_jours" | "45_jours_fin_mois";

export type CommandeProStatut =
  | "a_valider"
  | "validee"
  | "en_preparation"
  | "expediee"
  | "livree"
  | "facturee"
  | "payee"
  | "annulee";

/** Seuil au-delà duquel une commande pro exige la validation d'un manager. */
export const SEUIL_VALIDATION_MANAGER = 500;

/* ─────────────────────────────── Types lignes ──────────────────────────── */

export interface ComptePro {
  id: string;
  raison_sociale: string;
  siret: string;
  forme_juridique: string | null;
  tva_intracom: string | null;
  adresse_facturation: string;
  adresse_livraison: string | null;
  delegue_nom: string;
  delegue_telephone: string;
  delegue_email: string;
  conditions_paiement: ConditionsPaiement;
  encours_max: number;
  encours_actuel: number;
  statut: CompteProStatut;
  notes_interne: string | null;
  valide_at: string | null;
  created_at: string;
}

export interface CommandePro {
  id: string;
  compte_pro_id: string;
  numero_commande: string | null;
  date_commande: string;
  date_livraison_souhaitee: string | null;
  type_recuperation: "livraison" | "retrait_pro";
  statut: CommandeProStatut;
  validee_at: string | null;
  montant_ht: number;
  montant_tva: number;
  montant_ttc: number;
  mode_paiement: string | null;
  facture_numero: string | null;
  date_echeance: string | null;
  date_paiement: string | null;
  notes_client: string | null;
  notes_interne: string | null;
  /** Jointure comptes_pro (raison sociale + conditions + délégué). */
  comptes_pro: {
    id: string;
    raison_sociale: string;
    conditions_paiement: ConditionsPaiement;
    delegue_nom: string;
  } | null;
}

/* ───────────────────────── Labels FR (UI) ──────────────────────────────── */

export const COMPTE_STATUT_LABEL: Record<CompteProStatut, string> = {
  en_validation: "En validation",
  actif: "Actif",
  suspendu: "Suspendu",
  archive: "Archivé",
};

export const COMMANDE_STATUT_LABEL: Record<CommandeProStatut, string> = {
  a_valider: "À valider",
  validee: "Validée",
  en_preparation: "En préparation",
  expediee: "Expédiée",
  livree: "Livrée",
  facturee: "Facturée",
  payee: "Payée",
  annulee: "Annulée",
};

export const CONDITIONS_LABEL: Record<ConditionsPaiement, string> = {
  comptant: "Comptant",
  "30_jours": "30 jours",
  "45_jours_fin_mois": "45 jours fin de mois",
};

/**
 * Étapes ordonnées du workflow d'une commande pro (hors états terminaux
 * annulee). Sert à dériver l'étape suivante dans la page commandes-pro.
 */
export const COMMANDE_WORKFLOW: CommandeProStatut[] = [
  "a_valider",
  "validee",
  "en_preparation",
  "expediee",
  "livree",
  "facturee",
  "payee",
];

/** Renvoie le statut suivant dans le workflow, ou null si terminal. */
export function statutSuivant(
  statut: CommandeProStatut,
): CommandeProStatut | null {
  if (statut === "annulee" || statut === "payee") return null;
  const i = COMMANDE_WORKFLOW.indexOf(statut);
  if (i < 0 || i + 1 >= COMMANDE_WORKFLOW.length) return null;
  return COMMANDE_WORKFLOW[i + 1];
}

/* ──────────────────────────── Comptes PRO ──────────────────────────────── */

export async function fetchComptesPro(): Promise<ComptePro[]> {
  const sb = supabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("comptes_pro")
    .select(
      `id, raison_sociale, siret, forme_juridique, tva_intracom,
       adresse_facturation, adresse_livraison, delegue_nom, delegue_telephone,
       delegue_email, conditions_paiement, encours_max, encours_actuel, statut,
       notes_interne, valide_at, created_at`,
    )
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[pro] fetchComptesPro", error.message);
    return [];
  }
  return (data ?? []) as unknown as ComptePro[];
}

/**
 * Met à jour le statut d'un compte pro.
 * - valider : en_validation → actif (renseigne valide_par_profile_id + valide_at)
 * - suspendre / réactiver : toggle actif ↔ suspendu
 */
export async function setCompteStatut(
  compteId: string,
  statut: CompteProStatut,
  profileId: string | null,
): Promise<{ error: string | null }> {
  const sb = supabase();
  if (!sb) return { error: "Supabase indisponible" };
  const patch: Record<string, unknown> = { statut };
  if (statut === "actif") {
    // valide_par_profile_id : FK profiles(id) SET NULL. On ne l'écrit QUE si
    // l'id fourni ressemble à un UUID profile, sinon NULL pour éviter une FK
    // violation (l'id zustand staff n'est pas garanti présent dans profiles).
    patch.valide_par_profile_id = isUuid(profileId) ? profileId : null;
    patch.valide_at = new Date().toISOString();
  }
  const { error } = await sb
    .from("comptes_pro")
    .update(patch)
    .eq("id", compteId);
  return { error: error?.message ?? null };
}

/* ─────────────────────────── Commandes PRO ─────────────────────────────── */

export async function fetchCommandesPro(): Promise<CommandePro[]> {
  const sb = supabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("commandes_pro")
    .select(
      `id, compte_pro_id, numero_commande, date_commande,
       date_livraison_souhaitee, type_recuperation, statut, validee_at,
       montant_ht, montant_tva, montant_ttc, mode_paiement, facture_numero,
       date_echeance, date_paiement, notes_client, notes_interne,
       comptes_pro (id, raison_sociale, conditions_paiement, delegue_nom)`,
    )
    .order("date_commande", { ascending: false });
  if (error) {
    console.error("[pro] fetchCommandesPro", error.message);
    return [];
  }
  return (data ?? []) as unknown as CommandePro[];
}

/**
 * Avance (ou modifie) le statut d'une commande pro.
 * Sur passage à 'validee', renseigne validee_par_profile_id + validee_at.
 * Le numéro de facture (F-2026-XXXX) est généré côté DB par le trigger
 * trg_gen_facture_numero au passage à 'facturee'.
 */
export async function setCommandeStatut(
  commandeId: string,
  statut: CommandeProStatut,
  profileId: string | null,
): Promise<{ error: string | null }> {
  const sb = supabase();
  if (!sb) return { error: "Supabase indisponible" };
  const patch: Record<string, unknown> = { statut };
  if (statut === "validee") {
    // validee_par_profile_id : FK profiles(id) SET NULL — cf. setCompteStatut.
    patch.validee_par_profile_id = isUuid(profileId) ? profileId : null;
    patch.validee_at = new Date().toISOString();
  }
  const { error } = await sb
    .from("commandes_pro")
    .update(patch)
    .eq("id", commandeId);
  return { error: error?.message ?? null };
}

/** Marque une commande facturée comme payée (statut payee + date_paiement). */
export async function marquerPayee(
  commandeId: string,
): Promise<{ error: string | null }> {
  const sb = supabase();
  if (!sb) return { error: "Supabase indisponible" };
  const { error } = await sb
    .from("commandes_pro")
    .update({ statut: "payee", date_paiement: new Date().toISOString() })
    .eq("id", commandeId);
  return { error: error?.message ?? null };
}

/* ───────────────────────────── Helpers UI ──────────────────────────────── */

/** Une facture est en retard si l'échéance est passée et qu'elle n'est pas payée. */
export function estEnRetard(c: CommandePro, today = new Date()): boolean {
  if (c.statut === "payee" || c.statut === "annulee") return false;
  if (!c.date_echeance) return false;
  const ech = new Date(c.date_echeance + "T23:59:59");
  return today.getTime() > ech.getTime();
}

/** Nombre de jours de retard (>=0). 0 si pas en retard. */
export function joursRetard(c: CommandePro, today = new Date()): number {
  if (!estEnRetard(c, today) || !c.date_echeance) return 0;
  const ech = new Date(c.date_echeance + "T00:00:00");
  return Math.floor((today.getTime() - ech.getTime()) / 86_400_000);
}

/** Vrai si la chaîne ressemble à un UUID v4 canonique (FK profiles safe). */
function isUuid(v: string | null | undefined): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}
