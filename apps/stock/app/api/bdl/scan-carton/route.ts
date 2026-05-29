/**
 * POST /api/bdl/scan-carton
 *
 * Résout un EAN scanné en réception scanner-first :
 *   1. Lookup `codes_barres_cartons` (EAN carton fournisseur → produit + qty)
 *      ou fallback `produits.ean` (EAN unitaire) si pas un carton
 *   2. Match contre une ligne du BDL → incrémente `nb_cartons_scannes`,
 *      `quantite_recue`, push event timeline JSONB
 *   3. Si pas de ligne BDL → réponse `surplus` (la page client ouvre
 *      un modal de signalement, comme le legacy)
 *   4. Si EAN totalement inconnu → réponse `unknown` (page ouvre modal
 *      création produit)
 *   5. Si la nouvelle quantité reçue crée un écart > 2 % de l'attendu
 *      sur cette ligne, push iPhone admins immédiate
 *
 * Body JSON :
 *   { bdl_id: uuid, ean: string, employe_id?: uuid, lot_id?: string }
 *
 * Réponse :
 *   { kind: "ok" | "warn" | "miss" | "surplus" | "unknown",
 *     label: string,         // texte court pour le bandeau scanner
 *     sub?: string,
 *     ligne_id?: uuid,
 *     produit_id?: uuid,
 *     produit_nom?: string,
 *     quantite_recue?: number,
 *     quantite_attendue?: number,
 *     ecart_qte?: number,
 *     push_sent?: boolean }
 *
 * Pourquoi serveur et pas client : on veut un seul endroit où la règle
 * "écart > X % → push instantanée" vit, et écrire `scan_timeline` de
 * manière atomique (via la fonction SQL `bdl_ligne_push_event`).
 */

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ScanBody {
  bdl_id: string;
  ean: string;
  employe_id?: string;
  lot_id?: string;
}

interface CartonRow {
  ean_carton: string;
  produit_id: string;
  quantite_par_carton: number;
}

interface ProduitRow {
  id: string;
  nom: string;
  ean: string | null;
}

interface LigneRow {
  id: string;
  produit_id: string | null;
  quantite_attendue: number;
  quantite_recue: number;
  nb_cartons_scannes: number;
  prix_achat_ht: number | null;
}

// Seuil au-delà duquel on push instantanément un admin pour validation.
// Aligné sur le sign-off : 2 % d'écart valeur ou quantité.
const PUSH_THRESHOLD_PCT = 0.02;

export async function POST(req: Request) {
  let body: ScanBody;
  try {
    body = (await req.json()) as ScanBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!body.bdl_id || !body.ean) {
    return NextResponse.json(
      { error: "missing_bdl_id_or_ean" },
      { status: 400 }
    );
  }
  const ean = body.ean.trim();
  if (ean.length < 4) {
    return NextResponse.json({ error: "ean_too_short" }, { status: 400 });
  }

  const sb = supabaseServer();

  // ─── 1. Charge le BDL minimal (pour le contexte fournisseur/numero) ─
  const { data: bdlData, error: bdlErr } = await sb
    .from("bons_de_livraison")
    .select(
      "id, numero_bdl, depot_destination_id, fournisseur_id, fournisseurs(nom)"
    )
    .eq("id", body.bdl_id)
    .single();
  if (bdlErr || !bdlData) {
    return NextResponse.json(
      { error: "bdl_not_found", detail: bdlErr?.message },
      { status: 404 }
    );
  }
  const bdl = bdlData as unknown as {
    id: string;
    numero_bdl: string;
    depot_destination_id: string;
    fournisseur_id: string | null;
    fournisseurs: { nom: string } | null;
  };

  // ─── 2. Marque le BDL "en_cours" + scan_started_at si premier scan ─
  await sb
    .from("bons_de_livraison")
    .update({
      statut: "en_cours",
      scan_started_at: new Date().toISOString(),
    })
    .eq("id", body.bdl_id)
    .is("scan_started_at", null);

  // ─── 3. Résout l'EAN : carton multi-unité ou unité simple ───────
  let produitId: string | null = null;
  let qtyDelta = 1;
  let isCarton = false;

  const { data: cartonRaw } = await sb
    .from("codes_barres_cartons")
    .select("ean_carton, produit_id, quantite_par_carton")
    .eq("ean_carton", ean)
    .maybeSingle();
  const carton = cartonRaw as CartonRow | null;

  if (carton) {
    produitId = carton.produit_id;
    qtyDelta = carton.quantite_par_carton;
    isCarton = true;
  } else {
    const { data: prodRaw } = await sb
      .from("produits")
      .select("id, nom, ean")
      .eq("ean", ean)
      .maybeSingle();
    const prod = prodRaw as ProduitRow | null;
    if (prod) {
      produitId = prod.id;
      qtyDelta = 1;
    }
  }

  if (!produitId) {
    return NextResponse.json({
      kind: "unknown",
      label: "EAN inconnu",
      sub: "Crée la fiche produit côté app",
      code: ean,
    });
  }

  // ─── 4. Récupère le nom produit (utile pour les feedbacks UX) ───
  const { data: prodNomRaw } = await sb
    .from("produits")
    .select("id, nom, ean")
    .eq("id", produitId)
    .single();
  const produitNom = (prodNomRaw as ProduitRow | null)?.nom ?? "Produit";

  // ─── 5. Match contre les lignes du BDL ──────────────────────────
  const { data: lignesRaw } = await sb
    .from("bons_de_livraison_lignes")
    .select(
      "id, produit_id, quantite_attendue, quantite_recue, nb_cartons_scannes, prix_achat_ht"
    )
    .eq("bdl_id", body.bdl_id);
  const lignes = (lignesRaw ?? []) as LigneRow[];

  const ligne = lignes.find((l) => l.produit_id === produitId);

  if (!ligne) {
    // EAN connu mais hors BDL → surplus. Le client ouvrira un modal.
    return NextResponse.json({
      kind: "surplus",
      label: "Surplus : produit hors BDL",
      sub: produitNom,
      code: ean,
      produit_id: produitId,
      produit_nom: produitNom,
      qty_delta: qtyDelta,
      is_carton: isCarton,
    });
  }

  // ─── 6. Update ligne : +qtyDelta, push event timeline ───────────
  const nouvelleQte = ligne.quantite_recue + qtyDelta;
  const ecartApres = nouvelleQte - ligne.quantite_attendue;
  const recuComplet = nouvelleQte >= ligne.quantite_attendue;
  const surplusLine = ecartApres > 0;

  // statut compatible avec l'enum existante du legacy
  const nouveauStatut: "attendu" | "recu" | "surplus" = surplusLine
    ? "surplus"
    : recuComplet
      ? "recu"
      : "attendu";

  const updatePayload: Record<string, unknown> = {
    quantite_recue: nouvelleQte,
    nb_cartons_scannes: ligne.nb_cartons_scannes + (isCarton ? 1 : 0),
    statut: nouveauStatut,
    scanne_le: new Date().toISOString(),
    scanne_par: body.employe_id ?? null,
  };
  if (body.lot_id) {
    updatePayload.lot_id = body.lot_id;
  }

  const { error: updErr } = await sb
    .from("bons_de_livraison_lignes")
    .update(updatePayload)
    .eq("id", ligne.id);

  if (updErr) {
    return NextResponse.json(
      { error: "update_ligne_failed", detail: updErr.message },
      { status: 500 }
    );
  }

  // Append timeline event via la fonction SQL (atomic JSONB append).
  // Best-effort : si la fonction n'est pas exposée RPC, on log et on
  // continue — la réception ne doit pas casser à cause d'un audit log.
  try {
    await sb.rpc("bdl_ligne_push_event", {
      p_ligne_id: ligne.id,
      p_event: {
        type: isCarton ? "scan_carton" : "scan_unite",
        ean,
        qty_delta: qtyDelta,
        new_qte: nouvelleQte,
        employe_id: body.employe_id ?? null,
        lot_id: body.lot_id ?? null,
      },
    });
  } catch (e) {
    console.warn("[scan-carton] timeline RPC fail:", e);
  }

  // ─── 7. Push admin si écart > 2 % de la qty attendue sur cette ligne ─
  let pushSent = false;
  if (ligne.quantite_attendue > 0) {
    const ratio = Math.abs(ecartApres) / ligne.quantite_attendue;
    if (ratio > PUSH_THRESHOLD_PCT && surplusLine) {
      try {
        await pushAdminsServer(req, {
          title: `Écart scan ${bdl.fournisseurs?.nom ?? "BDL"}`,
          body: `${produitNom} : ${nouvelleQte}/${ligne.quantite_attendue} (+${ecartApres}). Bdl ${bdl.numero_bdl}.`,
          url: `/v2/reception/${bdl.id}/scan-first`,
          tag: `bdl-ecart-${ligne.id}`,
        });
        pushSent = true;
      } catch (e) {
        console.warn("[scan-carton] push admin fail:", e);
      }
    }
  }

  // ─── 8. Réponse client ──────────────────────────────────────────
  const kind: "ok" | "warn" = surplusLine ? "warn" : "ok";
  const label = surplusLine
    ? `Surplus : ${produitNom}`
    : isCarton
      ? `Carton OK · ${produitNom}`
      : `OK · ${produitNom}`;
  const sub = `${nouvelleQte}/${ligne.quantite_attendue}${isCarton ? ` (carton ×${qtyDelta})` : ""}${pushSent ? " · push Otmane" : ""}`;

  return NextResponse.json({
    kind,
    label,
    sub,
    code: ean,
    ligne_id: ligne.id,
    produit_id: produitId,
    produit_nom: produitNom,
    quantite_recue: nouvelleQte,
    quantite_attendue: ligne.quantite_attendue,
    ecart_qte: ecartApres,
    is_carton: isCarton,
    qty_delta: qtyDelta,
    push_sent: pushSent,
  });
}

/**
 * Helper interne : push vers les admins sans dépendre du client lib
 * (qui est "use client"). On résout les IDs serveur puis on POST à
 * /api/push/send via la même base URL que la requête courante.
 */
async function pushAdminsServer(
  req: Request,
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<void> {
  const sb = supabaseServer();
  const { data: empRaw } = await sb
    .from("employes")
    .select("id, role, prenom")
    .eq("is_active", true);
  const ids = ((empRaw ?? []) as Array<{
    id: string;
    role: string;
    prenom: string | null;
  }>)
    .filter(
      (e) => e.role === "admin" || ["Otmane", "Ahmed"].includes(e.prenom ?? "")
    )
    .map((e) => e.id);
  if (ids.length === 0) return;

  const origin = new URL(req.url).origin;
  await fetch(`${origin}/api/push/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...payload, employe_ids: ids }),
  });
}
