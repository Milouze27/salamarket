import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Cagnotte Baraka — solde de points fidélité du client.
 *
 * 1 point = 1 € dépensé sur une commande RETIRÉE (commandes_drive.statut
 * = 'retire'). Le solde est calculé côté serveur par la RPC SECURITY
 * DEFINER `get_loyalty_balance(p_email)` (migration 20260612000010).
 *
 * ⚠️ Dégrade PROPREMENT : si la RPC n'est pas encore déployée (ou toute
 * erreur réseau / RLS), on renvoie 0 sans jamais throw — la jauge Baraka
 * affiche simplement 0 point au lieu de casser le panier.
 */

/** Palier suivant atteignable, pour piloter la progression de la jauge. */
export const BARAKA_PALIER = 100;

export interface LoyaltyState {
  /** Solde de points (≥ 0). */
  points: number;
  /** Palier courant visé (multiple de BARAKA_PALIER au-dessus du solde). */
  nextPalier: number;
  /** Progression vers le palier suivant, 0..1. */
  progress: number;
}

const fetchBalance = async (email: string): Promise<number> => {
  try {
    // RPC pas encore dans les types générés Supabase → on relâche le
    // typage sur ce seul appel (convention déjà utilisée pour les objets
    // DB non encore déployés, cf. lib/promo.ts).
    const { data, error } = await (
      supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>
    )("get_loyalty_balance", { p_email: email });

    if (error) return 0;
    const n = Number(data);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    // RPC absente / réseau → 0, jamais de crash.
    return 0;
  }
};

export const useLoyalty = (email?: string | null) => {
  const normalized = (email ?? "").trim().toLowerCase();

  const query = useQuery<number>({
    queryKey: ["loyalty-balance", normalized],
    queryFn: () => fetchBalance(normalized),
    enabled: normalized.length > 0,
    staleTime: 60_000,
  });

  const points = query.data ?? 0;
  // Palier suivant : prochain multiple strict de BARAKA_PALIER (un solde
  // pile sur un palier vise déjà le suivant pour garder une jauge motivante).
  const nextPalier =
    (Math.floor(points / BARAKA_PALIER) + 1) * BARAKA_PALIER;
  // Progression dans le palier courant (reste / taille du palier).
  const progress = (points % BARAKA_PALIER) / BARAKA_PALIER;

  const state: LoyaltyState = { points, nextPalier, progress };

  return { ...state, isLoading: query.isLoading };
};
