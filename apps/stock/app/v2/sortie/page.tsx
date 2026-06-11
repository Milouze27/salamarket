"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  Check,
  ClipboardEdit,
  Clock,
  HardHat,
  Search,
  ScanBarcode,
  ShieldAlert,
  Sparkles,
  TimerOff,
  UserX,
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
  createSortie,
  findProduitByEan,
  getStockProduitDepot,
  listEmployes,
  searchProduits,
} from "@/lib/db";
import type { Produit, SortieType } from "@/lib/types/db";

const TYPES: {
  value: SortieType;
  label: string;
  desc: string;
  icon: typeof Check;
}[] = [
  {
    value: "casse_manipulation",
    label: "Casse manip",
    desc: "Tombée pendant la manip",
    icon: HardHat,
  },
  {
    value: "casse_client",
    label: "Casse client",
    desc: "Cassée en magasin",
    icon: UserX,
  },
  {
    value: "perime_dlc",
    label: "Périmé DLC",
    desc: "Date limite consom.",
    icon: Clock,
  },
  {
    value: "perime_ddm",
    label: "Périmé DDM",
    desc: "Date durabilité min.",
    icon: TimerOff,
  },
  {
    value: "defaut_fournisseur",
    label: "Défaut fournisseur",
    desc: "Produit défectueux",
    icon: ShieldAlert,
  },
  {
    value: "demarque_inconnue",
    label: "Démarque inconnue",
    desc: "Écart sans cause",
    icon: AlertTriangle,
  },
  {
    value: "autre",
    label: "Autre motif",
    desc: "À préciser",
    icon: ClipboardEdit,
  },
];

export default function V2SortiePage() {
  const router = useRouter();
  const depot = useV2((s) => s.currentDepot);
  const employe = useV2((s) => s.currentEmploye);

  const [produit, setProduit] = useState<Produit | null>(null);
  // Stock disponible du produit dans le dépôt actif : affiché en contexte
  // et utilisé comme garde-fou (sortie > stock = stock négatif silencieux).
  // null = inconnu/chargement (on ne bloque pas tant qu'on ne sait pas).
  const [stockDispo, setStockDispo] = useState<number | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Produit[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  const [type, setType] = useState<SortieType | null>(null);
  const [motifLibre, setMotifLibre] = useState("");
  // String pour permettre le champ VIDE pendant la saisie (sinon impossible
  // d'effacer le "1" par défaut pour taper une autre quantité). Validé au submit.
  const [quantite, setQuantite] = useState<string>("1");
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** IDs des admins (Otmane + Ahmed) qui reçoivent les notifs push
   *  d'anomalie sortie. Récupéré dynamiquement au mount. */
  const [adminIds, setAdminIds] = useState<string[]>([]);

  useEffect(() => {
    void listEmployes()
      .then((emps) => {
        const admins = emps.filter(
          (e) =>
            e.role === "admin" || ["Otmane", "Ahmed"].includes(e.prenom ?? ""),
        );
        setAdminIds(admins.map((e) => e.id));
      })
      .catch((err) => {
        // Sans cette liste, les alertes push n'atteignent pas Otmane/Ahmed :
        // on loggue pour le diagnostic plutôt que d'échouer en silence.
        console.error("[sortie] chargement admins échoué:", err);
      });
  }, []);

  // Stock dispo du produit sélectionné dans le dépôt actif.
  useEffect(() => {
    if (!produit || !depot) {
      setStockDispo(null);
      return;
    }
    let annule = false;
    setStockDispo(null);
    void getStockProduitDepot(depot.id, produit.id)
      .then((q) => {
        if (!annule) setStockDispo(q);
      })
      .catch((err) => {
        console.error("[sortie] stock dispo indisponible:", err);
        if (!annule) setStockDispo(null);
      });
    return () => {
      annule = true;
    };
  }, [produit, depot]);

  const handleScanRef = useRef<((code: string) => void) | undefined>(undefined);
  const handleScan = async (code: string) => {
    setScannerOpen(false);
    try {
      const p = await findProduitByEan(code);
      if (p) {
        setProduit(p);
        toast.success(p.nom);
      } else {
        toast.warning("Code inconnu · recherche par nom");
        setShowSearch(true);
      }
    } catch (err) {
      console.error("[sortie] scan échoué:", err);
      toast.error("Erreur de scan · vérifie la connexion");
    }
  };
  handleScanRef.current = handleScan;

  useEffect(() => {
    if (!showSearch || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const r = await searchProduits(searchQuery);
        setSearchResults(r);
      } catch (err) {
        console.error("[sortie] recherche échouée:", err);
        toast.error("Recherche indisponible · vérifie la connexion");
        setSearchResults([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [searchQuery, showSearch]);

  async function submit() {
    if (!produit || !type || !photo) {
      toast.error("Remplissez tout : produit, type, photo");
      return;
    }
    if (!depot || !employe) {
      toast.error("Session perdue (dépôt/employé) — reconnecte-toi.");
      return;
    }
    // parseFloat (virgule FR → point) : une casse au poids se déclare en kg
    // (ex. 1,5 kg de viande périmée). parseInt tronquait à 1 → casse sous-évaluée.
    const qte = parseFloat(quantite.replace(",", "."));
    if (!Number.isFinite(qte) || qte <= 0) {
      toast.error("Quantité invalide");
      return;
    }
    if (type === "autre" && !motifLibre.trim()) {
      toast.error("Indiquez le motif libre");
      return;
    }
    // Décimales réservées aux produits vendus au poids. Une sortie de
    // 1,5 "Poulet entier" (unité) n'a pas de sens → on bloque.
    if (!produitAuPoids && !Number.isInteger(qte)) {
      toast.error("Ce produit se compte à l'unité : quantité entière requise");
      return;
    }
    // Garde-fou stock : une sortie > stock pousserait stock_par_depot en
    // négatif. On bloque quand on connaît le stock dispo.
    if (stockDispo !== null && qte > stockDispo) {
      toast.error(
        `Stock insuffisant : ${stockDispo} en stock, sortie de ${qte} refusée`,
      );
      return;
    }
    setSubmitting(true);
    try {
      // Contrôle IA de cohérence — fail-closed : tout échec (HTTP ou réseau)
      // force un score 0 + ia_unavailable ⇒ l'alerte admin se déclenche, une
      // casse ne passe jamais en silence.
      let iaScore: number | null = null;
      let iaNotes: string | null = null;
      let iaUnavailable = false;
      try {
        const r = await fetch("/api/vision-coherence", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            photo_data_url: photo,
            type,
            produit_nom: produit.nom,
            quantite: qte,
          }),
          // Timeout 15 s : un appel IA qui pend ne doit pas bloquer la
          // validation de la sortie (le catch fail-closed prend le relais).
          signal: AbortSignal.timeout(15000),
        });
        if (r.ok) {
          const j = (await r.json()) as {
            coherence_score: number;
            notes: string;
            ia_unavailable?: boolean;
          };
          iaScore = j.coherence_score;
          iaNotes = j.notes;
          iaUnavailable = j.ia_unavailable === true;
        } else {
          iaScore = 0;
          iaNotes = `Contrôle IA indisponible (erreur ${r.status}).`;
          iaUnavailable = true;
        }
      } catch (err) {
        console.warn("vision call failed", err);
        iaScore = 0;
        iaNotes =
          "Contrôle IA injoignable (réseau) — vérification humaine requise.";
        iaUnavailable = true;
      }

      const sortie = await createSortie({
        depot_id: depot.id,
        employe_id: employe.id,
        produit_id: produit.id,
        type,
        motif_libre: type === "autre" ? motifLibre : undefined,
        quantite: qte,
        photo_url: photo,
        ia_coherence_score: iaScore,
        ia_coherence_notes: iaNotes,
      });

      // Notify Otmane + Ahmed : score sous le seuil de revue admin (0.7) OU
      // IA indisponible (fail-closed). Le seuil 0.7 est aligné sur le filtre
      // de /v2/admin/alertes pour ne laisser aucune zone grise non notifiée.
      if (iaScore !== null && (iaScore < 0.7 || iaUnavailable)) {
        // 1. /api/notify (canal interne historique)
        // HOTFIX vague 7 : passer par server action qui injecte le secret.
        void import("@/lib/actions/notify")
          .then((m) =>
            m.sendInternalNotify({
              kind: "sortie_low_coherence",
              payload: {
                sortie_id: sortie.id,
                depot: depot.nom,
                employe: `${employe.prenom} ${employe.nom}`,
                produit: produit.nom,
                quantite: qte,
                type,
                ia_score: iaScore,
                ia_notes: iaNotes,
                ia_unavailable: iaUnavailable,
              },
            }),
          )
          .catch((e) => console.warn("[notify] fail:", e));

        // 2. Web Push lock-screen iPhone vers Otmane + Ahmed
        if (adminIds.length > 0) {
          const scorePct = Math.round(iaScore * 100);
          const title = iaUnavailable
            ? `⚠️ Sortie · contrôle IA indisponible`
            : `🚨 Sortie suspecte · IA ${scorePct}%`;
          void import("@/lib/actions/push-send")
            .then((m) =>
              m.sendPush({
                title,
                body: `${produit.nom} × ${quantite} (${type}) · ${depot.nom}${
                  iaNotes ? ` · ${iaNotes.slice(0, 80)}` : ""
                }`,
                url: `/v2/admin/alertes`,
                tag: `sortie-${sortie.id}`,
                urgent: !iaUnavailable && iaScore < 0.4,
                employe_ids: adminIds,
                alerte_id: sortie.id,
              }),
            )
            .catch((e) => console.warn("[push] fail:", e));
        }

        toast.warning(
          iaUnavailable
            ? `Contrôle IA indisponible · Otmane + Ahmed notifiés pour vérification.`
            : `Score IA ${(iaScore * 100).toFixed(0)}% · Otmane + Ahmed notifiés (push iPhone).`,
          { duration: 4500 },
        );
      } else if (iaScore !== null) {
        toast.success(
          `Sortie validée. Cohérence IA ${(iaScore * 100).toFixed(0)}%.`,
        );
      } else {
        toast.success("Sortie validée.");
      }
      router.replace("/v2");
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSubmitting(false);
    }
  }

  // unit_type='weight' (ou bracket) = produit vendu au poids → décimales OK.
  const produitAuPoids =
    produit?.unit_type === "weight" || produit?.unit_type === "weight_bracket";
  const qteParsed = parseFloat(quantite.replace(",", "."));
  const qteValide = Number.isFinite(qteParsed) && qteParsed > 0;
  const depasseStock =
    stockDispo !== null && qteValide && qteParsed > stockDispo;
  const decimaleInterdite =
    qteValide && !produitAuPoids && !Number.isInteger(qteParsed);

  const canSubmit =
    depot &&
    employe &&
    produit &&
    type &&
    photo &&
    qteValide &&
    !depasseStock &&
    !decimaleInterdite &&
    (type !== "autre" || motifLibre.trim().length > 0);

  return (
    <V2Shell hideNav>
      <PageAccentStripe accent="bordeaux" />
      <header className="px-5 pt-7">
        <BackButton />
        <EditorialEyebrow
          num="01"
          label="Déclarer une sortie"
          className="mt-3"
        />
        <h1 className="h1-display mt-3">
          Sortie de <span className="gold">stock</span>.
        </h1>
        <p className="body-md text-text-secondary mt-3 max-w-[40ch]">
          L&apos;IA Claude analyse la cohérence photo/déclaration pour Otmane.
        </p>
      </header>

      {/* PRODUIT */}
      <section className="px-5 mt-6">
        <p className="label-caps text-text-tertiary mb-2">Produit</p>
        {produit ? (
          <div className="bg-white border border-rule rounded-2xl p-4 flex items-center gap-3">
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
              <p className="text-xs text-text-tertiary truncate">
                {produit.marque} · {produit.ean ?? "sans EAN"}
              </p>
            </div>
            <button
              onClick={() => {
                setProduit(null);
                setShowSearch(false);
                setSearchQuery("");
              }}
              className="text-xs font-bold text-text-secondary min-h-[44px] min-w-[44px] px-3 -mr-2 shrink-0"
            >
              Changer
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              onClick={() => setScannerOpen(true)}
              className="w-full bg-primary text-white rounded-2xl py-4 flex items-center justify-center gap-2 press-card"
            >
              <ScanBarcode className="w-5 h-5" />
              <span className="font-bold">Scanner le produit</span>
            </button>
            {!showSearch ? (
              <button
                onClick={() => setShowSearch(true)}
                className="w-full bg-cream text-primary rounded-2xl py-3 min-h-[44px] flex items-center justify-center gap-2 text-sm font-bold border border-rule"
              >
                <Search className="w-4 h-4" />
                Rechercher par nom
              </button>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Nom, marque, code…"
                    aria-label="Rechercher un produit par nom, marque ou code"
                    inputMode="search"
                    autoComplete="off"
                    className="input-field !pl-10 !text-base"
                    autoFocus
                  />
                </div>
                <div className="space-y-1">
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setProduit(p);
                        setShowSearch(false);
                      }}
                      className="w-full flex items-center gap-3 p-2 min-h-[56px] rounded-xl active:bg-cream text-left"
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
                        <p className="text-xs text-text-tertiary truncate">
                          {p.marque}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* TYPE */}
      {produit && (
        <section className="px-5 mt-6">
          <p className="section-eyebrow mb-3">Motif de sortie</p>
          <div className="grid grid-cols-2 gap-2.5">
            {TYPES.map((t) => {
              const Icon = t.icon;
              const active = type === t.value;
              const fullWidth = t.value === "autre";
              return (
                <button
                  key={t.value}
                  onClick={() => setType(t.value)}
                  aria-pressed={active}
                  aria-label={`Motif : ${t.label} · ${t.desc}`}
                  className={`relative text-left rounded-2xl border transition-all duration-200 ease-out press-card ${
                    fullWidth ? "col-span-2 px-4 py-3" : "p-3"
                  } ${
                    active
                      ? "bg-danger-soft border-danger shadow-card"
                      : "bg-white border-rule"
                  }`}
                >
                  <div
                    className={fullWidth ? "flex items-center gap-3" : "block"}
                  >
                    <span
                      className={`inline-flex w-8 h-8 rounded-xl items-center justify-center shrink-0 transition-colors ${
                        fullWidth ? "" : "mb-2"
                      } ${
                        active
                          ? "bg-danger text-white"
                          : "bg-cream text-text-secondary"
                      }`}
                    >
                      <Icon className="w-4 h-4" strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0">
                      <p
                        className={`text-[13px] font-bold leading-tight ${
                          active ? "text-danger" : "text-text-primary"
                        }`}
                      >
                        {t.label}
                      </p>
                      <p
                        className={`text-[11px] mt-0.5 leading-tight ${
                          active ? "text-danger/75" : "text-text-tertiary"
                        }`}
                      >
                        {t.desc}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {type === "autre" && (
            <input
              value={motifLibre}
              onChange={(e) => setMotifLibre(e.target.value)}
              placeholder="Détaillez le motif…"
              aria-label="Motif libre de la sortie"
              autoComplete="off"
              className="input-field mt-3 !text-base"
              autoFocus
            />
          )}
        </section>
      )}

      {/* QUANTITÉ + PHOTO */}
      {produit && type && (
        <section className="px-5 mt-6 space-y-4">
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <label htmlFor="sortie-quantite">
                <span className="label-caps text-text-tertiary block">
                  Quantité{produitAuPoids ? " (kg)" : ""}
                </span>
              </label>
              {stockDispo !== null && (
                <span className="text-xs text-text-tertiary">
                  Stock dispo :{" "}
                  <span className="font-bold text-text-primary tabular-nums">
                    {stockDispo}
                  </span>
                </span>
              )}
            </div>
            <input
              id="sortie-quantite"
              type="number"
              min={produitAuPoids ? undefined : 1}
              max={stockDispo ?? undefined}
              step={produitAuPoids ? "any" : "1"}
              value={quantite}
              onChange={(e) => setQuantite(e.target.value)}
              onBlur={() => {
                // Clamp JS réel à [min, stockDispo] (EMP-06) : l'attribut max
                // natif n'empêche pas la saisie au clavier. On rabote à la
                // sortie du champ pour ne pas gêner la frappe, et on borne le
                // plancher (jamais 0 ni négatif).
                const v = parseFloat(quantite.replace(",", "."));
                if (!Number.isFinite(v)) return;
                let clamped = v;
                if (stockDispo !== null && clamped > stockDispo) {
                  clamped = stockDispo;
                }
                const plancher = produitAuPoids ? 0 : 1;
                if (clamped < plancher || clamped <= 0) {
                  clamped = produitAuPoids ? 0 : 1;
                }
                if (clamped !== v) {
                  setQuantite(String(clamped));
                  if (stockDispo !== null && v > stockDispo) {
                    toast.warning(
                      `Quantité ramenée au stock disponible (${stockDispo}).`,
                      { duration: 2500 },
                    );
                  }
                }
              }}
              aria-invalid={depasseStock || decimaleInterdite}
              inputMode={produitAuPoids ? "decimal" : "numeric"}
              className="input-field text-2xl font-bold text-center min-h-[56px]"
            />
            {depasseStock && (
              <p role="alert" className="text-[12px] font-bold text-danger mt-2">
                Stock insuffisant · {stockDispo} en stock seulement
              </p>
            )}
            {!depasseStock && decimaleInterdite && (
              <p role="alert" className="text-[12px] font-bold text-danger mt-2">
                Produit à l&apos;unité · quantité entière requise
              </p>
            )}
          </div>

          <div>
            <p className="label-caps text-text-tertiary mb-2">
              Photo preuve <span className="text-danger ml-1">*</span>
            </p>
            {photo ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  loading="lazy"
                  decoding="async"
                  src={photo}
                  alt="Preuve"
                  className="w-full h-44 object-cover rounded-2xl border border-rule"
                />
                <button
                  onClick={() => setPhotoOpen(true)}
                  className="absolute bottom-2 right-2 bg-white text-primary text-xs font-bold rounded-full px-4 py-2 min-h-[36px] shadow"
                >
                  Reprendre
                </button>
              </div>
            ) : (
              <button
                onClick={() => setPhotoOpen(true)}
                className="w-full bg-cream border-2 border-dashed border-danger/40 rounded-2xl py-8 flex flex-col items-center gap-2 text-danger"
              >
                <Camera className="w-6 h-6" />
                <span className="text-sm font-bold">Prendre la photo</span>
                <span className="text-xs text-text-secondary">
                  Sans photo, l&apos;IA refusera la sortie
                </span>
              </button>
            )}
          </div>

          <div className="bg-cream border border-rule rounded-2xl p-3 flex items-start gap-2 text-xs text-text-secondary">
            <Sparkles className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <p>
              À la validation, Claude vision analyse la photo et compare avec ta
              déclaration. Score &lt; 0,70 (ou IA indisponible) → Otmane est
              notifié pour révision manuelle.
            </p>
          </div>
        </section>
      )}

      <div className="fixed bottom-0 inset-x-0 z-30 pb-safe pointer-events-none">
        <div className="sticky-action-inner pt-3 pb-3 pointer-events-auto">
          <button
            onClick={submit}
            disabled={!canSubmit || submitting}
            className="w-full bg-danger text-white rounded-[22px] px-5 py-4 flex items-center justify-between shadow-card-lg disabled:opacity-50 press-btn"
          >
            <div className="text-left">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/85">
                {submitting ? "Validation…" : "Déclarer la sortie"}
              </p>
              <p className="text-[15px] font-extrabold mt-0.5">
                {produit
                  ? `${produit.nom.split(" ").slice(0, 4).join(" ")} · ${quantite}`
                  : "Choisir un produit"}
              </p>
            </div>
            <span className="bg-white/15 backdrop-blur-sm rounded-full p-2.5">
              {submitting ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <Check className="w-5 h-5" />
              )}
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
