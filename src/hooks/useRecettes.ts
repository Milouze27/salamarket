import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Recette = Database["public"]["Tables"]["recettes"]["Row"];
export type RecetteInsert = Database["public"]["Tables"]["recettes"]["Insert"];
export type RecetteUpdate = Database["public"]["Tables"]["recettes"]["Update"];

export const recettesKeys = {
  all: ["recettes"] as const,
  list: (filters?: { statut?: string }) => [...recettesKeys.all, "list", filters] as const,
  detail: (id: string) => [...recettesKeys.all, "detail", id] as const,
};

interface UseRecettesFilters {
  statut?: string;
}

export const useRecettes = (filters: UseRecettesFilters = {}) =>
  useQuery({
    queryKey: recettesKeys.list(filters),
    queryFn: async (): Promise<Recette[]> => {
      let q = supabase
        .from("recettes")
        .select("*")
        .order("nom", { ascending: true });
      if (filters.statut) {
        q = q.eq("statut", filters.statut);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

export const useCreateRecette = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecetteInsert): Promise<Recette> => {
      const { data, error } = await supabase
        .from("recettes")
        .insert(input)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: recettesKeys.all });
    },
  });
};

export const useUpdateRecette = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: RecetteUpdate;
    }): Promise<Recette> => {
      const { data, error } = await supabase
        .from("recettes")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: recettesKeys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: recettesKeys.all });
    },
  });
};

export const useDeleteRecette = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("recettes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: recettesKeys.all });
    },
  });
};
