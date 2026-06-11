import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UserOrderItem {
  product_id: string;
  name: string;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
  /** Present on weight lines from commandes_drive_lignes. */
  quantite_kg?: number | null;
  /** unit_type from the original order line (unit, weight, weight_bracket). */
  unit_type?: string | null;
}

export interface UserOrderSlot {
  slot_start: string;
  slot_end: string;
}

export interface UserOrder {
  id: string;
  status: string;
  payment_method: "online" | "in_store";
  payment_status: string;
  total_cents: number;
  items: UserOrderItem[];
  created_at: string;
  pickup_slot: UserOrderSlot | null;
}

const fetchUserOrders = async (
  userId: string,
  email: string,
): Promise<UserOrder[]> => {
  // 1. Legacy orders table (Stripe Checkout flow)
  const { data: legacyOrders, error: errLegacy } = await supabase
    .from("orders")
    .select(
      "id, status, payment_method, payment_status, total_cents, items, created_at, pickup_slot:pickup_slots(slot_start, slot_end)",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (errLegacy) throw errLegacy;

  // 2. Drive au poids orders (commandes_drive, matched by email)
  const { data: driveOrders, error: errDrive } = await supabase
    .from("commandes_drive")
    .select(
      "id, statut, mode_paiement, statut_paiement, total_ttc, created_at, creneau_retrait, " +
        "commandes_drive_lignes (produit_id, quantite, prix_unitaire, montant_estime_ttc, quantite_estimee, quantite_reelle_pesee, produit:produits(nom))",
    )
    .eq("client_email", email)
    .order("created_at", { ascending: false })
    .limit(50);

  if (errDrive) throw errDrive;

  const mapped: UserOrder[] = (legacyOrders ?? []) as unknown as UserOrder[];

  for (const cd of (driveOrders ?? []) as unknown as Array<
    Record<string, unknown> & { id: string; created_at: string }
  >) {
    // Skip if already present in legacy (synced orders appear in both)
    if (mapped.some((o) => o.id === cd.id)) continue;

    const items: UserOrderItem[] = (
      (cd as any).commandes_drive_lignes ?? []
    ).map((l: any) => ({
      product_id: l.produit_id,
      name: l.produit?.nom ?? "Produit",
      unit_price_cents: Math.round(Number(l.prix_unitaire ?? 0) * 100),
      quantity: Number(l.quantite ?? 0),
      line_total_cents: Math.round(Number(l.montant_estime_ttc ?? 0) * 100),
      // Poids en kg : réel pesé si disponible, sinon estimé (la colonne
      // `quantite_kg` n'existe pas dans commandes_drive_lignes — c'était
      // l'origine de l'erreur PostgREST 42703 sur la page Mes commandes).
      quantite_kg:
        l.quantite_reelle_pesee != null
          ? Number(l.quantite_reelle_pesee)
          : l.quantite_estimee != null
            ? Number(l.quantite_estimee)
            : null,
    }));

    const creneauStart = (cd as any).creneau_retrait as string | null;
    const creneauEnd = creneauStart
      ? new Date(
          new Date(creneauStart).getTime() + 30 * 60 * 1000,
        ).toISOString()
      : null;

    let paymentStatus = "unpaid";
    if ((cd as any).statut_paiement === "capture") paymentStatus = "paid";
    else if ((cd as any).statut_paiement === "autorise")
      paymentStatus = "authorized";

    mapped.push({
      id: cd.id,
      status: (cd as any).statut,
      payment_method:
        (cd as any).mode_paiement === "stripe" ? "online" : "in_store",
      payment_status: paymentStatus,
      total_cents: Math.round(Number((cd as any).total_ttc ?? 0) * 100),
      items,
      created_at: cd.created_at,
      pickup_slot:
        creneauStart && creneauEnd
          ? { slot_start: creneauStart, slot_end: creneauEnd }
          : null,
    });
  }

  mapped.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return mapped;
};

export const useUserOrders = (
  userId: string | undefined,
  email?: string | undefined,
) =>
  useQuery({
    queryKey: ["user-orders", userId, email],
    queryFn: () => fetchUserOrders(userId!, email!),
    enabled: !!userId && !!email,
    staleTime: 30 * 1000,
  });
