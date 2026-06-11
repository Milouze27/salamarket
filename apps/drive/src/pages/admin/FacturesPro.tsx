// Admin : liste des factures émises (commandes_pro avec facture_numero
// non null). Actions :
//  - "Marquer payée" : passe à "payee" et fixe date_paiement = now()
//  - "Relancer" : mailto: avec l'email du délégué + ref facture

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bell, CheckCircle2, FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";

import {
  ADMIN_COMMANDES_KEY,
  ADMIN_FACTURES_KEY,
  useAdminFacturesPro,
} from "@/hooks/useProAdmin";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatEur } from "@/lib/format";
import type { CommandeProAvecCompte } from "@/types/pro";

type StatutFilter = "all" | "due" | "en_retard" | "payee";

function joursDeRetard(commande: CommandeProAvecCompte): number | null {
  if (commande.statut === "payee" || commande.date_paiement) return null;
  if (!commande.date_echeance) return null;
  const echeance = new Date(commande.date_echeance);
  if (Number.isNaN(echeance.getTime())) return null;
  const today = new Date();
  const diff = Math.floor(
    (today.getTime() - echeance.getTime()) / (24 * 60 * 60 * 1000),
  );
  return diff > 0 ? diff : 0;
}

export default function AdminFacturesPro() {
  const { factures, isLoading, isError } = useAdminFacturesPro();
  const queryClient = useQueryClient();
  const [statutFilter, setStatutFilter] = useState<StatutFilter>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return factures.filter((f) => {
      const retard = joursDeRetard(f);
      const isPayee = f.statut === "payee" || !!f.date_paiement;
      if (statutFilter === "payee") return isPayee;
      if (statutFilter === "en_retard")
        return !isPayee && retard !== null && retard > 0;
      if (statutFilter === "due") return !isPayee;
      return true;
    });
  }, [factures, statutFilter]);

  const marquerPayee = async (f: CommandeProAvecCompte) => {
    setPendingId(f.id);
    try {
      const { error } = await supabase
        .from("commandes_pro")
        .update({
          statut: "payee",
          date_paiement: new Date().toISOString(),
        })
        .eq("id", f.id);
      if (error) throw error;
      toast.success(`Facture ${f.facture_numero ?? ""} marquée payée.`);
      await queryClient.invalidateQueries({ queryKey: ADMIN_FACTURES_KEY });
      await queryClient.invalidateQueries({ queryKey: ADMIN_COMMANDES_KEY });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Échec : ${msg}`);
    } finally {
      setPendingId(null);
    }
  };

  const onRelancer = (f: CommandeProAvecCompte) => {
    const email = f.comptes_pro?.delegue_email;
    if (!email) {
      toast.error(
        "Aucun email de contact sur ce compte Pro — impossible de relancer.",
      );
      return;
    }
    const ref = f.facture_numero ?? f.numero_commande ?? "";
    const echeance = f.date_echeance
      ? formatDate(f.date_echeance)
      : "à réception";
    const sujet = encodeURIComponent(`Relance facture ${ref} — Salam Market`);
    const corps = encodeURIComponent(
      `Bonjour ${f.comptes_pro?.delegue_nom ?? ""},\n\n` +
        `Sauf erreur de notre part, la facture ${ref} d'un montant de ` +
        `${formatEur(f.montant_ttc ?? 0)} TTC (échéance ${echeance}) reste à régler.\n\n` +
        `Merci de procéder au paiement ou de nous indiquer la date prévue.\n\n` +
        `Cordialement,\nK & A FOOD — Salam Market`,
    );
    // Ouvre le client mail prérempli (destinataire = délégué du compte Pro).
    window.location.href = `mailto:${email}?subject=${sujet}&body=${corps}`;
    toast.success(
      `Relance ouverte pour ${f.comptes_pro?.raison_sociale ?? ""}`,
    );
  };

  return (
    <div className="min-h-dvh bg-cream">
      <header className="bg-sapin text-white border-b border-gold/30">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <span className="text-xs uppercase tracking-widest text-gold-bright font-semibold">
            Admin Pro
          </span>
          <h1 className="text-2xl font-bold mt-1">Factures Pro</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtres</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={statutFilter}
              onValueChange={(v) => setStatutFilter(v as StatutFilter)}
            >
              <SelectTrigger className="sm:w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les factures</SelectItem>
                <SelectItem value="due">À régler</SelectItem>
                <SelectItem value="en_retard">En retard</SelectItem>
                <SelectItem value="payee">Payées</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText size={18} aria-hidden />
              {isLoading ? "…" : `${filtered.length} facture(s)`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : isError ? (
              <div className="p-6 text-center text-red-700">
                Erreur lors du chargement.
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-ink-soft">
                Aucune facture ne correspond.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N° facture</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead className="text-right">TTC</TableHead>
                      <TableHead className="hidden md:table-cell">
                        Date
                      </TableHead>
                      <TableHead className="hidden md:table-cell">
                        Échéance
                      </TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((f) => {
                      const retard = joursDeRetard(f);
                      const isPayee = f.statut === "payee" || !!f.date_paiement;
                      return (
                        <TableRow key={f.id}>
                          <TableCell className="font-mono text-xs text-gold-text font-semibold">
                            {f.facture_numero}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">
                              {f.comptes_pro?.raison_sociale ?? "—"}
                            </div>
                            <div className="text-xs text-ink-soft">
                              {f.comptes_pro?.siret}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatEur(f.montant_ttc)}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {formatDate(f.date_commande)}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {f.date_echeance
                              ? formatDate(f.date_echeance)
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {isPayee ? (
                              <Badge className="bg-emerald-600 hover:bg-emerald-600">
                                Payée
                                {f.date_paiement && (
                                  <span className="ml-1 opacity-80 text-[10px]">
                                    {formatDate(f.date_paiement)}
                                  </span>
                                )}
                              </Badge>
                            ) : retard != null && retard > 0 ? (
                              <Badge variant="destructive">
                                Retard {retard}j
                              </Badge>
                            ) : (
                              <Badge variant="outline">À régler</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {pendingId === f.id ? (
                              <Loader2
                                size={16}
                                className="animate-spin inline-block"
                                aria-hidden
                              />
                            ) : (
                              <div className="flex justify-end gap-2 flex-wrap">
                                {!isPayee && (
                                  <Button
                                    size="sm"
                                    onClick={() => marquerPayee(f)}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                  >
                                    <CheckCircle2
                                      size={14}
                                      className="mr-1"
                                      aria-hidden
                                    />
                                    Payée
                                  </Button>
                                )}
                                {!isPayee && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => onRelancer(f)}
                                  >
                                    <Bell
                                      size={14}
                                      className="mr-1"
                                      aria-hidden
                                    />
                                    Relancer
                                  </Button>
                                )}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
