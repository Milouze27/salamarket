// Admin : table des commandes Pro, filtrable par statut + compte.
// Actions :
//  - "a_valider" → "validee" (avec mention si TTC > 500€)
//  - "livree"    → "facturee" (le trigger DB génère facture_numero)
//  - changement de statut générique (préparation, expédition, etc.)

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, ExternalLink, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  useAdminCommandesPro,
  ADMIN_COMMANDES_KEY,
  ADMIN_FACTURES_KEY,
} from "@/hooks/useProAdmin";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatEur } from "@/lib/format";
import {
  LABEL_STATUT_COMMANDE,
  STATUTS_COMMANDE_PRO,
  colorStatutCommande,
  type CommandeProAvecCompte,
  type StatutCommandePro,
} from "@/types/pro";

const SEUIL_VALIDATION_MANAGER = 500;

export default function AdminCommandesPro() {
  const { commandes, isLoading, isError } = useAdminCommandesPro();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [statutFilter, setStatutFilter] = useState<StatutCommandePro | "all">(
    "all",
  );
  const [compteFilter, setCompteFilter] = useState<string | "all">("all");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return commandes.filter((c) => {
      if (statutFilter !== "all" && c.statut !== statutFilter) return false;
      if (compteFilter !== "all" && c.compte_pro_id !== compteFilter) return false;
      return true;
    });
  }, [commandes, statutFilter, compteFilter]);

  // Comptes uniques pour le filtre
  const comptesOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of commandes) {
      if (c.comptes_pro) {
        map.set(c.compte_pro_id, c.comptes_pro.raison_sociale);
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [commandes]);

  const updateStatut = async (
    commande: CommandeProAvecCompte,
    statut: StatutCommandePro,
    extras: Record<string, string | null> = {},
  ) => {
    setPendingId(commande.id);
    try {
      const { error } = await supabase
        .from("commandes_pro")
        .update({ statut, ...extras })
        .eq("id", commande.id);
      if (error) throw error;
      toast.success(
        `Commande ${commande.numero_commande ?? commande.id.slice(0, 8)} → ${LABEL_STATUT_COMMANDE[statut]}`,
      );
      await queryClient.invalidateQueries({ queryKey: ADMIN_COMMANDES_KEY });
      await queryClient.invalidateQueries({ queryKey: ADMIN_FACTURES_KEY });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Échec : ${msg}`);
    } finally {
      setPendingId(null);
    }
  };

  const onValider = (c: CommandeProAvecCompte) => {
    if (!user) return;
    void updateStatut(c, "validee", {
      validee_par_profile_id: user.id,
      validee_at: new Date().toISOString(),
    });
  };

  const onPasserStatut = (
    c: CommandeProAvecCompte,
    nouveau: StatutCommandePro,
  ) => {
    void updateStatut(c, nouveau);
  };

  return (
    <div className="min-h-dvh bg-cream">
      <header className="bg-sapin text-white border-b border-gold/30">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <span className="text-xs uppercase tracking-widest text-gold-bright font-semibold">
            Admin Pro
          </span>
          <h1 className="text-2xl font-bold mt-1">Commandes Pro</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtres</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <Select
              value={statutFilter}
              onValueChange={(v) =>
                setStatutFilter(v as StatutCommandePro | "all")
              }
            >
              <SelectTrigger className="sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                {STATUTS_COMMANDE_PRO.map((s) => (
                  <SelectItem key={s} value={s}>
                    {LABEL_STATUT_COMMANDE[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={compteFilter}
              onValueChange={(v) => setCompteFilter(v)}
            >
              <SelectTrigger className="sm:w-[280px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous comptes</SelectItem>
                {comptesOptions.map(([id, label]) => (
                  <SelectItem key={id} value={id}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isLoading ? "…" : `${filtered.length} commande(s)`}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : isError ? (
              <div className="p-6 text-center text-red-700">
                Erreur lors du chargement des commandes.
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-ink-soft">
                Aucune commande ne correspond.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>N°</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead className="hidden md:table-cell">Date</TableHead>
                      <TableHead className="text-right">TTC</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">
                          {c.numero_commande ?? c.id.slice(0, 8)}
                          {c.facture_numero && (
                            <div className="text-gold-text font-semibold">
                              {c.facture_numero}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">
                            {c.comptes_pro?.raison_sociale ?? "—"}
                          </div>
                          <div className="text-xs text-ink-soft">
                            {c.comptes_pro?.siret}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {formatDate(c.date_commande)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="font-semibold">
                            {formatEur(c.montant_ttc)}
                          </div>
                          {c.statut === "a_valider" &&
                            c.montant_ttc > SEUIL_VALIDATION_MANAGER && (
                              <div className="flex items-center justify-end gap-1 text-[10px] text-gold-text mt-1">
                                <AlertCircle size={11} aria-hidden />
                                Manager
                              </div>
                            )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={colorStatutCommande(c.statut)}>
                            {LABEL_STATUT_COMMANDE[c.statut as StatutCommandePro] ??
                              c.statut}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <CommandeActions
                            commande={c}
                            pending={pendingId === c.id}
                            onValider={onValider}
                            onPasserStatut={onPasserStatut}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
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

// ─────────────────────────────────────────────────────────────────────
// Actions par ligne
// ─────────────────────────────────────────────────────────────────────

interface ActionsProps {
  commande: CommandeProAvecCompte;
  pending: boolean;
  onValider: (c: CommandeProAvecCompte) => void;
  onPasserStatut: (c: CommandeProAvecCompte, s: StatutCommandePro) => void;
}

const NEXT_STATUS: Partial<Record<StatutCommandePro, StatutCommandePro>> = {
  validee: "en_preparation",
  en_preparation: "expediee",
  expediee: "livree",
  livree: "facturee",
  facturee: "payee",
};

const LABEL_NEXT: Partial<Record<StatutCommandePro, string>> = {
  validee: "En préparation",
  en_preparation: "Expédier",
  expediee: "Marquer livrée",
  livree: "Passer en facturée",
  facturee: "Marquer payée",
};

const CommandeActions = ({
  commande,
  pending,
  onValider,
  onPasserStatut,
}: ActionsProps) => {
  if (pending) {
    return <Loader2 className="animate-spin inline-block" size={16} aria-hidden />;
  }

  const statut = commande.statut as StatutCommandePro;

  return (
    <div className="flex items-center justify-end gap-2 flex-wrap">
      <Link to={`/pro/commande/${commande.id}`} aria-label="Voir le détail">
        <Button size="sm" variant="outline">
          <ExternalLink size={14} aria-hidden />
        </Button>
      </Link>
      {statut === "a_valider" && (
        <Button
          size="sm"
          onClick={() => onValider(commande)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          Valider
        </Button>
      )}
      {NEXT_STATUS[statut] && (
        <Button
          size="sm"
          onClick={() => onPasserStatut(commande, NEXT_STATUS[statut]!)}
          className="bg-sapin hover:bg-sapin-deep text-white"
        >
          {LABEL_NEXT[statut]}
        </Button>
      )}
      {statut !== "annulee" &&
        statut !== "payee" &&
        statut !== "facturee" &&
        statut !== "livree" && (
          <Button
            size="sm"
            variant="ghost"
            className="text-red-700 hover:bg-red-50"
            onClick={() => onPasserStatut(commande, "annulee")}
          >
            Annuler
          </Button>
        )}
    </div>
  );
};
