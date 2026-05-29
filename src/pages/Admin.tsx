import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertCircle,
  CheckCircle2,
  Minus,
  Receipt,
  Settings,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useNewOrderSound } from "@/hooks/useNewOrderSound";
import {
  getCAHistory,
  getRecentOrders,
  getStats,
  getTopProducts,
  type Period,
} from "@/services/admin";
import { cn } from "@/lib/utils";

const PRIMARY = "#0E3B2E";

const eurFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

const intFormatter = new Intl.NumberFormat("fr-FR");

const formatEUR = (cents: number) => eurFormatter.format(cents / 100);

const formatPercentChange = (value: number | null) => {
  if (value === null) return "Pas de comparaison";
  const rounded = Math.round(value);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%`;
};

const PERIOD_LABEL: Record<Period, string> = {
  today: "Aujourd'hui",
  week: "Cette semaine",
  month: "Ce mois",
};

const PERIOD_VS: Record<Period, string> = {
  today: "Aujourd'hui · vs hier",
  week: "Cette semaine · vs semaine dernière",
  month: "Ce mois · vs mois dernier",
};

const Trend = ({ value, size = "sm" }: { value: number | null; size?: "sm" | "md" }) => {
  const textSize = size === "md" ? "text-base" : "text-sm";
  const iconSize = size === "md" ? 18 : 14;
  if (value === null) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-gray-400", textSize)}>
        <Minus size={iconSize} />
        Pas de comparaison
      </span>
    );
  }
  const isUp = value > 0;
  const isFlat = Math.round(value) === 0;
  if (isFlat) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-gray-400", textSize)}>
        <Minus size={iconSize} />
        {formatPercentChange(value)}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium",
        textSize,
        isUp ? "text-green-600" : "text-red-500",
      )}
    >
      {isUp ? <TrendingUp size={iconSize} /> : <TrendingDown size={iconSize} />}
      {formatPercentChange(value)}
    </span>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: "En attente", className: "bg-gray-100 text-gray-700" },
    paid: { label: "Payée", className: "bg-emerald-50 text-emerald-700" },
    ready: { label: "Prête", className: "bg-blue-50 text-blue-700" },
    picked_up: { label: "Retirée", className: "bg-emerald-50 text-emerald-700" },
    cancelled: { label: "Annulée", className: "bg-red-50 text-red-600" },
  };
  const entry = map[status] ?? {
    label: status,
    className: "bg-gray-100 text-gray-700",
  };
  return (
    <Badge variant="secondary" className={cn("font-medium", entry.className)}>
      {entry.label}
    </Badge>
  );
};

const TooltipChart = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color?: string }>;
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  // Affiche current en haut (plus important), previous en sous-titre.
  const current = payload.find((p) => p.name === "current");
  const previous = payload.find((p) => p.name === "previous");
  return (
    <div className="pointer-events-none rounded-xl border border-border bg-white px-3 py-2 shadow-lg">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      {current && (
        <p className="text-sm font-medium text-gray-900">
          Période actuelle : {formatEUR(current.value)}
        </p>
      )}
      {previous && (
        <p className="text-xs text-gray-500 mt-0.5">
          Période précédente : {formatEUR(previous.value)}
        </p>
      )}
    </div>
  );
};

const Admin = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>("today");

  const { soundEnabled, enableSound } = useNewOrderSound({
    onNewOrder: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-ca-history"] });
      queryClient.invalidateQueries({ queryKey: ["admin-recent-orders"] });
    },
  });

  const statsQuery = useQuery({
    queryKey: ["admin-stats", period],
    queryFn: () => getStats(period),
  });

  const historyQuery = useQuery({
    queryKey: ["admin-ca-history"],
    queryFn: getCAHistory,
  });

  const topProductsQuery = useQuery({
    queryKey: ["admin-top-products"],
    queryFn: getTopProducts,
  });

  const recentOrdersQuery = useQuery({
    queryKey: ["admin-recent-orders"],
    queryFn: getRecentOrders,
  });

  const initials = useMemo(() => {
    const source = (profile?.full_name?.trim() || user?.email?.trim() || "").trim();
    if (!source) return "?";
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
  }, [profile?.full_name, user?.email]);

  const stats = statsQuery.data;
  const isLoading = statsQuery.isLoading;
  const isError = statsQuery.isError;

  return (
    <div
      className="min-h-dvh bg-[#FAF7EE] pb-20 md:pb-0"
      onClickCapture={() => {
        if (!soundEnabled) enableSound();
      }}
    >
      {/* Hero header gradient sapin — pattern app pro cohérent avec /employe */}
      <header
        className="relative bg-gradient-to-b from-[#0E3B2E] via-[#082A20] to-[#082A20] text-white overflow-hidden"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        {/* Halos dorés décoratifs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-16 w-64 h-64 rounded-full bg-[#C9A227]/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 -left-12 w-40 h-40 rounded-full bg-[#C9A227]/10 blur-2xl"
        />

        <div className="relative max-w-7xl mx-auto px-4 pb-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#C9A227] font-bold mb-1.5">
                Espace admin
              </p>
              <h1 className="text-3xl font-bold tracking-tight">
                Tableau de bord
              </h1>
              <p className="text-sm text-white/70 mt-1">
                Salamarket Toulouse · {profile?.full_name ?? "Patron"}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                to="/admin/reglages"
                aria-label="Réglages admin"
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/15 text-white active:scale-95 transition-all flex items-center justify-center"
              >
                <Settings size={18} aria-hidden />
              </Link>
              <button
                type="button"
                aria-label="Mon compte"
                onClick={() => navigate("/compte")}
                className="w-10 h-10 rounded-full bg-gradient-to-br from-[#C9A227] to-[#C4992C] text-[#0E3B2E] text-sm font-bold flex items-center justify-center shadow-md ring-2 ring-white/30 active:scale-95 transition-all"
              >
                {initials}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* Banner activation son */}
        {!soundEnabled && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <Volume2 size={18} className="shrink-0" />
            <p>
              Cliquez n'importe où pour activer les notifications sonores des
              nouvelles commandes.
            </p>
          </div>
        )}

        {/* Tabs période */}
        <Tabs
          value={period}
          onValueChange={(v) => setPeriod(v as Period)}
          className="mb-6"
        >
          <TabsList className="bg-white shadow-sm rounded-full p-1 h-auto border border-border">
            {(Object.keys(PERIOD_LABEL) as Period[]).map((p) => (
              <TabsTrigger
                key={p}
                value={p}
                className="data-[state=active]:bg-[#0E3B2E] data-[state=active]:text-white px-4 py-2 text-sm font-medium rounded-full transition-all"
              >
                {PERIOD_LABEL[p]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Erreur globale */}
        {isError && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">Impossible de charger les données</p>
              <button
                type="button"
                onClick={() => statsQuery.refetch()}
                className="mt-1 text-red-700 underline underline-offset-2"
              >
                Réessayer
              </button>
            </div>
          </div>
        )}

        {/* Big CA card — premium avec gradient subtle + accent doré */}
        <section className="relative bg-white rounded-2xl shadow-sm border border-border p-6 mb-4 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full bg-[#C9A227]/8"
          />
          <div className="relative flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#0E3B2E] font-bold">
                Chiffre d'affaires
              </p>
              <p className="text-xs text-muted mt-1">{PERIOD_VS[period]}</p>
              <div className="mt-3 flex items-baseline gap-3 flex-wrap">
                {isLoading || !stats ? (
                  <Skeleton className="h-12 w-48" />
                ) : (
                  <h2 className="text-4xl md:text-5xl font-bold text-[#0E3B2E] tabular-nums tracking-tight">
                    {formatEUR(stats.ca.current)}
                  </h2>
                )}
                {stats && <Trend value={stats.ca.changePercent} size="md" />}
              </div>
            </div>
          </div>

          <div className="mt-6 h-[200px] w-full">
            {historyQuery.isLoading ? (
              <Skeleton className="h-full w-full rounded-2xl" />
            ) : historyQuery.data && historyQuery.data.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={historyQuery.data}
                  margin={{ top: 10, right: 0, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="caGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={PRIMARY} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "#9ca3af" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    content={<TooltipChart />}
                    cursor={{ stroke: "#e5e7eb" }}
                    wrapperStyle={{ outline: "none", pointerEvents: "none" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="previous"
                    name="previous"
                    stroke={PRIMARY}
                    strokeWidth={2}
                    strokeOpacity={0.3}
                    strokeDasharray="5 5"
                    fill="transparent"
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="current"
                    name="current"
                    stroke={PRIMARY}
                    strokeWidth={3}
                    fill="url(#caGradient)"
                    dot={false}
                    activeDot={{ r: 4, fill: PRIMARY, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                Pas encore de commandes
              </div>
            )}
          </div>
        </section>

        {/* 3 medium cards — stagger animation */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 [animation-delay:100ms] [animation-fill-mode:backwards]">
            <KpiCard
              title="Commandes"
              Icon={ShoppingBag}
              value={stats ? intFormatter.format(stats.orders.current) : null}
              change={stats?.orders.changePercent ?? null}
              isLoading={isLoading}
            />
          </div>
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 [animation-delay:200ms] [animation-fill-mode:backwards]">
            <KpiCard
              title="Panier moyen"
              Icon={Receipt}
              value={stats ? formatEUR(stats.basket.current) : null}
              change={stats?.basket.changePercent ?? null}
              isLoading={isLoading}
            />
          </div>
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 [animation-delay:300ms] [animation-fill-mode:backwards]">
            <KpiCard
              title="Taux de retrait"
              Icon={CheckCircle2}
              value={stats ? `${Math.round(stats.pickupRate.current)}%` : null}
              change={stats?.pickupRate.changePercent ?? null}
              isLoading={isLoading}
            />
          </div>
        </section>

        {/* Top products + Recent orders */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 [animation-delay:400ms] [animation-fill-mode:backwards]">
            <TopProductsCard
              isLoading={topProductsQuery.isLoading}
              data={topProductsQuery.data ?? []}
            />
          </div>
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 [animation-delay:500ms] [animation-fill-mode:backwards]">
            <RecentOrdersCard
              isLoading={recentOrdersQuery.isLoading}
              data={recentOrdersQuery.data ?? []}
            />
          </div>
        </section>
      </div>
    </div>
  );
};

interface KpiCardProps {
  title: string;
  Icon: LucideIcon;
  value: string | null;
  change: number | null;
  isLoading: boolean;
}

const KpiCard = ({ title, Icon, value, change, isLoading }: KpiCardProps) => (
  <div className="relative bg-white rounded-2xl shadow-sm border border-border p-5 hover:shadow-md hover:border-[#0E3B2E]/20 transition-all">
    <div className="absolute top-4 right-4 w-11 h-11 rounded-2xl bg-gradient-to-br from-[#0E3B2E] to-[#082A20] text-white flex items-center justify-center shadow-md shadow-[#0E3B2E]/20">
      <Icon size={20} strokeWidth={2} aria-hidden />
    </div>
    <p className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted pr-14">
      {title}
    </p>
    {isLoading || value === null ? (
      <Skeleton className="mt-3 h-8 w-24" />
    ) : (
      <p className="mt-3 text-2xl font-bold text-text tabular-nums tracking-tight">
        {value}
      </p>
    )}
    <div className="mt-2">
      <Trend value={change} />
    </div>
  </div>
);

const TopProductsCard = ({
  isLoading,
  data,
}: {
  isLoading: boolean;
  data: Awaited<ReturnType<typeof getTopProducts>>;
}) => {
  const max = Math.max(...data.map((p) => p.quantity), 1);
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-border p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-gray-900">
          Top produits ce mois
        </h3>
      </div>
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">Pas encore de ventes ce mois.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((product) => {
            const widthPct = Math.max(8, Math.round((product.quantity / max) * 100));
            return (
              <li key={product.productId} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {product.name}
                  </p>
                  <div className="mt-1 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${widthPct}%`,
                        backgroundColor: PRIMARY,
                        opacity: 0.7,
                      }}
                    />
                  </div>
                </div>
                <span className="text-sm text-gray-600 tabular-nums shrink-0">
                  {intFormatter.format(product.quantity)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4">
        <Link
          to="/admin"
          className="text-sm font-medium text-[#0E3B2E] hover:underline"
        >
          Voir tous
        </Link>
      </div>
    </div>
  );
};

const RecentOrdersCard = ({
  isLoading,
  data,
}: {
  isLoading: boolean;
  data: Awaited<ReturnType<typeof getRecentOrders>>;
}) => (
  <div className="bg-white rounded-2xl shadow-sm border border-border p-5">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-base font-semibold text-gray-900">
        Dernières commandes
      </h3>
    </div>
    {isLoading ? (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    ) : data.length === 0 ? (
      <p className="text-sm text-gray-400 py-4">Aucune commande récente.</p>
    ) : (
      <ul className="flex flex-col">
        {data.map((order, idx) => (
          <li
            key={order.id}
            className={cn(
              "flex items-center justify-between gap-3 py-3",
              idx > 0 && "border-t border-gray-100",
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">
                {order.shortId}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {order.pickup_slot
                  ? format(
                      new Date(order.pickup_slot.slot_start),
                      "EEE d MMM 'à' HH'h'mm",
                      { locale: fr },
                    )
                  : "Créneau à confirmer"}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm font-semibold text-gray-900 tabular-nums">
                {formatEUR(order.total_cents)}
              </span>
              <StatusBadge status={order.status} />
            </div>
          </li>
        ))}
      </ul>
    )}
    <div className="mt-4">
      <Link
        to="/admin"
        className="text-sm font-medium text-[#0E3B2E] hover:underline"
      >
        Voir toutes
      </Link>
    </div>
  </div>
);

export default Admin;
