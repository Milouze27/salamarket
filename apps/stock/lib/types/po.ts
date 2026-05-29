/* Salam Stock — Purchase Orders + certif halal types
 * Aligned with supabase/migrations/0036_purchase_orders.sql.
 *
 * Pas dans /types/db.ts pour ne pas polluer le fichier de typage hérité
 * — le PO est un sous-domaine qui vit dans son propre namespace.
 */

export type CertifOrganisme =
  | "AVS"
  | "ARGML"
  | "ACMIF"
  | "SFCVH"
  | "MOSQUEE_PARIS"
  | "AUTRE";

export type PoStatut =
  | "brouillon"
  | "envoyee"
  | "confirmee"
  | "partiellement_recue"
  | "recue"
  | "annulee";

/** Niveau de risque sur la certif d'un fournisseur, calculé côté UI à
 * partir de certif_expire_le. La logique : vert > 30j, ambre 0–30j,
 * rouge expirée ou manquante. */
export type CertifAlerte = "ok" | "expire_30j" | "expire_60j" | "expiree" | "manquante";

export interface FournisseurFull {
  id: string;
  nom: string;
  email_commandes: string | null;
  lead_time_jours: number | null;
  min_commande_euros: number | null;
  franco_de_port: number | null;
  jours_livraison: number[] | null;
  certif_organisme: CertifOrganisme | null;
  certif_numero: string | null;
  certif_expire_le: string | null;
  certif_pdf_url: string | null;
  actif: boolean;
  // Champs hérités optionnels
  adresse?: string | null;
  siret?: string | null;
  email?: string | null;
}

export interface ProduitFournisseurRow {
  id: string;
  produit_id: string;
  fournisseur_id: string;
  reference_fourn: string | null;
  prix_achat_ht: number | null;
  conditionnement_qte: number;
  est_principal: boolean;
  derniere_commande_le: string | null;
  notes: string | null;
}

export interface PurchaseOrder {
  id: string;
  numero_po: string;
  fournisseur_id: string;
  depot_destination_id: string;
  statut: PoStatut;
  date_creation: string;
  date_envoi: string | null;
  date_livraison_prevue: string | null;
  date_reception: string | null;
  total_ht: number;
  total_ttc: number;
  email_envoye_a: string | null;
  email_message_id: string | null;
  bdl_id: string | null;
  notes: string | null;
  certif_organisme_snapshot: CertifOrganisme | null;
  certif_numero_snapshot: string | null;
  certif_expire_le_snapshot: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderLigne {
  id: string;
  po_id: string;
  produit_id: string;
  reference_fourn: string | null;
  quantite_commandee: number;
  quantite_recue: number;
  prix_achat_ht: number;
  tva_pct: number;
  ligne_total_ht: number | null;
  notes: string | null;
}

/** Forme jointe utilisée dans la liste dashboard. */
export interface PurchaseOrderWithJoin extends PurchaseOrder {
  fournisseurs: Pick<
    FournisseurFull,
    | "nom"
    | "email_commandes"
    | "certif_organisme"
    | "certif_numero"
    | "certif_expire_le"
  > | null;
  depots: { nom: string } | null;
  purchase_order_lignes?: PurchaseOrderLigne[];
}

/** Token de confirmation public — minimaliste, dérivé du PO id + secret.
 * On NE stocke pas le secret côté DB (pas de table tokens) ; la route
 * /api/po/confirm vérifie en HMAC le couple {po_id, token}. */
export interface ConfirmTokenPayload {
  po_id: string;
  exp: number; // epoch seconds
}

/** Helper UI : transforme une date ISO (ou null) en niveau d'alerte. */
export function certifAlerte(
  expireLe: string | null | undefined
): CertifAlerte {
  if (!expireLe) return "manquante";
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(expireLe + (expireLe.length === 10 ? "T00:00:00" : ""));
  const diffDays = Math.floor(
    (exp.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
  );
  if (diffDays <= 0) return "expiree";
  if (diffDays <= 30) return "expire_30j";
  if (diffDays <= 60) return "expire_60j";
  return "ok";
}

export function joursRestants(expireLe: string | null | undefined): number | null {
  if (!expireLe) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(expireLe + (expireLe.length === 10 ? "T00:00:00" : ""));
  return Math.floor((exp.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}

export const ORGANISME_LABELS: Record<CertifOrganisme, string> = {
  AVS: "AVS",
  ARGML: "ARGML",
  ACMIF: "ACMIF",
  SFCVH: "SFCVH",
  MOSQUEE_PARIS: "Mosquée de Paris",
  AUTRE: "Autre",
};

export const STATUT_LABELS: Record<PoStatut, string> = {
  brouillon: "Brouillon",
  envoyee: "Envoyée",
  confirmee: "Confirmée",
  partiellement_recue: "Partiellement reçue",
  recue: "Reçue",
  annulee: "Annulée",
};
