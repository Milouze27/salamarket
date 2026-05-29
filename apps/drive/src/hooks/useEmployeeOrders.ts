import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Statuts gérés par le Kanban (pending est exclu, il devient confirmed via confirm-order)
const KANBAN_STATUSES = new Set([
  "confirmed",
  "preparing",
  "ready",
  "picked_up",
  "cancelled",
]);

export interface PickupSlotRef {
  id: string;
  slot_start: string;
  slot_end: string;
}

export interface OrderItem {
  product_id: string;
  name: string;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
}

export interface EmployeeOrder {
  id: string;
  user_id: string;
  status: string;
  payment_method: "online" | "in_store";
  payment_status: string;
  total_cents: number;
  items: OrderItem[];
  notes: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  pickup_slot_id: string | null;
  created_at: string;
  updated_at: string;
  pickup_slot?: PickupSlotRef | null;
}

interface Options {
  onNewOrder?: (order: EmployeeOrder) => void;
}

export const useEmployeeOrders = ({ onNewOrder }: Options = {}) => {
  const [orders, setOrders] = useState<EmployeeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mémorise le status précédent pour rollback
  const previousStatusRef = useRef<Map<string, string>>(new Map());

  // Charge initial
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, pickup_slot:pickup_slots(id, slot_start, slot_end)")
        .neq("status", "pending")
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      setOrders((data ?? []) as EmployeeOrder[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Realtime UPDATE + INSERT
  useEffect(() => {
    const channel = supabase
      .channel("employee-orders-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders" },
        (payload) => {
          const record = payload.new as EmployeeOrder;
          if (!record || !KANBAN_STATUSES.has(record.status)) return;
          setOrders((prev) => {
            if (prev.some((o) => o.id === record.id)) return prev;
            return [record, ...prev];
          });
          onNewOrder?.(record);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders" },
        (payload) => {
          const newRow = payload.new as EmployeeOrder;
          const oldRow = payload.old as Partial<EmployeeOrder>;
          if (!newRow) return;

          // pending → confirmed : ajout (équivalent INSERT côté Kanban)
          if (
            oldRow?.status === "pending" &&
            newRow.status === "confirmed"
          ) {
            setOrders((prev) => {
              if (prev.some((o) => o.id === newRow.id)) {
                return prev.map((o) => (o.id === newRow.id ? { ...o, ...newRow } : o));
              }
              return [newRow, ...prev];
            });
            onNewOrder?.(newRow);
            return;
          }

          if (!KANBAN_STATUSES.has(newRow.status)) {
            // Sortie du Kanban
            setOrders((prev) => prev.filter((o) => o.id !== newRow.id));
            return;
          }

          setOrders((prev) =>
            prev.map((o) => (o.id === newRow.id ? { ...o, ...newRow } : o)),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onNewOrder]);

  const optimisticUpdate = useCallback((orderId: string, newStatus: string) => {
    setOrders((prev) => {
      const target = prev.find((o) => o.id === orderId);
      if (target) previousStatusRef.current.set(orderId, target.status);
      return prev.map((o) =>
        o.id === orderId ? { ...o, status: newStatus } : o,
      );
    });
  }, []);

  const rollback = useCallback((orderId: string, fallbackStatus?: string) => {
    setOrders((prev) => {
      const previous =
        previousStatusRef.current.get(orderId) ?? fallbackStatus ?? "confirmed";
      previousStatusRef.current.delete(orderId);
      return prev.map((o) =>
        o.id === orderId ? { ...o, status: previous } : o,
      );
    });
  }, []);

  return { orders, loading, error, optimisticUpdate, rollback };
};
