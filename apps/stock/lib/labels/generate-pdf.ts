"use client";

/**
 * Brother QL-820 label PDF generator (62mm × 29mm continuous-roll style).
 * One label per page.
 *
 * REFONTE Wave 5 (PDF-03 + PDF-04) :
 *   - Ajout PRIX TTC + DLC + n° de lot sur l'étiquette (avant : nom + EAN
 *     seulement).
 *   - Dédup code-barres (Map<key, dataUrl>) — un même EAN n'est rasterisé
 *     qu'une fois sur tout le batch.
 *   - Validation EAN-13 (check-digit) + fallback Code128 sur le SKU/ID
 *     quand l'EAN manque ou est invalide.
 *   - Quiet-zone (padding bwip-js).
 *   - Callback de progression pour les gros lots (200+ copies).
 *
 * Format Brother conservé (62×29mm landscape, 1 étiquette / page).
 */

import jsPDF from "jspdf";
import { pickBarcode, renderBarcodePng } from "./barcode";

export interface LabelInput {
  produitNom: string;
  marque?: string | null;
  ean: string;
  /** Fallback Code128 si l'EAN est absent / invalide. */
  sku?: string | null;
  /** Prix TTC à l'unité (€). Optionnel. */
  prixTtc?: number | null;
  /** Prix au kg (€/kg) pour les produits au poids. Optionnel. */
  prixKg?: number | null;
  /** DLC au format ISO (YYYY-MM-DD). Optionnel. */
  dlc?: string | null;
  /** N° de lot (traçabilité). Optionnel. */
  lot?: string | null;
}

export interface BuildLabelsOptions {
  /** Appelé après chaque étiquette : (faites, total). Pour une barre. */
  onProgress?: (done: number, total: number) => void;
}

const LABEL_W_MM = 62;
const LABEL_H_MM = 29;

function fmtEur(n: number): string {
  return (
    new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n) + " €"
  );
}

function fmtDlcShort(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export async function buildLabelsPdf(
  items: LabelInput[],
  copiesPerProduct: number,
  options: BuildLabelsOptions = {},
): Promise<Blob> {
  if (items.length === 0) throw new Error("Aucune étiquette à générer.");

  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [LABEL_W_MM, LABEL_H_MM],
  });

  // Cache de dédup partagé sur tout le batch (PDF-04).
  const barcodeCache = new Map<string, string>();
  const total = items.length * copiesPerProduct;
  let pageIdx = 0;
  let done = 0;

  for (const item of items) {
    // 1 rendu code-barres par PRODUIT (réutilisé sur toutes ses copies).
    const spec = pickBarcode(item.ean, item.sku);
    const barcode = spec
      ? await renderBarcodePng(spec, barcodeCache, { scale: 2, height: 11 })
      : null;

    for (let copy = 0; copy < copiesPerProduct; copy++) {
      if (pageIdx > 0) pdf.addPage([LABEL_W_MM, LABEL_H_MM], "landscape");

      // ── Titre (max 2 lignes) ──────────────────────────────────
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      const title = pdf.splitTextToSize(item.produitNom, LABEL_W_MM - 22);
      const titleLines = title.slice(0, 2);
      // Ellipsis si le nom dépasse 2 lignes (sinon coupe brutale sur l'étiquette).
      if (title.length > 2 && titleLines.length === 2) {
        titleLines[1] = titleLines[1].replace(/\s*\S*$/, "") + "…";
      }
      pdf.text(titleLines, 3, 4.5);

      let leftY = 4.5 + titleLines.length * 3.1;

      // Marque
      if (item.marque) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(6);
        pdf.setTextColor(90);
        pdf.text(item.marque, 3, leftY);
        pdf.setTextColor(0);
        leftY += 3;
      }

      // Lot + DLC (petite ligne traçabilité)
      const trace: string[] = [];
      if (item.lot) trace.push(`Lot ${item.lot}`);
      if (item.dlc) trace.push(`DLC ${fmtDlcShort(item.dlc)}`);
      if (trace.length) {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(6);
        pdf.setTextColor(70);
        // Tronque sur la largeur dispo (colonne gauche) plutôt que de
        // laisser jsPDF clipper silencieusement un n° de lot trop long.
        const traceLine = pdf
          .splitTextToSize(trace.join("  ·  "), LABEL_W_MM - 22)
          .slice(0, 1);
        pdf.text(traceLine, 3, leftY);
        pdf.setTextColor(0);
      }

      // ── Prix (coin haut-droit, gros) ──────────────────────────
      if (item.prixTtc != null) {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(11);
        pdf.text(fmtEur(item.prixTtc), LABEL_W_MM - 3, 5, { align: "right" });
        if (item.prixKg != null) {
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(6);
          pdf.setTextColor(90);
          pdf.text(`${fmtEur(item.prixKg)}/kg`, LABEL_W_MM - 3, 8.5, {
            align: "right",
          });
          pdf.setTextColor(0);
        }
      }

      // ── Code-barres (bas, centré) ─────────────────────────────
      if (barcode) {
        const bcW = 38;
        const bcH = 13;
        pdf.addImage(
          barcode.dataUrl,
          "PNG",
          (LABEL_W_MM - bcW) / 2,
          LABEL_H_MM - bcH - 0.5,
          bcW,
          bcH,
        );
      } else {
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(7);
        pdf.text(
          item.ean ? `EAN: ${item.ean}` : "Pas de code-barres",
          LABEL_W_MM / 2,
          LABEL_H_MM - 3,
          { align: "center" },
        );
      }

      pageIdx++;
      done++;
      options.onProgress?.(done, total);
    }
  }

  return pdf.output("blob");
}
