import { useMemo } from "react";
import { useProducts } from "@/hooks/useProducts";
import { ProductCard } from "@/components/ProductCard";
import {
  matchProductsByKeywords,
  moisLabel,
  motsClesForMonth,
} from "@/data/saison-produits";
import type { Product } from "@/types/product";

// ─────────────────────────────────────────────────────────────────
// SelectionSaison — « De saison en {mois} ».
//
// Filtre le catalogue (useProducts) sur les mots-clés saisonniers du
// mois courant (data file saison-produits.ts) et affiche un carrousel
// réutilisant ProductCard. Lecture catalogue seule, aucune écriture,
// aucune table custom. Gracieux : rend `null` si aucun produit du mois
// n'est au catalogue (ex. catalogue restreint, hors-saison).
// ─────────────────────────────────────────────────────────────────

const MAX_ITEMS = 8;

export const SelectionSaison = () => {
  const { data: products } = useProducts();

  // Mois figé au mount (affichage éditorial, pas besoin de re-render au
  // changement d'heure). getMonth() est 0-indexé.
  const monthIndex = useMemo(() => new Date().getMonth(), []);

  const saisonniers = useMemo<Product[]>(() => {
    if (!products) return [];
    return matchProductsByKeywords(
      products,
      motsClesForMonth(monthIndex),
      MAX_ITEMS,
    );
  }, [products, monthIndex]);

  // Pas de plancher artificiel : on dégrade dès qu'on n'a rien à montrer
  // de saison, mais on évite un carrousel famélique d'un seul produit.
  if (saisonniers.length < 2) return null;

  return (
    <section
      aria-labelledby="selection-saison-title"
      className="max-w-7xl mx-auto px-6 md:px-8 mt-10 md:mt-14"
    >
      <div className="flex items-end justify-between gap-4 mb-5 md:mb-7">
        <h2
          id="selection-saison-title"
          className="text-[24px] md:text-[34px] leading-[1.02] text-sapin font-extrabold tracking-[-0.035em]"
        >
          De saison{" "}
          <span className="text-gold-text">en {moisLabel(monthIndex)}</span>.
        </h2>
        <span className="shrink-0 pb-1.5 text-[12px] text-ink/55 tabular-nums">
          {saisonniers.length} produit{saisonniers.length > 1 ? "s" : ""}
        </span>
      </div>

      {/* Même grammaire de carrousel que les autres rayons : scroll
          horizontal mobile, grille desktop. ProductCard gère son propre
          line-clamp / object-cover (anti-overflow). */}
      <ul
        className="
          flex md:grid md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-6
          -mx-6 md:mx-0 px-6 md:px-0 scroll-pl-6 md:scroll-pl-0
          overflow-x-auto md:overflow-visible scrollbar-none
          snap-x snap-mandatory md:snap-none
        "
      >
        {saisonniers.map((p) => (
          <li
            key={p.id}
            className="shrink-0 w-[42%] sm:w-[30%] md:w-auto snap-start"
          >
            <ProductCard product={p} />
          </li>
        ))}
      </ul>
    </section>
  );
};

export default SelectionSaison;
