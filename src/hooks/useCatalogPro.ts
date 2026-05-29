// Hook : catalogue Drive Pro (tarifs Pro actifs + jointure produit).
// On filtre actif=true ET disponible_drive_pro=true en SQL.
// On garde la date valide_a_partir_de <= today.

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ProduitProAvecProduit } from "@/types/pro";

export const CATALOG_PRO_QUERY_KEY = ["catalog-pro"] as const;

const fetchCatalog = async (): Promise<ProduitProAvecProduit[]> => {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("produits_pro_prix")
    .select(
      `
      *,
      products:produit_id (
        id,
        name,
        image_url,
        description,
        tva_taux,
        unit,
        category
      )
    `,
    )
    .eq("actif", true)
    .eq("disponible_drive_pro", true)
    .lte("valide_a_partir_de", today);
  if (error) throw error;
  // Filtre côté JS les lignes orphelines (produit supprimé).
  return ((data ?? []) as ProduitProAvecProduit[]).filter(
    (row) => row.products !== null,
  );
};

export function useCatalogPro() {
  const query = useQuery({
    queryKey: CATALOG_PRO_QUERY_KEY,
    queryFn: fetchCatalog,
    staleTime: 60_000,
  });

  return {
    catalog: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
