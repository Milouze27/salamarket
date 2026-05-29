/* POST /api/po/[id]/match-bdl
 * ──────────────────────────
 * Body: { bdl_id: string }
 *
 * Lie un bon de commande envoyé/confirmé à un bon de livraison (F4 du
 * cycle réception). C'est ce qui passe le PO en 'partiellement_recue'
 * ou 'recue' selon les quantités scannées.
 *
 * NB : la création des stock_movements / mises à jour stock_par_depot
 *      est déjà gérée par le flux BDL existant (cf. bons_de_livraison).
 *      Ici on ne fait que le lien + l'aggregation des quantités reçues.
 */

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  bdl_id: string;
}

interface RouteCtx {
  params: { id: string };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(req: Request, { params }: RouteCtx) {
  const poId = params?.id;
  if (!poId) {
    return NextResponse.json({ error: "po id manquant" }, { status: 400 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!body.bdl_id) {
    return NextResponse.json({ error: "bdl_id requis" }, { status: 400 });
  }

  const sb = supabaseServer();

  const { data: po, error: poErr } = await sb
    .from("purchase_orders")
    .select(
      "id, statut, fournisseur_id, depot_destination_id, purchase_order_lignes(id, produit_id, quantite_commandee)"
    )
    .eq("id", poId)
    .single();
  if (poErr || !po) {
    return NextResponse.json({ error: "PO introuvable" }, { status: 404 });
  }
  if (po.statut !== "envoyee" && po.statut !== "confirmee" && po.statut !== "partiellement_recue") {
    return NextResponse.json(
      { error: `PO au statut ${po.statut}, match BDL impossible` },
      { status: 409 }
    );
  }

  // Charge le BDL + ses lignes
  const { data: bdl, error: bdlErr } = await sb
    .from("bons_de_livraison")
    .select(
      "id, fournisseur_id, depot_id, statut, bons_de_livraison_lignes(produit_id, quantite_recue)"
    )
    .eq("id", body.bdl_id)
    .single();
  if (bdlErr || !bdl) {
    return NextResponse.json({ error: "BDL introuvable" }, { status: 404 });
  }
  if (bdl.fournisseur_id !== po.fournisseur_id) {
    return NextResponse.json(
      { error: "Le BDL ne correspond pas au fournisseur du PO" },
      { status: 422 }
    );
  }

  // Aggrege les quantités reçues par produit (BDL peut être en
  // plusieurs lignes pour un même produit)
  const recuesByProduit = new Map<string, number>();
  for (const l of bdl.bons_de_livraison_lignes ?? []) {
    if (!l.produit_id) continue;
    recuesByProduit.set(
      l.produit_id,
      (recuesByProduit.get(l.produit_id) ?? 0) + Number(l.quantite_recue || 0)
    );
  }

  // Update chaque ligne PO avec la quantité reçue
  let totalCommandee = 0;
  let totalRecue = 0;
  for (const lpo of po.purchase_order_lignes ?? []) {
    const recue = recuesByProduit.get(lpo.produit_id) ?? 0;
    totalCommandee += Number(lpo.quantite_commandee) || 0;
    totalRecue += recue;
    await sb
      .from("purchase_order_lignes")
      .update({ quantite_recue: recue })
      .eq("id", lpo.id);
  }

  // Détermine le nouveau statut
  let newStatut: "partiellement_recue" | "recue" = "partiellement_recue";
  if (totalRecue >= totalCommandee && totalCommandee > 0) {
    newStatut = "recue";
  }

  await sb
    .from("purchase_orders")
    .update({
      statut: newStatut,
      bdl_id: body.bdl_id,
      date_reception: new Date().toISOString(),
    })
    .eq("id", poId);

  return NextResponse.json({
    ok: true,
    statut: newStatut,
    total_commandee: totalCommandee,
    total_recue: totalRecue,
  });
}

/* eslint-enable @typescript-eslint/no-explicit-any */
