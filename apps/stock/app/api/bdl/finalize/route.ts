/**
 * POST /api/bdl/finalize
 *
 * Clôt un BDL réceptionné en mode scanner-first :
 *   1. Recalcule l'écart valorisé via `bdl_recalc_ecart(p_bdl_id)` (RPC)
 *   2. Vérifie les pré-requis bloquants côté serveur (defense-in-depth) :
 *      température ≤ seuil, 2 photos palette, statut != déjà clos
 *   3. Met à jour le stock_par_depot pour chaque ligne reçue
 *   4. Marque le BDL `receptionnee` + `scan_completed_at`
 *   5. Push iPhone admin si écart total > 2 % de la valeur attendue
 *
 * Body JSON :
 *   { bdl_id: uuid, employe_id?: uuid }
 *
 * Réponse :
 *   { ok: true,
 *     bdl_id, numero_bdl,
 *     ecart_valeur_eur, ecart_valeur_attendue_eur, ecart_ratio,
 *     push_sent, lignes_recues, lignes_ecart }
 *
 * Idempotent : si appelé sur un BDL déjà clos, renvoie 409 sans
 * re-incrémenter le stock (sinon double comptage).
 */

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { validateBody } from "@/lib/validate/helper";
import { finalizeBdlSchema } from "@/lib/validate/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LigneRow {
  id: string;
  produit_id: string | null;
  quantite_attendue: number;
  quantite_recue: number;
  ecart_qte: number;
  prix_achat_ht: number | null;
  statut: string;
  produits: { nom: string } | null;
}

const PUSH_THRESHOLD_PCT = 0.02;

export async function POST(req: Request) {
  const parsed = await validateBody(req, finalizeBdlSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const sb = supabaseServer();

  // ─── 1. Charge le BDL + lignes en une requête ────────────────────
  const { data: bdlRaw, error: bdlErr } = await sb
    .from("bons_de_livraison")
    .select(
      `id, numero_bdl, statut, depot_destination_id,
       temperature_reception_c, temperature_seuil_max_c,
       photo_palette_url_1, photo_palette_url_2,
       fournisseurs(nom),
       depots(nom),
       bons_de_livraison_lignes(
         id, produit_id, quantite_attendue, quantite_recue, ecart_qte,
         prix_achat_ht, statut, produits(nom)
       )`,
    )
    .eq("id", body.bdl_id)
    .single();
  if (bdlErr || !bdlRaw) {
    return NextResponse.json(
      { error: "bdl_not_found", detail: bdlErr?.message },
      { status: 404 },
    );
  }
  const bdl = bdlRaw as unknown as {
    id: string;
    numero_bdl: string;
    statut: string;
    depot_destination_id: string | null;
    temperature_reception_c: number | null;
    temperature_seuil_max_c: number;
    photo_palette_url_1: string | null;
    photo_palette_url_2: string | null;
    fournisseurs: { nom: string } | null;
    depots: { nom: string } | null;
    bons_de_livraison_lignes: LigneRow[];
  };

  // ─── 2. Idempotence ──────────────────────────────────────────────
  if (bdl.statut === "receptionnee") {
    return NextResponse.json(
      { error: "already_finalized", numero_bdl: bdl.numero_bdl },
      { status: 409 },
    );
  }

  // ─── 3. Validations bloquantes (mirror du sign-off client) ──────
  const blockers: string[] = [];
  if (bdl.temperature_reception_c === null) {
    blockers.push("temperature_missing");
  } else if (bdl.temperature_reception_c > (bdl.temperature_seuil_max_c ?? 4)) {
    blockers.push("temperature_above_threshold");
  }
  if (!bdl.photo_palette_url_1 || !bdl.photo_palette_url_2) {
    blockers.push("photos_palette_missing");
  }
  if (blockers.length > 0) {
    return NextResponse.json(
      { error: "validation_failed", blockers },
      { status: 422 },
    );
  }

  // ─── 4. Recalcule l'écart côté SQL (source de vérité) ────────────
  try {
    await sb.rpc("bdl_recalc_ecart", { p_bdl_id: bdl.id });
  } catch (e) {
    console.warn("[finalize] bdl_recalc_ecart RPC fail (non fatal):", e);
  }

  // ─── 5. Pour chaque ligne reçue, incrémente stock_par_depot ──────
  // Wave 4 (ML-3) : on passe par la RPC atomique `adjust_stock`
  // (verrou ligne + ledger stock_movements). Une réception concurrente
  // sur le même produit/dépôt ne peut plus écraser le compteur, et
  // chaque entrée est tracée dans le ledger pour audit.
  let lignesRecues = 0;
  let lignesEcart = 0;
  // Changements de prix d'achat détectés à cette réception (le fournisseur a
  // bougé son tarif) → renvoyés au client pour alerter le gérant sur l'impact
  // marge. { produit, ancien_cout, nouveau_cout, variation_pct }
  const prixChanges: Array<{
    produit: string;
    ancien_cout: number;
    nouveau_cout: number;
    variation_pct: number;
  }> = [];
  for (const l of bdl.bons_de_livraison_lignes) {
    if (l.ecart_qte !== 0) lignesEcart++;
    const recu = l.quantite_recue;
    if (recu <= 0 || !l.produit_id || !bdl.depot_destination_id) continue;
    if (l.statut !== "recu" && l.statut !== "surplus") continue;

    // Lit l'état AVANT incrément pour le coût moyen pondéré (PMP).
    const coutRecu =
      l.prix_achat_ht != null && l.prix_achat_ht > 0 ? l.prix_achat_ht : null;
    let qteAvant = 0;
    let coutAvant: number | null = null;
    if (coutRecu != null) {
      const { data: avant } = await sb
        .from("stock_par_depot")
        .select("quantite, cout_achat_ht")
        .eq("produit_id", l.produit_id)
        .eq("depot_id", bdl.depot_destination_id)
        .maybeSingle();
      qteAvant = Number((avant as { quantite: number } | null)?.quantite ?? 0);
      coutAvant =
        (avant as { cout_achat_ht: number | null } | null)?.cout_achat_ht ??
        null;
    }

    const { error: adjErr } = await sb.rpc("adjust_stock", {
      p_produit_id: l.produit_id,
      p_depot_id: bdl.depot_destination_id,
      p_delta: recu,
      p_type: "reception",
      p_lot_id: null,
      p_reference_id: bdl.id,
      p_actor_id: body.employe_id ?? null,
    });
    if (adjErr) {
      console.error("[finalize] adjust_stock RPC error:", adjErr);
      return NextResponse.json(
        { error: "stock_update_failed", detail: adjErr.message },
        { status: 500 },
      );
    }
    lignesRecues++;

    // SYNCHRO COÛT : répercute le prix payé en PMP (coût moyen pondéré) sur le
    // produit. C'est ce qui garde le coût — et donc la marge — à jour quand le
    // fournisseur change ses prix. Hors-bloquant (le stock est déjà entré).
    if (coutRecu != null) {
      const nouveauCout =
        qteAvant <= 0 || coutAvant == null
          ? Math.round(coutRecu * 10000) / 10000
          : Math.round(
              ((qteAvant * coutAvant + recu * coutRecu) / (qteAvant + recu)) *
                10000,
            ) / 10000;
      const { error: coutErr } = await sb
        .from("stock_par_depot")
        .update({ cout_achat_ht: nouveauCout })
        .eq("produit_id", l.produit_id)
        .eq("depot_id", bdl.depot_destination_id);
      if (coutErr) {
        console.error("[finalize] maj cout_achat_ht échouée:", coutErr.message);
      } else if (
        coutAvant != null &&
        coutAvant > 0 &&
        Math.abs(nouveauCout - coutAvant) / coutAvant >= 0.03
      ) {
        // Variation ≥ 3 % du coût → on prévient le gérant.
        prixChanges.push({
          produit: l.produits?.nom ?? "Produit",
          ancien_cout: coutAvant,
          nouveau_cout: nouveauCout,
          variation_pct:
            Math.round(((nouveauCout - coutAvant) / coutAvant) * 1000) / 10,
        });
      }
    }
  }

  // ─── 6. Marque le BDL réceptionné + relit l'écart total à jour ───
  const nowIso = new Date().toISOString();
  await sb
    .from("bons_de_livraison")
    .update({
      statut: "receptionnee",
      receptionne_par: body.employe_id ?? null,
      receptionne_le: nowIso,
      scan_completed_at: nowIso,
    })
    .eq("id", bdl.id);

  const { data: finalRaw } = await sb
    .from("bons_de_livraison")
    .select("ecart_valeur_eur")
    .eq("id", bdl.id)
    .single();
  const ecartTotalEur = Number(
    (finalRaw as { ecart_valeur_eur: number } | null)?.ecart_valeur_eur ?? 0,
  );

  const valeurAttendue = bdl.bons_de_livraison_lignes.reduce(
    (s, l) => s + l.quantite_attendue * (l.prix_achat_ht ?? 0),
    0,
  );
  const ratio =
    valeurAttendue > 0 ? Math.abs(ecartTotalEur) / valeurAttendue : 0;

  // ─── 7. Push admin si écart total > seuil ───────────────────────
  let pushSent = false;
  if (ratio > PUSH_THRESHOLD_PCT && valeurAttendue > 0) {
    try {
      await pushAdminsServer(req, {
        title: `Écart réception ${bdl.fournisseurs?.nom ?? "BDL"}`,
        body: `BDL ${bdl.numero_bdl} clôturé avec ${ecartTotalEur >= 0 ? "+" : ""}${ecartTotalEur.toFixed(2)} € d'écart (${(ratio * 100).toFixed(1)}%). Validation comptable requise.`,
        url: `/v2/reception/${bdl.id}/scan-first`,
        tag: `bdl-final-${bdl.id}`,
      });
      pushSent = true;
    } catch (e) {
      console.warn("[finalize] push admin fail:", e);
    }
  } else {
    // Push "info" simple : BDL clos sans alerte. Garde Otmane au courant.
    try {
      await pushAdminsServer(req, {
        title: `Réception ${bdl.fournisseurs?.nom ?? "BDL"} validée`,
        body: `${bdl.numero_bdl} · ${bdl.depots?.nom ?? "?"} · ${lignesRecues} lignes · écart ${ecartTotalEur.toFixed(2)} €`,
        url: `/v2/reception`,
        tag: `bdl-done-${bdl.id}`,
      });
      pushSent = true;
    } catch (e) {
      console.warn("[finalize] push info fail:", e);
    }
  }

  return NextResponse.json({
    ok: true,
    bdl_id: bdl.id,
    numero_bdl: bdl.numero_bdl,
    ecart_valeur_eur: ecartTotalEur,
    ecart_valeur_attendue_eur: valeurAttendue,
    ecart_ratio: ratio,
    lignes_recues: lignesRecues,
    lignes_ecart: lignesEcart,
    push_sent: pushSent,
    prix_changes: prixChanges,
    pdf_url: `/api/bdl/bon-reception-pdf-v2?bdl_id=${bdl.id}`,
  });
}

async function pushAdminsServer(
  req: Request,
  payload: { title: string; body: string; url?: string; tag?: string },
): Promise<void> {
  const sb = supabaseServer();
  const { data: empRaw } = await sb
    .from("employes")
    .select("id, role, prenom")
    .eq("is_active", true);
  const ids = (
    (empRaw ?? []) as Array<{
      id: string;
      role: string;
      prenom: string | null;
    }>
  )
    .filter(
      (e) => e.role === "admin" || ["Otmane", "Ahmed"].includes(e.prenom ?? ""),
    )
    .map((e) => e.id);
  if (ids.length === 0) return;

  const origin = new URL(req.url).origin;
  await fetch(`${origin}/api/push/send`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // HOTFIX vague 7 : /api/push/send exige x-internal-secret.
      "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
    },
    body: JSON.stringify({ ...payload, employe_ids: ids }),
  });
}
