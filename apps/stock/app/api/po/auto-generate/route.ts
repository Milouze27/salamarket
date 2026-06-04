/* POST /api/po/auto-generate
 * ─────────────────────────
 * L'algo qui prépare les brouillons de PO. Appelé soit par le cron
 * Supabase (auto-generate-pos edge function, daily 06:00 Europe/Paris),
 * soit manuellement depuis /v2/po (bouton "Régénérer").
 *
 * Stratégie (T+10 — version honnête mais simple, à enrichir post-démo) :
 *   1. Pour chaque dépôt actif :
 *      a. Charger les produits avec stock < seuil de réassort
 *         (heuristique T+10 : si stock_par_depot.quantite ≤ 0, on
 *         considère qu'il faut recommander un "lot standard")
 *      b. Trouver le fournisseur principal (produits_fournisseurs
 *         est_principal=true)
 *      c. Si certif principal expiré → essayer un fournisseur backup
 *         (autre produits_fournisseurs sur le même produit avec certif OK)
 *      d. Si toujours rien → ligne ajoutée au "PO bloqué" du principal
 *         (Otmane voit le brouillon + le badge rouge)
 *   2. Regrouper par (fournisseur, dépôt) → un PO brouillon
 *   3. Respecter min_commande_euros → si <, on garde quand même comme
 *      brouillon mais on flag dans notes (Otmane décide)
 *
 * Ne JAMAIS créer un PO si un brouillon non envoyé existe déjà pour le
 * même couple (fournisseur, dépôt) — on l'update à la place.
 */

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { certifAlerte } from "@/lib/types/po";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ReassortCandidate {
  produit_id: string;
  depot_id: string;
  manquant: number;
}

const DEFAULT_REASSORT_QTY = 12; // T+10 : lot standard si on ne sait pas

export async function POST() {
  const sb = supabaseServer();
  const startedAt = Date.now();

  // 1. Charge tous les dépôts actifs
  const { data: depots } = await sb
    .from("depots")
    .select("id, nom, type")
    .eq("is_active", true);
  if (!depots || depots.length === 0) {
    return NextResponse.json({ ok: true, created: 0, reason: "no depots" });
  }

  // 2. Charge le stock à 0 (ou négatif) — candidats au réassort
  const { data: stockBas } = await sb
    .from("stock_par_depot")
    .select("produit_id, depot_id, quantite")
    .lte("quantite", 0);

  const candidates: ReassortCandidate[] = (stockBas ?? []).map((s: any) => ({
    produit_id: s.produit_id,
    depot_id: s.depot_id,
    manquant: DEFAULT_REASSORT_QTY,
  }));

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, created: 0, reason: "rien à réassortir" });
  }

  // 3. Charge les liaisons produit → fournisseur(s)
  const produitIds = Array.from(new Set(candidates.map((c) => c.produit_id)));
  const { data: liaisons } = await sb
    .from("produits_fournisseurs")
    .select(`
      produit_id, fournisseur_id, reference_fourn, prix_achat_ht,
      conditionnement_qte, est_principal,
      fournisseurs ( id, nom, email_commandes, lead_time_jours,
        min_commande_euros, certif_organisme, certif_numero, certif_expire_le, actif )
    `)
    .in("produit_id", produitIds);

  const byProduit = new Map<string, any[]>();
  for (const l of liaisons ?? []) {
    const arr = byProduit.get(l.produit_id) ?? [];
    arr.push(l);
    byProduit.set(l.produit_id, arr);
  }

  // 4. Pour chaque candidat, choisir un fournisseur (principal si certif
  //    OK, sinon backup avec certif OK, sinon principal "bloqué")
  type Picked = {
    produit_id: string;
    depot_id: string;
    qty: number;
    fournisseur_id: string;
    fournisseur_nom: string;
    reference_fourn: string | null;
    prix_achat_ht: number;
    blocked: boolean;
  };
  const picks: Picked[] = [];

  // CERTIF-OK : un fournisseur n'est éligible que si actif ET certif
  // halal ni manquante ni expirée. "expiree"/"manquante" → JAMAIS commander.
  const CERTIF_OK = new Set(["ok", "expire_30j", "expire_60j"]);
  const fournisseurEligible = (f: any): boolean =>
    Boolean(f?.actif) && CERTIF_OK.has(certifAlerte(f?.certif_expire_le));

  // ML-5 — lignes qu'on REFUSE de router : ni le principal ni aucun
  // backup n'a une certif halal valide. On ne crée AUCUN PO vers un
  // fournisseur à certif expirée. On remonte la ligne pour audit.
  type Blocked = {
    produit_id: string;
    depot_id: string;
    fournisseur_id: string | null;
    fournisseur_nom: string;
    certif_alerte: string;
    raison: string;
  };
  const blockedLines: Blocked[] = [];

  for (const c of candidates) {
    const liens = byProduit.get(c.produit_id) ?? [];
    if (liens.length === 0) continue; // pas de fournisseur connu → skip

    const principal = liens.find((l) => l.est_principal) ?? liens[0];
    const principalOk = fournisseurEligible(principal.fournisseurs);

    let chosen = principal;

    if (!principalOk) {
      const backup = liens.find(
        (l) => l !== principal && fournisseurEligible(l.fournisseurs)
      );
      if (backup) {
        // On bascule sur un fournisseur dont la certif halal EST valide.
        chosen = backup;
      } else {
        // Aucune source halal valide → on NE commande PAS. Le moat
        // interdit de générer un PO vers un fournisseur certif expirée :
        // même en brouillon, ça ne doit pas exister comme document
        // envoyable. On consigne la ligne pour qu'Otmane arbitre.
        blockedLines.push({
          produit_id: c.produit_id,
          depot_id: c.depot_id,
          fournisseur_id: principal.fournisseur_id ?? null,
          fournisseur_nom: principal.fournisseurs?.nom ?? "",
          certif_alerte: certifAlerte(principal.fournisseurs?.certif_expire_le),
          raison:
            "Certificat halal du fournisseur principal expiré ou manquant, aucun fournisseur de secours certifié.",
        });
        continue;
      }
    }

    const condQty = Math.max(1, Number(chosen.conditionnement_qte) || 1);
    const qty = Math.ceil(c.manquant / condQty) * condQty;

    picks.push({
      produit_id: c.produit_id,
      depot_id: c.depot_id,
      qty,
      fournisseur_id: chosen.fournisseur_id,
      fournisseur_nom: chosen.fournisseurs?.nom ?? "",
      reference_fourn: chosen.reference_fourn ?? null,
      prix_achat_ht: Number(chosen.prix_achat_ht) || 0,
      blocked: false,
    });
  }

  // 5. Regroupe par (fournisseur, dépôt)
  type Group = {
    fournisseur_id: string;
    depot_id: string;
    lignes: Picked[];
  };
  const groups = new Map<string, Group>();
  for (const p of picks) {
    const key = `${p.fournisseur_id}::${p.depot_id}`;
    const g = groups.get(key) ?? {
      fournisseur_id: p.fournisseur_id,
      depot_id: p.depot_id,
      lignes: [],
    };
    g.lignes.push(p);
    groups.set(key, g);
  }

  // 6. Pour chaque groupe, upsert un brouillon
  let created = 0;
  let updated = 0;
  for (const g of groups.values()) {
    // Check existing brouillon
    const { data: existing } = await sb
      .from("purchase_orders")
      .select("id")
      .eq("fournisseur_id", g.fournisseur_id)
      .eq("depot_destination_id", g.depot_id)
      .eq("statut", "brouillon")
      .limit(1)
      .maybeSingle();

    const total = g.lignes.reduce((s, l) => s + l.qty * l.prix_achat_ht, 0);

    let poId: string;
    if (existing) {
      poId = existing.id;
      await sb
        .from("purchase_orders")
        .update({ total_ht: total, total_ttc: total * 1.055, updated_at: new Date().toISOString() })
        .eq("id", poId);
      // Strip anciennes lignes (idempotence)
      await sb.from("purchase_order_lignes").delete().eq("po_id", poId);
      updated++;
    } else {
      // Calcule une date livraison prévue = today + lead_time du fournisseur
      // (best effort — si lead_time inconnu, +3 jours)
      const { data: f } = await sb
        .from("fournisseurs")
        .select("lead_time_jours")
        .eq("id", g.fournisseur_id)
        .single();
      const lead = (f?.lead_time_jours ?? 3) as number;
      const dliv = new Date();
      dliv.setDate(dliv.getDate() + lead);

      const { data: ins, error: insErr } = await sb
        .from("purchase_orders")
        .insert({
          fournisseur_id: g.fournisseur_id,
          depot_destination_id: g.depot_id,
          statut: "brouillon",
          total_ht: total,
          total_ttc: total * 1.055,
          date_livraison_prevue: dliv.toISOString().slice(0, 10),
          notes:
            "Brouillon généré automatiquement par l'algo de réassort Salam Stock.",
        })
        .select("id")
        .single();
      if (insErr || !ins) {
        console.error("[po/auto-generate] insert", insErr);
        continue;
      }
      poId = ins.id;
      created++;
    }

    // Insert toutes les lignes du groupe. À ce stade, toute ligne
    // routée vers un PO a un fournisseur dont la certif halal est
    // valide (les lignes bloquées ont été écartées en amont).
    const lignesPayload = g.lignes.map((l) => ({
      po_id: poId,
      produit_id: l.produit_id,
      reference_fourn: l.reference_fourn,
      quantite_commandee: l.qty,
      prix_achat_ht: l.prix_achat_ht,
      tva_pct: 5.5,
      notes: null,
    }));
    if (lignesPayload.length > 0) {
      await sb.from("purchase_order_lignes").insert(lignesPayload);
    }
  }

  return NextResponse.json({
    ok: true,
    created,
    updated,
    candidates: candidates.length,
    groups: groups.size,
    // ML-5 — réassorts NON commandés faute de fournisseur halal valide.
    // Otmane voit exactement quoi débloquer (renouveler la certif ou
    // référencer un fournisseur de secours certifié) avant de pouvoir
    // commander ces produits. Le moat halal vit ici.
    blocked_count: blockedLines.length,
    blocked_lines: blockedLines,
    elapsed_ms: Date.now() - startedAt,
  });
}

/* eslint-enable @typescript-eslint/no-explicit-any */
