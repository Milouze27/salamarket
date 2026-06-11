/**
 * Chargement groupé des données DLC / lots pour le catalogue Drive.
 *
 * Problème (PERF-02 / B1-06) : chaque carte produit chargeait son propre lot
 * (`produits_lots?produit_id=eq.X`) et sa propre alerte DLC
 * (`v_dlc_alerts?produit_id=eq.X`), soit 1 + 1 requêtes PAR produit affiché —
 * un N+1 (~23 requêtes sur la home, qui ne scale pas).
 *
 * Solution : deux requêtes groupées, partagées entre toutes les cartes via le
 * cache TanStack Query (clé stable → un seul appel réseau dédupliqué). Les vues
 * `produits_lots` et `v_dlc_alerts` sont petites (quelques dizaines de lignes)
 * et déjà grantées à `anon`. Les hooks de carte dérivent ensuite leur donnée
 * localement, sans toucher le réseau.
 *
 * products.id === produits.id (mêmes UUID, cf. SCHEMA.md + migration 0030),
 * donc product.id matche directement produit_id côté lots/DLC.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface LatestLot {
  id: string;
  certifier_name: string | null;
}

interface LotRow {
  id: string;
  produit_id: string | null;
  certifier_name: string | null;
  created_at: string | null;
}

/**
 * Map produit_id → lot le plus récent. Une seule requête `produits_lots`
 * triée par created_at desc ; on garde la première occurrence par produit.
 */
export function useLatestLotsByProduct() {
  return useQuery<Map<string, LatestLot>>({
    queryKey: ["produits_lots", "latest-by-product"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("produits_lots" as never)
        .select("id, produit_id, certifier_name, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const map = new Map<string, LatestLot>();
      for (const row of (data ?? []) as unknown as LotRow[]) {
        if (!row.produit_id) continue;
        // Données triées desc : la première vue pour un produit est la plus
        // récente.
        if (!map.has(row.produit_id)) {
          map.set(row.produit_id, {
            id: row.id,
            certifier_name: row.certifier_name,
          });
        }
      }
      return map;
    },
  });
}

export interface DlcAlertRow {
  niveau_alerte: string | null;
  remise_suggeree_pct: number | null;
  jours_restants: number | null;
}

/**
 * Map produit_id → liste des alertes DLC du produit. Une seule requête
 * `v_dlc_alerts`. Les hooks de carte appliquent ensuite leur règle
 * d'éligibilité (niveau ≠ ok/forcé, remise > 0) localement.
 */
export function useDlcAlertsByProduct() {
  return useQuery<Map<string, DlcAlertRow[]>>({
    queryKey: ["v_dlc_alerts", "by-product"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_dlc_alerts" as never)
        .select("produit_id, niveau_alerte, remise_suggeree_pct, jours_restants");
      if (error) throw error;
      const map = new Map<string, DlcAlertRow[]>();
      for (const row of (data ?? []) as unknown as Array<
        DlcAlertRow & { produit_id: string | null }
      >) {
        if (!row.produit_id) continue;
        const list = map.get(row.produit_id);
        const entry: DlcAlertRow = {
          niveau_alerte: row.niveau_alerte,
          remise_suggeree_pct: row.remise_suggeree_pct,
          jours_restants: row.jours_restants,
        };
        if (list) list.push(entry);
        else map.set(row.produit_id, [entry]);
      }
      return map;
    },
  });
}
