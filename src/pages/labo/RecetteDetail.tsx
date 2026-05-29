import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Clock, Euro, Factory, ListOrdered, ScrollText } from "lucide-react";
import { toast } from "sonner";

import { LaboShell } from "@/components/labo/LaboShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";

import {
  useRecette,
  computeCoutMatieresTheorique,
  computeCoutMainOeuvreTheorique,
} from "@/hooks/useRecette";
import { useCreateProduction } from "@/hooks/useProductions";
import { useAuth } from "@/hooks/useAuth";
import { formatEur, formatQty } from "@/lib/format";

export default function RecetteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, isLoading, error } = useRecette(id);
  const createProd = useCreateProduction();

  const coutMatieres = useMemo(
    () => (data ? computeCoutMatieresTheorique(data.ingredients) : 0),
    [data],
  );
  const coutMainOeuvre = useMemo(
    () => (data ? computeCoutMainOeuvreTheorique(data.main_oeuvre) : 0),
    [data],
  );
  const coutTotal = coutMatieres + coutMainOeuvre;

  const handleLancerProduction = async () => {
    if (!data?.recette) return;
    try {
      const lotNumero = `L-${Date.now().toString().slice(-8)}`;
      const created = await createProd.mutateAsync({
        recette_id: data.recette.id,
        lot_numero: lotNumero,
        date_production: new Date().toISOString().slice(0, 10),
        statut: "en_cours",
        employe_responsable_id: user?.id ?? null,
      });
      toast.success(`Production ${lotNumero} créée`);
      navigate(`/v2/labo/productions/nouvelle?id=${created.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Impossible de lancer la production : ${msg}`);
    }
  };

  if (isLoading) {
    return (
      <LaboShell title="Recette">
        <div className="space-y-4">
          <Skeleton className="h-10 w-2/3 bg-white" />
          <Skeleton className="h-32 bg-white" />
          <Skeleton className="h-48 bg-white" />
        </div>
      </LaboShell>
    );
  }

  if (error || !data) {
    return (
      <LaboShell title="Recette">
        <Alert variant="destructive">
          <AlertDescription>
            {error instanceof Error ? error.message : "Recette introuvable."}
          </AlertDescription>
        </Alert>
        <Button asChild className="mt-6">
          <Link to="/v2/labo/recettes">Retour à la liste</Link>
        </Button>
      </LaboShell>
    );
  }

  const { recette, ingredients, etapes, main_oeuvre } = data;

  return (
    <LaboShell title={recette.nom}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-2xl font-bold text-[#0E3B2E] truncate">
              {recette.nom}
            </h2>
            <Badge variant={recette.statut === "active" ? "default" : "outline"}>
              {recette.statut}
            </Badge>
          </div>
          {recette.categorie && (
            <p className="text-xs uppercase tracking-wide text-[#0E3B2E]/50">
              {recette.categorie} <span className="ml-2">v{recette.version}</span>
            </p>
          )}
          {recette.notes && (
            <p className="text-sm text-[#0E3B2E]/80 mt-3 max-w-2xl whitespace-pre-wrap">
              {recette.notes}
            </p>
          )}
        </div>
        <Button
          onClick={handleLancerProduction}
          disabled={createProd.isPending}
          className="bg-[#0E3B2E] hover:bg-[#0E3B2E]/90 whitespace-nowrap"
        >
          <Factory className="mr-2 h-4 w-4" aria-hidden />
          {createProd.isPending ? "Création…" : "Lancer une production"}
          <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
        </Button>
      </div>

      {/* Coûts théoriques (3 cards — la marge unitaire dépendait de
          recettes.prix_vente_ttc_unitaire qui n'existe pas en DB ; la
          marge réelle est calculée par production via v_productions_kpi) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <CostCard
          label="Matières"
          value={coutMatieres}
          icon={Euro}
          accent="emerald"
        />
        <CostCard
          label="Main d'œuvre"
          value={coutMainOeuvre}
          icon={Clock}
          accent="amber"
        />
        <CostCard
          label="Coût total théorique"
          value={coutTotal}
          icon={Euro}
          accent="primary"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ingrédients */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold text-[#0E3B2E] flex items-center gap-2">
              <ScrollText className="h-4 w-4" aria-hidden />
              Ingrédients ({ingredients.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ingredients.length === 0 ? (
              <p className="text-sm text-[#0E3B2E]/60">
                Aucun ingrédient renseigné.
              </p>
            ) : (
              <ul className="divide-y divide-[#0E3B2E]/8">
                {ingredients.map((ing) => (
                  <li
                    key={ing.id}
                    className="py-2 flex items-center justify-between gap-3"
                  >
                    <span className="text-sm text-[#0E3B2E] truncate">
                      {ing.produit?.name ??
                        ing.ingredient_libre ??
                        "Ingrédient inconnu"}
                      {ing.produit == null && ing.ingredient_libre && (
                        <span className="ml-2 text-[10px] uppercase text-[#0E3B2E]/40 font-bold">
                          libre
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-[#0E3B2E]/70 whitespace-nowrap">
                      {formatQty(ing.quantite)} {ing.unite}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Étapes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold text-[#0E3B2E] flex items-center gap-2">
              <ListOrdered className="h-4 w-4" aria-hidden />
              Étapes ({etapes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {etapes.length === 0 ? (
              <p className="text-sm text-[#0E3B2E]/60">
                Aucune étape renseignée.
              </p>
            ) : (
              <ol className="space-y-2">
                {etapes.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-start gap-3 text-sm text-[#0E3B2E]"
                  >
                    <span className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#0E3B2E] text-white text-xs font-bold">
                      {e.ordre}
                    </span>
                    <span className="flex-1 leading-relaxed">
                      {e.description}
                      {(e.duree_minutes != null ||
                        e.temperature_celsius != null) && (
                        <span className="ml-2 text-[#0E3B2E]/50 text-xs">
                          {e.duree_minutes != null && `${e.duree_minutes} min`}
                          {e.duree_minutes != null &&
                            e.temperature_celsius != null &&
                            " · "}
                          {e.temperature_celsius != null &&
                            `${e.temperature_celsius}°C`}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* Main d'œuvre */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-[#0E3B2E] flex items-center gap-2">
              <Clock className="h-4 w-4" aria-hidden />
              Main d'œuvre ({main_oeuvre.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {main_oeuvre.length === 0 ? (
              <p className="text-sm text-[#0E3B2E]/60">
                Aucune ligne de main d'œuvre.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-[#0E3B2E]/50 border-b border-[#0E3B2E]/10">
                  <tr>
                    <th className="text-left py-2 font-medium">Poste</th>
                    <th className="text-right py-2 font-medium">Durée</th>
                    <th className="text-right py-2 font-medium">Taux horaire</th>
                    <th className="text-right py-2 font-medium">Coût</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0E3B2E]/8">
                  {main_oeuvre.map((mo) => {
                    const cost = (mo.duree_minutes / 60) * mo.taux_horaire_charge;
                    return (
                      <tr key={mo.id}>
                        <td className="py-2 text-[#0E3B2E]">{mo.poste}</td>
                        <td className="py-2 text-right text-[#0E3B2E]/70">
                          {mo.duree_minutes} min
                        </td>
                        <td className="py-2 text-right text-[#0E3B2E]/70">
                          {formatEur(mo.taux_horaire_charge)} / h
                        </td>
                        <td className="py-2 text-right font-medium text-[#0E3B2E]">
                          {formatEur(cost)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </LaboShell>
  );
}

interface CostCardProps {
  label: string;
  value: number;
  subtitle?: string;
  icon: typeof Euro;
  accent: "emerald" | "amber" | "primary" | "red" | "muted";
}

const ACCENT_CLASSES: Record<CostCardProps["accent"], string> = {
  emerald: "text-emerald-700 bg-emerald-50",
  amber: "text-amber-700 bg-amber-50",
  primary: "text-[#0E3B2E] bg-[#0E3B2E]/8",
  red: "text-red-700 bg-red-50",
  muted: "text-[#0E3B2E]/60 bg-[#0E3B2E]/5",
};

const CostCard = ({ label, value, subtitle, icon: Icon, accent }: CostCardProps) => (
  <Card>
    <CardContent className="p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className={
            "inline-flex items-center justify-center w-6 h-6 rounded-full " +
            ACCENT_CLASSES[accent]
          }
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="text-xs uppercase tracking-wider text-[#0E3B2E]/60">
          {label}
        </span>
      </div>
      <div className="text-xl font-bold text-[#0E3B2E]">{formatEur(value)}</div>
      {subtitle && (
        <div className="text-xs text-[#0E3B2E]/50 mt-1">{subtitle}</div>
      )}
    </CardContent>
  </Card>
);
