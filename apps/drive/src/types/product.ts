export type ProductUnit = "kg" | "piece" | "pack";

// unit_type — modèle pour le Drive au poids variable.
//   - 'unit'           : prix fixe à l'unité (comportement historique)
//   - 'weight'         : prix au kilo, le client saisit un poids estimé
//   - 'weight_bracket' : prix au choix d'un bracket (poids_min..poids_max)
export type ProductUnitType = "unit" | "weight" | "weight_bracket";

export interface Product {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  unit: ProductUnit;
  category: string;
  imageUrl: string;
  inStock: boolean;

  // Drive au poids — champs optionnels, absents sur les anciens produits.
  // unitType est défaulté à 'unit' côté hook si la colonne est null/absente.
  unitType?: ProductUnitType;
  pricePerKg?: number | null;
  estimatedWeightKg?: number | null;
  poidsMinKg?: number | null;
  poidsMaxKg?: number | null;

  // Date d'ajout au catalogue (products.created_at) — alimente le tri
  // "Nouveautés". Optionnelle : absente si le hook ne la sélectionne pas.
  createdAt?: string | null;
}
