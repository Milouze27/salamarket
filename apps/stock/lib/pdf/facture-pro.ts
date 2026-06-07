/**
 * Facture Pro (B2B) — builder PDF pur, bâti sur le module brand canonique.
 *
 * Conforme aux mentions obligatoires d'une facture française : émetteur
 * (raison sociale, SIRET, TVA), client (raison sociale, SIRET, TVA intracom,
 * adresse), n° + dates, détail des lignes, TVA ventilée par taux, totaux
 * HT/TVA/TTC, conditions de paiement + échéance, et mentions légales de pied
 * (pénalités de retard, indemnité forfaitaire 40 €).
 *
 * Pattern : builder pur (aucune I/O) → testable, réutilisable. La route fine
 * /api/factures-pro/[id]/pdf charge la donnée et appelle ce builder.
 */
import {
  createBrandDoc,
  drawHeader,
  drawFooterAllPages,
  drawSectionTitle,
  setBrandFont,
  setInk,
  hairline,
  formatEurFromUnits,
  formatDateFr,
  ENTITE,
  PALETTE,
  MARGIN,
  CONTENT_W,
  PAGE_W,
  PAGE_H,
} from "./brand";

export interface FactureProLigne {
  designation: string;
  /** Quantité unitaire totale (conditionnements × unités). */
  quantite: number;
  /** Prix HT unitaire (€). */
  prixHtUnitaire: number;
  /** Total HT de la ligne (€). */
  prixHtTotal: number;
  /** Taux de TVA en % (ex. 5.5, 20). */
  tvaTaux: number;
}

export interface FactureProData {
  numero: string;
  dateFacture: string | Date;
  dateEcheance: string | Date | null;
  conditionsPaiement: string | null;
  client: {
    raisonSociale: string;
    siret: string | null;
    tvaIntracom: string | null;
    adresse: string | null;
  };
  lignes: FactureProLigne[];
  /** Totaux en euros (source : commandes_pro). */
  montantHt: number;
  montantTva: number;
  montantTtc: number;
}

export async function buildFactureProPdf(
  data: FactureProData,
): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const doc = createBrandDoc(jsPDF);

  let y = drawHeader(doc, {
    titre: "Facture",
    reference: `N° ${data.numero}`,
    meta: `Émise le ${formatDateFr(data.dateFacture)}`,
    noEmisLe: true,
  });

  // ── Blocs Émetteur / Client (deux colonnes) ──────────────────────────
  const colGap = 8;
  const colW = (CONTENT_W - colGap) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + colW + colGap;
  const blockTop = y + 2;

  const emetteur = [
    ENTITE.raisonSociale,
    `Enseigne ${ENTITE.enseigne}`,
    ENTITE.adresse,
    `SIRET ${ENTITE.siret}`,
    `TVA ${ENTITE.tva}`,
  ];
  const client = [
    data.client.raisonSociale || "Client professionnel",
    data.client.adresse || "",
    data.client.siret ? `SIRET ${data.client.siret}` : "",
    data.client.tvaIntracom ? `TVA ${data.client.tvaIntracom}` : "",
  ].filter(Boolean);

  let ly = drawSectionTitle(doc, leftX, blockTop, "Émetteur", { width: colW });
  let ry = drawSectionTitle(doc, rightX, blockTop, "Facturé à", {
    width: colW,
  });
  setBrandFont(doc, "normal");
  doc.setFontSize(9.5);
  setInk(doc);
  for (const line of emetteur) {
    const wrapped = doc.splitTextToSize(line, colW);
    doc.text(wrapped, leftX, ly + 4);
    ly += 4 * wrapped.length;
  }
  for (const line of client) {
    const wrapped = doc.splitTextToSize(line, colW);
    doc.text(wrapped, rightX, ry + 4);
    ry += 4 * wrapped.length;
  }
  y = Math.max(ly, ry) + 8;

  // ── Détail des lignes ────────────────────────────────────────────────
  y = drawSectionTitle(doc, MARGIN, y, "Détail", { rule: true });

  // Colonnes : Désignation | Qté | PU HT | TVA | Total HT (alignées droite)
  const cQte = MARGIN + 96;
  const cPu = MARGIN + 120;
  const cTva = MARGIN + 146;
  const cTot = MARGIN + CONTENT_W;
  setBrandFont(doc, "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...PALETTE.muted.rgb);
  doc.text("Désignation", MARGIN, y);
  doc.text("Qté", cQte, y, { align: "right" });
  doc.text("PU HT", cPu, y, { align: "right" });
  doc.text("TVA", cTva, y, { align: "right" });
  doc.text("Total HT", cTot, y, { align: "right" });
  y += 2;
  hairline(doc, MARGIN, y, MARGIN + CONTENT_W);
  y += 4;

  setBrandFont(doc, "normal");
  doc.setFontSize(9);
  setInk(doc);
  for (const l of data.lignes) {
    // Saut de page si on déborde (réserve pied + totaux).
    if (y > PAGE_H - 60) {
      doc.addPage();
      y = MARGIN + 6;
    }
    const nom = doc.splitTextToSize(l.designation, 92);
    doc.text(nom, MARGIN, y);
    doc.text(String(l.quantite), cQte, y, { align: "right" });
    doc.text(formatEurFromUnits(l.prixHtUnitaire), cPu, y, { align: "right" });
    doc.text(`${l.tvaTaux.toFixed(1)} %`, cTva, y, { align: "right" });
    doc.text(formatEurFromUnits(l.prixHtTotal), cTot, y, { align: "right" });
    y += 4.5 * Math.max(1, nom.length) + 1.5;
  }

  hairline(doc, MARGIN, y, MARGIN + CONTENT_W);
  y += 6;

  // ── Ventilation TVA par taux ─────────────────────────────────────────
  const parTaux = new Map<number, { base: number; tva: number }>();
  for (const l of data.lignes) {
    const cur = parTaux.get(l.tvaTaux) ?? { base: 0, tva: 0 };
    cur.base += l.prixHtTotal;
    cur.tva += Math.round(l.prixHtTotal * (l.tvaTaux / 100) * 100) / 100;
    parTaux.set(l.tvaTaux, cur);
  }

  // ── Totaux (bloc aligné à droite) ────────────────────────────────────
  const totX = MARGIN + CONTENT_W;
  const labX = MARGIN + CONTENT_W - 60;
  setBrandFont(doc, "normal");
  doc.setFontSize(9.5);
  setInk(doc);
  for (const [taux, v] of Array.from(parTaux.entries()).sort(
    (a, b) => a[0] - b[0],
  )) {
    doc.text(
      `TVA ${taux.toFixed(1)} % sur ${formatEurFromUnits(v.base)}`,
      labX,
      y,
      {
        align: "right",
      },
    );
    doc.text(formatEurFromUnits(v.tva), totX, y, { align: "right" });
    y += 5;
  }
  y += 1;
  doc.text("Total HT", labX, y, { align: "right" });
  doc.text(formatEurFromUnits(data.montantHt), totX, y, { align: "right" });
  y += 5;
  doc.text("Total TVA", labX, y, { align: "right" });
  doc.text(formatEurFromUnits(data.montantTva), totX, y, { align: "right" });
  y += 3;
  hairline(doc, labX - 4, y, totX);
  y += 5;
  setBrandFont(doc, "bold");
  doc.setFontSize(12);
  doc.setTextColor(...PALETTE.sapin.rgb);
  doc.text("Total TTC", labX, y, { align: "right" });
  doc.text(formatEurFromUnits(data.montantTtc), totX, y, { align: "right" });
  y += 10;

  // ── Conditions de paiement ───────────────────────────────────────────
  setInk(doc);
  setBrandFont(doc, "normal");
  doc.setFontSize(9);
  if (data.dateEcheance) {
    doc.text(
      `Échéance de paiement : ${formatDateFr(data.dateEcheance)}`,
      MARGIN,
      y,
    );
    y += 5;
  }
  if (data.conditionsPaiement) {
    doc.text(`Conditions : ${data.conditionsPaiement}`, MARGIN, y);
    y += 5;
  }

  // ── Pied légal (mentions facture obligatoires) ───────────────────────
  drawFooterAllPages(doc, {
    mentionFiscale:
      "En cas de retard de paiement : pénalités au taux de 3× l'intérêt légal + indemnité forfaitaire de 40 € (art. L441-10 c. com.). Pas d'escompte pour paiement anticipé.",
  });

  return new Uint8Array(doc.output("arraybuffer"));
}
