"use client";

/**
 * lib/labels/gondole.ts — Étiquette GONDOLE rayon (PDF-03).
 *
 * Format ~A6 paysage (100×70 mm) à coller en rayon : PRIX TTC GÉANT,
 * prix/kg, nom produit, DLC, picto halal, mini-QR traçabilité.
 *
 * Deux modes :
 *   - buildGondolePdf()      → étiquette prix standard ;
 *   - buildPromoDlcPdf()     → layout PROMO DLC : prix BARRÉ + prix SOLDÉ
 *     (remise DLC Wave 4), bandeau « -X% DLC » pour coller sur le produit
 *     démarqué. 1 tap depuis /v2/admin/alertes-dlc.
 *
 * bwip-js (browser) pour le mini-QR ; jsPDF côté client.
 *
 * NOTE : ce module n'importe PAS le module brand (réservé aux documents
 * A4). Les couleurs sont inline ici car l'étiquette gondole n'a pas de
 * header/footer légal — c'est un objet d'affichage rayon, pas un doc.
 */

import jsPDF from "jspdf";
import { generateLotQrUrl } from "@/lib/qr-lot";

const W = 100; // mm
const H = 70; // mm

// Couleurs (RGB) cohérentes MYTHOS — corps clair (impression rayon).
const SAPIN: [number, number, number] = [14, 59, 46];
const SAPIN_PRIMARY: [number, number, number] = [27, 106, 74];
const OR: [number, number, number] = [201, 162, 39]; // #c9a227 (cf brand.ts / DESIGN.md)
const INK: [number, number, number] = [20, 28, 24];
const INK_SOFT: [number, number, number] = [90, 100, 95];
const DANGER: [number, number, number] = [168, 35, 26];
const RULE: [number, number, number] = [222, 226, 223];

export interface GondoleInput {
  produitNom: string;
  marque?: string | null;
  /** Prix TTC affiché (€). */
  prixTtc: number;
  /** Prix au kg (€/kg) pour produits au poids. Optionnel. */
  prixKg?: number | null;
  /** DLC ISO (YYYY-MM-DD). Optionnel. */
  dlc?: string | null;
  /** N° de lot pour le mini-QR de traçabilité. Optionnel. */
  lot?: string | null;
  /** Affiche le picto Halal (défaut true). */
  halal?: boolean;
}

export interface PromoDlcInput extends GondoleInput {
  /** Pourcentage de remise DLC (0..100). */
  remisePct: number;
}

function fmtEur(n: number): string {
  return (
    new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n) + " €"
  );
}
function fmtDlc(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

async function qrPng(lot: string): Promise<string | null> {
  try {
    const bwipjs = (await import("bwip-js/browser")).default;
    const canvas = document.createElement("canvas");
    bwipjs.toCanvas(canvas, {
      bcid: "qrcode",
      text: generateLotQrUrl(lot),
      scale: 3,
      eclevel: "M",
      backgroundcolor: "FFFFFF",
      paddingwidth: 1,
    } as Parameters<typeof bwipjs.toCanvas>[1]);
    return canvas.toDataURL("image/png");
  } catch (e) {
    console.error("[gondole] qr fail", e);
    return null;
  }
}

function setFill(doc: jsPDF, c: [number, number, number]) {
  doc.setFillColor(c[0], c[1], c[2]);
}
function setText(doc: jsPDF, c: [number, number, number]) {
  doc.setTextColor(c[0], c[1], c[2]);
}
function setDraw(doc: jsPDF, c: [number, number, number]) {
  doc.setDrawColor(c[0], c[1], c[2]);
}

/** Bloc commun en haut : bandeau sapin + nom + marque. Retourne Y bas. */
function drawHead(doc: jsPDF, input: GondoleInput): number {
  // Bandeau sapin fin haut
  setFill(doc, SAPIN);
  doc.rect(0, 0, W, 4, "F");
  setFill(doc, OR);
  doc.rect(0, 4, W, 0.6, "F");

  // Picto halal (pastille verte droite)
  if (input.halal !== false) {
    setFill(doc, SAPIN_PRIMARY);
    doc.circle(W - 12, 16, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    setText(doc, [255, 255, 255]);
    doc.text("HALAL", W - 12, 16.4, { align: "center", baseline: "middle" });
  }

  // Nom produit
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  setText(doc, INK);
  const nameLines = doc.splitTextToSize(input.produitNom, W - 30);
  // Ellipsis si le nom dépasse 2 lignes (sinon coupe brutale, illisible rayon).
  const shown = nameLines.slice(0, 2);
  if (nameLines.length > 2 && shown.length === 2) {
    shown[1] = shown[1].replace(/\s*\S*$/, "") + "…";
  }
  doc.text(shown, 6, 14);
  let y = 14 + shown.length * 5.4;

  if (input.marque) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    setText(doc, INK_SOFT);
    doc.text(input.marque, 6, y);
    y += 5;
  }
  return y;
}

function drawFooter(doc: jsPDF, input: GondoleInput, qr: string | null) {
  // DLC (bas gauche)
  if (input.dlc) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    setText(doc, OR);
    doc.text("DLC", 6, H - 11, { charSpace: 0.4 });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    setText(doc, INK);
    doc.text(fmtDlc(input.dlc), 6, H - 5);
  }

  // Mini-QR traçabilité (bas droite)
  if (input.lot && qr) {
    const s = 16;
    doc.addImage(qr, "PNG", W - 6 - s, H - 6 - s, s, s);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5);
    setText(doc, INK_SOFT);
    doc.text("Scan = traçabilité", W - 6 - s / 2, H - 4, { align: "center" });
  }
}

/** Dessine UNE étiquette gondole standard sur la page courante du doc. */
async function paintGondole(doc: jsPDF, input: GondoleInput): Promise<void> {
  const qr = input.lot ? await qrPng(input.lot) : null;
  drawHead(doc, input);

  // PRIX GÉANT centré
  doc.setFont("helvetica", "bold");
  doc.setFontSize(42);
  setText(doc, SAPIN);
  doc.text(fmtEur(input.prixTtc), W / 2, 44, { align: "center" });

  if (input.prixKg != null) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    setText(doc, INK_SOFT);
    doc.text(`soit ${fmtEur(input.prixKg)} / kg`, W / 2, 51, {
      align: "center",
    });
  }

  drawFooter(doc, input, qr);
}

/** Étiquette gondole standard (prix) — PDF 1 page. */
export async function buildGondolePdf(input: GondoleInput): Promise<Blob> {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [W, H],
  });
  await paintGondole(doc, input);
  return doc.output("blob");
}

/**
 * Lot d'étiquettes gondole dans UN seul PDF multipage (1 étiquette /
 * page), sans dépendance externe. Callback de progression pour les gros
 * lots.
 */
export async function buildGondoleBatchPdf(
  inputs: GondoleInput[],
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  if (inputs.length === 0) throw new Error("Aucune étiquette à générer.");
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [W, H],
  });
  for (let i = 0; i < inputs.length; i++) {
    if (i > 0) doc.addPage([W, H], "landscape");
    await paintGondole(doc, inputs[i]);
    onProgress?.(i + 1, inputs.length);
  }
  return doc.output("blob");
}

/** Layout PROMO DLC : prix barré + prix soldé + bandeau remise. */
export async function buildPromoDlcPdf(input: PromoDlcInput): Promise<Blob> {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [W, H],
  });
  const qr = input.lot ? await qrPng(input.lot) : null;
  drawHead(doc, input);

  const remise = Math.max(0, Math.min(100, Math.round(input.remisePct)));
  const prixSolde = input.prixTtc * (1 - remise / 100);

  // Bandeau remise rouge (gauche)
  setFill(doc, DANGER);
  doc.roundedRect(6, 24, 30, 20, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  setText(doc, [255, 255, 255]);
  doc.text(`-${remise}%`, 21, 34, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.text("ANTI-GASPI", 21, 40, { align: "center", charSpace: 0.3 });

  // Prix barré (petit, au-dessus)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  setText(doc, INK_SOFT);
  const oldStr = fmtEur(input.prixTtc);
  const oldX = 66;
  const oldY = 30;
  doc.text(oldStr, oldX, oldY, { align: "center" });
  // trait de barrage
  const oldW = doc.getTextWidth(oldStr);
  setDraw(doc, DANGER);
  doc.setLineWidth(0.8);
  doc.line(oldX - oldW / 2 - 1, oldY - 1.6, oldX + oldW / 2 + 1, oldY - 1.6);

  // Prix soldé GÉANT
  doc.setFont("helvetica", "bold");
  doc.setFontSize(34);
  setText(doc, DANGER);
  doc.text(fmtEur(prixSolde), 66, 47, { align: "center" });

  if (input.prixKg != null) {
    const kgSolde = input.prixKg * (1 - remise / 100);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setText(doc, INK_SOFT);
    doc.text(`soit ${fmtEur(kgSolde)} / kg`, 66, 53, { align: "center" });
  }

  // Ligne séparatrice avant footer
  setDraw(doc, RULE);
  doc.setLineWidth(0.3);
  doc.line(6, H - 18, W - 6, H - 18);

  drawFooter(doc, input, qr);
  return doc.output("blob");
}
