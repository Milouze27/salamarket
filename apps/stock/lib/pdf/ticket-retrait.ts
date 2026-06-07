/**
 * Ticket de caisse / Reçu de retrait magasin — builder PDF pur (format 80 mm).
 *
 * Imprimé au comptoir quand le client récupère sa commande Drive. Sert de preuve
 * de retrait (ce qui a été remis, montant payé). Format rouleau 80 mm, imprimable
 * sur thermique ou en PDF. Bâti sur les tokens/polices du module brand.
 */
import {
  createBrandReceipt,
  setBrandFont,
  formatEur,
  formatDateTimeFr,
  ENTITE,
  PALETTE,
} from "./brand";

export interface TicketLigne {
  designation: string;
  /** Quantité affichée (unités) ou poids (kg) — déjà formatée par l'appelant. */
  quantiteLabel: string;
  /** Montant TTC de la ligne en centimes. */
  montantCents: number;
}

export interface TicketRetraitData {
  numeroCommande: string;
  clientNom: string | null;
  /** Date/heure de retrait (ou maintenant). */
  dateRetrait: string | Date;
  bayLabel: string | null;
  lignes: TicketLigne[];
  /** Total payé TTC en centimes. */
  totalCents: number;
  /** Taux de TVA dominant en % (pour la mention), optionnel. */
  tvaTaux?: number | null;
  /** Mode de paiement (ex. "En ligne", "Sur place"). */
  modePaiement?: string | null;
}

const W = 80;
const M = 5; // marge latérale
const INNER = W - M * 2;

export async function buildTicketRetraitPdf(
  data: TicketRetraitData,
): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const doc = createBrandReceipt(jsPDF, W, 200);
  let y = 8;

  const center = (
    text: string,
    size: number,
    bold = false,
    color = PALETTE.ink.rgb,
  ) => {
    setBrandFont(doc, bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(text, W / 2, y, { align: "center" });
  };
  const rule = () => {
    doc.setDrawColor(...PALETTE.hairline.rgb);
    doc.setLineWidth(0.2);
    doc.line(M, y, W - M, y);
  };

  // En-tête marque
  center(ENTITE.enseigne, 13, true, PALETTE.sapin.rgb);
  y += 4.5;
  center(ENTITE.raisonSociale, 8, false, PALETTE.muted.rgb);
  y += 3.6;
  center(ENTITE.adresse, 7, false, PALETTE.muted.rgb);
  y += 3.2;
  center(`SIRET ${ENTITE.siret}`, 6.5, false, PALETTE.muted.rgb);
  y += 5;

  // Titre
  center("REÇU DE RETRAIT", 9.5, true, PALETTE.sapin.rgb);
  y += 6;
  rule();
  y += 4.5;

  // Méta commande
  setBrandFont(doc, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...PALETTE.ink.rgb);
  const metaLine = (label: string, value: string) => {
    setBrandFont(doc, "normal");
    doc.text(label, M, y);
    setBrandFont(doc, "bold");
    doc.text(value, W - M, y, { align: "right" });
    y += 4;
  };
  metaLine("Commande", data.numeroCommande);
  if (data.clientNom) metaLine("Client", data.clientNom);
  metaLine("Retrait", formatDateTimeFr(data.dateRetrait));
  if (data.bayLabel) metaLine("Borne", data.bayLabel);
  y += 1.5;
  rule();
  y += 4.5;

  // Lignes
  setBrandFont(doc, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...PALETTE.ink.rgb);
  for (const l of data.lignes) {
    const nom = doc.splitTextToSize(l.designation, INNER - 22);
    doc.text(nom, M, y);
    doc.text(formatEur(l.montantCents), W - M, y, { align: "right" });
    y += 3.6 * Math.max(1, nom.length);
    setBrandFont(doc, "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(...PALETTE.muted.rgb);
    doc.text(l.quantiteLabel, M, y);
    doc.setFontSize(7.5);
    doc.setTextColor(...PALETTE.ink.rgb);
    y += 4.2;
  }
  y += 1;
  rule();
  y += 5;

  // Total
  setBrandFont(doc, "bold");
  doc.setFontSize(11);
  doc.setTextColor(...PALETTE.sapin.rgb);
  doc.text("TOTAL PAYÉ", M, y);
  doc.text(formatEur(data.totalCents), W - M, y, { align: "right" });
  y += 5.5;

  setBrandFont(doc, "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(...PALETTE.muted.rgb);
  if (data.modePaiement) {
    doc.text(`Paiement : ${data.modePaiement}`, M, y);
    y += 3.4;
  }
  if (data.tvaTaux != null) {
    doc.text(`TVA ${data.tvaTaux.toFixed(1)} % incluse`, M, y);
    y += 3.4;
  }
  y += 3;

  // Pied
  center(
    "Merci de votre confiance — Barak Allah o fik",
    7,
    false,
    PALETTE.sapin.rgb,
  );
  y += 3.4;
  center(
    "Produits halal certifiés · K & A FOOD Toulouse",
    6.3,
    false,
    PALETTE.muted.rgb,
  );

  return new Uint8Array(doc.output("arraybuffer"));
}
