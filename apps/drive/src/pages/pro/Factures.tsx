// Liste des factures (= commandes_pro avec facture_numero non null) du
// compte connecté. Pour télécharger un PDF, on doit charger les lignes
// au moment du clic — sinon on fait N×K appels au mount, inutile.

import { useState } from "react";
import { Link } from "react-router-dom";
import { Download, Eye, FileText, Loader2 } from "lucide-react";

import { ProShell } from "@/components/pro/ProShell";
import { ProCompteActifGuard } from "@/components/pro/ProCompteActifGuard";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useFacturesPro } from "@/hooks/useCommandesPro";
import { useComptePro } from "@/hooks/useComptePro";
import { supabase } from "@/integrations/supabase/client";
import { formatEur, formatDate } from "@/lib/format";
import type { CommandePro, LigneAvecProduit } from "@/types/pro";
import {
  InvoicePDFDownloadLink,
} from "@/components/pro/InvoicePDF";

function statutBadge(commande: CommandePro) {
  if (commande.statut === "payee" || commande.date_paiement) {
    return <Badge className="bg-emerald-600 hover:bg-emerald-600">Payée</Badge>;
  }
  if (commande.date_echeance) {
    const today = new Date();
    const echeance = new Date(commande.date_echeance);
    if (!Number.isNaN(echeance.getTime()) && echeance < today) {
      return <Badge variant="destructive">En retard</Badge>;
    }
  }
  return <Badge variant="outline">En attente</Badge>;
}

// ─────────────────────────────────────────────────────────────────────
// Sous-composant : ligne de tableau avec téléchargement à la demande
// ─────────────────────────────────────────────────────────────────────

interface RowProps {
  facture: CommandePro;
  compte: NonNullable<ReturnType<typeof useComptePro>["compte"]>;
}

const FactureRow = ({ facture, compte }: RowProps) => {
  const [lignes, setLignes] = useState<LigneAvecProduit[] | null>(null);
  const [loading, setLoading] = useState(false);

  const loadLignes = async () => {
    if (lignes !== null) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("commandes_pro_lignes")
        .select(
          `*, products:produit_id (id, name, image_url, unit)`,
        )
        .eq("commande_pro_id", facture.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setLignes((data ?? []) as LigneAvecProduit[]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium">
        {facture.facture_numero ?? "—"}
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        {formatDate(facture.date_commande)}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {facture.date_echeance ? formatDate(facture.date_echeance) : "—"}
      </TableCell>
      <TableCell className="text-right font-semibold">
        {formatEur(facture.montant_ttc)}
      </TableCell>
      <TableCell>{statutBadge(facture)}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <Link to={`/pro/commande/${facture.id}`}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Voir la commande"
            >
              <Eye size={14} aria-hidden />
            </Button>
          </Link>
          {lignes === null ? (
            <Button
              type="button"
              size="sm"
              onClick={loadLignes}
              disabled={loading}
              className="bg-slate-900 hover:bg-slate-800"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              ) : (
                <Download size={14} aria-hidden />
              )}
              <span className="hidden sm:inline ml-1">PDF</span>
            </Button>
          ) : (
            <InvoicePDFDownloadLink
              commande={facture}
              lignes={lignes}
              compte={compte}
              className="inline-flex items-center gap-1 px-3 h-9 rounded-md bg-amber-500 text-slate-900 text-sm font-medium hover:bg-amber-400 transition-colors"
            >
              <Download size={14} aria-hidden />
              <span className="hidden sm:inline">PDF</span>
            </InvoicePDFDownloadLink>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

function FacturesInner() {
  const { factures, isLoading, isError } = useFacturesPro();
  const { compte } = useComptePro();

  return (
    <ProShell title="Factures">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText size={18} aria-hidden />
            Mes factures
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-6 text-center text-red-700">
              Erreur lors du chargement des factures.
            </div>
          ) : factures.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              Aucune facture pour le moment.
            </div>
          ) : compte ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° facture</TableHead>
                    <TableHead className="hidden sm:table-cell">Date</TableHead>
                    <TableHead className="hidden md:table-cell">Échéance</TableHead>
                    <TableHead className="text-right">Total TTC</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {factures.map((f) => (
                    <FactureRow key={f.id} facture={f} compte={compte} />
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </ProShell>
  );
}

export default function FacturesPro() {
  return (
    <ProCompteActifGuard>
      <FacturesInner />
    </ProCompteActifGuard>
  );
}
