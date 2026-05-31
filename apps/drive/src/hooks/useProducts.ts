import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Product, ProductUnit, ProductUnitType } from "@/types/product";

// Colonnes weight ajoutées par 0029_drive_au_poids.sql. Si la migration
// n'a pas été appliquée en local, le select tombera en erreur — c'est
// volontaire pour rendre visible l'incompatibilité de schéma.
const PRODUCT_COLUMNS =
  "id, name, description, price_cents, unit, category, image_url, in_stock, unit_type, price_per_kg, estimated_weight_kg, poids_min_kg, poids_max_kg";

export const useProducts = () => {
  return useQuery<Product[]>({
    queryKey: ["products"],
    queryFn: async () => {
      // BUG-002 — on filtre côté serveur les produits en rupture pour
      // éviter qu'ils s'affichent dans le catalogue. La PDP les charge
      // toujours (via useProduct) pour pouvoir afficher l'état "Indispo"
      // si quelqu'un arrive en deep-link sur un produit OOS.
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_COLUMNS)
        .eq("in_stock", true)
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;

      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        priceCents: row.price_cents,
        unit: row.unit as ProductUnit,
        category: row.category,
        imageUrl: row.image_url,
        inStock: row.in_stock,
        unitType: ((row.unit_type as ProductUnitType) ?? "unit") as ProductUnitType,
        pricePerKg: row.price_per_kg,
        estimatedWeightKg: row.estimated_weight_kg,
        poidsMinKg: row.poids_min_kg,
        poidsMaxKg: row.poids_max_kg,
      }));
    },
  });
};
