// Liste des factures (= commandes_pro avec facture_numero non null) du
// compte connecté. Pour télécharger un PDF, on doit charger les lignes
// au moment du clic — sinon on fait N×K appels au mount, inutile.
//
// Filtres client-side (pas de table factures dédiée → les factures SONT
// les commandes_pro facturées/payées) : recherche par numéro
// (commande/facture), statut (payée / en attente / en retard), plage de
// dates sur la date de commande, et export CSV du jeu filtré.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  Search,
  X,
} from "lucide-react";

import { ProShell } from "@/components/pro/ProShell";
import { ProCompteActifGuard } from "@/components/pro/ProCompteActifGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { InvoicePDFDownloadLink } from "@/components/pro/InvoicePDF";

// ─────────────────────────────────────────────────────────────────────
// Statut « paiement » dérivé (≠ statut DB brut) : payée / retard / attente
// ─────────────────────────────────────────────────────────────────────

type StatutPaiement = "payee" | "retard" | "attente";

/** Une facture est en retard si non payée et l'échéance est dépassée. */
function isEnRetard(facture: CommandePro, now: Date): boolean {
  if (facture.statut === "payee" || facture.date_paiement) return false;
  if (!facture.date_echeance) return false;
  const echeance = new Date(facture.date_echeance);
  if (Number.isNaN(echeance.getTime())) return false;
  // Comparaison à la journée près (l'échéance est une date, pas un instant).
  const ech = new Date(
    echeance.getFullYear(),
    echeance.getMonth(),
    echeance.getDate(),
  );
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return today > ech;
}

function statutPaiement(facture: CommandePro, now: Date): StatutPaiement {
  if (facture.statut === "payee" || facture.date_paiement) return "payee";
  if (isEnRetard(facture, now)) return "retard";
  return "attente";
}

function statutBadge(statut: StatutPaiement) {
  switch (statut) {
    case "payee":
      return (
        <Badge className="bg-emerald-600 hover:bg-emerald-600">Payée</Badge>
      );
    case "retard":
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle size={12} aria-hidden />
          En retard
        </Badge>
      );
    case "attente":
      return <Badge variant="outline">En attente</Badge>;
  }
}

const LABEL_STATUT_PAIEMENT: Record<StatutPaiement | "tous", string> = {
  tous: "Tous les statuts",
  payee: "Payée",
  attente: "En attente",
  retard: "En retard",
};

// ─────────────────────────────────────────────────────────────────────
// Export CSV (côté client, jeu filtré). Format compatible Excel FR :
// séparateur « ; », BOM UTF-8, montants en virgule décimale.
// ─────────────────────────────────────────────────────────────────────

function csvCell(value: string): string {
  // Échappe guillemets et entoure dès qu'il y a séparateur / saut de ligne.
  const needsQuote = /[";\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : escaped;
}

function montantCsv(value: number | null | undefined): string {
  return (value ?? 0).toFixed(2).replace(".", ",");
}

function dateCsv(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR");
}

function exportCsv(factures: CommandePro[], now: Date) {
  const header = [
    "Numero facture",
    "Numero commande",
    "Date",
    "Montant TTC (EUR)",
    "Statut",
    "Echeance",
    "Date paiement",
  ];
  const rows = factures.map((f) => [
    f.facture_numero ?? "",
    f.numero_commande ?? "",
    dateCsv(f.date_commande),
    montantCsv(f.montant_ttc),
    LABEL_STATUT_PAIEMENT[statutPaiement(f, now)],
    dateCsv(f.date_echeance),
    dateCsv(f.date_paiement),
  ]);

  const content = [header, ...rows]
    .map((cols) => cols.map(csvCell).join(";"))
    .join("\r\n");

  // BOM pour qu'Excel détecte l'UTF-8 (accents).
  const blob = new Blob(["﻿" + content], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `factures-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────
// Sous-composant : ligne de tableau avec téléchargement à la demande
// ─────────────────────────────────────────────────────────────────────

interface RowProps {
  facture: CommandePro;
  compte: NonNullable<ReturnType<typeof useComptePro>["compte"]>;
  statut: StatutPaiement;
}

const FactureRow = ({ facture, compte, statut }: RowProps) => {
  const [lignes, setLignes] = useState<LigneAvecProduit[] | null>(null);
  const [loading, setLoading] = useState(false);

  const loadLignes = async () => {
    if (lignes !== null) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("commandes_pro_lignes")
        .select(`*, products:produit_id (id, name, image_url, unit)`)
        .eq("commande_pro_id", facture.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      setLignes((data ?? []) as LigneAvecProduit[]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <TableRow className={statut === "retard" ? "bg-destructive/5" : undefined}>
      <TableCell className="font-medium">
        {facture.facture_numero ?? facture.numero_commande ?? "·"}
      </TableCell>
      <TableCell className="hidden sm:table-cell tabular-nums">
        {formatDate(facture.date_commande) || "·"}
      </TableCell>
      <TableCell className="hidden md:table-cell tabular-nums">
        {facture.date_echeance ? formatDate(facture.date_echeance) : "·"}
      </TableCell>
      <TableCell className="text-right font-semibold tabular-nums">
        {formatEur(facture.montant_ttc)}
      </TableCell>
      <TableCell>{statutBadge(statut)}</TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <Link to={`/pro/commande/${facture.id}`}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[44px] min-w-[44px]"
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
              className="min-h-[44px] bg-sapin hover:bg-sapin-deep"
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
              className="inline-flex min-h-[44px] items-center gap-1 px-3 rounded-md bg-gold text-sapin-deep text-sm font-medium hover:bg-gold-bright transition-colors"
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

  const [search, setSearch] = useState("");
  const [statutFiltre, setStatutFiltre] = useState<StatutPaiement | "tous">(
    "tous",
  );
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");

  // « now » figé pour la durée du rendu (cohérence retard / export).
  const now = useMemo(() => new Date(), []);

  const facturesFiltrees = useMemo(() => {
    const q = search.trim().toLowerCase();
    const debut = dateDebut ? new Date(dateDebut + "T00:00:00") : null;
    const fin = dateFin ? new Date(dateFin + "T23:59:59") : null;

    return factures.filter((f) => {
      if (q) {
        const num = (f.facture_numero ?? "").toLowerCase();
        const cmd = (f.numero_commande ?? "").toLowerCase();
        if (!num.includes(q) && !cmd.includes(q)) return false;
      }
      if (statutFiltre !== "tous" && statutPaiement(f, now) !== statutFiltre) {
        return false;
      }
      if (debut || fin) {
        const d = new Date(f.date_commande);
        if (Number.isNaN(d.getTime())) return false;
        if (debut && d < debut) return false;
        if (fin && d > fin) return false;
      }
      return true;
    });
  }, [factures, search, statutFiltre, dateDebut, dateFin, now]);

  const totalFiltre = useMemo(
    () => facturesFiltrees.reduce((sum, f) => sum + (f.montant_ttc ?? 0), 0),
    [facturesFiltrees],
  );
  const nbEnRetard = useMemo(
    () =>
      facturesFiltrees.filter((f) => statutPaiement(f, now) === "retard")
        .length,
    [facturesFiltrees, now],
  );

  const hasFilters =
    search.trim() !== "" ||
    statutFiltre !== "tous" ||
    dateDebut !== "" ||
    dateFin !== "";

  const resetFilters = () => {
    setSearch("");
    setStatutFiltre("tous");
    setDateDebut("");
    setDateFin("");
  };

  return (
    <ProShell title="Factures">
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText size={18} aria-hidden />
              Mes factures
            </CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-[44px]"
              onClick={() => exportCsv(facturesFiltrees, now)}
              disabled={facturesFiltrees.length === 0}
            >
              <FileSpreadsheet size={16} aria-hidden className="mr-1.5" />
              Exporter CSV
            </Button>
          </div>

          {/* Barre de filtres */}
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative sm:col-span-2 lg:col-span-1">
                <Search
                  size={16}
                  aria-hidden
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
                <Input
                  type="search"
                  inputMode="search"
                  placeholder="N° facture ou commande"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  aria-label="Rechercher par numéro"
                />
              </div>

              <Select
                value={statutFiltre}
                onValueChange={(v) =>
                  setStatutFiltre(v as StatutPaiement | "tous")
                }
              >
                <SelectTrigger
                  className="min-h-[44px]"
                  aria-label="Filtrer par statut"
                >
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tous">
                    {LABEL_STATUT_PAIEMENT.tous}
                  </SelectItem>
                  <SelectItem value="payee">
                    {LABEL_STATUT_PAIEMENT.payee}
                  </SelectItem>
                  <SelectItem value="attente">
                    {LABEL_STATUT_PAIEMENT.attente}
                  </SelectItem>
                  <SelectItem value="retard">
                    {LABEL_STATUT_PAIEMENT.retard}
                  </SelectItem>
                </SelectContent>
              </Select>

              <Input
                type="date"
                value={dateDebut}
                max={dateFin || undefined}
                onChange={(e) => setDateDebut(e.target.value)}
                aria-label="Date de début"
              />
              <Input
                type="date"
                value={dateFin}
                min={dateDebut || undefined}
                onChange={(e) => setDateFin(e.target.value)}
                aria-label="Date de fin"
              />
            </div>

            {/* Récap + reset */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>
                <span className="font-medium text-foreground tabular-nums">
                  {facturesFiltrees.length}
                </span>{" "}
                facture{facturesFiltrees.length > 1 ? "s" : ""}
              </span>
              <span className="tabular-nums">
                Total · {formatEur(totalFiltre)}
              </span>
              {nbEnRetard > 0 && (
                <span className="flex items-center gap-1 text-destructive font-medium">
                  <AlertTriangle size={14} aria-hidden />
                  <span className="tabular-nums">{nbEnRetard}</span> en retard
                </span>
              )}
              {hasFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 ml-auto"
                  onClick={resetFilters}
                >
                  <X size={14} aria-hidden className="mr-1" />
                  Réinitialiser
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-6 text-center text-destructive">
              Erreur lors du chargement des factures.
            </div>
          ) : factures.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <FileText
                size={32}
                aria-hidden
                className="mx-auto mb-3 opacity-40"
              />
              <p className="font-medium text-foreground">
                Aucune facture pour le moment
              </p>
              <p className="text-sm mt-1">
                Vos factures apparaîtront ici une fois vos commandes facturées.
              </p>
            </div>
          ) : facturesFiltrees.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Search
                size={32}
                aria-hidden
                className="mx-auto mb-3 opacity-40"
              />
              <p className="font-medium text-foreground">
                Aucune facture ne correspond
              </p>
              <p className="text-sm mt-1">
                Ajustez la recherche ou les filtres.
              </p>
              {hasFilters && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4 min-h-[44px]"
                  onClick={resetFilters}
                >
                  Réinitialiser les filtres
                </Button>
              )}
            </div>
          ) : compte ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° facture</TableHead>
                    <TableHead className="hidden sm:table-cell">Date</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Échéance
                    </TableHead>
                    <TableHead className="text-right">Total TTC</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {facturesFiltrees.map((f) => (
                    <FactureRow
                      key={f.id}
                      facture={f}
                      compte={compte}
                      statut={statutPaiement(f, now)}
                    />
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
