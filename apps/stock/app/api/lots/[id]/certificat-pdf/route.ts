/**
 * GET /api/lots/[id]/certificat-pdf
 *
 * PDF-02 (Wave 5, le MOAT) — Certificat de traçabilité Halal A4 premium,
 * imprimable / encadrable. Le document que K & A FOOD peut afficher au
 * comptoir : aucune épicerie concurrente ne sait le produire.
 *
 * La route est mince : elle lit le lot (clé anon), encode le QR
 * (bwip-js/node), puis délègue tout le dessin au builder PUR
 * `lib/pdf/certificat-halal` (branché sur le module brand unifié
 * `lib/pdf/brand`). Le builder est testable hors Next.
 *
 * ⚠️ MODÈLE D'ACCÈS — endpoint PUBLIC par design (le QR imprimé pointe
 * vers /lot/:id, page publique). On utilise donc la clé ANON, pas le
 * service-role : on n'expose QUE le périmètre déjà public de la
 * traçabilité (produit, certificateur halal, abattoir, DLC, lot). On NE
 * requête PAS la table `fournisseurs` (raison sociale / SIRET) : elle est
 * verrouillée staff-only par RLS (`revoke select from anon` dans la
 * migration de lockdown), donc un embed anon planterait en
 * « permission denied », ET le SIRET fournisseur ne doit pas fuiter sur
 * un endpoint public à IDs énumérables ("L2026-05-A23"). Pour afficher le
 * fournisseur sur le certificat, il faudra passer la route en staff-only
 * (server action + x-internal-secret) + service-role.
 *
 * Runtime Node (jspdf + bwip-js/node tournent en Node).
 */

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generateLotQrUrl } from "@/lib/qr-lot";
import {
  buildCertificatHalalPdf,
  type CertificatLot,
} from "@/lib/pdf/certificat-halal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** PNG data URL d'un QR via bwip-js/node. null si échec (PDF non cassé). */
async function qrPngDataUrl(text: string): Promise<string | null> {
  try {
    const bwipjs = (await import("bwip-js/node")).default;
    const png = await bwipjs.toBuffer({
      bcid: "qrcode",
      text,
      scale: 5,
      eclevel: "Q", // tolérance plus haute → reste scannable même si imprimé moyen
      includetext: false,
      backgroundcolor: "FFFFFF",
      paddingwidth: 2,
      paddingheight: 2,
    } as Parameters<typeof bwipjs.toBuffer>[0]);
    return `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
  } catch (e) {
    console.warn("[certificat-pdf] QR encode fail:", e);
    return null;
  }
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> } | { params: { id: string } },
) {
  // Next 14 : params peut être sync ou Promise selon la version — on gère les 2.
  const rawParams = (ctx as { params: unknown }).params;
  const params =
    rawParams instanceof Promise
      ? await rawParams
      : (rawParams as { id: string });
  const lotId = decodeURIComponent(params?.id ?? "");

  if (!lotId) {
    return NextResponse.json({ error: "lot_id requis" }, { status: 400 });
  }

  const sb = supabase();
  if (!sb) {
    return NextResponse.json(
      { error: "supabase_unavailable" },
      { status: 503 },
    );
  }

  const { data, error } = await sb
    .from("produits_lots")
    .select(
      // PAS de jointure fournisseurs : RLS staff-only (cf. en-tête de fichier).
      `id, produit_id, supplier_lot,
       certifier_id, certifier_name, certifier_valid_until,
       abattoir_nom, abattoir_pays, date_abattage,
       date_reception, dlc, ddm, quantite_recue, unite, notes,
       produits ( nom, marque, categorie )`,
    )
    .eq("id", lotId)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "db_error", detail: error.message },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "lot_introuvable", lot_id: lotId },
      { status: 404 },
    );
  }

  const lot = data as unknown as CertificatLot;
  const publicUrl = generateLotQrUrl(lotId);
  const qrDataUrl = await qrPngDataUrl(publicUrl);

  try {
    const pdfBytes = await buildCertificatHalalPdf({
      lotId,
      lot,
      publicUrl,
      qrDataUrl,
    });
    const safeName = lotId.replace(/[^A-Za-z0-9_-]/g, "_");
    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="certificat-halal-${safeName}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    console.error("[certificat-pdf] error", e);
    return NextResponse.json(
      {
        error: "pdf_failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}
