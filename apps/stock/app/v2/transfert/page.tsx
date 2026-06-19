"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Camera,
  Check,
  Repeat2,
  ScanBarcode,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { ProductThumbnail } from "@/components/v2/ProductThumbnail";
import { EditorialEyebrow } from "@/components/v2/EditorialEyebrow";
import { useV2 } from "@/lib/v2-store";
import { BarcodeScanner } from "@/components/reception/BarcodeScanner";
import { PhotoCapture } from "@/components/reception/PhotoCapture";
import {
  createTransfert,
  findProduitByEan,
  listDepots,
  listProduitsInDepot,
  searchProduits,
} from "@/lib/db";
import type { Depot, Produit, ProduitInDepot } from "@/lib/types/db";

export default function V2TransfertPage() {
  const router = useRouter();
  const employe = useV2((s) => s.currentEmploye);
  const currentDepot = useV2((s) => s.currentDepot);

  const [depots, setDepots] = useState<Depot[]>([]);
  const [source, setSource] = useState<Depot | null>(null);
  const [destination, setDestination] = useState<Depot | null>(null);

  const [produit, setProduit] = useState<Produit | null>(null);
  const [stockSource, setStockSource] = useState<number | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProduitInDepot[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [quantite, setQuantite] = useState<number | "">("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ─── Règle métier transferts inter-dépôts ───────────────────
  // L'employé est rattaché à UN dépôt (employe.depot_principal_id).
  // Tous ses transferts sont INBOUND vers son dépôt. Le source dispo
  // dépend de son dépôt :
  //   Employé Particulier → reçoit depuis Pro
  //   Employé Sodrune     → reçoit depuis Pro
  //   Employé Pro         → reçoit depuis Particulier OU Sodrune
  // Les admins n'ont pas de restriction (peuvent piloter n'importe
  // quel transfert pour réajustement).
  const ALLOWED_SOURCES_FOR_DEST: Record<string, string[]> = {
    Particulier: ["Professionnel"],
    Sodrune: ["Professionnel"],
    Professionnel: ["Particulier", "Sodrune"],
  };
  const isAdmin = employe?.role === "admin";

  useEffect(() => {
    void listDepots().then((d) => {
      setDepots(d);
      // Destination forcée au dépôt principal de l'employé (sauf admin
      // qui peut tout faire et garde le current depot du switcher).
      if (!isAdmin && employe?.depot_principal_id) {
        const own = d.find((x) => x.id === employe.depot_principal_id);
        if (own) setDestination(own);
      } else if (isAdmin && currentDepot) {
        setDestination(currentDepot);
      }
    });
  }, [currentDepot, employe?.depot_principal_id, isAdmin]);

  function allowedSources(dest: Depot | null): Depot[] {
    // Admin : aucune restriction — toutes les sources sont sélectionnables,
    // même avant d'avoir choisi la destination (on exclut juste la dest).
    if (isAdmin) return depots.filter((d) => !dest || d.id !== dest.id);
    if (!dest) return [];
    const allowedNames = ALLOWED_SOURCES_FOR_DEST[dest.nom] ?? [];
    return depots.filter((d) => allowedNames.includes(d.nom));
  }

  useEffect(() => {
    if (!produit || !source) {
      setStockSource(null);
      return;
    }
    void listProduitsInDepot(source.id).then((list) => {
      const item = list.find((p) => p.id === produit.id);
      setStockSource(item?.quantite ?? 0);
    });
  }, [produit, source]);

  // search ⇒ filter to source depot stock
  useEffect(() => {
    if (!showSearch || !source || !searchQuery.trim()) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const t = setTimeout(async () => {
      try {
        const sourceStock = await listProduitsInDepot(source.id);
        const all = await searchProduits(searchQuery);
        const allIds = new Set(all.map((p) => p.id));
        setSearchResults(sourceStock.filter((p) => allIds.has(p.id)));
      } catch (err) {
        console.error("[transfert] recherche échouée:", err);
        toast.error("Recherche indisponible · vérifie la connexion");
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [searchQuery, showSearch, source]);

  const handleScanRef = useRef<((c: string) => void) | undefined>(undefined);
  const handleScan = async (code: string) => {
    setScannerOpen(false);
    const p = await findProduitByEan(code);
    if (p) {
      setProduit(p);
      toast.success(p.nom);
    } else {
      toast.warning("Code inconnu · recherche par nom");
      setShowSearch(true);
    }
  };
  handleScanRef.current = handleScan;

  async function submit() {
    if (!source || !destination || !produit || !employe) {
      toast.error("Source, destination et produit requis");
      return;
    }
    if (source.id === destination.id) {
      toast.error("Source et destination doivent être différentes");
      return;
    }
    if (quantite === "" || quantite <= 0) {
      toast.error("Saisis une quantité supérieure à 0");
      return;
    }
    if (stockSource !== null && quantite > stockSource) {
      toast.error(`Stock source insuffisant (${stockSource} disponibles)`);
      return;
    }
    setSubmitting(true);
    const startedAt = Date.now();
    try {
      console.log("[Transfert] submit payload", {
        source: source.nom,
        destination: destination.nom,
        produit: produit.nom,
        quantite,
        hasPhoto: !!photo,
      });
      const result = await createTransfert({
        depot_source_id: source.id,
        depot_destination_id: destination.id,
        produit_id: produit.id,
        quantite,
        employe_id: employe.id,
        photo_url: photo ?? undefined,
      });
      console.log(
        `[Transfert] succès en ${Date.now() - startedAt}ms`,
        result?.id,
      );
      // Push iPhone admin — transfert audit
      void import("@/lib/notifications").then((m) =>
        m.pushToAdmins({
          title: `🔄 Transfert ${source.nom} → ${destination.nom}`,
          body: `${produit.nom} × ${quantite} · par ${employe.prenom ?? "employé"}`,
          url: "/v2/admin/activite",
          tag: `trf-${result?.id ?? Date.now()}`,
        }),
      );
      toast.success(
        `Transfert validé : ${quantite} × ${produit.nom} de ${source.nom} → ${destination.nom}`,
      );
      router.replace("/v2");
    } catch (err) {
      console.error("[Transfert] échec", err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Transfert refusé : ${msg.slice(0, 160)}`, {
        duration: 8000,
      });
    } finally {
      setSubmitting(false);
    }
  }

  // Erreur quantité inline : dépassement du stock source disponible.
  // On bloque visuellement (bouton + message) au lieu de laisser passer
  // jusqu'au toast au clic — un transfert > stock pousserait le dépôt
  // source en négatif.
  const depasseStock =
    stockSource !== null &&
    typeof quantite === "number" &&
    quantite > stockSource;

  // Bouton actif seulement avec source/dest/produit valides ET une
  // quantité saisie qui ne dépasse pas le stock disponible.
  const canSubmit =
    !!source &&
    !!destination &&
    source.id !== destination.id &&
    !!produit &&
    typeof quantite === "number" &&
    quantite > 0 &&
    !depasseStock;

  return (
    <V2Shell hideNav>
      <PageAccentStripe accent="or" />
      <header className="px-5 pt-7">
        <BackButton />
        <EditorialEyebrow
          num="01"
          label="Transfert inter-dépôt"
          className="mt-3"
        />
        <h1 className="h1-display mt-3">
          Bouger du <span className="gold">stock</span>.
        </h1>
        {isAdmin && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gold-soft text-primary-dark px-3 py-1.5 text-[11px] font-bold">
            <Building2 className="w-3.5 h-3.5 text-gold" />
            Mode admin · transfert libre entre tous les dépôts
          </div>
        )}
      </header>

      {/* SOURCE → DESTINATION (destination lockée au dépôt de l'employé
          sauf admin qui peut tout piloter) */}
      <section className="px-5 mt-6">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
          <DepotPick
            label="Source"
            depots={allowedSources(destination)}
            value={source}
            onChange={setSource}
          />
          <ArrowRight className="w-5 h-5 text-text-tertiary" />
          {isAdmin ? (
            <DepotPick
              label="Destination"
              depots={depots.filter((d) => d.id !== source?.id)}
              value={destination}
              onChange={(d) => {
                setDestination(d);
                if (source?.id === d.id) setSource(null);
              }}
            />
          ) : (
            <DepotLocked label="Vers votre dépôt" depot={destination} />
          )}
        </div>
        {!isAdmin && (
          <p className="text-[11px] text-text-tertiary mt-2 leading-relaxed">
            Tu peux faire entrer du stock vers{" "}
            <b>{destination?.nom ?? "Aucun"}</b> depuis{" "}
            <b>
              {allowedSources(destination)
                .map((d) => d.nom)
                .join(" ou ") || "Aucun"}
            </b>
            . Demande à un admin pour les autres directions.
          </p>
        )}
      </section>

      {/* PRODUIT */}
      {source && destination && (
        <section className="px-5 mt-6">
          <p className="label-caps text-text-tertiary mb-2">
            Produit à transférer (depuis {source.nom})
          </p>
          {produit ? (
            <div className="lg rise-in p-4 flex items-center gap-3">
              <ProductThumbnail
                nom={produit.nom}
                categorie={produit.categorie}
                size={48}
                rounded="xl"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-text-primary truncate">
                  {produit.nom}
                </p>
                <p className="text-xs text-text-tertiary">
                  Stock source :{" "}
                  <span className="font-bold text-text-primary">
                    {stockSource ?? "…"}
                  </span>
                </p>
              </div>
              <button
                onClick={() => {
                  setProduit(null);
                  setShowSearch(false);
                }}
                className="tap text-xs font-bold text-text-secondary min-h-[44px] min-w-[44px] px-3 -mr-2 shrink-0"
              >
                Changer
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => setScannerOpen(true)}
                className="tap w-full bg-primary text-white rounded-2xl py-4 flex items-center justify-center gap-2"
              >
                <ScanBarcode className="w-5 h-5" />
                <span className="font-bold">Scanner</span>
              </button>
              {!showSearch ? (
                <button
                  onClick={() => setShowSearch(true)}
                  className="tap w-full bg-cream text-primary rounded-2xl py-3 min-h-[44px] flex items-center justify-center gap-2 text-sm font-bold border border-rule"
                >
                  <Search className="w-4 h-4" />
                  Rechercher par nom (filtré sur {source.nom})
                </button>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Nom, marque, code…"
                      aria-label={`Rechercher un produit dans ${source.nom}`}
                      inputMode="search"
                      autoComplete="off"
                      className="input-field !pl-10 !text-base"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {searchLoading && (
                      <p className="text-xs text-text-tertiary text-center py-4">
                        Recherche…
                      </p>
                    )}
                    {searchResults.map((p, i) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setProduit(p);
                          setShowSearch(false);
                        }}
                        style={{ ["--i" as string]: i }}
                        className="tap rise-in w-full flex items-center gap-3 p-2 min-h-[56px] rounded-2xl active:bg-cream text-left"
                      >
                        <ProductThumbnail
                          nom={p.nom}
                          categorie={p.categorie}
                          size={36}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-text-primary truncate">
                            {p.nom}
                          </p>
                          <p className="text-xs text-text-tertiary">
                            {p.quantite} en stock
                          </p>
                        </div>
                      </button>
                    ))}
                    {!searchLoading &&
                      searchQuery.length >= 2 &&
                      searchResults.length === 0 && (
                        <p className="text-xs text-text-tertiary text-center py-4">
                          Aucun produit dans {source.nom}
                        </p>
                      )}
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {/* QUANTITÉ + PHOTO */}
      {produit && (
        <section className="px-5 mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <div>
            <label htmlFor="transfert-quantite">
              <span className="label-caps text-text-tertiary mb-2 block">
                Quantité à transférer
              </span>
            </label>
            <input
              id="transfert-quantite"
              type="number"
              min={1}
              max={stockSource ?? undefined}
              value={quantite}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") setQuantite("");
                else {
                  const n = parseInt(v, 10);
                  // Clamp à [1, stock source] (plafond 9999 si stock
                  // inconnu) : impossible de transférer plus que le
                  // disponible, donc pas de stock négatif côté source.
                  const plafond = stockSource ?? 9999;
                  setQuantite(
                    Number.isNaN(n) ? "" : Math.max(1, Math.min(n, plafond)),
                  );
                }
              }}
              placeholder={
                stockSource !== null ? `0 · ${stockSource} max` : "Quantité"
              }
              aria-label="Quantité à transférer"
              aria-invalid={depasseStock}
              inputMode="numeric"
              className="input-field text-2xl font-bold text-center"
            />
            {depasseStock && (
              <p
                role="alert"
                className="text-[12px] font-bold text-danger mt-2 text-center"
              >
                Stock source insuffisant · {stockSource} disponible
                {(stockSource ?? 0) > 1 ? "s" : ""}
              </p>
            )}
          </div>

          <div>
            <p className="label-caps text-text-tertiary mb-2">
              Photo (optionnel)
            </p>
            {photo ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  loading="lazy"
                  decoding="async"
                  src={photo}
                  alt="Transfert"
                  className="w-full h-36 object-cover rounded-2xl border border-rule"
                />
                <button
                  onClick={() => setPhotoOpen(true)}
                  className="tap absolute bottom-2 right-2 bg-white text-primary text-xs font-bold rounded-full px-4 py-2 min-h-[36px] shadow"
                >
                  Reprendre
                </button>
              </div>
            ) : (
              <button
                onClick={() => setPhotoOpen(true)}
                className="tap w-full bg-cream border border-dashed border-rule rounded-2xl py-5 flex items-center justify-center gap-2 text-text-secondary text-sm"
              >
                <Camera className="w-4 h-4" />
                Ajouter une photo
              </button>
            )}
          </div>
        </section>
      )}

      <div className="fixed bottom-0 inset-x-0 z-30 pb-safe pointer-events-none">
        <div className="sticky-action-inner pt-3 pb-3 pointer-events-auto">
          <button
            onClick={submit}
            disabled={!canSubmit || submitting}
            className="tap w-full bg-gold text-primary-dark rounded-[22px] px-5 py-4 flex items-center justify-between shadow-card-lg disabled:opacity-50"
          >
            <div className="text-left">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary-dark/70">
                {submitting ? "Validation…" : "Valider le transfert"}
              </p>
              <p className="text-[15px] font-extrabold mt-0.5">
                {source?.nom ?? "Source"} → {destination?.nom ?? "Destination"}
              </p>
            </div>
            <span className="bg-white/30 rounded-full p-2.5">
              <Repeat2 className="w-5 h-5" />
            </span>
          </button>
        </div>
      </div>

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(c) => handleScanRef.current?.(c)}
      />
      <PhotoCapture
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
        onCapture={(d) => setPhoto(d)}
      />
    </V2Shell>
  );
}

function DepotPick({
  label,
  depots,
  value,
  onChange,
}: {
  label: string;
  depots: Depot[];
  value: Depot | null;
  onChange: (d: Depot) => void;
}) {
  const selectId = `depot-pick-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div>
      <label htmlFor={selectId}>
        <span className="label-caps text-text-tertiary mb-2 text-center block">
          {label}
        </span>
      </label>
      <select
        id={selectId}
        value={value?.id ?? ""}
        onChange={(e) => {
          const d = depots.find((x) => x.id === e.target.value);
          if (d) onChange(d);
        }}
        aria-label={`Choisir le dépôt ${label.toLowerCase()}`}
        className="lg lg-hover tap w-full px-3 py-3 min-h-[44px] text-base font-bold text-text-primary appearance-none text-center"
      >
        <option value="">Choisir</option>
        {depots.map((d) => (
          <option key={d.id} value={d.id}>
            {d.nom}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Champ destination en lecture seule pour un employé non-admin :
 *  on affiche son dépôt sapin et figé, pour qu'il sache où arrive le stock
 *  sans pouvoir le changer. */
function DepotLocked({ label, depot }: { label: string; depot: Depot | null }) {
  return (
    <div>
      <p className="label-caps text-text-tertiary mb-2 text-center">{label}</p>
      <div className="w-full bg-primary text-white rounded-2xl px-3 py-3 min-h-[44px] text-sm font-bold text-center inline-flex items-center justify-center gap-1.5">
        <Building2 className="w-3.5 h-3.5 text-gold" />
        {depot?.nom ?? "Aucun"}
      </div>
    </div>
  );
}
