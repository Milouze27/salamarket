import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { productionsKeys } from "@/hooks/useProductions";

export type ProductionKpi =
  Database["public"]["Views"]["v_productions_kpi"]["Row"];

export interface KpiFilters {
  dateFrom?: string;
  dateTo?: string;
  recette?: string;
}

/**
 * Lit la vue agrégée v_productions_kpi (security_invoker, donc respecte
 * les RLS du user courant). Toutes les colonnes sont déjà calculées en
 * SQL — pas de calcul côté JS.
 */
export const useProductionsKpi = (filters: KpiFilters = {}) =>
  useQuery({
    queryKey: [...productionsKeys.kpi(), filters],
    queryFn: async (): Promise<ProductionKpi[]> => {
      let q = supabase
        .from("v_productions_kpi")
        .select("*")
        .order("date_production", { ascending: false });
      if (filters.dateFrom) q = q.gte("date_production", filters.dateFrom);
      if (filters.dateTo) q = q.lte("date_production", filters.dateTo);
      if (filters.recette) q = q.eq("recette", filters.recette);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

/**
 * KPI d'une production donnée (filtre la vue par id).
 */
export const useProductionKpi = (productionId: string | undefined) =>
  useQuery({
    queryKey: [...productionsKeys.kpi(), "single", productionId],
    enabled: !!productionId,
    queryFn: async (): Promise<ProductionKpi | null> => {
      if (!productionId) return null;
      const { data, error } = await supabase
        .from("v_productions_kpi")
        .select("*")
        .eq("id", productionId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 10_000,
  });

/**
 * Agrégat utile pour la card "Marge moyenne 30j par recette" sur la
 * liste des recettes. Renvoie par recette : marge moyenne, nombre de
 * productions, cout moyen.
 */
export interface RecetteAggregatedKpi {
  recette: string;
  count: number;
  marge_pct_moy: number | null;
  marge_eur_total: number;
  cout_total_moy: number;
}

export const aggregateKpiByRecette = (
  kpis: readonly ProductionKpi[],
): RecetteAggregatedKpi[] => {
  const byRecette = new Map<
    string,
    {
      count: number;
      sum_marge_pct: number;
      n_marge_pct: number;
      sum_marge_eur: number;
      sum_cout: number;
    }
  >();
  for (const kpi of kpis) {
    if (!kpi.recette) continue;
    const acc = byRecette.get(kpi.recette) ?? {
      count: 0,
      sum_marge_pct: 0,
      n_marge_pct: 0,
      sum_marge_eur: 0,
      sum_cout: 0,
    };
    acc.count += 1;
    if (kpi.marge_pct_ht != null) {
      acc.sum_marge_pct += kpi.marge_pct_ht;
      acc.n_marge_pct += 1;
    }
    if (kpi.marge_eur_ht != null) {
      acc.sum_marge_eur += kpi.marge_eur_ht;
    }
    acc.sum_cout += kpi.cout_total;
    byRecette.set(kpi.recette, acc);
  }
  const out: RecetteAggregatedKpi[] = [];
  byRecette.forEach((v, k) => {
    out.push({
      recette: k,
      count: v.count,
      marge_pct_moy: v.n_marge_pct > 0 ? v.sum_marge_pct / v.n_marge_pct : null,
      marge_eur_total: v.sum_marge_eur,
      cout_total_moy: v.count > 0 ? v.sum_cout / v.count : 0,
    });
  });
  return out.sort((a, b) =>
    (b.marge_pct_moy ?? -Infinity) - (a.marge_pct_moy ?? -Infinity),
  );
};
