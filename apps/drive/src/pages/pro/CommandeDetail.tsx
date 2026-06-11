// Détail d'une commande Pro côté délégué.
// Affiche en-tête (numéro, statut, dates, montants), lignes, et :
//  - un bouton "Télécharger la facture" si facture_numero est non null ;
//  - un bouton "Télécharger le bon de commande" disponible AVANT
//    facturation (tant qu'il y a des lignes), pour que le Pro ait une
//    pièce imprimable dès la passation de commande.
//
// Le bon de commande est un document distinct de la facture (titre,
// mentions et numéro différents) : on ne réutilise donc pas tel quel
// InvoicePDF (qui imprimerait "Facture N° —"), mais un layout équivalent
// dédié, isolé dans le même pattern lazy / code-split que la facture.

import { lazy, Suspense, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { Loader2, FileText } from "lucide-react";

import { ProShell } from "@/components/pro/ProShell";
import { ProCompteActifGuard } from "@/components/pro/ProCompteActifGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

import { useCommandeProDetail } from "@/hooks/useCommandesPro";
import { useComptePro } from "@/hooks/useComptePro";
import { formatEur, formatDate, formatDateTime } from "@/lib/format";
import {
  LABEL_STATUT_COMMANDE,
  colorStatutCommande,
  type CommandePro,
  type ComptePro,
  type LigneAvecProduit,
  type StatutCommandePro,
} from "@/types/pro";
import { InvoicePDFDownloadLink } from "@/components/pro/InvoicePDF";

function statutLabel(statut: string): string {
  return LABEL_STATUT_COMMANDE[statut as StatutCommandePro] ?? statut;
}

// ─────────────────────────────────────────────────────────────────────
// Bon de commande PDF — layout équivalent à la facture, mais sémantique
// "commande" (pas de N° facture ni de mentions de pénalités de retard).
//
// PERF : comme InvoicePDF, tout le code qui touche @react-pdf/renderer
// vit dans cette factory async → Vite émet un chunk séparé, chargé
// uniquement au 1er rendu du lien (clic "Bon de commande").
//
// NOTE tokens : @react-pdf/renderer ne lit pas le CSS du DOM (ni brand.ts
// ni Tailwind) → on duplique ici les tokens de marque Salam Market plutôt
// que des gris génériques hors palette, comme InvoicePDF.
//   sapin #0E3B2E · encre #0F1A14 · gris texte #5A6470 · bordure #E8E4D8
// ─────────────────────────────────────────────────────────────────────

const PDF_INK = "#0F1A14";
const PDF_GRAY = "#5A6470";
const PDF_BORDER = "#E8E4D8";
const PDF_SAPIN = "#0E3B2E";

interface BonCommandeProps {
  commande: CommandePro;
  lignes: LigneAvecProduit[];
  compte: Pick<
    ComptePro,
    "raison_sociale" | "siret" | "adresse_facturation" | "tva_intracom"
  >;
}

interface BonCommandeLinkProps extends BonCommandeProps {
  className?: string;
  children?: ReactNode;
}

const pdfEur = (value: number | null | undefined): string => {
  const v = value ?? 0;
  return `${v
    .toFixed(2)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ")} EUR`;
};

const pdfDate = (value: string | null | undefined): string => {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("fr-FR");
};

async function loadBonCommandeModule() {
  const { Document, Page, StyleSheet, Text, View, PDFDownloadLink } =
    await import("@react-pdf/renderer");

  const styles = StyleSheet.create({
    page: {
      padding: 40,
      fontSize: 10,
      fontFamily: "Helvetica",
      color: PDF_INK,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 24,
      borderBottom: `1pt solid ${PDF_INK}`,
      paddingBottom: 12,
    },
    brand: { fontSize: 18, fontWeight: "bold", color: PDF_SAPIN },
    brandSub: { fontSize: 9, color: PDF_GRAY, marginTop: 2 },
    docMeta: { textAlign: "right" },
    docTitle: { fontSize: 14, fontWeight: "bold" },
    docMetaLine: { fontSize: 9, marginTop: 2 },
    twoCols: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 20,
      gap: 20,
    },
    block: {
      flex: 1,
      padding: 10,
      border: `1pt solid ${PDF_BORDER}`,
      borderRadius: 4,
    },
    blockTitle: {
      fontSize: 9,
      textTransform: "uppercase",
      color: PDF_GRAY,
      marginBottom: 4,
      letterSpacing: 0.5,
    },
    blockLine: { fontSize: 10, marginBottom: 2 },
    table: { width: "100%", marginTop: 8, marginBottom: 12 },
    tableHeader: {
      flexDirection: "row",
      backgroundColor: PDF_SAPIN,
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
      borderBottom: `1pt solid ${PDF_BORDER}`,
      fontSize: 9,
    },
    colProduit: { width: "52%" },
    colQty: { width: "14%", textAlign: "right" },
    colPu: { width: "16%", textAlign: "right" },
    colTotal: { width: "18%", textAlign: "right" },
    totalsBlock: {
      marginTop: 12,
      marginLeft: "auto",
      width: "50%",
      border: `1pt solid ${PDF_BORDER}`,
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
      borderTop: `1pt solid ${PDF_INK}`,
      fontWeight: "bold",
      fontSize: 12,
    },
    footer: {
      position: "absolute",
      bottom: 30,
      left: 40,
      right: 40,
      fontSize: 8,
      color: PDF_GRAY,
      borderTop: `1pt solid ${PDF_BORDER}`,
      paddingTop: 8,
    },
  });

  const BonCommandePDF = ({ commande, lignes, compte }: BonCommandeProps) => (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>Salam Market</Text>
            <Text style={styles.brandSub}>
              K & A FOOD - 8 av. Larrieu-Thibaud, 31100 Toulouse
            </Text>
            <Text style={styles.brandSub}>
              SIRET 802 773 812 · TVA FR00802773812
            </Text>
          </View>
          <View style={styles.docMeta}>
            <Text style={styles.docTitle}>
              Bon de commande N° {commande.numero_commande ?? "-"}
            </Text>
            <Text style={styles.docMetaLine}>
              Date : {pdfDate(commande.date_commande)}
            </Text>
            {commande.ref_interne ? (
              <Text style={styles.docMetaLine}>
                Votre réf. : {commande.ref_interne}
              </Text>
            ) : null}
            {commande.date_livraison_souhaitee ? (
              <Text style={styles.docMetaLine}>
                Livraison souhaitée :{" "}
                {pdfDate(commande.date_livraison_souhaitee)}
              </Text>
            ) : null}
            <Text style={styles.docMetaLine}>
              Statut :{" "}
              {LABEL_STATUT_COMMANDE[commande.statut as StatutCommandePro] ??
                commande.statut}
            </Text>
          </View>
        </View>

        <View style={styles.twoCols}>
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Client</Text>
            <Text style={styles.blockLine}>{compte.raison_sociale}</Text>
            <Text style={styles.blockLine}>SIRET : {compte.siret}</Text>
            {compte.tva_intracom ? (
              <Text style={styles.blockLine}>
                TVA intracom : {compte.tva_intracom}
              </Text>
            ) : null}
            <Text style={styles.blockLine}>{compte.adresse_facturation}</Text>
          </View>
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Récapitulatif</Text>
            <Text style={styles.blockLine}>Articles : {lignes.length}</Text>
            {commande.mode_paiement ? (
              <Text style={styles.blockLine}>
                Paiement : {commande.mode_paiement}
              </Text>
            ) : null}
            {commande.date_echeance ? (
              <Text style={styles.blockLine}>
                Échéance : {pdfDate(commande.date_echeance)}
              </Text>
            ) : null}
            {commande.notes_client ? (
              <Text style={styles.blockLine}>
                Note : {commande.notes_client}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colProduit}>Produit</Text>
            <Text style={styles.colQty}>Qté</Text>
            <Text style={styles.colPu}>PU HT</Text>
            <Text style={styles.colTotal}>Total HT</Text>
          </View>
          {lignes.map((l) => (
            <View key={l.id} style={styles.tableRow}>
              <Text style={styles.colProduit}>
                {l.products?.name ?? "Produit supprimé"}
              </Text>
              <Text style={styles.colQty}>
                {l.quantite_conditionnements} × {l.quantite_par_conditionnement}
              </Text>
              <Text style={styles.colPu}>{pdfEur(l.prix_ht_unitaire)}</Text>
              <Text style={styles.colTotal}>{pdfEur(l.prix_ht_total)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalRow}>
            <Text>Total HT</Text>
            <Text>{pdfEur(commande.montant_ht)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>TVA</Text>
            <Text>{pdfEur(commande.montant_tva)}</Text>
          </View>
          <View style={styles.totalRowFinal}>
            <Text>Total TTC</Text>
            <Text>{pdfEur(commande.montant_ttc)}</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text>
            Document non contractuel valant bon de commande. La facture
            définitive sera émise après préparation et livraison.
          </Text>
        </View>
      </Page>
    </Document>
  );

  const BonCommandeLink = ({
    commande,
    lignes,
    compte,
    className,
    children,
  }: BonCommandeLinkProps) => (
    <PDFDownloadLink
      document={
        <BonCommandePDF commande={commande} lignes={lignes} compte={compte} />
      }
      fileName={`bon-commande-${commande.numero_commande ?? commande.id}.pdf`}
      className={className}
    >
      {({ loading }) =>
        loading ? "Préparation du PDF…" : (children ?? "Bon de commande (PDF)")
      }
    </PDFDownloadLink>
  );

  return { default: BonCommandeLink };
}

const LazyBonCommandeLink = lazy(loadBonCommandeModule);

const BonCommandeDownloadLink = (props: BonCommandeLinkProps) => (
  <Suspense
    fallback={
      <span className={props.className} aria-busy="true">
        Préparation du PDF…
      </span>
    }
  >
    <LazyBonCommandeLink {...props} />
  </Suspense>
);

function CommandeDetailInner() {
  const { id } = useParams<{ id: string }>();
  const { detail, isLoading, isError } = useCommandeProDetail(id);
  const { compte } = useComptePro();

  if (isLoading) {
    return (
      <ProShell title="Commande" showBack>
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </ProShell>
    );
  }

  if (isError || !detail) {
    return (
      <ProShell title="Commande" showBack>
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-6 text-center">
          Commande introuvable ou inaccessible.
        </div>
      </ProShell>
    );
  }

  const { commande, lignes } = detail;
  const variant = colorStatutCommande(commande.statut);
  const canDownloadFacture = !!commande.facture_numero && !!compte;
  // Le bon de commande est dispo dès qu'il y a un compte + des lignes,
  // y compris AVANT facturation (statut a_valider/validee/…).
  const canDownloadBon = !!compte && lignes.length > 0;

  return (
    <ProShell title={commande.numero_commande ?? "Commande"} showBack>
      <div className="space-y-6">
        {/* En-tête */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-lg text-ink">
                  {commande.numero_commande ?? "Commande sans numéro"}
                </CardTitle>
                <p className="text-sm text-ink-soft mt-1">
                  Passée le {formatDateTime(commande.date_commande)}
                </p>
              </div>
              <Badge variant={variant} className="text-sm">
                {statutLabel(commande.statut)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {commande.date_livraison_souhaitee && (
                <Info
                  label="Livraison souhaitée"
                  value={formatDate(commande.date_livraison_souhaitee)}
                />
              )}
              {commande.date_echeance && (
                <Info
                  label="Échéance facture"
                  value={formatDate(commande.date_echeance)}
                />
              )}
              {commande.mode_paiement && (
                <Info label="Paiement" value={commande.mode_paiement} />
              )}
              {commande.facture_numero && (
                <Info label="Facture" value={commande.facture_numero} />
              )}
            </div>
            {commande.notes_client && (
              <div className="text-sm rounded-md bg-cream border border-line px-3 py-2 text-ink-soft">
                <span className="font-medium">Notes :</span>{" "}
                {commande.notes_client}
              </div>
            )}
            {(canDownloadFacture || canDownloadBon) && compte && (
              <div className="pt-2 flex flex-wrap gap-2">
                {canDownloadFacture && (
                  <InvoicePDFDownloadLink
                    commande={commande}
                    lignes={lignes}
                    compte={compte}
                    className="inline-flex min-h-[44px] items-center gap-2 px-4 rounded-md bg-gold text-sapin-deep font-medium hover:bg-gold-bright transition-colors"
                  >
                    <FileText size={16} aria-hidden />
                    Télécharger la facture (PDF)
                  </InvoicePDFDownloadLink>
                )}
                {canDownloadBon && (
                  <BonCommandeDownloadLink
                    commande={commande}
                    lignes={lignes}
                    compte={compte}
                    className="inline-flex min-h-[44px] items-center gap-2 px-4 rounded-md border border-line-medium bg-white text-ink font-medium hover:bg-cream transition-colors"
                  >
                    <FileText size={16} aria-hidden />
                    Télécharger le bon de commande
                  </BonCommandeDownloadLink>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lignes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lignes de commande</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-line">
              {lignes.map((l) => (
                <div key={l.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="w-12 h-12 rounded bg-cream-200 overflow-hidden shrink-0">
                    {l.products?.image_url && (
                      <img
                        src={l.products.image_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-ink text-sm">
                      {l.products?.name ?? "Produit supprimé"}
                    </div>
                    <div className="text-xs text-ink-soft">
                      {l.quantite_conditionnements} ×{" "}
                      {l.quantite_par_conditionnement} {l.products?.unit ?? ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-ink">
                      {formatEur(l.prix_ht_total)} HT
                    </div>
                    <div className="text-xs text-ink-soft">
                      {formatEur(l.prix_ht_unitaire)} / cond.
                    </div>
                  </div>
                </div>
              ))}
              {lignes.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-ink-soft">
                  Aucune ligne sur cette commande.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Récap montants */}
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-sm text-ink-soft">
              <span>Total HT</span>
              <span className="font-medium">
                {formatEur(commande.montant_ht)}
              </span>
            </div>
            <div className="flex justify-between text-sm text-ink-soft">
              <span>TVA</span>
              <span>{formatEur(commande.montant_tva)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-bold text-ink">
              <span>Total TTC</span>
              <span>{formatEur(commande.montant_ttc)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </ProShell>
  );
}

const Info = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-xs uppercase text-ink-soft tracking-wide">{label}</dt>
    <dd className="text-sm font-medium text-ink mt-0.5">{value}</dd>
  </div>
);

export default function CommandeDetailPro() {
  // Suspense fallback in Loader2 is unused; we display the spinner inside.
  void Loader2;
  return (
    <ProCompteActifGuard>
      <CommandeDetailInner />
    </ProCompteActifGuard>
  );
}
