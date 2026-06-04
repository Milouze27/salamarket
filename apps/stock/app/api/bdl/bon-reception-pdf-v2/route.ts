/**
 * GET /api/bdl/bon-reception-pdf-v2?bdl_id=<uuid>
 *
 * Version scanner-first du Bon de Réception. Extension de la v1
 * (`/api/cashbox/bon-reception-pdf`) avec :
 *   - Section "ÉCART VALORISÉ" en tête (montant € + ratio, encadré
 *     ambre si > 2 %) — la première chose que voit le comptable
 *   - Colonne "Cartons" dans le tableau (nb_cartons_scannes)
 *   - Colonne "Écart €" calculée à partir de prix_achat_ht
 *   - QR code lot par ligne (URL publique Drive `/lot/:id`) quand
 *     `lot_id` est renseigné, pour traçabilité halal scannable
 *     directement depuis le PDF
 *   - Bloc "TEMPÉRATURE PALETTE" avec seuil + valeur relevée
 *   - Signature comptable (si `valide_par_comptable` set, sinon
 *     case à cocher "Vu compta" laissée vide)
 *
 * Pas de regression sur la v1 : ce route NE remplace pas l'autre, il
 * coexiste. La page scan-first pointe ici, le legacy continue d'utiliser
 * `/api/cashbox/bon-reception-pdf`.
 */

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { generateLotQrUrl } from "@/lib/qr-lot";
import {
  createBrandDoc,
  drawHeader,
  drawFooterAllPages,
  setBrandFont,
  setInk,
  hairline,
  formatDateLongFr,
  formatDateTimeFr,
  PALETTE,
  MARGIN,
  PAGE_W,
} from "@/lib/pdf/brand";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface BdlLigne {
  id: string;
  produit_id: string | null;
  code_barre_attendu: string | null;
  quantite_attendue: number;
  quantite_recue: number;
  nb_cartons_scannes: number;
  prix_achat_ht: number | null;
  ecart_qte: number | null;
  lot_id: string | null;
  statut: string;
  produits: { nom: string; ean: string | null } | null;
}

interface BdlFull {
  id: string;
  numero_bdl: string;
  numero_bdl_fournisseur: string | null;
  date_livraison_prevue: string;
  statut: string;
  photo_palette_url_1: string | null;
  photo_palette_url_2: string | null;
  photo_bdl_url: string | null;
  notes: string | null;
  receptionne_le: string | null;
  scan_started_at: string | null;
  scan_completed_at: string | null;
  temperature_reception_c: number | null;
  temperature_seuil_max_c: number | null;
  ecart_valeur_eur: number | null;
  valide_par_comptable: string | null;
  valide_par_comptable_le: string | null;
  fournisseurs: { nom: string; adresse: string | null; siret: string | null } | null;
  depots: { nom: string; adresse: string | null } | null;
  employes_reception: { prenom: string | null; nom: string } | null;
  bons_de_livraison_lignes: BdlLigne[];
}

// Dates : helpers brand pour cohérence cross-docs.
const fmtDateFr = (iso: string | null) => formatDateLongFr(iso);
const fmtDateTimeFr = (iso: string | null) => formatDateTimeFr(iso);

function line(doc: any, x1: number, y: number, x2: number) {
  hairline(doc, x1, y, x2);
}

/**
 * Génère un PNG data URL pour un QR via bwip-js (déjà en deps).
 * Retourne null si bwip-js échoue — la cellule reste vide, on ne
 * casse pas le PDF.
 */
async function qrPngDataUrl(text: string, sizePx: number): Promise<string | null> {
  try {
    const bwipjs = (await import("bwip-js/node")).default;
    // Types officiels bwip-js incomplets : eclevel/includetext/backgroundcolor sont
     // des options bwipp valides, on cast pour passer la vérif TS.
     const canvas = await bwipjs.toBuffer({
      bcid: "qrcode",
      text,
      scale: 3,
      eclevel: "M",
      includetext: false,
      backgroundcolor: "FFFFFF",
    } as Parameters<typeof bwipjs.toBuffer>[0]);
    // toBuffer renvoie un Buffer PNG en Node
    const base64 = Buffer.from(canvas).toString("base64");
    // sizePx n'est pas utilisé par jsPDF.addImage (qui prend mm), on garde
    // la signature pour évolution future.
    void sizePx;
    return `data:image/png;base64,${base64}`;
  } catch (e) {
    console.warn("[bdl-pdf-v2] QR encode fail:", e);
    return null;
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const bdlId = url.searchParams.get("bdl_id");
  if (!bdlId) {
    return NextResponse.json({ error: "bdl_id requis" }, { status: 400 });
  }

  const sb = supabase();
  if (!sb) {
    return NextResponse.json({ error: "supabase_unavailable" }, { status: 503 });
  }

  const { data, error } = await sb
    .from("bons_de_livraison")
    .select(
      `id, numero_bdl, numero_bdl_fournisseur, date_livraison_prevue, statut,
       photo_palette_url_1, photo_palette_url_2, photo_bdl_url, notes,
       receptionne_le, scan_started_at, scan_completed_at,
       temperature_reception_c, temperature_seuil_max_c,
       ecart_valeur_eur, valide_par_comptable, valide_par_comptable_le,
       fournisseurs (nom, adresse, siret),
       depots (nom, adresse),
       employes_reception:employes!receptionne_par (prenom, nom),
       bons_de_livraison_lignes (
         id, produit_id, code_barre_attendu, quantite_attendue, quantite_recue,
         nb_cartons_scannes, prix_achat_ht, ecart_qte, lot_id, statut,
         produits (nom, ean)
       )`
    )
    .eq("id", bdlId)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "bdl_introuvable", detail: error?.message },
      { status: 404 }
    );
  }
  const bdl = data as unknown as BdlFull;

  try {
    const { jsPDF } = await import("jspdf");
    const doc = createBrandDoc(jsPDF);
    const pageW = PAGE_W;
    const margin = MARGIN;
    const colW = pageW - margin * 2;

    // ─── HEADER BRAND ────────────────────────────────────────
    let y = drawHeader(doc, {
      titre: "Bon de réception · Scan",
      sousTitre: bdl.fournisseurs?.nom ?? undefined,
      reference: `N° ${bdl.numero_bdl}`,
      meta: `Émis le ${fmtDateTimeFr(bdl.receptionne_le ?? new Date().toISOString())}`,
    });

    // ─── BANDEAU ÉCART (PREMIER CHOC VISUEL POUR LE COMPTABLE) ─
    const ecartEur = Number(bdl.ecart_valeur_eur ?? 0);
    const valeurAttendue = bdl.bons_de_livraison_lignes.reduce(
      (s, l) => s + l.quantite_attendue * (l.prix_achat_ht ?? 0),
      0
    );
    const ratio = valeurAttendue > 0 ? Math.abs(ecartEur) / valeurAttendue : 0;
    const ecartCritique = ratio > 0.02 && valeurAttendue > 0;

    // Fond ambre si dépasse seuil, vert sinon
    if (ecartCritique) {
      doc.setFillColor(...PALETTE.warningSoft.rgb);
      doc.setDrawColor(...PALETTE.warning.rgb);
    } else if (Math.abs(ecartEur) < 0.01) {
      doc.setFillColor(...PALETTE.successSoft.rgb);
      doc.setDrawColor(...PALETTE.success.rgb);
    } else {
      doc.setFillColor(...PALETTE.creamSoft.rgb);
      doc.setDrawColor(...PALETTE.hairline.rgb);
    }
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, colW, 18, 2, 2, "FD");

    setBrandFont(doc, "bold");
    doc.setFontSize(9);
    setInk(doc, PALETTE.muted.rgb);
    doc.text("ÉCART VALORISÉ", margin + 4, y + 6);

    doc.setFontSize(18);
    if (ecartCritique) setInk(doc, PALETTE.warning.rgb);
    else if (Math.abs(ecartEur) < 0.01) setInk(doc, PALETTE.success.rgb);
    else setInk(doc, PALETTE.ink.rgb);
    const ecartTxt = `${ecartEur > 0 ? "+" : ""}${ecartEur.toFixed(2)} €`;
    doc.text(ecartTxt, margin + 4, y + 14);

    doc.setFontSize(9);
    setBrandFont(doc, "normal");
    setInk(doc, PALETTE.muted.rgb);
    doc.text(
      `${(ratio * 100).toFixed(2)} % du BDL attendu (${valeurAttendue.toFixed(2)} €)`,
      pageW - margin - 4,
      y + 8,
      { align: "right" }
    );
    if (ecartCritique) {
      setBrandFont(doc, "bold");
      setInk(doc, PALETTE.warning.rgb);
      doc.text(
        "Dépasse seuil 2 % — validation comptable requise",
        pageW - margin - 4,
        y + 14,
        { align: "right" }
      );
    }
    setInk(doc);
    setBrandFont(doc, "normal");
    y += 22;

    // ─── BLOC FOURNISSEUR + LIVRAISON + TEMPÉRATURE ──────────
    const colLeftX = margin;
    const colRightX = pageW / 2 + 5;
    const colHalfW = colW / 2 - 4;
    let yLeft = y;
    let yRight = y;

    doc.setFontSize(9);
    setBrandFont(doc, "bold");
    doc.text("FOURNISSEUR", colLeftX, yLeft);
    doc.text("LIVRAISON & CHAÎNE DU FROID", colRightX, yRight);
    yLeft += 5;
    yRight += 5;

    setBrandFont(doc, "normal");
    doc.text(bdl.fournisseurs?.nom ?? "—", colLeftX, yLeft);
    yLeft += 4;
    if (bdl.fournisseurs?.adresse) {
      const lines = doc.splitTextToSize(bdl.fournisseurs.adresse, colHalfW);
      doc.text(lines, colLeftX, yLeft);
      yLeft += lines.length * 4;
    }
    if (bdl.fournisseurs?.siret) {
      setInk(doc, PALETTE.muted.rgb);
      doc.text(`SIRET ${bdl.fournisseurs.siret}`, colLeftX, yLeft);
      setInk(doc);
      yLeft += 4;
    }
    if (bdl.numero_bdl_fournisseur) {
      setBrandFont(doc, "bold");
      doc.text(`N° BDL fourn. : ${bdl.numero_bdl_fournisseur}`, colLeftX, yLeft);
      setBrandFont(doc, "normal");
      yLeft += 4;
    }

    doc.text(`Dépôt : ${bdl.depots?.nom ?? "—"}`, colRightX, yRight);
    yRight += 4;
    doc.text(`Date prévue : ${fmtDateFr(bdl.date_livraison_prevue)}`, colRightX, yRight);
    yRight += 4;

    // TEMPÉRATURE (signature scanner-first)
    const tempC = bdl.temperature_reception_c;
    const seuil = bdl.temperature_seuil_max_c ?? 4;
    if (tempC !== null && tempC !== undefined) {
      const tempOk = tempC <= seuil;
      if (tempOk) setInk(doc, PALETTE.success.rgb);
      else setInk(doc, PALETTE.danger.rgb);
      setBrandFont(doc, "bold");
      doc.text(
        `Temp. palette : ${tempC.toFixed(1)} °C (seuil ${seuil} °C) ${tempOk ? "OK" : "DÉPASSÉ"}`,
        colRightX,
        yRight
      );
      setBrandFont(doc, "normal");
      setInk(doc);
      yRight += 4;
    } else {
      setInk(doc, PALETTE.danger.rgb);
      doc.text(`Temp. palette : NON RELEVÉE (seuil ${seuil} °C)`, colRightX, yRight);
      setInk(doc);
      yRight += 4;
    }

    if (bdl.scan_started_at && bdl.scan_completed_at) {
      const dur =
        (new Date(bdl.scan_completed_at).getTime() -
          new Date(bdl.scan_started_at).getTime()) /
        60000;
      setInk(doc, PALETTE.muted.rgb);
      doc.text(`Durée scan : ${dur.toFixed(1)} min`, colRightX, yRight);
      setInk(doc);
      yRight += 4;
    }

    y = Math.max(yLeft, yRight) + 4;
    line(doc, margin, y, pageW - margin);
    y += 6;

    // ─── TABLEAU LIGNES (avec colonne Cartons + Écart €) ─────
    const xRight = pageW - margin;
    const COL_ECART_EUR = xRight;
    const COL_ECART = xRight - 22;
    const COL_RECU = xRight - 38;
    const COL_CART = xRight - 50;
    const COL_ATT = xRight - 64;
    const COL_EAN = margin + 82;
    const COL_NOM_X = margin + 1;
    const COL_NOM_W = COL_EAN - COL_NOM_X - 2;

    doc.setFontSize(10);
    setBrandFont(doc, "bold");
    doc.text("LIGNES SCANNÉES", margin, y);
    y += 5;

    doc.setFontSize(8);
    doc.setFillColor(...PALETTE.cream.rgb);
    doc.rect(margin, y - 3, colW, 6, "F");
    doc.text("PRODUIT", COL_NOM_X, y + 1);
    doc.text("EAN", COL_EAN, y + 1);
    doc.text("Att.", COL_ATT, y + 1, { align: "right" });
    doc.text("Cart.", COL_CART, y + 1, { align: "right" });
    doc.text("Reçu", COL_RECU, y + 1, { align: "right" });
    doc.text("Écart", COL_ECART, y + 1, { align: "right" });
    doc.text("Écart €", COL_ECART_EUR, y + 1, { align: "right" });
    y += 6;

    setBrandFont(doc, "normal");
    let totalAttendu = 0;
    let totalRecu = 0;
    let totalEcart = 0;
    let totalEcartEur = 0;
    let totalCartons = 0;

    // QR codes lots : on les batche après le tableau pour éviter de
    // ralentir le rendu ligne par ligne. On garde la liste des lots
    // référencés et on imprime une section dédiée en bas.
    const lotsToRender: Array<{ ligneNom: string; lotId: string }> = [];

    for (const l of bdl.bons_de_livraison_lignes) {
      const ecart = (l.ecart_qte ?? l.quantite_recue - l.quantite_attendue) | 0;
      const ecartLineEur = ecart * (l.prix_achat_ht ?? 0);
      totalAttendu += l.quantite_attendue;
      totalRecu += l.quantite_recue;
      totalEcart += ecart;
      totalEcartEur += ecartLineEur;
      totalCartons += l.nb_cartons_scannes;

      if (y > 265) {
        doc.addPage();
        y = margin;
      }

      const fullNom = l.produits?.nom ?? "Produit";
      const nomLines = doc.splitTextToSize(fullNom, COL_NOM_W);
      const nomDisplay = nomLines[0] + (nomLines.length > 1 ? "…" : "");
      doc.text(nomDisplay, COL_NOM_X, y);

      const eanDisplay = l.produits?.ean ?? l.code_barre_attendu ?? "—";
      doc.text(String(eanDisplay).slice(0, 13), COL_EAN, y);
      doc.text(String(l.quantite_attendue), COL_ATT, y, { align: "right" });
      doc.text(String(l.nb_cartons_scannes), COL_CART, y, { align: "right" });
      doc.text(String(l.quantite_recue), COL_RECU, y, { align: "right" });

      if (ecart < 0) setInk(doc, PALETTE.danger.rgb);
      else if (ecart > 0) setInk(doc, PALETTE.warning.rgb);
      else setInk(doc, PALETTE.muted.rgb);
      doc.text(`${ecart > 0 ? "+" : ""}${ecart}`, COL_ECART, y, { align: "right" });
      doc.text(
        `${ecartLineEur > 0 ? "+" : ""}${ecartLineEur.toFixed(2)}`,
        COL_ECART_EUR,
        y,
        { align: "right" }
      );
      setInk(doc);
      y += 4.5;

      // Note "lot scanné" sous la ligne si lot_id renseigné
      if (l.lot_id) {
        setInk(doc, PALETTE.muted.rgb);
        doc.setFontSize(7);
        doc.text(`↳ Lot ${l.lot_id} (QR en annexe)`, COL_NOM_X + 3, y);
        doc.setFontSize(8);
        setInk(doc);
        y += 3.5;
        lotsToRender.push({ ligneNom: fullNom, lotId: l.lot_id });
      }
    }

    y += 2;
    line(doc, margin, y, pageW - margin);
    y += 5;

    setBrandFont(doc, "bold");
    doc.text("TOTAUX", COL_NOM_X, y);
    doc.text(String(totalAttendu), COL_ATT, y, { align: "right" });
    doc.text(String(totalCartons), COL_CART, y, { align: "right" });
    doc.text(String(totalRecu), COL_RECU, y, { align: "right" });
    if (totalEcart < 0) setInk(doc, PALETTE.danger.rgb);
    else if (totalEcart > 0) setInk(doc, PALETTE.warning.rgb);
    doc.text(`${totalEcart > 0 ? "+" : ""}${totalEcart}`, COL_ECART, y, {
      align: "right",
    });
    doc.text(
      `${totalEcartEur > 0 ? "+" : ""}${totalEcartEur.toFixed(2)}`,
      COL_ECART_EUR,
      y,
      { align: "right" }
    );
    setInk(doc);
    y += 8;

    // ─── ANNEXE : QR LOTS (traçabilité halal scannable) ──────
    if (lotsToRender.length > 0) {
      if (y > 240) {
        doc.addPage();
        y = margin;
      }
      setBrandFont(doc, "bold");
      doc.setFontSize(10);
      doc.text("TRAÇABILITÉ HALAL — QR LOTS", margin, y);
      y += 5;
      setBrandFont(doc, "normal");
      doc.setFontSize(8);
      setInk(doc, PALETTE.muted.rgb);
      doc.text(
        "Scanne un QR avec ton téléphone pour ouvrir la fiche publique du lot (certificateur, abattoir, DLC).",
        margin,
        y
      );
      setInk(doc);
      y += 5;

      const qrSize = 26; // mm
      const qrGap = 6;
      const qrPerRow = Math.floor((colW + qrGap) / (qrSize + qrGap));
      let col = 0;
      let rowYStart = y;

      for (const lot of lotsToRender) {
        if (col === 0 && y + qrSize + 10 > 285) {
          doc.addPage();
          y = margin;
          rowYStart = y;
        }
        const x = margin + col * (qrSize + qrGap);
        const qrUrl = generateLotQrUrl(lot.lotId);
        const dataUrl = await qrPngDataUrl(qrUrl, qrSize);
        if (dataUrl) {
          try {
            doc.addImage(dataUrl, "PNG", x, y, qrSize, qrSize);
          } catch (e) {
            console.warn("[bdl-pdf-v2] addImage QR fail:", e);
          }
        } else {
          // Fallback : encadré gris avec le texte du lot
          doc.setDrawColor(...PALETTE.hairline.rgb);
          doc.rect(x, y, qrSize, qrSize);
        }
        doc.setFontSize(7);
        const labelLines = doc.splitTextToSize(lot.ligneNom, qrSize);
        doc.text(labelLines[0], x + qrSize / 2, y + qrSize + 3, {
          align: "center",
        });
        setInk(doc, PALETTE.muted.rgb);
        doc.text(lot.lotId, x + qrSize / 2, y + qrSize + 6.5, { align: "center" });
        setInk(doc);

        col++;
        if (col >= qrPerRow) {
          col = 0;
          y += qrSize + 12;
          rowYStart = y;
        }
      }
      if (col !== 0) y += qrSize + 12;
      doc.setFontSize(8);
      void rowYStart;
    }

    // ─── PHOTOS PALETTE ──────────────────────────────────────
    const photos = [
      { label: "Palette côté 1", url: bdl.photo_palette_url_1 },
      { label: "Palette côté 2", url: bdl.photo_palette_url_2 },
      { label: "BDL papier fournisseur", url: bdl.photo_bdl_url },
    ].filter((p) => p.url);

    if (photos.length > 0) {
      if (y > 230) {
        doc.addPage();
        y = margin;
      }
      setBrandFont(doc, "bold");
      doc.setFontSize(10);
      doc.text("PIÈCES JOINTES", margin, y);
      y += 6;
      setBrandFont(doc, "normal");
      doc.setFontSize(8);

      const gap = 4;
      const photoW = (colW - gap * (photos.length - 1)) / photos.length;
      let x = margin;
      const photoY = y;
      const photoH = 45;
      for (const ph of photos) {
        try {
          if (ph.url && ph.url.startsWith("data:image")) {
            const m = ph.url.match(/^data:image\/([a-z]+);/i);
            const fmt = (m?.[1] ?? "jpeg").toUpperCase();
            const supported =
              fmt === "JPEG" || fmt === "JPG" || fmt === "PNG" || fmt === "WEBP"
                ? fmt === "JPG"
                  ? "JPEG"
                  : fmt
                : "JPEG";
            doc.addImage(ph.url, supported as any, x, photoY, photoW, photoH);
          } else {
            doc.setFillColor(...PALETTE.cream.rgb);
            doc.rect(x, photoY, photoW, photoH, "F");
            doc.text("(photo distante)", x + photoW / 2, photoY + photoH / 2, {
              align: "center",
            });
          }
          const labelLines = doc.splitTextToSize(ph.label, photoW - 2);
          doc.text(labelLines[0], x + photoW / 2, photoY + photoH + 4, {
            align: "center",
          });
        } catch {
          /* ignore une image corrompue */
        }
        x += photoW + gap;
      }
      y = photoY + photoH + 10;
    }

    if (bdl.notes) {
      if (y > 250) {
        doc.addPage();
        y = margin;
      }
      setBrandFont(doc, "bold");
      doc.setFontSize(9);
      doc.text("NOTES", margin, y);
      y += 4;
      setBrandFont(doc, "normal");
      doc.setFontSize(8);
      const noteLines = doc.splitTextToSize(bdl.notes, colW);
      doc.text(noteLines, margin, y);
      y += noteLines.length * 4 + 4;
    }

    // ─── SIGNATURES (réceptionneur + comptable) ──────────────
    if (y > 240) {
      doc.addPage();
      y = margin;
    }
    line(doc, margin, y, pageW - margin);
    y += 6;
    setBrandFont(doc, "bold");
    doc.setFontSize(10);
    doc.text("VALIDATION", margin, y);
    y += 5;
    setBrandFont(doc, "normal");
    doc.setFontSize(9);

    const employeNom =
      bdl.employes_reception
        ? `${bdl.employes_reception.prenom ?? ""} ${bdl.employes_reception.nom}`.trim()
        : "—";
    doc.text(`Réceptionné par : ${employeNom}`, margin, y);
    y += 4.5;
    doc.text(`Le ${fmtDateTimeFr(bdl.receptionne_le)}`, margin, y);
    y += 6;

    // Bloc compta : signé si valide_par_comptable, sinon cases à cocher
    setBrandFont(doc, "bold");
    doc.text("Validation comptable :", margin, y);
    setBrandFont(doc, "normal");
    if (bdl.valide_par_comptable_le) {
      setInk(doc, PALETTE.success.rgb);
      doc.text(
        `  Validé le ${fmtDateTimeFr(bdl.valide_par_comptable_le)}`,
        margin + 60,
        y
      );
      setInk(doc);
    } else {
      // Case à cocher manuelle si la validation n'est pas encore faite
      doc.rect(margin + 60, y - 3.5, 4, 4);
      doc.text("Vu compta", margin + 66, y);
      doc.text("Signature : ____________________", margin + 100, y);
    }
    y += 6;

    // Footer légal brand sur toutes les pages
    drawFooterAllPages(doc, {
      mentionFiscale:
        "Document généré numériquement par Salamarket (scanner-first). À archiver avec la facture fournisseur.",
    });

    const pdfBytes = doc.output("arraybuffer");
    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="br-scan-${bdl.numero_bdl}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    console.error("[br-pdf-v2] error", e);
    return NextResponse.json(
      {
        error: "pdf_failed",
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
