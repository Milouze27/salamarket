"use client";

/**
 * /v2/reception/[id]/scan-first
 *
 * Refonte "scanner-first" de la page de réception BDL. Pensée pour
 * Sodrune (60-120 cartons/jour) : Otmane veut passer de 45 min à 15 min
 * sur une palette agneau. Workflow linéaire :
 *
 *   1. PRÉAMBULE (header sticky)
 *      ├─ Carte photo palette (2 obligatoires)
 *      ├─ Carte température (obligatoire, seuil 4 °C par défaut)
 *      └─ Bouton "Démarrer le scan"   → désactivé tant que blocs KO
 *
 *   2. SCAN (overlay full-screen, auto-loop)
 *      ├─ Bandeau feedback OK/WARN/MISS en haut
 *      ├─ Compteur progression sticky
 *      └─ Stack 5 derniers bips en bas
 *
 *   3. SIGN-OFF (modal bottom-sheet)
 *      ├─ Récap conditions (température, photos, écart €)
 *      ├─ Push iPhone Otmane si écart > 2 %
 *      └─ Bouton "Valider la réception"
 *
 *   4. POST-VALIDATION
 *      └─ Lien BR PDF v2 (avec section écart + QR lots)
 *
 * NE remplace PAS la page legacy `/v2/reception/[id]/page.tsx`. Les
 * deux coexistent : la nav peut router vers l'une ou l'autre selon
 * la préférence opérateur ou le type de BDL (Sodrune scan-first,
 * petits BDL en saisie manuelle).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  ImagePlus,
  Loader2,
  PackageCheck,
  ScanBarcode,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { PhotoCapture } from "@/components/reception/PhotoCapture";
import {
  ScannerOverlay,
  type ScanFeedback,
} from "@/components/reception/scanner-overlay";
import { TemperatureInput } from "@/components/reception/temperature-input";
import { SignOffModal } from "@/components/reception/sign-off-modal";
import {
  ConfirmDialog,
  useConfirmDialog,
} from "@/components/v2/reception/ConfirmDialog";
import { useV2 } from "@/lib/v2-store";
import { supabase } from "@/lib/supabase";
import { certifAlerte } from "@/lib/types/po";

interface BdlLigne {
  id: string;
  produit_id: string | null;
  code_barre_attendu: string | null;
  quantite_attendue: number;
  quantite_recue: number;
  nb_cartons_scannes: number;
  prix_achat_ht: number | null;
  ecart_qte: number | null;
  lot_id: string | null;
  statut: "attendu" | "recu" | "manquant" | "surplus";
  produits?: { id: string; nom: string; ean: string | null } | null;
}

interface BdlDetail {
  id: string;
  numero_bdl: string;
  numero_bdl_fournisseur: string | null;
  fournisseur_id: string | null;
  depot_destination_id: string | null;
  date_livraison_prevue: string;
  statut: "prevue" | "en_cours" | "receptionnee" | "litige";
  photo_palette_url_1: string | null;
  photo_palette_url_2: string | null;
  photo_bdl_url: string | null;
  temperature_reception_c: number | null;
  temperature_seuil_max_c: number | null;
  ecart_valeur_eur: number | null;
  fournisseurs: {
    id: string;
    nom: string;
    certif_organisme: string | null;
    certif_numero: string | null;
    certif_expire_le: string | null;
    actif: boolean | null;
  } | null;
  depots: { id: string; nom: string } | null;
  bons_de_livraison_lignes: BdlLigne[];
}

export default function BdlScanFirstPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const bdlId = params?.id;
  const employe = useV2((s) => s.currentEmploye);

  const [bdl, setBdl] = useState<BdlDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoSlot, setPhotoSlot] = useState<1 | 2 | 3 | null>(null);
  const [signOffOpen, setSignOffOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState<{
    pdf_url: string;
    push_sent: boolean;
    prix_changes: Array<{
      produit: string;
      ancien_cout: number;
      nouveau_cout: number;
      variation_pct: number;
    }>;
  } | null>(null);
  // ML-5 — le comptable doit acquitter explicitement un certif halal
  // expiré/manquant du fournisseur avant de pouvoir clôturer la réception.
  const [certifAck, setCertifAck] = useState(false);

  // Dialog de confirmation maison (remplace window.confirm natif — EMP-07).
  const {
    request: confirmRequest,
    confirm,
    onConfirm: onConfirmDialog,
    onCancel: onCancelDialog,
  } = useConfirmDialog();

  // Buffer température : on n'écrit en DB qu'au blur (évite 10 updates/sec)
  const tempDebounceRef = useRef<number | null>(null);

  // ─── Load BDL ─────────────────────────────────────────────────
  const fetchBdl = useCallback(async () => {
    if (!bdlId) return;
    const sb = supabase();
    if (!sb) {
      toast.error("Supabase indisponible");
      setLoading(false);
      return;
    }
    const { data, error } = await sb
      .from("bons_de_livraison")
      .select(
        `id, numero_bdl, numero_bdl_fournisseur, fournisseur_id, depot_destination_id,
         date_livraison_prevue, statut,
         photo_palette_url_1, photo_palette_url_2, photo_bdl_url,
         temperature_reception_c, temperature_seuil_max_c, ecart_valeur_eur,
         fournisseurs (id, nom, certif_organisme, certif_numero, certif_expire_le, actif),
         depots (id, nom),
         bons_de_livraison_lignes (
           id, produit_id, code_barre_attendu, quantite_attendue, quantite_recue,
           nb_cartons_scannes, prix_achat_ht, ecart_qte, lot_id, statut,
           produits (id, nom, ean)
         )`,
      )
      .eq("id", bdlId)
      .single();
    if (error || !data) {
      console.error(error);
      toast.error("BDL introuvable");
      setLoading(false);
      return;
    }
    setBdl(data as unknown as BdlDetail);
    setLoading(false);
  }, [bdlId]);

  useEffect(() => {
    void fetchBdl();
  }, [fetchBdl]);

  // ─── Persiste la température (debounce 500 ms) ────────────────
  function setTemperature(v: number | null) {
    setBdl((cur) => (cur ? { ...cur, temperature_reception_c: v } : cur));
    if (tempDebounceRef.current !== null) {
      window.clearTimeout(tempDebounceRef.current);
    }
    tempDebounceRef.current = window.setTimeout(() => {
      void persistTemperature(v);
    }, 500);
  }

  async function persistTemperature(v: number | null) {
    if (!bdlId) return;
    const sb = supabase();
    if (!sb) return;
    const { error } = await sb
      .from("bons_de_livraison")
      .update({ temperature_reception_c: v })
      .eq("id", bdlId);
    if (error) {
      toast.error("Erreur température : " + error.message);
    }
  }

  // ─── KPI dérivés ──────────────────────────────────────────────
  const progression = useMemo(() => {
    if (!bdl) return { scanned: 0, total: 0 };
    const total = bdl.bons_de_livraison_lignes.reduce(
      (s, l) => s + l.quantite_attendue,
      0,
    );
    const scanned = bdl.bons_de_livraison_lignes.reduce(
      (s, l) => s + Math.min(l.quantite_recue, l.quantite_attendue),
      0,
    );
    return { scanned, total };
  }, [bdl]);

  const ecartLignes = useMemo(() => {
    if (!bdl) return [];
    return bdl.bons_de_livraison_lignes
      .filter((l) => (l.ecart_qte ?? 0) !== 0)
      .map((l) => ({
        produit_nom: l.produits?.nom ?? "Produit",
        attendu: l.quantite_attendue,
        recu: l.quantite_recue,
        ecart_qte: l.ecart_qte ?? l.quantite_recue - l.quantite_attendue,
        ecart_eur:
          (l.ecart_qte ?? l.quantite_recue - l.quantite_attendue) *
          (l.prix_achat_ht ?? 0),
      }));
  }, [bdl]);

  const valeurAttendueEur = useMemo(() => {
    if (!bdl) return 0;
    return bdl.bons_de_livraison_lignes.reduce(
      (s, l) => s + l.quantite_attendue * (l.prix_achat_ht ?? 0),
      0,
    );
  }, [bdl]);

  const seuilTemp = bdl?.temperature_seuil_max_c ?? 4;
  const tempOk =
    bdl?.temperature_reception_c !== null &&
    bdl?.temperature_reception_c !== undefined &&
    bdl.temperature_reception_c <= seuilTemp;
  const photosOk = Boolean(
    bdl?.photo_palette_url_1 && bdl?.photo_palette_url_2,
  );
  const preambleOk = tempOk && photosOk;

  // ─── ML-5 — Certif halal du fournisseur du BDL ────────────────
  // "expiree" / "manquante" → bloquant : on ne réceptionne pas une
  // marchandise dont la certif halal n'est plus à jour sans que le
  // comptable le reconnaisse explicitement (traçabilité du risque).
  const certifEtat = certifAlerte(bdl?.fournisseurs?.certif_expire_le);
  const certifBloquant = certifEtat === "expiree" || certifEtat === "manquante";
  const certifExpireLe = bdl?.fournisseurs?.certif_expire_le ?? null;

  // ─── Scan handler — délégué au serveur ────────────────────────
  const handleScan = useCallback(
    async (code: string): Promise<ScanFeedback> => {
      const ts = Date.now();
      if (!bdlId) {
        return { kind: "miss", code, label: "BDL non chargé", ts };
      }
      // Un appel scan, avec re-essai optionnel forcé au-delà du plafond
      // 150 % (ML-10). Le serveur renvoie kind:"blocked" sans rien écrire ;
      // on demande alors confirmation EXPLICITE au staff avant de renvoyer
      // confirm_over:true. Refus = no-op (le sur-comptage n'est pas écrit).
      const callScan = (confirmOver: boolean) =>
        fetch("/api/bdl/scan-carton", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            bdl_id: bdlId,
            ean: code,
            employe_id: employe?.id ?? null,
            ...(confirmOver ? { confirm_over: true } : {}),
          }),
        });
      try {
        let r = await callScan(false);
        let data = (await r.json()) as {
          kind: "ok" | "warn" | "miss" | "surplus" | "unknown" | "blocked";
          label: string;
          sub?: string;
          requires_confirm?: boolean;
          quantite_si_confirme?: number;
          quantite_attendue?: number;
        };

        if (data.kind === "blocked") {
          const attendu = data.quantite_attendue ?? "?";
          const siConfirme = data.quantite_si_confirme ?? "?";
          const ok = await confirm({
            title: "Sur-comptage détecté (>150 %)",
            message:
              `${data.label}\n` +
              `Confirmer ${siConfirme}/${attendu} reçus ? ` +
              `Annule si c'est un double scan.`,
            confirmLabel: `Confirmer ${siConfirme}/${attendu}`,
            cancelLabel: "Annuler (double scan)",
          });
          if (!ok) {
            return {
              kind: "warn",
              code,
              label: "Scan ignoré (sur-comptage)",
              sub: data.sub,
              ts,
            };
          }
          r = await callScan(true);
          data = (await r.json()) as typeof data;
        }

        // Re-pull en arrière-plan (n'attend pas pour ne pas freezer le scan)
        setRefreshing(true);
        void fetchBdl().finally(() => setRefreshing(false));
        const kind: "ok" | "warn" | "miss" =
          data.kind === "ok"
            ? "ok"
            : data.kind === "warn" ||
                data.kind === "surplus" ||
                data.kind === "blocked"
              ? "warn"
              : "miss";
        return {
          kind,
          code,
          label: data.label ?? "Scan traité",
          sub: data.sub,
          ts,
        };
      } catch (e) {
        return {
          kind: "miss",
          code,
          label: "Erreur réseau",
          sub: e instanceof Error ? e.message : "Vérifie la connexion",
          ts,
        };
      }
    },
    [bdlId, employe?.id, fetchBdl, confirm],
  );

  // ─── Photo capture ────────────────────────────────────────────
  async function handlePhotoCapture(dataUrl: string) {
    if (!bdl || photoSlot === null) return;
    const sb = supabase();
    if (!sb) return;
    const field =
      photoSlot === 1
        ? "photo_palette_url_1"
        : photoSlot === 2
          ? "photo_palette_url_2"
          : "photo_bdl_url";
    const { error } = await sb
      .from("bons_de_livraison")
      .update({ [field]: dataUrl })
      .eq("id", bdl.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      photoSlot === 3 ? "Photo BDL papier OK" : `Palette ${photoSlot} OK`,
    );
    setPhotoOpen(false);
    setPhotoSlot(null);
    void fetchBdl();
  }

  // ─── Finalize : POST serveur ──────────────────────────────────
  async function handleFinalize() {
    if (!bdl) return;
    setSubmitting(true);
    try {
      const r = await fetch("/api/bdl/finalize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bdl_id: bdl.id,
          employe_id: employe?.id ?? null,
        }),
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as {
          error?: string;
          blockers?: string[];
        };
        const msg = err.blockers
          ? `Bloquants : ${err.blockers.join(", ")}`
          : (err.error ?? "Erreur validation");
        toast.error(msg, { duration: 4500 });
        return;
      }
      const data = (await r.json()) as {
        pdf_url: string;
        push_sent: boolean;
        ecart_valeur_eur: number;
        prix_changes?: Array<{
          produit: string;
          ancien_cout: number;
          nouveau_cout: number;
          variation_pct: number;
        }>;
      };
      setFinalizeResult({
        pdf_url: data.pdf_url,
        push_sent: data.push_sent,
        prix_changes: data.prix_changes ?? [],
      });
      toast.success(
        data.push_sent
          ? "Réception validée — push Otmane envoyée"
          : "Réception validée — BR PDF prêt",
      );
      setSignOffOpen(false);
      void fetchBdl();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────
  if (loading) {
    return (
      <V2Shell hideNav>
        <div className="px-5 pt-10 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
          <p className="text-sm text-text-secondary">Chargement BDL…</p>
        </div>
      </V2Shell>
    );
  }

  if (!bdl) {
    return (
      <V2Shell hideNav>
        <div className="px-5 pt-10 text-center">
          <p className="text-sm text-text-secondary">BDL introuvable.</p>
          <button
            onClick={() => router.replace("/v2/reception")}
            className="mt-4 inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-2xl font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>
        </div>
      </V2Shell>
    );
  }

  const fournisseurNom = bdl.fournisseurs?.nom ?? "Fournisseur";
  const isClos = bdl.statut === "receptionnee";

  return (
    <V2Shell hideNav>
      <PageAccentStripe accent="sapin" />

      {/* ─── HEADER STICKY ─────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-cream border-b border-rule">
        <div className="px-5 pt-4 pb-3">
          <BackButton href="/v2/reception" />
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="label-caps text-primary">
                Scan-first · {fournisseurNom}
              </p>
              <h1 className="text-[22px] font-extrabold text-text-primary mt-0.5 truncate">
                {bdl.numero_bdl}
              </h1>
              <p className="text-[12px] text-text-secondary mt-0.5">
                Livraison <b>{bdl.depots?.nom ?? "—"}</b> ·{" "}
                {new Date(bdl.date_livraison_prevue).toLocaleDateString(
                  "fr-FR",
                  {
                    day: "2-digit",
                    month: "long",
                  },
                )}
              </p>
            </div>
            <span
              className={`text-[10.5px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full shrink-0 whitespace-nowrap ${
                isClos
                  ? "bg-success-soft text-success"
                  : bdl.statut === "en_cours"
                    ? "bg-gold-soft text-primary-dark"
                    : bdl.statut === "litige"
                      ? "bg-danger-soft text-danger"
                      : "bg-cream text-text-tertiary"
              }`}
            >
              {isClos
                ? "Réceptionnée"
                : bdl.statut === "en_cours"
                  ? "En cours"
                  : bdl.statut === "litige"
                    ? "Litige"
                    : "Prévue"}
            </span>
          </div>

          {/* Progression compacte */}
          <div className="mt-3">
            <div className="flex items-baseline justify-between mb-1">
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-text-tertiary">
                Progression
                {refreshing && (
                  <Loader2
                    className="w-3 h-3 animate-spin text-text-tertiary"
                    aria-label="Mise à jour…"
                  />
                )}
              </span>
              <span className="text-[13px] font-extrabold tabular text-text-primary">
                {progression.scanned} / {progression.total} unités ·{" "}
                {bdl.bons_de_livraison_lignes.length} réf.
              </span>
            </div>
            <div className="h-2 rounded-full bg-cream overflow-hidden border border-rule">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{
                  width: `${
                    progression.total > 0
                      ? (progression.scanned / progression.total) * 100
                      : 0
                  }%`,
                }}
                transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* ─── PRÉAMBULE : photos + température ─────────────────── */}
      <section className="px-5 mt-4 pb-[200px]">
        {!isClos && (
          <>
            <p className="label-caps text-text-tertiary mb-2">
              Préambule obligatoire
            </p>
            <div className="space-y-3">
              {/* PHOTOS PALETTE — carte sémantique success une fois OK, verre sinon */}
              <div
                className={`rise-in p-4 transition-colors ${
                  photosOk
                    ? "rounded-2xl border-2 border-success/40 bg-success-soft"
                    : "lg"
                }`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <span
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                      photosOk
                        ? "bg-white border-success/40"
                        : "bg-[var(--surface-2)] border-rule"
                    }`}
                  >
                    <ImagePlus
                      className={`w-5 h-5 ${
                        photosOk ? "text-success" : "text-text-tertiary"
                      }`}
                    />
                  </span>
                  <div className="flex-1">
                    <p className="label-caps text-text-tertiary">
                      Photos palette
                    </p>
                    <p
                      className={`text-[12px] font-semibold mt-0.5 ${
                        photosOk ? "text-success" : "text-text-secondary"
                      }`}
                    >
                      {photosOk
                        ? "2 photos enregistrées — protection litige active"
                        : "2 vues obligatoires avant validation"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {[1, 2].map((slot) => {
                    const url =
                      slot === 1
                        ? bdl.photo_palette_url_1
                        : bdl.photo_palette_url_2;
                    return (
                      <button
                        key={slot}
                        onClick={() => {
                          setPhotoSlot(slot as 1 | 2);
                          setPhotoOpen(true);
                        }}
                        className="relative aspect-[4/3] rounded-2xl border-2 border-dashed border-primary/30 overflow-hidden bg-cream active:scale-95 transition-transform"
                      >
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            loading="lazy"
                            decoding="async"
                            src={url}
                            alt={`Palette ${slot}`}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-primary gap-1">
                            <ImagePlus className="w-5 h-5" />
                            <span className="text-[11px] font-bold">
                              Photo côté {slot}
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* TEMPÉRATURE */}
              <TemperatureInput
                value={bdl.temperature_reception_c}
                seuilMax={seuilTemp}
                onChange={setTemperature}
                locked={isClos}
              />
            </div>

            <p className="label-caps text-text-tertiary mt-6 mb-2">
              Lignes attendues ({bdl.bons_de_livraison_lignes.length})
            </p>
          </>
        )}

        {/* Liste compacte des lignes — verre, cascade, 2 colonnes sur desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
          {bdl.bons_de_livraison_lignes.map((l, i) => {
            const ecart = l.ecart_qte ?? l.quantite_recue - l.quantite_attendue;
            const isRecu =
              l.quantite_recue >= l.quantite_attendue && ecart === 0;
            const isSurplus = ecart > 0;
            const isManquant = l.quantite_recue < l.quantite_attendue;
            return (
              <div
                key={l.id}
                style={{ ["--i" as string]: i }}
                className={`lg rise-in p-3 flex items-center gap-3 ${
                  isRecu
                    ? "border-success/40"
                    : isSurplus
                      ? "border-warning/40"
                      : ""
                }`}
              >
                <span
                  className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                    isRecu
                      ? "bg-success-soft text-success"
                      : isSurplus
                        ? "bg-warning-soft text-warning"
                        : "bg-cream text-text-tertiary"
                  }`}
                >
                  {isRecu ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : isSurplus ? (
                    <AlertTriangle className="w-5 h-5" />
                  ) : (
                    <ScanBarcode className="w-5 h-5" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-bold text-text-primary truncate">
                    {l.produits?.nom ?? "Produit (sans nom)"}
                  </p>
                  <p className="text-[11px] text-text-tertiary mono mt-0.5 truncate">
                    {l.code_barre_attendu ?? l.produits?.ean ?? "—"}
                    {l.nb_cartons_scannes > 0 && (
                      <span className="ml-2 text-primary font-semibold">
                        · {l.nb_cartons_scannes} carton
                        {l.nb_cartons_scannes > 1 ? "s" : ""}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={`text-[14px] font-extrabold tabular ${
                      isRecu
                        ? "text-success"
                        : isSurplus
                          ? "text-warning"
                          : "text-text-primary"
                    }`}
                  >
                    {l.quantite_recue} / {l.quantite_attendue}
                  </p>
                  {ecart !== 0 && (
                    <p
                      className={`text-[10.5px] uppercase font-bold tracking-wide mt-0.5 ${
                        isSurplus ? "text-warning" : "text-danger"
                      }`}
                    >
                      {ecart > 0 ? "+" : ""}
                      {ecart}
                    </p>
                  )}
                  {ecart === 0 && isManquant && (
                    <p className="text-[10.5px] uppercase font-bold tracking-wide mt-0.5 text-text-tertiary">
                      À scanner
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── ACTIONS FLOTTANTES ───────────────────────────────── */}
      <div className="fixed bottom-0 inset-x-0 z-30 pb-safe pointer-events-none">
        <div className="mx-auto max-w-[460px] px-4 pt-3 pb-3 pointer-events-auto space-y-2.5">
          {/* ML-5 — Avertissement BLOQUANT certif halal fournisseur.
              Tant que le comptable n'a pas acquitté, la finalisation est
              désactivée. La marchandise est comptée physiquement, mais le
              risque halal est tracé et reconnu explicitement. */}
          {!isClos && certifBloquant && (
            <div className="bg-danger-soft border border-danger/50 rounded-2xl px-4 py-3 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="w-5 h-5 text-danger mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-danger">
                    {certifEtat === "expiree"
                      ? "Certificat halal expiré"
                      : "Certificat halal manquant"}
                  </p>
                  <p className="text-[12.5px] font-semibold leading-snug text-text-primary mt-0.5">
                    {bdl?.fournisseurs?.nom ?? "Ce fournisseur"}
                    {certifEtat === "expiree" && certifExpireLe
                      ? ` — expiré le ${new Date(certifExpireLe).toLocaleDateString("fr-FR")}`
                      : ""}
                    . Réception à valider explicitement (risque halal tracé).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCertifAck((v) => !v)}
                className={`tap w-full rounded-2xl py-3 px-3 min-h-[44px] text-[12.5px] font-bold transition-colors ${
                  certifAck
                    ? "bg-danger text-white"
                    : "bg-white border border-danger/50 text-danger"
                }`}
              >
                {certifAck
                  ? "✓ Risque halal acquitté — réception déblocable"
                  : "J'acquitte le risque halal et autorise la réception"}
              </button>
            </div>
          )}
          {isClos ? (
            <>
              <a
                href={
                  finalizeResult?.pdf_url ??
                  `/api/bdl/bon-reception-pdf-v2?bdl_id=${bdl.id}`
                }
                target="_blank"
                rel="noopener"
                className="w-full bg-primary text-white rounded-[22px] py-4 px-5 flex items-center justify-between shadow-card-lg active:scale-[0.99]"
              >
                <span className="flex items-center gap-3">
                  <span className="w-11 h-11 rounded-2xl bg-gold/20 text-gold flex items-center justify-center">
                    <FileText className="w-5 h-5" />
                  </span>
                  <span className="text-left">
                    <span className="block label-caps text-gold">
                      BR PDF · SCAN-FIRST
                    </span>
                    <span className="block font-bold text-[15px]">
                      Télécharger le bon de réception
                    </span>
                  </span>
                </span>
                <Download className="w-5 h-5 text-gold" />
              </a>
              {finalizeResult && finalizeResult.prix_changes.length > 0 && (
                <div className="bg-gold/10 border border-gold/40 rounded-2xl px-4 py-3">
                  <p className="text-[12.5px] font-extrabold text-primary flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-gold" />
                    Prix d&apos;achat mis à jour (
                    {finalizeResult.prix_changes.length}) — vérifie ta marge
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {finalizeResult.prix_changes.map((c, i) => (
                      <li key={i} className="text-[12px] text-text-secondary">
                        <span className="font-bold text-text-primary">
                          {c.produit}
                        </span>{" "}
                        : coût {c.ancien_cout.toFixed(2)} €{" "}
                        <span className="font-bold">
                          → {c.nouveau_cout.toFixed(2)} €
                        </span>{" "}
                        <span
                          className="font-bold"
                          style={{
                            color:
                              c.variation_pct > 0
                                ? "var(--danger)"
                                : "var(--success)",
                          }}
                        >
                          ({c.variation_pct > 0 ? "+" : ""}
                          {c.variation_pct} %)
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-text-tertiary">
                    Le coût (PMP) est synchronisé. Si la marge a fondu, ajuste
                    le prix de vente dans le catalogue.
                  </p>
                </div>
              )}
              {finalizeResult?.push_sent && (
                <div className="bg-warning-soft border border-warning/40 rounded-2xl px-4 py-2.5 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                  <p className="text-[12px] text-warning font-semibold leading-snug">
                    Push iPhone Otmane envoyée — il peut accepter l&apos;écart
                    depuis son canapé.
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <button
                onClick={() => setScannerOpen(true)}
                disabled={!preambleOk}
                className="w-full bg-primary text-white rounded-[22px] py-4 px-5 flex items-center justify-between shadow-card-lg active:scale-[0.99] disabled:opacity-40 disabled:active:scale-100"
              >
                <span className="flex items-center gap-3">
                  <span className="w-11 h-11 rounded-2xl bg-gold/20 text-gold flex items-center justify-center">
                    <ScanBarcode className="w-6 h-6" />
                  </span>
                  <span className="text-left">
                    <span className="block label-caps text-gold">
                      SCAN CONTINU
                    </span>
                    <span className="block font-bold text-[15px]">
                      {preambleOk
                        ? "Démarrer le scan palette"
                        : "Termine le préambule pour scanner"}
                    </span>
                  </span>
                </span>
                <ScanBarcode className="w-5 h-5 text-gold" />
              </button>

              <button
                onClick={() => setSignOffOpen(true)}
                disabled={!preambleOk || (certifBloquant && !certifAck)}
                className={`tap w-full rounded-[20px] py-3.5 px-4 min-h-[44px] flex items-center justify-between transition-colors disabled:opacity-40 ${
                  preambleOk && !(certifBloquant && !certifAck)
                    ? progression.scanned > 0
                      ? "bg-success text-white shadow-card"
                      : "lg lg-hover text-text-primary"
                    : "lg text-text-tertiary"
                }`}
              >
                <span className="text-left">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.12em]">
                    Finaliser la réception
                  </span>
                  <span className="block text-[13px] font-extrabold mt-0.5">
                    {certifBloquant && !certifAck
                      ? "Acquitte le certif halal pour finaliser"
                      : `${progression.scanned}/${progression.total} unités · récap + push`}
                  </span>
                </span>
                <PackageCheck className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ─── OVERLAYS ─────────────────────────────────────────── */}
      <ScannerOverlay
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
        progression={progression}
        contextLabel={`${fournisseurNom} · ${bdl.numero_bdl}`}
      />

      <PhotoCapture
        open={photoOpen}
        onClose={() => {
          setPhotoOpen(false);
          setPhotoSlot(null);
        }}
        onCapture={(d) => void handlePhotoCapture(d)}
      />

      <SignOffModal
        open={signOffOpen}
        onClose={() => setSignOffOpen(false)}
        onConfirm={handleFinalize}
        submitting={submitting}
        fournisseurNom={fournisseurNom}
        numeroBdl={bdl.numero_bdl}
        temperature={bdl.temperature_reception_c}
        seuilMax={seuilTemp}
        photosOk={photosOk}
        progressionScanned={progression.scanned}
        progressionTotal={progression.total}
        ecartTotalEur={Number(bdl.ecart_valeur_eur ?? 0)}
        ecartValeurAttendueEur={valeurAttendueEur}
        ecartLignes={ecartLignes}
      />

      {/* Dialog de confirmation maison — remplace window.confirm (EMP-07) */}
      <ConfirmDialog
        request={confirmRequest}
        onConfirm={onConfirmDialog}
        onCancel={onCancelDialog}
      />
    </V2Shell>
  );
}
