import { useEffect, useMemo, useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Loader2, Lock, Scale } from "lucide-react";

import { Button } from "@/components/ui/button";

// ────────────────────────────────────────────────────────────────────
// DriveStripePayment — paiement par Stripe Elements pour le Drive au
// poids variable (manual capture).
//
// Flow :
//   1) parent crée la commande_drive en DB (cf. Checkout)
//   2) DriveStripePayment appelle POST /api/stripe/create-payment-intent
//      avec { commande_id } → récupère { clientSecret, montantAutorise }
//   3) Affiche <Elements options={{clientSecret}}><PaymentElement/></Elements>
//   4) onSubmit : stripe.confirmPayment(...) → redirect ou next-action
//
// La capture (montant réel post-pesée) se fait côté backend via
// /api/stripe/capture-payment quand le préparateur valide.
// ────────────────────────────────────────────────────────────────────

const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as
  | string
  | undefined;
const API_BASE = (import.meta.env.VITE_STRIPE_API_BASE_URL as string | undefined) ?? "";

// loadStripe est lourd (~25 KB) et bloque le main thread — on l'initialise
// une seule fois au module-level, conformément à la doc Stripe.
let _stripePromise: Promise<Stripe | null> | null = null;
const getStripePromise = (): Promise<Stripe | null> | null => {
  if (!PUBLISHABLE_KEY) return null;
  if (!_stripePromise) {
    _stripePromise = loadStripe(PUBLISHABLE_KEY);
  }
  return _stripePromise;
};

interface Props {
  commandeId: string;
  /** Montant estimé (cents) — pour afficher le détail pré-autorisation. */
  estimatedCents: number;
  /** URL de retour Stripe après confirmation (next_action). */
  returnUrl: string;
  onError?: (msg: string) => void;
}

interface CreateIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
  montantAutoriseCents: number;
}

export const DriveStripePayment = ({
  commandeId,
  estimatedCents,
  returnUrl,
  onError,
}: Props) => {
  const stripePromise = useMemo(() => getStripePromise(), []);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [authorizedCents, setAuthorizedCents] = useState<number>(
    Math.round(estimatedCents * 1.2),
  );
  const [loadingIntent, setLoadingIntent] = useState(true);
  const [intentError, setIntentError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingIntent(true);
    setIntentError(null);

    const url = `${API_BASE}/api/stripe/create-payment-intent`;

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commande_id: commandeId }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(
            body?.error ?? `Erreur API (${res.status}) lors de la création du PaymentIntent`,
          );
        }
        return (await res.json()) as CreateIntentResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setClientSecret(data.clientSecret);
        if (typeof data.montantAutoriseCents === "number") {
          setAuthorizedCents(data.montantAutoriseCents);
        }
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setIntentError(err.message);
        onError?.(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingIntent(false);
      });

    return () => {
      cancelled = true;
    };
  }, [commandeId, onError]);

  if (!PUBLISHABLE_KEY) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Configuration Stripe manquante (VITE_STRIPE_PUBLISHABLE_KEY).
      </div>
    );
  }

  if (loadingIntent) {
    return (
      <div className="flex items-center justify-center py-10 gap-2 text-[#0E3B2E]">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        <span className="text-sm font-medium">
          Préparation du paiement sécurisé…
        </span>
      </div>
    );
  }

  if (intentError || !clientSecret || !stripePromise) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {intentError ?? "Impossible d'initialiser le paiement."}
      </div>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: "#0E3B2E",
            colorBackground: "#FFFFFF",
            colorText: "#0F1A14",
            fontFamily: "system-ui, -apple-system, sans-serif",
            borderRadius: "12px",
          },
        },
      }}
    >
      <PaymentForm
        authorizedCents={authorizedCents}
        estimatedCents={estimatedCents}
        returnUrl={returnUrl}
      />
    </Elements>
  );
};

const formatEUR = (cents: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );

const PaymentForm = ({
  authorizedCents,
  estimatedCents,
  returnUrl,
}: {
  authorizedCents: number;
  estimatedCents: number;
  returnUrl: string;
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setErrorMsg(null);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
    });
    if (result.error) {
      setErrorMsg(result.error.message ?? "Erreur de paiement");
      setSubmitting(false);
    }
    // En cas de succès, Stripe redirige vers return_url — pas de cleanup.
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Bloc explicatif Drive au poids */}
      <div className="flex items-start gap-3 rounded-2xl bg-[#FBF6E2] border border-[#C9A227]/40 p-4 text-[13px] text-[#3E2E0A] leading-relaxed">
        <Scale
          size={16}
          className="shrink-0 mt-0.5 text-[#C9A227]"
          aria-hidden
        />
        <div>
          <p className="font-bold">
            Montant autorisé : {formatEUR(authorizedCents)}
          </p>
          <p className="mt-0.5">
            Estimation {formatEUR(estimatedCents)} × 1,20. Vous serez débité du
            poids réel pesé en magasin. La différence est libérée sous 7 jours.
          </p>
        </div>
      </div>

      <PaymentElement options={{ layout: "tabs" }} />

      {errorMsg && (
        <p className="text-sm text-destructive" role="alert">
          {errorMsg}
        </p>
      )}

      <Button
        type="submit"
        disabled={!stripe || !elements || submitting}
        size="lg"
        className="w-full h-14 rounded-2xl bg-gradient-to-r from-[#0E3B2E] to-[#082A20] text-white font-bold text-base shadow-lg shadow-[#0E3B2E]/30 hover:shadow-xl active:scale-[0.99] transition-all"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Validation…
          </>
        ) : (
          <>
            <Lock className="mr-2 h-4 w-4" aria-hidden />
            Pré-autoriser {formatEUR(authorizedCents)}
          </>
        )}
      </Button>

      <p className="text-[11px] text-center text-[#0F1A14]/55">
        Paiement sécurisé par Stripe — vos données bancaires ne transitent pas
        par nos serveurs.
      </p>
    </form>
  );
};
