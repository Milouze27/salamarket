import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Product, ProductUnit, ProductUnitType } from "@/types/product";

const PRODUCT_COLUMNS =
  "id, name, description, price_cents, unit, category, image_url, in_stock, unit_type, price_per_kg, estimated_weight_kg, poids_min_kg, poids_max_kg";

export const useProduct = (id: string | undefined) => {
  return useQuery<Product | null>({
    queryKey: ["product", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_COLUMNS)
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        name: data.name,
        description: data.description,
        priceCents: data.price_cents,
        unit: data.unit as ProductUnit,
        category: data.category,
        imageUrl: data.image_url,
        inStock: data.in_stock,
        unitType: ((data.unit_type as ProductUnitType) ?? "unit") as ProductUnitType,
        pricePerKg: data.price_per_kg,
        estimatedWeightKg: data.estimated_weight_kg,
        poidsMinKg: data.poids_min_kg,
        poidsMaxKg: data.poids_max_kg,
      };
    },
  });
};
