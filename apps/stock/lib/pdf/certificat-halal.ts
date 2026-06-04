/**
 * lib/pdf/certificat-halal.ts — Certificat de traçabilité Halal A4 (PDF-02,
 * Wave 5, le MOAT).
 *
 * Builder PUR : prend les données déjà lues (lot + QR rendu) et renvoie les
 * octets du PDF. Aucune I/O réseau / DB ici → testable hors Next (un script
 * Node peut l'appeler avec des données factices pour vérifier le rendu).
 * La route `api/lots/[id]/certificat-pdf` ne fait que : lire le lot, encoder
 * le QR, puis appeler ce builder.
 *
 * Branché sur le module brand UNIFIÉ `lib/pdf/brand.ts` (même en-tête sapin +
 * footer légal K & A FOOD que les rapports cashbox / bons de réception) pour
 * une cohérence de marque irréprochable.
 *
 * NB fournisseur : la route publique n'alimente PAS `lot.fournisseurs`
 * (table staff-only par RLS, cf. en-tête de la route). Le builder reste
 * générique : si `fournisseurs` est fourni (mode staff futur), il l'affiche ;
 * sinon l'étape « Fournisseur » se réduit au n° de lot fournisseur.
 */

import {
  createBrandDoc,
  drawHeader,
  drawFooter,
  setBrandFont,
  formatDateLongFr,
  PALETTE,
  ENTITE,
  PAGE_W,
  MARGIN,
  CONTENT_W,
} from "./brand";
import type { jsPDF } from "jspdf";

/** Sous-ensemble du lot nécessaire au certificat (lu via Supabase côté route). */
export interface CertificatLot {
  supplier_lot: string | null;
  certifier_id: string | null;
  certifier_name: string | null;
  certifier_valid_until: string | null;
  abattoir_nom: string | null;
  abattoir_pays: string | null;
  date_abattage: string | null;
  date_reception: string;
  dlc: string | null;
  ddm: string | null;
  quantite_recue: number | null;
  unite: string | null;
  produits: {
    nom: string;
    marque: string | null;
    categorie: string | null;
  } | null;
  fournisseurs: { nom: string; siret: string | null } | null;
}

export interface CertificatInput {
  /** Identifiant du lot (référence + nom de fichier). */
  lotId: string;
  lot: CertificatLot;
  /** URL publique de traçabilité encodée dans le QR. */
  publicUrl: string;
  /** PNG data URL du QR (null si l'encodage a échoué → fallback texte). */
  qrDataUrl: string | null;
}

/* ─── Couleurs (tuples RGB depuis la palette brand print) ──────────────── */
const C = {
  sapin: PALETTE.sapin.rgb,
  sapinPrimary: PALETTE.sapinLight.rgb,
  or: PALETTE.gold.rgb,
  ink: PALETTE.ink.rgb,
  inkSoft: PALETTE.muted.rgb,
  danger: PALETTE.danger.rgb,
  cream: PALETTE.cream.rgb,
  white: PALETTE.white.rgb,
  rule: PALETTE.hairline.rgb,
} as const;

function fill(doc: jsPDF, rgb: readonly [number, number, number]) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}
function text(doc: jsPDF, rgb: readonly [number, number, number]) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}
function draw(doc: jsPDF, rgb: readonly [number, number, number]) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}

/**
 * Génère le certificat de traçabilité Halal A4 (1 page) et renvoie ses octets.
 * Pur (jsPDF only) — aucune dépendance réseau.
 */
export async function buildCertificatHalalPdf(
  input: CertificatInput,
): Promise<ArrayBuffer> {
  const { lotId, lot, publicUrl, qrDataUrl } = input;
  const { jsPDF: JsPDF } = await import("jspdf");
  const doc = createBrandDoc(JsPDF);

  const pageW = PAGE_W;
  const margin = MARGIN;
  const contentW = CONTENT_W;

  // Certificat AVS expiré ? (aligné Wave 4 : certif expiré = bloquant)
  const certifExpired =
    !!lot.certifier_valid_until &&
    new Date(lot.certifier_valid_until + "T23:59:59") < new Date();

  // ── En-tête bandeau sapin (module brand unifié) ──────────────────
  let y = drawHeader(doc, {
    titre: "Certificat de traçabilité Halal",
    sousTitre: "Traçabilité halal vérifiée",
    reference: `Lot ${lotId}`,
    noEmisLe: true, // l'émission est rappelée en pied de corps (formel)
  });

  // ── Bandeau rouge si certif expiré ───────────────────────────────
  if (certifExpired) {
    fill(doc, C.danger);
    doc.roundedRect(margin, y, contentW, 11, 2, 2, "F");
    setBrandFont(doc, "bold");
    doc.setFontSize(10);
    text(doc, C.white);
    doc.text(
      `⚠  CERTIFICAT HALAL EXPIRÉ — validité dépassée le ${formatDateLongFr(
        lot.certifier_valid_until,
      )}`,
      pageW / 2,
      y + 7,
      { align: "center" },
    );
    y += 16;
  }

  // ── Bloc produit (titre éditorial) ───────────────────────────────
  setBrandFont(doc, "bold");
  doc.setFontSize(7.5);
  text(doc, C.or);
  doc.text("PRODUIT CERTIFIÉ", margin, y + 4, { charSpace: 0.5 });

  setBrandFont(doc, "bold");
  doc.setFontSize(20);
  text(doc, C.ink);
  const produitNom = lot.produits?.nom ?? "Produit";
  const nomLines = doc.splitTextToSize(produitNom, contentW - 62);
  doc.text(nomLines.slice(0, 2), margin, y + 13);

  let metaY = y + 13 + nomLines.slice(0, 2).length * 7;
  setBrandFont(doc, "normal");
  doc.setFontSize(10);
  text(doc, C.inkSoft);
  const metaParts: string[] = [];
  if (lot.produits?.marque) metaParts.push(lot.produits.marque);
  if (lot.produits?.categorie) metaParts.push(lot.produits.categorie);
  if (metaParts.length) {
    doc.text(metaParts.join("  ·  "), margin, metaY);
    metaY += 6;
  }

  // ── QR à droite (grand, scannable) ───────────────────────────────
  const qrSize = 52;
  const qrX = pageW - margin - qrSize;
  const qrY = y;
  // Cartouche QR
  fill(doc, C.cream);
  doc.roundedRect(qrX - 4, qrY - 2, qrSize + 8, qrSize + 14, 3, 3, "F");
  draw(doc, C.or);
  doc.setLineWidth(0.5);
  doc.roundedRect(qrX - 4, qrY - 2, qrSize + 8, qrSize + 14, 3, 3, "S");
  if (qrDataUrl) {
    doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
  } else {
    setBrandFont(doc, "normal");
    doc.setFontSize(7);
    text(doc, C.inkSoft);
    doc.text("QR indisponible", qrX + qrSize / 2, qrY + qrSize / 2, {
      align: "center",
    });
  }
  setBrandFont(doc, "bold");
  doc.setFontSize(7);
  text(doc, C.sapin);
  doc.text("SCANNEZ POUR VÉRIFIER", qrX + qrSize / 2, qrY + qrSize + 6, {
    align: "center",
    charSpace: 0.3,
  });
  setBrandFont(doc, "normal");
  doc.setFontSize(5.6);
  text(doc, C.inkSoft);
  doc.text(publicUrl, qrX + qrSize / 2, qrY + qrSize + 10, {
    align: "center",
  });

  y = Math.max(metaY, qrY + qrSize + 14) + 4;

  // ── Sceau AVS / certificateur ────────────────────────────────────
  const sealH = 20;
  const sealColor = certifExpired ? C.danger : C.sapinPrimary;
  draw(doc, sealColor);
  doc.setLineWidth(0.8);
  doc.roundedRect(margin, y, contentW, sealH, 3, 3, "S");
  // pastille gauche
  fill(doc, sealColor);
  doc.circle(margin + 13, y + sealH / 2, 7.5, "F");
  setBrandFont(doc, "bold");
  doc.setFontSize(7);
  text(doc, C.white);
  doc.text("HALAL", margin + 13, y + sealH / 2 + 0.5, {
    align: "center",
    baseline: "middle",
  });

  setBrandFont(doc, "bold");
  doc.setFontSize(7);
  text(doc, C.or);
  doc.text("ORGANISME CERTIFICATEUR", margin + 26, y + 7, { charSpace: 0.4 });
  setBrandFont(doc, "bold");
  doc.setFontSize(12);
  text(doc, C.ink);
  doc.text(
    lot.certifier_name ?? lot.certifier_id ?? "Non renseigné",
    margin + 26,
    y + 14,
  );

  // Validité (droite du sceau)
  setBrandFont(doc, "normal");
  doc.setFontSize(8.5);
  text(doc, certifExpired ? C.danger : C.inkSoft);
  const validTxt = lot.certifier_valid_until
    ? `${certifExpired ? "Expiré le" : "Valide jusqu'au"} ${formatDateLongFr(
        lot.certifier_valid_until,
      )}`
    : "Validité non renseignée";
  doc.text(validTxt, pageW - margin - 4, y + 14, { align: "right" });
  if (lot.certifier_id && lot.certifier_name) {
    setBrandFont(doc, "normal");
    doc.setFontSize(7);
    text(doc, C.inkSoft);
    doc.text(`ID ${lot.certifier_id}`, pageW - margin - 4, y + 8, {
      align: "right",
    });
  }
  y += sealH + 8;

  // ── Timeline verticale : abattoir → fournisseur → réception → DLC ─
  setBrandFont(doc, "bold");
  doc.setFontSize(7.5);
  text(doc, C.or);
  doc.text("PARCOURS DE TRAÇABILITÉ", margin, y, { charSpace: 0.5 });
  y += 7;

  const steps: { titre: string; lignes: [string, string][] }[] = [
    {
      titre: "Abattoir d'origine",
      lignes: [
        ["Établissement", lot.abattoir_nom ?? "—"],
        ["Pays", lot.abattoir_pays ?? "—"],
        ["Date d'abattage", formatDateLongFr(lot.date_abattage)],
      ],
    },
    {
      titre: "Fournisseur",
      lignes: [
        ...(lot.fournisseurs?.nom
          ? ([["Raison sociale", lot.fournisseurs.nom]] as [string, string][])
          : []),
        ...(lot.fournisseurs?.siret
          ? ([["SIRET", lot.fournisseurs.siret]] as [string, string][])
          : []),
        ["Lot fournisseur", lot.supplier_lot ?? "—"],
      ],
    },
    {
      titre: "Réception magasin",
      lignes: [
        ["Enseigne", `${ENTITE.enseigne} — ${ENTITE.adresse}`],
        ["Date de réception", formatDateLongFr(lot.date_reception)],
        [
          "Quantité reçue",
          lot.quantite_recue != null
            ? `${lot.quantite_recue} ${lot.unite ?? ""}`.trim()
            : "—",
        ],
      ],
    },
    {
      titre: "Date limite de consommation",
      lignes: [
        ["DLC", formatDateLongFr(lot.dlc)],
        ...(lot.ddm
          ? ([["DDM", formatDateLongFr(lot.ddm)]] as [string, string][])
          : []),
      ],
    },
  ];

  const railX = margin + 3;
  const stepGap = 3;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const rowH = 5.6;
    const blockH = 7 + step.lignes.length * rowH;

    // Rail vertical entre les noeuds
    if (i < steps.length - 1) {
      draw(doc, C.rule);
      doc.setLineWidth(0.5);
      doc.line(railX, y + 3, railX, y + blockH + stepGap);
    }
    // Noeud
    fill(doc, C.sapinPrimary);
    doc.circle(railX, y + 2.5, 2.4, "F");
    fill(doc, C.white);
    doc.circle(railX, y + 2.5, 0.9, "F");

    // Titre étape
    setBrandFont(doc, "bold");
    doc.setFontSize(11);
    text(doc, C.sapin);
    doc.text(step.titre, railX + 8, y + 4);

    // Lignes data
    let ly = y + 9;
    for (const [k, v] of step.lignes) {
      setBrandFont(doc, "normal");
      doc.setFontSize(9);
      text(doc, C.inkSoft);
      doc.text(k, railX + 8, ly);
      setBrandFont(doc, "bold");
      doc.setFontSize(9);
      text(doc, C.ink);
      const vLines = doc.splitTextToSize(v, contentW - 70);
      doc.text(vLines.slice(0, 1), pageW - margin, ly, { align: "right" });
      ly += rowH;
    }

    y += blockH + stepGap;
  }

  // ── Mention vérification publique ────────────────────────────────
  y += 1;
  fill(doc, C.cream);
  doc.roundedRect(margin, y, contentW, 14, 2, 2, "F");
  fill(doc, C.or);
  doc.rect(margin, y, 1.5, 14, "F");
  setBrandFont(doc, "bold");
  doc.setFontSize(9);
  text(doc, C.sapin);
  doc.text(
    "Vérifiable publiquement en scannant le QR ci-dessus.",
    margin + 6,
    y + 6,
  );
  setBrandFont(doc, "normal");
  doc.setFontSize(7.5);
  text(doc, C.inkSoft);
  doc.text(
    "Chaque lot dispose d'une page de traçabilité publique, infalsifiable et horodatée.",
    margin + 6,
    y + 11,
  );
  y += 18;

  // ── Émission (rappel formel en bas de corps) ─────────────────────
  setBrandFont(doc, "normal");
  doc.setFontSize(7.5);
  text(doc, C.inkSoft);
  doc.text(
    `Certificat émis le ${formatDateLongFr(new Date())} à ${new Date().toLocaleTimeString(
      "fr-FR",
      { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" },
    )} — réf. ${lotId}`,
    margin,
    y,
  );

  // ── Pied de page légal (module brand unifié) ─────────────────────
  drawFooter(doc, { page: 1, total: 1 });

  return doc.output("arraybuffer");
}
