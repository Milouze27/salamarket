/* /api/po/confirm
 * ───────────────
 * GET  ?token=<signed>  → renvoie le PO pour affichage public (sans
 *                         email/SIRET fournisseur — info publique only)
 * POST { token }        → marque le PO comme 'confirmee' (ORDRSP-like)
 *
 * Public (pas d'auth Supabase). La vérif token = HMAC, donc sécurisé
 * sans table tokens, sans session.
 */

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { verifyPoToken } from "@/lib/po-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PostBody {
  token: string;
}

async function loadPo(poId: string) {
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("purchase_orders")
    .select(`
      id, numero_po, statut, date_livraison_prevue, total_ht, total_ttc,
      fournisseurs:fournisseur_id ( nom ),
      depots:depot_destination_id ( nom, adresse ),
      purchase_order_lignes ( reference_fourn, produit_id, quantite_commandee, prix_achat_ht )
    `)
    .eq("id", poId)
    .single();
  if (error || !data) return null;
  return data;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ ok: false, error: "token manquant" }, { status: 400 });
  }
  const v = verifyPoToken(token);
  if (!v.ok) {
    return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  }
  const po = await loadPo(v.po_id);
  if (!po) {
    return NextResponse.json({ ok: false, error: "commande introuvable" }, { status: 404 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p: any = po;
  return NextResponse.json({
    ok: true,
    po: {
      numero_po: p.numero_po,
      fournisseur_nom: p.fournisseurs?.nom ?? "",
      depot_nom: p.depots?.nom ?? "",
      depot_adresse: p.depots?.adresse ?? null,
      date_livraison_prevue: p.date_livraison_prevue,
      total_ht: Number(p.total_ht) || 0,
      total_ttc: Number(p.total_ttc) || 0,
      statut: p.statut,
      already_confirmed: p.statut === "confirmee" || p.statut === "partiellement_recue" || p.statut === "recue",
      lignes: (p.purchase_order_lignes ?? []).map((l: any) => ({
        ref: l.reference_fourn ?? null,
        qty: Number(l.quantite_commandee) || 0,
        pu: Number(l.prix_achat_ht) || 0,
        total: (Number(l.prix_achat_ht) || 0) * (Number(l.quantite_commandee) || 0),
      })),
    },
  });
}

export async function POST(req: Request) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 });
  }
  if (!body.token) {
    return NextResponse.json({ ok: false, error: "token manquant" }, { status: 400 });
  }
  const v = verifyPoToken(body.token);
  if (!v.ok) {
    return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  }
  const sb = supabaseServer();
  // Update statut → 'confirmee' uniquement si actuellement 'envoyee'.
  // Idempotent : si déjà confirmée, on renvoie ok=true sans rien faire.
  const { data: current } = await sb
    .from("purchase_orders")
    .select("id, statut")
    .eq("id", v.po_id)
    .single();
  if (!current) {
    return NextResponse.json({ ok: false, error: "commande introuvable" }, { status: 404 });
  }
  if (current.statut === "confirmee" || current.statut === "partiellement_recue" || current.statut === "recue") {
    return NextResponse.json({ ok: true, already: true });
  }
  if (current.statut !== "envoyee") {
    return NextResponse.json(
      { ok: false, error: `commande au statut ${current.statut}, confirmation impossible` },
      { status: 409 }
    );
  }
  const { error } = await sb
    .from("purchase_orders")
    .update({ statut: "confirmee" })
    .eq("id", v.po_id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
