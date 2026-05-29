import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { subDays } from "date-fns";

import { LaboShell } from "@/components/labo/LaboShell";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import { useProductions } from "@/hooks/useProductions";
import { useRecettes } from "@/hooks/useRecettes";
import { formatDate } from "@/lib/format";

const STATUT_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  en_cours: "secondary",
  terminee: "default",
  annulee: "outline",
};

const STATUT_LABEL: Record<string, string> = {
  en_cours: "En cours",
  terminee: "Terminée",
  annulee: "Annulée",
};

const PERIOD_OPTIONS = [
  { value: "7", label: "7 derniers jours" },
  { value: "30", label: "30 derniers jours" },
  { value: "90", label: "90 derniers jours" },
  { value: "all", label: "Toutes" },
] as const;

export default function ProductionsPage() {
  const [statut, setStatut] = useState<string>("all");
  const [recetteId, setRecetteId] = useState<string>("all");
  const [period, setPeriod] = useState<string>("30");
  const [query, setQuery] = useState("");

  const dateFrom = useMemo(() => {
    if (period === "all") return undefined;
    return subDays(new Date(), parseInt(period, 10)).toISOString().slice(0, 10);
  }, [period]);

  const { data: productions, isLoading } = useProductions({
    statut: statut === "all" ? undefined : statut,
    recetteId: recetteId === "all" ? undefined : recetteId,
    dateFrom,
  });

  const { data: recettes } = useRecettes();

  const filtered = useMemo(() => {
    if (!productions) return [];
    const q = query.toLowerCase().trim();
    if (!q) return productions;
    return productions.filter(
      (p) =>
        (p.lot_numero?.toLowerCase().includes(q) ?? false) ||
        (p.recette?.nom.toLowerCase().includes(q) ?? false),
    );
  }, [productions, query]);

  return (
    <LaboShell title="Productions">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-[#0E3B2E]">Productions</h2>
          <p className="text-sm text-[#0E3B2E]/70">
            Historique des lots produits au labo.
          </p>
        </div>
        <Button asChild className="bg-[#0E3B2E] hover:bg-[#0E3B2E]/90">
          <Link to="/v2/labo/recettes">
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            Lancer depuis une recette
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher (lot, recette)…"
          className="bg-white"
          aria-label="Rechercher une production"
        />
        <Select value={statut} onValueChange={setStatut}>
          <SelectTrigger className="bg-white">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="en_cours">En cours</SelectItem>
            <SelectItem value="terminee">Terminée</SelectItem>
            <SelectItem value="annulee">Annulée</SelectItem>
          </SelectContent>
        </Select>
        <Select value={recetteId} onValueChange={setRecetteId}>
          <SelectTrigger className="bg-white">
            <SelectValue placeholder="Recette" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les recettes</SelectItem>
            {recettes?.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.nom}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="bg-white">
            <SelectValue placeholder="Période" />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl bg-white" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-[#0E3B2E]/60">
            Aucune production ne correspond aux filtres.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-[#0E3B2E]/50 border-b border-[#0E3B2E]/10 bg-[#FAF7EE]/50">
                <tr>
                  <th className="text-left py-3 px-4 font-medium">Lot</th>
                  <th className="text-left py-3 px-4 font-medium">Recette</th>
                  <th className="text-left py-3 px-4 font-medium">Date</th>
                  <th className="text-left py-3 px-4 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0E3B2E]/8">
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-[#FAF7EE]/30 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono text-[#0E3B2E]">
                      <Link
                        to={`/v2/labo/productions/${p.id}`}
                        className="hover:underline"
                      >
                        {p.lot_numero ?? "—"}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-[#0E3B2E]/90">
                      {p.recette?.nom ?? "—"}
                    </td>
                    <td className="py-3 px-4 text-[#0E3B2E]/70">
                      {formatDate(p.date_production)}
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={STATUT_VARIANTS[p.statut] ?? "outline"}>
                        {STATUT_LABEL[p.statut] ?? p.statut}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </LaboShell>
  );
}
