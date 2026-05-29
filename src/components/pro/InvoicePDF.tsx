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

import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  PDFDownloadLink,
  type DocumentProps,
} from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type {
  CommandePro,
  ComptePro,
  LigneAvecProduit,
  ConditionsPaiement,
} from "@/types/pro";
import {
  LABEL_CONDITIONS_PAIEMENT,
} from "@/types/pro";

// ─────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────
// Helpers de format (autonomes : un PDF rendu en worker peut ne pas
// avoir accès à toutes les API Intl, mais Helvetica + fr-FR locale ok)
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

// ─────────────────────────────────────────────────────────────────────
// Composant PDF
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

/**
 * Regroupe les lignes par taux de TVA pour afficher le détail TVA
 * dans le récap. Si tva_taux est null sur une ligne (théoriquement
 * comblé par le trigger DB mais on est défensifs), on fallback à 0.
 */
function tvaParTaux(lignes: LigneAvecProduit[]): Map<number, { ht: number; tva: number }> {
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

export const InvoicePDF = ({ commande, lignes, compte }: InvoicePDFProps) => {
  const decomposition = tvaParTaux(lignes);
  const conditions =
    (compte.conditions_paiement as ConditionsPaiement | undefined) ?? "comptant";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* En-tête */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>Salamarket Toulouse</Text>
            <Text style={styles.brandSub}>Boucherie & Drive — Toulouse, France</Text>
            <Text style={styles.brandSub}>SIRET à compléter — TVA FRXXXXXXXXX</Text>
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
              <Text style={styles.blockLine}>Mode : {commande.mode_paiement}</Text>
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
          <Text style={styles.footerLine}>
            IBAN : FR76 XXXX XXXX XXXX XXXX XXXX XXX — BIC : XXXXFRPPXXX
          </Text>
          <Text style={styles.footerLine}>
            TVA acquittée sur les débits. Pas d'escompte pour paiement anticipé.
          </Text>
        </View>
      </Page>
    </Document>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Lien de téléchargement wrappant PDFDownloadLink
// ─────────────────────────────────────────────────────────────────────

interface InvoicePDFDownloadLinkProps extends InvoicePDFProps {
  fileName?: string;
  className?: string;
  children?: ReactNode;
}

export const InvoicePDFDownloadLink = ({
  commande,
  lignes,
  compte,
  fileName,
  className,
  children,
}: InvoicePDFDownloadLinkProps) => {
  const computedName =
    fileName ?? `facture-${commande.facture_numero ?? commande.id}.pdf`;

  const doc: React.ReactElement<DocumentProps> = (
    <InvoicePDF commande={commande} lignes={lignes} compte={compte} />
  );

  return (
    <PDFDownloadLink document={doc} fileName={computedName} className={className}>
      {({ loading }) =>
        loading ? "Préparation du PDF…" : (children ?? "Télécharger la facture (PDF)")
      }
    </PDFDownloadLink>
  );
};
