/**
 * lib/pdf/brand.ts — Module PDF brand unifié Salamarket (MYTHOS Wave 5).
 *
 * Fondation partagée de TOUS les documents PDF de l'app Stock : rapports
 * cashbox, bons de réception, certificat halal, factures, étiquettes…
 * L'objectif est que chaque doc ait EXACTEMENT le même en-tête sapin + le
 * même footer légal K & A FOOD, pour une cohérence de marque irréprochable
 * à l'impression.
 *
 * ── Règle dark/print ──────────────────────────────────────────────────
 * L'app est dark (tokens --surface-*). Le PDF est l'EXCEPTION : bandeau
 * d'en-tête sapin plein (#0E3B2E) + logo or, mais CORPS BLANC (économie
 * d'encre + lisibilité d'impression). On ne consomme donc PAS les tokens
 * dark ici — on a notre propre palette print.
 *
 * ── Typographie ───────────────────────────────────────────────────────
 * Plus Jakarta Sans (Regular + Bold) embarquée en base64 (lib/pdf/fonts.ts)
 * pour des accents FR (é è à ç ù) et un € impeccables. Si l'embed échoue
 * pour une raison quelconque, on retombe proprement sur Helvetica.
 *
 * @example
 *   import { jsPDF } from "jspdf";
 *   import { createBrandDoc, drawHeader, drawFooter, formatEur, FONT } from "@/lib/pdf/brand";
 *   const doc = createBrandDoc();            // jsPDF A4 + fonts enregistrées
 *   const top = drawHeader(doc, { titre: "Rapport mensuel", sousTitre: "Mai 2026" });
 *   doc.setFont(FONT.family, "normal");
 *   doc.text(`Total : ${formatEur(123456)}`, MARGIN, top + 10);
 *   drawFooter(doc, { mentionFiscale: "Document non fiscal au sens NF525." });
 */

import type { jsPDF } from "jspdf";
import { PLUS_JAKARTA_REGULAR_B64, PLUS_JAKARTA_BOLD_B64 } from "./fonts";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Géométrie A4 ───────────────────────────────────────────────────────
/** Largeur page A4 en mm. */
export const PAGE_W = 210;
/** Hauteur page A4 en mm. */
export const PAGE_H = 297;
/** Marge gauche/droite cohérente pour tous les docs (mm). */
export const MARGIN = 18;
/** Largeur de la zone de contenu (entre marges) en mm. */
export const CONTENT_W = PAGE_W - MARGIN * 2;
/** Hauteur du bandeau d'en-tête sapin (mm). */
export const HEADER_H = 28;
/** Y de base du corps juste sous le header (mm). drawHeader retourne sa valeur. */
export const BODY_TOP = HEADER_H + 10;

// ─── Palette print (HEX + tuples RGB pour jsPDF) ────────────────────────
/**
 * Palette brand pour les PDF. HEX pour référence/CSS, tuple `rgb` pour les
 * appels jsPDF (`setFillColor(...rgb)`). NB : c'est la palette PRINT (corps
 * blanc), pas les tokens dark de l'app.
 */
export const PALETTE = {
  /** Sapin plein du bandeau en-tête. */
  sapin: { hex: "#0E3B2E", rgb: [14, 59, 46] as [number, number, number] },
  /** Sapin clair pour titres de section dans le corps. */
  sapinLight: {
    hex: "#1B6A4A",
    rgb: [27, 106, 74] as [number, number, number],
  },
  /** Or signature (logo, filets premium). Or canonique #c9a227 (cf DESIGN.md /
   *  globals.css --accent-gold) : le #E8C24A précédent était l'or DARK-mode,
   *  délavé/peu lisible sur le papier blanc des PDFs. */
  gold: { hex: "#C9A227", rgb: [201, 162, 39] as [number, number, number] },
  /** Or vif pour accents lumineux (--accent-gold-bright). */
  goldBright: {
    hex: "#DDB31C",
    rgb: [221, 179, 28] as [number, number, number],
  },
  /** Crème : fonds de bandeaux / en-têtes de tableaux. */
  cream: { hex: "#F5F0E1", rgb: [245, 240, 225] as [number, number, number] },
  /** Crème pâle : zébrage de lignes alternées. */
  creamSoft: {
    hex: "#FAF7EE",
    rgb: [250, 247, 238] as [number, number, number],
  },
  /** Texte principal du corps (presque noir, plus doux que #000). */
  ink: { hex: "#1A1A1A", rgb: [26, 26, 26] as [number, number, number] },
  /** Texte secondaire / méta / footer. */
  muted: { hex: "#787878", rgb: [120, 120, 120] as [number, number, number] },
  /** Filets fins. */
  hairline: {
    hex: "#D1CCB8",
    rgb: [209, 204, 184] as [number, number, number],
  },
  /** Blanc (texte sur bandeau sapin). */
  white: { hex: "#FFFFFF", rgb: [255, 255, 255] as [number, number, number] },
  /** Status — succès. */
  success: { hex: "#2D7A4F", rgb: [45, 122, 79] as [number, number, number] },
  /** Status — danger. */
  danger: { hex: "#E5483D", rgb: [229, 72, 61] as [number, number, number] },
  /** Status — warning. */
  warning: { hex: "#D97706", rgb: [217, 119, 6] as [number, number, number] },
  /** Fond ambre doux (encadrés warning). */
  warningSoft: {
    hex: "#FEF3E2",
    rgb: [254, 243, 226] as [number, number, number],
  },
  /** Fond vert doux (encadrés OK). */
  successSoft: {
    hex: "#E8F5EE",
    rgb: [232, 245, 238] as [number, number, number],
  },
} as const;

// ─── Police ─────────────────────────────────────────────────────────────
/** Nom de la police enregistrée dans jsPDF (ou fallback). */
export const FONT = {
  /** Family à passer à `doc.setFont(FONT.family, "normal" | "bold")`. */
  family: "PlusJakarta",
  /** Family de secours si l'embed échoue. */
  fallback: "helvetica",
} as const;

/** WeakSet des docs ayant déjà des fonts enregistrées (évite le double-embed). */
const fontsRegistered = new WeakSet<object>();
/** WeakSet des docs où l'embed a ÉCHOUÉ → on force le fallback Helvetica. */
const fontFallback = new WeakSet<object>();

/**
 * Enregistre Plus Jakarta Sans (Regular + Bold) dans un doc jsPDF via VFS.
 * Idempotent (no-op si déjà fait sur ce doc). Si l'embed échoue, marque le
 * doc en fallback : `setBrandFont` utilisera alors Helvetica.
 *
 * Appelée automatiquement par `createBrandDoc` ; exportée pour les routes
 * qui instancient leur propre jsPDF.
 */
export function registerBrandFonts(doc: jsPDF): void {
  if (fontsRegistered.has(doc) || fontFallback.has(doc)) return;
  try {
    const d = doc as any;
    d.addFileToVFS("PlusJakartaSans-Regular.ttf", PLUS_JAKARTA_REGULAR_B64);
    d.addFont("PlusJakartaSans-Regular.ttf", FONT.family, "normal");
    d.addFileToVFS("PlusJakartaSans-Bold.ttf", PLUS_JAKARTA_BOLD_B64);
    d.addFont("PlusJakartaSans-Bold.ttf", FONT.family, "bold");
    fontsRegistered.add(doc);
  } catch (e) {
    console.warn(
      "[pdf/brand] embed Plus Jakarta échoué, fallback Helvetica:",
      e,
    );
    fontFallback.add(doc);
  }
}

/**
 * Sélectionne la police brand (ou Helvetica si l'embed a échoué) avec le
 * style demandé. À utiliser PARTOUT à la place de `doc.setFont` pour rester
 * robuste : `setBrandFont(doc, "bold")`.
 */
export function setBrandFont(
  doc: jsPDF,
  style: "normal" | "bold" = "normal",
): void {
  const family = fontFallback.has(doc) ? FONT.fallback : FONT.family;
  doc.setFont(family, style);
}

/**
 * Crée un doc jsPDF A4 (mm) avec les fonts brand déjà enregistrées et la
 * police par défaut posée. Point d'entrée recommandé pour tout nouveau doc.
 *
 * @param opts.orientation "portrait" (défaut) | "landscape"
 */
export function createBrandDoc(
  jsPDFCtor: new (...args: any[]) => jsPDF,
  opts: { orientation?: "portrait" | "landscape" } = {},
): jsPDF {
  const doc = new jsPDFCtor({
    unit: "mm",
    format: "a4",
    orientation: opts.orientation ?? "portrait",
  });
  registerBrandFonts(doc);
  setBrandFont(doc, "normal");
  return doc;
}

// ─── Formatters ─────────────────────────────────────────────────────────
/**
 * Formate des CENTIMES en montant € français : `123456` → `"1 234,56 €"`.
 * Utilise un espace insécable fine avant le symbole (rendu propre en PDF).
 *
 * @param cents montant en centimes (entier). NaN/null → "0,00 €".
 */
export function formatEur(cents: number | null | undefined): string {
  const c = Number.isFinite(cents as number) ? (cents as number) : 0;
  return formatEurFromUnits(c / 100);
}

/**
 * Variante quand on a déjà un montant en EUROS (float), pas en centimes.
 * `1234.56` → `"1 234,56 €"`.
 */
export function formatEurFromUnits(euros: number | null | undefined): string {
  const v = Number.isFinite(euros as number) ? (euros as number) : 0;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

/**
 * Formate une date en FR court : `"11/05/2026"`. Accepte un ISO (date ou
 * datetime) ou un objet Date. Entrée vide/invalide → "—".
 */
export function formatDateFr(input: string | Date | null | undefined): string {
  const d = toDate(input);
  if (!d) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
}

/**
 * Date longue FR : `"11 mai 2026"`. Pour les en-têtes de doc.
 */
export function formatDateLongFr(
  input: string | Date | null | undefined,
): string {
  const d = toDate(input);
  if (!d) return "—";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
}

/**
 * Date + heure FR (timezone Paris) : `"11/05/2026 14:32"`. Pour les
 * horodatages d'émission / signature.
 */
export function formatDateTimeFr(
  input: string | Date | null | undefined,
): string {
  const d = toDate(input);
  if (!d) return "—";
  return d.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDate(input: string | Date | null | undefined): Date | null {
  if (!input) return null;
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  // Une date nue "YYYY-MM-DD" est interprétée minuit local sinon UTC drift.
  const iso = input.length === 10 ? input + "T00:00:00" : input;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

// ─── Identité légale K & A FOOD ─────────────────────────────────────────
/** Bloc d'identité légale réutilisé dans header + footer. */
export const ENTITE = {
  enseigne: "SALAMARKET",
  raisonSociale: "K & A FOOD",
  siret: "802 773 812",
  adresse: "8 av. Larrieu-Thibaud, 31100 Toulouse",
  tva: "FR 00 802 773 812",
} as const;

// ─── Helpers de dessin ──────────────────────────────────────────────────
/** Trace un filet fin horizontal (couleur hairline par défaut). */
export function hairline(
  doc: jsPDF,
  x1: number,
  y: number,
  x2: number,
  rgb: [number, number, number] = PALETTE.hairline.rgb,
): void {
  doc.setLineWidth(0.2);
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  doc.line(x1, y, x2, y);
}

/** Pose une couleur de texte depuis un tuple RGB. */
export function setInk(
  doc: jsPDF,
  rgb: [number, number, number] = PALETTE.ink.rgb,
): void {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

/**
 * Dessine le logo "S" or (pastille ronde sapin foncé bordée or + lettre).
 * Centré sur (cx, cy), rayon r. Utilisé dans le header ; exporté pour le
 * certificat halal qui peut vouloir un sceau plus grand.
 */
export function drawLogoMark(
  doc: jsPDF,
  cx: number,
  cy: number,
  r: number,
): void {
  // Disque sapin très foncé
  doc.setFillColor(8, 25, 18);
  doc.circle(cx, cy, r, "F");
  // Anneau or
  doc.setLineWidth(0.6);
  doc.setDrawColor(...PALETTE.gold.rgb);
  doc.circle(cx, cy, r, "S");
  // Lettre "S" or, centrée optiquement
  setBrandFont(doc, "bold");
  doc.setFontSize(r * 3.0);
  doc.setTextColor(...PALETTE.gold.rgb);
  doc.text("S", cx, cy + r * 0.62, { align: "center" });
}

// ─── HEADER ─────────────────────────────────────────────────────────────
export interface HeaderOptions {
  /** Titre du document (ex. "Bon de réception", "Certificat Halal"). */
  titre: string;
  /** Sous-titre optionnel (ex. mois, n° de doc, fournisseur). */
  sousTitre?: string;
  /** Référence affichée en haut à droite (ex. "N° BR-2026-014"). */
  reference?: string;
  /**
   * Méta haut-droite secondaire (ex. "Émis le 11/05/2026 14:32"). Si omis,
   * on affiche automatiquement la date+heure courante "Émis le …".
   */
  meta?: string;
  /** Masque la date d'émission auto (si meta gère déjà l'horodatage). */
  noEmisLe?: boolean;
}

/**
 * Dessine le bandeau d'en-tête brand : rectangle sapin plein pleine largeur
 * (~28 mm), logo "S" or à gauche, "SALAMARKET" + titre du doc, et bloc méta
 * (référence / date d'émission) aligné à droite.
 *
 * @returns Y (mm) du début recommandé pour le corps du document. À utiliser
 *   comme point de départ : `let y = drawHeader(doc, {...});`
 */
export function drawHeader(doc: jsPDF, opts: HeaderOptions): number {
  registerBrandFonts(doc);

  // Bandeau sapin plein largeur
  doc.setFillColor(...PALETTE.sapin.rgb);
  doc.rect(0, 0, PAGE_W, HEADER_H, "F");

  // Liseré or fin en bas du bandeau (signature premium)
  doc.setFillColor(...PALETTE.gold.rgb);
  doc.rect(0, HEADER_H, PAGE_W, 0.8, "F");

  // Logo "S" or à gauche
  const logoR = 6;
  const logoCx = MARGIN + logoR;
  const logoCy = HEADER_H / 2;
  drawLogoMark(doc, logoCx, logoCy, logoR);

  // Enseigne + titre, à droite du logo
  const textX = logoCx + logoR + 6;
  setBrandFont(doc, "bold");
  doc.setFontSize(15);
  doc.setTextColor(...PALETTE.white.rgb);
  doc.text(ENTITE.enseigne, textX, HEADER_H / 2 - 2.5);

  setBrandFont(doc, "normal");
  doc.setFontSize(10);
  doc.setTextColor(...PALETTE.goldBright.rgb);
  doc.text(opts.titre, textX, HEADER_H / 2 + 4);

  if (opts.sousTitre) {
    setBrandFont(doc, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...PALETTE.cream.rgb);
    doc.text(opts.sousTitre, textX, HEADER_H / 2 + 8.5);
  }

  // Bloc méta à droite (référence + émission)
  const rightX = PAGE_W - MARGIN;
  let metaY = 9;
  if (opts.reference) {
    setBrandFont(doc, "bold");
    doc.setFontSize(10);
    doc.setTextColor(...PALETTE.white.rgb);
    doc.text(opts.reference, rightX, metaY, { align: "right" });
    metaY += 5;
  }
  const metaLine =
    opts.meta ??
    (opts.noEmisLe ? undefined : `Émis le ${formatDateTimeFr(new Date())}`);
  if (metaLine) {
    setBrandFont(doc, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...PALETTE.cream.rgb);
    doc.text(metaLine, rightX, metaY, { align: "right" });
  }

  // Reset couleur texte pour le corps
  setInk(doc);
  return BODY_TOP;
}

/**
 * Titre de section dans le corps (sapin clair, gras). Trace le label et,
 * optionnellement, un filet sous le titre. Retourne le Y après le titre.
 */
export function drawSectionTitle(
  doc: jsPDF,
  x: number,
  y: number,
  label: string,
  opts: { rule?: boolean; width?: number; size?: number } = {},
): number {
  setBrandFont(doc, "bold");
  doc.setFontSize(opts.size ?? 11);
  doc.setTextColor(...PALETTE.sapinLight.rgb);
  doc.text(label.toUpperCase(), x, y);
  setInk(doc);
  let ny = y + 2;
  if (opts.rule) {
    ny += 1;
    hairline(doc, x, ny, x + (opts.width ?? CONTENT_W));
    ny += 4;
  }
  return ny;
}

// ─── FOOTER ─────────────────────────────────────────────────────────────
export interface FooterOptions {
  /** Numéro de page courant (1-based). Si fourni avec `total`, pagine. */
  page?: number;
  /** Nombre total de pages. */
  total?: number;
  /**
   * Mention spécifique au doc (ex. "Document non fiscal au sens NF525.").
   * Affichée au-dessus de la ligne légale.
   */
  mentionFiscale?: string;
}

/**
 * Dessine le footer légal complet en bas de la page COURANTE : filet or fin,
 * mention fiscale optionnelle, ligne légale K & A FOOD (raison sociale, SIRET,
 * adresse, TVA) et pagination "Page X / Y" si fournie.
 *
 * Appeler une fois par page (idéalement via {@link drawFooterAllPages} en fin
 * de génération pour paginer automatiquement).
 */
export function drawFooter(doc: jsPDF, opts: FooterOptions = {}): void {
  const baseY = PAGE_H - 14;

  // Filet or fin
  doc.setLineWidth(0.4);
  doc.setDrawColor(...PALETTE.gold.rgb);
  doc.line(MARGIN, baseY, PAGE_W - MARGIN, baseY);

  let y = baseY + 4;
  if (opts.mentionFiscale) {
    setBrandFont(doc, "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...PALETTE.muted.rgb);
    doc.text(opts.mentionFiscale, PAGE_W / 2, y, { align: "center" });
    y += 3.4;
  }

  // Ligne légale
  setBrandFont(doc, "normal");
  doc.setFontSize(6.8);
  doc.setTextColor(...PALETTE.muted.rgb);
  const legal = `${ENTITE.enseigne} — ${ENTITE.raisonSociale} · SIRET ${ENTITE.siret} · ${ENTITE.adresse} · TVA ${ENTITE.tva}`;
  doc.text(legal, PAGE_W / 2, y, { align: "center" });

  // Pagination
  if (opts.page && opts.total) {
    doc.setFontSize(6.8);
    doc.setTextColor(...PALETTE.muted.rgb);
    doc.text(`Page ${opts.page} / ${opts.total}`, PAGE_W - MARGIN, y, {
      align: "right",
    });
  }
  setInk(doc);
}

/**
 * Applique {@link drawFooter} sur TOUTES les pages du doc avec pagination
 * automatique. À appeler en toute fin de génération, juste avant `output()`.
 */
export function drawFooterAllPages(
  doc: jsPDF,
  opts: Omit<FooterOptions, "page" | "total"> = {},
): void {
  const total = (doc as any).getNumberOfPages() as number;
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    drawFooter(doc, { ...opts, page: p, total });
  }
}
