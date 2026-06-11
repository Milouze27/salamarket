import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  Banknote,
  Calendar,
  Clock,
  CreditCard,
  Loader2,
  QrCode,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";

import { Button } from "@/components/ui/button";
import {
  supabase,
  functionsUrl,
  SUPABASE_PUBLISHABLE_KEY,
} from "@/integrations/supabase/client";
import { useCartStore } from "@/stores/cartStore";
import { useCheckoutStore } from "@/stores/checkoutStore";

// Check mark SVG dessiné via stroke-dashoffset, halo qui pulse autour, le
// tout entouré d'un cercle qui pop. Plus mémorable qu'un CheckCircle2 statique.
const SuccessBadge = () => (
  <div className="relative flex items-center justify-center">
    {/* Halos qui s'expansent (3 vagues décalées) */}
    {[0, 0.3, 0.6].map((delay) => (
      <span
        key={delay}
        aria-hidden
        className="absolute inset-0 rounded-full bg-[#C9A227]/40 animate-halo-ping"
        style={{ animationDelay: `${delay}s` }}
      />
    ))}
    {/* Cercle principal sapin avec gradient doré subtil */}
    <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-[#0E3B2E] to-[#082A20] shadow-xl shadow-[#0E3B2E]/30 animate-success-pop">
      <svg
        viewBox="0 0 52 52"
        className="w-12 h-12"
        fill="none"
        stroke="#C9A227"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d="M14 27 L23 36 L40 18"
          strokeDasharray="60"
          strokeDashoffset="60"
          className="animate-draw-check"
        />
      </svg>
    </div>
  </div>
);

const PARIS_TZ = "Europe/Paris";

const formatEUR = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    (cents ?? 0) / 100,
  );

interface OrderItem {
  product_id: string;
  name: string;
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
}

interface PickupSlot {
  id: string;
  slot_start: string;
  slot_end: string;
}

interface Order {
  id: string;
  status: string;
  payment_method: "online" | "in_store";
  payment_status: "paid" | "unpaid" | "authorized" | string;
  total_cents: number;
  /** Drive au poids : montant pré-autorisé (≈ estimé × 1,20) avant pesée. */
  authorized_cents?: number | null;
  /** Drive au poids : montant réellement débité après pesée et capture. */
  captured_cents?: number | null;
  items: OrderItem[];
  notes: string | null;
  pickup_slot: PickupSlot | null;
}

function formatSlotLabel(slot: PickupSlot) {
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

  const startTime = format(start, "HH'h'mm", { locale: fr });
  const endTime = format(end, "HH'h'mm", { locale: fr });
  return `${dayLabel} · ${startTime} - ${endTime}`;
}

const OrderConfirmation = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const clearCart = useCartStore((s) => s.clear);
  const clearSlot = useCheckoutStore((s) => s.clearSlot);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  // FUNC-01 — après un retour de paiement (notamment 3DS), le webhook Stripe
  // bascule payment_status côté serveur de façon asynchrone. Tant qu'il reste
  // "unpaid" pour un paiement en ligne, on poll confirm-order (idempotent) au
  // lieu de laisser l'utilisateur sur un état figé. `polling` pilote l'UI.
  const [polling, setPolling] = useState(false);

  // Appelle confirm-order au mount (idempotent côté serveur).
  // Garde via useRef contre le double-call de React StrictMode.
  // Sur succès, met à jour le state local de l'order ; sur erreur, on log
  // mais on ne bloque pas l'affichage (le verify-checkout-session ci-dessous
  // a déjà chargé l'order depuis la base).
  const confirmCalledRef = useRef(false);
  useEffect(() => {
    if (confirmCalledRef.current) return;
    confirmCalledRef.current = true;
    if (!orderId) return;

    // NE PAS clearCart ici inconditionnellement. Si l'user re-visite
    // cette URL depuis l'historique après avoir rempli un NOUVEAU panier,
    // on viderait son nouveau panier (bug remonté en review). Le clear
    // est désormais fait UNIQUEMENT dans le 2e useEffect ci-dessous, sur
    // confirmation explicite de payment_status === "paid" (verify OK)
    // ou payment_method === "in_store".

    const sessionId = searchParams.get("session_id");

    supabase.functions
      .invoke("confirm-order", {
        body: { order_id: orderId, session_id: sessionId },
      })
      .then(({ data, error }) => {
        if (error) {
          console.error("[confirm-order] failed:", error);
          return;
        }
        if (data?.order) {
          setOrder(data.order as Order);
        }
      });
  }, [orderId, searchParams, clearCart, clearSlot]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!orderId) {
          setError("Identifiant de commande manquant");
          setLoading(false);
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          setError("Session expirée");
          setLoading(false);
          return;
        }

        const sessionId = searchParams.get("session_id");
        const res = await fetch(
          functionsUrl("verify-checkout-session"),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${session.access_token}`,
              apikey: SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify({
              order_id: orderId,
              session_id: sessionId ?? null,
            }),
          },
        );

        const data = await res.json();
        if (cancelled) return;

        if (!res.ok || !data.order) {
          setError(data.error ?? "Commande introuvable");
          setLoading(false);
          return;
        }

        const fetchedOrder: Order = data.order;
        setOrder(fetchedOrder);

        if (
          fetchedOrder.payment_status === "paid" ||
          fetchedOrder.payment_status === "authorized" ||
          fetchedOrder.payment_method === "in_store"
        ) {
          clearCart();
          clearSlot();
        }
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message ?? "Erreur inconnue");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId, searchParams, clearCart, clearSlot]);

  // FUNC-01 — polling du statut de paiement.
  // Déclenché uniquement quand : commande chargée, paiement EN LIGNE, et statut
  // encore "unpaid" (le webhook Stripe n'a pas encore confirmé). On ré-invoque
  // confirm-order (idempotent) toutes les 3 s, max ~40 s, et on s'arrête dès
  // qu'on atteint un état terminal (paid / authorized) ou au timeout.
  //
  // Les deps sont PRIMITIVES (orderId + method + status), pas l'objet `order` :
  // ainsi la boucle interne peut appeler setOrder() sans relancer l'effet tant
  // que le statut reste "unpaid" (sinon le compteur d'essais se réinitialiserait
  // à chaque tick → polling infini). Quand le statut bascule, la dep status
  // change, l'effet est rejoué, et le early-return l'arrête proprement.
  const paymentMethod = order?.payment_method;
  const paymentStatus = order?.payment_status;
  useEffect(() => {
    if (!orderId) return;
    if (paymentMethod !== "online" || paymentStatus !== "unpaid") {
      setPolling(false);
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let timer: number | undefined;
    const MAX_ATTEMPTS = 13; // ~40 s à 3 s d'intervalle
    const INTERVAL_MS = 3000;
    setPolling(true);

    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const { data } = await supabase.functions.invoke("confirm-order", {
          body: { order_id: orderId },
        });
        if (cancelled) return;
        const refreshed = data?.order as Order | undefined;
        if (refreshed && refreshed.payment_status !== "unpaid") {
          // État terminal atteint : maj de l'order (la dep status change → cet
          // effet sera rejoué et s'arrêtera via l'early-return), vidage du
          // panier/créneau si payé/pré-autorisé.
          if (
            refreshed.payment_status === "paid" ||
            refreshed.payment_status === "authorized"
          ) {
            clearCart();
            clearSlot();
          }
          setOrder(refreshed);
          return;
        }
      } catch {
        // Erreur réseau ponctuelle : on retentera au prochain tick.
      }
      if (attempts >= MAX_ATTEMPTS) {
        setPolling(false);
        return;
      }
      if (!cancelled) {
        timer = window.setTimeout(tick, INTERVAL_MS);
      }
    };

    timer = window.setTimeout(tick, INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [orderId, paymentMethod, paymentStatus, clearCart, clearSlot]);

  if (loading) {
    return (
      <div
        className="min-h-dvh flex flex-col items-center justify-center gap-3 bg-background p-4"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 1rem)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)",
        }}
      >
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          Vérification de votre commande...
        </p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div
        className="min-h-dvh flex flex-col items-center justify-center gap-4 bg-background p-4 text-center"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 1rem)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)",
        }}
      >
        <AlertCircle className="w-16 h-16 text-destructive" />
        <h1 className="text-2xl font-semibold">Commande introuvable</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          {error ?? "Cette commande n'existe pas ou n'est pas accessible."}
        </p>
        <Button onClick={() => navigate("/")} className="mt-2">
          Retour à l'accueil
        </Button>
      </div>
    );
  }

  const orderShortId = order.id.slice(0, 8).toUpperCase();
  const items = Array.isArray(order.items) ? order.items : [];

  return (
    <div
      className="min-h-dvh bg-cream"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="max-w-xl mx-auto px-5 md:px-8 space-y-7">
        {/* En-tête claque — pagination "01 / Commande reçue" + sceau
            success ancré + titre HUGE + body. */}
        <header className="pt-12 md:pt-20 pb-2">
          <div className="flex items-center gap-4 mb-7 animate-in fade-in slide-in-from-top-2 duration-500">
            <span className="text-[26px] md:text-[30px] font-extrabold text-[#C9A227] tabular-nums leading-none tracking-[-0.04em]">
              01
            </span>
            <span
              aria-hidden
              className="h-px flex-1 max-w-[80px] bg-[#0E3B2E]/25"
            />
            <span className="text-[10px] uppercase tracking-[0.32em] font-bold text-[#0E3B2E]">
              Commande reçue
            </span>
          </div>

          {/* Sceau success ancré à gauche + titre dramatique. Le scale-75
              du sceau réduit son emprise pour laisser la typographie
              porter le moment claque. */}
          <div className="flex items-center gap-5 mb-6 animate-in fade-in zoom-in-95 duration-500 delay-100 [animation-fill-mode:backwards]">
            <div className="scale-[0.8] origin-left -ml-2">
              <SuccessBadge />
            </div>
          </div>

          <h1 className="text-[44px] sm:text-[56px] md:text-[68px] lg:text-[80px] leading-[0.94] text-[#0E3B2E] font-extrabold tracking-[-0.04em] animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200 [animation-fill-mode:backwards]">
            Merci.
            <br />
            <span className="text-[#C9A227]">On s'en occupe.</span>
          </h1>

          <p className="mt-7 text-[15px] md:text-[16px] leading-[1.55] text-[#0F1A14]/75 max-w-[44ch] animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300 [animation-fill-mode:backwards]">
            Votre commande est transmise à l'équipe Salamarket. Nous la
            préparons avec soin pour votre créneau de retrait.
          </p>
        </header>

        {/* Référence commande — typographique, pas un card avec gradient.
            Le numéro est l'info utile, on le pose en grand sans fioriture. */}
        <section className="border-t border-[#0E3B2E]/15 pt-6 animate-in fade-in slide-in-from-bottom-3 duration-500 delay-500 [animation-fill-mode:backwards]">
          <p className="text-[10px] uppercase tracking-[0.28em] font-bold text-[#C9A227] mb-2">
            Référence
          </p>
          <p className="text-3xl md:text-4xl font-mono font-semibold uppercase text-[#0E3B2E] select-allow tracking-tight">
            {orderShortId}
          </p>
          <p className="mt-2 text-xs text-[#6B7280]">
            Présentez ce numéro au comptoir lors du retrait.
          </p>
        </section>

        {/* Créneau de retrait — bloc éditorial typographique */}
        <section className="border-t border-[#0E3B2E]/15 pt-6 animate-in fade-in slide-in-from-bottom-3 duration-500 [animation-delay:600ms] [animation-fill-mode:backwards]">
          <p className="text-[10px] uppercase tracking-[0.28em] font-bold text-[#C9A227] mb-2 flex items-center gap-2">
            <Calendar size={11} aria-hidden />
            Votre créneau
          </p>
          <p className="text-[20px] md:text-[24px] leading-[1.15] text-[#0E3B2E] font-bold tracking-[-0.02em]">
            {order.pickup_slot
              ? formatSlotLabel(order.pickup_slot)
              : "Créneau à confirmer"}
          </p>
          <p className="mt-2 text-xs text-[#6B7280]">
            8 av. Larrieu&#8209;Thibaud · 31100 Toulouse
          </p>
        </section>

        {/* Articles — liste éditoriale, pas tableau */}
        <section className="border-t border-[#0E3B2E]/15 pt-6 animate-in fade-in slide-in-from-bottom-3 duration-500 delay-700 [animation-fill-mode:backwards]">
          <p className="text-[10px] uppercase tracking-[0.28em] font-bold text-[#C9A227] mb-4">
            Articles ({items.length})
          </p>
          <ul className="space-y-2.5">
            {items.map((item, idx) => (
              <li
                key={`${item.product_id}-${idx}`}
                className="flex items-baseline justify-between gap-3 text-[14px]"
              >
                <span className="text-[#0F1A14]/85">
                  <span className="text-[#C9A227] font-semibold tabular-nums mr-2">
                    {item.quantity}×
                  </span>
                  {item.name}
                </span>
                <span className="text-[#6B7280] tabular-nums whitespace-nowrap">
                  {formatEUR(item.line_total_cents)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-5 pt-5 border-t border-[#0E3B2E]/15 flex items-baseline justify-between">
            <span className="text-[13px] uppercase tracking-[0.18em] font-bold text-[#0E3B2E]">
              {order.payment_status === "authorized"
                ? "Total estimé"
                : "Total réglé"}
            </span>
            <span className="text-[28px] md:text-[32px] font-extrabold text-[#0E3B2E] tabular-nums tracking-[-0.025em]">
              {formatEUR(order.total_cents)}
            </span>
          </div>
        </section>

        {/* Statut paiement — ligne discrète, plus de badge orange/primary
            qui casse l'atmosphère "lettre". */}
        <section className="border-t border-[#0E3B2E]/15 pt-6 animate-in fade-in slide-in-from-bottom-3 duration-500 delay-[800ms] [animation-fill-mode:backwards]">
          {order.payment_method === "online" &&
            order.payment_status === "paid" && (
              <div className="flex items-start gap-3">
                <CreditCard
                  className="text-[#C9A227] shrink-0 mt-0.5"
                  size={18}
                  aria-hidden
                />
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-[#0E3B2E]">
                    Payé en ligne
                  </p>
                  <p className="text-[13px] text-[#0F1A14]/70 mt-0.5">
                    Aucun règlement n'est à effectuer au retrait.
                  </p>
                </div>
              </div>
            )}

          {order.payment_method === "online" &&
            order.payment_status === "authorized" && (
              <div className="flex items-start gap-3">
                <CreditCard
                  className="text-[#C9A227] shrink-0 mt-0.5"
                  size={18}
                  aria-hidden
                />
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-[#0E3B2E]">
                    Pré-autorisé{" "}
                    {order.authorized_cents ? (
                      <>
                        :{" "}
                        <span className="tabular-nums">
                          {formatEUR(order.authorized_cents)}
                        </span>
                      </>
                    ) : null}
                  </p>
                  <p className="text-[13px] text-[#0F1A14]/70 mt-0.5">
                    Le montant final sera ajusté après pesée en magasin
                    {order.authorized_cents
                      ? `, entre ${formatEUR(order.total_cents)} et ${formatEUR(
                          order.authorized_cents,
                        )}.`
                      : "."}
                  </p>
                </div>
              </div>
            )}

          {order.payment_method === "in_store" && (
            <div className="flex items-start gap-3">
              <Banknote
                className="text-[#C9A227] shrink-0 mt-0.5"
                size={18}
                aria-hidden
              />
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-[#0E3B2E]">
                  À régler au retrait — {formatEUR(order.total_cents)}
                </p>
                <p className="text-[13px] text-[#0F1A14]/70 mt-0.5">
                  Espèces ou carte bancaire acceptés.
                </p>
              </div>
            </div>
          )}

          {order.payment_method === "online" &&
            order.payment_status === "unpaid" && (
              <div className="flex items-start gap-3" aria-live="polite">
                {polling ? (
                  <Loader2
                    className="text-[#C9A227] shrink-0 mt-0.5 animate-spin"
                    size={18}
                    aria-hidden
                  />
                ) : (
                  <Clock
                    className="text-[#6B7280] shrink-0 mt-0.5"
                    size={18}
                    aria-hidden
                  />
                )}
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-[#0E3B2E]">
                    {polling
                      ? "Confirmation du paiement en cours…"
                      : "Paiement en cours de validation"}
                  </p>
                  <p className="text-[13px] text-[#0F1A14]/70 mt-0.5">
                    {polling
                      ? "Merci de patienter quelques instants, nous confirmons votre paiement."
                      : "Votre paiement a bien été reçu. La confirmation peut prendre un instant — vous recevrez un email dès qu'elle est validée."}
                  </p>
                </div>
              </div>
            )}

          {order.notes && (
            <p className="mt-4 pt-4 border-t border-dashed border-[#0E3B2E]/15 text-[13px] text-[#0F1A14]/70 italic">
              <span className="text-[#C9A227] not-italic font-semibold mr-1">
                Note transmise :
              </span>
              {order.notes}
            </p>
          )}
        </section>

        {/* Traçabilité halal — promesse différenciante.
            Le ticket d'impression magasin inclut un QR code par lot pour
            chaque viande/charcuterie. On le rappelle ici pour ancrer la
            valeur "Salamarket = lot traçable", pas "Salamarket = caisse". */}
        <section className="border-t border-[#0E3B2E]/15 pt-6 animate-in fade-in slide-in-from-bottom-3 duration-500 delay-[850ms] [animation-fill-mode:backwards]">
          <p className="text-[10px] uppercase tracking-[0.28em] font-bold text-[#C9A227] mb-3 flex items-center gap-2">
            <QrCode size={11} aria-hidden />
            Traçabilité halal
          </p>
          <p className="text-[14px] text-[#0F1A14]/80 leading-relaxed max-w-[48ch]">
            Votre QR de traçabilité halal sera imprimé sur votre ticket de
            retrait pour vérifier l&apos;origine de votre viande.
          </p>
        </section>

        {/* Bandeau service — pro, pas signature personnelle */}
        <section className="border-t border-[#0E3B2E]/15 pt-6 animate-in fade-in duration-700 delay-[900ms] [animation-fill-mode:backwards]">
          <p className="text-[10px] uppercase tracking-[0.28em] font-bold text-[#C9A227] mb-2">
            Une question ?
          </p>
          <p className="text-[14px] text-[#0F1A14]/80 leading-relaxed max-w-[48ch]">
            L'équipe Salamarket est joignable au magasin pendant les horaires
            d'ouverture, ou via votre espace commandes.
          </p>
        </section>

        {/* CTAs bas — primary plein sapin, secondary souligné éditorial */}
        <div className="pt-4 pb-10 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-1000 [animation-fill-mode:backwards]">
          <button
            type="button"
            className="w-full h-12 rounded-full bg-sapin text-white text-[15px] font-semibold shadow-md shadow-sapin/20 hover:bg-sapin-deep hover:shadow-lg active:scale-[0.98] transition-all"
            onClick={() => {
              clearCart();
              clearSlot();
              navigate("/commandes");
            }}
          >
            Voir mes commandes
          </button>
          <button
            type="button"
            className="w-full h-11 text-[14px] font-semibold text-sapin underline underline-offset-[6px] decoration-gold/60 decoration-[1.5px] hover:decoration-gold transition-colors"
            onClick={() => {
              clearCart();
              clearSlot();
              navigate("/");
            }}
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderConfirmation;
