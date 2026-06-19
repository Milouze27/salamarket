"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Layers,
  Lock,
  Package,
  Pencil,
  Search,
  Store,
  Unlock,
} from "lucide-react";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { ProductThumbnail } from "@/components/v2/ProductThumbnail";
import { StockEditModal } from "@/components/v2/StockEditModal";
import { PriceTag } from "@/components/v2/PriceTag";
import { EditorialEyebrow } from "@/components/v2/EditorialEyebrow";
import { EmptyState } from "@/components/v2/EmptyState";
import { useV2 } from "@/lib/v2-store";
import { listProduitsInDepot, listDepots } from "@/lib/db";
import type { Depot } from "@/lib/types/db";
import {
  canEditStock,
  listStockEditWindows,
  type StockEditWindow,
} from "@/lib/db/stock-edit";
import type { ProduitInDepot } from "@/lib/types/db";

export default function V2StockPage() {
  const router = useRouter();
  const depot = useV2((s) => s.currentDepot);
  const employe = useV2((s) => s.currentEmploye);
  const [items, setItems] = useState<ProduitInDepot[]>([]);
  const [allDepots, setAllDepots] = useState<Depot[]>([]);
  const [allStocks, setAllStocks] = useState<Map<string, ProduitInDepot[]>>(
    new Map(),
  );
  const [view, setView] = useState<"depot" | "regroupe">("depot");
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string>("Tout");
  const [windows, setWindows] = useState<StockEditWindow[]>([]);
  const [editing, setEditing] = useState<ProduitInDepot | null>(null);
  // Évite le faux « Aucun produit » pendant le fetch initial : tant que la
  // requête stock n'est pas résolue, on rend un skeleton, jamais l'état vide.
  const [loading, setLoading] = useState(true);

  async function reload() {
    if (!depot) return;
    setLoading(true);
    try {
      const [stock, win, deps] = await Promise.all([
        listProduitsInDepot(depot.id),
        listStockEditWindows(),
        listDepots(),
      ]);
      setItems(stock);
      setWindows(win);
      setAllDepots(deps);
    } catch (e) {
      console.error("[stock] chargement échoué:", e);
      toast.error("Erreur de chargement du stock · vérifie la connexion");
    } finally {
      setLoading(false);
    }
  }

  // Charge les stocks de tous les dépôts UNIQUEMENT quand on bascule sur
  // la vue regroupée (économise les requêtes en vue simple)
  useEffect(() => {
    if (view !== "regroupe" || allDepots.length === 0) return;
    let cancelled = false;
    (async () => {
      const map = new Map<string, ProduitInDepot[]>();
      const failed: string[] = [];
      for (const d of allDepots) {
        // Tolérant par dépôt : un échec n'efface pas les autres.
        const s = await listProduitsInDepot(d.id).catch((e) => {
          console.error(`[stock] dépôt ${d.nom} échoué:`, e);
          failed.push(d.nom);
          return [] as ProduitInDepot[];
        });
        if (cancelled) return;
        map.set(d.id, s);
      }
      if (cancelled) return;
      setAllStocks(map);
      // On AVERTIT si un dépôt n'a pas pu charger : sinon la vue regroupée
      // masque silencieusement son stock (l'utilisateur croit le total complet).
      if (failed.length > 0) {
        toast.error(
          `Stock partiel : ${failed.join(", ")} n'a pas pu charger. Total incomplet.`,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, allDepots]);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depot]);

  const editAllowed = depot
    ? canEditStock(employe?.role, depot.id, windows)
    : false;
  // Coût d'achat & marge = donnée commerciale sensible : réservée aux rôles
  // de pilotage (admin / manager). Masquée pour la prépa, la caisse, la
  // réception qui n'ont pas à voir les marges sur le terrain.
  const canSeeMargin =
    employe?.role === "admin" || employe?.role === "manager";
  const windowOpen = depot
    ? Boolean(windows.find((w) => w.depot_id === depot.id)?.is_open)
    : false;

  // Vue regroupée : map produit_id → { produit, total, breakdown par dépôt }
  type Aggregated = {
    id: string;
    nom: string;
    marque: string | null;
    categorie: string | null;
    ean: string | null;
    image_url: string | null;
    total: number;
    breakdown: Array<{
      depot: Depot;
      quantite: number;
      prix_vente: number | null;
    }>;
  };
  const aggregated: Aggregated[] = useMemo(() => {
    if (view !== "regroupe" || allStocks.size === 0) return [];
    const map = new Map<string, Aggregated>();
    for (const [depotId, stocks] of allStocks) {
      const dep = allDepots.find((d) => d.id === depotId);
      if (!dep) continue;
      for (const p of stocks) {
        const cur = map.get(p.id) ?? {
          id: p.id,
          nom: p.nom,
          marque: p.marque,
          categorie: p.categorie,
          ean: p.ean,
          image_url: p.image_url,
          total: 0,
          breakdown: [],
        };
        cur.total += p.quantite;
        cur.breakdown.push({
          depot: dep,
          quantite: p.quantite,
          prix_vente: p.prix_vente,
        });
        map.set(p.id, cur);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.nom.localeCompare(b.nom));
  }, [view, allStocks, allDepots]);

  const cats = useMemo(() => {
    const s = new Set<string>();
    const source = view === "regroupe" ? aggregated : items;
    source.forEach((p) => p.categorie && s.add(p.categorie));
    return ["Tout", ...Array.from(s).sort()];
  }, [items, aggregated, view]);

  const filtered = useMemo(() => {
    let l = items;
    if (cat !== "Tout") l = l.filter((p) => p.categorie === cat);
    if (query.trim()) {
      const q = query.toLowerCase();
      l = l.filter(
        (p) =>
          p.nom.toLowerCase().includes(q) ||
          (p.marque?.toLowerCase().includes(q) ?? false) ||
          (p.ean?.toLowerCase().includes(q) ?? false),
      );
    }
    return l;
  }, [items, cat, query]);

  const filteredAggregated = useMemo(() => {
    let l = aggregated;
    if (cat !== "Tout") l = l.filter((p) => p.categorie === cat);
    if (query.trim()) {
      const q = query.toLowerCase();
      l = l.filter(
        (p) =>
          p.nom.toLowerCase().includes(q) ||
          (p.marque?.toLowerCase().includes(q) ?? false) ||
          (p.ean?.toLowerCase().includes(q) ?? false),
      );
    }
    return l;
  }, [aggregated, cat, query]);

  return (
    <V2Shell>
      <PageAccentStripe accent="fonce" />
      <header className="px-5 pt-7">
        <BackButton />
        <EditorialEyebrow
          num="01"
          label={
            view === "regroupe"
              ? "Catalogue · 3 dépôts"
              : `Catalogue · ${depot?.nom ?? "dépôt"}`
          }
          className="mt-3"
        />
        <h1 className="h1-display mt-3">
          {view === "regroupe" ? (
            <>
              <span className="gold">{aggregated.length}</span> produit
              {aggregated.length > 1 ? "s" : ""}
            </>
          ) : (
            <>
              Stock <span className="gold">{depot?.nom ?? "dépôt"}</span>
            </>
          )}
          .
        </h1>
        <p className="body-md text-text-secondary mt-3 max-w-[40ch]">
          {view === "regroupe"
            ? `Vue regroupée · ${aggregated.length} produit${aggregated.length > 1 ? "s" : ""} sur les 3 dépôts.`
            : loading
              ? "Chargement du stock du dépôt…"
              : `${items.length} produit${items.length > 1 ? "s" : ""} référencé${items.length > 1 ? "s" : ""} dans ce dépôt.`}
        </p>

        {/* Toggle vue dépôt unique / regroupée */}
        <div
          role="tablist"
          aria-label="Vue stock"
          className="lg inline-flex rounded-full p-1 mt-3"
        >
          <button
            role="tab"
            aria-selected={view === "depot"}
            onClick={() => setView("depot")}
            className={`tap inline-flex items-center gap-1.5 min-h-[44px] px-4 py-1.5 rounded-full text-[12px] font-bold transition-colors ${
              view === "depot" ? "bg-primary text-white" : "text-text-secondary"
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            {depot?.nom ?? "Dépôt"}
          </button>
          <button
            role="tab"
            aria-selected={view === "regroupe"}
            onClick={() => setView("regroupe")}
            className={`tap inline-flex items-center gap-1.5 min-h-[44px] px-4 py-1.5 rounded-full text-[12px] font-bold transition-colors ${
              view === "regroupe"
                ? "bg-primary text-white"
                : "text-text-secondary"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Tous dépôts
          </button>
        </div>
        {/* Accès produits sans code-barre (ancienne page repliée en lien) */}
        <button
          type="button"
          onClick={() => router.push("/v2/stock/sans-ean")}
          className="tap inline-flex items-center min-h-[44px] mt-1 text-[12px] font-bold text-text-secondary underline underline-offset-4 decoration-rule hover:text-primary"
        >
          Produits sans code-barre →
        </button>
        {/* Bandeau accès édition stock */}
        <div
          className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ${
            editAllowed
              ? "bg-success-soft text-success"
              : "bg-cream text-text-secondary border border-rule"
          }`}
        >
          {editAllowed ? (
            <>
              <Unlock className="w-3 h-3" />
              {employe?.role === "admin"
                ? "Édition stock active (admin)"
                : windowOpen
                  ? "Inventaire en cours · édition autorisée"
                  : "Édition autorisée"}
            </>
          ) : (
            <>
              <Lock className="w-3 h-3" />
              Lecture seule · admin ou inventaire requis
            </>
          )}
        </div>
      </header>

      <section className="px-5 mt-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            id="stock-search"
            type="search"
            aria-label="Rechercher un produit par nom, marque ou EAN"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un produit, une marque, un EAN…"
            className="input-field !pl-10 !rounded-full !text-base"
          />
        </div>
      </section>

      {/* P0-5 — pills scroll-x avec gradient fade or-cream gauche/droite */}
      <div className="mt-3 scroll-x-fade">
        <div className="px-5 overflow-x-auto scrollbar-none scroll-x-snap">
          <div className="flex items-center gap-2 pb-2 pr-4">
            {cats.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCat(c)}
                data-active={cat === c}
                aria-pressed={cat === c}
                aria-label={
                  c === "Tout"
                    ? "Afficher toutes les catégories"
                    : `Filtrer par catégorie ${c}`
                }
                className="pill-filter shrink-0"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === "depot" && loading ? (
        // Skeleton de chargement : grille de cartes neutres tant que le stock
        // n'est pas résolu — évite le flash trompeur « Aucun produit ».
        <section
          className="px-5 mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4"
          aria-busy="true"
          aria-label="Chargement du stock"
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="lg rounded-[22px] overflow-hidden animate-pulse"
            >
              <div className="aspect-square bg-cream/40" />
              <div className="p-3 space-y-2">
                <div className="h-3 rounded bg-cream/40 w-4/5" />
                <div className="h-2.5 rounded bg-cream/40 w-2/5" />
                <div className="h-3.5 rounded bg-cream/40 w-1/3 mt-1" />
              </div>
            </div>
          ))}
        </section>
      ) : view === "depot" ? (
        <>
          <section className="px-5 mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((p, i) => (
              <div
                key={p.id}
                style={{ "--i": i } as React.CSSProperties}
                className="lg lg-hover rise-in rounded-[22px] overflow-hidden"
              >
                <div className="aspect-square relative">
                  <ProductThumbnail
                    nom={p.nom}
                    categorie={p.categorie}
                    rounded="lg"
                    className="absolute inset-0 w-full h-full text-3xl"
                  />
                  {p.quantite === 0 ? (
                    <span
                      className="absolute top-2 right-2 rounded-full px-2 py-0.5 text-[11px] font-bold shadow-sm"
                      style={{
                        background: "var(--danger)",
                        color: "var(--text-on-dark)",
                      }}
                    >
                      Rupture
                    </span>
                  ) : (
                    <span className="absolute top-2 right-2 bg-white/95 rounded-full px-2 py-0.5 text-[11px] font-bold text-primary tabular shadow-sm">
                      {p.quantite}
                    </span>
                  )}
                  {editAllowed && (
                    <button
                      onClick={() => setEditing(p)}
                      className="tap absolute bottom-2 right-2 w-11 h-11 rounded-full bg-primary text-white flex items-center justify-center shadow-card-lg"
                      aria-label="Modifier le stock"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-[13px] font-bold text-text-primary line-clamp-2 min-h-[34px]">
                    {p.nom}
                  </p>
                  <p className="text-[11px] text-text-tertiary mt-0.5 truncate">
                    {p.marque}
                  </p>
                  <PriceTag
                    amount={p.prix_vente}
                    className="text-base font-extrabold text-primary mt-1 block"
                  />
                  {canSeeMargin &&
                    p.cout_achat_ht != null &&
                    p.prix_vente != null &&
                    p.prix_vente > 0 &&
                    (() => {
                      const margePct = Math.round(
                        ((p.prix_vente - p.cout_achat_ht) / p.prix_vente) * 100,
                      );
                      // Marge négative = PV sous le coût : volontaire en promo
                      // anti-gaspi (DLC courte). On ne la peint pas en vert
                      // (succès trompeur) et on signale le contexte par un
                      // badge léger, sans masquer le chiffre.
                      const negative = margePct < 0;
                      return (
                        <p
                          className="text-[11px] font-bold mt-0.5"
                          style={{
                            color: negative
                              ? "var(--text-tertiary)"
                              : "var(--success)",
                          }}
                        >
                          Marge {margePct}%{" "}
                          {negative && (
                            <span
                              className="font-bold uppercase tracking-wide text-[9.5px]"
                              style={{ color: "var(--accent-gold)" }}
                            >
                              promo/DLC
                            </span>
                          )}
                          <span className="font-medium text-text-tertiary">
                            {" "}
                            · coût {p.cout_achat_ht.toFixed(2)} €
                          </span>
                        </p>
                      );
                    })()}
                </div>
              </div>
            ))}
          </section>
          {filtered.length === 0 &&
            (items.length === 0 && cat === "Tout" && !query.trim() ? (
              <EmptyState
                icon={Package}
                title="Aucun produit dans ce dépôt"
                description="Commence par une réception de marchandise ou change de dépôt."
                cta={{ label: "Nouvelle réception", href: "/v2/reception" }}
              />
            ) : (
              <EmptyState
                icon={Search}
                title="Aucun résultat"
                description="Aucun produit ne correspond à ta recherche ou à ce filtre."
                cta={{
                  label: "Réinitialiser",
                  onClick: () => {
                    setQuery("");
                    setCat("Tout");
                  },
                }}
                compact
              />
            ))}
        </>
      ) : (
        // ─── VUE REGROUPÉE 3 DÉPÔTS ─────────────────────────────
        <>
          <section className="px-5 mt-4 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {filteredAggregated.map((p, i) => (
              <div
                key={p.id}
                style={{ "--i": i } as React.CSSProperties}
                className="lg lg-hover rise-in rounded-[22px] p-3 flex items-center gap-3"
              >
                <ProductThumbnail
                  nom={p.nom}
                  categorie={p.categorie}
                  size={48}
                  rounded="xl"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-bold text-text-primary truncate">
                    {p.nom}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {p.breakdown.map((b) => (
                      <span
                        key={b.depot.id}
                        className="inline-flex items-center gap-1 bg-cream rounded-full px-2 py-0.5 text-[10.5px] font-bold text-text-primary"
                      >
                        {b.depot.type === "entrepot" ? (
                          <Building2 className="w-2.5 h-2.5 text-text-tertiary" />
                        ) : (
                          <Store className="w-2.5 h-2.5 text-text-tertiary" />
                        )}
                        {b.depot.nom.slice(0, 4)} ·{" "}
                        <span className="tabular">{b.quantite}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10.5px] font-bold uppercase tracking-wide text-text-tertiary">
                    Total
                  </p>
                  <p className="text-[18px] font-extrabold text-primary tabular leading-none">
                    {p.total}
                  </p>
                </div>
              </div>
            ))}
          </section>
          {filteredAggregated.length === 0 &&
            (allStocks.size === 0 ? (
              <div className="px-5 py-10 text-center text-text-secondary">
                Chargement des 3 dépôts…
              </div>
            ) : (
              <EmptyState
                icon={Search}
                title="Aucun résultat"
                description="Aucun produit ne correspond à ta recherche ou à ce filtre."
                cta={{
                  label: "Réinitialiser",
                  onClick: () => {
                    setQuery("");
                    setCat("Tout");
                  },
                }}
                compact
              />
            ))}
        </>
      )}

      <StockEditModal
        open={!!editing}
        onClose={() => setEditing(null)}
        onSaved={() => void reload()}
        produit={
          editing
            ? { id: editing.id, nom: editing.nom, categorie: editing.categorie }
            : null
        }
        depotId={depot?.id ?? ""}
        depotNom={depot?.nom ?? ""}
        quantiteActuelle={editing?.quantite ?? 0}
        employeId={employe?.id ?? ""}
        duringInventaire={windowOpen}
      />
    </V2Shell>
  );
}
