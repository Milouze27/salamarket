import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Clock, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCartStore } from "@/stores/cartStore";
import { useCheckoutStore } from "@/stores/checkoutStore";
import { supabase } from "@/integrations/supabase/client";
import {
  computeCartTotalsCents,
  computePrixEstime,
  formatKg,
} from "@/lib/drive-pesee";
import { Scale } from "lucide-react";
import { DriveStripePayment } from "@/components/DriveStripePayment";

const MIN_ORDER_CENTS = 1500;
const PARIS_TZ = "Europe/Paris";
const NOTES_MAX = 200;

const formatEUR = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    cents / 100
  );

interface SlotInfo {
  id: string;
  slot_start: string;
  slot_end: string;
}

function formatSlotLabel(slot: SlotInfo) {
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

export default function Checkout() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const items = useCartStore((s) => s.items);
  const selectedSlotId = useCheckoutStore((s) => s.selectedSlotId);

  // Paiement en ligne uniquement — paiement au retrait retiré
  // (risque de non-retrait et abandon de commande)
  const paymentMethod = "online" as const;
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [slot, setSlot] = useState<SlotInfo | null>(null);
  // Quand on a un commande_id mais pas (encore) de redirect → on entre
  // en mode "Stripe Elements" inline (Drive au poids = manual capture).
  const [commandeIdForElements, setCommandeIdForElements] = useState<
    string | null
  >(null);

  // Garde 1 : panier vide → /panier (sauf si on est en train de soumettre
  // la commande — le clear cart se fait sur OrderConfirmation au mount)
  useEffect(() => {
    if (items.length === 0 && !loading) {
      navigate("/panier", { replace: true });
    }
  }, [items.length, navigate, loading]);

  // Garde 2 : pas de créneau → /creneaux
  useEffect(() => {
    if (items.length > 0 && !selectedSlotId) {
      navigate("/creneaux", { replace: true });
    }
  }, [selectedSlotId, items.length, navigate]);

  // Garde 3 : commande minimum 15 € — filet de sécurité
  const guardSubtotal = useMemo(
    () =>
      items.reduce((sum, i) => {
        const qty =
          i.unitType === "weight"
            ? (i.quantiteKg ?? 0) * i.quantity
            : i.quantity;
        const eur = computePrixEstime(i.product, qty, i.bracketIndex ?? 0);
        return sum + Math.round(eur * 100);
      }, 0),
    [items],
  );
  useEffect(() => {
    if (items.length > 0 && guardSubtotal < MIN_ORDER_CENTS) {
      toast.error("Commande minimum 15 €");
      navigate("/panier", { replace: true });
    }
  }, [guardSubtotal, items.length, navigate]);

  // Toast cancelled
  useEffect(() => {
    if (searchParams.get("cancelled") === "1") {
      toast.info(
        "Paiement annulé. Vous pouvez réessayer ou choisir un autre mode de paiement."
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Charge les infos du créneau choisi
  useEffect(() => {
    if (!selectedSlotId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("pickup_slots")
        .select("id, slot_start, slot_end")
        .eq("id", selectedSlotId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.error("Créneau introuvable, merci d'en choisir un autre");
        navigate("/creneaux", { replace: true });
        return;
      }
      setSlot(data as SlotInfo);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSlotId, navigate]);

  // FIX 2026-05-16 : source unique de vérité pour total + autorise.
  // Avant : `preAuthCents = totalCents * 1.20` appliquait la marge à
  // tout le panier, brackets ET unit inclus (bug logique). Et le
  // hasWeightLine considérait à tort `weight_bracket` comme nécessitant
  // une marge — or le bracket est à prix fixe forfaitaire.
  // Maintenant la formule métier est centralisée dans
  // computeCartTotalsCents : marge ×1.20 SEULEMENT sur lignes weight,
  // bracket + unit passent sans marge.
  const totals = useMemo(() => computeCartTotalsCents(items), [items]);
  const totalLabel = useMemo(
    () => formatEUR(totals.totalCents),
    [totals.totalCents],
  );
  const hasWeightLine = totals.hasWeightLine;
  const preAuthCents = totals.autoriseCents;
  const preAuthLabel = useMemo(() => formatEUR(preAuthCents), [preAuthCents]);

  const handleSubmit = async () => {
    if (!selectedSlotId) return;
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Session expirée, merci de vous reconnecter");
        navigate("/connexion", { replace: true });
        return;
      }

      const payload = {
        items: items.map((i) => ({
          product_id: i.product.id,
          quantity: i.quantity,
          // Champs Drive au poids — l'endpoint create-checkout-session
          // les ignore en l'état (V1) mais on les envoie déjà pour que
          // la prochaine itération backend les consomme sans avoir à
          // re-déployer le client.
          unit_type: i.unitType,
          quantite_kg: i.quantiteKg,
          bracket_index: i.bracketIndex,
        })),
        pickup_slot_id: selectedSlotId,
        payment_method: paymentMethod,
        notes: notes.trim() || undefined,
      };

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          toast.error(data.error ?? "Créneau complet", {
            action: {
              label: "Choisir un autre créneau",
              onClick: () => navigate("/creneaux"),
            },
          });
        } else {
          toast.error(data.error ?? "Erreur lors de la commande");
        }
        setLoading(false);
        return;
      }

      // ── Drive au poids ──────────────────────────────────────────
      // Quand la commande contient des lignes weight/weight_bracket et
      // que le backend renvoie un commande_id (sans checkout_url), on
      // bascule sur Stripe Elements inline (manual capture).
      if (hasWeightLine && data.commande_id) {
        setCommandeIdForElements(data.commande_id as string);
        setLoading(false);
        return;
      }

      if (data.checkout_url) {
        // Stripe : redirection externe immédiate, on quitte React.
        // Pas de clearCart ici — OrderConfirmation s'en charge au mount
        // quand Stripe redirige vers /commande/confirmee/ après paiement.
        window.location.href = data.checkout_url;
        return;
      }
      if (data.order_id) {
        // Paiement magasin : navigate direct vers la confirmation.
        // setLoading(true) reste actif → le garde-fou panier-vide est
        // muselé pendant la transition (cf useEffect ci-dessus).
        // OrderConfirmation clear le cart au mount.
        navigate(`/commande/confirmee/${data.order_id}`, { replace: true });
        return;
      }

      toast.error("Réponse serveur inattendue");
      setLoading(false);
    } catch (err) {
      console.error("[checkout]", err);
      toast.error("Erreur réseau, merci de réessayer");
      setLoading(false);
    }
  };

  if (items.length === 0 || !selectedSlotId) return null;

  const buttonLabel = hasWeightLine
    ? `Pré-autoriser ${preAuthLabel}`
    : `Payer ${totalLabel} en ligne`;

  return (
    <div className="min-h-dvh bg-background pb-24">
      {/* Header sticky — respecte safe-area-inset-top (Dynamic Island) */}
      <header
        className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background px-6 pb-3"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)",
        }}
      >
        <button
          onClick={() => navigate("/creneaux")}
          aria-label="Retour"
          className="rounded-full p-1 hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold">Paiement</h1>
      </header>

      <div className="space-y-5 px-6 py-5 max-w-2xl mx-auto">
        {/* Récapitulatif */}
        <section className="rounded-2xl bg-card p-5 shadow-sm border border-border/50">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            Récapitulatif de commande
          </h2>
          <ul className="space-y-2">
            {items.map((item) => {
              const isWeight = item.unitType === "weight";
              const eur = computePrixEstime(
                item.product,
                isWeight
                  ? (item.quantiteKg ?? 0) * item.quantity
                  : item.quantity,
                item.bracketIndex ?? 0,
              );
              return (
                <li
                  key={item.lineId}
                  className="flex items-start justify-between gap-3 text-sm"
                >
                  <span className="flex-1">
                    {isWeight ? (
                      <>
                        {item.product.name}
                        <span className="text-muted-foreground">
                          {" "}
                          · {formatKg((item.quantiteKg ?? 0) * item.quantity)} estimés
                        </span>
                      </>
                    ) : (
                      <>
                        {item.quantity} × {item.product.name}
                      </>
                    )}
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatEUR(Math.round(eur * 100))}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t pt-3">
            <span className="text-lg font-semibold">
              {hasWeightLine ? "Total estimé" : "Total"}
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {totalLabel}
            </span>
          </div>
          {hasWeightLine && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-[#FBF6E2] border border-[#C9A227]/40 p-3 text-[12px] text-[#3E2E0A] leading-relaxed">
              <Scale
                size={14}
                className="shrink-0 mt-0.5 text-[#C9A227]"
                aria-hidden
              />
              <span>
                <span className="font-bold">Montant autorisé : {preAuthLabel}</span>{" "}
                (estimation × 1,20). Vous serez débité du poids réel pesé en
                magasin.{" "}
                <a
                  href="/drive-au-poids"
                  className="underline underline-offset-2"
                >
                  En savoir plus
                </a>
              </span>
            </div>
          )}
        </section>

        {/* Créneau */}
        <section className="rounded-2xl bg-card p-5 shadow-sm border border-border/50">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            Créneau de retrait
          </h2>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">
                {slot ? formatSlotLabel(slot) : "Chargement…"}
              </span>
            </div>
            <button
              onClick={() => navigate("/creneaux")}
              className="text-sm font-medium text-primary hover:underline"
            >
              Modifier
            </button>
          </div>
        </section>

        {/* Mode de paiement — Stripe uniquement (paiement au retrait
            retiré : risque de non-retrait et abandon de commande) */}
        <section className="rounded-2xl bg-card p-5 shadow-sm border border-border/50">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            Paiement sécurisé en ligne
          </h2>

          {commandeIdForElements ? (
            // ── Drive au poids — Stripe Elements inline (manual capture) ─
            <DriveStripePayment
              commandeId={commandeIdForElements}
              estimatedCents={totals.totalCents}
              returnUrl={`${window.location.origin}/commande/confirmee/${commandeIdForElements}`}
              onError={(msg) =>
                toast.error(msg || "Erreur lors de l'initialisation du paiement")
              }
            />
          ) : (
            <div className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex-1">
                <div className="text-base font-semibold text-primary">
                  Carte bancaire via Stripe
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {hasWeightLine
                    ? "Pré-autorisation de l'estimation × 1,20. Vous serez débité du poids réel pesé en magasin."
                    : "Réservation immédiate de votre commande. Paiement sécurisé, débité au moment de la commande."}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Notes */}
        <section className="rounded-2xl bg-card p-5 shadow-sm border border-border/50">
          <Label
            htmlFor="notes"
            className="mb-2 block text-sm font-semibold text-muted-foreground"
          >
            Note pour le préparateur (optionnel)
          </Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, NOTES_MAX))}
            maxLength={NOTES_MAX}
            placeholder="Ex : bananes pas trop mûres, merci !"
            rows={3}
            className="resize-none"
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">
            {notes.length}/{NOTES_MAX}
          </p>
        </section>
      </div>

      {/* Bouton sticky bas — masqué quand Stripe Elements affiche son
          propre bouton "Pré-autoriser X €" inline. */}
      {!commandeIdForElements && (
        <div
          className="fixed bottom-0 left-0 right-0 border-t bg-background p-4"
          style={{
            boxShadow: "0 -4px 16px rgba(15, 76, 58, 0.06)",
            paddingBottom: "calc(1rem + env(safe-area-inset-bottom))",
          }}
        >
          <div className="max-w-2xl mx-auto">
            <Button
              onClick={handleSubmit}
              disabled={loading || !slot}
              size="lg"
              className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#0E3B2E] to-[#082A20] text-white font-bold text-base shadow-lg shadow-[#0E3B2E]/30 hover:shadow-xl hover:shadow-[#0E3B2E]/40 hover:from-[#0E3B2E] hover:to-[#082A20] active:scale-[0.99] transition-all"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {buttonLabel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
