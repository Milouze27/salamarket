import { useEffect, useMemo, useRef, useState } from "react";
import {
  ProductImageFallback,
  isPlaceholderUrl,
} from "@/components/ProductImageFallback";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bell,
  BellRing,
  Minus,
  Plus,
  QrCode,
  Scale,
  ShoppingCart,
  Sparkles,
  Store,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { useProduct } from "@/hooks/useProduct";
import { useProducts } from "@/hooks/useProducts";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { useCartStore } from "@/stores/cartStore";
import { formatPrice, productUnitLabel, productUnitHint } from "@/lib/format";
import {
  computePrixEstime,
  formatKg,
  formatPriceWithUnit,
  getBrackets,
} from "@salamarket/shared";
import { ProductCard } from "@/components/ProductCard";
import { TracabiliteFrise } from "@/components/TracabiliteFrise";
import {
  DlcPriceTag,
  HalalBadgeLink,
  useDlcDiscount,
} from "@/components/HalalBadgeLink";
import { cn } from "@/lib/utils";
import { cdnImage } from "@/lib/imageUrl";
import { usePoidsInput } from "@/hooks/usePoidsInput";

const MAX_QTY = 50;

const ProductDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: product, isLoading, isError, error } = useProduct(id);
  const { data: allProducts } = useProducts();
  const { user } = useAuth();

  const addItem = useCartStore((s) => s.addItem);
  const cartQty = useCartStore((s) => (id ? s.getQuantity(id) : 0));

  const unitType = product?.unitType ?? "unit";
  const brackets = useMemo(
    () => (product ? getBrackets(product) : []),
    [product],
  );

  // États unifiés — selon unitType on lit qty / poids / bracketIndex.
  // Le poids estimé passe par usePoidsInput (clamp partagé avec le panier :
  // l'affiché ne diverge jamais du facturé, cf. B1-01..04).
  const [qty, setQty] = useState(1);
  const poids = usePoidsInput(1);
  const kg = poids.kg;
  const [bracketIndex, setBracketIndex] = useState(0);
  const [justAdded, setJustAdded] = useState(false);
  const [heroFailed, setHeroFailed] = useState(false);
  // "Préviens-moi au retour" (produit en rupture). `notifyEmail` n'est
  // utilisé que pour les visiteurs non connectés (saisie manuelle) ; un
  // utilisateur connecté part directement avec son user_id + email.
  // `notifySubscribed` bascule l'UI en état "inscrit" après succès.
  const [notifyEmail, setNotifyEmail] = useState("");
  const [notifySubmitting, setNotifySubmitting] = useState(false);
  const [notifySubscribed, setNotifySubscribed] = useState(false);
  // Annonce lecteur d'écran à l'ajout (le "Ajouté !" visuel n'est pas un
  // status role). key force la re-lecture sur ajouts répétés.
  const [announce, setAnnounce] = useState<{ key: number; msg: string } | null>(
    null,
  );
  const addedTimerRef = useRef<number | null>(null);
  // Throttle leading-edge 200ms anti double-tap iOS (BUG-011 pattern
  // — voir ProductCard.tsx:39). Sur PDP le risque est plus élevé : le
  // bouton CTA est plus gros, plus visible, plus tapé → un double-tap
  // accidentel empilait 2× la qty ou 2× la ligne weight (cas vécu :
  // user voit "2 kg" alors qu'il a tapé une seule fois).
  const lastAddAtRef = useRef<number>(0);

  // Re-init quand l'id change OU quand on charge le produit.
  // BUG-012 — défaut 1.0 kg (et plus product.estimatedWeightKg).
  // Le 5 kg utilisé en initial était trop élevé pour un parcours panier
  // standard : on standardise à 1 kg et le client ajuste via le stepper.
  useEffect(() => {
    setQty(1);
    setBracketIndex(0);
    setJustAdded(false);
    setNotifyEmail("");
    setNotifySubmitting(false);
    setNotifySubscribed(false);
    // Le poids estimé se ré-initialise tout seul (usePoidsInput ré-applique
    // son initialKg=1 ; pas de reset manuel à faire ici).
  }, [id, product]);

  useEffect(() => {
    return () => {
      if (addedTimerRef.current !== null) {
        window.clearTimeout(addedTimerRef.current);
      }
    };
  }, []);

  const goBack = () => {
    const run = () => {
      if (location.key !== "default") {
        navigate(-1);
      } else {
        navigate("/");
      }
    };
    // Saute le morph de page si "Réduire les animations" est actif.
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (
      !reduce &&
      typeof document !== "undefined" &&
      document.startViewTransition
    ) {
      document.startViewTransition(run);
    } else {
      run();
    }
  };

  const suggestions = useMemo(() => {
    if (!product || !allProducts) return [];
    return allProducts
      .filter((p) => p.category === product.category && p.id !== product.id)
      .slice(0, 4);
  }, [product, allProducts]);

  const handleAdd = () => {
    if (!product) return;
    // Bloque clic pendant l'animation "Ajouté !" (2s) — couvre les
    // utilisateurs qui re-tapent par habitude pendant le feedback.
    if (justAdded) return;
    // Throttle leading-only 200ms — couvre double-tap iOS (touchend
    // + click synthétique <50ms). Pas de trailing call : l'utilisateur
    // peut retaper après la fenêtre, on bloque juste le burst.
    const now = Date.now();
    if (now - lastAddAtRef.current < 200) return;
    lastAddAtRef.current = now;
    if (unitType === "weight") {
      // Une ligne par add (lineId aléatoire) ; le kg est mémorisé sur la ligne.
      addItem(product, { quantiteKg: kg });
    } else if (unitType === "weight_bracket") {
      addItem(product, { bracketIndex });
    } else {
      // unit — on duplique l'add pour respecter qty (fusion gérée par store).
      // Propage le prix remisé DLC (sinon plein tarif au checkout malgré la
      // remise affichée).
      const dlcUnitPriceCents =
        showDlcPrice && dlcDiscount ? dlcDiscount.discountedCents : undefined;
      for (let i = 0; i < qty; i += 1) addItem(product, { dlcUnitPriceCents });
    }
    // Annonce a11y contextualisée selon le type d'unité.
    const addedMsg =
      unitType === "weight"
        ? `${product.name}, ${formatKg(kg)} estimés, ajouté au panier`
        : unitType === "unit" && qty > 1
          ? `${product.name}, ${qty} ajoutés au panier`
          : `${product.name} ajouté au panier`;
    setAnnounce({ key: Date.now(), msg: addedMsg });
    setJustAdded(true);
    if (addedTimerRef.current !== null) {
      window.clearTimeout(addedTimerRef.current);
    }
    addedTimerRef.current = window.setTimeout(() => {
      setJustAdded(false);
      addedTimerRef.current = null;
    }, 2000);
  };

  // "Préviens-moi au retour" — best-effort. La table
  // out_of_stock_notifications n'existe peut-être PAS encore en base : tout
  // est enveloppé dans try/catch et on dégrade proprement (toast neutre,
  // jamais de crash de la PDP). Connecté → {product_id, user_id, email} ;
  // visiteur → {product_id, email} après validation d'un email saisi à la
  // main (champ ≥16px côté markup).
  const handleNotify = async () => {
    if (!product || notifySubmitting) return;

    const email = (user?.email ?? notifyEmail).trim();
    // Validation légère côté visiteur : un email plausible suffit, la
    // contrainte stricte reste côté base / edge plus tard.
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Entre une adresse email valide.");
      return;
    }

    setNotifySubmitting(true);
    try {
      const payload = user
        ? { product_id: product.id, user_id: user.id, email }
        : { product_id: product.id, email };
      // out_of_stock_notifications n'est pas (encore) dans les types
      // auto-générés : cast local pour le .from(), l'absence éventuelle de
      // la table reste gérée par le try/catch.
      const { error: insertError } = await (
        supabase as unknown as {
          from: (table: string) => {
            insert: (
              values: Record<string, unknown>,
            ) => Promise<{ error: unknown }>;
          };
        }
      )
        .from("out_of_stock_notifications")
        .insert(payload);
      if (insertError) throw insertError;
      setNotifySubscribed(true);
      setNotifyEmail("");
      toast.success("On te préviendra dès le retour.");
    } catch {
      // Table absente, RLS, réseau… on ne casse jamais la PDP : message
      // neutre et l'utilisateur peut retenter.
      toast("Impossible pour le moment, réessaie plus tard.");
    } finally {
      setNotifySubmitting(false);
    }
  };

  // Total CTA (estimé pour weight) — utilisé pour l'affichage du bouton
  const totalCents = product
    ? unitType === "weight"
      ? Math.round(computePrixEstime(product, kg) * 100)
      : unitType === "weight_bracket"
        ? Math.round(computePrixEstime(product, 1, bracketIndex) * 100)
        : product.priceCents * qty
    : 0;

  const showHalalBadge =
    product?.category === "boucherie" || product?.category === "charcuterie";

  // Remise DLC anti-gaspi (source réelle : vue v_dlc_alerts). Hook appelé
  // inconditionnellement (avant les early returns) — `enabled` coupe la requête
  // tant que le produit n'est pas chargé ou s'il est vendu au poids (prix €/kg,
  // remise lot hors périmètre PDP). null si aucune remise exploitable.
  const dlcDiscount = useDlcDiscount(
    product?.id,
    product?.priceCents ?? 0,
    !!product && product.unitType !== "weight",
  );
  const showDlcPrice =
    dlcDiscount != null && product != null && product.unitType !== "weight";

  // Traçabilité par produit : le passeport halal (HalalBadgeLink, plus bas)
  // résout le lot RÉEL le plus récent via produits_lots et draine vers
  // /lot/{id}. Plus de fallback lot démo codé en dur ici.

  if (isLoading) {
    // CLS (PERF-01) : le skeleton DOIT reproduire la structure et la hauteur
    // de la fiche réelle, sinon le passage skeleton→contenu fait sauter toute
    // la page (CLS mesuré 0.473). On réplique le conteneur grille desktop, le
    // décalage `-mt-4` mobile et assez de blocs pour réserver la hauteur du
    // bloc info (titre, prix, badge halal, description, sections).
    const shimmer =
      "bg-[linear-gradient(90deg,#E8E4D8_0%,#F2F2EE_50%,#E8E4D8_100%)] bg-[length:200%_100%] animate-skeleton-shimmer";
    return (
      <div className="min-h-dvh bg-[#FAF7EE]">
        <div className="md:max-w-6xl md:mx-auto md:px-8 md:pt-24 md:grid md:grid-cols-[1.05fr_1fr] md:gap-12 lg:gap-16">
          <div className="md:sticky md:top-24 md:self-start">
            <div
              className={`aspect-square w-full max-w-2xl mx-auto md:max-w-none md:rounded-[36px] ${shimmer}`}
            />
          </div>
          <div className="max-w-2xl mx-auto px-4 mt-4 md:mt-0 md:px-0 pb-cta-only md:!pb-8">
            <div className="px-1 pt-2 space-y-3">
              <div className={`h-3 w-24 rounded ${shimmer}`} />
              <div className={`h-9 w-2/3 rounded ${shimmer}`} />
              <div className={`h-8 w-1/3 rounded ${shimmer}`} />
              <div className={`h-[72px] w-full rounded-3xl ${shimmer}`} />
              <div className={`h-16 w-full rounded-2xl ${shimmer}`} />
              <div className={`h-4 w-full rounded ${shimmer}`} />
              <div className={`h-4 w-5/6 rounded ${shimmer}`} />
              <div className={`h-4 w-3/4 rounded ${shimmer}`} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !product) {
    return (
      <div className="min-h-dvh bg-[#FAF7EE] flex flex-col items-center justify-center px-6 gap-4 text-center">
        <AlertCircle size={48} className="text-destructive" aria-hidden />
        <h1 className="text-xl font-bold text-text">
          {isError ? "Erreur de chargement" : "Produit introuvable"}
        </h1>
        <p className="text-sm text-muted max-w-xs">
          {isError && error instanceof Error
            ? error.message
            : "Ce produit n'existe pas ou n'est plus disponible."}
        </p>
        <button
          onClick={() => navigate("/")}
          className="mt-2 px-6 py-3 rounded-full bg-[#0E3B2E] text-white text-sm font-semibold active:scale-[0.98] transition-all"
        >
          Retour au catalogue
        </button>
      </div>
    );
  }

  const hint = productUnitHint(product);

  // Composant Stepper kg réutilisé desktop + mobile.
  // Boutons 44×44 pour respecter Apple HIG (≥44pt). Input en
  // inputMode="decimal" pour faire surgir le clavier numérique iOS et
  // text-base (16px) pour éviter le zoom auto Safari sur focus.
  const KgStepper = () => (
    <div className="flex items-center gap-2 bg-[#FAF7EE] rounded-2xl p-2 border border-[#0E3B2E]/15">
      <button
        type="button"
        onClick={poids.decrement}
        disabled={poids.atMin}
        aria-label="Diminuer le poids estimé"
        className="w-11 h-11 rounded-full bg-white border border-[#0E3B2E]/12 flex items-center justify-center text-[#0E3B2E] active:scale-90 transition-transform shadow-sm disabled:opacity-30"
      >
        <Minus size={16} strokeWidth={2.5} aria-hidden />
      </button>
      <div className="flex flex-col items-center min-w-[5.5rem]">
        <input
          // type="text" + inputMode décimal : on pilote la valeur en chaîne
          // pour pouvoir réécrire le champ au blur (clamp visuel 9999→5,
          // 0→0,1, 2,567→2,6). usePoidsInput partage ce clamp avec le panier.
          type="text"
          inputMode="decimal"
          value={poids.text}
          onChange={(e) => poids.onChange(e.target.value)}
          onBlur={poids.onBlur}
          className="w-20 text-center text-base font-bold tabular-nums text-[#0E3B2E] bg-transparent border-0 focus:outline-none focus:ring-2 focus:ring-[#C9A227]/40 rounded-md py-0.5"
          aria-label="Poids estimé en kg"
        />
        <span className="text-[10px] uppercase tracking-[0.12em] text-[#0F1A14]/55 font-semibold">
          kg estimés
        </span>
      </div>
      <button
        type="button"
        onClick={poids.increment}
        disabled={poids.atMax}
        aria-label="Augmenter le poids estimé"
        className="w-11 h-11 rounded-full bg-[#0E3B2E] text-white flex items-center justify-center active:scale-90 transition-transform shadow-sm disabled:opacity-40"
      >
        <Plus size={16} strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  );

  // Cards bracket — sélectionnable
  const BracketCards = () => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {brackets.map((b, i) => {
        const active = i === bracketIndex;
        return (
          <button
            key={i}
            type="button"
            onClick={() => setBracketIndex(i)}
            aria-pressed={active}
            className={cn(
              "rounded-2xl border p-3 text-left transition-all active:scale-[0.99]",
              active
                ? "border-[#0E3B2E] bg-[#0E3B2E]/5 shadow-sm"
                : "border-[#0E3B2E]/15 bg-white hover:border-[#0E3B2E]/40",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-[0.14em] font-bold text-[#C9A227]">
                Taille {i + 1}
              </span>
              {active && (
                <BadgeCheck size={14} className="text-[#0E3B2E]" aria-hidden />
              )}
            </div>
            <p className="mt-1.5 text-[15px] font-bold text-[#0E3B2E]">
              {b.label}
            </p>
            <p className="text-[13px] text-[#0F1A14]/70 tabular-nums">
              {b.prix.toFixed(2).replace(".", ",")} €
            </p>
          </button>
        );
      })}
    </div>
  );

  // CTA bloc — partagé desktop & mobile, structure fluide mobile-first.
  //
  // Le cluster tient nativement de 320 à 1440 sans cas spéciaux par
  // breakpoint : le bouton est `flex-1 min-w-0` (peut rétrécir sous la
  // min-content de son texte), son contenu est une seule ligne avec un
  // segment `truncate` pour le label et des segments `shrink-0` pour le
  // prix + la flèche (qui ne se tronquent jamais). Le stepper unités est
  // `shrink-0`. En mode `compact` (sticky mobile) on resserre juste le gap
  // inter-éléments (gap-2 vs gap-3) — pas une rustine, le même markup
  // s'adapte. Vérifié 320/375/390/430 : ni débordement ni wrap cassé.
  const CtaCluster = ({ compact = false }: { compact?: boolean }) => (
    <div className="flex flex-col gap-3 min-w-0">
      <div
        className={cn("flex items-center min-w-0", compact ? "gap-2" : "gap-3")}
      >
        {/* Stepper unités OU stepper kg OU rien si bracket (les cards font le job) */}
        {unitType === "unit" && (
          <div className="flex items-center gap-1 bg-[#FAF7EE] rounded-full p-1 border border-[#0E3B2E]/15 shrink-0">
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1}
              aria-label="Diminuer la quantité"
              className="w-11 h-11 rounded-full bg-white border border-[#0E3B2E]/12 flex items-center justify-center text-[#0E3B2E] active:scale-90 transition-transform shadow-sm disabled:opacity-30"
            >
              <Minus size={16} strokeWidth={2.5} aria-hidden />
            </button>
            <span
              className="min-w-[2.25rem] text-center text-base font-bold tabular-nums text-[#0E3B2E]"
              aria-live="polite"
            >
              {qty}
            </span>
            <button
              type="button"
              onClick={() => setQty((q) => Math.min(MAX_QTY, q + 1))}
              disabled={qty >= MAX_QTY}
              aria-label="Augmenter la quantité"
              className="w-11 h-11 rounded-full bg-[#0E3B2E] text-white flex items-center justify-center active:scale-90 transition-transform shadow-sm disabled:opacity-40"
            >
              <Plus size={16} strokeWidth={2.5} aria-hidden />
            </button>
          </div>
        )}

        <button
          onClick={handleAdd}
          disabled={!product.inStock || justAdded}
          className={cn(
            "group flex-1 min-w-0 h-14 rounded-2xl bg-gradient-to-r from-[#0E3B2E] to-[#082A20] text-white font-bold text-[15px] shadow-lg shadow-[#0E3B2E]/30 hover:shadow-xl hover:shadow-[#0E3B2E]/40 active:scale-[0.99] transition-all flex items-center justify-center gap-1.5 px-3 disabled:cursor-not-allowed",
            !product.inStock && "opacity-50 disabled:shadow-none",
            justAdded && "animate-success-pop",
          )}
        >
          {justAdded ? (
            <>
              <BadgeCheck size={20} className="text-[#C9A227]" aria-hidden />
              <span>Ajouté !</span>
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
              <span className="truncate">
                {product.inStock ? "Ajouter au panier" : "Indisponible"}
              </span>
              {product.inStock && (
                <>
                  {/* Prix + séparateur masqués sous 640px : sur iPhone SE
                      (320px) avec le stepper d'unités visible, "Ajouter au
                      panier · X,XX €" se tronquait en "Aj…" (DRV-02). Le prix
                      reste affiché en grand en haut de fiche → pas de perte
                      d'info. Dès sm il revient dans le CTA. */}
                  <span className="opacity-50 shrink-0 hidden sm:inline">·</span>
                  <span className="tabular-nums shrink-0 hidden sm:inline">
                    {formatPrice(totalCents)}
                  </span>
                  <ArrowRight
                    size={16}
                    className="transition-transform group-hover:translate-x-0.5 shrink-0"
                    aria-hidden
                  />
                </>
              )}
            </span>
          )}
        </button>
      </div>
      {unitType === "weight" && (
        <p className="text-[11px] text-[#0F1A14]/60 inline-flex items-center gap-1.5 self-start">
          <Scale size={11} className="text-[#C9A227]" aria-hidden />
          Estimation pour {formatKg(kg)} ·{" "}
          <Link
            to="/drive-au-poids"
            className="underline underline-offset-2 hover:text-[#0E3B2E]"
          >
            Pourquoi un poids estimé ?
          </Link>
        </p>
      )}
      {cartQty > 0 && !justAdded && (
        <Link
          to="/panier"
          className="h-12 w-full bg-white border-2 border-[#0E3B2E]/15 rounded-2xl flex items-center justify-center gap-2 text-[#0E3B2E] font-bold text-[14px] active:scale-[0.99] transition-transform"
        >
          <span className="inline-flex w-7 h-7 rounded-full bg-[#0E3B2E] text-white items-center justify-center">
            <ShoppingCart size={14} strokeWidth={2.4} />
          </span>
          Voir le panier
          <span className="inline-flex min-w-[24px] h-6 rounded-full bg-[#C9A227]/20 text-[#0E3B2E] items-center justify-center px-2 tabular-nums text-[12px] font-extrabold">
            {cartQty}
          </span>
          <ArrowRight size={14} className="text-[#0E3B2E]/60" />
        </Link>
      )}
    </div>
  );

  // Bloc "Préviens-moi au retour" — affiché uniquement en rupture
  // (inStock=false). Connecté : un seul bouton (email déjà connu).
  // Visiteur : champ email ≥16px (text-base) pour bloquer le zoom iOS, puis
  // bouton. État "inscrit" remplace tout par une confirmation calme.
  const NotifyBlock = () => {
    if (product.inStock) return null;
    if (notifySubscribed) {
      return (
        <section className="mt-5 rounded-3xl border border-[#0E3B2E]/15 bg-[#E8F5EE] p-4 flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-full bg-white flex items-center justify-center">
            <BellRing size={18} className="text-[#2D7A4F]" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[#0E3B2E]">
              Tu es bien inscrit
            </p>
            <p className="text-xs text-[#0F1A14]/65 mt-0.5">
              On te préviendra par email dès le retour en stock.
            </p>
          </div>
        </section>
      );
    }
    return (
      <section className="mt-5 rounded-3xl border border-[#0E3B2E]/15 bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-full bg-[#FAF7EE] flex items-center justify-center">
            <Bell size={18} className="text-[#0E3B2E]" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[#0E3B2E]">
              Préviens-moi au retour
            </p>
            <p className="text-xs text-[#0F1A14]/60 mt-0.5">
              {user
                ? "On t'envoie un email dès que ce produit revient en stock."
                : "Laisse ton email, on te prévient dès que ce produit revient."}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          {!user && (
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.value)}
              placeholder="ton@email.fr"
              aria-label="Adresse email pour être prévenu du retour en stock"
              className="flex-1 min-w-0 h-12 px-4 text-base rounded-2xl bg-[#FAF7EE] border border-[#0E3B2E]/15 text-[#0E3B2E] placeholder:text-[#0F1A14]/40 focus:outline-none focus:ring-2 focus:ring-[#C9A227]/40"
            />
          )}
          <button
            type="button"
            onClick={handleNotify}
            disabled={notifySubmitting}
            className="shrink-0 h-12 px-5 rounded-2xl bg-[#0E3B2E] text-white font-bold text-[14px] inline-flex items-center justify-center gap-2 active:scale-[0.99] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Bell size={16} strokeWidth={2.4} aria-hidden />
            {notifySubmitting ? "Envoi…" : "Préviens-moi"}
          </button>
        </div>
      </section>
    );
  };

  return (
    <div className="min-h-dvh bg-[#FAF7EE]">
      {/* Header overlay */}
      <header
        className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-3 py-3 pointer-events-none"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <button
          onClick={goBack}
          aria-label="Retour"
          className="pointer-events-auto w-11 h-11 rounded-full bg-white/95 backdrop-blur-md text-[#0E3B2E] flex items-center justify-center shadow-lg active:scale-90 transition-transform"
        >
          <ArrowLeft size={22} strokeWidth={2.2} aria-hidden />
        </button>
        {/* DRV-10 — le pill "Halal certifié" du header chevauchait le
            médaillon rond "Certifié" posé sur l'image (même coin haut-droite),
            doublonnant l'info. On garde le seul médaillon-estampille sur le
            hero et on retire le pill redondant du header. */}
      </header>

      <div className="md:max-w-6xl md:mx-auto md:px-8 md:pt-24 md:grid md:grid-cols-[1.05fr_1fr] md:gap-12 lg:gap-16">
        <div className="md:sticky md:top-24 md:self-start">
          <div className="relative aspect-square w-full max-w-2xl mx-auto md:max-w-none bg-white overflow-hidden md:rounded-[36px] md:shadow-[0_30px_60px_-30px_rgba(8,42,32,0.35)] animate-in fade-in zoom-in-95 duration-500">
            {isPlaceholderUrl(product.imageUrl) || heroFailed ? (
              <ProductImageFallback category={product.category} size="lg" />
            ) : (
              <img
                src={cdnImage(product.imageUrl, { width: 1200 })}
                alt={product.name}
                width={1200}
                height={1200}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                onError={() => setHeroFailed(true)}
                /* View Transitions API — partage le même name que la card
                 source pour un morph natif Safari/Chrome récents. Sur
                 browsers sans support, propriété ignorée silencieusement. */
                style={{ viewTransitionName: id ? `product-${id}` : undefined }}
                className="w-full h-full object-cover"
              />
            )}
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-[#FAF7EE]/80 md:hidden"
            />

            {/* Mini-sceau Halal Certifié overlay top-right.
                Boucherie/charcuterie uniquement. Réutilise le ring or
                .halal-seal-ring du onboarding pour cohérence. Posé sur
                l'image hero comme une vraie estampille certif. ~68px
                pour rester lisible mobile sans dominer l'image. */}
            {showHalalBadge && (
              <div
                className="absolute top-3 right-3 md:top-5 md:right-5 z-10 pointer-events-none"
                aria-hidden
              >
                <div className="relative w-[68px] h-[68px] md:w-[80px] md:h-[80px] rounded-full bg-[#FAF7EE] shadow-lg shadow-[#082A20]/30 flex flex-col items-center justify-center">
                  <span className="halal-seal-ring absolute inset-[5px] rounded-full border-[1.5px] border-[#C9A227]/55" />
                  <span className="relative text-[8px] md:text-[9px] uppercase tracking-[0.22em] font-bold text-[#C9A227] leading-tight">
                    Halal
                  </span>
                  <span className="relative text-[11px] md:text-[13px] font-extrabold text-[#0E3B2E] leading-tight tracking-[-0.02em]">
                    Certifié
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* pb-cta-only (token charte) sur mobile = clearance CTA sticky +
            safe-area + respiration, pour que le dernier contenu (suggestions)
            ne soit jamais masqué par la barre "Ajouter au panier". Sur
            desktop le CTA est inline → md:pb-8 suffit, on neutralise le token. */}
        <div className="max-w-2xl mx-auto px-4 mt-4 md:mt-0 md:px-0 relative pb-cta-only md:!pb-8">
          <section className="px-1 pt-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <Link
              to={`/?category=${product.category}`}
              className="inline-block text-[10px] uppercase tracking-[0.22em] text-[#C9A227] font-bold hover:underline underline-offset-[5px]"
            >
              {product.category.replace("-", " & ")}
            </Link>
            <h1 className="mt-2 text-[26px] md:text-[32px] leading-[1.15] text-[#0E3B2E] font-extrabold tracking-[-0.025em]">
              {product.name}
            </h1>
            <div className="mt-3 flex items-baseline gap-3 flex-wrap">
              {showDlcPrice && dlcDiscount ? (
                // Prix barré + remisé + tag "-X% · DLC courte" (remise réelle).
                <DlcPriceTag discount={dlcDiscount} variant="detail" />
              ) : (
                <span className="text-[26px] md:text-[32px] font-extrabold text-[#0E3B2E] tabular-nums tracking-[-0.02em]">
                  {formatPriceWithUnit(product)}
                </span>
              )}
              {unitType === "unit" && (
                // Uppercase tracké pour aligner la casse sur les cards
                // catalogue/suggestions (ProductCard), qui rendent le même
                // libellé en majuscules — sinon "à la pièce" (ici) côtoyait
                // "À LA PIÈCE" (cards) sur la même PDP (DRV-12).
                <span className="text-[11px] uppercase tracking-[0.12em] text-[#0F1A14]/70 font-semibold">
                  {productUnitLabel(product)}
                </span>
              )}
            </div>
            {hint && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] font-bold text-[#C9A227]">
                <Scale size={11} aria-hidden />
                {hint}
              </p>
            )}
          </section>

          {/* Pills caractéristiques */}
          <section className="mt-4 flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-2 duration-500 [animation-delay:100ms] [animation-fill-mode:backwards]">
            <FeatPill
              icon={
                product.inStock ? (
                  <span
                    className="w-2 h-2 rounded-full bg-[#2D7A4F]"
                    aria-hidden
                  />
                ) : (
                  <span
                    className="w-2 h-2 rounded-full bg-[#E5483D]"
                    aria-hidden
                  />
                )
              }
              label={product.inStock ? "Disponible" : "Indisponible"}
              tone={product.inStock ? "success" : "error"}
            />
            <FeatPill
              icon={<Store size={12} aria-hidden />}
              label="Retrait gratuit"
              tone="brand"
            />
            <FeatPill
              icon={<Sparkles size={12} aria-hidden />}
              label="Frais du jour"
              tone="brand"
            />
          </section>

          {/* Sélecteur weight / weight_bracket — desktop & mobile (inline). */}
          {unitType === "weight" && (
            <section className="mt-6 px-1">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#C9A227] font-bold mb-3">
                Choisissez votre poids estimé
              </p>
              <KgStepper />
              <p className="mt-2 text-[12px] text-[#0F1A14]/60">
                Saisissez le poids que vous souhaitez recevoir. Notre équipe
                pèsera et préparera au plus proche.{" "}
                <Link
                  to="/drive-au-poids"
                  className="underline underline-offset-2 hover:text-[#0E3B2E]"
                >
                  Comment ça marche
                </Link>
              </p>
            </section>
          )}

          {unitType === "weight_bracket" && brackets.length > 0 && (
            <section className="mt-6 px-1">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#C9A227] font-bold mb-3">
                Choisissez votre taille
              </p>
              <BracketCards />
            </section>
          )}

          {/* Description */}
          {product.description && (
            <section className="mt-6 px-1 animate-in fade-in slide-in-from-bottom-2 duration-500 [animation-delay:200ms] [animation-fill-mode:backwards]">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#C9A227] font-bold mb-3">
                À propos
              </p>
              <p className="text-[15px] text-[#0F1A14]/80 leading-relaxed max-w-[60ch]">
                {product.description}
              </p>
            </section>
          )}

          <section className="mt-5 flex items-start gap-3 rounded-3xl border border-[#0E3B2E]/15 bg-white p-4 animate-in fade-in slide-in-from-bottom-2 duration-500 [animation-delay:300ms] [animation-fill-mode:backwards]">
            <div className="shrink-0 w-10 h-10 rounded-full bg-[#FAF7EE] flex items-center justify-center">
              <Truck size={18} className="text-[#0E3B2E]" aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[#0E3B2E]">
                Retrait en magasin
              </p>
              <p className="text-xs text-[#0F1A14]/60 mt-0.5">
                Salamarket Toulouse · 8 av. Larrieu&#8209;Thibaud
              </p>
              <p className="text-xs text-[#0F1A14]/60 mt-0.5">
                Choisissez votre créneau au panier
              </p>
            </div>
          </section>

          {/* "Préviens-moi au retour" — visible uniquement si rupture. */}
          <NotifyBlock />

          {/* Passeport halal — boucherie/charcuterie uniquement. En évidence
              sur la PDP : HalalBadgeLink (variant detail) résout le lot RÉEL le
              plus récent (produits_lots) et draine vers /lot/{id} (page de
              traçabilité publique). Bloc statique propre si aucun lot — jamais
              de lien démo codé en dur. Suivi d'une ligne explicative QR. */}
          {showHalalBadge && (
            <section className="mt-3 flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-2 duration-500 [animation-delay:340ms] [animation-fill-mode:backwards]">
              <HalalBadgeLink
                productId={product.id}
                isCertifiable={showHalalBadge}
                variant="detail"
              />
              <p className="px-1 text-[11px] text-[#3E2E0A]/70 inline-flex items-center gap-1.5 leading-relaxed">
                <QrCode
                  size={12}
                  className="text-[#C9A227] shrink-0"
                  aria-hidden
                />
                Chaque lot a son QR code unique pour vérifier l&apos;origine et
                la certification.
              </p>

              {/* Frise traçabilité animée : ferme → abattoir certifié →
                  rayon. Lit le dernier lot du produit ; fallback générique
                  non cliquable si aucun lot. */}
              <TracabiliteFrise
                productId={product.id}
                isCertifiable={showHalalBadge}
                className="mt-1"
              />
            </section>
          )}

          {/* CTA inline desktop */}
          <section className="hidden md:flex flex-col gap-3 mt-7 pt-6 border-t border-[#0E3B2E]/15 animate-in fade-in slide-in-from-bottom-2 duration-500 [animation-delay:350ms] [animation-fill-mode:backwards]">
            <CtaCluster />
          </section>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <section className="mt-8 md:mt-10 animate-in fade-in slide-in-from-bottom-2 duration-500 [animation-delay:400ms] [animation-fill-mode:backwards]">
              <h2 className="text-base md:text-[17px] font-bold text-[#0E3B2E] mb-3 px-1">
                Vous aimerez aussi
              </h2>
              <div className="grid grid-cols-2 gap-3 md:gap-4">
                {suggestions.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Sticky bottom MOBILE UNIQUEMENT. Padding-inline fluide px-3 →
          sm:px-5 : 12px sur iPhone SE (320px) où chaque pixel de largeur de
          label compte, 20px dès 640px pour la respiration. Le contenu
          (CtaCluster) gère son propre rétrécissement, ce padding ne fait que
          border la gouttière. */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-border md:hidden">
        <div className="max-w-2xl mx-auto px-3 sm:px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <CtaCluster compact />
        </div>
      </div>

      {/* Région live polie — annonce l'ajout panier aux lecteurs d'écran.
          Unique pour la page (les deux CtaCluster partagent cet état). */}
      <span key={announce?.key} aria-live="polite" className="sr-only">
        {announce?.msg ?? ""}
      </span>
    </div>
  );
};

const FeatPill = ({
  icon,
  label,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "success" | "error" | "brand";
}) => {
  // DSN-13 — tons calés sur les tokens charte (success #2D7A4F / success-soft
  // #E8F5EE ; danger #E5483D / danger-soft #FEF2F1 ; brand sapin), plus le
  // vert/rouge Tailwind brut hors palette.
  const tones = {
    success: "bg-[#E8F5EE] text-[#2D7A4F]",
    error: "bg-[#FEF2F1] text-[#E5483D]",
    brand: "bg-[#0E3B2E]/8 text-[#0E3B2E]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold",
        tones[tone],
      )}
    >
      {icon}
      {label}
    </span>
  );
};

export default ProductDetail;
