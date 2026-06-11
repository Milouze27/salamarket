import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Info,
  Minus,
  Plus,
  Scale,
  ShoppingBag,
  Store,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { TrustBar } from "@/components/TrustBar";
import { HalalSeal } from "@/components/HalalSeal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCartStore } from "@/stores/cartStore";
import { useAuth } from "@/providers/AuthProvider";
import { formatPrice, productUnitLabel } from "@/lib/format";
import { MIN_ORDER_CENTS } from "@/lib/constants";
import { validatePromo, promoMessage, type PromoResult } from "@/lib/promo";
import { useLoyalty } from "@/hooks/useLoyalty";
import { BarakaGauge } from "@/components/BarakaGauge";
import { RecetteSuggestion } from "@/components/RecetteSuggestion";
import { supabase } from "@/integrations/supabase/client";
import { computePrixEstime, formatKg, getBrackets } from "@salamarket/shared";
import { cdnImage } from "@/lib/imageUrl";
import {
  ProductImageFallback,
  isPlaceholderUrl,
} from "@/components/ProductImageFallback";

/**
 * Hash stable (djb2) du contenu du panier — sert de clé d'idempotence
 * pour l'upsert d'abandon. Indépendant de l'ordre n'est PAS requis :
 * cartStore conserve un ordre stable, on sérialise donc tel quel.
 */
const cartHash = (input: string): string => {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  // >>> 0 pour rester sur un entier non signé 32 bits.
  return (h >>> 0).toString(36);
};

// Vignette ligne panier — même pattern onError que ProductCard / WeeklyPicks :
// bascule sur le fallback illustré par catégorie si l'URL est un placeholder
// ou si le chargement échoue (CDN mort, hors-ligne, image non cachée par le
// SW). Sans ça, le panier affichait l'icône "image cassée" brute du navigateur
// alors que le catalogue, lui, montrait un fallback riche (DRV-04).
const CartLineImage = ({
  imageUrl,
  name,
  category,
}: {
  imageUrl?: string | null;
  name: string;
  category?: string | null;
}) => {
  const [failed, setFailed] = useState(() => isPlaceholderUrl(imageUrl));
  if (failed) {
    return (
      <div className="w-20 h-20 rounded-xl overflow-hidden">
        <ProductImageFallback category={category} size="sm" />
      </div>
    );
  }
  return (
    <img
      src={cdnImage(imageUrl, { width: 160 })}
      alt={name}
      width={80}
      height={80}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="w-20 h-20 rounded-xl object-cover bg-bg"
    />
  );
};

const Cart = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const items = useCartStore((s) => s.items);
  const increment = useCartStore((s) => s.increment);
  const decrement = useCartStore((s) => s.decrement);
  const removeLine = useCartStore((s) => s.removeLine);
  const updateQuantiteKg = useCartStore((s) => s.updateQuantiteKg);
  const updateBracket = useCartStore((s) => s.updateBracket);
  const clear = useCartStore((s) => s.clear);

  // ─────── Cagnotte Baraka (solde fidélité, dégrade en 0) ───────
  const loyalty = useLoyalty(user?.email);

  // ─────── Code promo (state local, dégrade proprement) ───────
  // Activé : la RPC validate_promo_code est déployée (migration
  // 20260605000001) et la remise (discount_cents) est propagée au panier.
  // ⚠️ La transmission de la remise à Stripe (create-checkout-session) est
  // gérée par la vague V10 sur l'edge function — voir cross_wave_deps.
  const PROMO_ENABLED = true;
  const [promoInput, setPromoInput] = useState("");
  const [promoApplying, setPromoApplying] = useState(false);
  const [promo, setPromo] = useState<PromoResult | null>(null);
  // Dernier message d'essai (succès/erreur), pour feedback discret.
  const [promoMsg, setPromoMsg] = useState<{
    text: string;
    ok: boolean;
  } | null>(null);

  // Calcul du sous-total en cents — gère unit/weight/weight_bracket
  const subtotal = items.reduce((sum, i) => {
    // Remise DLC (lignes 'unit') : on facture le prix remisé affiché au client,
    // sinon il paierait le plein tarif malgré la remise (bug revenue/confiance).
    if (
      i.unitType === "unit" &&
      i.dlcUnitPriceCents != null &&
      Number.isFinite(i.dlcUnitPriceCents)
    ) {
      return sum + Math.round(i.dlcUnitPriceCents) * i.quantity;
    }
    const qty =
      i.unitType === "weight" ? (i.quantiteKg ?? 0) * i.quantity : i.quantity;
    const eur = computePrixEstime(i.product, qty, i.bracketIndex ?? 0);
    return sum + Math.round(eur * 100);
  }, 0);

  // Remise effective : un code appliqué ne peut jamais dépasser le
  // sous-total (sécurité affichage), et tombe si le panier passe en
  // dessous du minimum qui le rendait valide.
  const discountCents = promo?.valid
    ? Math.min(promo.discount_cents, subtotal)
    : 0;
  const total = Math.max(0, subtotal - discountCents);

  // A-t-on au moins une ligne au poids RÉEL (facturée au poids pesé) ?
  // Conditionne le bandeau "vous serez débité du poids réel" + le suffixe
  // "(estimation)" du sous-total. Les forfaits weight_bracket sont à prix
  // fixe : ils ne sont PAS facturés au poids réel, on les exclut ici sinon
  // le message est trompeur (B1-08).
  const hasRealWeightLine = items.some((i) => i.unitType === "weight");

  const itemCount = items.reduce((n, i) => n + i.quantity, 0);

  // Empreinte stable du panier — recalculée à chaque mutation. Sert à
  // la fois de cart_hash (relance) et de garde anti-spam d'upsert.
  const cartSignature = items
    .map(
      (i) =>
        `${i.product.id}:${i.unitType}:${i.quantity}:${i.quantiteKg ?? ""}:${i.bracketIndex ?? ""}`,
    )
    .join("|");

  const handleApplyPromo = async () => {
    const code = promoInput.trim();
    if (!code || promoApplying) return;
    setPromoApplying(true);
    try {
      const result = await validatePromo(code, subtotal);
      if (result.valid) {
        setPromo(result);
        setPromoMsg({ text: promoMessage(result), ok: true });
      } else {
        setPromo(null);
        // "unavailable" (RPC absente) → message non agressif "Code invalide".
        setPromoMsg({ text: promoMessage(result), ok: false });
      }
    } finally {
      setPromoApplying(false);
    }
  };

  const handleRemovePromo = () => {
    setPromo(null);
    setPromoInput("");
    setPromoMsg(null);
  };

  // Si le panier change après application d'un code, on revalide pour
  // éviter d'afficher une remise devenue caduque (ex: sous le minimum).
  useEffect(() => {
    if (!promo?.valid) return;
    let cancelled = false;
    (async () => {
      const result = await validatePromo(promo.code, subtotal);
      if (cancelled) return;
      if (result.valid) {
        setPromo(result);
      } else {
        setPromo(null);
        setPromoMsg({ text: promoMessage(result), ok: false });
      }
    })();
    return () => {
      cancelled = true;
    };
    // On revalide quand la signature panier change (pas à chaque render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartSignature]);

  // ─────── Relance panier (tracking best-effort, dégrade en silence) ───────
  // Upsert d'un événement d'abandon après ~3s d'inactivité OU au
  // démontage. Si la table cart_abandonment_events n'existe pas, on
  // ignore toute erreur (jamais de crash / toast).
  const lastTrackedRef = useRef<string>("");
  useEffect(() => {
    if (!user || items.length === 0) return;
    const signature = cartSignature;

    const trackAbandonment = async () => {
      if (signature === lastTrackedRef.current) return;
      lastTrackedRef.current = signature;
      try {
        // ⚠️ Table `cart_abandonment_events` pas encore déployée → absente
        // des types générés. On relâche le typage du client sur ce seul
        // appel best-effort. Toute erreur (table absente, RLS, réseau) est
        // avalée plus bas : jamais de crash ni de toast.
        await (
          supabase.from as unknown as (table: string) => {
            upsert: (
              values: Record<string, unknown>,
              options: { onConflict: string },
            ) => Promise<unknown>;
          }
        )("cart_abandonment_events").upsert(
          {
            user_id: user.id,
            email: user.email ?? null,
            cart_hash: cartHash(signature),
            items_count: items.reduce((n, i) => n + i.quantity, 0),
            total_cents: subtotal,
            recovered: false,
          },
          { onConflict: "user_id,cart_hash" },
        );
      } catch {
        // Table absente / RLS / réseau → ignore silencieusement.
      }
    };

    const timer = window.setTimeout(trackAbandonment, 3000);
    return () => {
      window.clearTimeout(timer);
      // Best-effort au démontage si le debounce n'a pas encore tiré.
      void trackAbandonment();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, cartSignature, subtotal]);

  // Confirmation "Vider le panier" via AlertDialog Radix (cohérent avec la
  // DA, portail + scroll-lock, pas de confirm() natif bloquant — B1-11).
  const [clearOpen, setClearOpen] = useState(false);
  const handleConfirmClear = () => {
    clear();
    setClearOpen(false);
    toast.success("Panier vidé");
  };

  const handleCheckout = () => {
    // NB : le succès réel de la commande survient plus tard (Checkout /
    // OrderConfirmation), pas ici. On ne marque donc PAS recovered=true
    // depuis le panier — le cron de relance s'en charge à la création
    // effective de la commande.
    navigate("/creneaux");
  };

  return (
    <div className="min-h-dvh bg-[#FAF7EE] text-text flex flex-col">
      <AppHeader showBack title="Mon panier" hideCart />

      <main
        className="flex-1 max-w-2xl w-full mx-auto px-6 md:px-8 pt-6 flex flex-col gap-4"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 9rem)" }}
      >
        {items.length === 0 ? (
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
                Votre panier est vide
              </h2>
              <p className="text-sm text-muted max-w-xs">
                Découvrez notre sélection de produits halal frais et préparés
                avec soin.
              </p>
            </div>
            <button
              onClick={() => navigate("/")}
              className="mt-2 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#0E3B2E] text-white text-sm font-semibold shadow-md shadow-[#0E3B2E]/20 hover:bg-[#082A20] active:scale-[0.98] transition-all"
            >
              Découvrir le catalogue
            </button>
          </div>
        ) : (
          <>
            {/* Compteur articles avec lien vider — secondary action */}
            <div className="flex items-center justify-between gap-3 px-1">
              <span className="text-xs font-medium text-muted">
                {itemCount} article{itemCount > 1 ? "s" : ""}
              </span>
              <button
                onClick={() => setClearOpen(true)}
                className="inline-flex items-center gap-1.5 min-h-11 bg-destructive/10 text-destructive font-bold text-[12px] px-3.5 py-2.5 rounded-full border border-destructive/20 active:scale-95 transition-transform"
              >
                <Trash2 size={12} strokeWidth={2.4} />
                Vider le panier
              </button>
            </div>

            {/* Bandeau pré-autorisation Drive au poids — affiché ssi
                au moins une ligne au poids RÉEL (pas un forfait bracket à
                prix fixe, qui n'est pas facturé au poids pesé — B1-08). */}
            {hasRealWeightLine && (
              <div className="flex items-start gap-3 rounded-2xl border border-[#C9A227]/40 bg-[#FBF6E2] p-4 text-[#3E2E0A] text-[13px] leading-relaxed">
                <Scale
                  size={18}
                  className="shrink-0 mt-0.5 text-[#C9A227]"
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <p className="font-bold">
                    Vente au poids — facturation au poids réel
                  </p>
                  <p className="mt-1">
                    Vous serez débité du poids réellement préparé en magasin.
                    Aucun supplément au-delà de votre commande.{" "}
                    <Link
                      to="/drive-au-poids"
                      className="underline underline-offset-2 font-semibold hover:text-[#0E3B2E]"
                    >
                      En savoir plus
                    </Link>
                  </p>
                </div>
              </div>
            )}

            {/* Items */}
            <ul className="flex flex-col gap-2.5">
              {items.map((item, idx) => {
                const isWeight = item.unitType === "weight";
                const isBracket = item.unitType === "weight_bracket";
                const brackets = isBracket ? getBrackets(item.product) : [];
                const bracket = isBracket
                  ? brackets[item.bracketIndex ?? 0]
                  : null;

                const lineEur = computePrixEstime(
                  item.product,
                  isWeight
                    ? (item.quantiteKg ?? 0) * item.quantity
                    : item.quantity,
                  item.bracketIndex ?? 0,
                );
                // Remise DLC (lignes 'unit') : affiche le prix remisé pour que
                // la ligne soit cohérente avec le sous-total facturé.
                const lineCents =
                  item.unitType === "unit" &&
                  item.dlcUnitPriceCents != null &&
                  Number.isFinite(item.dlcUnitPriceCents)
                    ? Math.round(item.dlcUnitPriceCents) * item.quantity
                    : Math.round(lineEur * 100);

                return (
                  <li
                    key={item.lineId}
                    className="flex items-start gap-3 bg-white rounded-2xl border border-border p-3 shadow-sm animate-in fade-in slide-in-from-bottom-1 duration-300 [animation-fill-mode:backwards]"
                    style={{ animationDelay: `${Math.min(idx, 6) * 50}ms` }}
                  >
                    <Link
                      to={`/produit/${item.product.id}`}
                      className="shrink-0"
                      aria-label={`Voir ${item.product.name}`}
                    >
                      <CartLineImage
                        imageUrl={item.product.imageUrl}
                        name={item.product.name}
                        category={item.product.category}
                      />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/produit/${item.product.id}`}
                        className="block font-semibold text-sm text-text line-clamp-2 hover:text-[#0E3B2E] transition-colors"
                      >
                        {item.product.name}
                      </Link>

                      {/* Ligne unité — comportement historique */}
                      {!isWeight && !isBracket && (
                        <p className="text-xs text-muted mt-0.5">
                          {productUnitLabel(item.product)}
                        </p>
                      )}

                      {/* Ligne weight — poids estimé éditable.
                          font-size 16px sur l'input pour éviter le zoom
                          auto iOS Safari sur focus (<16px déclenche un
                          zoom puis re-blur, casse l'UX mobile). */}
                      {isWeight && (
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] font-bold text-[#C9A227]">
                            <Scale size={11} aria-hidden /> Au poids
                          </span>
                          <label className="inline-flex items-center gap-1.5 text-xs text-[#0F1A14]/70">
                            <span className="sr-only">Poids estimé</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0.1}
                              max={5}
                              step={0.1}
                              value={item.quantiteKg ?? 0}
                              onChange={(e) => {
                                // BUG-012 — parseFloat + replace virgule
                                // (locale fr) ; updateQuantiteKg clampe à
                                // [0.1..5] et arrondit au dixième.
                                const raw = e.target.value.replace(",", ".");
                                const v = parseFloat(raw);
                                if (!Number.isFinite(v)) return;
                                updateQuantiteKg(item.lineId, v);
                              }}
                              className="w-16 px-2 py-1.5 text-base font-semibold text-[#0E3B2E] tabular-nums bg-[#FAF7EE] border border-[#0E3B2E]/15 rounded-md focus:outline-none focus:ring-2 focus:ring-[#C9A227]/40"
                              aria-label={`Poids estimé de ${item.product.name} en kg`}
                            />
                            <span className="text-xs text-muted">
                              kg estimés
                            </span>
                          </label>
                          {item.product.pricePerKg != null && (
                            <span className="text-[11px] text-muted">
                              ·{" "}
                              {item.product.pricePerKg
                                .toFixed(2)
                                .replace(".", ",")}{" "}
                              €/kg
                            </span>
                          )}
                        </div>
                      )}

                      {/* Ligne weight_bracket — bracket affiché + switch si plusieurs */}
                      {isBracket && bracket && (
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] font-bold text-[#C9A227]">
                            <Scale size={11} aria-hidden /> Forfait
                          </span>
                          <span className="text-xs text-[#0F1A14]/70 font-semibold">
                            {bracket.label}
                          </span>
                          {brackets.length > 1 && (
                            <select
                              value={item.bracketIndex ?? 0}
                              onChange={(e) =>
                                updateBracket(
                                  item.lineId,
                                  Number(e.target.value),
                                )
                              }
                              className="text-xs px-2 py-1 bg-[#FAF7EE] border border-[#0E3B2E]/15 rounded-md text-[#0E3B2E]"
                              aria-label="Choisir une taille"
                            >
                              {brackets.map((b, bi) => (
                                <option key={bi} value={bi}>
                                  {b.label} —{" "}
                                  {b.prix.toFixed(2).replace(".", ",")} €
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      )}

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="flex flex-col">
                          <p className="text-base font-bold text-[#0E3B2E] tabular-nums">
                            {isWeight ? "Estimation : " : ""}
                            {formatPrice(lineCents)}
                          </p>
                          {isWeight && item.quantiteKg != null && (
                            <p className="text-[11px] text-muted">
                              pour {formatKg(item.quantiteKg * item.quantity)}
                            </p>
                          )}
                        </div>
                        {/* Stepper — tap targets 44×44 (Apple HIG). On
                            ne réduit pas la taille des cercles internes
                            visuels (w-8 = 32px) mais on étend la zone
                            tactile via padding parent + hit-area pseudo
                            sur les boutons. */}
                        {isWeight ? (
                          // Ligne au poids : PAS de stepper d'unités. Le poids
                          // se règle via le champ kg ci-dessus ; un +/- ici
                          // multiplierait quantiteKg × quantity → poids ET prix
                          // doublés. On ne garde qu'un bouton « retirer ».
                          <button
                            onClick={() => removeLine(item.lineId)}
                            aria-label={`Retirer ${item.product.name}`}
                            className="w-9 h-9 rounded-full bg-white border border-border flex items-center justify-center text-text active:scale-90 transition-transform shadow-sm"
                          >
                            <Trash2
                              size={14}
                              className="text-destructive"
                              strokeWidth={2.4}
                            />
                          </button>
                        ) : (
                          <div className="flex items-center gap-1 bg-[#FAF7EE] rounded-full p-1 border border-border">
                            <button
                              onClick={() =>
                                item.quantity === 1
                                  ? removeLine(item.lineId)
                                  : decrement(item.lineId)
                              }
                              aria-label={
                                item.quantity === 1
                                  ? `Retirer ${item.product.name}`
                                  : `Diminuer ${item.product.name}`
                              }
                              className="w-9 h-9 rounded-full bg-white border border-border flex items-center justify-center text-text active:scale-90 transition-transform shadow-sm"
                            >
                              {item.quantity === 1 ? (
                                <Trash2
                                  size={14}
                                  className="text-destructive"
                                  strokeWidth={2.4}
                                />
                              ) : (
                                <Minus size={14} strokeWidth={2.5} />
                              )}
                            </button>
                            <span className="min-w-[1.75rem] w-7 text-center text-sm font-bold tabular-nums">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => increment(item.lineId)}
                              disabled={item.quantity >= 50}
                              aria-label={`Augmenter ${item.product.name}`}
                              className="w-9 h-9 rounded-full bg-[#0E3B2E] text-white flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40 shadow-sm"
                            >
                              <Plus size={14} strokeWidth={2.5} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Suggestion recette liée au panier — ajout des ingrédients
                manquants en un tap. Ne rend rien si aucune recette pertinente. */}
            <RecetteSuggestion cartItems={items} />

            {/* Cagnotte Baraka — affichée uniquement pour un client connecté
                ayant au moins 1 point (sinon section inutile). */}
            {user && loyalty.points > 0 && (
              <BarakaGauge
                points={loyalty.points}
                nextPalier={loyalty.nextPalier}
                progress={loyalty.progress}
              />
            )}

            {/* Récap éditorial */}
            <section className="mt-5 px-1 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200 [animation-fill-mode:backwards]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-[10px] uppercase tracking-[0.28em] font-bold text-[#C9A227]">
                  Récapitulatif
                </p>
                {/* Signal de confiance discret avant paiement (CRO trust). */}
                <HalalSeal
                  size="sm"
                  className="shrink-0 scale-[0.7] origin-right -my-2"
                />
              </div>
              <div className="space-y-2.5 text-[14px]">
                <div className="flex items-baseline justify-between">
                  <span className="text-[#6B7280]">
                    Sous-total {hasRealWeightLine ? "(estimation)" : ""}
                  </span>
                  <span className="text-[#0F1A14] tabular-nums">
                    {formatPrice(subtotal)}
                  </span>
                </div>
                {discountCents > 0 && promo?.valid && (
                  <div className="flex items-baseline justify-between">
                    <span className="text-[#0E3B2E] inline-flex items-center gap-1.5 font-semibold">
                      <Tag size={13} className="text-[#0E3B2E]" aria-hidden />
                      Remise
                      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#C9A227]">
                        {promo.code}
                      </span>
                    </span>
                    <span className="text-[#0E3B2E] font-semibold tabular-nums">
                      -{formatPrice(discountCents)}
                    </span>
                  </div>
                )}
                <div className="flex items-baseline justify-between">
                  <span className="text-[#6B7280] inline-flex items-center gap-1.5">
                    <Store size={13} className="text-[#C9A227]" aria-hidden />
                    Retrait en magasin
                  </span>
                  <span className="text-[#0E3B2E] font-semibold">Gratuit</span>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-[#0E3B2E]/15 flex items-baseline justify-between">
                <span className="text-[13px] uppercase tracking-[0.18em] font-bold text-[#0E3B2E]">
                  Total {hasRealWeightLine ? "estimé" : ""}
                </span>
                <span className="text-[28px] font-extrabold text-[#0E3B2E] tabular-nums tracking-[-0.025em]">
                  {formatPrice(total)}
                </span>
              </div>
              {hasRealWeightLine && (
                <p className="mt-3 text-[12px] text-[#0F1A14]/60 inline-flex items-start gap-1.5">
                  <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
                  Vous serez débité du poids réel pesé en magasin.{" "}
                  <Link
                    to="/drive-au-poids"
                    className="underline underline-offset-2 hover:text-[#0E3B2E]"
                  >
                    Comment ça marche ?
                  </Link>
                </p>
              )}
              {/* Code promo — MASQUÉ tant que le backend n'applique pas la
                  remise au paiement (RPC validate_promo_code absente +
                  remise non transmise à create-checkout-session). Afficher un
                  champ qui dit toujours "invalide" ou une remise jamais
                  facturée serait pire que pas de champ. Repasser PROMO_ENABLED
                  à true quand la RPC ET le passage de la remise au checkout
                  sont en place. */}
              {PROMO_ENABLED && (
                <div className="mt-5">
                  {promo?.valid ? (
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#0E3B2E]/20 bg-[#0E3B2E]/[0.04] px-4 py-3">
                      <span className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#0E3B2E]">
                        <Check
                          size={16}
                          className="text-[#0E3B2E]"
                          aria-hidden
                        />
                        Code{" "}
                        <span className="uppercase tracking-[0.06em]">
                          {promo.code}
                        </span>{" "}
                        appliqué
                      </span>
                      <button
                        type="button"
                        onClick={handleRemovePromo}
                        className="inline-flex items-center justify-center min-h-11 min-w-11 -mr-2 rounded-full text-[#6B7280] active:scale-90 transition-transform"
                        aria-label="Retirer le code promo"
                      >
                        <X size={18} strokeWidth={2.2} aria-hidden />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <label
                        htmlFor="promo-code"
                        className="block text-[10px] uppercase tracking-[0.28em] font-bold text-[#C9A227] mb-2"
                      >
                        Code promo
                      </label>
                      <div className="flex items-stretch gap-2">
                        <div className="relative flex-1">
                          <Tag
                            size={16}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]"
                            aria-hidden
                          />
                          <input
                            id="promo-code"
                            type="text"
                            inputMode="text"
                            autoCapitalize="characters"
                            autoComplete="off"
                            spellCheck={false}
                            value={promoInput}
                            onChange={(e) => {
                              setPromoInput(e.target.value);
                              if (promoMsg) setPromoMsg(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void handleApplyPromo();
                              }
                            }}
                            placeholder="Votre code"
                            className="w-full h-12 pl-9 pr-3 text-base text-[#0F1A14] bg-[#FAF7EE] border border-[#0E3B2E]/15 rounded-xl uppercase tracking-[0.04em] placeholder:normal-case placeholder:tracking-normal placeholder:text-[#6B7280] focus:outline-none focus:ring-2 focus:ring-[#C9A227]/40"
                            aria-describedby={
                              promoMsg ? "promo-feedback" : undefined
                            }
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleApplyPromo()}
                          disabled={!promoInput.trim() || promoApplying}
                          className="shrink-0 h-12 px-5 rounded-xl bg-[#0E3B2E] text-white text-sm font-semibold active:scale-[0.98] transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {promoApplying ? "..." : "Appliquer"}
                        </button>
                      </div>
                      {promoMsg && (
                        <p
                          id="promo-feedback"
                          role="status"
                          className={`mt-2 text-[12px] font-medium ${
                            promoMsg.ok ? "text-[#0E3B2E]" : "text-destructive"
                          }`}
                        >
                          {promoMsg.text}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-5">
                <TrustBar />
              </div>
            </section>
          </>
        )}
      </main>

      {items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur border-t border-border">
          <div
            className="max-w-2xl mx-auto px-6 pt-3"
            style={{
              paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
            }}
          >
            {subtotal < MIN_ORDER_CENTS && (
              <div className="mb-3">
                <div className="flex items-baseline justify-between gap-2 mb-1.5">
                  <span className="text-[13px] font-semibold text-[#0E3B2E]">
                    Plus que{" "}
                    <span className="tabular-nums">
                      {formatPrice(MIN_ORDER_CENTS - subtotal)}
                    </span>{" "}
                    pour valider
                  </span>
                  <span className="text-[12px] text-[#6B7280] tabular-nums">
                    {formatPrice(subtotal)} / {formatPrice(MIN_ORDER_CENTS)}
                  </span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-[#0E3B2E]/10"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={MIN_ORDER_CENTS}
                  aria-valuenow={subtotal}
                  aria-label="Progression vers la commande minimum"
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#0E3B2E] to-[#C9A227] transition-[width] duration-300"
                    style={{
                      width: `${Math.min(100, Math.round((subtotal / MIN_ORDER_CENTS) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            )}
            <button
              onClick={handleCheckout}
              disabled={subtotal < MIN_ORDER_CENTS}
              className="group w-full h-14 rounded-2xl bg-gradient-to-r from-[#0E3B2E] to-[#082A20] text-white font-bold text-base shadow-lg shadow-[#0E3B2E]/30 hover:shadow-xl hover:shadow-[#0E3B2E]/40 active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>Choisir un créneau</span>
              <ArrowRight
                size={18}
                className="transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </button>
          </div>
        </div>
      )}

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Vider le panier ?</AlertDialogTitle>
            <AlertDialogDescription>
              Tous les articles seront retirés. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmClear}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Vider le panier
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Cart;
