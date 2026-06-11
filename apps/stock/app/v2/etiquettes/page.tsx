"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Tag, Printer, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { ProductThumbnail } from "@/components/v2/ProductThumbnail";
import { GlossaryTerm } from "@/components/v2/GlossaryTerm";
import { useV2 } from "@/lib/v2-store";
import { listProduitsInDepot } from "@/lib/db";
import type { ProduitInDepot } from "@/lib/types/db";
import { pickBarcode } from "@/lib/labels/barcode";

/**
 * /v2/etiquettes — Imprimer les étiquettes.
 *
 * REFONTE Wave 5 (PDF-03 + PDF-04) — deux formats au niveau PRODUIT (cette
 * page n'a pas de contexte lot) :
 *   - Brother QL-820 (62×29 mm) : nom + prix + EAN-13 (fallback Code128).
 *   - Gondole (100×70 mm) : prix géant + prix/kg + picto halal.
 * Les éléments par lot (DLC, QR traçabilité) vivent sur le certificat halal
 * et la fiche lot. + barre de progression pour les gros lots (200+ copies).
 */

type LabelFormat = "brother" | "gondole";

/** Plafond de copies par produit : la génération est 100 % client (canvas +
 *  jsPDF) ; au-delà l'onglet peut se figer sur une faute de frappe (9999…). */
const MAX_COPIES = 200;

export default function V2EtiquettesPage() {
  const depot = useV2((s) => s.currentDepot);
  const [items, setItems] = useState<ProduitInDepot[]>([]);
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [generating, setGenerating] = useState(false);
  const [format, setFormat] = useState<LabelFormat>("brother");
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (!depot) return;
    void listProduitsInDepot(depot.id)
      .then((all) => {
        const filtered = all.filter(
          (p) => p.requires_barcode_print || p.ean?.startsWith("290"),
        );
        setItems(filtered);
      })
      .catch((err) => {
        // Sans ce catch, une erreur réseau laissait une liste vide avec le
        // message trompeur « Aucun produit » (sans signal d'erreur).
        console.error("[etiquettes] chargement produits échoué:", err);
        toast.error(
          "Impossible de charger les produits · vérifie la connexion",
        );
      });
  }, [depot]);

  const totalCopies = useMemo(
    () => Object.values(copies).reduce((s, n) => s + n, 0),
    [copies],
  );

  /** Prix TTC à imprimer : prix_vente du dépôt. */
  function prixTtcOf(p: ProduitInDepot): number | null {
    return p.prix_vente ?? null;
  }

  async function generate() {
    const selected = items.filter((p) => (copies[p.id] ?? 0) > 0);
    if (selected.length === 0) {
      toast.error("Indique au moins une quantité d'étiquettes");
      return;
    }
    if (format === "brother") {
      // Pré-contrôle code-barres : on prévient l'utilisateur si des EAN
      // internes ont dû être réparés (check-digit recalculé) ou si des
      // produits n'ont ni EAN valide ni SKU imprimable (Code128).
      let repaired = 0;
      let sansCode = 0;
      for (const p of selected) {
        const spec = pickBarcode(p.ean ?? "", p.id);
        if (!spec) sansCode++;
        else if (spec.repaired) repaired++;
      }
      if (repaired > 0) {
        toast.warning(
          `${repaired} code-barres interne${repaired > 1 ? "s" : ""} corrigé${
            repaired > 1 ? "s" : ""
          } (chiffre de contrôle recalculé).`,
        );
      }
      if (sansCode > 0) {
        toast(
          `${sansCode} produit${sansCode > 1 ? "s" : ""} sans code-barres imprimable.`,
        );
      }
    }
    setGenerating(true);
    setProgress({ done: 0, total: totalCopies });
    try {
      if (format === "brother") {
        await generateBrother(selected);
      } else {
        await generateGondole(selected);
      }
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de la génération");
    } finally {
      setGenerating(false);
      setProgress(null);
    }
  }

  async function generateBrother(selected: ProduitInDepot[]) {
    const { buildLabelsPdf } = await import("@/lib/labels/generate-pdf");
    const expanded = selected.flatMap((p) =>
      Array.from({ length: copies[p.id] }).map(() => ({
        produitNom: p.nom,
        marque: p.marque,
        ean: p.ean ?? "",
        sku: p.id, // fallback Code128 si EAN absent/invalide
        prixTtc: prixTtcOf(p),
        prixKg: p.price_per_kg ?? null,
      })),
    );
    const blob = await buildLabelsPdf(expanded, 1, {
      onProgress: (done, total) => setProgress({ done, total }),
    });
    downloadBlob(blob, `etiquettes-brother-${today()}.pdf`);
    toast.success(
      `${expanded.length} étiquette${expanded.length > 1 ? "s" : ""} Brother générée${
        expanded.length > 1 ? "s" : ""
      }`,
    );
  }

  async function generateGondole(selected: ProduitInDepot[]) {
    // L'étiquette gondole est une étiquette PRIX : un produit sans prix de
    // vente n'a rien à afficher → on l'écarte (avec avertissement) plutôt que
    // d'imprimer un « 0,00 € » géant.
    const priced = selected.filter((p) => (prixTtcOf(p) ?? 0) > 0);
    const ignored = selected.length - priced.length;
    if (priced.length === 0) {
      toast.error(
        "Aucun produit sélectionné n'a de prix de vente. Renseigne-le avant l'étiquette gondole.",
      );
      return;
    }
    if (ignored > 0) {
      toast(
        `${ignored} produit${ignored > 1 ? "s" : ""} sans prix ignoré${
          ignored > 1 ? "s" : ""
        }.`,
      );
    }
    const { buildGondoleBatchPdf } = await import("@/lib/labels/gondole");
    // 1 étiquette gondole par copie, concaténées en un PDF multipage.
    const expanded = priced.flatMap((p) =>
      Array.from({ length: copies[p.id] }).map(() => ({
        produitNom: p.nom,
        marque: p.marque,
        prixTtc: prixTtcOf(p) ?? 0,
        prixKg: p.price_per_kg ?? null,
      })),
    );
    const blob = await buildGondoleBatchPdf(expanded, (done, total) =>
      setProgress({ done, total }),
    );
    downloadBlob(blob, `etiquettes-gondole-${today()}.pdf`);
    toast.success(
      `${expanded.length} étiquette${expanded.length > 1 ? "s" : ""} gondole générée${
        expanded.length > 1 ? "s" : ""
      }`,
    );
  }

  return (
    <V2Shell>
      <PageAccentStripe accent="sapin" />
      <header className="px-5 pt-7">
        <BackButton />
        <p className="label-caps text-primary mt-3">Étiquettes</p>
        <h1 className="h1 text-text-primary mt-1">Imprimer les étiquettes</h1>
        <p className="body-md text-text-secondary mt-1">
          Brother QL-820 (62×29 mm) ou gondole rayon (100×70 mm) · prix produit,
          code-barres et picto halal.
        </p>
      </header>

      {/* Sélecteur de format */}
      <section className="px-5 mt-5">
        <div className="grid grid-cols-2 gap-2 p-1 bg-cream border border-rule rounded-2xl">
          <FormatTab
            active={format === "brother"}
            onClick={() => setFormat("brother")}
            icon={<Printer className="w-4 h-4" />}
            label="Brother"
            sub="62×29 mm"
          />
          <FormatTab
            active={format === "gondole"}
            onClick={() => setFormat("gondole")}
            icon={<LayoutGrid className="w-4 h-4" />}
            label="Gondole"
            sub="100×70 mm"
          />
        </div>
      </section>

      <section className="px-5 mt-5">
        {items.length === 0 ? (
          <div className="bg-cream border border-rule rounded-2xl p-6 text-center text-sm text-text-secondary">
            Aucun produit nécessitant une étiquette dans ce dépôt.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((p) => {
              const n = copies[p.id] ?? 0;
              const prix = prixTtcOf(p);
              return (
                <div
                  key={p.id}
                  className="bg-white border border-rule rounded-xl p-3 flex items-center gap-3"
                >
                  <ProductThumbnail
                    nom={p.nom}
                    categorie={p.categorie}
                    size={40}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-bold text-text-primary truncate"
                      title={p.nom}
                    >
                      {p.nom}
                    </p>
                    <p className="text-[11px] text-text-tertiary font-mono">
                      {p.ean ?? (
                        <>
                          <GlossaryTerm
                            term="EAN"
                            def="Code-barres article, 13 chiffres."
                          />{" "}
                          absent
                        </>
                      )}
                      {prix != null && (
                        <span className="text-text-secondary not-italic">
                          {"  ·  "}
                          {new Intl.NumberFormat("fr-FR", {
                            style: "currency",
                            currency: "EUR",
                          }).format(prix)}
                        </span>
                      )}
                    </p>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={MAX_COPIES}
                    value={n || ""}
                    onChange={(e) =>
                      setCopies((c) => ({
                        ...c,
                        [p.id]: Math.min(
                          MAX_COPIES,
                          Math.max(0, parseInt(e.target.value || "0", 10)),
                        ),
                      }))
                    }
                    placeholder="0"
                    inputMode="numeric"
                    aria-label={`Nombre d'étiquettes pour ${p.nom} (max ${MAX_COPIES})`}
                    title={`Nombre d'étiquettes à imprimer (max ${MAX_COPIES})`}
                    className="w-16 text-center bg-cream border border-rule rounded-xl min-h-[44px] text-base font-bold tabular-nums"
                  />
                </div>
              );
            })}
          </div>
        )}
      </section>

      {totalCopies > 0 && (
        <section className="px-5 mt-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
          {progress && progress.total > 0 && (
            <div className="mb-3">
              <div className="h-2 rounded-full bg-cream border border-rule overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${Math.round((progress.done / progress.total) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-text-tertiary text-center mt-1 tabular-nums">
                {progress.done} / {progress.total}
              </p>
            </div>
          )}
          <button
            onClick={generate}
            disabled={generating}
            title={`Générer ${totalCopies} étiquette${totalCopies > 1 ? "s" : ""} ${format === "brother" ? "Brother" : "gondole"} au format PDF`}
            className="w-full bg-primary text-white rounded-2xl py-4 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {generating ? (
              <span className="w-5 h-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            ) : (
              <Download className="w-5 h-5" />
            )}
            <span className="font-bold">
              Générer {totalCopies} étiquette{totalCopies > 1 ? "s" : ""}{" "}
              {format === "brother" ? "Brother" : "gondole"}
            </span>
          </button>
          <p className="text-xs text-text-tertiary text-center mt-2 inline-flex items-center gap-1 justify-center w-full">
            <Tag className="w-3 h-3" />
            {format === "brother" ? (
              <>
                PDF Brother QL-820 ·{" "}
                <GlossaryTerm
                  term="EAN-13"
                  def="Code-barres standard à 13 chiffres."
                />{" "}
                avec fallback Code128.
              </>
            ) : (
              "PDF gondole A6 · prix géant + prix/kg + picto halal."
            )}
          </p>
        </section>
      )}
    </V2Shell>
  );
}

function FormatTab({
  active,
  onClick,
  icon,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Format ${label} (${sub})`}
      aria-pressed={active}
      className={`flex items-center justify-center gap-2 min-h-[44px] rounded-xl text-[13px] font-bold transition-colors ${
        active
          ? "bg-primary text-white shadow-card"
          : "text-text-secondary active:opacity-70"
      }`}
    >
      {icon}
      <span className="flex flex-col items-start leading-tight">
        <span>{label}</span>
        <span
          className={`text-[10px] font-semibold ${
            active ? "text-white/70" : "text-text-tertiary"
          }`}
        >
          {sub}
        </span>
      </span>
    </button>
  );
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
