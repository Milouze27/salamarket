// Catalogue Drive Pro. Grille de cartes produits avec tarif Pro (HT),
// conditionnement, et paliers dégressifs. Recherche + filtre catégorie.
// Ajout au panier en zustand (useProCartStore).

import { useMemo, useState } from "react";
import { Search, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

import { ProShell } from "@/components/pro/ProShell";
import { ProCompteActifGuard } from "@/components/pro/ProCompteActifGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { useCatalogPro } from "@/hooks/useCatalogPro";
import { useProCartStore } from "@/stores/proCart";
import { formatEur } from "@/lib/format";
import type { ProduitProAvecProduit } from "@/types/pro";

// ─────────────────────────────────────────────────────────────────────
// Carte produit
// ─────────────────────────────────────────────────────────────────────

interface CardProps {
  item: ProduitProAvecProduit;
}

const PaliersBadges = ({ item }: { item: ProduitProAvecProduit }) => {
  const palier1 =
    item.qty_palier_1 != null && item.remise_palier_1_pct != null
      ? `À partir de ${item.qty_palier_1} : −${item.remise_palier_1_pct}%`
      : null;
  const palier2 =
    item.qty_palier_2 != null && item.remise_palier_2_pct != null
      ? `À partir de ${item.qty_palier_2} : −${item.remise_palier_2_pct}%`
      : null;

  if (!palier1 && !palier2) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {palier1 && (
        <Badge variant="secondary" className="bg-gold-soft text-gold-text border-gold/30">
          {palier1}
        </Badge>
      )}
      {palier2 && (
        <Badge variant="secondary" className="bg-gold-soft text-gold-text border-gold/40">
          {palier2}
        </Badge>
      )}
    </div>
  );
};

const ProductCardPro = ({ item }: CardProps) => {
  const [qty, setQty] = useState(1);
  const addItem = useProCartStore((s) => s.addItem);
  const product = item.products;

  if (!product) return null;

  const onAdd = () => {
    addItem(
      {
        prix_id: item.id,
        produit_id: item.produit_id,
        product_name: product.name,
        product_image_url: product.image_url,
        product_tva_taux: product.tva_taux,
        product_unit: product.unit,
        prix_ht_unitaire: item.prix_ht_unitaire,
        quantite_par_conditionnement: item.quantite_par_conditionnement,
        conditionnement_pro: item.conditionnement_pro,
        qty_palier_1: item.qty_palier_1,
        qty_palier_2: item.qty_palier_2,
        remise_palier_1_pct: item.remise_palier_1_pct,
        remise_palier_2_pct: item.remise_palier_2_pct,
      },
      qty,
    );
    toast.success(`${product.name} ajouté au panier`);
    setQty(1);
  };

  return (
    <Card className="overflow-hidden flex flex-col">
      <div className="aspect-square bg-cream-200 overflow-hidden">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ink-faint">
            <ShoppingBag size={48} aria-hidden />
          </div>
        )}
      </div>
      <CardContent className="flex flex-col flex-1 p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="font-semibold text-ink text-sm leading-tight line-clamp-2">
            {product.name}
          </h3>
        </div>
        <p className="text-xs text-ink-soft mb-2">
          {item.conditionnement_pro ??
            `${item.quantite_par_conditionnement} × ${product.unit}`}
        </p>
        <div className="mt-auto">
          <div className="flex items-baseline gap-1 mb-1">
            <span className="text-lg font-bold text-ink">
              {formatEur(item.prix_ht_unitaire)}
            </span>
            <span className="text-xs text-ink-soft">HT / cond.</span>
          </div>
          <PaliersBadges item={item} />
          <div className="flex gap-2 mt-3">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              value={qty}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isNaN(v)) return;
                setQty(Math.max(1, Math.min(999, Math.floor(v))));
              }}
              className="w-16 text-center"
              aria-label="Quantité"
            />
            <Button
              type="button"
              onClick={onAdd}
              className="flex-1 bg-sapin hover:bg-sapin-deep text-white"
            >
              + Ajouter
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const SkeletonCard = () => (
  <Card>
    <Skeleton className="aspect-square w-full" />
    <CardContent className="p-4 space-y-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-8 w-full" />
    </CardContent>
  </Card>
);

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

function CataloguePageInner() {
  const { catalog, isLoading, isError } = useCatalogPro();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of catalog) {
      if (item.products?.category) set.add(item.products.category);
    }
    return Array.from(set).sort();
  }, [catalog]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((item) => {
      if (!item.products) return false;
      if (category && item.products.category !== category) return false;
      if (q && !item.products.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [catalog, query, category]);

  return (
    <ProShell title="Catalogue">
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Rechercher un produit…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
            aria-label="Rechercher"
          />
        </div>
        {categories.length > 0 && (
          <div className="flex gap-1 overflow-x-auto -mx-1 px-1">
            <Button
              type="button"
              size="sm"
              variant={category === null ? "default" : "outline"}
              onClick={() => setCategory(null)}
              className={
                category === null
                  ? "bg-sapin hover:bg-sapin-deep text-white"
                  : ""
              }
            >
              Toutes
            </Button>
            {categories.map((c) => (
              <Button
                key={c}
                type="button"
                size="sm"
                variant={category === c ? "default" : "outline"}
                onClick={() => setCategory(c)}
                className={
                  category === c
                    ? "bg-sapin hover:bg-sapin-deep text-white"
                    : ""
                }
              >
                {c}
              </Button>
            ))}
          </div>
        )}
      </div>

      {isError && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 mb-6">
          Erreur lors du chargement du catalogue.
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-ink-soft">
          <p>Aucun produit ne correspond à votre recherche.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((item) => (
            <ProductCardPro key={item.id} item={item} />
          ))}
        </div>
      )}
    </ProShell>
  );
}

export default function CataloguePro() {
  return (
    <ProCompteActifGuard>
      <CataloguePageInner />
    </ProCompteActifGuard>
  );
}
