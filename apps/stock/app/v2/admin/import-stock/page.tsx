"use client";

import { useState, useCallback } from "react";
import { CheckCircle2, FileSpreadsheet, Upload, XCircle } from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { useV2 } from "@/lib/v2-store";

interface ImportResult {
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

export default function ImportStockPage() {
  const depot = useV2((s) => s.currentDepot);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [preview, setPreview] = useState<string[]>([]);

  const handleFile = useCallback(
    async (file: File) => {
      if (!depot) {
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
        let text = await file.text();
        // Auto-détection ISO-8859-1 si les accents UTF-8 sont absents.
        if (!/[éèàçâêîôûë]/i.test(text) && /\xe9|\xe8|\xe0/.test(text)) {
          const buf = await file.arrayBuffer();
          text = new TextDecoder("iso-8859-1").decode(buf);
        }
        setPreview(text.split(/\r?\n/).slice(0, 6));
        const r = await fetch("/api/cashbox/import-stock", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ csv: text, depot_id: depot.id }),
        });
        const data = (await r.json()) as ImportResult & { error?: string };
        if (data.error) {
          toast.error(data.error);
          setBusy(false);
          return;
        }
        setResult(data);
        const total = data.stock_initialise + data.stock_maj;
        if (data.ok && total > 0) {
          toast.success(
            `${data.produits_crees} produit(s) créé(s) · ${total} ligne(s) stock sur ${depot.nom}`,
          );
        } else if (total > 0) {
          toast.warning(
            `${total} ligne(s) stock, ${data.parseErrors?.length ?? 0} erreur(s)`,
          );
        } else {
          toast.error("Aucune ligne importée — vérifie le format du CSV");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erreur");
      } finally {
        setBusy(false);
      }
    },
    [depot],
  );

  return (
    <V2Shell hideNav>
      <header className="px-5 pt-7">
        <BackButton />
        <p className="section-eyebrow mt-3">
          <FileSpreadsheet className="w-3 h-3" />
          Import catalogue
        </p>
        <h1 className="h1 text-text-primary mt-1">Importer le stock</h1>
        <p className="body-md text-text-secondary mt-1">
          Glisse-dépose un CSV de ton catalogue pour créer les fiches produits
          et initialiser le stock du dépôt{" "}
          <span className="font-bold text-text-primary">
            {depot?.nom ?? "(aucun sélectionné)"}
          </span>
          .
        </p>
      </header>

      {/* Format attendu */}
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
            Dépose ton CSV catalogue ici
          </p>
          <p className="text-[12px] text-text-secondary mt-1.5">
            UTF-8 ou ISO-8859-1 (auto-détecté)
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
            Idempotent par EAN : ré-importer met à jour, ne duplique pas.
          </p>
        </div>
      </section>

      {busy && (
        <section className="px-5 mt-4">
          <div className="bg-white border border-rule rounded-[16px] p-4 flex items-center gap-3">
            <span className="w-4 h-4 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
            <p className="text-[13px] text-text-secondary">
              Création produits + initialisation stock…
            </p>
          </div>
        </section>
      )}

      {result && (
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
          {preview.length > 0 && (
            <div className="bg-white border border-rule rounded-[18px] p-4">
              <p className="text-[12px] font-bold text-text-secondary uppercase tracking-wide mb-2">
                Aperçu
              </p>
              <div className="mono text-[10.5px] text-text-secondary leading-relaxed max-h-32 overflow-y-auto whitespace-pre-wrap break-all">
                {preview.join("\n")}
              </div>
            </div>
          )}
          <a
            href="/v2/stock"
            className="block w-full bg-primary text-white rounded-[18px] py-3.5 px-4 text-center font-bold text-[14px] active:scale-[0.99] transition-transform"
          >
            Voir le stock →
          </a>
        </section>
      )}
    </V2Shell>
  );
}
