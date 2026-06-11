import { useState } from "react";
import { ChefHat, Check, Plus, Clock, Users } from "lucide-react";
import { toast } from "sonner";
import type { CartItem } from "@/stores/cartStore";
import { useCartStore } from "@/stores/cartStore";
import { useRecettesDrive } from "@/hooks/useRecettesDrive";

/**
 * Suggestion de recette liée au panier — propose le plat le plus cohérent
 * avec les produits déjà ajoutés et permet d'ajouter en un tap les
 * ingrédients manquants disponibles au catalogue.
 *
 * Ne rend rien si aucune recette pertinente (hook → null) : pas de section
 * vide dans le panier.
 */
export const RecetteSuggestion = ({
  cartItems,
}: {
  cartItems: CartItem[];
}) => {
  const suggestion = useRecettesDrive(cartItems);
  const addItem = useCartStore((s) => s.addItem);
  const [added, setAdded] = useState(false);

  if (!suggestion) return null;

  const { recette, ingredients, ajoutables } = suggestion;

  const handleAddMissing = () => {
    if (ajoutables.length === 0) return;
    ajoutables.forEach((p) => addItem(p));
    setAdded(true);
    toast.success(
      ajoutables.length > 1
        ? `${ajoutables.length} ingrédients ajoutés au panier`
        : "Ingrédient ajouté au panier",
    );
  };

  return (
    <section className="mt-2 rounded-2xl border border-[#0E3B2E]/12 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="shrink-0 flex h-12 w-12 items-center justify-center rounded-xl bg-[#FBF6E2] text-[26px] leading-none">
          <span aria-hidden>{recette.emoji}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] font-bold text-[#C9A227]">
            <ChefHat size={12} aria-hidden /> Idée recette
          </p>
          <h3 className="mt-0.5 text-[15px] font-bold text-[#0F1A14] leading-snug line-clamp-2">
            {recette.nom}
          </h3>
          <p className="mt-0.5 text-[13px] text-[#0F1A14]/65 line-clamp-2">
            {recette.accroche}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#0F1A14]/55">
            <span className="inline-flex items-center gap-1">
              <Clock size={11} aria-hidden /> {recette.duree}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users size={11} aria-hidden /> {recette.portions} pers.
            </span>
          </div>
        </div>
      </div>

      {/* Ingrédients : ceux du panier cochés, les manquants en clair. */}
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {ingredients.map((x) => (
          <li
            key={x.ingredient.label}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium ${
              x.inCart
                ? "bg-[#0E3B2E]/[0.06] text-[#0E3B2E]"
                : "bg-[#FAF7EE] text-[#0F1A14]/60 border border-[#0E3B2E]/10"
            }`}
          >
            {x.inCart && <Check size={11} strokeWidth={2.6} aria-hidden />}
            <span className="truncate max-w-[10rem]">{x.ingredient.label}</span>
          </li>
        ))}
      </ul>

      {!added ? (
        <button
          type="button"
          onClick={handleAddMissing}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0E3B2E] px-4 py-3 text-sm font-semibold text-white active:scale-[0.98] transition-transform"
        >
          <Plus size={16} strokeWidth={2.4} aria-hidden />
          Ajouter les ingrédients manquants
          <span className="text-[12px] font-bold text-white/70">
            ({ajoutables.length})
          </span>
        </button>
      ) : (
        <p className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0E3B2E]">
          <Check size={15} strokeWidth={2.6} aria-hidden />
          Ingrédients ajoutés à votre panier
        </p>
      )}
    </section>
  );
};
