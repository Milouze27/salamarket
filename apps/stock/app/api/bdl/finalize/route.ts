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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface FinalizeBody {
  bdl_id: string;
  employe_id?: string;
}

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
  let body: FinalizeBody;
  try {
    body = (await req.json()) as FinalizeBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!body.bdl_id) {
    return NextResponse.json({ error: "missing_bdl_id" }, { status: 400 });
  }

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
       )`
    )
    .eq("id", body.bdl_id)
    .single();
  if (bdlErr || !bdlRaw) {
    return NextResponse.json(
      { error: "bdl_not_found", detail: bdlErr?.message },
      { status: 404 }
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
      { status: 409 }
    );
  }

  // ─── 3. Validations bloquantes (mirror du sign-off client) ──────
  const blockers: string[] = [];
  if (bdl.temperature_reception_c === null) {
    blockers.push("temperature_missing");
  } else if (
    bdl.temperature_reception_c > (bdl.temperature_seuil_max_c ?? 4)
  ) {
    blockers.push("temperature_above_threshold");
  }
  if (!bdl.photo_palette_url_1 || !bdl.photo_palette_url_2) {
    blockers.push("photos_palette_missing");
  }
  if (blockers.length > 0) {
    return NextResponse.json(
      { error: "validation_failed", blockers },
      { status: 422 }
    );
  }

  // ─── 4. Recalcule l'écart côté SQL (source de vérité) ────────────
  try {
    await sb.rpc("bdl_recalc_ecart", { p_bdl_id: bdl.id });
  } catch (e) {
    console.warn("[finalize] bdl_recalc_ecart RPC fail (non fatal):", e);
  }

  // ─── 5. Pour chaque ligne reçue, incrémente stock_par_depot ──────
  // On reste sur 2 requêtes par ligne (select-existing + insert/update)
  // pour rester compatible avec le legacy `finalize()` côté client et
  // éviter de surcharger ce route handler avec un trigger SQL ad-hoc.
  let lignesRecues = 0;
  let lignesEcart = 0;
  for (const l of bdl.bons_de_livraison_lignes) {
    if (l.ecart_qte !== 0) lignesEcart++;
    const recu = l.quantite_recue;
    if (recu <= 0 || !l.produit_id || !bdl.depot_destination_id) continue;
    if (l.statut !== "recu" && l.statut !== "surplus") continue;

    const { data: existingRaw } = await sb
      .from("stock_par_depot")
      .select("id, quantite")
      .eq("produit_id", l.produit_id)
      .eq("depot_id", bdl.depot_destination_id)
      .maybeSingle();
    const existing = existingRaw as { id: string; quantite: number } | null;

    if (existing) {
      await sb
        .from("stock_par_depot")
        .update({
          quantite: existing.quantite + recu,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await sb.from("stock_par_depot").insert({
        produit_id: l.produit_id,
        depot_id: bdl.depot_destination_id,
        quantite: recu,
        is_visible: true,
      });
    }
    lignesRecues++;
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
    (finalRaw as { ecart_valeur_eur: number } | null)?.ecart_valeur_eur ?? 0
  );

  const valeurAttendue = bdl.bons_de_livraison_lignes.reduce(
    (s, l) => s + l.quantite_attendue * (l.prix_achat_ht ?? 0),
    0
  );
  const ratio = valeurAttendue > 0 ? Math.abs(ecartTotalEur) / valeurAttendue : 0;

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
    pdf_url: `/api/bdl/bon-reception-pdf-v2?bdl_id=${bdl.id}`,
  });
}

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
