"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Activity } from "lucide-react";
import { useV2 } from "@/lib/v2-store";
import { listProduitsInDepot } from "@/lib/db";
import type { ProduitInDepot } from "@/lib/types/db";
import { ProductThumbnail } from "./ProductThumbnail";
import { EditorialEyebrow } from "./EditorialEyebrow";

/**
 * WeeklyPicksRail — rail horizontal "Cette semaine".
 *
 * Affiche les 8 produits du dépôt courant (proxy démo pour "les plus actifs").
 * Chaque carte : thumbnail + nom + 1 metric (qty restante).
 * Hover/tap : ouvre la fiche produit (filtré dans /v2/stock).
 *
 * Cohérent avec le rail Drive WeeklyPicks pour la cohérence design system.
 */
export function WeeklyPicksRail() {
  const depot = useV2((s) => s.currentDepot);
  const [items, setItems] = useState<ProduitInDepot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!depot) {
      setItems([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    // BUG-019 : on priorise les catégories halal (Boucherie, Charcuterie
    // halal, Traiteur, Frais) sur le rail "cette semaine". Sans ce tri
    // pondéré, les sodas et eau (gros stocks) dominaient et le rail
    // affichait Cola/Fanta plutôt que merguez/escalope/brochettes — ce
    // qui sapait l'identité halal-native du produit pour Otmane.
    const HALAL_PRIORITY: Record<string, number> = {
      Boucherie: 0,
      Traiteur: 1,
      Charcuterie: 2,
      Frais: 3,
      Surgelés: 4,
      "Produits du Maghreb": 5,
      Épicerie: 6,
    };
    void listProduitsInDepot(depot.id)
      .then((all) => {
        if (cancelled) return;
        const picked = all
          .filter((p) => p.quantite > 0)
          .sort((a, b) => {
            const ap = HALAL_PRIORITY[a.categorie ?? ""] ?? 99;
            const bp = HALAL_PRIORITY[b.categorie ?? ""] ?? 99;
            if (ap !== bp) return ap - bp;
            // Tie-break sur la qté décroissante (rotation forte au sein de la cat)
            return b.quantite - a.quantite;
          })
          .slice(0, 8);
        setItems(picked);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [depot]);

  if (!depot) return null;
  if (!loading && items.length === 0) return null;

  return (
    <section className="mt-8" aria-label="Produits actifs cette semaine">
      <div className="px-5 flex items-end justify-between gap-3 mb-3">
        <div>
          <EditorialEyebrow num="03" label="Cette semaine" />
          <p className="text-[12.5px] text-text-secondary mt-1.5 max-w-[34ch]">
            Produits les plus actifs du dépôt&nbsp;
            <span className="font-bold text-text-primary">{depot.nom}</span>.
          </p>
        </div>
        <Link
          href="/v2/stock"
          className="text-[11.5px] font-bold text-primary inline-flex items-center gap-1 shrink-0 active:opacity-70 transition-opacity"
        >
          Tout voir
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="scroll-x-fade">
        <div className="scroll-x-snap flex gap-3 overflow-x-auto scrollbar-none px-5 pb-2 pt-1 snap-x">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={`sk-${i}`}
                  className="shrink-0 w-[148px] h-[188px] rounded-[18px] skeleton"
                />
              ))
            : items.map((p, i) => (
                <motion.div
                  key={p.stock_id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.22,
                    ease: [0.22, 0.61, 0.36, 1],
                    delay: i * 0.035,
                  }}
                  className="shrink-0 snap-start"
                >
                  <Link
                    href={`/v2/stock?q=${encodeURIComponent(p.nom)}`}
                    className="group block w-[148px] rounded-[18px] border border-rule bg-white p-3 card-tappable focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <div className="relative">
                      <ProductThumbnail
                        nom={p.nom}
                        categorie={p.categorie}
                        size={124}
                        rounded="xl"
                        className="w-full aspect-square text-[28px]"
                      />
                      {p.quantite <= 5 && (
                        <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 bg-white/95 backdrop-blur rounded-full px-1.5 py-0.5 text-[9.5px] font-bold text-danger uppercase tracking-wider border border-rule">
                          <Activity className="w-2.5 h-2.5" strokeWidth={2.4} />
                          Bas
                        </span>
                      )}
                    </div>
                    <p className="mt-2.5 text-[12.5px] font-bold text-text-primary leading-tight line-clamp-2 min-h-[2.2em]">
                      {p.nom}
                    </p>
                    <p className="mt-1 text-[10.5px] text-text-tertiary uppercase tracking-wider font-bold">
                      <span className="tabular text-text-secondary">
                        {p.quantite}
                      </span>{" "}
                      <span className="text-text-tertiary">unités</span>
                    </p>
                  </Link>
                </motion.div>
              ))}
        </div>
      </div>
    </section>
  );
}

export default WeeklyPicksRail;
