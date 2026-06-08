"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronRight,
  Loader2,
  Package,
  PackageOpen,
  PackagePlus,
  PlayCircle,
  ScanBarcode,
  Search,
  Send,
  Sparkles,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { ProductThumbnail } from "@/components/v2/ProductThumbnail";
import { EditorialEyebrow } from "@/components/v2/EditorialEyebrow";
import { GlossaryTerm } from "@/components/v2/GlossaryTerm";
import { supabase } from "@/lib/supabase";
import {
  ProductRecognitionModal,
  type RecognitionResult,
} from "@/components/v2/ProductRecognitionModal";
import { useV2 } from "@/lib/v2-store";
import { BarcodeScanner } from "@/components/reception/BarcodeScanner";
import { PhotoCapture } from "@/components/reception/PhotoCapture";
import {
  addReceptionLigne,
  createProduit,
  createReception,
  findCarton,
  findProduitByEan,
  learnCarton,
  searchProduits,
  validateReception,
} from "@/lib/db";
import type { Produit } from "@/lib/types/db";

interface ScanRow {
  id: string;
  produitId: string;
  produitNom: string;
  codeScanne: string;
  quantite: number;
  source: "unit" | "carton";
  cartonInfo?: { ean: string; multiplier: number };
}

type Step = "intake" | "scanning" | "validate";

interface BdlSummary {
  id: string;
  numero_bdl: string;
  date_livraison_prevue: string;
  statut: "prevue" | "en_cours" | "receptionnee" | "litige";
  fournisseurs: { nom: string } | null;
  depots: { nom: string } | null;
  bons_de_livraison_lignes: Array<{
    quantite_attendue: number;
    quantite_recue: number;
  }>;
}

export default function V2ReceptionPage() {
  const router = useRouter();
  const depot = useV2((s) => s.currentDepot);
  const employe = useV2((s) => s.currentEmploye);

  const [step, setStep] = useState<Step>("intake");
  const [bdlToday, setBdlToday] = useState<BdlSummary[]>([]);
  const [bdlEnCours, setBdlEnCours] = useState<BdlSummary[]>([]);
  const [bdlLoading, setBdlLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showLibre, setShowLibre] = useState(false);
  const [fournisseur, setFournisseur] = useState("");
  const [numeroBl, setNumeroBl] = useState("");
  const [photoCarton, setPhotoCarton] = useState<string | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  // Contrôle IA de la photo d'une réception libre (livraison surprise) :
  // on impose que la photo montre bien une livraison de produits.
  const [photoIa, setPhotoIa] = useState<{
    status: "idle" | "checking" | "ok" | "rejected" | "unavailable";
    label: string;
  }>({ status: "idle", label: "" });

  const [receptionId, setReceptionId] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Unknown EAN handling (learning workflow)
  const [unknownEan, setUnknownEan] = useState<string | null>(null);
  const [learnMode, setLearnMode] = useState<
    "select" | "carton-qty" | "carton-unit-scan" | "search"
  >("select");
  const [cartonQty, setCartonQty] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Produit[]>([]);
  const [pendingProduitForCarton, setPendingProduitForCarton] =
    useState<Produit | null>(null);
  const [recognitionOpen, setRecognitionOpen] = useState(false);
  /** Scanner ré-ouvert dans le mode apprentissage carton pour scanner
   *  un produit interne et l'identifier par son EAN. */
  const [learnScannerOpen, setLearnScannerOpen] = useState(false);

  // ─── Fetch BDL today + en cours ─────────────────────────────
  const cancelledRef = useRef(false);
  const load = useCallback(async () => {
    setBdlLoading(true);
    const sb = supabase();
    if (!sb) {
      if (!cancelledRef.current) setBdlLoading(false);
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    try {
      const { data, error } = await sb
        .from("bons_de_livraison")
        .select(
          `id, numero_bdl, date_livraison_prevue, statut,
           fournisseurs (nom), depots (nom),
           bons_de_livraison_lignes (quantite_attendue, quantite_recue)`,
        )
        .or(`date_livraison_prevue.eq.${today},statut.eq.en_cours`)
        .neq("statut", "receptionnee")
        .order("date_livraison_prevue", { ascending: true });
      if (cancelledRef.current) return;
      if (error) {
        // Table peut ne pas exister si migration 0012 non appliquée
        if (error.message.includes("does not exist")) {
          // Migration non appliquée : pas une vraie erreur réseau, on
          // affiche juste l'état vide (réception libre reste possible).
          setBdlToday([]);
          setBdlEnCours([]);
          setLoadError(null);
        } else {
          console.warn("[BDL] fetch error:", error.message);
          setBdlToday([]);
          setBdlEnCours([]);
          setLoadError(
            "Impossible de charger les livraisons. Vérifie ta connexion.",
          );
        }
      } else {
        const rows = (data ?? []) as unknown as BdlSummary[];
        setBdlToday(rows.filter((b) => b.statut === "prevue"));
        setBdlEnCours(rows.filter((b) => b.statut === "en_cours"));
        setLoadError(null);
      }
    } catch (e) {
      if (cancelledRef.current) return;
      console.warn("[BDL] fetch exception:", e);
      setBdlToday([]);
      setBdlEnCours([]);
      setLoadError(
        "Impossible de charger les livraisons. Vérifie ta connexion.",
      );
    } finally {
      if (!cancelledRef.current) setBdlLoading(false);
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    void load();
    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

  // Avoid stale-closure on the scanner callback
  const scansRef = useRef(scans);
  scansRef.current = scans;
  const receptionIdRef = useRef(receptionId);
  receptionIdRef.current = receptionId;
  const handleScanRef = useRef<((code: string) => void) | undefined>(undefined);

  async function handleScan(code: string) {
    if (!receptionIdRef.current || !depot) return;
    setScannerOpen(false);
    // 1. Try carton
    const carton = await findCarton(code);
    if (carton) {
      let produit: Produit | null;
      try {
        produit = await findProduitByEanInternal(carton.produit_id);
      } catch {
        // Erreur DB sur le lookup : on n'invente pas un mauvais routage.
        toast.error("Erreur réseau, réessaie le scan du carton");
        return;
      }
      if (produit) {
        await pushScan({
          code,
          produit,
          quantite: carton.quantite_par_carton,
          source: "carton",
          cartonInfo: {
            ean: carton.ean_carton,
            multiplier: carton.quantite_par_carton,
          },
        });
        toast.success(
          `Carton ${produit.nom} · +${carton.quantite_par_carton}`,
          { duration: 2000 },
        );
        return;
      }
    }
    // 2. Try unit
    const produit = await findProduitByEan(code);
    if (produit) {
      await pushScan({ code, produit, quantite: 1, source: "unit" });
      toast.success(`${produit.nom} · +1`, { duration: 1800 });
      return;
    }
    // 3. Unknown — open learning workflow
    setUnknownEan(code);
    setLearnMode("select");
    setCartonQty(0);
    setSearchQuery("");
    setSearchResults([]);
    setPendingProduitForCarton(null);
  }
  handleScanRef.current = handleScan;

  // Helper: lookup produit by id (prefer DB, fallback search)
  async function findProduitByEanInternal(
    produitId: string,
  ): Promise<Produit | null> {
    // Carton stores produit_id, but we don't have a direct getter; re-search by id via search.
    // For local mode, lookup in seed.
    const { SEED_PRODUITS } = await import("@/lib/db/seed-local");
    const local = SEED_PRODUITS.find((p) => p.id === produitId);
    if (local) return local;
    // Supabase: fetch directly
    const { supabase } = await import("@/lib/supabase");
    const sb = supabase();
    if (sb) {
      const { data, error } = await sb
        .from("produits")
        .select("*")
        .eq("id", produitId)
        .maybeSingle();
      // Une erreur DB ne doit PAS être confondue avec « produit introuvable » :
      // le carton référence un produit réel (FK), donc un null sur erreur
      // mènerait à un mauvais routage (création de doublon). On la propage.
      if (error) throw new Error(error.message);
      return (data as Produit) ?? null;
    }
    return null;
  }

  async function pushScan(args: {
    code: string;
    produit: Produit;
    quantite: number;
    source: "unit" | "carton";
    cartonInfo?: { ean: string; multiplier: number };
  }) {
    const id = await addReceptionLigne({
      reception_id: receptionIdRef.current!,
      produit_id: args.produit.id,
      code_scanne: args.code,
      quantite_calculee: args.quantite,
    });
    setScans((prev) => [
      ...prev,
      {
        id: id.id,
        produitId: args.produit.id,
        produitNom: args.produit.nom,
        codeScanne: args.code,
        quantite: args.quantite,
        source: args.source,
        cartonInfo: args.cartonInfo,
      },
    ]);
  }

  /**
   * Contrôle IA de la photo d'une réception libre : la photo doit montrer
   * une vraie livraison de produits d'épicerie. hors_sujet ⇒ rejet (reprendre).
   * Si l'IA est indisponible, on n'empêche pas l'exploitation (dégradation
   * gracieuse) mais la photo reste obligatoire.
   */
  async function validatePhotoIa(dataUrl: string) {
    setPhotoIa({ status: "checking", label: "Vérification de la photo…" });
    try {
      // Timeout 15 s : le spinner ne doit jamais tourner indéfiniment si l'IA
      // ne répond pas (réseau lent, fonction froide). On dégrade gracieusement.
      const r = await fetch("/api/vision-product-recognition", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ photo_data_url: dataUrl }),
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) {
        setPhotoIa({
          status: "unavailable",
          label:
            "Contrôle IA indisponible — photo acceptée, vérifiez visuellement.",
        });
        return;
      }
      const j = (await r.json()) as RecognitionResult;
      if (j.hors_sujet) {
        setPhotoIa({
          status: "rejected",
          label:
            (j.description_courte && j.description_courte.trim()) ||
            "Cette photo ne montre pas une livraison de produits. Reprenez la photo du carton/palette.",
        });
      } else {
        setPhotoIa({
          status: "ok",
          label:
            j.produit_reconnu && j.nom_suggere
              ? `Livraison confirmée (ex. ${j.nom_suggere}).`
              : "Livraison de produits confirmée par l'IA.",
        });
      }
    } catch {
      setPhotoIa({
        status: "unavailable",
        label:
          "Contrôle IA injoignable — photo acceptée, vérifiez visuellement.",
      });
    }
  }

  async function startReception() {
    if (!depot || !employe) {
      toast.error("Dépôt et employé requis");
      return;
    }
    if (!photoCarton) {
      toast.error("Photo du carton/palette obligatoire");
      return;
    }
    if (photoIa.status === "checking") {
      toast.error("Vérification IA de la photo en cours…");
      return;
    }
    if (photoIa.status === "rejected") {
      toast.error(
        "Photo refusée par l'IA — reprenez une photo de la livraison.",
      );
      return;
    }
    try {
      const r = await createReception({
        depot_id: depot.id,
        employe_id: employe.id,
        fournisseur: fournisseur || undefined,
        numero_bl: numeroBl || undefined,
        photo_url: photoCarton,
      });
      setReceptionId(r.id);
      setStep("scanning");
    } catch (e) {
      console.error(e);
      toast.error("Erreur de création de la réception");
    }
  }

  async function finalize() {
    if (!receptionId) {
      toast.error("Réception non initialisée");
      return;
    }
    const isEmpty = scans.length === 0;
    if (isEmpty) {
      const ok =
        typeof window !== "undefined" &&
        window.confirm(
          "Aucun produit scanné. Valider quand même une réception vide ?\n\n" +
            "Cela enregistrera un bon de livraison fournisseur sans contenu · utile pour signaler une livraison incomplète. Une alerte sera levée sur le dashboard admin.",
        );
      if (!ok) return;
    }
    setSubmitting(true);
    try {
      await validateReception(receptionId, { vide: isEmpty });
      if (isEmpty) {
        // HOTFIX vague 7 : server action injecte x-internal-secret.
        try {
          const { sendInternalNotify } = await import("@/lib/actions/notify");
          await sendInternalNotify({
            kind: "reception_vide",
            payload: {
              reception_id: receptionId,
              depot: depot?.nom,
              employe: `${employe?.prenom} ${employe?.nom}`,
              fournisseur: fournisseur || "(non renseigné)",
              numero_bl: numeroBl || "(non renseigné)",
            },
          });
        } catch {
          /* fire-and-forget */
        }
        toast.warning("Réception vide enregistrée. Otmane notifié.");
      } else {
        toast.success("Réception validée. Stock mis à jour.");
      }
      router.replace("/v2");
    } catch (e) {
      console.error(e);
      toast.error(
        e instanceof Error ? e.message : "Erreur lors de la validation",
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Search unknown product
  useEffect(() => {
    if (learnMode !== "search" && learnMode !== "carton-unit-scan") return;
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await searchProduits(searchQuery);
        setSearchResults(r);
      } catch (err) {
        console.error("[reception] recherche échouée:", err);
        toast.error("Recherche indisponible · vérifie la connexion");
        setSearchResults([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [searchQuery, learnMode]);

  function handleLearnUnitFor(produit: Produit) {
    if (!unknownEan) return;
    if (pendingProduitForCarton) {
      // We're in carton-unit-scan mode: link the carton to this product.
      void learnCarton({
        ean_carton: pendingProduitForCarton.ean ?? "",
        produit_id: produit.id,
        quantite_par_carton: cartonQty,
        learned_by: employe?.id,
        fournisseur: fournisseur || undefined,
      })
        .then(() =>
          pushScan({
            code: unknownEan,
            produit,
            quantite: cartonQty,
            source: "carton",
            cartonInfo: { ean: unknownEan, multiplier: cartonQty },
          }),
        )
        .then(() => {
          toast.success(`Carton appris : ${produit.nom} × ${cartonQty}`, {
            duration: 2200,
          });
          closeLearn();
        });
    } else {
      void pushScan({
        code: unknownEan,
        produit,
        quantite: 1,
        source: "unit",
      }).then(() => {
        toast.success(`${produit.nom} · +1`);
        closeLearn();
      });
    }
  }

  function closeLearn() {
    setUnknownEan(null);
    setSearchQuery("");
    setSearchResults([]);
    setLearnMode("select");
    setPendingProduitForCarton(null);
    setCartonQty(0);
    setRecognitionOpen(false);
    setLearnScannerOpen(false);
  }

  /** Handler scan en mode apprentissage carton : scanner le produit
   *  interne du carton pour récupérer son EAN. Si reconnu en catalogue
   *  → on bind direct via handleLearnUnitFor (qui appelle learnCarton).
   *  Sinon → on bascule en search par nom (ou IA recognition). */
  async function handleScanForLearnInternal(code: string) {
    setLearnScannerOpen(false);
    const p = await findProduitByEan(code);
    if (p) {
      handleLearnUnitFor(p);
      return;
    }
    toast.warning(
      `EAN ${code} inconnu · cherche par nom ou utilise la reconnaissance IA.`,
      { duration: 3500 },
    );
  }

  async function handleRecognitionAccept(rec: RecognitionResult) {
    if (!unknownEan) {
      closeLearn();
      return;
    }
    setRecognitionOpen(false);
    try {
      // 1. Create the product from IA-suggested data
      const newProduit = await createProduit({
        nom: rec.nom_suggere || "Produit non identifié",
        marque: rec.marque_suggeree || null,
        categorie: rec.categorie_suggeree || null,
        sous_categorie: rec.sous_categorie_suggeree || null,
        description: rec.description_courte || null,
      });
      // 2. Determine carton quantity (user-saisi or IA estimation)
      const qty =
        cartonQty > 0
          ? cartonQty
          : rec.quantite_carton_estimee > 0
            ? rec.quantite_carton_estimee
            : 1;
      // 3. Enroll the carton EAN
      await learnCarton({
        ean_carton: unknownEan,
        produit_id: newProduit.id,
        quantite_par_carton: qty,
        learned_by: employe?.id,
        fournisseur: fournisseur || undefined,
      });
      // 4. Push a scan row
      await pushScan({
        code: unknownEan,
        produit: newProduit,
        quantite: qty,
        source: "carton",
        cartonInfo: { ean: unknownEan, multiplier: qty },
      });
      toast.success(
        `Produit créé par IA : ${newProduit.nom} · carton × ${qty}`,
        { duration: 2500 },
      );
      closeLearn();
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Création échouée");
    }
  }

  const totalUnits = useMemo(
    () => scans.reduce((s, r) => s + r.quantite, 0),
    [scans],
  );

  return (
    <V2Shell hideNav>
      <PageAccentStripe accent="sapin" />
      <header className="px-5 pt-7">
        <BackButton />
        <EditorialEyebrow
          num="01"
          label="Réception fournisseur"
          className="mt-3"
        />
        <h1 className="h1-display mt-3">
          {step === "intake" ? (
            <>
              Nouvelle <span className="gold">réception</span>.
            </>
          ) : step === "scanning" ? (
            <>
              <span className="gold">Scanner</span> les produits.
            </>
          ) : (
            <>
              Valider la <span className="gold">réception</span>.
            </>
          )}
        </h1>
      </header>

      {step === "intake" && !showLibre && (
        <>
          {/* ─── BANNIÈRE ERREUR DE CHARGEMENT ────────────────────── */}
          {loadError && (
            <section className="px-5 mt-6">
              <div className="rounded-2xl border border-danger/40 bg-danger-soft p-4">
                <p className="text-sm font-bold text-danger">{loadError}</p>
                <button
                  onClick={() => void load()}
                  className="mt-3 inline-flex items-center justify-center h-10 px-4 rounded-full bg-danger text-white text-[13px] font-bold press-btn"
                >
                  Réessayer
                </button>
              </div>
            </section>
          )}

          {/* ─── BDL EN COURS ─────────────────────────────────────── */}
          {bdlEnCours.length > 0 && (
            <section className="px-5 mt-6">
              <p className="label-caps text-primary mb-2">
                Livraisons en cours · {bdlEnCours.length}
              </p>
              <div className="space-y-2">
                {bdlEnCours.map((b) => (
                  <BdlCard
                    key={b.id}
                    bdl={b}
                    variant="encours"
                    onClick={() => router.push(`/v2/reception/${b.id}`)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ─── BDL ATTENDUS AUJOURD'HUI ─────────────────────────── */}
          <section className="px-5 mt-6">
            <p className="label-caps text-text-tertiary mb-2">
              Livraisons attendues aujourd&apos;hui
            </p>
            {bdlLoading ? (
              <div className="bg-white border border-rule rounded-2xl p-6 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
                <p className="text-sm text-text-secondary">Chargement BDL…</p>
              </div>
            ) : bdlToday.length === 0 ? (
              <div className="bg-cream border border-rule rounded-2xl p-6 text-center">
                <Truck className="w-6 h-6 text-text-tertiary mx-auto mb-2" />
                <p className="text-sm font-bold text-text-primary">
                  Aucune livraison prévue aujourd&apos;hui
                </p>
                <p className="text-xs text-text-secondary mt-1">
                  Tu peux lancer une réception libre (sans BDL) ci-dessous.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {bdlToday.map((b) => (
                  <BdlCard
                    key={b.id}
                    bdl={b}
                    variant="prevu"
                    onClick={() => router.push(`/v2/reception/${b.id}`)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ─── RÉCEPTION LIBRE ─────────────────────────────────── */}
          <section className="px-5 mt-6">
            <p className="label-caps text-text-tertiary mb-2">
              <GlossaryTerm
                term="Réception libre"
                def="Livraison sans bon de livraison attendu (surprise)."
              />
            </p>
            <button
              onClick={() => setShowLibre(true)}
              className="w-full bg-white border border-rule rounded-2xl py-4 px-4 flex items-center justify-between press-card"
            >
              <span className="flex items-center gap-3 text-text-primary">
                <span className="w-10 h-10 rounded-xl bg-gold-soft text-primary-dark flex items-center justify-center">
                  <PackagePlus className="w-5 h-5" />
                </span>
                <span className="text-left">
                  <span className="block font-bold text-[14px]">
                    Livraison surprise (sans BDL)
                  </span>
                  <span className="block text-[11.5px] text-text-secondary">
                    Réception manuelle, photo carton, scan libre.
                  </span>
                </span>
              </span>
              <ChevronRight className="w-4 h-4 text-text-tertiary" />
            </button>
          </section>
        </>
      )}

      {step === "intake" && showLibre && (
        <section className="px-5 mt-6 space-y-4">
          <button
            onClick={() => setShowLibre(false)}
            type="button"
            className="inline-flex items-center gap-1.5 h-11 pl-3 pr-5 mb-2 rounded-full bg-white border border-rule shadow-card text-[13px] font-bold text-primary press-btn"
          >
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-cream">
              <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2.4} />
            </span>
            Retour aux BDL
          </button>
          <Field label="Fournisseur (optionnel)">
            <input
              value={fournisseur}
              onChange={(e) => setFournisseur(e.target.value)}
              placeholder="Maamora, Doux Halal…"
              aria-label="Fournisseur (optionnel)"
              className="input-field !text-base"
            />
          </Field>
          <Field label="Numéro de bon de livraison (optionnel)">
            <input
              value={numeroBl}
              onChange={(e) => setNumeroBl(e.target.value)}
              placeholder="BL-2026-…"
              aria-label="Numéro de bon de livraison (optionnel)"
              className="input-field !text-base"
            />
          </Field>

          <div>
            <p className="label-caps text-text-tertiary mb-2">
              Photo du carton / palette
              <span className="text-danger ml-1">*</span>
            </p>
            {photoCarton ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  loading="lazy"
                  decoding="async"
                  src={photoCarton}
                  alt="Photo carton"
                  className="w-full h-44 object-cover rounded-2xl border border-rule"
                />
                <button
                  onClick={() => setPhotoOpen(true)}
                  className="absolute bottom-2 right-2 bg-white text-primary text-xs font-bold rounded-full px-3 py-1.5 shadow"
                >
                  Reprendre
                </button>
              </div>
            ) : (
              <button
                onClick={() => setPhotoOpen(true)}
                className="w-full bg-cream border-2 border-dashed border-primary/30 rounded-2xl py-8 flex flex-col items-center gap-2 text-primary"
              >
                <Camera className="w-6 h-6" />
                <span className="text-sm font-bold">Prendre la photo</span>
                <span className="text-xs text-text-secondary">
                  Obligatoire · validée par l&apos;IA
                </span>
              </button>
            )}

            {/* Statut du contrôle IA de la photo (réception libre) */}
            {photoCarton && photoIa.status !== "idle" && (
              <div
                role="status"
                className={`mt-2 flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold ${
                  photoIa.status === "ok"
                    ? "bg-success-soft text-success"
                    : photoIa.status === "rejected"
                      ? "bg-danger/10 text-danger"
                      : photoIa.status === "checking"
                        ? "bg-cream text-text-secondary"
                        : "bg-warning-soft text-warning"
                }`}
              >
                {photoIa.status === "checking" ? (
                  <Loader2 className="w-4 h-4 shrink-0 animate-spin mt-px" />
                ) : photoIa.status === "ok" ? (
                  <Check className="w-4 h-4 shrink-0 mt-px" />
                ) : (
                  <Sparkles className="w-4 h-4 shrink-0 mt-px" />
                )}
                <span>{photoIa.label}</span>
              </div>
            )}
          </div>

          <button
            onClick={startReception}
            disabled={
              !photoCarton ||
              photoIa.status === "checking" ||
              photoIa.status === "rejected"
            }
            className="btn-primary w-full disabled:opacity-50"
          >
            {photoIa.status === "checking"
              ? "Vérification IA…"
              : photoIa.status === "rejected"
                ? "Reprenez la photo"
                : "Démarrer la réception"}
          </button>
        </section>
      )}

      {step === "scanning" && (
        <>
          <section className="px-5 mt-5">
            <button
              onClick={() => setScannerOpen(true)}
              className="w-full bg-primary text-white rounded-[20px] py-5 px-5 flex items-center justify-between shadow-card-lg press-card"
            >
              <span className="flex items-center gap-3">
                <span className="w-12 h-12 rounded-2xl bg-gold/20 text-gold flex items-center justify-center">
                  <ScanBarcode className="w-6 h-6" />
                </span>
                <span className="text-left">
                  <span className="block label-caps text-gold">SCANNER</span>
                  <span className="block font-bold">
                    Scanner un code-barres
                  </span>
                </span>
              </span>
              <PackagePlus className="w-5 h-5 text-gold" />
            </button>
          </section>

          <section className="px-5 mt-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-text-primary">
                {scans.length} ligne{scans.length > 1 ? "s" : ""} scannée
                {scans.length > 1 ? "s" : ""}
              </p>
              <p className="text-xs text-text-secondary">
                {totalUnits} unité{totalUnits > 1 ? "s" : ""} au total
              </p>
            </div>
            {scans.length === 0 ? (
              <div className="bg-cream border border-rule rounded-2xl p-6 text-center text-text-secondary text-sm">
                Aucun produit scanné. Scanne le premier code-barres.
              </div>
            ) : (
              <div className="space-y-2">
                {scans.map((row) => (
                  <motion.div
                    key={row.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white border border-rule rounded-xl p-3 flex items-center gap-3"
                  >
                    <span
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        row.source === "carton"
                          ? "bg-gold-soft text-primary-dark"
                          : "bg-cream text-primary"
                      }`}
                    >
                      {row.source === "carton" ? (
                        <Package className="w-4 h-4" />
                      ) : (
                        <PackageOpen className="w-4 h-4" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-text-primary truncate">
                        {row.produitNom}
                      </p>
                      <p className="text-[11px] text-text-tertiary font-mono">
                        {row.codeScanne}
                        {row.cartonInfo &&
                          ` · carton × ${row.cartonInfo.multiplier}`}
                      </p>
                    </div>
                    <span className="text-base font-extrabold text-primary tabular-nums">
                      +{row.quantite}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}
          </section>

          <div className="fixed bottom-0 inset-x-0 z-30 pb-safe pointer-events-none">
            <div className="sticky-action-inner pt-3 pb-3 pointer-events-auto">
              <button
                onClick={finalize}
                disabled={submitting}
                className={`w-full rounded-[22px] px-5 py-4 flex items-center justify-between shadow-card-lg disabled:opacity-50 transition-colors press-btn ${
                  scans.length === 0
                    ? "bg-warning text-white"
                    : "bg-primary text-white"
                }`}
              >
                <div className="text-left">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold">
                    {submitting
                      ? "Validation…"
                      : scans.length === 0
                        ? "Valider sans scan"
                        : "Valider la réception"}
                  </p>
                  <p className="text-[15px] font-extrabold mt-0.5">
                    {scans.length === 0
                      ? "Aucun produit · confirmation requise"
                      : `${scans.length} ligne${scans.length > 1 ? "s" : ""} · ${totalUnits} unité${totalUnits > 1 ? "s" : ""}`}
                  </p>
                </div>
                <span className="bg-white/15 backdrop-blur-sm rounded-full p-2.5">
                  <Check className="w-5 h-5" />
                </span>
              </button>
            </div>
          </div>
        </>
      )}

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={(code) => handleScanRef.current?.(code)}
      />
      {/* Scanner dédié au mode apprentissage carton — scan d'un produit
          interne pour identifier le carton inconnu via son EAN. */}
      <BarcodeScanner
        open={learnScannerOpen}
        onClose={() => setLearnScannerOpen(false)}
        onScan={(code) => void handleScanForLearnInternal(code)}
      />
      <PhotoCapture
        open={photoOpen}
        onClose={() => setPhotoOpen(false)}
        onCapture={(d) => {
          setPhotoCarton(d);
          void validatePhotoIa(d);
        }}
      />

      <ProductRecognitionModal
        open={recognitionOpen}
        fallbackQuantite={cartonQty}
        onClose={() => setRecognitionOpen(false)}
        onAccept={(rec) => void handleRecognitionAccept(rec)}
      />

      {/* UNKNOWN EAN — LEARNING WORKFLOW
          Cachée tant que le scanner interne est ouvert, sinon elle
          reste à z-70 par-dessus le scanner à z-60 → effet "scanner
          flouté avec modal toujours visible". Le state unknownEan
          reste set, donc dès que le scanner se ferme, le modal
          réapparaît automatiquement. */}
      {unknownEan && !learnScannerOpen && !recognitionOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Code-barres inconnu"
          className="fixed inset-0 z-[70] fixed-overlay flex items-end md:items-center justify-center"
        >
          <div className="bg-white w-full max-w-[460px] rounded-t-[28px] md:rounded-[28px] p-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] animate-slide-up max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-text-primary">
                Code inconnu
              </p>
              <button
                onClick={closeLearn}
                aria-label="Fermer"
                className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full press-icon active:bg-cream"
              >
                <X className="w-4 h-4 text-text-tertiary" />
              </button>
            </div>
            <p className="text-xs font-mono bg-cream rounded-xl px-3 py-2 text-text-primary">
              {unknownEan}
            </p>

            {learnMode === "select" && (
              <>
                <h3 className="text-lg font-bold text-text-primary mt-5">
                  <GlossaryTerm
                    term="Carton"
                    def="Emballage groupé contenant plusieurs unités du même produit."
                  />{" "}
                  ou unité ?
                </h3>
                <p className="text-sm text-text-secondary mt-1">
                  Si c&apos;est un carton, on va apprendre combien d&apos;unités
                  sont dedans pour la prochaine fois.
                </p>
                <div className="grid grid-cols-2 gap-3 mt-5">
                  <button
                    onClick={() => setLearnMode("carton-qty")}
                    className="bg-gold-soft text-primary-dark rounded-2xl py-5 flex flex-col items-center gap-2 press-card"
                  >
                    <Package className="w-6 h-6" />
                    <span className="font-bold">Carton</span>
                  </button>
                  <button
                    onClick={() => setLearnMode("search")}
                    className="bg-cream text-primary rounded-2xl py-5 flex flex-col items-center gap-2 press-card"
                  >
                    <PackageOpen className="w-6 h-6" />
                    <span className="font-bold">Unité</span>
                  </button>
                </div>
              </>
            )}

            {learnMode === "carton-qty" && (
              <>
                <h3 className="text-lg font-bold text-text-primary mt-5">
                  Combien d&apos;unités dans ce carton ?
                </h3>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={cartonQty || ""}
                  onChange={(e) =>
                    // Jamais de NaN dans le state (sinon le bouton se fige) ;
                    // clamp entier positif.
                    setCartonQty(
                      Math.max(
                        0,
                        Math.min(parseInt(e.target.value, 10) || 0, 9999),
                      ),
                    )
                  }
                  inputMode="numeric"
                  placeholder="ex : 12"
                  aria-label="Nombre d'unités dans le carton"
                  className="input-field mt-4 text-2xl font-bold text-center"
                  autoFocus
                />
                <button
                  onClick={() => {
                    if (cartonQty > 0) {
                      // We need a fake "produit" to attach: use the unknown EAN as carton EAN, then ask the user to pick the underlying produit.
                      setPendingProduitForCarton({
                        id: "_pending",
                        ean: unknownEan,
                        nom: "(à choisir)",
                        marque: null,
                        categorie: null,
                        sous_categorie: null,
                        image_url: null,
                        description: null,
                        requires_barcode_print: false,
                        est_traiteur: false,
                        created_at: "",
                        updated_at: "",
                      });
                      setLearnMode("carton-unit-scan");
                    }
                  }}
                  disabled={cartonQty <= 0}
                  className="btn-primary w-full mt-5 disabled:opacity-50"
                >
                  Suivant · choisir le produit
                </button>
                <div className="relative my-4 text-center">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-text-tertiary font-bold bg-white px-2 relative z-10">
                    ou
                  </span>
                  <span className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-rule z-0" />
                </div>
                <button
                  onClick={() => setRecognitionOpen(true)}
                  className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-primary-dark to-primary text-white rounded-2xl py-4 font-bold shadow-card-lg press-btn"
                >
                  <Sparkles className="w-5 h-5 text-gold" strokeWidth={2.4} />
                  Reconnaître automatiquement (IA)
                </button>
                <p className="text-[11px] text-text-tertiary text-center mt-2">
                  Claude vision identifie le produit à partir d&apos;une photo
                  de l&apos;étiquette.
                </p>
              </>
            )}

            {(learnMode === "search" || learnMode === "carton-unit-scan") && (
              <>
                <h3 className="text-lg font-bold text-text-primary mt-5">
                  {learnMode === "carton-unit-scan"
                    ? "Quel produit est dans le carton ?"
                    : "Quel produit ?"}
                </h3>
                {learnMode === "carton-unit-scan" && (
                  <button
                    onClick={() => setLearnScannerOpen(true)}
                    className="w-full mt-3 bg-primary text-white rounded-2xl py-3 inline-flex items-center justify-center gap-2 font-bold press-btn"
                  >
                    <ScanBarcode className="w-5 h-5" />
                    Scanner un produit interne
                  </button>
                )}
                <div className="relative mt-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Nom, marque, code…"
                    aria-label="Rechercher un produit par nom, marque ou code"
                    className="input-field !pl-10 !text-base"
                    autoFocus
                  />
                </div>
                <div className="mt-3 max-h-64 overflow-y-auto space-y-1">
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleLearnUnitFor(p)}
                      className="w-full flex items-center gap-3 p-2 min-h-[56px] rounded-xl active:bg-cream press-card text-left"
                    >
                      <ProductThumbnail
                        nom={p.nom}
                        categorie={p.categorie}
                        size={36}
                      />
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-bold text-text-primary truncate">
                          {p.nom}
                        </p>
                        <p className="text-xs text-text-tertiary">{p.marque}</p>
                      </div>
                    </button>
                  ))}
                  {searchQuery.length >= 2 && searchResults.length === 0 && (
                    <p className="text-xs text-text-tertiary text-center py-4">
                      Aucun résultat
                    </p>
                  )}
                </div>
              </>
            )}

            <button
              onClick={closeLearn}
              className="text-text-secondary text-sm font-semibold mt-4 mx-auto block"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </V2Shell>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label-caps text-text-tertiary block mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

function BdlCard({
  bdl,
  variant,
  onClick,
}: {
  bdl: BdlSummary;
  variant: "prevu" | "encours";
  onClick: () => void;
}) {
  const totalUnits = bdl.bons_de_livraison_lignes.reduce(
    (s, l) => s + l.quantite_attendue,
    0,
  );
  const recu = bdl.bons_de_livraison_lignes.reduce(
    (s, l) => s + Math.min(l.quantite_recue, l.quantite_attendue),
    0,
  );
  const nbProduits = bdl.bons_de_livraison_lignes.length;
  const pct = totalUnits > 0 ? (recu / totalUnits) * 100 : 0;
  return (
    <button
      onClick={onClick}
      className={`w-full bg-white border rounded-2xl p-4 flex flex-col gap-3 text-left press-card ${
        variant === "encours" ? "border-gold/40 shadow-card" : "border-rule"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
            variant === "encours"
              ? "bg-gold-soft text-primary-dark"
              : "bg-cream text-primary"
          }`}
        >
          {variant === "encours" ? (
            <PlayCircle className="w-5 h-5" />
          ) : (
            <Truck className="w-5 h-5" />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-text-tertiary">
            <GlossaryTerm
              term="BDL"
              def="Bon de Livraison : document du fournisseur listant la marchandise."
            />{" "}
            {bdl.numero_bdl}
          </p>
          <h3 className="text-[15px] font-extrabold text-text-primary truncate mt-0.5">
            {bdl.fournisseurs?.nom ?? "Fournisseur inconnu"}
          </h3>
          <p className="text-[11.5px] text-text-secondary mt-0.5">
            {nbProduits} produit{nbProduits > 1 ? "s" : ""} ·{" "}
            <b className="text-text-primary">{totalUnits} u.</b>{" "}
            <span className="bg-gold-soft text-primary-dark font-bold px-2 py-0.5 rounded-full ml-1 text-[10px] uppercase tracking-wide">
              {bdl.depots?.nom ?? "·"}
            </span>
          </p>
        </div>
        <ArrowRight className="w-4 h-4 text-text-tertiary mt-1 shrink-0" />
      </div>
      {variant === "encours" && (
        <div>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-[10.5px] font-bold uppercase tracking-wide text-text-tertiary">
              Progression
            </span>
            <span className="text-[12px] font-extrabold tabular text-text-primary">
              {recu}/{totalUnits}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-cream overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </button>
  );
}
