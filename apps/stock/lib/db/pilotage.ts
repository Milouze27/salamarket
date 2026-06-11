/* lib/db/pilotage.ts — Données « pilotage du jour » consolidées, partagées par
 * les 3 vues de pilotage (cockpit, dashboard admin, accueil). Une seule source
 * pour rester cohérent. Lecture via le client supabase (RLS read-all sur ces
 * tables). Tout est gracieux : en cas d'absence de données → 0, jamais de throw
 * qui casserait le dashboard.
 *
 * Métriques (demande gérant) :
 *   - CA du jour Drive + magasin (Cashmag) + total
 *   - Commandes Drive en cours (à préparer / en prépa / prêtes)
 *   - Ce qui presse : ruptures imminentes (v_stockout_critiques)
 *   - Valeur de stock = quantité × coût d'achat HT (vraie valeur immobilisée).
 *     ALIGNÉ sur les cartes par dépôt du dashboard admin (qui valorisent au
 *     coût depuis 2026-06-09). Avant : on valorisait au prix de vente, ce qui
 *     donnait un hero (495 791 €) ≠ somme des dépôts (357 220 €) sur le même
 *     écran (STK-01). On retombe sur le prix de vente si le coût est inconnu,
 *     pour ne pas afficher 0.
 */
import { supabase } from "@/lib/supabase";

export interface PilotageToday {
  ca_jour: { drive: number; magasin: number; total: number };
  drive_orders: { a_preparer: number; en_preparation: number; pret: number };
  presse: { ruptures: number };
  stock: { valeur: number; lignes: number };
}

/** Date du jour à Paris (YYYY-MM-DD). */
export function parisTodayStr(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
  }).format(new Date());
}

/** ISO UTC de minuit (début de journée) à Paris, pour filtrer un timestamptz. */
function parisTodayStartUtcIso(): string {
  const now = new Date();
  const ymd = parisTodayStr();
  // Offset Paris (CET/CEST) en minutes pour `now`.
  const parisNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Europe/Paris" }),
  );
  const utcNow = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMin = Math.round((parisNow.getTime() - utcNow.getTime()) / 60000);
  const [y, m, d] = ymd.split("-").map(Number);
  const startUtc = Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMin * 60_000;
  return new Date(startUtc).toISOString();
}

const EMPTY: PilotageToday = {
  ca_jour: { drive: 0, magasin: 0, total: 0 },
  drive_orders: { a_preparer: 0, en_preparation: 0, pret: 0 },
  presse: { ruptures: 0 },
  stock: { valeur: 0, lignes: 0 },
};

export async function getPilotageToday(
  depotId?: string,
): Promise<PilotageToday> {
  const sb = supabase();
  if (!sb) return EMPTY;
  const startUtc = parisTodayStartUtcIso();
  const today = parisTodayStr();

  try {
    const [cmdRes, cashmagRes, stockRes, stockoutRes] = await Promise.all([
      // CA + statuts des commandes Drive du jour
      sb
        .from("commandes_drive")
        .select("total_ttc, montant_capture_ttc, statut")
        .gte("created_at", startUtc)
        .neq("statut", "annule"),
      // Ventes magasin (Cashmag) du jour
      sb
        .from("ventes_cashmag_import")
        .select("prix_ttc, quantite")
        .eq("date_vente", today),
      // Valeur de stock au coût d'achat (optionnellement filtrée par dépôt)
      (() => {
        let q = sb
          .from("stock_par_depot")
          .select("quantite, prix_vente, cout_achat_ht");
        if (depotId) q = q.eq("depot_id", depotId);
        return q;
      })(),
      // Ce qui presse : ruptures critiques
      sb
        .from("v_stockout_critiques")
        .select("produit_id, tier")
        .in("tier", ["out", "blocker", "crit"]),
    ]);

    const result: PilotageToday = {
      ca_jour: { drive: 0, magasin: 0, total: 0 },
      drive_orders: { a_preparer: 0, en_preparation: 0, pret: 0 },
      presse: { ruptures: 0 },
      stock: { valeur: 0, lignes: 0 },
    };

    for (const c of (cmdRes.data ?? []) as Array<{
      total_ttc: number | null;
      montant_capture_ttc: number | null;
      statut: string | null;
    }>) {
      // CA réalisé = capturé si dispo, sinon total estimé.
      result.ca_jour.drive += Number(c.montant_capture_ttc ?? c.total_ttc ?? 0);
      if (c.statut === "a_preparer") result.drive_orders.a_preparer++;
      else if (c.statut === "en_preparation")
        result.drive_orders.en_preparation++;
      else if (c.statut === "pret") result.drive_orders.pret++;
    }
    for (const v of (cashmagRes.data ?? []) as Array<{
      prix_ttc: number | null;
      quantite: number | null;
    }>) {
      // prix_ttc = prix unitaire de ligne → multiplier par la quantité.
      result.ca_jour.magasin +=
        Number(v.quantite ?? 0) * Number(v.prix_ttc ?? 0);
    }
    result.ca_jour.drive = Math.round(result.ca_jour.drive * 100) / 100;
    result.ca_jour.magasin = Math.round(result.ca_jour.magasin * 100) / 100;
    result.ca_jour.total =
      Math.round((result.ca_jour.drive + result.ca_jour.magasin) * 100) / 100;

    let val = 0;
    let lignes = 0;
    for (const s of (stockRes.data ?? []) as Array<{
      quantite: number | null;
      prix_vente: number | null;
      cout_achat_ht: number | null;
    }>) {
      const q = Number(s.quantite ?? 0);
      if (q > 0) {
        // Coût d'achat HT si connu, sinon prix de vente en repli (pas de 0).
        const unite = Number(s.cout_achat_ht ?? s.prix_vente ?? 0);
        val += q * unite;
        lignes++;
      }
    }
    result.stock.valeur = Math.round(val * 100) / 100;
    result.stock.lignes = lignes;

    result.presse.ruptures = (stockoutRes.data ?? []).length;

    return result;
  } catch (e) {
    console.warn("[pilotage] getPilotageToday échoué:", e);
    return EMPTY;
  }
}
