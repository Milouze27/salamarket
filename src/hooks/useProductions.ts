import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Production = Database["public"]["Tables"]["productions"]["Row"];
export type ProductionInsert =
  Database["public"]["Tables"]["productions"]["Insert"];
export type ProductionUpdate =
  Database["public"]["Tables"]["productions"]["Update"];

export type ProductionInput =
  Database["public"]["Tables"]["productions_inputs"]["Row"];
export type ProductionInputInsert =
  Database["public"]["Tables"]["productions_inputs"]["Insert"];

export type ProductionOutput =
  Database["public"]["Tables"]["productions_outputs"]["Row"];
export type ProductionOutputInsert =
  Database["public"]["Tables"]["productions_outputs"]["Insert"];

export type ProductionCoutIndirect =
  Database["public"]["Tables"]["productions_couts_indirects"]["Row"];
export type ProductionCoutIndirectInsert =
  Database["public"]["Tables"]["productions_couts_indirects"]["Insert"];

export const productionsKeys = {
  all: ["productions"] as const,
  list: (filters?: ProductionsFilters) =>
    [...productionsKeys.all, "list", filters] as const,
  detail: (id: string) => [...productionsKeys.all, "detail", id] as const,
  kpi: () => [...productionsKeys.all, "kpi"] as const,
};

export interface ProductionsFilters {
  statut?: string;
  recetteId?: string;
  employeId?: string;
  dateFrom?: string; // ISO date
  dateTo?: string;
}

export type ProductionWithRecette = Production & {
  recette: { id: string; nom: string } | null;
};

export const useProductions = (filters: ProductionsFilters = {}) =>
  useQuery({
    queryKey: productionsKeys.list(filters),
    queryFn: async (): Promise<ProductionWithRecette[]> => {
      let q = supabase
        .from("productions")
        .select("*, recette:recettes(id, nom)")
        .order("date_production", { ascending: false });
      if (filters.statut) q = q.eq("statut", filters.statut);
      if (filters.recetteId) q = q.eq("recette_id", filters.recetteId);
      if (filters.employeId) q = q.eq("employe_responsable_id", filters.employeId);
      if (filters.dateFrom) q = q.gte("date_production", filters.dateFrom);
      if (filters.dateTo) q = q.lte("date_production", filters.dateTo);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ProductionWithRecette[];
    },
    staleTime: 30_000,
  });

export interface ProductionFull {
  production: Production & { recette: { id: string; nom: string } | null };
  inputs: (ProductionInput & {
    produit: { id: string; name: string; unit: string } | null;
  })[];
  outputs: (ProductionOutput & {
    produit: { id: string; name: string; unit: string; tva_taux: number } | null;
  })[];
  couts_indirects: ProductionCoutIndirect[];
}

export const useProduction = (productionId: string | undefined) =>
  useQuery({
    queryKey: productionsKeys.detail(productionId ?? "none"),
    enabled: !!productionId,
    staleTime: 30_000,
    queryFn: async (): Promise<ProductionFull> => {
      if (!productionId) throw new Error("productionId requis");

      const [prodRes, inputsRes, outputsRes, coutsRes] = await Promise.all([
        supabase
          .from("productions")
          .select("*, recette:recettes(id, nom)")
          .eq("id", productionId)
          .single(),
        supabase
          .from("productions_inputs")
          .select("*, produit:products(id,name,unit)")
          .eq("production_id", productionId),
        supabase
          .from("productions_outputs")
          .select("*, produit:products(id,name,unit,tva_taux)")
          .eq("production_id", productionId),
        supabase
          .from("productions_couts_indirects")
          .select("*")
          .eq("production_id", productionId),
      ]);

      if (prodRes.error) throw prodRes.error;
      if (inputsRes.error) throw inputsRes.error;
      if (outputsRes.error) throw outputsRes.error;
      if (coutsRes.error) throw coutsRes.error;

      type ProductionWithRecette = Production & {
        recette: { id: string; nom: string } | null;
      };
      type InputWithProduct = ProductionInput & {
        produit: { id: string; name: string; unit: string } | null;
      };
      type OutputWithProduct = ProductionOutput & {
        produit: {
          id: string;
          name: string;
          unit: string;
          tva_taux: number;
        } | null;
      };

      return {
        production: prodRes.data as ProductionWithRecette,
        inputs: (inputsRes.data ?? []) as InputWithProduct[],
        outputs: (outputsRes.data ?? []) as OutputWithProduct[],
        couts_indirects: coutsRes.data ?? [],
      };
    },
  });

export const useCreateProduction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProductionInsert): Promise<Production> => {
      const { data, error } = await supabase
        .from("productions")
        .insert(input)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: productionsKeys.all }),
  });
};

export const useUpdateProduction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: ProductionUpdate;
    }): Promise<Production> => {
      const { data, error } = await supabase
        .from("productions")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: productionsKeys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: productionsKeys.all });
    },
  });
};

export const useAddProductionInput = (productionId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProductionInputInsert) => {
      const { error } = await supabase
        .from("productions_inputs")
        .insert(input);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: productionsKeys.detail(productionId) }),
  });
};

export const useAddProductionOutput = (productionId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProductionOutputInsert) => {
      const { error } = await supabase
        .from("productions_outputs")
        .insert(input);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: productionsKeys.detail(productionId) }),
  });
};

export const useAddProductionCoutIndirect = (productionId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProductionCoutIndirectInsert) => {
      const { error } = await supabase
        .from("productions_couts_indirects")
        .insert(input);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: productionsKeys.detail(productionId) }),
  });
};
