/**
 * Types partagés du flow réception BDL (apps/stock/app/v2/reception/[id]).
 * Extrait du god component lors du split ARCH-06 — aucune modification de forme,
 * simple centralisation pour que page.tsx + sous-composants partagent le contrat.
 */

export interface BdlLigne {
  id: string;
  produit_id: string | null;
  code_barre_attendu: string | null;
  quantite_attendue: number;
  quantite_recue: number;
  prix_achat_ht: number | null;
  statut: "attendu" | "recu" | "manquant" | "surplus";
  produits?: {
    id: string;
    nom: string;
    ean: string | null;
    categorie: string | null;
  } | null;
}

export interface BdlDetail {
  id: string;
  numero_bdl: string;
  numero_bdl_fournisseur: string | null;
  fournisseur_id: string | null;
  depot_destination_id: string | null;
  date_livraison_prevue: string;
  statut: "prevue" | "en_cours" | "receptionnee" | "litige";
  photo_palette_url_1: string | null;
  photo_palette_url_2: string | null;
  photo_bdl_url: string | null;
  notes: string | null;
  fournisseurs: { id: string; nom: string } | null;
  depots: { id: string; nom: string } | null;
  bons_de_livraison_lignes: BdlLigne[];
}

/** Progression dérivée (unités scannées / attendues). */
export interface Progression {
  scanned: number;
  total: number;
  pct: number;
}

/** État du flow d'apprentissage carton↔produit. */
export interface LearnCartonState {
  code: string;
  step: "qty" | "pick";
  qty: number;
}

/** État du modal surplus (EAN catalogue hors BDL). */
export interface SurplusState {
  code: string;
  produitNom: string;
  produitId: string;
}

/** Résultat d'une recherche produit dans le picker carton. */
export interface CartonSearchHit {
  id: string;
  nom: string;
  ean: string | null;
  categorie: string | null;
}
