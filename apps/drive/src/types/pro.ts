// Types métier Drive Pro — dérivés des types DB générés.
// Source de vérité : src/integrations/supabase/types.ts
//
// On expose ici :
// - Des alias courts (ComptePro, CommandePro, …)
// - Des unions string littérales pour les statuts (la DB stocke text +
//   contraintes CHECK, on duplique la liste côté front pour le typage).
// - Des helpers de display (labels FR + couleurs).

import type { Database } from "@/integrations/supabase/types";

export type ComptePro = Database["public"]["Tables"]["comptes_pro"]["Row"];
export type ComptesProInsert =
  Database["public"]["Tables"]["comptes_pro"]["Insert"];
export type ComptesProUpdate =
  Database["public"]["Tables"]["comptes_pro"]["Update"];

export type CommandePro = Database["public"]["Tables"]["commandes_pro"]["Row"];
export type CommandesProInsert =
  Database["public"]["Tables"]["commandes_pro"]["Insert"];
export type CommandesProUpdate =
  Database["public"]["Tables"]["commandes_pro"]["Update"];

export type CommandeProLigne =
  Database["public"]["Tables"]["commandes_pro_lignes"]["Row"];
export type CommandeProLigneInsert =
  Database["public"]["Tables"]["commandes_pro_lignes"]["Insert"];

export type ProduitProPrix =
  Database["public"]["Tables"]["produits_pro_prix"]["Row"];

export type Product = Database["public"]["Tables"]["products"]["Row"];

// ─────────────────────────────────────────────────────────────────────
// Statuts (alignés sur les CHECK posés en DB)
// ─────────────────────────────────────────────────────────────────────

export type StatutComptePro =
  | "en_validation"
  | "actif"
  | "suspendu"
  | "archive";

export const STATUTS_COMPTE_PRO: readonly StatutComptePro[] = [
  "en_validation",
  "actif",
  "suspendu",
  "archive",
] as const;

export const LABEL_STATUT_COMPTE: Record<StatutComptePro, string> = {
  en_validation: "En validation",
  actif: "Actif",
  suspendu: "Suspendu",
  archive: "Archivé",
};

export type StatutCommandePro =
  | "a_valider"
  | "validee"
  | "en_preparation"
  | "expediee"
  | "livree"
  | "facturee"
  | "payee"
  | "annulee";

export const STATUTS_COMMANDE_PRO: readonly StatutCommandePro[] = [
  "a_valider",
  "validee",
  "en_preparation",
  "expediee",
  "livree",
  "facturee",
  "payee",
  "annulee",
] as const;

export const LABEL_STATUT_COMMANDE: Record<StatutCommandePro, string> = {
  a_valider: "À valider",
  validee: "Validée",
  en_preparation: "En préparation",
  expediee: "Expédiée",
  livree: "Livrée",
  facturee: "Facturée",
  payee: "Payée",
  annulee: "Annulée",
};

export type ConditionsPaiement = "comptant" | "30_jours" | "45_jours_fin_mois";

export const LABEL_CONDITIONS_PAIEMENT: Record<ConditionsPaiement, string> = {
  comptant: "Comptant",
  "30_jours": "30 jours",
  "45_jours_fin_mois": "45 jours fin de mois",
};

export type FormeJuridique = "SARL" | "SAS" | "EI" | "Association";
export const FORMES_JURIDIQUES: readonly FormeJuridique[] = [
  "SARL",
  "SAS",
  "EI",
  "Association",
] as const;

// ─────────────────────────────────────────────────────────────────────
// Types composites pour les jointures fréquentes
// ─────────────────────────────────────────────────────────────────────

export interface ProduitProAvecProduit extends ProduitProPrix {
  products: Pick<
    Product,
    | "id"
    | "name"
    | "image_url"
    | "description"
    | "tva_taux"
    | "unit"
    | "category"
  > | null;
}

export interface CommandeProAvecCompte extends CommandePro {
  comptes_pro: Pick<
    ComptePro,
    | "id"
    | "raison_sociale"
    | "siret"
    | "adresse_facturation"
    | "adresse_livraison"
    | "delegue_email"
    | "delegue_nom"
  > | null;
}

export interface LigneAvecProduit extends CommandeProLigne {
  products: Pick<Product, "id" | "name" | "image_url" | "unit"> | null;
}

// Helper : couleur badge pour un statut commande.
export const colorStatutCommande = (
  statut: string,
): "default" | "secondary" | "destructive" | "outline" => {
  switch (statut) {
    case "a_valider":
      return "outline";
    case "validee":
    case "en_preparation":
      return "secondary";
    case "expediee":
    case "livree":
      return "default";
    case "facturee":
    case "payee":
      return "default";
    case "annulee":
      return "destructive";
    default:
      return "outline";
  }
};
