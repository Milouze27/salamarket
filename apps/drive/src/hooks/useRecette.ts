import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { recettesKeys, type Recette } from "@/hooks/useRecettes";

export type RecetteIngredient =
  Database["public"]["Tables"]["recettes_ingredients"]["Row"];
export type RecetteIngredientInsert =
  Database["public"]["Tables"]["recettes_ingredients"]["Insert"];

export type RecetteEtape =
  Database["public"]["Tables"]["recettes_etapes"]["Row"];
export type RecetteEtapeInsert =
  Database["public"]["Tables"]["recettes_etapes"]["Insert"];

export type RecetteMainOeuvre =
  Database["public"]["Tables"]["recettes_main_oeuvre"]["Row"];
export type RecetteMainOeuvreInsert =
  Database["public"]["Tables"]["recettes_main_oeuvre"]["Insert"];

export interface RecetteFull {
  recette: Recette;
  ingredients: (RecetteIngredient & {
    produit: {
      id: string;
      name: string;
      price_cents: number;
      unit: string;
    } | null;
  })[];
  etapes: RecetteEtape[];
  main_oeuvre: RecetteMainOeuvre[];
}

/**
 * Fetch une recette complète : la recette, ses ingrédients (avec join
 * produits via FK produit_id pour nom + prix), ses étapes, et sa main
 * d'oeuvre. 4 requêtes parallèles pour garder le typage propre.
 */
export const useRecette = (recetteId: string | undefined) =>
  useQuery({
    queryKey: recettesKeys.detail(recetteId ?? "none"),
    enabled: !!recetteId,
    staleTime: 30_000,
    queryFn: async (): Promise<RecetteFull> => {
      if (!recetteId) throw new Error("recetteId requis");

      const [recetteRes, ingredientsRes, etapesRes, mainOeuvreRes] =
        await Promise.all([
          supabase.from("recettes").select("*").eq("id", recetteId).single(),
          supabase
            .from("recettes_ingredients")
            .select("*, produit:products(id,name,price_cents,unit)")
            .eq("recette_id", recetteId)
            .order("ordre", { ascending: true }),
          supabase
            .from("recettes_etapes")
            .select("*")
            .eq("recette_id", recetteId)
            .order("ordre", { ascending: true }),
          supabase
            .from("recettes_main_oeuvre")
            .select("*")
            .eq("recette_id", recetteId),
        ]);

      if (recetteRes.error) throw recetteRes.error;
      if (ingredientsRes.error) throw ingredientsRes.error;
      if (etapesRes.error) throw etapesRes.error;
      if (mainOeuvreRes.error) throw mainOeuvreRes.error;

      type IngredientWithProduct = RecetteIngredient & {
        produit: {
          id: string;
          name: string;
          price_cents: number;
          unit: string;
        } | null;
      };

      return {
        recette: recetteRes.data,
        ingredients: (ingredientsRes.data ??
          []) as unknown as IngredientWithProduct[],
        etapes: etapesRes.data ?? [],
        main_oeuvre: mainOeuvreRes.data ?? [],
      };
    },
  });

/**
 * Coût matières théorique = somme(quantite × prix unitaire vente du
 * produit). Approximation : le prix vente n'est pas le prix d'achat,
 * mais c'est un indicateur stable pour la comparaison entre recettes.
 * Ignore les ingrédients sans produit_id (ingredient_libre seul).
 */
export const computeCoutMatieresTheorique = (
  ingredients: RecetteFull["ingredients"],
): number =>
  ingredients.reduce((sum, ing) => {
    if (!ing.produit) return sum;
    const prixUnitaireEur = ing.produit.price_cents / 100;
    return sum + ing.quantite * prixUnitaireEur;
  }, 0);

/**
 * Coût main d'œuvre théorique = somme((duree_minutes / 60) ×
 * taux_horaire_charge). Le taux est NOT NULL en DB donc toujours présent.
 */
export const computeCoutMainOeuvreTheorique = (
  mainOeuvre: RecetteMainOeuvre[],
): number =>
  mainOeuvre.reduce((sum, mo) => {
    return sum + (mo.duree_minutes / 60) * mo.taux_horaire_charge;
  }, 0);

// ─────────────────────────────────────────────────────────────────────
// Mutations pour les sous-entités (ingrédients, étapes, main d'oeuvre)
// ─────────────────────────────────────────────────────────────────────

export const useAddIngredient = (recetteId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecetteIngredientInsert) => {
      const { error } = await supabase
        .from("recettes_ingredients")
        .insert(input);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: recettesKeys.detail(recetteId) }),
  });
};

export const useRemoveIngredient = (recetteId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("recettes_ingredients")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: recettesKeys.detail(recetteId) }),
  });
};

export const useAddEtape = (recetteId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecetteEtapeInsert) => {
      const { error } = await supabase.from("recettes_etapes").insert(input);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: recettesKeys.detail(recetteId) }),
  });
};

export const useRemoveEtape = (recetteId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("recettes_etapes")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: recettesKeys.detail(recetteId) }),
  });
};

export const useAddMainOeuvre = (recetteId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecetteMainOeuvreInsert) => {
      const { error } = await supabase
        .from("recettes_main_oeuvre")
        .insert(input);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: recettesKeys.detail(recetteId) }),
  });
};

export const useRemoveMainOeuvre = (recetteId: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("recettes_main_oeuvre")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: recettesKeys.detail(recetteId) }),
  });
};
