import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  ChefHat,
  Clock,
  CreditCard,
  Loader2,
  Package,
  RotateCcw,
  ShoppingBag,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";
import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";
import { OrderStatusTimeline } from "@/components/OrderStatusTimeline";
import { useAuth } from "@/hooks/useAuth";
import { useUserOrders, type UserOrder } from "@/hooks/useUserOrders";
import { supabase } from "@/integrations/supabase/client";
import { useCartStore } from "@/stores/cartStore";
import type { Product, ProductUnit, ProductUnitType } from "@/types/product";

const PARIS_TZ = "Europe/Paris";

const PRODUCT_COLUMNS =
  "id, name, description, price_cents, unit, category, image_url, in_stock, unit_type, price_per_kg, estimated_weight_kg, poids_min_kg, poids_max_kg";

const mapRowToProduct = (row: any): Product => ({
  id: row.id,
  name: row.name,
  description: row.description,
  priceCents: row.price_cents,
  unit: row.unit as ProductUnit,
  category: row.category,
  imageUrl: row.image_url,
  inStock: row.in_stock,
  unitType: ((row.unit_type as ProductUnitType) ?? "unit") as ProductUnitType,
  pricePerKg: row.price_per_kg,
  estimatedWeightKg: row.estimated_weight_kg,
  poidsMinKg: row.poids_min_kg,
  poidsMaxKg: row.poids_max_kg,
});

const formatEUR = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    (cents ?? 0) / 100,
  );

const STATUS_CONFIG: Record<
  string,
  {
    label: string;
    Icon: typeof Clock;
    bg: string;
    text: string;
    dot: string;
  }
> = {
  pending: {
    label: "En attente",
    Icon: Clock,
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  confirmed: {
    label: "Confirmée",
    Icon: CheckCircle2,
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-500",
  },
  preparing: {
    label: "En préparation",
    Icon: ChefHat,
    bg: "bg-indigo-50",
    text: "text-indigo-700",
    dot: "bg-indigo-500",
  },
  ready: {
    label: "Prête à retirer",
    Icon: Package,
    bg: "bg-green-50",
    text: "text-green-700",
    dot: "bg-green-600",
  },
  picked_up: {
    label: "Retirée",
    Icon: CheckCircle2,
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-600",
  },
  cancelled: {
    label: "Annulée",
    Icon: XCircle,
    bg: "bg-red-50",
    text: "text-red-700",
    dot: "bg-red-500",
  },
};

const formatSlot = (slot: UserOrder["pickup_slot"]): string => {
  if (!slot) return "Créneau à confirmer";
  const start = toZonedTime(new Date(slot.slot_start), PARIS_TZ);
  const end = toZonedTime(new Date(slot.slot_end), PARIS_TZ);
  const today = toZonedTime(new Date(), PARIS_TZ);
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  let day: string;
  if (isSameDay(start, today)) day = "Aujourd'hui";
  else if (isSameDay(start, tomorrow)) day = "Demain";
  else day = format(start, "EEE d MMM", { locale: fr });
  return `${day} · ${format(start, "HH'h'mm", { locale: fr })}–${format(end, "HH'h'mm", { locale: fr })}`;
};

const formatCreatedAt = (iso: string): string => {
  const date = toZonedTime(new Date(iso), PARIS_TZ);
  const today = toZonedTime(new Date(), PARIS_TZ);
  if (date.toDateString() === today.toDateString()) {
    return `Aujourd'hui à ${format(date, "HH'h'mm", { locale: fr })}`;
  }
  return format(date, "d MMM yyyy", { locale: fr });
};

const StatusPill = ({ status }: { status: string }) => {
  const cfg = STATUS_CONFIG[status] ?? {
    label: status,
    Icon: Clock,
    bg: "bg-gray-100",
    text: "text-gray-700",
    dot: "bg-gray-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}
    >
      <span aria-hidden className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

// Statuts pour lesquels la frise de suivi temps-réel est pertinente
// (commande en cours, ni annulée ni archivée). On couvre EN + FR.
const ACTIVE_STATUSES = new Set([
  "confirmed",
  "preparing",
  "ready",
  "a_preparer",
  "en_preparation",
  "pret",
]);

const OrderCard = ({ order, idx }: { order: UserOrder; idx: number }) => {
  const items = Array.isArray(order.items) ? order.items : [];
  const itemCount = items.reduce((n, i) => n + i.quantity, 0);
  const shortId = order.id.slice(0, 8).toUpperCase();
  const previewItems = items.slice(0, 2);
  const remaining = items.length - previewItems.length;
  const navigate = useNavigate();
  const [reordering, setReordering] = useState(false);

  const handleReorder = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (reordering || items.length === 0) return;
    setReordering(true);

    try {
      // Collect unique product IDs
      const productIds = [
        ...new Set(items.map((i) => i.product_id).filter(Boolean)),
      ];
      if (productIds.length === 0) {
        toast.error("Aucun produit à ajouter");
        return;
      }

      // Fetch current product data from Supabase
      const { data: rows, error } = await supabase
        .from("products")
        .select(PRODUCT_COLUMNS)
        .in("id", productIds);

      if (error) throw error;

      const productMap = new Map<string, Product>();
      for (const row of rows ?? []) {
        const product = mapRowToProduct(row);
        if (product.inStock) {
          productMap.set(product.id, product);
        }
      }

      let added = 0;
      const { addItem } = useCartStore.getState();

      for (const item of items) {
        const product = productMap.get(item.product_id);
        if (!product) continue;

        const unitType = product.unitType ?? "unit";

        if (unitType === "weight") {
          // Pass quantiteKg from original order line if available
          const kg = item.quantite_kg ?? product.estimatedWeightKg ?? 1;
          addItem(product, { quantiteKg: kg });
        } else {
          // For unit and weight_bracket, add quantity times
          for (let q = 0; q < item.quantity; q++) {
            addItem(product);
          }
        }
        added++;
      }

      const unavailable = items.length - added;

      if (added === 0) {
        toast.error("Les produits de cette commande ne sont plus disponibles");
        return;
      }

      if (unavailable > 0) {
        toast.success(
          `${added} produit${added > 1 ? "s" : ""} ajouté${added > 1 ? "s" : ""} au panier`,
          {
            description: `${unavailable} produit${unavailable > 1 ? "s" : ""} non disponible${unavailable > 1 ? "s" : ""}`,
          },
        );
      } else {
        toast.success(
          `${added} produit${added > 1 ? "s" : ""} ajouté${added > 1 ? "s" : ""} au panier`,
        );
      }

      navigate("/panier");
    } catch (err) {
      console.error("Reorder failed:", err);
      toast.error("Impossible de recharger les produits");
    } finally {
      setReordering(false);
    }
  };

  return (
    <Link
      to={`/commande/confirmee/${order.id}`}
      className="group block rounded-2xl bg-white border border-border p-4 shadow-sm hover:shadow-md hover:border-[#0E3B2E]/30 active:scale-[0.99] transition-all animate-in fade-in slide-in-from-bottom-1 duration-300 [animation-fill-mode:backwards]"
      style={{ animationDelay: `${Math.min(idx, 6) * 50}ms` }}
    >
      {/* Top row : statut + date */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <StatusPill status={order.status} />
        <span className="text-xs text-muted">
          {formatCreatedAt(order.created_at)}
        </span>
      </div>

      {/* Numéro de commande */}
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="text-base font-bold text-[#0E3B2E] font-mono tracking-wider">
          #{shortId}
        </p>
        <p className="text-lg font-bold text-text tabular-nums">
          {formatEUR(order.total_cents)}
        </p>
      </div>

      {/* Preview articles */}
      <p className="text-sm text-muted line-clamp-2">
        {previewItems
          .map((item) => `${item.quantity} × ${item.name}`)
          .join(" · ")}
        {remaining > 0 && (
          <span className="font-medium text-[#0E3B2E]">
            {" "}
            +{remaining} autre{remaining > 1 ? "s" : ""}
          </span>
        )}
      </p>

      {/* Footer : créneau + payment + item count */}
      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5 min-w-0 truncate">
          <Clock size={12} className="text-[#0E3B2E] shrink-0" aria-hidden />
          <span className="truncate">{formatSlot(order.pickup_slot)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 shrink-0">
          {order.payment_method === "online" ? (
            <CreditCard size={12} className="text-[#0E3B2E]" aria-hidden />
          ) : (
            <Banknote size={12} className="text-[#0E3B2E]" aria-hidden />
          )}
          <span>
            {itemCount} article{itemCount > 1 ? "s" : ""}
          </span>
        </span>
      </div>

      {/* Suivi temps-réel : frise de statut (commandes en cours) */}
      {ACTIVE_STATUSES.has(order.status) && (
        <div className="mt-3 pt-3 border-t border-border">
          <OrderStatusTimeline
            status={order.status}
            slotStart={order.pickup_slot?.slot_start ?? null}
          />
        </div>
      )}

      {/* Actions row : reorder (44×44 tap) + voir détail */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={reordering || items.length === 0}
          onClick={handleReorder}
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 px-3 rounded-xl border border-[#0E3B2E]/30 text-[#0E3B2E] text-sm font-semibold hover:bg-[#0E3B2E]/5 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none transition-all"
          aria-label="Commander à nouveau"
        >
          {reordering ? (
            <Loader2 size={15} className="animate-spin" aria-hidden />
          ) : (
            <RotateCcw size={15} aria-hidden />
          )}
          Commander à nouveau
        </button>
        <span
          className="inline-flex items-center justify-center h-11 w-11 rounded-xl bg-[#0E3B2E]/5 text-[#0E3B2E] shrink-0 group-hover:bg-[#0E3B2E] group-hover:text-white transition-colors"
          aria-hidden
        >
          <ArrowRight
            size={16}
            className="group-hover:translate-x-0.5 transition-transform"
          />
        </span>
      </div>
    </Link>
  );
};

/** Statut FR (commandes_drive) -> statut EN (UI / STATUS_CONFIG). */
const STATUT_FR_TO_EN: Record<string, string> = {
  a_preparer: "confirmed",
  en_preparation: "preparing",
  pret: "ready",
  retire: "picked_up",
  annule: "cancelled",
};

export default function Orders() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;
  const email = user?.email;
  const queryClient = useQueryClient();
  const {
    data: orders,
    isLoading,
    isError,
    refetch,
  } = useUserOrders(userId, email);

  // Suivi temps-réel : on écoute les changements de statut côté
  // commandes_drive (filtré sur l'email du client) ET côté orders (filtré
  // sur user_id). À chaque UPDATE on patche le cache React Query en live,
  // puis on invalide pour resynchroniser items / créneau si besoin.
  useEffect(() => {
    if (!userId || !email) return;

    const queryKey = ["user-orders", userId, email] as const;

    const patchStatus = (orderId: string, statusEn: string) => {
      queryClient.setQueryData<UserOrder[]>(queryKey, (prev) =>
        prev
          ? prev.map((o) => (o.id === orderId ? { ...o, status: statusEn } : o))
          : prev,
      );
    };

    const channel = supabase
      .channel(`user-orders-${userId}`)
      // Drive au poids : commandes_drive filtré sur l'email du client.
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "commandes_drive",
          filter: `client_email=eq.${email}`,
        },
        (payload) => {
          const row = payload.new as { id?: string; statut?: string };
          if (row?.id && row.statut) {
            patchStatus(row.id, STATUT_FR_TO_EN[row.statut] ?? row.statut);
          }
          queryClient.invalidateQueries({ queryKey });
        },
      )
      // Commandes legacy (Stripe Checkout) : orders filtré sur user_id.
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { id?: string; status?: string };
          if (row?.id && row.status) {
            patchStatus(row.id, row.status);
          }
          queryClient.invalidateQueries({ queryKey });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, email, queryClient]);

  return (
    <div className="min-h-dvh bg-[#FAF7EE] pb-20 md:pb-0">
      <AppHeader showBack title="Mes commandes" />

      <main className="max-w-2xl mx-auto px-4 py-4">
        {authLoading || isLoading ? (
          <ul className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <li
                key={i}
                className="h-36 rounded-2xl bg-[linear-gradient(90deg,#E8E4D8_0%,#F2F2EE_50%,#E8E4D8_100%)] bg-[length:200%_100%] animate-skeleton-shimmer"
              />
            ))}
          </ul>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center text-center py-20 px-6 gap-4">
            <AlertCircle size={36} className="text-destructive" aria-hidden />
            <h2 className="text-lg font-semibold text-text">
              Impossible de charger vos commandes
            </h2>
            <p className="text-sm text-muted max-w-xs">
              Vérifiez votre connexion et réessayez.
            </p>
            <button
              onClick={() => refetch()}
              className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#0E3B2E] text-white text-sm font-semibold active:scale-[0.98] transition-all"
            >
              Réessayer
            </button>
          </div>
        ) : !orders || orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 px-6 gap-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="relative w-28 h-28 rounded-full bg-gradient-to-br from-[#0E3B2E]/10 to-[#C9A227]/10 flex items-center justify-center">
              <div className="absolute inset-3 rounded-full bg-white shadow-sm" />
              <ShoppingBag
                className="relative text-[#0E3B2E]"
                size={44}
                strokeWidth={1.5}
                aria-hidden
              />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-bold text-text">
                Aucune commande pour le moment
              </h2>
              <p className="text-sm text-muted max-w-xs">
                Vos prochaines commandes apparaîtront ici. Découvrez notre
                sélection halal pour commencer.
              </p>
            </div>
            <Link
              to="/"
              className="mt-2 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#0E3B2E] text-white text-sm font-semibold shadow-md shadow-[#0E3B2E]/20 hover:bg-[#082A20] active:scale-[0.98] transition-all"
            >
              Découvrir le catalogue
              <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between mb-3 px-1">
              <p className="text-xs text-muted font-medium">
                {orders.length} commande{orders.length > 1 ? "s" : ""}
              </p>
            </div>
            <ul className="flex flex-col gap-3">
              {orders.map((order, idx) => (
                <li key={order.id}>
                  <OrderCard order={order} idx={idx} />
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
