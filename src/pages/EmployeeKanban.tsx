import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { ArrowLeft, Banknote, Clock, CreditCard, Phone, Mail, GripVertical } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  useEmployeeOrders,
  type EmployeeOrder,
  type OrderItem,
  type PickupSlotRef,
} from "@/hooks/useEmployeeOrders";
import { useNewOrderDing } from "@/hooks/useNewOrderDing";

const PARIS_TZ = "Europe/Paris";

const formatEUR = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    (cents ?? 0) / 100,
  );

interface ColumnConfig {
  id: "confirmed" | "preparing" | "ready" | "picked_up" | "cancelled";
  label: string;
  bg: string;
  border: string;
  badge: string;
  sortAsc: boolean;
}

const COLUMNS: ColumnConfig[] = [
  {
    id: "confirmed",
    label: "À préparer",
    bg: "bg-amber-50",
    border: "border-amber-200",
    badge: "bg-amber-500 text-white",
    sortAsc: false,
  },
  {
    id: "preparing",
    label: "En préparation",
    bg: "bg-blue-50",
    border: "border-blue-200",
    badge: "bg-blue-500 text-white",
    sortAsc: true,
  },
  {
    id: "ready",
    label: "Prête",
    bg: "bg-green-50",
    border: "border-green-200",
    badge: "bg-green-600 text-white",
    sortAsc: true,
  },
  {
    id: "picked_up",
    label: "Retirée",
    bg: "bg-gray-50",
    border: "border-gray-200",
    badge: "bg-gray-500 text-white",
    sortAsc: true,
  },
  {
    id: "cancelled",
    label: "Annulée",
    bg: "bg-red-50",
    border: "border-red-200",
    badge: "bg-red-500 text-white",
    sortAsc: true,
  },
];

function formatSlotLabel(slot: PickupSlotRef | null | undefined) {
  if (!slot) return "Créneau —";
  const start = toZonedTime(new Date(slot.slot_start), PARIS_TZ);
  const end = toZonedTime(new Date(slot.slot_end), PARIS_TZ);
  const today = toZonedTime(new Date(), PARIS_TZ);
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  let dayLabel: string;
  if (isSameDay(start, today)) dayLabel = "Aujourd'hui";
  else if (isSameDay(start, tomorrow)) dayLabel = "Demain";
  else dayLabel = format(start, "EEE d MMM", { locale: fr });

  return `${dayLabel} · ${format(start, "HH'h'mm", { locale: fr })} - ${format(end, "HH'h'mm", { locale: fr })}`;
}

function customerLabel(order: EmployeeOrder) {
  if (order.customer_email) return order.customer_email.split("@")[0];
  return "Client";
}

function shortId(id: string) {
  return `#${id.slice(0, 6).toUpperCase()}`;
}

type DragWiring = Pick<ReturnType<typeof useDraggable>, "attributes" | "listeners">;

interface CardContentProps {
  order: EmployeeOrder;
  dragHandle?: DragWiring;
  isOverlay?: boolean;
}

// Pur visuel — pas de useDraggable. Réutilisé dans le wrapper Draggable
// et dans <DragOverlay> pour rendre une "version fantôme" de la card.
const CardContent = ({ order, dragHandle, isOverlay = false }: CardContentProps) => {
  const items: OrderItem[] = Array.isArray(order.items) ? order.items : [];
  const itemCount = items.reduce((acc, it) => acc + (it.quantity ?? 0), 0);

  return (
    <div
      className={cn(
        "group bg-white rounded-2xl border border-border p-3 shadow-sm touch-none",
        !isOverlay && "hover:shadow-md hover:border-[#0E3B2E]/30 transition-all cursor-pointer",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-mono text-xs text-gray-500">{shortId(order.id)}</p>
          <p className="text-sm font-semibold text-gray-900 truncate">
            {customerLabel(order)}
          </p>
        </div>
        <button
          data-drag-handle
          {...(dragHandle?.attributes ?? {})}
          {...(dragHandle?.listeners ?? {})}
          className="shrink-0 p-1 -m-1 rounded text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing"
          aria-label="Déplacer la carte"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={16} />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-600">
        <Clock size={12} />
        <span className="truncate">{formatSlotLabel(order.pickup_slot)}</span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#0E3B2E]/8 text-[#0E3B2E]">
          {order.payment_method === "online" ? (
            <>
              <CreditCard size={10} aria-hidden /> En ligne
            </>
          ) : (
            <>
              <Banknote size={10} aria-hidden /> Magasin
            </>
          )}
        </span>
        <span className="text-xs text-muted">
          {itemCount} article{itemCount > 1 ? "s" : ""}
        </span>
      </div>

      <div className="mt-2 pt-2 border-t border-gray-100">
        <p className="text-base font-bold text-[#0E3B2E]">
          {formatEUR(order.total_cents)}
        </p>
      </div>
    </div>
  );
};

interface DraggableCardProps {
  order: EmployeeOrder;
  onClick: () => void;
}

const DraggableCard = ({ order, onClick }: DraggableCardProps) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: order.id,
  });

  // Pas de transform ici — DragOverlay s'occupe du visuel pendant le drag.
  // La card source devient semi-transparente pour indiquer son emplacement
  // d'origine.
  const style: React.CSSProperties = {
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={(e) => {
        if (isDragging) return;
        // ne pas ouvrir le dialog si le clic vient du handle de drag
        const target = e.target as HTMLElement;
        if (target.closest("[data-drag-handle]")) return;
        onClick();
      }}
    >
      <CardContent order={order} dragHandle={{ attributes, listeners }} />
    </div>
  );
};

interface ColumnProps {
  column: ColumnConfig;
  orders: EmployeeOrder[];
  onCardClick: (order: EmployeeOrder) => void;
}

const Column = ({ column, orders, onCardClick }: ColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  const sorted = useMemo(() => {
    const arr = [...orders];
    arr.sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return column.sortAsc ? ta - tb : tb - ta;
    });
    return arr;
  }, [orders, column.sortAsc]);

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border min-w-[280px] lg:min-w-0 transition-all",
        column.bg,
        column.border,
        isOver && "ring-4 ring-[#C9A227]/50 scale-[1.01] shadow-lg",
      )}
    >
      <div className="px-3 py-3 flex items-center justify-between border-b border-current/10">
        <h2 className="text-sm font-bold text-gray-900 tracking-tight">
          {column.label}
        </h2>
        <span
          className={cn(
            "min-w-[1.75rem] h-7 inline-flex items-center justify-center text-xs font-bold px-2 rounded-full tabular-nums shadow-sm",
            column.badge,
          )}
        >
          {sorted.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className="flex-1 p-2 space-y-2 min-h-[200px] overflow-y-auto"
      >
        {sorted.map((order) => (
          <DraggableCard
            key={order.id}
            order={order}
            onClick={() => onCardClick(order)}
          />
        ))}
        {sorted.length === 0 && (
          <div className="text-center py-10 px-3">
            <p className="text-xs text-gray-400 italic">Aucune commande</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Mini KPI pill inline en haut du Kanban — vue d'ensemble immédiate
const KPI_TONE: Record<
  "amber" | "blue" | "green",
  { dot: string; ring: string }
> = {
  amber: { dot: "bg-amber-500", ring: "ring-amber-200" },
  blue: { dot: "bg-blue-500", ring: "ring-blue-200" },
  green: { dot: "bg-green-600", ring: "ring-green-200" },
};

const KpiPill = ({
  label,
  value,
  tone,
  highlight = false,
}: {
  label: string;
  value: number;
  tone: "amber" | "blue" | "green";
  highlight?: boolean;
}) => {
  const cfg = KPI_TONE[tone];
  return (
    <div
      className={cn(
        "rounded-2xl bg-white border border-border p-3 transition-all",
        highlight && "ring-2 ring-offset-1 shadow-md",
        highlight && cfg.ring,
      )}
    >
      <div className="flex items-center gap-1.5">
        <span aria-hidden className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
        <p className="text-[10px] uppercase tracking-wider text-muted font-bold truncate">
          {label}
        </p>
      </div>
      <p className="mt-1 text-2xl font-bold text-text tabular-nums">{value}</p>
    </div>
  );
};

const EmployeeKanban = () => {
  const { orders, loading, error, optimisticUpdate, rollback } =
    useEmployeeOrders();
  useNewOrderDing();

  const [openOrder, setOpenOrder] = useState<EmployeeOrder | null>(null);
  const [activeOrder, setActiveOrder] = useState<EmployeeOrder | null>(null);

  // PointerSensor (desktop) : 8px avant drag (évite les drags accidentels au click)
  // TouchSensor (mobile)    : long-press 200ms avec tolerance 5px (évite les
  //                           conflits avec le scroll vertical de la colonne)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
  );

  const ordersByStatus = useMemo(() => {
    const map = new Map<string, EmployeeOrder[]>();
    for (const col of COLUMNS) map.set(col.id, []);
    for (const o of orders) {
      const list = map.get(o.status);
      if (list) list.push(o);
    }
    return map;
  }, [orders]);

  const toPrepareCount = ordersByStatus.get("confirmed")?.length ?? 0;

  const handleDragStart = (event: DragStartEvent) => {
    const order = orders.find((o) => o.id === String(event.active.id));
    setActiveOrder(order ?? null);
  };

  const handleDragCancel = () => {
    setActiveOrder(null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveOrder(null);
    const { active, over } = event;
    if (!over) return;
    const orderId = String(active.id);
    const newStatus = String(over.id);

    const current = orders.find((o) => o.id === orderId);
    if (!current) return;
    if (current.status === newStatus) return;

    const oldStatus = current.status;
    const columnLabel =
      COLUMNS.find((c) => c.id === newStatus)?.label ?? newStatus;

    optimisticUpdate(orderId, newStatus);

    const { error } = await supabase.functions.invoke("update-order-status", {
      body: { order_id: orderId, new_status: newStatus },
    });

    if (error) {
      rollback(orderId, oldStatus);
      toast.error(error.message ?? "Échec du déplacement");
      return;
    }

    toast.success(`Commande déplacée en "${columnLabel}"`);
  };

  return (
    <div className="min-h-dvh bg-[#FAF7EE]">
      {/* Header sticky — gradient sapin pattern app pro. La safe-area-top
          est appliquée DIRECTEMENT sur le header pour qu'elle hérite du
          bg sapin (et pas du crème du wrapper) — sinon barre blanche au
          dessus du header en mode standalone iOS. */}
      <header
        className="sticky top-0 z-20 bg-gradient-to-b from-[#0E3B2E] to-[#082A20] text-white shadow-md"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link
            to="/"
            aria-label="Retour à l'accueil"
            className="w-10 h-10 -ml-2 rounded-full hover:bg-white/10 flex items-center justify-center text-white active:scale-95 transition-all"
          >
            <ArrowLeft size={20} aria-hidden />
          </Link>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wider text-[#C9A227] font-bold">
              Espace pro
            </p>
            <h1 className="text-base sm:text-lg font-bold tracking-tight">
              Préparation
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={cn(
                "inline-flex items-center justify-center min-w-[2.25rem] h-9 px-2.5 rounded-full text-sm font-bold tabular-nums",
                toPrepareCount > 0
                  ? "bg-[#C9A227] text-[#0E3B2E] shadow-md ring-2 ring-white/20"
                  : "bg-white/10 text-white/70",
                toPrepareCount > 0 && "animate-pulse",
              )}
              aria-label={`${toPrepareCount} commande${toPrepareCount > 1 ? "s" : ""} à préparer`}
            >
              {toPrepareCount}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4">
        {/* KPI inline — vue d'ensemble rapide en haut */}
        <div className="grid grid-cols-3 gap-2.5 mb-4 animate-in fade-in slide-in-from-top-1 duration-300">
          <KpiPill
            label="À préparer"
            value={toPrepareCount}
            tone="amber"
            highlight={toPrepareCount > 0}
          />
          <KpiPill
            label="En préparation"
            value={ordersByStatus.get("preparing")?.length ?? 0}
            tone="blue"
          />
          <KpiPill
            label="Prêtes"
            value={ordersByStatus.get("ready")?.length ?? 0}
            tone="green"
          />
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Erreur de chargement : {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-sm text-gray-500">
            Chargement des commandes…
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="lg:grid lg:grid-cols-5 lg:gap-4 flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 lg:mx-0 lg:px-0 lg:overflow-visible">
              {COLUMNS.map((col) => (
                <Column
                  key={col.id}
                  column={col}
                  orders={ordersByStatus.get(col.id) ?? []}
                  onCardClick={setOpenOrder}
                />
              ))}
            </div>
            <DragOverlay
              dropAnimation={{
                duration: 250,
                easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
              }}
            >
              {activeOrder ? (
                <div
                  style={{
                    transform: "rotate(3deg)",
                    boxShadow: "0 16px 32px -8px rgba(0,0,0,0.25)",
                    cursor: "grabbing",
                  }}
                >
                  <CardContent order={activeOrder} isOverlay />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </main>

      {/* Dialog détails commande */}
      <Dialog open={!!openOrder} onOpenChange={(o) => !o && setOpenOrder(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          {openOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono text-base">
                  {shortId(openOrder.id)}
                </DialogTitle>
                <DialogDescription>
                  {customerLabel(openOrder)} ·{" "}
                  {formatSlotLabel(openOrder.pickup_slot)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {/* Paiement */}
                <div className="rounded-2xl border bg-card p-3 flex items-start gap-3">
                  {openOrder.payment_method === "online" ? (
                    <CreditCard className="text-[#0E3B2E] shrink-0 mt-0.5" size={18} />
                  ) : (
                    <Banknote className="text-[#0E3B2E] shrink-0 mt-0.5" size={18} />
                  )}
                  <div className="flex-1">
                    <Badge
                      className={cn(
                        openOrder.payment_method === "online" &&
                          openOrder.payment_status === "paid"
                          ? "bg-[#0E3B2E] text-white hover:bg-[#0E3B2E]"
                          : "bg-orange-500 text-white hover:bg-orange-500",
                      )}
                    >
                      {openOrder.payment_method === "online" &&
                      openOrder.payment_status === "paid"
                        ? "Payé en ligne"
                        : "À régler au retrait"}
                    </Badge>
                    <p className="mt-1 text-sm font-semibold">
                      {formatEUR(openOrder.total_cents)}
                    </p>
                  </div>
                </div>

                {/* Articles */}
                <div className="rounded-2xl border bg-card p-3">
                  <p className="text-sm font-medium mb-2">Articles</p>
                  <ul className="space-y-1.5">
                    {(Array.isArray(openOrder.items) ? openOrder.items : []).map(
                      (item, idx) => (
                        <li
                          key={`${item.product_id}-${idx}`}
                          className="flex justify-between text-sm"
                        >
                          <span>
                            {item.quantity} × {item.name}
                          </span>
                          <span className="text-gray-500">
                            {formatEUR(item.line_total_cents)}
                          </span>
                        </li>
                      ),
                    )}
                  </ul>
                  <Separator className="my-2" />
                  <div className="flex justify-between text-sm font-semibold">
                    <span>Total</span>
                    <span>{formatEUR(openOrder.total_cents)}</span>
                  </div>
                </div>

                {/* Contact client */}
                <div className="rounded-2xl border bg-card p-3 space-y-2 text-sm">
                  {openOrder.customer_email && (
                    <div className="flex items-center gap-2">
                      <Mail size={14} className="text-gray-400" />
                      <span>{openOrder.customer_email}</span>
                    </div>
                  )}
                  {openOrder.customer_phone && (
                    <div className="flex items-center gap-2">
                      <Phone size={14} className="text-gray-400" />
                      <a
                        href={`tel:${openOrder.customer_phone}`}
                        className="text-[#0E3B2E] hover:underline"
                      >
                        {openOrder.customer_phone}
                      </a>
                    </div>
                  )}
                  {!openOrder.customer_email && !openOrder.customer_phone && (
                    <p className="text-xs text-gray-400 italic">
                      Aucun contact renseigné
                    </p>
                  )}
                </div>

                {/* Notes */}
                {openOrder.notes && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm">
                    <p className="text-xs font-medium text-amber-800 uppercase mb-1">
                      Note client
                    </p>
                    <p className="text-amber-900">{openOrder.notes}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmployeeKanban;
