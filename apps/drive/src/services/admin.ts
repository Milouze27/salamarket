import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";

export type Period = "today" | "week" | "month";

export interface KpiValue {
  current: number;
  previous: number;
  changePercent: number | null;
}

export interface AdminStats {
  ca: KpiValue;
  orders: KpiValue;
  basket: KpiValue;
  pickupRate: KpiValue;
}

export interface CAHistoryPoint {
  date: string;
  label: string;
  current: number;
  previous: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  quantity: number;
}

export interface RecentOrder {
  id: string;
  shortId: string;
  total_cents: number;
  status: string;
  payment_status: string;
  created_at: string;
  pickup_slot: { slot_start: string; slot_end: string } | null;
}

interface OrderForStats {
  total_cents: number;
  status: string;
  created_at: string;
}

const change = (current: number, previous: number): number | null => {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
};

const aggregate = (orders: OrderForStats[]) => {
  const ca = orders.reduce((sum, o) => sum + o.total_cents, 0);
  const count = orders.length;
  const basket = count === 0 ? 0 : ca / count;
  const pickedUp = orders.filter((o) => o.status === "picked_up").length;
  const pickupRate = count === 0 ? 0 : (pickedUp / count) * 100;
  return { ca, count, basket, pickupRate };
};

const periodRanges = (period: Period, now: Date) => {
  if (period === "today") {
    return {
      currentStart: startOfDay(now),
      currentEnd: endOfDay(now),
      previousStart: startOfDay(subDays(now, 1)),
      previousEnd: endOfDay(subDays(now, 1)),
    };
  }
  if (period === "week") {
    const start = startOfWeek(now, { weekStartsOn: 1 });
    const end = endOfWeek(now, { weekStartsOn: 1 });
    const prevStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
    const prevEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
    return {
      currentStart: start,
      currentEnd: end,
      previousStart: prevStart,
      previousEnd: prevEnd,
    };
  }
  return {
    currentStart: startOfMonth(now),
    currentEnd: endOfMonth(now),
    previousStart: startOfMonth(subMonths(now, 1)),
    previousEnd: endOfMonth(subMonths(now, 1)),
  };
};

const fetchOrdersInRange = async (
  start: Date,
  end: Date,
): Promise<OrderForStats[]> => {
  const { data, error } = await supabase
    .from("orders")
    .select("total_cents, status, created_at")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())
    .neq("status", "cancelled");

  if (error) throw error;
  return (data ?? []) as OrderForStats[];
};

export const getStats = async (period: Period): Promise<AdminStats> => {
  const now = new Date();
  const { currentStart, currentEnd, previousStart, previousEnd } = periodRanges(
    period,
    now,
  );

  const [currentOrders, previousOrders] = await Promise.all([
    fetchOrdersInRange(currentStart, currentEnd),
    fetchOrdersInRange(previousStart, previousEnd),
  ]);

  const cur = aggregate(currentOrders);
  const prev = aggregate(previousOrders);

  return {
    ca: {
      current: cur.ca,
      previous: prev.ca,
      changePercent: change(cur.ca, prev.ca),
    },
    orders: {
      current: cur.count,
      previous: prev.count,
      changePercent: change(cur.count, prev.count),
    },
    basket: {
      current: cur.basket,
      previous: prev.basket,
      changePercent: change(cur.basket, prev.basket),
    },
    pickupRate: {
      current: cur.pickupRate,
      previous: prev.pickupRate,
      changePercent: change(cur.pickupRate, prev.pickupRate),
    },
  };
};

export const getCAHistory = async (): Promise<CAHistoryPoint[]> => {
  const now = new Date();
  const days = 7;
  const todayStart = startOfDay(now);
  const windowStart = startOfDay(subDays(now, days * 2 - 1));
  const windowEnd = endOfDay(now);

  const orders = await fetchOrdersInRange(windowStart, windowEnd);

  const totalsByDay = new Map<string, number>();
  for (const order of orders) {
    const key = format(new Date(order.created_at), "yyyy-MM-dd");
    totalsByDay.set(key, (totalsByDay.get(key) ?? 0) + order.total_cents);
  }

  const points: CAHistoryPoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const dayDate = subDays(todayStart, i);
    const prevDayDate = subDays(dayDate, days);
    const dayKey = format(dayDate, "yyyy-MM-dd");
    const prevKey = format(prevDayDate, "yyyy-MM-dd");
    points.push({
      date: dayKey,
      label: format(dayDate, "EEE d", { locale: fr }),
      current: totalsByDay.get(dayKey) ?? 0,
      previous: totalsByDay.get(prevKey) ?? 0,
    });
  }
  return points;
};

interface OrderItem {
  product_id: string;
  name: string;
  quantity: number;
}

export const getTopProducts = async (): Promise<TopProduct[]> => {
  const now = new Date();
  const start = startOfMonth(now);
  const end = endOfMonth(now);

  const { data, error } = await supabase
    .from("orders")
    .select("items")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())
    .neq("status", "cancelled");

  if (error) throw error;

  const totals = new Map<string, { name: string; quantity: number }>();
  for (const order of data ?? []) {
    const items = Array.isArray(order.items)
      ? (order.items as unknown as OrderItem[])
      : [];
    for (const item of items) {
      if (!item?.product_id) continue;
      const existing = totals.get(item.product_id);
      const qty = Number(item.quantity) || 0;
      if (existing) {
        existing.quantity += qty;
      } else {
        totals.set(item.product_id, {
          name: item.name ?? "Produit",
          quantity: qty,
        });
      }
    }
  }

  return Array.from(totals.entries())
    .map(([productId, value]) => ({
      productId,
      name: value.name,
      quantity: value.quantity,
    }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5);
};

export const getRecentOrders = async (): Promise<RecentOrder[]> => {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, total_cents, status, payment_status, created_at, pickup_slot:pickup_slots(slot_start, slot_end)",
    )
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) throw error;

  return (data ?? []).map((row) => {
    const slot = Array.isArray(row.pickup_slot)
      ? row.pickup_slot[0]
      : row.pickup_slot;
    return {
      id: row.id,
      shortId: `PO-${row.id.slice(0, 4).toUpperCase()}`,
      total_cents: row.total_cents,
      status: row.status,
      payment_status: row.payment_status,
      created_at: row.created_at,
      pickup_slot: slot
        ? { slot_start: slot.slot_start, slot_end: slot.slot_end }
        : null,
    };
  });
};
