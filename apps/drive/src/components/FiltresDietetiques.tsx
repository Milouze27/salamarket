import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/types/product";
import { normalizeSearch } from "@/lib/search";

// ─────────────────────────────────────────────────────────────────
// FiltresDietetiques — puces de filtrage rapide dérivées des catégories
// et mots-clés des produits EXISTANTS. Purement additif : l'état est
// local au composant et remonte un prédicat client au parent
// (onFilterChange), appliqué au-dessus de la grille. Ça n'altère JAMAIS
// l'URL ?category= ni la logique de filtrage d'Index — c'est un filtre
// en mémoire qui se compose avec le reste. Lecture pure useProducts.
//
// Les puces ne s'affichent que si elles sont pertinentes (au moins un
// produit du catalogue matche) → pas de filtre qui mène à du vide.
// Multi-sélection = intersection (AND) des prédicats actifs.
// ─────────────────────────────────────────────────────────────────

export type ProductPredicate = (p: Product) => boolean;

interface FilterDef {
  id: string;
  label: string;
  // Un produit est-il concerné par ce filtre ? Sert à la fois à décider
  // de l'affichage de la puce ET de l'application du filtre.
  match: ProductPredicate;
}

// Mots-clés "fait maison / artisanal" cherchés dans nom + description
// (normalisés, sans accents). Dérive un signal éditorial sans nouvelle
// table : on lit ce qui est déjà saisi côté produit.
const MAISON_KEYWORDS = ["maison", "artisanal", "fait main", "traditionnel"];

const FILTERS: FilterDef[] = [
  {
    id: "halal",
    label: "Halal",
    // Aligné sur le badge halal de ProductCard (boucherie / charcuterie).
    match: (p) => p.category === "boucherie" || p.category === "charcuterie",
  },
  {
    id: "sans-surgele",
    label: "Sans surgelé",
    // Filtre soustractif : tout sauf le rayon surgelés.
    match: (p) => p.category !== "surgele",
  },
  {
    id: "fait-maison",
    label: "Fait maison",
    // Signal éditorial dérivé des mots-clés produit (tous rayons), pas
    // d'une catégorie dédiée — Salamarket n'a pas de rayon boulangerie.
    match: (p) => {
      const hay = normalizeSearch(`${p.name} ${p.description ?? ""}`);
      return MAISON_KEYWORDS.some((k) => hay.includes(k));
    },
  },
];

interface Props {
  products: Product[];
  /** Remonte le prédicat combiné des puces actives (null si aucune). */
  onFilterChange: (predicate: ProductPredicate | null) => void;
}

export const FiltresDietetiques = ({ products, onFilterChange }: Props) => {
  const [active, setActive] = useState<Set<string>>(new Set());

  // Ne garde que les puces pertinentes pour le catalogue chargé. Pour
  // "sans-surgele" la puce n'a de sens que s'il existe au moins un produit
  // surgelé à pouvoir masquer (sinon elle ne filtre rien).
  const visible = useMemo(() => {
    if (products.length === 0) return [];
    return FILTERS.filter((f) => {
      if (f.id === "sans-surgele") {
        return products.some((p) => p.category === "surgele");
      }
      return products.some((p) => f.match(p));
    });
  }, [products]);

  // Recalcule le prédicat combiné (AND) et le remonte au parent. Si une
  // puce devenue invisible était active (catalogue changé), on la purge.
  useEffect(() => {
    const visibleIds = new Set(visible.map((f) => f.id));
    const activeDefs = FILTERS.filter(
      (f) => active.has(f.id) && visibleIds.has(f.id),
    );
    if (activeDefs.length === 0) {
      onFilterChange(null);
      return;
    }
    onFilterChange((p: Product) => activeDefs.every((f) => f.match(p)));
  }, [active, visible, onFilterChange]);

  if (visible.length === 0) return null;

  const toggle = (id: string) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      role="group"
      aria-label="Filtres rapides"
      className="mb-6 flex items-center gap-2 -mx-6 md:mx-0 px-6 md:px-0 overflow-x-auto scrollbar-none"
    >
      <span
        className="shrink-0 text-[11px] uppercase tracking-[0.14em] font-bold text-[#0F1A14]/55"
        aria-hidden
      >
        Filtrer
      </span>
      {visible.map((f) => {
        const isOn = active.has(f.id);
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => toggle(f.id)}
            aria-pressed={isOn}
            className={
              "shrink-0 h-9 px-3.5 rounded-full text-[12.5px] font-semibold transition-all active:scale-[0.97] " +
              (isOn
                ? "bg-[#C9A227] text-[#0E3B2E] shadow-sm"
                : "bg-white text-[#0E3B2E] border border-[#0E3B2E]/15 hover:border-[#0E3B2E]/40")
            }
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
};

export default FiltresDietetiques;
