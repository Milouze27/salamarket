import { NextResponse } from "next/server";
import { computeDailyZ, yesterdayIsoParis } from "@/lib/cashbox/daily-z";
import { formatDateFr, formatHeureFr } from "@/lib/cashbox/tva";
import {
  createBrandDoc,
  drawHeader,
  drawFooterAllPages,
  drawSectionTitle,
  setBrandFont,
  setInk,
  hairline,
  formatEurFromUnits,
  formatDateTimeFr,
  PALETTE,
  MARGIN,
  PAGE_W,
} from "@/lib/pdf/brand";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** formatEurFr historique = euros (float). */
const eur = (v: number) => formatEurFromUnits(v);

/**
 * Génère le PDF du Z journalier via jsPDF côté serveur (Node.js runtime).
 * Format A4 brand : header sapin + footer légal partagés, corps en deux
 * colonnes clé/valeur (récap fiscal).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || yesterdayIsoParis();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date invalide" }, { status: 400 });
  }

  try {
    const summary = await computeDailyZ(date);
    const { jsPDF } = await import("jspdf");
    const doc = createBrandDoc(jsPDF);

    const colW = PAGE_W - MARGIN * 2;
    let y = drawHeader(doc, {
      titre: "Récap fiscal journalier — Drive",
      sousTitre: formatDateFr(date),
      meta: `Émis le ${formatDateTimeFr(summary.generated_at)}`,
    });

    if (summary.status === "no_data") {
      setBrandFont(doc, "normal");
      doc.setFontSize(11);
      setInk(doc);
      doc.text("Aucune vente Drive sur cette date.", PAGE_W / 2, y + 6, {
        align: "center",
      });
    } else {
      // Compteurs
      setBrandFont(doc, "normal");
      doc.setFontSize(10);
      kv(doc, "Nombre de commandes", summary.nb_commandes.toString(), MARGIN, y, colW);
      y += 5.5;
      kv(doc, "1ère commande", formatHeureFr(summary.premiere_commande_at ?? ""), MARGIN, y, colW);
      y += 5.5;
      kv(doc, "Dernière commande", formatHeureFr(summary.derniere_commande_at ?? ""), MARGIN, y, colW);
      y += 8;
      hairline(doc, MARGIN, y, PAGE_W - MARGIN);
      y += 6;

      // CA
      y = drawSectionTitle(doc, MARGIN, y, "Chiffre d'affaires");
      y += 4;
      setBrandFont(doc, "bold");
      doc.setFontSize(10);
      kv(doc, "CA TTC", eur(summary.ca_ttc), MARGIN, y, colW);
      y += 5.5;
      setBrandFont(doc, "normal");
      kv(doc, "CA HT", eur(summary.ca_ht), MARGIN, y, colW);
      y += 8;
      hairline(doc, MARGIN, y, PAGE_W - MARGIN);
      y += 6;

      // TVA
      y = drawSectionTitle(doc, MARGIN, y, "TVA collectée");
      y += 4;
      setBrandFont(doc, "normal");
      doc.setFontSize(10);
      for (const [rate, v] of Object.entries(summary.tva_par_taux).sort(
        (a, b) => parseFloat(a[0]) - parseFloat(b[0])
      )) {
        doc.text(`TVA ${rate}%`, MARGIN, y);
        doc.text(eur(v.tva), PAGE_W - MARGIN, y, { align: "right" });
        doc.setFontSize(8);
        setInk(doc, PALETTE.muted.rgb);
        doc.text(`(base ${eur(v.base_ht)})`, PAGE_W - MARGIN - 35, y, { align: "right" });
        setInk(doc);
        doc.setFontSize(10);
        y += 5.5;
      }
      setBrandFont(doc, "bold");
      kv(doc, "Total TVA", eur(summary.tva_totale), MARGIN, y, colW);
      y += 8;
      setBrandFont(doc, "normal");
      hairline(doc, MARGIN, y, PAGE_W - MARGIN);
      y += 6;

      // Paiement
      y = drawSectionTitle(doc, MARGIN, y, "Mode de paiement");
      y += 4;
      setBrandFont(doc, "normal");
      doc.setFontSize(10);
      for (const [mode, ttc] of Object.entries(summary.modes_paiement)) {
        kv(doc, mode === "stripe" ? "Stripe (CB online)" : mode, eur(ttc), MARGIN, y, colW);
        y += 5.5;
      }
      y += 3;
      hairline(doc, MARGIN, y, PAGE_W - MARGIN);
      y += 6;

      // Net
      kv(doc, "Frais Stripe", `− ${eur(summary.frais_stripe)}`, MARGIN, y, colW);
      y += 6;
      // Bandeau NET sapin
      setBrandFont(doc, "bold");
      doc.setFontSize(10);
      doc.setFillColor(...PALETTE.sapin.rgb);
      doc.roundedRect(MARGIN - 2, y - 4.5, colW + 4, 8, 1.5, 1.5, "F");
      setInk(doc, PALETTE.white.rgb);
      doc.text("NET ENCAISSÉ", MARGIN + 1, y);
      doc.text(eur(summary.net_encaisse), PAGE_W - MARGIN - 1, y, { align: "right" });
      setInk(doc);
      setBrandFont(doc, "normal");
      y += 8;
      kv(doc, "Panier moyen", eur(summary.panier_moyen), MARGIN, y, colW);
    }

    drawFooterAllPages(doc, {
      mentionFiscale:
        "Document non fiscal au sens NF525. À conserver pour la comptabilité.",
    });

    const buf = Buffer.from(doc.output("arraybuffer"));
    return new NextResponse(buf, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="salam-drive-Z-${date}.pdf"`,
        "cache-control": "private, max-age=60",
      },
    });
  } catch (err) {
    console.error("[daily-z-pdf] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur" },
      { status: 500 }
    );
  }
}

function kv(doc: any, k: string, v: string, x: number, y: number, w: number) {
  doc.text(k, x, y);
  doc.text(v, x + w, y, { align: "right" });
}
