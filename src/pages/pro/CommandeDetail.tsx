// Détail d'une commande Pro côté délégué.
// Affiche en-tête (numéro, statut, dates, montants), lignes, et un
// bouton "Télécharger la facture" si facture_numero est non null.

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
  type StatutCommandePro,
} from "@/types/pro";
import { InvoicePDFDownloadLink } from "@/components/pro/InvoicePDF";

function statutLabel(statut: string): string {
  return LABEL_STATUT_COMMANDE[statut as StatutCommandePro] ?? statut;
}

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
  const canDownload = !!commande.facture_numero && !!compte;

  return (
    <ProShell title={commande.numero_commande ?? "Commande"} showBack>
      <div className="space-y-6">
        {/* En-tête */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="text-lg text-slate-900">
                  {commande.numero_commande ?? "Commande sans numéro"}
                </CardTitle>
                <p className="text-sm text-slate-500 mt-1">
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
              <div className="text-sm rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-slate-700">
                <span className="font-medium">Notes :</span>{" "}
                {commande.notes_client}
              </div>
            )}
            {canDownload && compte && (
              <div className="pt-2">
                <InvoicePDFDownloadLink
                  commande={commande}
                  lignes={lignes}
                  compte={compte}
                  className="inline-flex items-center gap-2 px-4 h-10 rounded-md bg-amber-500 text-slate-900 font-medium hover:bg-amber-400 transition-colors"
                >
                  <FileText size={16} aria-hidden />
                  Télécharger la facture (PDF)
                </InvoicePDFDownloadLink>
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
            <div className="divide-y divide-slate-100">
              {lignes.map((l) => (
                <div key={l.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="w-12 h-12 rounded bg-slate-100 overflow-hidden shrink-0">
                    {l.products?.image_url && (
                      <img
                        src={l.products.image_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-900 text-sm">
                      {l.products?.name ?? "Produit supprimé"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {l.quantite_conditionnements} ×{" "}
                      {l.quantite_par_conditionnement} {l.products?.unit ?? ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold text-slate-900">
                      {formatEur(l.prix_ht_total)} HT
                    </div>
                    <div className="text-xs text-slate-500">
                      {formatEur(l.prix_ht_unitaire)} / cond.
                    </div>
                  </div>
                </div>
              ))}
              {lignes.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-slate-500">
                  Aucune ligne sur cette commande.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Récap montants */}
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between text-sm text-slate-700">
              <span>Total HT</span>
              <span className="font-medium">{formatEur(commande.montant_ht)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-700">
              <span>TVA</span>
              <span>{formatEur(commande.montant_tva)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-bold text-slate-900">
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
    <dt className="text-xs uppercase text-slate-500 tracking-wide">{label}</dt>
    <dd className="text-sm font-medium text-slate-900 mt-0.5">{value}</dd>
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
