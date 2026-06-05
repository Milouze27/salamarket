import { useEffect, useMemo, useState } from "react";
import { Plus, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useProducts } from "@/hooks/useProducts";
import { useCartStore } from "@/stores/cartStore";
import { cdnImage } from "@/lib/imageUrl";
import type { Product } from "@/types/product";

// ─────────────────────────────────────────────────────────────────
// BundleCarousel : paniers-type par occasion ("Soiree Ramadan", "Aid"...).
//
// Source : table occasion_bundles. ATTENTION : cette table N'EXISTE PAS
// ENCORE en prod. Toute la lecture est best-effort :
//   - requete try/catch → [] en cas d'erreur (table absente, RLS, reseau)
//   - 0 ligne → le composant return null (jamais de crash ni d'empty-state)
//
// Pas d'util hijri cote drive pour le moment : on affiche donc tous les
// bundles actifs. Le filtrage par occasion courante sera branche le jour
// ou un util hijri existera (voir TODO plus bas).
// ─────────────────────────────────────────────────────────────────

interface OccasionBundle {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  product_ids: string[];
  occasion: string | null;
  active: boolean;
  sort: number | null;
}

// La table occasion_bundles n'est pas dans le type Database genere (absente
// en prod). On caste le client en `any` UNIQUEMENT pour cette requete afin
// d'eviter une erreur TS sur un nom de table inconnu, tout en gardant le
// reste du fichier strictement type.
type LooseSupabase = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: unknown,
      ) => {
        order: (
          col: string,
          opts: { ascending: boolean },
        ) => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
};

async function fetchActiveBundles(): Promise<OccasionBundle[]> {
  try {
    const client = supabase as unknown as LooseSupabase;
    const { data, error } = await client
      .from("occasion_bundles")
      .select(
        "id, name, description, image_url, product_ids, occasion, active, sort",
      )
      .eq("active", true)
      .order("sort", { ascending: true });

    if (error || !Array.isArray(data)) return [];

    return (data as unknown[])
      .map((raw): OccasionBundle | null => {
        const row = raw as Partial<OccasionBundle> & Record<string, unknown>;
        if (
          !row ||
          typeof row.id !== "string" ||
          typeof row.name !== "string"
        ) {
          return null;
        }
        const productIds = Array.isArray(row.product_ids)
          ? (row.product_ids as unknown[]).filter(
              (x): x is string => typeof x === "string",
            )
          : [];
        return {
          id: row.id,
          name: row.name,
          description:
            typeof row.description === "string" ? row.description : null,
          image_url: typeof row.image_url === "string" ? row.image_url : null,
          product_ids: productIds,
          occasion: typeof row.occasion === "string" ? row.occasion : null,
          active: row.active !== false,
          sort: typeof row.sort === "number" ? row.sort : null,
        };
      })
      .filter((b): b is OccasionBundle => b !== null);
  } catch {
    // Table absente / reseau / RLS : on degrade en silence, jamais de crash.
    return [];
  }
}

const BundleImage = ({ bundle }: { bundle: OccasionBundle }) => {
  const [failed, setFailed] = useState(!bundle.image_url);

  if (failed || !bundle.image_url) {
    // Fallback degrade sapin → or, monogramme discret. Pas d'empty-state
    // moche : on garde la carte premium meme sans photo.
    return (
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#0E3B2E] via-[#0E3B2E] to-[#C9A227]"
      >
        <span className="text-[44px] font-extrabold text-[#FAF7EE]/90 tracking-[-0.04em]">
          {bundle.name.slice(0, 1).toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <img
      src={cdnImage(bundle.image_url, { width: 800 })}
      alt={bundle.name}
      loading="lazy"
      decoding="async"
      width={800}
      height={600}
      onError={() => setFailed(true)}
      className="w-full h-full object-cover transition-transform duration-[700ms] ease-out group-hover:scale-[1.05]"
    />
  );
};

export const BundleCarousel = () => {
  const [bundles, setBundles] = useState<OccasionBundle[]>([]);
  const { data: products } = useProducts();
  const addItem = useCartStore((s) => s.addItem);

  useEffect(() => {
    let alive = true;
    fetchActiveBundles().then((rows) => {
      if (alive) setBundles(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Index produit par id pour resoudre product_ids → Product reels du
  // catalogue deja charge (pas de second fetch).
  const productsById = useMemo(() => {
    const map = new Map<string, Product>();
    (products ?? []).forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);

  // Filtrage occasion : pas d'util hijri dispo cote drive → on affiche tous
  // les bundles actifs. Le jour ou un util hijri existe, filtrer ici sur
  // bundle.occasion === occasionCourante (en gardant les bundles sans
  // occasion comme "toujours visibles").
  const visibleBundles = bundles;

  const handleAddBundle = (bundle: OccasionBundle) => {
    const resolved = bundle.product_ids
      .map((id) => productsById.get(id))
      .filter((p): p is Product => p != null && p.inStock);

    if (resolved.length === 0) {
      toast.error("Produits indisponibles pour le moment");
      return;
    }

    // addItem ignore deja les produits hors stock (garde cote store) ; on
    // ajoute les disponibles, on ignore silencieusement les indispos.
    resolved.forEach((p) => addItem(p));

    toast.success(`Panier ${bundle.name} ajoute`, {
      description:
        resolved.length > 1
          ? `${resolved.length} produits ajoutes au panier`
          : "1 produit ajoute au panier",
    });
  };

  // 0 bundle → return null. Jamais de section vide sur la home.
  if (visibleBundles.length === 0) return null;

  return (
    <section
      aria-labelledby="bundle-carousel-title"
      className="relative bg-[#FAF7EE]"
    >
      <div aria-hidden className="border-t border-[#0E3B2E]/12" />

      <div className="max-w-7xl mx-auto px-6 md:px-8 pt-12 pb-14 md:pt-20 md:pb-24">
        {/* Header section : meme grammaire editoriale que WeeklyPicks. */}
        <div className="flex items-end justify-between gap-6 mb-9 md:mb-14">
          <div className="min-w-0">
            <div className="flex items-center gap-4 mb-5 md:mb-6">
              <span className="text-[26px] md:text-[30px] font-extrabold text-[#C9A227] tabular-nums leading-none tracking-[-0.04em]">
                03
              </span>
              <span
                aria-hidden
                className="h-px flex-1 max-w-[80px] bg-[#0E3B2E]/25"
              />
              <span className="text-[10px] uppercase tracking-[0.32em] font-bold text-[#0E3B2E]">
                Paniers d&apos;occasion
              </span>
            </div>
            <h2
              id="bundle-carousel-title"
              className="text-[30px] md:text-[44px] lg:text-[52px] leading-[0.98] text-[#0E3B2E] font-extrabold tracking-[-0.035em]"
            >
              Tout prêt, en un geste.
            </h2>
          </div>
        </div>

        {/* Grille responsive · scroll horizontal mobile, comme WeeklyPicks. */}
        <ul
          className="
            flex md:grid md:grid-cols-3 gap-5 md:gap-8
            -mx-6 md:mx-0 px-6 md:px-0
            overflow-x-auto md:overflow-visible scrollbar-none
            snap-x snap-mandatory md:snap-none
          "
        >
          {visibleBundles.map((bundle) => {
            const count = bundle.product_ids.length;
            return (
              <li
                key={bundle.id}
                className="shrink-0 w-[82%] sm:w-[60%] md:w-auto snap-start"
              >
                <article className="group flex flex-col">
                  {/* Visuel dominant 4:5 : fallback degrade si pas d'image. */}
                  <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl bg-white shadow-[0_20px_40px_-24px_rgba(8,42,32,0.25)]">
                    <BundleImage bundle={bundle} />

                    {/* Nb de produits : pill frosted bas-gauche. */}
                    <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 pl-2 pr-2.5 h-7 rounded-full bg-[#FAF7EE]/95 backdrop-blur text-[11px] font-extrabold text-[#0E3B2E] shadow-sm">
                      <PackageCheck
                        size={13}
                        className="text-[#C9A227]"
                        aria-hidden
                      />
                      <span className="tabular-nums">{count}</span>
                      produit{count > 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Bloc info : nom + description + CTA ajouter. */}
                  <div className="mt-5 px-1 flex flex-col flex-1">
                    <h3 className="text-[17px] md:text-[19px] leading-[1.25] text-[#0E3B2E] font-bold tracking-[-0.02em]">
                      {bundle.name}
                    </h3>
                    {bundle.description && (
                      <p className="mt-2 text-[13px] leading-[1.5] text-[#0F1A14]/65 line-clamp-2">
                        {bundle.description}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => handleAddBundle(bundle)}
                      aria-label={`Ajouter le panier ${bundle.name} au panier`}
                      className="mt-4 inline-flex items-center justify-center gap-2 h-12 w-full rounded-full bg-[#0E3B2E] text-[#FAF7EE] text-[14px] font-semibold shadow-lg shadow-[#0E3B2E]/25 hover:bg-[#082A20] active:scale-[0.98] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A227] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAF7EE]"
                    >
                      <Plus size={18} strokeWidth={2.4} aria-hidden />
                      Ajouter au panier
                    </button>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};
