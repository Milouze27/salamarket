"use client";

/**
 * Unified data layer.
 * - In production, talks to Supabase via @supabase/supabase-js
 * - In dev/demo (no env vars), uses the local seed in seed-local.ts
 *
 * Exposes one function per domain query, all returning Promises so the
 * caller code reads identically regardless of backend.
 */

import { hasSupabase, supabase } from "@/lib/supabase";
import {
  SEED_DEPOTS,
  SEED_EMPLOYES,
  SEED_PRODUITS,
  SEED_STOCK,
} from "./seed-local";
import type {
  Depot,
  Employe,
  Produit,
  ProduitInDepot,
  CodeBarreCarton,
  Reception,
  ReceptionLigne,
  SortieStock,
  TransfertInterDepot,
  InventaireTournant,
  CommandeDrive,
  CommandeDriveLigne,
  ProduitUnitType,
  SortieType,
  ReceptionStatus,
} from "@/lib/types/db";

/* ────────────────── Depots ────────────────── */

export async function listDepots(): Promise<Depot[]> {
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb
      .from("depots")
      .select("*")
      .eq("is_active", true)
      .order("nom");
    if (error) throw error;
    return data as Depot[];
  }
  return SEED_DEPOTS.filter((d) => d.is_active);
}

/* ────────────────── Employés ────────────────── */

export async function listEmployes(depotId?: string): Promise<Employe[]> {
  const sb = supabase();
  if (sb) {
    // SECURITY : on lit la vue `employes_public` (sans pin_hash, sans
    // pin_code, sans taux_horaire) côté client. La table `employes`
    // n'est plus accessible en SELECT anon (cf. migration
    // 20260531000021_employes_public_view.sql).
    // Les call sites server-side (api/**) qui ont besoin de pin_hash
    // utilisent supabaseServer() (service_role) qui bypasse RLS.
    let q = sb.from("employes_public").select("*").eq("is_active", true);
    if (depotId) q = q.eq("depot_principal_id", depotId);
    const { data, error } = await q.order("nom");
    if (error) throw error;
    return (data ?? []) as Employe[];
  }
  return SEED_EMPLOYES.filter(
    (e) => e.is_active && (!depotId || e.depot_principal_id === depotId),
  );
}

export async function loginByPin(pin: string): Promise<Employe | null> {
  const sb = supabase();
  if (sb) {
    // SECURITY : on appelle la RPC verify_pin (SECURITY DEFINER) qui
    // compare le PIN clair au bcrypt hash stocké côté DB. Aucun PIN
    // ne sort jamais de la DB. Cf. migration 20260531000003_hash_pin_codes.sql.
    const { data: employeId, error: rpcErr } = await sb.rpc("verify_pin", {
      p_pin: pin,
    });
    if (rpcErr) {
      // Plus de fallback direct SELECT employes par pin_code :
      // 1) en prod la table `employes` n'est plus SELECT-able par anon
      //    (cf. migration 20260531000021_employes_public_view.sql),
      // 2) pin_code est neutralisé à '0000' (cf. 20260531000003), donc
      //    la query ne matcherait rien d'utile.
      // On loggue l'erreur et on renvoie null pour ne pas auth.
      console.error("[loginByPin] verify_pin RPC failed:", rpcErr);
      return null;
    }
    if (!employeId) return null;
    // Rehydrate la fiche employé via get_employe_safe (sans pin_hash exposé)
    const { data: row, error: getErr } = await sb.rpc("get_employe_safe", {
      p_id: employeId,
    });
    if (getErr) {
      console.error("[loginByPin] get_employe_safe error:", getErr);
      return null;
    }
    const row0 = Array.isArray(row) ? row[0] : row;
    return (row0 as Employe) ?? null;
  }
  return SEED_EMPLOYES.find((e) => e.pin_code === pin && e.is_active) ?? null;
}

/* ────────────────── Produits & Stock par dépôt ────────────────── */

export async function listProduitsInDepot(
  depotId: string,
): Promise<ProduitInDepot[]> {
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb
      .from("stock_par_depot")
      .select(
        "id, depot_id, quantite, prix_vente, cout_achat_ht, is_visible, produit:produits(*)",
      )
      .eq("depot_id", depotId)
      .eq("is_visible", true);
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => {
      const produit = r.produit as Produit;
      return {
        ...produit,
        stock_id: r.id as string,
        depot_id: r.depot_id as string,
        quantite: r.quantite as number,
        prix_vente: r.prix_vente as number | null,
        cout_achat_ht: r.cout_achat_ht as number | null,
        is_visible: r.is_visible as boolean,
      };
    });
  }
  // local fallback: join SEED_PRODUITS with SEED_STOCK
  const stock = SEED_STOCK.filter(
    (s) => s.depot_id === depotId && s.is_visible,
  );
  return stock
    .map((s) => {
      const p = SEED_PRODUITS.find((x) => x.id === s.produit_id);
      if (!p) return null;
      return {
        ...p,
        stock_id: s.id,
        depot_id: s.depot_id,
        quantite: s.quantite,
        prix_vente: s.prix_vente,
        is_visible: s.is_visible,
      } as ProduitInDepot;
    })
    .filter((x): x is ProduitInDepot => x !== null);
}

/**
 * Stock disponible d'UN produit dans UN dépôt (quantité de
 * stock_par_depot). Renvoie 0 si le produit n'a pas de ligne stock dans
 * ce dépôt, null si la source de données est indisponible (pour ne pas
 * bloquer à tort une sortie quand on ne sait pas).
 */
export async function getStockProduitDepot(
  depotId: string,
  produitId: string,
): Promise<number | null> {
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb
      .from("stock_par_depot")
      .select("quantite")
      .eq("depot_id", depotId)
      .eq("produit_id", produitId)
      .maybeSingle();
    if (error) throw error;
    return data ? ((data.quantite as number) ?? 0) : 0;
  }
  const row = SEED_STOCK.find(
    (s) => s.depot_id === depotId && s.produit_id === produitId,
  );
  return row ? row.quantite : 0;
}

export async function findProduitByEan(ean: string): Promise<Produit | null> {
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb
      .from("produits")
      .select("*")
      .eq("ean", ean)
      .maybeSingle();
    if (error) throw error;
    return (data as Produit) ?? null;
  }
  return SEED_PRODUITS.find((p) => p.ean === ean) ?? null;
}

export async function searchProduits(query: string): Promise<Produit[]> {
  const q = query.toLowerCase().trim();
  if (q.length < 2) return [];
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb
      .from("produits")
      .select("*")
      .or(`nom.ilike.%${q}%,marque.ilike.%${q}%,ean.ilike.%${q}%`)
      .limit(20);
    if (error) throw error;
    return data as Produit[];
  }
  return SEED_PRODUITS.filter(
    (p) =>
      p.nom.toLowerCase().includes(q) ||
      (p.marque?.toLowerCase().includes(q) ?? false) ||
      (p.ean?.includes(q) ?? false),
  ).slice(0, 20);
}

/* ────────────────── Création produit (depuis IA ou form) ────────────────── */

export async function createProduit(input: {
  ean?: string | null;
  nom: string;
  marque?: string | null;
  categorie?: string | null;
  sous_categorie?: string | null;
  description?: string | null;
  requires_barcode_print?: boolean;
}): Promise<Produit> {
  const sb = supabase();
  const row = {
    ean: input.ean ?? null,
    nom: input.nom,
    marque: input.marque ?? null,
    categorie: input.categorie ?? null,
    sous_categorie: input.sous_categorie ?? null,
    image_url: null,
    description: input.description ?? null,
    requires_barcode_print: input.requires_barcode_print ?? false,
    est_traiteur: false,
  };
  if (sb) {
    const { data, error } = await sb
      .from("produits")
      .insert(row)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Produit;
  }
  // local
  const local: Produit = {
    id: "prd-local-" + Date.now(),
    ...row,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  return local;
}

/* ────────────────── Carton EANs ────────────────── */

const localCartons: CodeBarreCarton[] = [];

export async function findCarton(ean: string): Promise<CodeBarreCarton | null> {
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb
      .from("codes_barres_cartons")
      .select("*")
      .eq("ean_carton", ean)
      .maybeSingle();
    if (error) throw error;
    return (data as CodeBarreCarton) ?? null;
  }
  return localCartons.find((c) => c.ean_carton === ean) ?? null;
}

export async function learnCarton(input: {
  ean_carton: string;
  produit_id: string;
  quantite_par_carton: number;
  fournisseur?: string;
  learned_by?: string;
}): Promise<CodeBarreCarton> {
  const sb = supabase();
  const row: CodeBarreCarton = {
    id: "cart-" + Date.now(),
    ean_carton: input.ean_carton,
    produit_id: input.produit_id,
    quantite_par_carton: input.quantite_par_carton,
    fournisseur: input.fournisseur ?? null,
    created_at: new Date().toISOString(),
    learned_by: input.learned_by ?? null,
  };
  if (sb) {
    const { id: _localId, ...payload } = row;
    void _localId;
    const { data, error } = await sb
      .from("codes_barres_cartons")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as CodeBarreCarton;
  }
  localCartons.push(row);
  return row;
}

/* ────────────────── Réceptions ────────────────── */

const localReceptions: Reception[] = [];
const localReceptionLignes: ReceptionLigne[] = [];

export async function createReception(input: {
  depot_id: string;
  employe_id: string;
  fournisseur?: string;
  numero_bl?: string;
  photo_url: string;
}): Promise<Reception> {
  const sb = supabase();
  const row: Reception = {
    id: "rec-" + Date.now(),
    depot_id: input.depot_id,
    employe_id: input.employe_id,
    fournisseur: input.fournisseur ?? null,
    numero_bl: input.numero_bl ?? null,
    photo_url: input.photo_url,
    statut: "en_cours",
    reception_vide: false,
    created_at: new Date().toISOString(),
  };
  if (sb) {
    const { id: _localId, ...payload } = row;
    void _localId;
    const { data, error } = await sb
      .from("receptions")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Reception;
  }
  localReceptions.push(row);
  return row;
}

export async function addReceptionLigne(input: {
  reception_id: string;
  produit_id: string;
  code_scanne: string;
  quantite_calculee: number;
}): Promise<ReceptionLigne> {
  const sb = supabase();
  const row: ReceptionLigne = {
    id: "rl-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    reception_id: input.reception_id,
    produit_id: input.produit_id,
    code_scanne: input.code_scanne,
    quantite_scannee: 1,
    quantite_calculee: input.quantite_calculee,
  };
  if (sb) {
    const { id: _localId, ...payload } = row;
    void _localId;
    const { data, error } = await sb
      .from("receptions_lignes")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as ReceptionLigne;
  }
  localReceptionLignes.push(row);
  return row;
}

export async function validateReception(
  receptionId: string,
  opts?: { vide?: boolean },
): Promise<void> {
  const vide = opts?.vide === true;
  const sb = supabase();
  if (sb) {
    // Compute aggregated additions per produit then bump stock_par_depot.
    const { data: lignes, error: e1 } = await sb
      .from("receptions_lignes")
      .select("produit_id, quantite_calculee")
      .eq("reception_id", receptionId);
    if (e1) throw new Error(e1.message);
    const { data: rec, error: e2 } = await sb
      .from("receptions")
      .select("depot_id, employe_id")
      .eq("id", receptionId)
      .single();
    if (e2) throw e2;
    const depotId = (rec as { depot_id: string }).depot_id;
    const actorId = (rec as { employe_id?: string | null }).employe_id ?? null;

    const totals = new Map<string, number>();
    for (const l of (lignes ?? []) as Array<{
      produit_id: string;
      quantite_calculee: number;
    }>) {
      totals.set(
        l.produit_id,
        (totals.get(l.produit_id) ?? 0) + l.quantite_calculee,
      );
    }
    for (const [produitId, qty] of totals) {
      // Mouvement de stock ATOMIQUE via le RPC adjust_stock (verrou ligne +
      // upsert + ledger immuable), au lieu d'un read-then-write : deux
      // réceptions concurrentes ne peuvent plus se perdre des unités, et la
      // réception est désormais tracée dans stock_movements (traçabilité halal).
      await adjustStock(produitId, depotId, qty, "reception", {
        referenceId: receptionId,
        actorId,
      });
    }
    const { error: recErr } = await sb
      .from("receptions")
      .update({ statut: "validee" as ReceptionStatus, reception_vide: vide })
      .eq("id", receptionId);
    if (recErr) throw recErr;
    return;
  }
  // Local fallback: bump SEED_STOCK in-memory.
  const rec = localReceptions.find((r) => r.id === receptionId);
  if (!rec) return;
  const lignes = localReceptionLignes.filter(
    (l) => l.reception_id === receptionId,
  );
  for (const l of lignes) {
    const stock = SEED_STOCK.find(
      (s) => s.produit_id === l.produit_id && s.depot_id === rec.depot_id,
    );
    if (stock) {
      stock.quantite += l.quantite_calculee;
    } else {
      SEED_STOCK.push({
        id: "stock-" + Date.now(),
        produit_id: l.produit_id,
        depot_id: rec.depot_id,
        quantite: l.quantite_calculee,
        prix_vente: null,
        is_visible: true,
        updated_at: new Date().toISOString(),
      });
    }
  }
  rec.statut = "validee";
  rec.reception_vide = vide;
}

export async function listReceptions(opts?: {
  depotId?: string;
  limit?: number;
}): Promise<Reception[]> {
  const sb = supabase();
  const limit = opts?.limit ?? 50;
  if (sb) {
    let q = sb
      .from("receptions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (opts?.depotId) q = q.eq("depot_id", opts.depotId);
    const { data, error } = await q;
    if (error) throw error;
    return data as Reception[];
  }
  let list = [...localReceptions];
  if (opts?.depotId) list = list.filter((r) => r.depot_id === opts.depotId);
  return list
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

/* ────────────────── Sorties ────────────────── */

const localSorties: SortieStock[] = [];

export async function createSortie(input: {
  depot_id: string;
  employe_id: string;
  produit_id: string;
  type: SortieType;
  motif_libre?: string;
  quantite: number;
  photo_url: string;
  ia_coherence_score?: number | null;
  ia_coherence_notes?: string | null;
}): Promise<SortieStock> {
  const sb = supabase();
  const row: SortieStock = {
    id: "sor-" + Date.now(),
    depot_id: input.depot_id,
    employe_id: input.employe_id,
    produit_id: input.produit_id,
    type: input.type,
    motif_libre: input.motif_libre ?? null,
    quantite: input.quantite,
    photo_url: input.photo_url,
    ia_coherence_score: input.ia_coherence_score ?? null,
    ia_coherence_notes: input.ia_coherence_notes ?? null,
    created_at: new Date().toISOString(),
  };
  if (sb) {
    // FEFO : décrémente d'abord le lot le plus proche de la DLC et
    // récupère son id pour tracer la sortie. Non bloquant : un produit
    // sans lots suivis renvoie simplement null (sortie quand même valide).
    let lotId: string | null = null;
    try {
      const { data: lot } = await sb.rpc("consume_lot_fefo", {
        p_produit_id: input.produit_id,
        p_quantite: input.quantite,
        p_depot_id: input.depot_id,
      });
      lotId = typeof lot === "string" ? lot : null;
    } catch (lotErr) {
      console.warn("[createSortie] consume_lot_fefo non-fatal:", lotErr);
    }

    const { id: _localId, ...rest } = row;
    void _localId;
    const payload = { ...rest, lot_id: lotId };
    const { data, error } = await sb
      .from("sorties_stock")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    // Décrément stock ATOMIQUE via RPC (verrou ligne + ledger). Plus de
    // read-then-write : deux sorties concurrentes ne s'écrasent plus.
    const sortieId = (data as SortieStock).id;
    const isCasse =
      input.type !== "demarque_inconnue" && input.type !== "autre";
    try {
      await adjustStock(
        input.produit_id,
        input.depot_id,
        -input.quantite,
        isCasse ? "casse" : "sortie",
        { lotId, referenceId: sortieId, actorId: input.employe_id },
      );
    } catch (stockErr) {
      // Compensation : le décrément stock a échoué → on annule la sortie déjà
      // insérée pour ne pas laisser une ligne orpheline (sortie sans impact stock).
      console.error(
        `[createSortie] adjust_stock a échoué pour sortie ${sortieId}, rollback de la sortie :`,
        stockErr,
      );
      await sb.from("sorties_stock").delete().eq("id", sortieId);
      throw new Error("Stock non décrémenté — sortie annulée. Réessaie.");
    }
    return data as SortieStock;
  }
  localSorties.push(row);
  const stock = SEED_STOCK.find(
    (s) => s.produit_id === input.produit_id && s.depot_id === input.depot_id,
  );
  if (stock) stock.quantite = Math.max(0, stock.quantite - input.quantite);
  return row;
}

export async function listSorties(opts?: {
  depotId?: string;
  limit?: number;
}): Promise<SortieStock[]> {
  const sb = supabase();
  const limit = opts?.limit ?? 50;
  if (sb) {
    let q = sb
      .from("sorties_stock")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (opts?.depotId) q = q.eq("depot_id", opts.depotId);
    const { data, error } = await q;
    if (error) throw error;
    return data as SortieStock[];
  }
  let list = [...localSorties];
  if (opts?.depotId) list = list.filter((r) => r.depot_id === opts.depotId);
  return list
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

/* ────────────────── Transferts inter-dépôts ────────────────── */

const localTransferts: TransfertInterDepot[] = [];

export async function createTransfert(input: {
  depot_source_id: string;
  depot_destination_id: string;
  produit_id: string;
  quantite: number;
  employe_id: string;
  photo_url?: string;
}): Promise<TransfertInterDepot> {
  if (input.depot_source_id === input.depot_destination_id) {
    throw new Error("Source et destination doivent être différentes.");
  }
  const sb = supabase();
  const row: TransfertInterDepot = {
    id: "trf-" + Date.now(),
    depot_source_id: input.depot_source_id,
    depot_destination_id: input.depot_destination_id,
    produit_id: input.produit_id,
    quantite: input.quantite,
    employe_id: input.employe_id,
    photo_url: input.photo_url ?? null,
    created_at: new Date().toISOString(),
  };
  if (sb) {
    // Wave 4 (ML-3) : le mouvement de stock est désormais BLOQUANT et
    // ATOMIQUE. On appelle `transfer_stock` AVANT d'enregistrer le
    // transfert : si le stock source est insuffisant, la RPC lève une
    // exception (check_violation) et RIEN n'est écrit — plus de
    // quantité négative silencieuse ni de transfert fantôme.
    const { error: rpcErr } = await sb.rpc("transfer_stock", {
      p_produit_id: input.produit_id,
      p_depot_source: input.depot_source_id,
      p_depot_dest: input.depot_destination_id,
      p_quantite: input.quantite,
      p_reference_id: row.id,
      p_actor_id: input.employe_id,
    });
    if (rpcErr) {
      console.error("[createTransfert] transfer_stock refusé:", rpcErr);
      const msg = /insuffisant/i.test(rpcErr.message)
        ? "Stock source insuffisant pour ce transfert."
        : `Transfert refusé : ${rpcErr.message}`;
      throw new Error(msg);
    }

    // Le stock est déjà déplacé de façon transactionnelle. On enregistre
    // la trace métier (la photo, l'auteur). Si cet INSERT échoue, le
    // mouvement reste tracé dans stock_movements (ledger = source d'audit).
    const { id: _localId, created_at: _createdAt, ...payload } = row;
    void _localId;
    void _createdAt;
    const { data, error } = await sb
      .from("transferts_inter_depots")
      .insert(payload)
      .select()
      .single();
    if (error) {
      console.error("[createTransfert] INSERT trace error:", error);
      throw new Error(
        `Stock transféré mais trace non enregistrée : ${error.message}`,
      );
    }
    return data as TransfertInterDepot;
  }
  localTransferts.push(row);
  const sStock = SEED_STOCK.find(
    (s) =>
      s.produit_id === input.produit_id && s.depot_id === input.depot_source_id,
  );
  if (sStock) sStock.quantite = Math.max(0, sStock.quantite - input.quantite);
  let dStock = SEED_STOCK.find(
    (s) =>
      s.produit_id === input.produit_id &&
      s.depot_id === input.depot_destination_id,
  );
  if (!dStock) {
    dStock = {
      id: "stock-" + Date.now(),
      produit_id: input.produit_id,
      depot_id: input.depot_destination_id,
      quantite: 0,
      prix_vente: sStock?.prix_vente ?? null,
      is_visible: true,
      updated_at: new Date().toISOString(),
    };
    SEED_STOCK.push(dStock);
  }
  dStock.quantite += input.quantite;
  return row;
}

/**
 * Ajuste le stock d'un produit dans un dépôt de façon ATOMIQUE.
 *
 * Wave 4 (ML-3) : appelle la RPC SQL `adjust_stock` (verrou ligne +
 * ledger immuable stock_movements dans une seule transaction). Plus de
 * read-then-write : deux sorties/transferts/casses concurrents ne
 * s'écrasent plus. C'est le socle de confiance des chiffres.
 *
 * @param type  catégorie du mouvement pour le ledger (audit).
 * @returns la quantité APRÈS mouvement, ou null en mode démo.
 */
async function adjustStock(
  produitId: string,
  depotId: string,
  delta: number,
  type:
    | "reception"
    | "sortie"
    | "transfert"
    | "casse"
    | "inventaire"
    | "correction" = "correction",
  opts?: {
    lotId?: string | null;
    referenceId?: string | null;
    actorId?: string | null;
  },
): Promise<number | null> {
  const sb = supabase();
  if (!sb) return null; // mode démo : le caller met à jour SEED_STOCK lui-même
  const { data, error } = await sb.rpc("adjust_stock", {
    p_produit_id: produitId,
    p_depot_id: depotId,
    p_delta: delta,
    p_type: type,
    p_lot_id: opts?.lotId ?? null,
    p_reference_id: opts?.referenceId ?? null,
    p_actor_id: opts?.actorId ?? null,
  });
  if (error) throw new Error(error.message);
  return typeof data === "number" ? data : Number(data ?? 0);
}

export async function listTransferts(opts?: {
  limit?: number;
  depotId?: string;
}): Promise<TransfertInterDepot[]> {
  const sb = supabase();
  const limit = opts?.limit ?? 50;
  if (sb) {
    let q = sb
      .from("transferts_inter_depots")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (opts?.depotId) {
      q = q.or(
        `depot_source_id.eq.${opts.depotId},depot_destination_id.eq.${opts.depotId}`,
      );
    }
    const { data, error } = await q;
    if (error) throw error;
    return data as TransfertInterDepot[];
  }
  let list = [...localTransferts];
  if (opts?.depotId)
    list = list.filter(
      (t) =>
        t.depot_source_id === opts.depotId ||
        t.depot_destination_id === opts.depotId,
    );
  return list
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

/* ────────────────── Inventaires tournants ────────────────── */

const localInventaires: InventaireTournant[] = [];

export async function listInventairesDuJour(opts?: {
  depotId?: string;
  employeId?: string;
}): Promise<InventaireTournant[]> {
  const today = new Date().toISOString().slice(0, 10);
  const sb = supabase();
  if (sb) {
    let q = sb
      .from("inventaires_tournants")
      .select("*")
      .eq("date_assignation", today);
    if (opts?.depotId) q = q.eq("depot_id", opts.depotId);
    if (opts?.employeId) q = q.eq("employe_assigne_id", opts.employeId);
    const { data, error } = await q;
    if (error) throw error;
    return data as InventaireTournant[];
  }
  return localInventaires.filter(
    (i) =>
      i.date_assignation === today &&
      (!opts?.depotId || i.depot_id === opts.depotId) &&
      (!opts?.employeId || i.employe_assigne_id === opts.employeId),
  );
}

export async function assignInventairesPourDepot(
  depotId: string,
  count = 5,
): Promise<InventaireTournant[]> {
  const today = new Date().toISOString().slice(0, 10);
  const employes = await listEmployes(depotId);
  if (employes.length === 0) return [];
  const stock = await listProduitsInDepot(depotId);
  if (stock.length === 0) return [];
  const sample = [...stock].sort(() => Math.random() - 0.5).slice(0, count);
  const created: InventaireTournant[] = [];
  for (let i = 0; i < sample.length; i++) {
    const p = sample[i];
    const employe = employes[i % employes.length];
    const row: InventaireTournant = {
      id: "inv-" + Date.now() + "-" + i,
      depot_id: depotId,
      produit_id: p.id,
      employe_assigne_id: employe.id,
      date_assignation: today,
      quantite_attendue: p.quantite,
      quantite_comptee: null,
      ecart: 0,
      statut: "assigne",
      created_at: new Date().toISOString(),
      completed_at: null,
    };
    const sb = supabase();
    if (sb) {
      // `ecart` est une colonne GENERATED ALWAYS côté DB : l'envoyer dans le
      // payload déclenche un 400 "cannot insert a non-DEFAULT value into
      // column ecart". On la retire de l'insert (elle reste calculée par la
      // DB). On retire aussi l'id local (clé serveur générée).
      const { id: _localId, ecart: _ecart, ...payload } = row;
      void _localId;
      void _ecart;
      const { data, error } = await sb
        .from("inventaires_tournants")
        .insert(payload)
        .select()
        .single();
      if (error) throw new Error(error.message);
      created.push(data as InventaireTournant);
    } else {
      localInventaires.push(row);
      created.push(row);
    }
  }
  return created;
}

export async function listInventairesHistorique(opts?: {
  depotId?: string;
  limit?: number;
}): Promise<InventaireTournant[]> {
  const limit = opts?.limit ?? 60;
  const sb = supabase();
  if (sb) {
    let q = sb
      .from("inventaires_tournants")
      .select("*")
      .order("date_assignation", { ascending: false })
      .limit(limit);
    if (opts?.depotId) q = q.eq("depot_id", opts.depotId);
    const { data, error } = await q;
    if (error) throw error;
    return data as InventaireTournant[];
  }
  return localInventaires
    .filter((i) => !opts?.depotId || i.depot_id === opts.depotId)
    .sort((a, b) => b.date_assignation.localeCompare(a.date_assignation))
    .slice(0, limit);
}

export async function completeInventaire(
  inventaireId: string,
  quantiteComptee: number,
): Promise<InventaireTournant | null> {
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb
      .from("inventaires_tournants")
      .update({
        quantite_comptee: quantiteComptee,
        statut: "compte",
        completed_at: new Date().toISOString(),
      })
      .eq("id", inventaireId)
      .select()
      .single();
    if (error) throw error;
    const inv = data as InventaireTournant;

    // Applique le comptage au stock réel : l'inventaire physique EST la
    // vérité terrain. Sans ça, compter ne corrigeait jamais stock_par_depot
    // (le but même de l'inventaire tournant était inopérant). On passe par
    // adjust_stock (type 'inventaire') → stock corrigé + ledger tracé.
    const { data: stockRow } = await sb
      .from("stock_par_depot")
      .select("quantite")
      .eq("produit_id", inv.produit_id)
      .eq("depot_id", inv.depot_id)
      .maybeSingle();
    const actuel = stockRow
      ? Number((stockRow as { quantite: number }).quantite)
      : 0;
    const delta = quantiteComptee - actuel;
    if (delta !== 0) {
      const { error: errAdj } = await sb.rpc("adjust_stock", {
        p_produit_id: inv.produit_id,
        p_depot_id: inv.depot_id,
        p_delta: delta,
        p_type: "inventaire",
        p_reference_id: inventaireId,
      });
      if (errAdj)
        throw new Error(`Stock non corrigé après comptage : ${errAdj.message}`);
    }
    return inv;
  }
  const row = localInventaires.find((i) => i.id === inventaireId);
  if (!row) return null;
  row.quantite_comptee = quantiteComptee;
  row.ecart = quantiteComptee - (row.quantite_attendue ?? 0);
  row.statut = "compte";
  row.completed_at = new Date().toISOString();
  return row;
}

/* ────────────────── Drive ────────────────── */

const SEED_COMMANDES: CommandeDrive[] = [
  {
    id: "cmd-001",
    numero_commande: "DRV-2026-0142",
    client_nom: "Yasmine Belkadi",
    client_telephone: "+33 6 12 34 56 78",
    client_email: null,
    creneau_retrait: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
    statut: "en_preparation",
    total_ttc: 78.4,
    mode_paiement: "stripe",
    created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
  {
    id: "cmd-002",
    numero_commande: "DRV-2026-0143",
    client_nom: "Karim Boumediene",
    client_telephone: "+33 6 87 65 43 21",
    client_email: null,
    creneau_retrait: new Date(Date.now() + 5 * 3600 * 1000).toISOString(),
    statut: "en_preparation",
    total_ttc: 42.5,
    mode_paiement: "en_magasin",
    created_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
  },
];

const SEED_COMMANDE_LIGNES: CommandeDriveLigne[] = [
  // cmd-001 — Yasmine — démo multi-zones (Particulier + Pro + Traiteur)
  {
    id: "cl-001",
    commande_id: "cmd-001",
    produit_id: "prd-p-013",
    depot_id: "depot-particulier",
    zone_preparation: "particulier",
    quantite: 1,
    prix_unitaire: 8.4,
    statut_preparation: "en_attente",
    prepare_par_employe_id: null,
    prepare_at: null,
  },
  {
    id: "cl-002",
    commande_id: "cmd-001",
    produit_id: "prd-p-001",
    depot_id: "depot-particulier",
    zone_preparation: "particulier",
    quantite: 2,
    prix_unitaire: 6.9,
    statut_preparation: "en_attente",
    prepare_par_employe_id: null,
    prepare_at: null,
  },
  {
    id: "cl-003",
    commande_id: "cmd-001",
    produit_id: "prd-p-035",
    depot_id: "depot-professionnel",
    zone_preparation: "professionnel",
    quantite: 1,
    prix_unitaire: 10.5,
    statut_preparation: "en_attente",
    prepare_par_employe_id: null,
    prepare_at: null,
  },
  {
    id: "cl-004",
    commande_id: "cmd-001",
    produit_id: "prd-traiteur-pastilla",
    depot_id: "depot-particulier",
    zone_preparation: "traiteur",
    quantite: 1,
    prix_unitaire: 18.5,
    statut_preparation: "en_attente",
    prepare_par_employe_id: null,
    prepare_at: null,
  },
  {
    id: "cl-007",
    commande_id: "cmd-001",
    produit_id: "prd-traiteur-couscous",
    depot_id: "depot-particulier",
    zone_preparation: "traiteur",
    quantite: 1,
    prix_unitaire: 39.9,
    statut_preparation: "en_attente",
    prepare_par_employe_id: null,
    prepare_at: null,
  },
  // cmd-002 — Karim — Particulier + Pro (pas de traiteur)
  {
    id: "cl-005",
    commande_id: "cmd-002",
    produit_id: "prd-p-005",
    depot_id: "depot-particulier",
    zone_preparation: "particulier",
    quantite: 1,
    prix_unitaire: 11.5,
    statut_preparation: "en_attente",
    prepare_par_employe_id: null,
    prepare_at: null,
  },
  {
    id: "cl-006",
    commande_id: "cmd-002",
    produit_id: "prd-p-024",
    depot_id: "depot-professionnel",
    zone_preparation: "professionnel",
    quantite: 6,
    prix_unitaire: 1.8,
    statut_preparation: "en_attente",
    prepare_par_employe_id: null,
    prepare_at: null,
  },
];

export async function listCommandesDrive(
  statut?: CommandeDrive["statut"],
): Promise<CommandeDrive[]> {
  const sb = supabase();
  if (sb) {
    let q = sb.from("commandes_drive").select("*").order("creneau_retrait");
    if (statut) q = q.eq("statut", statut);
    const { data, error } = await q;
    if (error) throw error;
    return data as CommandeDrive[];
  }
  let list = [...SEED_COMMANDES];
  if (statut) list = list.filter((c) => c.statut === statut);
  return list;
}

export async function listLignesPourCommande(
  commandeId: string,
): Promise<CommandeDriveLigne[]> {
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb
      .from("commandes_drive_lignes")
      .select("*")
      .eq("commande_id", commandeId);
    if (error) throw error;
    return data as CommandeDriveLigne[];
  }
  return SEED_COMMANDE_LIGNES.filter((l) => l.commande_id === commandeId);
}

/**
 * Résout nom + catégorie pour un lot d'IDs produits en une seule requête.
 * Sert aux agrégations (ex. top produits drive) qui n'ont que les
 * `produit_id` des lignes et veulent un libellé lisible plutôt qu'un UUID.
 * Retourne une Map id → { nom, categorie } pour un lookup O(1) côté UI.
 */
export async function listProduitsNomsByIds(
  ids: string[],
): Promise<Map<string, { nom: string; categorie: string | null }>> {
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  const out = new Map<string, { nom: string; categorie: string | null }>();
  if (uniq.length === 0) return out;
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb
      .from("produits")
      .select("id, nom, categorie")
      .in("id", uniq);
    if (error) throw error;
    for (const p of (data ?? []) as Array<{
      id: string;
      nom: string;
      categorie: string | null;
    }>) {
      out.set(p.id, { nom: p.nom, categorie: p.categorie ?? null });
    }
    return out;
  }
  for (const id of uniq) {
    const p = SEED_PRODUITS.find((x) => x.id === id);
    if (p) out.set(id, { nom: p.nom, categorie: p.categorie ?? null });
  }
  return out;
}

/**
 * Variante qui ramène en plus `unit_type` du produit (via embedded
 * select PostgREST sur la FK produit_id → produits). Sert au Kanban
 * pour compter les lignes à peser sans charger tout le catalogue.
 *
 * Retour : { ligne } + champ `produit_unit_type` aplati.
 */
export type CommandeDriveLigneWithUnitType = CommandeDriveLigne & {
  produit_unit_type?: ProduitUnitType | null;
  produit_nom?: string | null;
  produit_categorie?: string | null;
};

export async function listLignesPourCommandeAvecUnitType(
  commandeId: string,
): Promise<CommandeDriveLigneWithUnitType[]> {
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb
      .from("commandes_drive_lignes")
      .select("*, produits(unit_type, nom, categorie)")
      .eq("commande_id", commandeId);
    if (error) throw error;
    type Row = CommandeDriveLigne & {
      produits?: {
        unit_type?: ProduitUnitType | null;
        nom?: string | null;
        categorie?: string | null;
      } | null;
    };
    return ((data ?? []) as Row[]).map((r) => ({
      ...r,
      produit_unit_type: r.produits?.unit_type ?? null,
      produit_nom: r.produits?.nom ?? null,
      produit_categorie: r.produits?.categorie ?? null,
    }));
  }
  // Mode local seed : pas de jointure, on devine via SEED_PRODUITS
  return SEED_COMMANDE_LIGNES.filter((l) => l.commande_id === commandeId).map(
    (l) => {
      const p = SEED_PRODUITS.find((x) => x.id === l.produit_id);
      return {
        ...l,
        produit_unit_type: null,
        produit_nom: p?.nom ?? null,
        produit_categorie: p?.categorie ?? null,
      };
    },
  );
}

/**
 * CA par jour (Particulier vs Pro) sur les N derniers jours.
 * Particulier = lignes drive zone 'particulier' OU 'traiteur'.
 * Pro         = lignes drive zone 'professionnel'.
 * Synthétise des points pour les jours sans données pour avoir une
 * courbe continue (à zéro), ce qui rend les charts lisibles.
 */
export async function listRevenueByDay(opts?: {
  days?: number;
}): Promise<Array<{ date: string; particulier: number; pro: number }>> {
  const days = opts?.days ?? 90;
  const today = new Date();
  const start = new Date(today.getTime() - (days - 1) * 86400_000);
  start.setHours(0, 0, 0, 0);
  const startIso = start.toISOString();

  const sb = supabase();
  const buckets = new Map<string, { particulier: number; pro: number }>();

  // Pré-remplir les buckets pour avoir une courbe continue
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86400_000);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { particulier: 0, pro: 0 });
  }

  if (sb) {
    // Fetch commandes_drive + lignes en parallèle pour la fenêtre
    const { data: cmds, error } = await sb
      .from("commandes_drive")
      .select(
        "id, created_at, statut, total_ttc, " +
          "commandes_drive_lignes(zone_preparation, quantite, prix_unitaire)",
      )
      .gte("created_at", startIso)
      .neq("statut", "annule");
    if (error) throw new Error(error.message);

    // STK-02 : le CA du jour DOIT être total_ttc (source unique, = le hero
    // PilotageStrip). Avant on sommait les lignes (prix_unitaire × quantite),
    // ce qui divergeait du total_ttc (lignes incomplètes en seed → chart à 0 €
    // alors que le hero affichait 321,69 €). On garde le total autoritaire et
    // on répartit Particulier/Pro selon la fraction Pro déduite des lignes.
    for (const c of (cmds ?? []) as unknown as Array<{
      created_at: string;
      total_ttc: number | null;
      commandes_drive_lignes: Array<{
        zone_preparation: string;
        quantite: number;
        prix_unitaire: number;
      }>;
    }>) {
      const key = c.created_at.slice(0, 10);
      const b = buckets.get(key);
      if (!b) continue;
      const total = Number(c.total_ttc ?? 0);
      if (total <= 0) continue;
      // Fraction Pro de la commande, estimée sur les lignes (à défaut → 0).
      let ligneTotal = 0;
      let ligneProTotal = 0;
      for (const l of c.commandes_drive_lignes ?? []) {
        const lt = Number(l.prix_unitaire) * Number(l.quantite);
        ligneTotal += lt;
        if (l.zone_preparation === "professionnel") ligneProTotal += lt;
      }
      const fracPro = ligneTotal > 0 ? ligneProTotal / ligneTotal : 0;
      const partPro = total * fracPro;
      b.pro += partPro;
      // particulier + traiteur regroupés (le client final)
      b.particulier += total - partPro;
    }
  } else {
    // Mode démo local : génère une courbe plausible déterministe pour
    // que le chart soit beau sans données réelles.
    let seed = 7919;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return (seed % 10_000) / 10_000;
    };
    let prevP = 320;
    let prevPro = 180;
    Array.from(buckets.entries()).forEach(([key, b], idx) => {
      // Walk + weekend boost
      const dayOfWeek = new Date(key + "T00:00:00").getDay();
      const weekendBoost = dayOfWeek === 6 || dayOfWeek === 0 ? 1.25 : 1;
      prevP = Math.max(
        80,
        prevP + (rand() - 0.4) * 90 + Math.sin(idx / 3) * 30,
      );
      prevPro = Math.max(
        40,
        prevPro + (rand() - 0.5) * 55 + Math.cos(idx / 4) * 20,
      );
      b.particulier = Math.round(prevP * weekendBoost);
      b.pro = Math.round(prevPro * weekendBoost);
    });
  }

  return Array.from(buckets.entries()).map(([date, b]) => ({
    date,
    particulier: Math.round(b.particulier * 100) / 100,
    pro: Math.round(b.pro * 100) / 100,
  }));
}

/**
 * CA drive total par jour sur les N derniers jours (commandes_drive
 * sum total_ttc par date). Exclut les commandes annulées.
 * Génère une courbe synthétique en mode local pour que le chart soit
 * lisible sans données réelles.
 */
export async function listDriveRevenueByDay(opts?: {
  days?: number;
}): Promise<Array<{ date: string; ca: number; commandes: number }>> {
  const days = opts?.days ?? 90;
  const today = new Date();
  const start = new Date(today.getTime() - (days - 1) * 86400_000);
  start.setHours(0, 0, 0, 0);
  const startIso = start.toISOString();

  const sb = supabase();
  const buckets = new Map<string, { ca: number; commandes: number }>();

  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86400_000);
    buckets.set(d.toISOString().slice(0, 10), { ca: 0, commandes: 0 });
  }

  if (sb) {
    const { data: cmds, error } = await sb
      .from("commandes_drive")
      .select("created_at, statut, total_ttc")
      .gte("created_at", startIso)
      .neq("statut", "annule");
    if (error) throw new Error(error.message);

    for (const c of (cmds ?? []) as Array<{
      created_at: string;
      total_ttc: number | string;
    }>) {
      const key = c.created_at.slice(0, 10);
      const b = buckets.get(key);
      if (!b) continue;
      b.ca += Number(c.total_ttc);
      b.commandes += 1;
    }
  } else {
    // Synthétique : random walk + boost weekend
    let seed = 4231;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return (seed % 10_000) / 10_000;
    };
    let prev = 240;
    Array.from(buckets.entries()).forEach(([key, b], idx) => {
      const dayOfWeek = new Date(key + "T00:00:00").getDay();
      const weekendBoost = dayOfWeek === 6 || dayOfWeek === 0 ? 1.35 : 1;
      prev = Math.max(
        60,
        prev + (rand() - 0.42) * 110 + Math.sin(idx / 2.5) * 40,
      );
      b.ca = Math.round(prev * weekendBoost);
      b.commandes = Math.max(1, Math.round((prev / 25) * weekendBoost));
    });
  }

  return Array.from(buckets.entries()).map(([date, b]) => ({
    date,
    ca: b.ca,
    commandes: b.commandes,
  }));
}

export async function updateLignePreparation(
  ligneId: string,
  patch: Partial<
    Pick<
      CommandeDriveLigne,
      "statut_preparation" | "prepare_par_employe_id" | "prepare_at"
    >
  >,
): Promise<void> {
  const sb = supabase();
  if (sb) {
    const { error } = await sb
      .from("commandes_drive_lignes")
      .update(patch)
      .eq("id", ligneId);
    // Propager l'erreur : sans ça, un échec DB laissait l'UI afficher un
    // succès sans persistance (perte de données silencieuse).
    if (error) throw error;
    return;
  }
  const row = SEED_COMMANDE_LIGNES.find((l) => l.id === ligneId);
  if (row) Object.assign(row, patch);
}

export async function setCommandeStatut(
  commandeId: string,
  statut: CommandeDrive["statut"],
): Promise<void> {
  const sb = supabase();
  if (sb) {
    const { error } = await sb
      .from("commandes_drive")
      .update({ statut })
      .eq("id", commandeId);
    if (error) throw error;
    return;
  }
  const row = SEED_COMMANDES.find((c) => c.id === commandeId);
  if (row) row.statut = statut;
}

/* ────────────────── Alertes DLC (badge count) ────────────────── */

/**
 * Nombre de lots en alerte DLC active (tous niveaux sauf "ok").
 * Câblé sur la vue Supabase `v_dlc_alerts` — même source que la page
 * /v2/admin/alertes-dlc. Utilisé pour le badge du bouton "Menu" dans la
 * bottom-nav (ARCH-12) et la commande "Voir les ruptures/DLC" du ⌘K.
 *
 * Résilient : retourne 0 en mode démo local ou si la vue est indisponible
 * (jamais d'exception qui casse le render de la nav).
 */
export async function countDlcAlerts(): Promise<number> {
  const sb = supabase();
  if (!sb) return 0;
  try {
    const { count, error } = await sb
      .from("v_dlc_alerts")
      .select("lot_id", { count: "exact", head: true })
      .neq("niveau_alerte", "ok");
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/* ────────────────── Mode info (for UI badge) ────────────────── */

export function dataMode(): "supabase" | "local" {
  return hasSupabase() ? "supabase" : "local";
}
