// Hook : récupère le compte Pro associé à l'utilisateur connecté
// (via delegue_user_id). RLS filtre déjà côté DB ; ce hook est donc
// safe même appelé sans contexte rôle.

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { ComptePro } from "@/types/pro";

export const COMPTE_PRO_QUERY_KEY = ["compte-pro"] as const;

const fetchComptePro = async (userId: string): Promise<ComptePro | null> => {
  const { data, error } = await supabase
    .from("comptes_pro")
    .select("*")
    .eq("delegue_user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as ComptePro | null) ?? null;
};

export function useComptePro() {
  const { user, loading: authLoading } = useAuth();

  const query = useQuery({
    queryKey: [...COMPTE_PRO_QUERY_KEY, user?.id ?? null],
    queryFn: () => fetchComptePro(user!.id),
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  return {
    compte: query.data ?? null,
    isLoading: authLoading || query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
