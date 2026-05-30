import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Info,
  Minus,
  Plus,
  Scale,
  ShoppingBag,
  Store,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { useCartStore } from "@/stores/cartStore";
import { formatPrice, unitLabel } from "@/lib/format";
import {
  computePrixEstime,
  formatKg,
  getBrackets,
} from "@salamarket/shared";

const MIN_ORDER_CENTS = 1500;

const Cart = () => {
  const navigate = useNavigate();
  const items = useCartStore((s) => s.items);
  const increment = useCartStore((s) => s.increment);
  const decrement = useCartStore((s) => s.decrement);
  const removeLine = useCartStore((s) => s.removeLine);
  const updateQuantiteKg = useCartStore((s) => s.updateQuantiteKg);
  const updateBracket = useCartStore((s) => s.updateBracket);
  const clear = useCartStore((s) => s.clear);

  // Calcul du sous-total en cents — gère unit/weight/weight_bracket
  const subtotal = items.reduce((sum, i) => {
    const qty =
      i.unitType === "weight"
        ? (i.quantiteKg ?? 0) * i.quantity
        : i.quantity;
    const eur = computePrixEstime(i.product, qty, i.bracketIndex ?? 0);
    return sum + Math.round(eur * 100);
  }, 0);

  // A-t-on au moins une ligne au poids ? Conditionne l'affichage du
  // bandeau "vous serez débité du poids réel".
  const hasWeightLine = items.some(
    (i) => i.unitType === "weight" || i.unitType === "weight_bracket",
  );

  const itemCount = items.reduce((n, i) => n + i.quantity, 0);

  const handleClear = () => {
    if (window.confirm("Vider le panier ? Cette action est irréversible.")) {
      clear();
      toast.success("Panier vidé");
    }
  };

  const handleCheckout = () => {
    navigate("/creneaux");
  };

  return (
    <div className="min-h-dvh bg-[#FAF7EE] text-text flex flex-col">
      <AppHeader showBack title="Mon panier" />

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
                onClick={handleClear}
                className="inline-flex items-center gap-1.5 min-h-11 bg-destructive/10 text-destructive font-bold text-[12px] px-3.5 py-2.5 rounded-full border border-destructive/20 active:scale-95 transition-transform"
              >
                <Trash2 size={12} strokeWidth={2.4} />
                Vider le panier
              </button>
            </div>

            {/* Bandeau pré-autorisation Drive au poids — affiché ssi
                au moins une ligne au poids dans le panier. */}
            {hasWeightLine && (
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
                const lineCents = Math.round(lineEur * 100);

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
                      <img
                        src={item.product.imageUrl}
                        alt={item.product.name}
                        width={80}
                        height={80}
                        loading="lazy"
                        decoding="async"
                        className="w-20 h-20 rounded-xl object-cover bg-bg"
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
                          {unitLabel(item.product.unit)}
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
                              onChange={(e) =>
                                updateQuantiteKg(
                                  item.lineId,
                                  Number(e.target.value),
                                )
                              }
                              className="w-16 px-2 py-1.5 text-base font-semibold text-[#0E3B2E] tabular-nums bg-[#FAF7EE] border border-[#0E3B2E]/15 rounded-md focus:outline-none focus:ring-2 focus:ring-[#C9A227]/40"
                              aria-label={`Poids estimé de ${item.product.name} en kg`}
                            />
                            <span className="text-xs text-muted">kg estimés</span>
                          </label>
                          {item.product.pricePerKg != null && (
                            <span className="text-[11px] text-muted">
                              · {item.product.pricePerKg.toFixed(2).replace(".", ",")} €/kg
                            </span>
                          )}
                        </div>
                      )}

                      {/* Ligne weight_bracket — bracket affiché + switch si plusieurs */}
                      {isBracket && bracket && (
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] font-bold text-[#C9A227]">
                            <Scale size={11} aria-hidden /> Bracket
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
                                  {b.label} — {b.prix.toFixed(2).replace(".", ",")} €
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
                              <Trash2 size={14} className="text-destructive" strokeWidth={2.4} />
                            ) : (
                              <Minus size={14} strokeWidth={2.5} />
                            )}
                          </button>
                          <span className="min-w-[1.75rem] w-7 text-center text-sm font-bold tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => increment(item.lineId)}
                            disabled={item.quantity >= 99}
                            aria-label={`Augmenter ${item.product.name}`}
                            className="w-9 h-9 rounded-full bg-[#0E3B2E] text-white flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40 shadow-sm"
                          >
                            <Plus size={14} strokeWidth={2.5} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Récap éditorial */}
            <section className="mt-5 px-1 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200 [animation-fill-mode:backwards]">
              <p className="text-[10px] uppercase tracking-[0.28em] font-bold text-[#C9A227] mb-4">
                Récapitulatif
              </p>
              <div className="space-y-2.5 text-[14px]">
                <div className="flex items-baseline justify-between">
                  <span className="text-[#6B7280]">
                    Sous-total {hasWeightLine ? "(estimation)" : ""}
                  </span>
                  <span className="text-[#0F1A14] tabular-nums">
                    {formatPrice(subtotal)}
                  </span>
                </div>
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
                  Total {hasWeightLine ? "estimé" : ""}
                </span>
                <span className="text-[28px] font-extrabold text-[#0E3B2E] tabular-nums tracking-[-0.025em]">
                  {formatPrice(subtotal)}
                </span>
              </div>
              {hasWeightLine && (
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
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 mb-3 text-sm">
                Commande minimum : {formatPrice(MIN_ORDER_CENTS)}. Il vous manque{" "}
                {formatPrice(MIN_ORDER_CENTS - subtotal)} pour commander.
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
    </div>
  );
};

export default Cart;
