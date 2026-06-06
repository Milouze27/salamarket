import { NextResponse } from "next/server";
import {
  computeMonthlyReport,
  currentMonthYYYYMM,
} from "@/lib/cashbox/monthly-report";
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

/**
 * AUTH (HOTFIX vague 7) : refuse les appels anonymes — la route expose
 * un PDF P&L complet (CA, TVA, top produits). Accepte :
 *   - header `x-internal-secret` = INTERNAL_API_SECRET (server actions)
 *   - header `authorization: Bearer <CRON_SECRET>` (cron Vercel)
 *   - header `x-vercel-cron: 1` (cron Vercel runtime)
 */
function checkAuth(req: Request): {
  ok: boolean;
  error?: string;
  status?: number;
} {
  const internalSecret = process.env.INTERNAL_API_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  if (!internalSecret && !cronSecret) {
    return {
      ok: false,
      status: 503,
      error:
        "monthly-report-pdf misconfigured (INTERNAL_API_SECRET or CRON_SECRET required)",
    };
  }
  const provided = req.headers.get("x-internal-secret");
  if (internalSecret && provided === internalSecret) return { ok: true };
  const auth = req.headers.get("authorization");
  if (cronSecret && auth === `Bearer ${cronSecret}`) return { ok: true };
  const vercelCron = req.headers.get("x-vercel-cron");
  if (cronSecret && vercelCron === "1") return { ok: true };
  return { ok: false, status: 401, error: "unauthorized" };
}

/** formatEurFr historique = euros (float). On passe par le helper brand. */
const eur = (v: number) => formatEurFromUnits(v);

export async function GET(req: Request) {
  const auth = checkAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const url = new URL(req.url);
  const mois = url.searchParams.get("mois") || currentMonthYYYYMM();
  if (!/^\d{4}-\d{2}$/.test(mois)) {
    return NextResponse.json({ error: "mois invalide" }, { status: 400 });
  }
  try {
    const report = await computeMonthlyReport(mois);
    const { jsPDF } = await import("jspdf");
    const doc = createBrandDoc(jsPDF);

    const monthLabel = new Date(
      parseInt(mois.slice(0, 4)),
      parseInt(mois.slice(5)) - 1,
      1,
    ).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    const monthLabelCap =
      monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

    let y = drawHeader(doc, {
      titre: "Rapport mensuel",
      sousTitre: monthLabelCap,
      meta: `Émis le ${formatDateTimeFr(report.generated_at)}`,
    });

    // KPI total
    setBrandFont(doc, "bold");
    doc.setFontSize(11);
    setInk(doc, PALETTE.muted.rgb);
    doc.text("CA TOTAL CONSOLIDÉ", MARGIN, y);
    y += 8;
    doc.setFontSize(24);
    setInk(doc, PALETTE.sapin.rgb);
    doc.text(eur(report.consolidation.ca_ttc_total), MARGIN, y);
    setInk(doc);
    y += 9;
    doc.setFontSize(9);
    setBrandFont(doc, "normal");
    doc.text(
      `Magasin : ${eur(report.magasin.ca_ttc)} (${report.consolidation.repartition.magasin_pct.toFixed(1)}%)   Drive : ${eur(report.drive.ca_ttc)} (${report.consolidation.repartition.drive_pct.toFixed(1)}%)`,
      MARGIN,
      y,
    );
    y += 10;
    hairline(doc, MARGIN, y, PAGE_W - MARGIN);
    y += 6;

    // TVA
    y = drawSectionTitle(doc, MARGIN, y, "TVA collectée");
    y += 5;
    setBrandFont(doc, "normal");
    doc.setFontSize(10);
    for (const [rate, v] of Object.entries(
      report.consolidation.tva_par_taux,
    ).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))) {
      doc.text(`TVA ${rate}%`, MARGIN, y);
      doc.text(`Base : ${eur(v.base_ht)}`, MARGIN + 30, y);
      doc.text(`TVA : ${eur(v.tva)}`, MARGIN + 80, y);
      doc.text(`TTC : ${eur(v.ttc)}`, MARGIN + 130, y);
      y += 6;
    }
    y += 4;
    hairline(doc, MARGIN, y, PAGE_W - MARGIN);
    y += 6;

    // Magasin
    y = drawSectionTitle(doc, MARGIN, y, "Ventes magasin (Cashmag)");
    y += 5;
    doc.setFontSize(9);
    setBrandFont(doc, "normal");
    doc.text(`CA TTC : ${eur(report.magasin.ca_ttc)}`, MARGIN, y);
    doc.text(`Tickets : ${report.magasin.nb_tickets}`, MARGIN + 70, y);
    doc.text(`Panier : ${eur(report.magasin.panier_moyen)}`, MARGIN + 130, y);
    y += 6;
    if (report.magasin.partial) {
      setInk(doc, PALETTE.warning.rgb);
      doc.text(
        "Données partielles : penser à importer le CSV Cashmag.",
        MARGIN,
        y,
      );
      setInk(doc);
      y += 6;
    }
    y += 2;
    y = topList(
      doc,
      MARGIN,
      y,
      "Top 5 magasin",
      report.magasin.top_produits.slice(0, 5),
    );
    hairline(doc, MARGIN, y, PAGE_W - MARGIN);
    y += 6;

    // Drive
    y = drawSectionTitle(doc, MARGIN, y, "Ventes Drive");
    y += 5;
    setBrandFont(doc, "normal");
    doc.setFontSize(9);
    doc.text(`CA TTC : ${eur(report.drive.ca_ttc)}`, MARGIN, y);
    doc.text(`Commandes : ${report.drive.nb_tickets}`, MARGIN + 70, y);
    doc.text(`Panier : ${eur(report.drive.panier_moyen)}`, MARGIN + 130, y);
    y += 6;
    doc.text(`Frais Stripe : ${eur(report.drive.frais_stripe)}`, MARGIN, y);
    doc.text(`Net : ${eur(report.drive.net)}`, MARGIN + 70, y);
    y += 8;
    topList(
      doc,
      MARGIN,
      y,
      "Top 5 Drive",
      report.drive.top_produits.slice(0, 5),
    );

    drawFooterAllPages(doc, {
      mentionFiscale:
        "Document non fiscal au sens NF525. À transmettre à l'expert-comptable.",
    });

    const buf = Buffer.from(doc.output("arraybuffer"));
    return new NextResponse(buf, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="salam-rapport-mensuel-${mois}.pdf"`,
      },
    });
  } catch (err) {
    console.error("[monthly-report-pdf]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur" },
      { status: 500 },
    );
  }
}

function topList(
  doc: any,
  x: number,
  y: number,
  title: string,
  rows: Array<{ designation: string; quantite: number; ca: number }>,
): number {
  setBrandFont(doc, "bold");
  doc.setFontSize(9);
  setInk(doc, PALETTE.ink.rgb);
  doc.text(title, x, y);
  setBrandFont(doc, "normal");
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const nom =
      r.designation.length > 45
        ? r.designation.slice(0, 44) + "…"
        : r.designation;
    doc.text(`${i + 1}. ${nom}`, x, y + 5 + i * 5);
    doc.text(`×${r.quantite}`, x + 100, y + 5 + i * 5);
    doc.text(eur(r.ca), x + 130, y + 5 + i * 5);
  }
  return y + 5 + rows.length * 5;
}
