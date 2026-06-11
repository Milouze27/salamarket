// Admin : table des comptes Pro, filtrable par statut + recherche.
// Actions :
//  - Valider (en_validation → actif, fixe valide_par + valide_at)
//  - Rejeter (en_validation → archive)
//  - Suspendre / Réactiver pour les autres états

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";

import { useAdminComptesPro, ADMIN_COMPTES_KEY } from "@/hooks/useProAdmin";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, formatEur } from "@/lib/format";
import {
  LABEL_STATUT_COMPTE,
  STATUTS_COMPTE_PRO,
  type ComptePro,
  type StatutComptePro,
} from "@/types/pro";

// ─────────────────────────────────────────────────────────────────────
// Helpers UI
// ─────────────────────────────────────────────────────────────────────

const variantForStatut = (
  statut: string,
): "default" | "secondary" | "destructive" | "outline" => {
  switch (statut) {
    case "actif":
      return "default";
    case "en_validation":
      return "secondary";
    case "suspendu":
      return "destructive";
    case "archive":
    default:
      return "outline";
  }
};

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

export default function AdminComptesPro() {
  const { comptes, isLoading, isError } = useAdminComptesPro();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [statutFilter, setStatutFilter] = useState<StatutComptePro | "all">(
    "all",
  );
  const [search, setSearch] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return comptes.filter((c) => {
      if (statutFilter !== "all" && c.statut !== statutFilter) return false;
      if (q) {
        if (
          !c.raison_sociale.toLowerCase().includes(q) &&
          !c.siret.includes(q.replace(/\s/g, ""))
        ) {
          return false;
        }
      }
      return true;
    });
  }, [comptes, search, statutFilter]);

  const updateStatut = async (
    compte: ComptePro,
    nouveauStatut: StatutComptePro,
    extras: Record<string, string | null> = {},
  ) => {
    setPendingId(compte.id);
    try {
      const { error } = await supabase
        .from("comptes_pro")
        .update({ statut: nouveauStatut, ...extras })
        .eq("id", compte.id);
      if (error) throw error;
      toast.success(
        `Compte "${compte.raison_sociale}" → ${LABEL_STATUT_COMPTE[nouveauStatut]}`,
      );
      await queryClient.invalidateQueries({ queryKey: ADMIN_COMPTES_KEY });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Échec : ${msg}`);
    } finally {
      setPendingId(null);
    }
  };

  const onValider = (compte: ComptePro) => {
    if (!user) return;
    void updateStatut(compte, "actif", {
      valide_par_profile_id: user.id,
      valide_at: new Date().toISOString(),
    });
  };

  const onRejeter = (compte: ComptePro) => {
    void updateStatut(compte, "archive");
  };

  const onSuspendre = (compte: ComptePro) => {
    void updateStatut(compte, "suspendu");
  };

  const onReactiver = (compte: ComptePro) => {
    if (!user) return;
    void updateStatut(compte, "actif", {
      valide_par_profile_id: user.id,
      valide_at: new Date().toISOString(),
    });
  };

  return (
    <div className="min-h-dvh bg-cream">
      <header className="bg-sapin text-white border-b border-gold/30">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <span className="text-xs uppercase tracking-widest text-gold-bright font-semibold">
            Admin Pro
          </span>
          <h1 className="text-2xl font-bold mt-1">Comptes Pro</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtres</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
                aria-hidden
              />
              <Input
                type="search"
                placeholder="Recherche raison sociale ou SIRET…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={statutFilter}
              onValueChange={(v) => setStatutFilter(v as StatutComptePro | "all")}
            >
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                {STATUTS_COMPTE_PRO.map((s) => (
                  <SelectItem key={s} value={s}>
                    {LABEL_STATUT_COMPTE[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isLoading ? "…" : `${filtered.length} compte(s)`}
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
                Aucun compte ne correspond.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Raison sociale</TableHead>
                      <TableHead className="hidden sm:table-cell">SIRET</TableHead>
                      <TableHead className="hidden md:table-cell">Délégué</TableHead>
                      <TableHead className="hidden lg:table-cell">Encours</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">
                          <div>{c.raison_sociale}</div>
                          <div className="text-xs text-ink-soft sm:hidden">
                            SIRET {c.siret}
                          </div>
                          <div className="text-xs text-ink-soft">
                            Inscrit le {formatDate(c.created_at)}
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell font-mono text-xs">
                          {c.siret}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="text-sm">{c.delegue_nom}</div>
                          <div className="text-xs text-ink-soft">
                            {c.delegue_email}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm">
                          {formatEur(c.encours_actuel)} / {formatEur(c.encours_max)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={variantForStatut(c.statut)}>
                            {LABEL_STATUT_COMPTE[c.statut as StatutComptePro] ??
                              c.statut}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <CompteActions
                            compte={c}
                            pending={pendingId === c.id}
                            onValider={onValider}
                            onRejeter={onRejeter}
                            onSuspendre={onSuspendre}
                            onReactiver={onReactiver}
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
// Actions par ligne (avec confirmation pour rejet/suspension)
// ─────────────────────────────────────────────────────────────────────

interface ActionsProps {
  compte: ComptePro;
  pending: boolean;
  onValider: (c: ComptePro) => void;
  onRejeter: (c: ComptePro) => void;
  onSuspendre: (c: ComptePro) => void;
  onReactiver: (c: ComptePro) => void;
}

const CompteActions = ({
  compte,
  pending,
  onValider,
  onRejeter,
  onSuspendre,
  onReactiver,
}: ActionsProps) => {
  if (pending) {
    return <Loader2 className="animate-spin inline-block" size={16} aria-hidden />;
  }

  if (compte.statut === "en_validation") {
    return (
      <div className="flex justify-end gap-2 flex-wrap">
        <Button
          size="sm"
          onClick={() => onValider(compte)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          Valider
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline">
              Rejeter
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Rejeter ce compte ?</AlertDialogTitle>
              <AlertDialogDescription>
                Le compte « {compte.raison_sociale} » sera archivé. Cette action
                peut être inversée en passant le statut manuellement.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={() => onRejeter(compte)}>
                Confirmer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  if (compte.statut === "actif") {
    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="outline">
            Suspendre
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspendre ce compte ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le délégué ne pourra plus passer de commande. Vous pourrez
              réactiver à tout moment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => onSuspendre(compte)}>
              Suspendre
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  if (compte.statut === "suspendu" || compte.statut === "archive") {
    return (
      <Button
        size="sm"
        onClick={() => onReactiver(compte)}
        className="bg-emerald-600 hover:bg-emerald-700 text-white"
      >
        Réactiver
      </Button>
    );
  }

  return null;
};
