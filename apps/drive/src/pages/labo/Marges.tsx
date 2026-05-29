import { useMemo, useState } from "react";
import { subDays, format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { LaboShell } from "@/components/labo/LaboShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  useProductionsKpi,
  aggregateKpiByRecette,
  type ProductionKpi,
} from "@/hooks/useProductionsKpi";
import { formatEur, formatPercent } from "@/lib/format";

const PRIMARY = "#0E3B2E";
const GOLD = "#C9A227";
const EMERALD = "#047857";

const PERIODS = [
  { value: "7", label: "7 derniers jours" },
  { value: "30", label: "30 derniers jours" },
  { value: "90", label: "90 derniers jours" },
] as const;

export default function MargesPage() {
  const [period, setPeriod] = useState<string>("30");

  const dateFrom = useMemo(
    () =>
      subDays(new Date(), parseInt(period, 10)).toISOString().slice(0, 10),
    [period],
  );

  const { data: kpis, isLoading } = useProductionsKpi({ dateFrom });

  const summary = useMemo(() => computeSummary(kpis ?? []), [kpis]);
  const daily = useMemo(() => computeDailySeries(kpis ?? []), [kpis]);
  const top = useMemo(() => {
    if (!kpis) return [];
    return aggregateKpiByRecette(kpis).slice(0, 10);
  }, [kpis]);

  return (
    <LaboShell title="Marges">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-[#0E3B2E]">Marges &amp; rendement</h2>
          <p className="text-sm text-[#0E3B2E]/70">
            Vue agrégée des productions terminées sur la période.
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-full sm:w-48 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 bg-white" />
            ))}
          </div>
          <Skeleton className="h-80 bg-white" />
          <Skeleton className="h-80 bg-white" />
        </div>
      ) : (kpis?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-[#0E3B2E]/60">
            Aucune production terminée sur la période.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <SummaryCard label="Productions" value={String(summary.count)} />
            <SummaryCard
              label="Marge HT totale"
              value={formatEur(summary.margeTotalHt)}
              accent={summary.margeTotalHt >= 0 ? "emerald" : "red"}
            />
            <SummaryCard
              label="Marge HT moyenne"
              value={
                summary.margePctMoy == null
                  ? "—"
                  : formatPercent(summary.margePctMoy)
              }
              accent={
                summary.margePctMoy == null
                  ? "muted"
                  : summary.margePctMoy >= 30
                    ? "emerald"
                    : summary.margePctMoy >= 15
                      ? "amber"
                      : "red"
              }
            />
            <SummaryCard
              label="Rendement moyen"
              value={
                summary.rendementMoy == null
                  ? "—"
                  : formatPercent(summary.rendementMoy)
              }
              accent={
                summary.rendementMoy == null
                  ? "muted"
                  : summary.rendementMoy >= 95
                    ? "emerald"
                    : summary.rendementMoy >= 80
                      ? "amber"
                      : "red"
              }
            />
          </div>

          {/* Daily margin */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base font-semibold text-[#0E3B2E]">
                Marge HT par jour
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#0E3B2E22" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: PRIMARY }}
                    tickFormatter={(d) =>
                      format(parseISO(d), "dd MMM", { locale: fr })
                    }
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: PRIMARY }}
                    tickFormatter={(v) => `${v} €`}
                  />
                  <Tooltip
                    formatter={(value: number) => formatEur(value)}
                    labelFormatter={(d) =>
                      format(parseISO(String(d)), "EEEE dd MMMM yyyy", {
                        locale: fr,
                      })
                    }
                    contentStyle={{ borderRadius: 8 }}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="marge_eur_ht"
                    name="Marge HT"
                    stroke={EMERALD}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="cout_total"
                    name="Coût total"
                    stroke={GOLD}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Top recettes */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold text-[#0E3B2E]">
                Top recettes — marge cumulée HT
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(240, top.length * 36)}>
                <BarChart data={top} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#0E3B2E22" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: PRIMARY }}
                    tickFormatter={(v) => `${v} €`}
                  />
                  <YAxis
                    type="category"
                    dataKey="recette"
                    tick={{ fontSize: 11, fill: PRIMARY }}
                    width={120}
                  />
                  <Tooltip
                    formatter={(value: number) => formatEur(value)}
                    contentStyle={{ borderRadius: 8 }}
                  />
                  <Bar dataKey="marge_eur_total" fill={PRIMARY} radius={4}>
                    {/* couleurs alternées légèrement pour la lisibilité */}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </LaboShell>
  );
}

interface Summary {
  count: number;
  margeTotalHt: number;
  margePctMoy: number | null;
  rendementMoy: number | null;
}

const computeSummary = (kpis: readonly ProductionKpi[]): Summary => {
  let count = 0;
  let margeTotalHt = 0;
  let sumMarge = 0;
  let nMarge = 0;
  let sumRendement = 0;
  let nRendement = 0;
  for (const k of kpis) {
    count += 1;
    margeTotalHt += k.marge_eur_ht ?? 0;
    if (k.marge_pct_ht != null) {
      sumMarge += k.marge_pct_ht;
      nMarge += 1;
    }
    if (k.rendement_pct != null) {
      sumRendement += k.rendement_pct;
      nRendement += 1;
    }
  }
  return {
    count,
    margeTotalHt,
    margePctMoy: nMarge > 0 ? sumMarge / nMarge : null,
    rendementMoy: nRendement > 0 ? sumRendement / nRendement : null,
  };
};

interface DailyPoint {
  date: string;
  marge_eur_ht: number;
  cout_total: number;
}

const computeDailySeries = (kpis: readonly ProductionKpi[]): DailyPoint[] => {
  const byDate = new Map<string, DailyPoint>();
  for (const k of kpis) {
    const d = k.date_production;
    const acc = byDate.get(d) ?? { date: d, marge_eur_ht: 0, cout_total: 0 };
    acc.marge_eur_ht += k.marge_eur_ht ?? 0;
    acc.cout_total += k.cout_total ?? 0;
    byDate.set(d, acc);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
};

const SummaryCard = ({
  label,
  value,
  accent = "primary",
}: {
  label: string;
  value: string;
  accent?: "primary" | "emerald" | "amber" | "red" | "muted";
}) => {
  const cls =
    accent === "emerald"
      ? "text-emerald-700"
      : accent === "amber"
        ? "text-amber-700"
        : accent === "red"
          ? "text-red-700"
          : accent === "muted"
            ? "text-[#0E3B2E]/40"
            : "text-[#0E3B2E]";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wider text-[#0E3B2E]/60 mb-1">
          {label}
        </div>
        <div className={"text-xl font-bold " + cls}>{value}</div>
      </CardContent>
    </Card>
  );
};
