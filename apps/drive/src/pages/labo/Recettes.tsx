import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { subDays } from "date-fns";

import { LaboShell } from "@/components/labo/LaboShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { useRecettes } from "@/hooks/useRecettes";
import { useProductionsKpi, aggregateKpiByRecette } from "@/hooks/useProductionsKpi";
import { formatPercent } from "@/lib/format";

const STATUT_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  active: "default",
  brouillon: "outline",
  archivee: "secondary",
};

export default function RecettesPage() {
  const [query, setQuery] = useState("");

  const { data: recettes, isLoading: loadingRecettes } = useRecettes();

  // KPI 30 derniers jours pour la marge moyenne par recette
  const dateFrom = useMemo(
    () => subDays(new Date(), 30).toISOString().slice(0, 10),
    [],
  );
  const { data: kpis } = useProductionsKpi({ dateFrom });

  const margeByRecette = useMemo(() => {
    if (!kpis) return new Map<string, number | null>();
    const agg = aggregateKpiByRecette(kpis);
    return new Map(agg.map((r) => [r.recette, r.marge_pct_moy]));
  }, [kpis]);

  const filteredRecettes = useMemo(() => {
    if (!recettes) return [];
    if (!query.trim()) return recettes;
    const q = query.toLowerCase();
    return recettes.filter(
      (r) =>
        r.nom.toLowerCase().includes(q) ||
        (r.categorie?.toLowerCase().includes(q) ?? false),
    );
  }, [recettes, query]);

  return (
    <LaboShell title="Recettes">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-[#0E3B2E]">Recettes</h2>
          <p className="text-sm text-[#0E3B2E]/70">
            Liste des recettes du labo. Marge moyenne sur les 30 derniers
            jours par production terminée.
          </p>
        </div>
        <Button asChild className="bg-[#0E3B2E] hover:bg-[#0E3B2E]/90">
          <Link to="/v2/labo/recettes/nouvelle">
            <Plus className="mr-2 h-4 w-4" aria-hidden />
            Nouvelle recette
          </Link>
        </Button>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#0E3B2E]/40"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher par nom ou catégorie"
          className="pl-9 bg-white"
          aria-label="Rechercher une recette"
        />
      </div>

      {loadingRecettes ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl bg-white" />
          ))}
        </div>
      ) : filteredRecettes.length === 0 ? (
        <EmptyState query={query} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRecettes.map((r) => {
            const marge = margeByRecette.get(r.nom);
            return (
              <Link
                key={r.id}
                to={`/v2/labo/recettes/${r.id}`}
                className="block group"
              >
                <Card className="h-full transition-all hover:shadow-md hover:border-[#0E3B2E]/30">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-semibold leading-tight text-[#0E3B2E] group-hover:underline">
                        {r.nom}
                      </CardTitle>
                      <Badge variant={STATUT_VARIANTS[r.statut] ?? "outline"}>
                        {r.statut}
                      </Badge>
                    </div>
                    {r.categorie && (
                      <p className="text-xs uppercase tracking-wide text-[#0E3B2E]/50 mt-1">
                        {r.categorie}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    {r.notes && (
                      <p className="text-sm text-[#0E3B2E]/70 line-clamp-2 mb-3">
                        {r.notes}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <div className="text-[#0E3B2E]/50 uppercase tracking-wider">
                          Version
                        </div>
                        <div className="font-semibold text-[#0E3B2E] mt-0.5">
                          v{r.version}
                        </div>
                      </div>
                      <div>
                        <div className="text-[#0E3B2E]/50 uppercase tracking-wider">
                          Marge moy. 30j
                        </div>
                        <div
                          className={
                            "font-semibold mt-0.5 " +
                            (marge == null
                              ? "text-[#0E3B2E]/40"
                              : marge >= 30
                                ? "text-emerald-700"
                                : marge >= 15
                                  ? "text-amber-700"
                                  : "text-red-700")
                          }
                        >
                          {marge == null ? "—" : formatPercent(marge)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </LaboShell>
  );
}

const EmptyState = ({ query }: { query: string }) => (
  <div className="text-center py-16 px-4 bg-white rounded-2xl border border-dashed border-[#0E3B2E]/20">
    <p className="text-[#0E3B2E]/70 mb-4">
      {query
        ? `Aucune recette ne correspond à "${query}".`
        : "Aucune recette pour l'instant."}
    </p>
    <Button asChild className="bg-[#0E3B2E] hover:bg-[#0E3B2E]/90">
      <Link to="/v2/labo/recettes/nouvelle">
        <Plus className="mr-2 h-4 w-4" aria-hidden />
        Créer la première recette
      </Link>
    </Button>
  </div>
);
