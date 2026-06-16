import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { Product } from "@/types/product";
import { cdnImage } from "@/lib/imageUrl";
import { isPlaceholderUrl } from "@/components/ProductImageFallback";

// ─────────────────────────────────────────────────────────────────
// useAddToast — toast récap « ajouté au panier » enrichi (sonner).
//
// Au lieu d'un simple message, on pousse un toast custom avec une vignette
// du produit + un bouton « Voir le panier » qui route vers /panier. Vient
// EN COMPLÉMENT du flying chip et de l'annonce aria-live de ProductCard
// (on n'enlève rien) : feedback visuel riche pour les voyants, sans toucher
// l'accessibilité existante.
//
// Sonner (monté dans App.tsx) gère ses propres transitions et respecte
// prefers-reduced-motion (animations neutralisées). On garde le contenu
// sobre : pas de picto décoratif, hiérarchie par la typo, durée courte.
// ─────────────────────────────────────────────────────────────────

// Vignette légère pour le toast — fallback discret en carré crème si l'URL
// est un placeholder ou si l'image échoue (hors-ligne, CDN). On reste sur
// un <img> simple (le toast est éphémère) plutôt que ProductImageFallback
// pour garder le rendu compact.
const Thumb = ({ product }: { product: Product }) => {
  const placeholder = isPlaceholderUrl(product.imageUrl);
  if (placeholder) {
    return (
      <div
        aria-hidden
        className="h-12 w-12 shrink-0 rounded-xl bg-cream-200 ring-1 ring-black/5"
      />
    );
  }
  return (
    <img
      src={cdnImage(product.imageUrl, { width: 96 })}
      alt=""
      width={48}
      height={48}
      loading="lazy"
      decoding="async"
      className="h-12 w-12 shrink-0 rounded-xl object-cover bg-cream-200 ring-1 ring-black/5"
      onError={(e) => {
        // Image morte → on masque l'img (le toast reste lisible sans).
        e.currentTarget.style.visibility = "hidden";
      }}
    />
  );
};

export const useAddToast = () => {
  const navigate = useNavigate();

  return useCallback(
    (product: Product) => {
      toast.custom(
        (t) => (
          <div className="flex w-full items-center gap-3 rounded-2xl border border-border bg-white px-3.5 py-3 shadow-lg shadow-sapin-deep/10">
            <Thumb product={product} />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-bold uppercase tracking-[0.1em] text-gold-text">
                Ajouté au panier
              </p>
              <p className="mt-0.5 truncate text-[14px] font-semibold text-ink">
                {product.name}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                toast.dismiss(t);
                navigate("/panier");
              }}
              className="shrink-0 inline-flex h-9 items-center rounded-full bg-sapin px-3.5 text-[12.5px] font-semibold text-cream active:scale-[0.97] transition-transform"
            >
              Voir le panier
            </button>
          </div>
        ),
        { duration: 3500 },
      );
    },
    [navigate],
  );
};
