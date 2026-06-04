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
 *      sur cette ligne — DANS LES DEUX SENS (surplus OU manque) — push
 *      iPhone admins immédiate (ML-10)
 *   6. Plafond 150 % (ML-10) : si le scan ferait dépasser 1,5× l'attendu,
 *      réponse `blocked` SANS écriture tant que `confirm_over` n'est pas
 *      vrai (double comptage / scan en boucle probable)
 *
 * Body JSON :
 *   { bdl_id: uuid, ean: string, employe_id?: uuid, lot_id?: string,
 *     confirm_over?: boolean }   // force l'écriture au-delà de 150 %
 *
 * Réponse :
 *   { kind: "ok" | "warn" | "miss" | "surplus" | "unknown" | "blocked",
 *     label: string,         // texte court pour le bandeau scanner
 *     sub?: string,
 *     ligne_id?: uuid,
 *     produit_id?: uuid,
 *     produit_nom?: string,
 *     quantite_recue?: number,
 *     quantite_attendue?: number,
 *     quantite_si_confirme?: number,  // (blocked) qté si confirm_over
 *     requires_confirm?: boolean,     // (blocked) re-POST avec confirm_over
 *     ecart_qte?: number,
 *     push_sent?: boolean }
 *
 * Pourquoi serveur et pas client : on veut un seul endroit où les règles
 * "écart > X % → push instantanée" et "sur-comptage > 150 % → blocage"
 * vivent, et écrire `scan_timeline` de manière atomique (via la fonction
 * SQL `bdl_ligne_push_event`).
 */

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { validateBody } from "@/lib/validate/helper";
import { scanCartonSchema } from "@/lib/validate/schemas";
import { certifAlerte } from "@/lib/types/po";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

// Plafond de sur-réception (ML-10). Au-delà de 150 % de la quantité
// attendue sur une ligne, on suspecte une erreur de scan (double comptage,
// scan en boucle). On BLOQUE l'incrément tant que le staff n'a pas confirmé
// explicitement (confirm_over: true). Évite de gonfler le stock par erreur.
const OVER_RECEIPT_CAP_RATIO = 1.5;

export async function POST(req: Request) {
  const parsed = await validateBody(req, scanCartonSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const ean = body.ean.trim();

  const sb = supabaseServer();

  // ─── 1. Charge le BDL minimal (pour le contexte fournisseur/numero) ─
  // On embarque la certif halal du fournisseur : à la réception, un
  // certif expiré/manquant doit lever un avertissement BLOQUANT que le
  // comptable valide explicitement (traçabilité du risque — ML-5).
  const { data: bdlData, error: bdlErr } = await sb
    .from("bons_de_livraison")
    .select(
      "id, numero_bdl, depot_destination_id, fournisseur_id, fournisseurs(nom, certif_organisme, certif_numero, certif_expire_le, actif)"
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
    fournisseurs: {
      nom: string;
      certif_organisme: string | null;
      certif_numero: string | null;
      certif_expire_le: string | null;
      actif: boolean | null;
    } | null;
  };

  // ─── 1bis. Statut certif halal du fournisseur du BDL ────────────────
  // "expiree" (date passée) ou "manquante" (aucune date) → bloquant.
  // On l'attache à CHAQUE réponse de scan : tant que le certif n'est pas
  // à jour, l'écran de réception affiche un avertissement persistant que
  // le comptable doit acquitter (la marchandise est physiquement comptée,
  // mais le risque halal est tracé et reconnu).
  const certifAlerteFournisseur = certifAlerte(
    bdl.fournisseurs?.certif_expire_le
  );
  const certifBloquant =
    certifAlerteFournisseur === "expiree" ||
    certifAlerteFournisseur === "manquante";
  const certifWarn = certifBloquant
    ? {
        certif_block: true,
        certif_alerte: certifAlerteFournisseur,
        certif_label:
          certifAlerteFournisseur === "expiree"
            ? `Certificat halal expiré — ${bdl.fournisseurs?.nom ?? "fournisseur"}`
            : `Certificat halal manquant — ${bdl.fournisseurs?.nom ?? "fournisseur"}`,
        certif_sub:
          "Réception à valider explicitement par le comptable (risque halal tracé).",
        certif_expire_le: bdl.fournisseurs?.certif_expire_le ?? null,
        fournisseur_nom: bdl.fournisseurs?.nom ?? null,
      }
    : { certif_block: false as const };

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
      ...certifWarn,
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
      ...certifWarn,
    });
  }

  // ─── 6. Update ligne : +qtyDelta, push event timeline ───────────
  const nouvelleQte = ligne.quantite_recue + qtyDelta;
  const ecartApres = nouvelleQte - ligne.quantite_attendue;
  const recuComplet = nouvelleQte >= ligne.quantite_attendue;
  const surplusLine = ecartApres > 0;

  // ─── 6bis. Plafond 150 % (ML-10) : blocage avant écriture ───────
  // Si ce scan ferait passer la ligne au-delà de 150 % de l'attendu, on
  // suspecte un double comptage / scan en boucle. On NE TOUCHE PAS la base
  // tant que le staff n'a pas confirmé (confirm_over: true). Sinon on
  // gonflerait silencieusement le stock — chiffres faux.
  if (
    ligne.quantite_attendue > 0 &&
    nouvelleQte > ligne.quantite_attendue * OVER_RECEIPT_CAP_RATIO &&
    !body.confirm_over
  ) {
    return NextResponse.json({
      kind: "blocked",
      label: `Sur-comptage ? ${produitNom}`,
      sub: `${nouvelleQte}/${ligne.quantite_attendue} (>150 %). Confirme si c'est exact.`,
      code: ean,
      ligne_id: ligne.id,
      produit_id: produitId,
      produit_nom: produitNom,
      quantite_recue: ligne.quantite_recue,
      quantite_attendue: ligne.quantite_attendue,
      quantite_si_confirme: nouvelleQte,
      ecart_qte: ecartApres,
      is_carton: isCarton,
      qty_delta: qtyDelta,
      requires_confirm: true,
      ...certifWarn,
    });
  }

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
  // ML-10 : on pousse l'alerte dans LES DEUX SENS.
  //  - écart POSITIF (surplus) : sur-livraison à valider.
  //  - écart NÉGATIF (manque) : reçu < attendu = vol/perte/erreur
  //    fournisseur. On ne pousse le manque que lorsque la ligne est
  //    considérée RÉCEPTIONNÉE (recuComplet : on a atteint ou dépassé
  //    l'attendu) — sinon chaque scan d'une ligne en cours (qui démarre
  //    forcément sous l'attendu) spammerait Otmane. Le tag par ligne
  //    coalesce de toute façon les notifications successives.
  //  Note : le manque DÉFINITIF d'une ligne jamais complétée est rattrapé
  //  à la clôture par /api/bdl/finalize (écart total valorisé).
  // Manque "définitif au scan" : la ligne reste sous l'attendu ET un scan
  // de plus du même conditionnement la ferait dépasser le plafond 150 %
  // → il n'y a plus de carton/unité légitime à attendre, donc le déficit
  // observé est réel (carton court, vol, erreur fournisseur). Sans cette
  // borne, on pousserait à chaque scan d'une ligne encore en cours.
  const manqueDefinitif =
    ligne.quantite_attendue > 0 &&
    ecartApres < 0 &&
    qtyDelta > 0 &&
    nouvelleQte + qtyDelta > ligne.quantite_attendue * OVER_RECEIPT_CAP_RATIO;

  let pushSent = false;
  if (ligne.quantite_attendue > 0) {
    const ratio = Math.abs(ecartApres) / ligne.quantite_attendue;
    const alerteEcart =
      ratio > PUSH_THRESHOLD_PCT && (surplusLine || manqueDefinitif);
    if (alerteEcart) {
      const signe = ecartApres >= 0 ? `+${ecartApres}` : `${ecartApres}`;
      const sens = ecartApres > 0 ? "surplus" : "manque";
      try {
        await pushAdminsServer(req, {
          title: `Écart ${sens} ${bdl.fournisseurs?.nom ?? "BDL"}`,
          body: `${produitNom} : ${nouvelleQte}/${ligne.quantite_attendue} (${signe}). Bdl ${bdl.numero_bdl}.`,
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
  // warn dès qu'il y a un écart à signaler (surplus OU manque définitif).
  const kind: "ok" | "warn" = surplusLine || manqueDefinitif ? "warn" : "ok";
  const label = surplusLine
    ? `Surplus : ${produitNom}`
    : manqueDefinitif
      ? `Manque : ${produitNom}`
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
    ...certifWarn,
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
    headers: {
      "content-type": "application/json",
      // HOTFIX vague 7 : /api/push/send exige x-internal-secret.
      "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
    },
    body: JSON.stringify({ ...payload, employe_ids: ids }),
  });
}
