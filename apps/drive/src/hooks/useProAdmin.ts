// Hooks admin : vues globales sur les comptes, commandes et factures Pro.
// Réservés aux rôles admin/manager. La RLS DB autorise déjà ALL pour
// ces rôles via une policy dédiée — pas de garde supplémentaire à
// faire côté front (au-delà de RoleProtectedRoute).

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CommandeProAvecCompte, ComptePro } from "@/types/pro";

export const ADMIN_COMPTES_KEY = ["admin-comptes-pro"] as const;
export const ADMIN_COMMANDES_KEY = ["admin-commandes-pro"] as const;
export const ADMIN_FACTURES_KEY = ["admin-factures-pro"] as const;

export function useAdminComptesPro() {
  const query = useQuery({
    queryKey: ADMIN_COMPTES_KEY,
    queryFn: async (): Promise<ComptePro[]> => {
      const { data, error } = await supabase
        .from("comptes_pro")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ComptePro[];
    },
    staleTime: 15_000,
  });

  return {
    comptes: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useAdminCommandesPro() {
  const query = useQuery({
    queryKey: ADMIN_COMMANDES_KEY,
    queryFn: async (): Promise<CommandeProAvecCompte[]> => {
      const { data, error } = await supabase
        .from("commandes_pro")
        .select(
          `
          *,
          comptes_pro:compte_pro_id (
            id,
            raison_sociale,
            siret,
            adresse_facturation,
            adresse_livraison
          )
        `,
        )
        .order("date_commande", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CommandeProAvecCompte[];
    },
    staleTime: 15_000,
  });

  return {
    commandes: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useAdminFacturesPro() {
  const query = useQuery({
    queryKey: ADMIN_FACTURES_KEY,
    queryFn: async (): Promise<CommandeProAvecCompte[]> => {
      const { data, error } = await supabase
        .from("commandes_pro")
        .select(
          `
          *,
          comptes_pro:compte_pro_id (
            id,
            raison_sociale,
            siret,
            adresse_facturation,
            adresse_livraison,
            delegue_email,
            delegue_nom
          )
        `,
        )
        .not("facture_numero", "is", null)
        .order("date_commande", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CommandeProAvecCompte[];
    },
    staleTime: 15_000,
  });

  return {
    factures: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
