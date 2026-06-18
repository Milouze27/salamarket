"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, FileSpreadsheet, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { GlassTabs } from "@/components/v2/GlassTabs";
import { useV2 } from "@/lib/v2-store";

type ImportType = "cashmag" | "stock";

interface CashmagResult {
  ok: boolean;
  inserted: number;
  parsed: number;
  /** Lignes ignorées car déjà en base (réimport) ou doublons internes. */
  duplicates_skipped?: number;
  parseErrors?: Array<{ line: number; raw: string; reason: string }>;
  dbErrors?: string[];
  meta?: {
    separator: string;
    headers: string[];
    columnIndex: Record<string, number>;
  };
}

interface StockResult {
  ok: boolean;
  produits_crees: number;
  produits_existants: number;
  stock_initialise: number;
  stock_maj: number;
  parseErrors?: Array<{ line: number; raw: string; reason: string }>;
  dbErrors?: string[];
  meta?: {
    separator: string;
    headers: string[];
    columnIndex: Record<string, number>;
  };
}

type ImportResult = CashmagResult | StockResult;

/** Lit le fichier en auto-détectant l'encodage ISO-8859-1. */
async function readCsvText(file: File): Promise<string> {
  let text = await file.text();
  // Auto-détection ISO-8859-1 si les accents UTF-8 sont absents.
  if (!/[éèàçâêîôûë]/i.test(text) && /\xe9|\xe8|\xe0/.test(text)) {
    const buf = await file.arrayBuffer();
    text = new TextDecoder("iso-8859-1").decode(buf);
  }
  return text;
}

export default function ImportPage() {
  return (
    <Suspense fallback={null}>
      <ImportPageInner />
    </Suspense>
  );
}

function ImportPageInner() {
  const searchParams = useSearchParams();
  const depot = useV2((s) => s.currentDepot);

  const [type, setType] = useState<ImportType>("cashmag");
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [preview, setPreview] = useState<string[]>([]);

  // Onglet initial piloté par ?type= au montage.
  useEffect(() => {
    const t = searchParams.get("type");
    if (t === "stock" || t === "cashmag") setType(t);
  }, [searchParams]);

  const switchTab = useCallback((next: ImportType) => {
    setType(next);
    setResult(null);
    setPreview([]);
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      if (type === "stock" && !depot) {
        toast.error("Sélectionne d'abord un dépôt (en haut de l'app).");
        return;
      }
      if (!file.name.toLowerCase().endsWith(".csv")) {
        toast.error("Seuls les fichiers .csv sont acceptés");
        return;
      }
      setBusy(true);
      setResult(null);
      try {
        const text = await readCsvText(file);
        setPreview(text.split(/\r?\n/).slice(0, 6));

        if (type === "cashmag") {
          // Server action (injecte x-internal-secret côté serveur) : la route
          // import-cashmag refuse désormais les appels externes.
          const { importCashmagAction } = await import("@/lib/actions/cashbox");
          const data = (await importCashmagAction(
            text,
            "v2-admin",
          )) as CashmagResult;
          setResult(data);
          const dups = data.duplicates_skipped ?? 0;
          if (data.ok && data.inserted > 0) {
            toast.success(
              `${data.inserted} ligne(s) importée(s)${dups > 0 ? ` · ${dups} déjà en base ignorée(s)` : ""}`,
            );
          } else if (data.ok && data.inserted === 0 && dups > 0) {
            // Réimport idempotent : tout était déjà là, ce n'est PAS une erreur.
            toast.info(
              `Déjà importé — ${dups} ligne(s) ignorée(s), aucun doublon créé`,
            );
          } else if (data.inserted > 0) {
            toast.warning(
              `${data.inserted} importées, ${data.parseErrors?.length ?? 0} erreurs`,
            );
          } else {
            toast.error("Aucune ligne importée");
          }
        } else {
          // Server action (injecte x-internal-secret côté serveur) : la route
          // import-stock refuse désormais les appels externes.
          const { importStockAction } = await import("@/lib/actions/cashbox");
          const data = (await importStockAction(
            text,
            depot!.id,
          )) as StockResult & { error?: string };
          if (data.error) {
            toast.error(data.error);
            setBusy(false);
            return;
          }
          setResult(data);
          const total = data.stock_initialise + data.stock_maj;
          if (data.ok && total > 0) {
            toast.success(
              `${data.produits_crees} produit(s) créé(s) · ${total} ligne(s) stock sur ${depot!.nom}`,
            );
          } else if (total > 0) {
            toast.warning(
              `${total} ligne(s) stock, ${data.parseErrors?.length ?? 0} erreur(s)`,
            );
          } else {
            toast.error("Aucune ligne importée — vérifie le format du CSV");
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      } finally {
        setBusy(false);
      }
    },
    [type, depot],
  );

  const isCashmag = type === "cashmag";

  return (
    <V2Shell hideNav>
      <header className="px-5 pt-7">
        <BackButton />
        <p className="section-eyebrow mt-3">
          <FileSpreadsheet className="w-3 h-3" />
          {isCashmag ? "Import ventes Cashmag" : "Import catalogue"}
        </p>
        <h1 className="h1 text-text-primary mt-1">
          {isCashmag ? "Importer le CSV Cashmag" : "Importer le stock"}
        </h1>
        {isCashmag ? (
          <p className="body-md text-text-secondary mt-1">
            Glisse-dépose ton export Cashmag pour intégrer les ventes magasin
            dans le rapport mensuel.
          </p>
        ) : (
          <p className="body-md text-text-secondary mt-1">
            Glisse-dépose un CSV de ton catalogue pour créer les fiches produits
            et initialiser le stock du dépôt{" "}
            <span className="font-bold text-text-primary">
              {depot?.nom ?? "(aucun sélectionné)"}
            </span>
            .
          </p>
        )}
      </header>

      {/* Onglets */}
      <section className="px-5 mt-5">
        <GlassTabs<ImportType>
          ariaLabel="Type d'import"
          value={type}
          onChange={switchTab}
          items={[
            { value: "cashmag", label: "Ventes (Cashmag)" },
            { value: "stock", label: "Catalogue (stock)" },
          ]}
        />
      </section>

      <div key={type} className="rise-in">
      {/* Format attendu — onglet stock uniquement */}
      {!isCashmag && (
        <section className="px-5 mt-4">
          <div className="bg-cream border border-rule rounded-[16px] p-4">
            <p className="text-[12px] font-bold text-text-secondary uppercase tracking-wide mb-1.5">
              Colonnes attendues
            </p>
            <p className="text-[12.5px] text-text-secondary leading-relaxed">
              <span className="font-bold text-text-primary">EAN</span>,{" "}
              <span className="font-bold text-text-primary">nom</span>,{" "}
              <span className="font-bold text-text-primary">prix de vente</span>{" "}
              (obligatoires) · marque, catégorie, quantité (optionnelles).
              Séparateur <code>;</code> ou <code>,</code>.
            </p>
          </div>
        </section>
      )}

      <section className="px-5 mt-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) void handleFile(f);
          }}
          className={`relative rounded-[20px] border-2 border-dashed transition-all px-5 py-10 text-center ${
            drag ? "border-primary bg-primary/5" : "border-line-medium bg-white"
          }`}
        >
          <Upload
            className={`w-8 h-8 mx-auto mb-3 ${drag ? "text-primary" : "text-text-tertiary"}`}
          />
          <p className="text-[15px] font-bold text-text-primary">
            {isCashmag
              ? "Dépose ton CSV Cashmag ici"
              : "Dépose ton CSV catalogue ici"}
          </p>
          <p className="text-[12px] text-text-secondary mt-1.5">
            {isCashmag
              ? "Séparateur ; ou , — UTF-8 ou ISO-8859-1 (auto-détecté)"
              : "UTF-8 ou ISO-8859-1 (auto-détecté)"}
          </p>
          <label className="mt-4 inline-flex items-center gap-2 bg-primary text-white rounded-full px-4 py-2 text-[13px] font-bold cursor-pointer active:scale-95 transition-transform">
            <Upload className="w-4 h-4" />
            Choisir un fichier
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
          </label>
          <p className="text-[11px] text-text-tertiary mt-3">
            {isCashmag
              ? "Idempotent : ré-importer ne crée pas de doublons."
              : "Idempotent par EAN : ré-importer met à jour, ne duplique pas."}
          </p>
        </div>
      </section>

      {busy && (
        <section className="px-5 mt-4">
          <div className="bg-white border border-rule rounded-[16px] p-4 flex items-center gap-3">
            <span className="w-4 h-4 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
            <p className="text-[13px] text-text-secondary">
              {isCashmag
                ? "Parse + insertion en cours…"
                : "Création produits + initialisation stock…"}
            </p>
          </div>
        </section>
      )}

      {result &&
        (isCashmag ? (
          <CashmagResultView
            result={result as CashmagResult}
            preview={preview}
          />
        ) : (
          <StockResultView result={result as StockResult} preview={preview} />
        ))}
      </div>
    </V2Shell>
  );
}

/* ----------------------------- Aperçu CSV ----------------------------- */

function CsvPreview({ preview }: { preview: string[] }) {
  if (preview.length === 0) return null;
  return (
    <div className="bg-white border border-rule rounded-[18px] p-4">
      <p className="text-[12px] font-bold text-text-secondary uppercase tracking-wide mb-2">
        Aperçu
      </p>
      <div className="mono text-[10.5px] text-text-secondary leading-relaxed max-h-32 overflow-y-auto whitespace-pre-wrap break-all">
        {preview.join("\n")}
      </div>
    </div>
  );
}

/* ------------------------- Résultat Cashmag ------------------------- */

function CashmagResultView({
  result,
  preview,
}: {
  result: CashmagResult;
  preview: string[];
}) {
  return (
    <section className="px-5 mt-4 space-y-3">
      <div
        className={`rounded-[18px] p-4 border ${
          result.ok
            ? "bg-success-soft border-success/30"
            : result.inserted > 0
              ? "bg-warning-soft border-warning/30"
              : "bg-danger-soft border-danger/30"
        }`}
      >
        <div className="flex items-center gap-2">
          {result.ok ? (
            <CheckCircle2 className="w-5 h-5 text-success" />
          ) : (
            <XCircle className="w-5 h-5 text-danger" />
          )}
          <p className="text-[14px] font-extrabold tabular">
            {result.inserted}/{result.parsed} ligne(s) importée(s)
          </p>
        </div>
        {result.meta && (
          <p className="text-[11px] text-text-secondary mt-2 mono">
            Séparateur :{" "}
            <span className="font-bold">{result.meta.separator || "?"}</span> ·
            Colonnes : {Object.keys(result.meta.columnIndex).join(", ")}
          </p>
        )}
      </div>
      {result.parseErrors && result.parseErrors.length > 0 && (
        <div className="bg-white border border-rule rounded-[18px] p-4">
          <p className="text-[12px] font-bold text-warning uppercase tracking-wide mb-2">
            {result.parseErrors.length} erreur(s) ignorée(s)
          </p>
          <ul className="text-[11px] text-text-secondary space-y-1 max-h-48 overflow-y-auto">
            {result.parseErrors.slice(0, 100).map((e) => (
              <li key={e.line} className="mono">
                Ligne {e.line}: {e.reason}
              </li>
            ))}
            {result.parseErrors.length > 100 && (
              <li className="italic">
                … et {result.parseErrors.length - 100} autres
              </li>
            )}
          </ul>
        </div>
      )}
      <CsvPreview preview={preview} />
      <a
        href="/v2/admin/rapport-mensuel"
        className="block w-full bg-primary text-white rounded-[18px] py-3.5 px-4 text-center font-bold text-[14px] active:scale-[0.99] transition-transform"
      >
        Voir le rapport mensuel consolidé →
      </a>
    </section>
  );
}

/* -------------------------- Résultat Stock -------------------------- */

function StockResultView({
  result,
  preview,
}: {
  result: StockResult;
  preview: string[];
}) {
  return (
    <section className="px-5 mt-4 space-y-3 pb-[max(3rem,env(safe-area-inset-bottom))]">
      <div
        className={`rounded-[18px] p-4 border ${
          result.ok
            ? "bg-success-soft border-success/30"
            : "bg-warning-soft border-warning/30"
        }`}
      >
        <div className="flex items-center gap-2">
          {result.ok ? (
            <CheckCircle2 className="w-5 h-5 text-success" />
          ) : (
            <XCircle className="w-5 h-5 text-warning" />
          )}
          <p className="text-[14px] font-extrabold tabular">
            {result.produits_crees} produit(s) créé(s) ·{" "}
            {result.stock_initialise + result.stock_maj} ligne(s) stock
          </p>
        </div>
        <p className="text-[11.5px] text-text-secondary mt-2">
          {result.produits_existants} déjà au catalogue ·{" "}
          {result.stock_initialise} initialisé(s) · {result.stock_maj} mis à
          jour
        </p>
      </div>
      {result.parseErrors && result.parseErrors.length > 0 && (
        <div className="bg-white border border-rule rounded-[18px] p-4">
          <p className="text-[12px] font-bold text-warning uppercase tracking-wide mb-2">
            {result.parseErrors.length} ligne(s) ignorée(s)
          </p>
          <ul className="text-[11px] text-text-secondary space-y-1 max-h-48 overflow-y-auto">
            {result.parseErrors.slice(0, 12).map((e, i) => (
              <li key={`${e.line}-${i}`} className="mono">
                Ligne {e.line}: {e.reason}
              </li>
            ))}
            {result.parseErrors.length > 12 && (
              <li className="italic">
                … et {result.parseErrors.length - 12} autres
              </li>
            )}
          </ul>
        </div>
      )}
      {result.dbErrors && result.dbErrors.length > 0 && (
        <div className="bg-danger-soft border border-danger/30 rounded-[18px] p-4">
          <p className="text-[12px] font-bold text-danger uppercase tracking-wide mb-2">
            Erreurs base
          </p>
          <ul className="text-[11px] text-text-secondary space-y-1">
            {result.dbErrors.map((e, i) => (
              <li key={i} className="mono">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}
      <CsvPreview preview={preview} />
      <a
        href="/v2/stock"
        className="block w-full bg-primary text-white rounded-[18px] py-3.5 px-4 text-center font-bold text-[14px] active:scale-[0.99] transition-transform"
      >
        Voir le stock →
      </a>
    </section>
  );
}
