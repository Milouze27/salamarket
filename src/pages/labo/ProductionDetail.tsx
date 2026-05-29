import { Link, useParams } from "react-router-dom";
import { Calendar, Factory, FlaskConical, Tag, TrendingUp } from "lucide-react";

import { LaboShell } from "@/components/labo/LaboShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import { useProduction } from "@/hooks/useProductions";
import { useProductionKpi } from "@/hooks/useProductionsKpi";
import { formatEur, formatPercent, formatDate, formatQty } from "@/lib/format";

const STATUT_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  en_cours: "secondary",
  terminee: "default",
  annulee: "outline",
};

export default function ProductionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useProduction(id);
  const { data: kpi } = useProductionKpi(id);

  if (isLoading) {
    return (
      <LaboShell title="Production">
        <div className="space-y-4">
          <Skeleton className="h-12 w-2/3 bg-white" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 bg-white" />
            ))}
          </div>
          <Skeleton className="h-48 bg-white" />
        </div>
      </LaboShell>
    );
  }

  if (error || !data) {
    return (
      <LaboShell title="Production">
        <Alert variant="destructive">
          <AlertDescription>
            {error instanceof Error ? error.message : "Production introuvable."}
          </AlertDescription>
        </Alert>
        <Button asChild className="mt-4">
          <Link to="/v2/labo/productions">Retour à la liste</Link>
        </Button>
      </LaboShell>
    );
  }

  const { production, inputs, outputs, couts_indirects } = data;

  return (
    <LaboShell title={`Lot ${production.lot_numero}`}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-2xl font-bold text-[#0E3B2E] font-mono">
              {production.lot_numero}
            </h2>
            <Badge variant={STATUT_VARIANTS[production.statut] ?? "outline"}>
              {production.statut}
            </Badge>
          </div>
          <div className="flex items-center gap-4 text-sm text-[#0E3B2E]/70 mt-1">
            <span className="inline-flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5" aria-hidden />
              {production.recette?.nom ?? "Sans recette"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" aria-hidden />
              {formatDate(production.date_production)}
            </span>
          </div>
        </div>
        {production.statut === "en_cours" && (
          <Button asChild className="bg-[#0E3B2E] hover:bg-[#0E3B2E]/90">
            <Link to={`/v2/labo/productions/nouvelle?id=${production.id}`}>
              <Factory className="mr-2 h-4 w-4" aria-hidden />
              Reprendre le workflow
            </Link>
          </Button>
        )}
      </div>

      {/* KPI */}
      {kpi ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <KpiCard
            label="Coût total"
            value={formatEur(kpi.cout_total)}
            accent="primary"
          />
          <KpiCard
            label="CA potentiel HT"
            value={formatEur(kpi.ca_potentiel_ht)}
            accent="emerald"
          />
          <KpiCard
            label="Marge HT"
            value={formatEur(kpi.marge_eur_ht)}
            sub={kpi.marge_pct_ht != null ? formatPercent(kpi.marge_pct_ht) : undefined}
            accent={
              kpi.marge_eur_ht == null
                ? "muted"
                : kpi.marge_eur_ht >= 0
                  ? "emerald"
                  : "red"
            }
          />
          <KpiCard
            label="Rendement"
            value={kpi.rendement_pct != null ? formatPercent(kpi.rendement_pct) : "—"}
            accent={
              kpi.rendement_pct == null
                ? "muted"
                : kpi.rendement_pct >= 95
                  ? "emerald"
                  : kpi.rendement_pct >= 80
                    ? "amber"
                    : "red"
            }
          />
        </div>
      ) : (
        production.statut === "terminee" && (
          <Alert className="mb-6">
            <AlertDescription>
              Pas encore de KPI agrégés disponibles pour cette production
              (vue v_productions_kpi filtre statut='terminee').
            </AlertDescription>
          </Alert>
        )
      )}

      {/* Note : la colonne `photo_url` n'existe pas en DB. Si on veut
          réintroduire un attachement photo, il faudra une migration séparée
          ou stocker le lien dans le champ `notes`. */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Inputs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold text-[#0E3B2E] flex items-center gap-2">
              <FlaskConical className="h-4 w-4" aria-hidden />
              Matières premières ({inputs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {inputs.length === 0 ? (
              <p className="text-sm text-[#0E3B2E]/60">Aucune entrée.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-[#0E3B2E]/50 border-b border-[#0E3B2E]/10">
                  <tr>
                    <th className="text-left py-2 font-medium">Produit</th>
                    <th className="text-right py-2 font-medium">Qty</th>
                    <th className="text-right py-2 font-medium">PU</th>
                    <th className="text-right py-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0E3B2E]/8">
                  {inputs.map((i) => (
                    <tr key={i.id}>
                      <td className="py-2 text-[#0E3B2E] truncate max-w-[140px]">
                        {i.produit?.name ?? "—"}
                      </td>
                      <td className="py-2 text-right text-[#0E3B2E]/70">
                        {formatQty(i.quantite_reelle_consommee)} {i.unite}
                      </td>
                      <td className="py-2 text-right text-[#0E3B2E]/70">
                        {formatEur(i.cout_unitaire_ht)}
                      </td>
                      <td className="py-2 text-right font-medium text-[#0E3B2E]">
                        {formatEur(
                          i.cout_total ??
                            i.quantite_reelle_consommee * i.cout_unitaire_ht,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Outputs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold text-[#0E3B2E] flex items-center gap-2">
              <TrendingUp className="h-4 w-4" aria-hidden />
              Sorties ({outputs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {outputs.length === 0 ? (
              <p className="text-sm text-[#0E3B2E]/60">Aucune sortie.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-[#0E3B2E]/50 border-b border-[#0E3B2E]/10">
                  <tr>
                    <th className="text-left py-2 font-medium">Produit</th>
                    <th className="text-right py-2 font-medium">Qty</th>
                    <th className="text-right py-2 font-medium">PV TTC</th>
                    <th className="text-right py-2 font-medium">Total TTC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#0E3B2E]/8">
                  {outputs.map((o) => (
                    <tr key={o.id}>
                      <td className="py-2 text-[#0E3B2E] truncate max-w-[140px]">
                        {o.produit?.name ?? "—"}
                      </td>
                      <td className="py-2 text-right text-[#0E3B2E]/70">
                        {formatQty(o.quantite_reelle_produite)} {o.unite}
                      </td>
                      <td className="py-2 text-right text-[#0E3B2E]/70">
                        {formatEur(o.prix_vente_unitaire_ttc)}
                      </td>
                      <td className="py-2 text-right font-medium text-[#0E3B2E]">
                        {formatEur(
                          o.quantite_reelle_produite * o.prix_vente_unitaire_ttc,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Coûts indirects */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-[#0E3B2E]">
              Coûts indirects ({couts_indirects.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {couts_indirects.length === 0 ? (
              <p className="text-sm text-[#0E3B2E]/60">
                Aucun coût indirect renseigné.
              </p>
            ) : (
              <ul className="divide-y divide-[#0E3B2E]/8">
                {couts_indirects.map((c) => (
                  <li
                    key={c.id}
                    className="py-2 flex items-center justify-between gap-3"
                  >
                    <span className="text-sm text-[#0E3B2E]">
                      <span className="text-[10px] uppercase tracking-wider text-[#0E3B2E]/40 font-bold mr-2">
                        {c.type.replace(/_/g, " ")}
                      </span>
                      {c.description ?? "—"}
                    </span>
                    <span className="text-sm font-medium text-[#0E3B2E]">
                      {formatEur(c.montant)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {production.notes && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-[#0E3B2E]">
                Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[#0E3B2E]/80 whitespace-pre-wrap">
                {production.notes}
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </LaboShell>
  );
}

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  accent: "primary" | "emerald" | "amber" | "red" | "muted";
}

const ACCENT_CLASSES: Record<KpiCardProps["accent"], string> = {
  primary: "text-[#0E3B2E]",
  emerald: "text-emerald-700",
  amber: "text-amber-700",
  red: "text-red-700",
  muted: "text-[#0E3B2E]/40",
};

const KpiCard = ({ label, value, sub, accent }: KpiCardProps) => (
  <Card>
    <CardContent className="p-4">
      <div className="text-xs uppercase tracking-wider text-[#0E3B2E]/60 mb-1">
        {label}
      </div>
      <div className={"text-xl font-bold " + ACCENT_CLASSES[accent]}>
        {value}
      </div>
      {sub && (
        <div className={"text-xs mt-1 " + ACCENT_CLASSES[accent]}>{sub}</div>
      )}
    </CardContent>
  </Card>
);
