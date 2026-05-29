// Hooks : commandes Pro
// - useCommandesPro() : liste des commandes du compte du user (côté délégué)
// - useCommandeProDetail(id) : détail d'une commande + lignes + produit
// - useFacturesPro() : sous-ensemble des commandes facturées
//
// RLS : le délégué ne voit que ses propres commandes, les rôles
// admin/manager voient tout.

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useComptePro } from "@/hooks/useComptePro";
import type {
  CommandePro,
  CommandeProAvecCompte,
  LigneAvecProduit,
} from "@/types/pro";

export const COMMANDES_PRO_QUERY_KEY = ["commandes-pro"] as const;
export const COMMANDE_PRO_DETAIL_QUERY_KEY = ["commande-pro"] as const;
export const FACTURES_PRO_QUERY_KEY = ["factures-pro"] as const;

const fetchCommandes = async (compteId: string): Promise<CommandePro[]> => {
  const { data, error } = await supabase
    .from("commandes_pro")
    .select("*")
    .eq("compte_pro_id", compteId)
    .order("date_commande", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CommandePro[];
};

export function useCommandesPro() {
  const { compte, isLoading: compteLoading } = useComptePro();
  const query = useQuery({
    queryKey: [...COMMANDES_PRO_QUERY_KEY, compte?.id ?? null],
    queryFn: () => fetchCommandes(compte!.id),
    enabled: !!compte?.id,
    staleTime: 30_000,
  });

  return {
    commandes: query.data ?? [],
    isLoading: compteLoading || query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useFacturesPro() {
  const { compte, isLoading: compteLoading } = useComptePro();

  const query = useQuery({
    queryKey: [...FACTURES_PRO_QUERY_KEY, compte?.id ?? null],
    queryFn: async (): Promise<CommandePro[]> => {
      const { data, error } = await supabase
        .from("commandes_pro")
        .select("*")
        .eq("compte_pro_id", compte!.id)
        .not("facture_numero", "is", null)
        .order("date_commande", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CommandePro[];
    },
    enabled: !!compte?.id,
    staleTime: 30_000,
  });

  return {
    factures: query.data ?? [],
    isLoading: compteLoading || query.isLoading,
    isError: query.isError,
  };
}

export interface CommandeProDetail {
  commande: CommandeProAvecCompte;
  lignes: LigneAvecProduit[];
}

export function useCommandeProDetail(id: string | undefined) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: [...COMMANDE_PRO_DETAIL_QUERY_KEY, id, user?.id ?? null],
    queryFn: async (): Promise<CommandeProDetail> => {
      const { data: commande, error: errCmd } = await supabase
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
        .eq("id", id!)
        .single();
      if (errCmd) throw errCmd;

      const { data: lignes, error: errLignes } = await supabase
        .from("commandes_pro_lignes")
        .select(
          `
          *,
          products:produit_id (
            id,
            name,
            image_url,
            unit
          )
        `,
        )
        .eq("commande_pro_id", id!)
        .order("created_at", { ascending: true });
      if (errLignes) throw errLignes;

      return {
        commande: commande as CommandeProAvecCompte,
        lignes: (lignes ?? []) as LigneAvecProduit[],
      };
    },
    enabled: !!id,
    staleTime: 30_000,
  });

  return {
    detail: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
