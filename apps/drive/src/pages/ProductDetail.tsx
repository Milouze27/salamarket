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
  Minus,
  Plus,
  QrCode,
  Scale,
  ShoppingCart,
  Sparkles,
  Store,
  Truck,
} from "lucide-react";
import { useProduct } from "@/hooks/useProduct";
import { useProducts } from "@/hooks/useProducts";
import { useCartStore } from "@/stores/cartStore";
import { formatPrice, unitLabel } from "@/lib/format";
import {
  computePrixEstime,
  formatKg,
  formatPriceWithUnit,
  getBrackets,
  unitHint,
} from "@salamarket/shared";
import { ProductCard } from "@/components/ProductCard";
import { cn } from "@/lib/utils";
import { cdnImage } from "@/lib/imageUrl";

const MAX_QTY = 50;
const MIN_KG = 0.1;
const MAX_KG = 5;
const STEP_KG = 0.1;

const ProductDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: product, isLoading, isError, error } = useProduct(id);
  const { data: allProducts } = useProducts();

  const addItem = useCartStore((s) => s.addItem);
  const cartQty = useCartStore((s) =>
    id ? s.getQuantity(id) : 0,
  );

  const unitType = product?.unitType ?? "unit";
  const brackets = useMemo(
    () => (product ? getBrackets(product) : []),
    [product],
  );

  // États unifiés — selon unitType on lit qty / kg / bracketIndex
  const [qty, setQty] = useState(1);
  const [kg, setKg] = useState<number>(1);
  const [bracketIndex, setBracketIndex] = useState(0);
  const [justAdded, setJustAdded] = useState(false);
  const [heroFailed, setHeroFailed] = useState(false);
  const addedTimerRef = useRef<number | null>(null);

  // Re-init quand l'id change OU quand on charge le produit.
  // BUG-012 — défaut 1.0 kg (et plus product.estimatedWeightKg).
  // Le 5 kg utilisé en initial était trop élevé pour un parcours panier
  // standard : on standardise à 1 kg et le client ajuste via le stepper.
  useEffect(() => {
    setQty(1);
    setBracketIndex(0);
    setJustAdded(false);
    if (product) {
      setKg(1);
    }
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
    // @ts-expect-error - startViewTransition not yet in TS lib.dom default
    if (typeof document !== "undefined" && document.startViewTransition) {
      // @ts-expect-error - same
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
    if (unitType === "weight") {
      // Une ligne par add (lineId aléatoire) ; le kg est mémorisé sur la ligne.
      addItem(product, { quantiteKg: kg });
    } else if (unitType === "weight_bracket") {
      addItem(product, { bracketIndex });
    } else {
      // unit — on duplique l'add pour respecter qty (fusion gérée par store)
      for (let i = 0; i < qty; i += 1) addItem(product);
    }
    setJustAdded(true);
    if (addedTimerRef.current !== null) {
      window.clearTimeout(addedTimerRef.current);
    }
    addedTimerRef.current = window.setTimeout(() => {
      setJustAdded(false);
      addedTimerRef.current = null;
    }, 2000);
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

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-[#FAF7EE]">
        <div
          className="aspect-square w-full max-w-2xl mx-auto bg-[linear-gradient(90deg,#E8E4D8_0%,#F2F2EE_50%,#E8E4D8_100%)] bg-[length:200%_100%] animate-skeleton-shimmer"
        />
        <div className="px-4 py-5 space-y-3 max-w-2xl mx-auto">
          <div className="h-8 w-2/3 rounded bg-[linear-gradient(90deg,#E8E4D8_0%,#F2F2EE_50%,#E8E4D8_100%)] bg-[length:200%_100%] animate-skeleton-shimmer" />
          <div className="h-5 w-1/3 rounded bg-[linear-gradient(90deg,#E8E4D8_0%,#F2F2EE_50%,#E8E4D8_100%)] bg-[length:200%_100%] animate-skeleton-shimmer" />
          <div className="h-20 w-full rounded bg-[linear-gradient(90deg,#E8E4D8_0%,#F2F2EE_50%,#E8E4D8_100%)] bg-[length:200%_100%] animate-skeleton-shimmer" />
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

  const hint = unitHint(product);

  // Composant Stepper kg réutilisé desktop + mobile.
  // Boutons 44×44 pour respecter Apple HIG (≥44pt). Input en
  // inputMode="decimal" pour faire surgir le clavier numérique iOS et
  // text-base (16px) pour éviter le zoom auto Safari sur focus.
  const KgStepper = () => (
    <div className="flex items-center gap-2 bg-[#FAF7EE] rounded-2xl p-2 border border-[#0E3B2E]/15">
      <button
        type="button"
        onClick={() => setKg((v) => Math.max(MIN_KG, Math.round((v - STEP_KG) * 10) / 10))}
        disabled={kg <= MIN_KG}
        aria-label="Diminuer le poids estimé"
        className="w-11 h-11 rounded-full bg-white border border-[#0E3B2E]/12 flex items-center justify-center text-[#0E3B2E] active:scale-90 transition-transform shadow-sm disabled:opacity-30"
      >
        <Minus size={16} strokeWidth={2.5} aria-hidden />
      </button>
      <div className="flex flex-col items-center min-w-[5.5rem]">
        <input
          type="number"
          inputMode="decimal"
          min={MIN_KG}
          max={MAX_KG}
          step={STEP_KG}
          value={kg}
          onChange={(e) => {
            // BUG-012 — parseFloat avec replace virgule (locale fr) puis
            // clamp [MIN_KG..MAX_KG] + arrondi au dixième. Évite les NaN
            // et les valeurs hors-borne (ex. "999.99" → clamp 5).
            const raw = e.target.value.replace(",", ".");
            const v = parseFloat(raw);
            if (!Number.isFinite(v)) return;
            setKg(Math.min(MAX_KG, Math.max(MIN_KG, Math.round(v * 10) / 10)));
          }}
          className="w-20 text-center text-base font-bold tabular-nums text-[#0E3B2E] bg-transparent border-0 focus:outline-none focus:ring-2 focus:ring-[#C9A227]/40 rounded-md py-0.5"
          aria-label="Poids estimé en kg"
        />
        <span className="text-[10px] uppercase tracking-[0.12em] text-[#0F1A14]/55 font-semibold">
          kg estimés
        </span>
      </div>
      <button
        type="button"
        onClick={() => setKg((v) => Math.min(MAX_KG, Math.round((v + STEP_KG) * 10) / 10))}
        disabled={kg >= MAX_KG}
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

  // CTA bloc — partagé desktop & mobile.
  //
  // BUG-007 (iPhone SE 320px) : sur viewport étroit avec unitType=unit,
  // on a stepper(~140px) + CTA(flex-1) + gap dans un parent ~280px utile
  // (320 − padding 5×2). Si le prix ou le label dépassait, le bouton
  // sortait. Mitigations :
  //   1. `min-w-0` sur le bouton flex-1 pour qu'il puisse rétrécir sous
  //      son contenu (sans, flexbox respecte la min-content width du
  //      texte interne — c'est ça qui débordait).
  //   2. Le label est dans un <span> truncate avec gap-1.5 serré ; on
  //      ne masque rien, on accepte juste qu'il puisse se tronquer en
  //      "Ajouter au pa…" plutôt que casser le layout.
  //   3. Quand compact (sticky mobile), gap-2 au lieu de gap-3.
  //   4. Padding interne réduit pour libérer de la largeur de label.
  const CtaCluster = ({ compact = false }: { compact?: boolean }) => (
    <div className="flex flex-col gap-3 min-w-0">
      <div className={cn("flex items-center min-w-0", compact ? "gap-2" : "gap-3")}>
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
          disabled={!product.inStock}
          className={cn(
            "group flex-1 min-w-0 h-14 rounded-2xl bg-gradient-to-r from-[#0E3B2E] to-[#082A20] text-white font-bold text-[15px] shadow-lg shadow-[#0E3B2E]/30 hover:shadow-xl hover:shadow-[#0E3B2E]/40 active:scale-[0.99] transition-all flex items-center justify-center gap-1.5 px-3 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none",
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
                  <span className="opacity-50 shrink-0">·</span>
                  <span className="tabular-nums shrink-0">{formatPrice(totalCents)}</span>
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
        {showHalalBadge && (
          <div className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/95 backdrop-blur-md text-[#0E3B2E] text-xs font-bold shadow-lg">
            <BadgeCheck size={14} className="text-[#C9A227]" aria-hidden />
            Halal certifié
          </div>
        )}
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

        <div
          className="max-w-2xl mx-auto px-4 -mt-4 md:mt-0 md:px-0 relative md:pb-8"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8rem)" }}
        >
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
              <span className="text-[26px] md:text-[32px] font-extrabold text-[#0E3B2E] tabular-nums tracking-[-0.02em]">
                {formatPriceWithUnit(product)}
              </span>
              {unitType === "unit" && (
                <span className="text-sm text-[#6B7280]">
                  · {unitLabel(product.unit)}
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
                  <span className="w-2 h-2 rounded-full bg-green-600" aria-hidden />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-red-600" aria-hidden />
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
              <p className="text-sm font-bold text-[#0E3B2E]">Retrait en magasin</p>
              <p className="text-xs text-[#0F1A14]/60 mt-0.5">
                Salamarket Toulouse · 8 av. Larrieu&#8209;Thibaud
              </p>
              <p className="text-xs text-[#0F1A14]/60 mt-0.5">
                Choisissez votre créneau au panier
              </p>
            </div>
          </section>

          {/* Traçabilité halal — boucherie/charcuterie uniquement.
              Le lot QR est la promesse différenciante Salamarket : chaque
              barquette est traçable jusqu'à l'éleveur. On le pose ici sur
              chaque PDP viande pour ancrer la promesse marque et drainer
              vers /lot/L… qui montre le détail. */}
          {showHalalBadge && (
            <section className="mt-3 flex items-start gap-3 rounded-3xl border border-[#C9A227]/40 bg-[#FBF6E2] p-4 animate-in fade-in slide-in-from-bottom-2 duration-500 [animation-delay:340ms] [animation-fill-mode:backwards]">
              <div className="shrink-0 w-10 h-10 rounded-full bg-white flex items-center justify-center">
                <QrCode size={18} className="text-[#C9A227]" aria-hidden />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[#3E2E0A]">
                  Traçabilité halal
                </p>
                <p className="text-xs text-[#3E2E0A]/75 mt-0.5 leading-relaxed">
                  Chaque lot a son QR code unique pour vérifier l&apos;origine
                  et la certification.{" "}
                  <Link
                    to="/lot/L2026-05-A23"
                    className="underline underline-offset-2 font-semibold text-[#0E3B2E] hover:text-[#082A20]"
                  >
                    Voir un lot d&apos;exemple
                  </Link>
                </p>
              </div>
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

      {/* Sticky bottom MOBILE UNIQUEMENT.
          BUG-007 : px-5 (20px chaque côté) sur viewport 320px laissait
          ~280px utile. Stepper(~140) + CTA(flex-1) + gap empilés = label
          du bouton souvent tronqué dès le premier caractère long. On
          bascule sur px-3 → sm:px-5 : 12px sur iPhone SE, 20px à partir
          de 640px. La BottomNav (en dessous) suit la même règle. */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-border md:hidden"
        style={{ bottom: 0 }}
      >
        <div
          className="max-w-2xl mx-auto px-3 sm:px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <CtaCluster compact />
        </div>
      </div>
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
  const tones = {
    success: "bg-green-50 text-green-700",
    error: "bg-red-50 text-red-700",
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
