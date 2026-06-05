// Facture PDF Drive Pro générée via @react-pdf/renderer.
//
// On reste sobre : 1 page A4, en-tête vendeur + bloc client + tableau
// lignes + récap. Pas de signature numérique : le PDF est un rendu
// fidèle de la commande facturée côté DB (qui fait foi).
//
// La logique de TVA décomposée par taux est calculée ici à partir des
// lignes (chaque ligne porte tva_taux ou NULL — dans ce dernier cas la
// DB a déjà recopié products.tva_taux, donc la valeur de la ligne est
// la source de vérité).
//
// PERF : @react-pdf/renderer (~60KB gz) ne doit PAS être chargé au mount
// de la page Factures. Tout le code qui touche la lib est isolé dans un
// import() dynamique (cf. loadPdfModule + React.lazy plus bas), de sorte
// que Vite émet un chunk séparé chargé uniquement au 1er clic "PDF".

import { lazy, Suspense, type ReactNode } from "react";
import type {
  CommandePro,
  ComptePro,
  LigneAvecProduit,
  ConditionsPaiement,
} from "@/types/pro";
import { LABEL_CONDITIONS_PAIEMENT } from "@/types/pro";

// ─────────────────────────────────────────────────────────────────────
// Coordonnées légales émetteur (K & A FOOD / enseigne Salam Market)
// ─────────────────────────────────────────────────────────────────────
//
// SIRET + TVA sont des valeurs publiques stables (CLAUDE.md / brand.ts).
// L'IBAN/BIC ne le sont PAS : on n'imprime JAMAIS un faux RIB sur une
// facture. Coordonnées bancaires lues uniquement depuis l'env, sinon la
// ligne IBAN n'apparaît pas.
//
// TODO : brancher VITE_COMPANY_IBAN (+ optionnellement VITE_COMPANY_BIC)
// dans les env Vercel quand le vrai RIB K & A FOOD est disponible.
const COMPANY_IBAN =
  (import.meta.env.VITE_COMPANY_IBAN as string | undefined)?.trim() || null;
const COMPANY_BIC =
  (import.meta.env.VITE_COMPANY_BIC as string | undefined)?.trim() || null;

// ─────────────────────────────────────────────────────────────────────
// Helpers de format (autonomes, sans dépendance à la lib PDF → restent
// en module-level, ils ne tirent rien dans le chunk principal).
// Un PDF rendu en worker peut ne pas avoir accès à toutes les API Intl,
// mais Helvetica + fr-FR locale ok.
// ─────────────────────────────────────────────────────────────────────

const fmtEur = (value: number | null | undefined): string => {
  const v = value ?? 0;
  return `${v
    .toFixed(2)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ")} EUR`;
};

const fmtPct = (value: number | null | undefined): string => {
  if (value == null) return "—";
  return `${value.toString().replace(".", ",")} %`;
};

const fmtDate = (value: string | null | undefined): string => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR");
};

/**
 * Regroupe les lignes par taux de TVA pour afficher le détail TVA
 * dans le récap. Si tva_taux est null sur une ligne (théoriquement
 * comblé par le trigger DB mais on est défensifs), on fallback à 0.
 */
function tvaParTaux(
  lignes: LigneAvecProduit[],
): Map<number, { ht: number; tva: number }> {
  const map = new Map<number, { ht: number; tva: number }>();
  for (const l of lignes) {
    const taux = l.tva_taux ?? 0;
    const ht = l.prix_ht_total;
    const tva = Math.round(ht * (taux / 100) * 100) / 100;
    const current = map.get(taux);
    if (current) {
      current.ht += ht;
      current.tva += tva;
    } else {
      map.set(taux, { ht, tva });
    }
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────
// Types publics
// ─────────────────────────────────────────────────────────────────────

export interface InvoicePDFProps {
  commande: CommandePro;
  lignes: LigneAvecProduit[];
  compte: Pick<
    ComptePro,
    | "raison_sociale"
    | "siret"
    | "adresse_facturation"
    | "tva_intracom"
    | "conditions_paiement"
  >;
}

interface InvoicePDFDownloadLinkProps extends InvoicePDFProps {
  fileName?: string;
  className?: string;
  children?: ReactNode;
}

// ─────────────────────────────────────────────────────────────────────
// Module PDF lazy — TOUT ce qui importe @react-pdf/renderer vit dans
// cette factory async. C'est elle qui crée la frontière de code-split.
// ─────────────────────────────────────────────────────────────────────

async function loadPdfModule() {
  const { Document, Page, StyleSheet, Text, View, PDFDownloadLink } =
    await import("@react-pdf/renderer");

  const styles = StyleSheet.create({
    page: {
      padding: 40,
      fontSize: 10,
      fontFamily: "Helvetica",
      color: "#111111",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 24,
      borderBottom: "1pt solid #111111",
      paddingBottom: 12,
    },
    brand: {
      fontSize: 18,
      fontWeight: "bold",
      color: "#0E3B2E",
    },
    brandSub: {
      fontSize: 9,
      color: "#444444",
      marginTop: 2,
    },
    invoiceMeta: {
      textAlign: "right",
    },
    invoiceNum: {
      fontSize: 14,
      fontWeight: "bold",
    },
    invoiceMetaLine: {
      fontSize: 9,
      marginTop: 2,
    },
    twoCols: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 20,
      gap: 20,
    },
    block: {
      flex: 1,
      padding: 10,
      border: "1pt solid #DDDDDD",
      borderRadius: 4,
    },
    blockTitle: {
      fontSize: 9,
      textTransform: "uppercase",
      color: "#666666",
      marginBottom: 4,
      letterSpacing: 0.5,
    },
    blockLine: {
      fontSize: 10,
      marginBottom: 2,
    },
    table: {
      width: "100%",
      marginTop: 8,
      marginBottom: 12,
    },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: "#0E3B2E",
      color: "#FFFFFF",
      paddingVertical: 6,
      paddingHorizontal: 6,
      fontSize: 9,
      fontWeight: "bold",
    },
    tableRow: {
      flexDirection: "row",
      paddingVertical: 5,
      paddingHorizontal: 6,
      borderBottom: "1pt solid #EEEEEE",
      fontSize: 9,
    },
    colProduit: { width: "44%" },
    colQty: { width: "12%", textAlign: "right" },
    colPu: { width: "16%", textAlign: "right" },
    colTva: { width: "10%", textAlign: "right" },
    colTotal: { width: "18%", textAlign: "right" },
    totalsBlock: {
      marginTop: 12,
      marginLeft: "auto",
      width: "50%",
      border: "1pt solid #DDDDDD",
      borderRadius: 4,
      padding: 8,
    },
    totalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 2,
    },
    totalRowFinal: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 4,
      marginTop: 4,
      borderTop: "1pt solid #111111",
      fontWeight: "bold",
      fontSize: 12,
    },
    footer: {
      position: "absolute",
      bottom: 30,
      left: 40,
      right: 40,
      fontSize: 8,
      color: "#555555",
      borderTop: "1pt solid #DDDDDD",
      paddingTop: 8,
    },
    footerLine: {
      marginBottom: 2,
    },
  });

  const InvoicePDF = ({ commande, lignes, compte }: InvoicePDFProps) => {
    const decomposition = tvaParTaux(lignes);
    const conditions =
      (compte.conditions_paiement as ConditionsPaiement | undefined) ??
      "comptant";

    return (
      <Document>
        <Page size="A4" style={styles.page}>
          {/* En-tête */}
          <View style={styles.header}>
            <View>
              <Text style={styles.brand}>Salam Market</Text>
              <Text style={styles.brandSub}>
                K & A FOOD — 8 av. Larrieu-Thibaud, 31100 Toulouse
              </Text>
              <Text style={styles.brandSub}>
                SIRET 802 773 812 · TVA FR00802773812
              </Text>
            </View>
            <View style={styles.invoiceMeta}>
              <Text style={styles.invoiceNum}>
                Facture N° {commande.facture_numero ?? "—"}
              </Text>
              <Text style={styles.invoiceMetaLine}>
                Date : {fmtDate(commande.date_commande)}
              </Text>
              {commande.date_echeance && (
                <Text style={styles.invoiceMetaLine}>
                  Échéance : {fmtDate(commande.date_echeance)}
                </Text>
              )}
              {commande.numero_commande && (
                <Text style={styles.invoiceMetaLine}>
                  Commande : {commande.numero_commande}
                </Text>
              )}
            </View>
          </View>

          {/* Bloc client */}
          <View style={styles.twoCols}>
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Facturé à</Text>
              <Text style={styles.blockLine}>{compte.raison_sociale}</Text>
              <Text style={styles.blockLine}>SIRET : {compte.siret}</Text>
              {compte.tva_intracom && (
                <Text style={styles.blockLine}>
                  TVA intracom : {compte.tva_intracom}
                </Text>
              )}
              <Text style={styles.blockLine}>{compte.adresse_facturation}</Text>
            </View>
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Conditions</Text>
              <Text style={styles.blockLine}>
                Paiement : {LABEL_CONDITIONS_PAIEMENT[conditions]}
              </Text>
              {commande.mode_paiement && (
                <Text style={styles.blockLine}>
                  Mode : {commande.mode_paiement}
                </Text>
              )}
              <Text style={styles.blockLine}>
                Statut : {commande.statut === "payee" ? "Payée" : "À régler"}
              </Text>
            </View>
          </View>

          {/* Tableau lignes */}
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={styles.colProduit}>Produit</Text>
              <Text style={styles.colQty}>Qté</Text>
              <Text style={styles.colPu}>PU HT</Text>
              <Text style={styles.colTva}>TVA</Text>
              <Text style={styles.colTotal}>Total HT</Text>
            </View>
            {lignes.map((l) => (
              <View key={l.id} style={styles.tableRow}>
                <Text style={styles.colProduit}>
                  {l.products?.name ?? "Produit supprimé"}
                </Text>
                <Text style={styles.colQty}>
                  {l.quantite_conditionnements} ×{" "}
                  {l.quantite_par_conditionnement}
                </Text>
                <Text style={styles.colPu}>{fmtEur(l.prix_ht_unitaire)}</Text>
                <Text style={styles.colTva}>{fmtPct(l.tva_taux)}</Text>
                <Text style={styles.colTotal}>{fmtEur(l.prix_ht_total)}</Text>
              </View>
            ))}
          </View>

          {/* Récap */}
          <View style={styles.totalsBlock}>
            <View style={styles.totalRow}>
              <Text>Total HT</Text>
              <Text>{fmtEur(commande.montant_ht)}</Text>
            </View>
            {Array.from(decomposition.entries()).map(([taux, { tva }]) => (
              <View key={taux} style={styles.totalRow}>
                <Text>TVA {fmtPct(taux)}</Text>
                <Text>{fmtEur(tva)}</Text>
              </View>
            ))}
            <View style={styles.totalRowFinal}>
              <Text>Total TTC</Text>
              <Text>{fmtEur(commande.montant_ttc)}</Text>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer} fixed>
            <Text style={styles.footerLine}>
              Conditions de paiement : {LABEL_CONDITIONS_PAIEMENT[conditions]}.
              Tout retard de paiement entraînera une pénalité égale à 3 fois le
              taux d'intérêt légal et une indemnité forfaitaire de 40 EUR pour
              frais de recouvrement (art. L441-10 C. com.).
            </Text>
            {/* IBAN/BIC : jamais de faux RIB sur une facture. Affiché
                uniquement si les vraies coordonnées bancaires sont
                fournies via l'env (cf. COMPANY_IBAN / TODO en tête de
                fichier). */}
            {COMPANY_IBAN && (
              <Text style={styles.footerLine}>
                IBAN : {COMPANY_IBAN}
                {COMPANY_BIC ? ` · BIC : ${COMPANY_BIC}` : ""}
              </Text>
            )}
            <Text style={styles.footerLine}>
              TVA acquittée sur les débits. Pas d'escompte pour paiement
              anticipé.
            </Text>
          </View>
        </Page>
      </Document>
    );
  };

  // Composant final exposé en `default` pour React.lazy.
  const InvoicePDFDownloadLink = ({
    commande,
    lignes,
    compte,
    fileName,
    className,
    children,
  }: InvoicePDFDownloadLinkProps) => {
    const computedName =
      fileName ?? `facture-${commande.facture_numero ?? commande.id}.pdf`;

    return (
      <PDFDownloadLink
        document={
          <InvoicePDF commande={commande} lignes={lignes} compte={compte} />
        }
        fileName={computedName}
        className={className}
      >
        {({ loading }) =>
          loading
            ? "Préparation du PDF…"
            : (children ?? "Télécharger la facture (PDF)")
        }
      </PDFDownloadLink>
    );
  };

  return { default: InvoicePDFDownloadLink };
}

// React.lazy attend un module `{ default }` — loadPdfModule le fournit.
const LazyInvoicePDFDownloadLink = lazy(loadPdfModule);

// ─────────────────────────────────────────────────────────────────────
// API publique : wrapper léger (zéro import statique de la lib PDF).
// Le chunk @react-pdf/renderer n'est fetché qu'au 1er rendu de ce
// composant, déclenché par le clic "PDF" côté page Factures.
// ─────────────────────────────────────────────────────────────────────

export const InvoicePDFDownloadLink = (props: InvoicePDFDownloadLinkProps) => {
  const { className } = props;
  return (
    <Suspense
      fallback={
        <span className={className} aria-busy="true">
          Préparation du PDF…
        </span>
      }
    >
      <LazyInvoicePDFDownloadLink {...props} />
    </Suspense>
  );
};
