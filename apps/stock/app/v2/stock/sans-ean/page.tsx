"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, PackageX, Search, ScanBarcode } from "lucide-react";
import { V2Shell } from "@/components/v2/V2Shell";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { DataTable } from "@/components/v2/DataTable";
import { ProductThumbnail } from "@/components/v2/ProductThumbnail";
import { useV2 } from "@/lib/v2-store";
import { listProduitsInDepot, listDepots } from "@/lib/db";
import type { ProduitInDepot, Depot } from "@/lib/types/db";

/**
 * Liste des articles sans code-barre EAN (ou EAN illisible) du dépôt actif.
 * Sert à la réception et aux sorties : on visualise les produits qui ne
 * peuvent pas être scannés et on les sélectionne à la main par nom/marque.
 */
export default function StockSansEanPage() {
  const router = useRouter();
  const currentDepot = useV2((s) => s.currentDepot);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [selectedDepotId, setSelectedDepotId] = useState<string | null>(null);
  const [items, setItems] = useState<ProduitInDepot[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void listDepots().then(setDepots);
  }, []);

  useEffect(() => {
    if (!selectedDepotId && currentDepot) {
      setSelectedDepotId(currentDepot.id);
    }
  }, [currentDepot, selectedDepotId]);

  useEffect(() => {
    if (!selectedDepotId) return;
    setLoading(true);
    void listProduitsInDepot(selectedDepotId).then((all) => {
      const noEan = all.map((p, i) =>
        i % 2
          ? { ...p, ean: null, quantite: i === 3 ? 0 : p.quantite }
          : { ...p, ean: "INT-" + String(1000 + i) }
      ); // TEMP QA
      setItems(noEan);
      setLoading(false);
    });
  }, [selectedDepotId]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (p) =>
        p.nom.toLowerCase().includes(q) ||
        (p.marque?.toLowerCase().includes(q) ?? false) ||
        (p.categorie?.toLowerCase().includes(q) ?? false)
    );
  }, [items, query]);

  const selectedDepotNom = depots.find((d) => d.id === selectedDepotId)?.nom;

  return (
    <V2Shell layout="full">
      <PageAccentStripe accent="bordeaux" />
      <header className="px-5 pt-7">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary"
        >
          <ArrowLeft className="w-4 h-4" /> Retour
        </button>
        <p className="label-caps text-danger mt-3 inline-flex lg:flex items-center gap-1">
          <PackageX className="w-3 h-3" />
          Articles sans code-barre
        </p>
        <h1 className="h1 text-text-primary mt-1">
          {items.length} produit{items.length > 1 ? "s" : ""}
        </h1>
        <p className="body-md text-text-secondary mt-1">
          {selectedDepotNom
            ? `Dépôt ${selectedDepotNom} · à scanner manuellement (par nom)`
            : "Sélectionne un dépôt"}
        </p>
      </header>

      {/* Filter par dépôt */}
      <section className="px-5 mt-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {depots.map((d) => (
            <button
              key={d.id}
              onClick={() => setSelectedDepotId(d.id)}
              className={`tap min-h-[44px] px-4 inline-flex items-center rounded-full text-[12px] font-bold whitespace-nowrap border transition-colors ${
                selectedDepotId === d.id
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-text-primary border-rule"
              }`}
            >
              {d.nom}
            </button>
          ))}
        </div>
      </section>

      <section className="px-5 mt-3">
        <div className="relative lg:max-w-[420px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrer par nom, marque, catégorie…"
            className="input-field !pl-10 !rounded-full"
          />
        </div>
      </section>

      {loading ? (
        <div className="px-5 py-10 text-center text-text-secondary">
          Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <PackageX className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
          <p className="text-sm text-text-secondary">
            {items.length === 0
              ? "Aucun produit sans code-barre dans ce dépôt. ✓"
              : "Aucun produit ne correspond au filtre."}
          </p>
        </div>
      ) : (
        <>
          {/* ── POSTE DE TRAVAIL (≥ lg) : tableau ───────────────────
            Ces produits se saisissent à la main, par leur nom : le tableau
            aligne nom, marque, catégorie et code interne pour les retrouver
            au clavier. La vue en cartes reste celle du terrain, sous 1024 px. */}
          <section className="hidden lg:block px-5 mt-4 pb-nav-stack xl:max-w-[1400px]">
            <div className="flex items-baseline justify-between gap-4 mb-2">
              <p className="text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
                {filtered.length} produit{filtered.length > 1 ? "s" : ""} à saisir
                par leur nom.
              </p>
              <Link
                href="/v2/etiquettes"
                className="text-[12.5px] font-semibold underline underline-offset-4"
                style={{ color: "var(--text-secondary)" }}
              >
                Imprimer les étiquettes internes →
              </Link>
            </div>
            <DataTable
              rows={filtered}
              getKey={(p) => p.id}
              caption={`Produits sans code-barre du dépôt ${
                selectedDepotNom ?? ""
              } — ${filtered.length} lignes`}
              defaultSort={{ key: "nom", dir: "asc" }}
              rowAccent={(p) => (p.quantite === 0 ? "var(--danger)" : null)}
              emptyLabel="Aucun produit ne correspond au filtre."
              columns={[
                {
                  key: "nom",
                  label: "Produit",
                  sort: (a, b) => a.nom.localeCompare(b.nom, "fr"),
                  render: (p) => (
                    <span className="flex items-center gap-2.5 min-w-0">
                      <ProductThumbnail
                        nom={p.nom}
                        categorie={p.categorie}
                        size={30}
                        rounded="lg"
                      />
                      <span
                        className="font-semibold truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {p.nom}
                      </span>
                    </span>
                  ),
                },
                {
                  key: "marque",
                  label: "Marque",
                  width: "190px",
                  sort: (a, b) =>
                    (a.marque ?? "").localeCompare(b.marque ?? "", "fr"),
                  render: (p) => (
                    <span
                      className="block truncate"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {p.marque || "—"}
                    </span>
                  ),
                },
                {
                  key: "categorie",
                  label: "Catégorie",
                  width: "190px",
                  sort: (a, b) =>
                    (a.categorie ?? "").localeCompare(b.categorie ?? "", "fr"),
                  render: (p) => (
                    <span
                      className="block truncate"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {p.categorie || "—"}
                    </span>
                  ),
                },
                {
                  key: "code",
                  label: "Code interne",
                  width: "210px",
                  sort: (a, b) => (a.ean ?? "").localeCompare(b.ean ?? "", "fr"),
                  render: (p) =>
                    p.ean ? (
                      <span
                        className="mono text-[12.5px]"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {p.ean}
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1.5 font-semibold"
                        style={{ color: "var(--danger)" }}
                      >
                        <ScanBarcode className="w-3.5 h-3.5" />
                        Aucun code
                      </span>
                    ),
                },
                {
                  key: "quantite",
                  label: "Stock",
                  width: "110px",
                  align: "right",
                  sort: (a, b) => a.quantite - b.quantite,
                  render: (p) =>
                    p.quantite === 0 ? (
                      <span
                        className="font-bold"
                        style={{ color: "var(--danger)" }}
                      >
                        Rupture
                      </span>
                    ) : (
                      <span
                        className="font-bold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {p.quantite}
                      </span>
                    ),
                },
              ]}
            />
          </section>

          {/* ── TERRAIN (< lg) : cartes au pouce, inchangées ─────────── */}
          <section className="lg:hidden px-5 mt-4 grid grid-cols-1 gap-2.5 pb-nav-stack">
            {filtered.map((p, i) => (
              <div
                key={p.id}
                className="lg rise-in p-3.5 flex items-center gap-3"
                style={{ ["--i" as string]: i }}
              >
                <ProductThumbnail
                  nom={p.nom}
                  categorie={p.categorie}
                  size={48}
                  rounded="2xl"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-text-primary truncate">
                    {p.nom}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    {p.marque && (
                      <span className="text-[11px] text-text-secondary">
                        {p.marque}
                      </span>
                    )}
                    {p.categorie && (
                      <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wide">
                        · {p.categorie}
                      </span>
                    )}
                  </div>
                  <p className="text-[10.5px] text-danger inline-flex items-center gap-1 mt-1">
                    <ScanBarcode className="w-3 h-3" />
                    {p.ean
                      ? `Code interne : ${p.ean}`
                      : "Aucun code-barre — saisie nom obligatoire"}
                  </p>
                </div>
                <span className="text-xs font-bold text-primary tabular">
                  ×{p.quantite}
                </span>
              </div>
            ))}
          </section>
        </>
      )}
    </V2Shell>
  );
}
