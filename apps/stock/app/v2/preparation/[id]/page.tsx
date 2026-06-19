"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  Lock,
  PackageMinus,
  Pencil,
  Route,
  Scale,
  ScanBarcode,
  ShoppingBag,
  Snowflake,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { ProductThumbnail } from "@/components/v2/ProductThumbnail";
import {
  ClientTypeBadge,
  type ClientType,
} from "@/components/v2/ClientTypeBadge";
import { useV2 } from "@/lib/v2-store";
import { BarcodeScanner } from "@/components/reception/BarcodeScanner";
import { PhotoCapture } from "@/components/reception/PhotoCapture";
import {
  findProduitByEan,
  listCommandesDrive,
  listDepots,
  listLignesPourCommande,
  listProduitsInDepot,
  listProduitsNomsByIds,
  updateLignePreparation,
} from "@/lib/db";
import type {
  CommandeDrive,
  CommandeDriveLigne,
  Depot,
  Produit,
} from "@/lib/types/db";
import {
  computeEcartPct,
  determineEcartAction,
  type EcartAction,
} from "@salamarket/shared";
import {
  finalizePreparation,
  markLineWeighed,
} from "@/lib/staff/preparation-actions";
import { getEmployeUuid, getUserUuid } from "@/lib/staff/auth-fallback";
import { buildCommandePreteEmail, refCommande } from "../_logic";

interface EnrichedLigne extends CommandeDriveLigne {
  produit?: Produit;
  /** Saisie locale du poids pesé (kg) pour unit_type='weight'. */
  weighedKg?: string;
  /** Bracket choisi pour unit_type='weight_bracket' (index dans la liste). */
  weighedBracket?: number;
  /** Indicateur "ligne sauvegardée côté server action". */
  saved?: boolean;
  saving?: boolean;
}

const COLD_CATEGORIES = new Set([
  "Surgelés",
  "Frais",
  "Boucherie",
  "Charcuterie",
]);

// "autre" = bucket de secours pour toute zone inattendue (donnée corrompue
// ou nouvelle valeur non câblée). Sans lui, une ligne dont la zone n'est pas
// l'une des trois connues serait silencieusement invisible au préparateur.
type ZoneKey = "particulier" | "professionnel" | "traiteur" | "autre";

const ZONE_LABEL: Record<ZoneKey, string> = {
  particulier: "Zone Particulier",
  professionnel: "Zone Professionnel",
  traiteur: "Zone Traiteur",
  autre: "Autres produits",
};

/**
 * Parse un poids saisi au clavier FR. CRITIQUE : les balances/employés
 * tapent la virgule décimale ("2,50"), or `parseFloat("2,50")` renvoie 2.
 * On normalise la virgule en point AVANT parseFloat afin d'accepter
 * indifféremment "2,5" et "2.5" → 2.5 kg. Retourne NaN si non parsable.
 */
function parseWeightInput(val: string | number | null | undefined): number {
  if (val == null) return NaN;
  const normalized = String(val).trim().replace(",", ".");
  if (normalized === "") return NaN;
  return parseFloat(normalized);
}

/** Formate un poids en kg, virgule française, 2 décimales max. */
function formatKg(kg: number): string {
  return kg.toLocaleString("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  });
}

/** Formate un montant € à 2 décimales (virgule française). */
function formatEur(eur: number): string {
  return eur.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Libellé court de la conséquence métier d'un écart de pesée. */
const ECART_ACTION_LABEL: Record<EcartAction, string> = {
  auto_accept: "accepté",
  preparator_decision: "à confirmer",
  client_notify: "client informé",
  client_validation_required: "validation client",
};

export default function V2PreparationDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const employe = useV2((s) => s.currentEmploye);

  const [commande, setCommande] = useState<CommandeDrive | null>(null);
  const [lignes, setLignes] = useState<EnrichedLigne[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [missingPhotoFor, setMissingPhotoFor] = useState<string | null>(null);
  // Ligne tout juste scannée : déclenche un pop visuel persistant sur la
  // carte (au-delà du toast éphémère). On le remet à null après l'anim pour
  // ne pas rejouer le pop au re-render, mais l'état "prepare" lui reste.
  const [justScannedId, setJustScannedId] = useState<string | null>(null);

  useEffect(() => {
    if (!params?.id) return;
    void load(params.id);
  }, [params?.id]);

  async function load(id: string) {
    const [cmds, deps] = await Promise.all([
      listCommandesDrive(),
      listDepots(),
    ]);
    const cmd = cmds.find((c) => c.id === id) ?? null;
    setCommande(cmd);
    setDepots(deps);
    if (!cmd) return;
    const ls = await listLignesPourCommande(id);
    // Enrich with produits + sort: cold first, then by depot
    const allByDepot = new Map<
      string,
      Awaited<ReturnType<typeof listProduitsInDepot>>
    >();
    const depotIds = Array.from(new Set(ls.map((l) => l.depot_id)));
    // Parallèle (plus de cascade N+1 séquentielle) : les dépôts sont chargés
    // en une vague au lieu d'un aller-retour réseau l'un après l'autre.
    const stocks = await Promise.all(
      depotIds.map((dId) => listProduitsInDepot(dId)),
    );
    depotIds.forEach((dId, i) => allByDepot.set(dId, stocks[i]));
    // Filet EMP-04 : si un produit de la commande n'est pas (ou plus) dans le
    // stock du dépôt de la ligne, le join ci-dessus le rate → nom "Produit" +
    // vignette "?". On résout alors nom/catégorie directement par produit_id
    // pour que le préparateur sache toujours quoi collecter.
    const enrichedRaw: EnrichedLigne[] = ls.map((l) => {
      const stock = allByDepot.get(l.depot_id) ?? [];
      const p = stock.find((x) => x.id === l.produit_id);
      return { ...l, produit: p };
    });
    const missingIds = enrichedRaw
      .filter((l) => !l.produit && l.produit_id)
      .map((l) => l.produit_id);
    if (missingIds.length > 0) {
      const noms = await listProduitsNomsByIds(missingIds);
      for (const l of enrichedRaw) {
        if (!l.produit && l.produit_id) {
          const hit = noms.get(l.produit_id);
          if (hit) {
            l.produit = {
              id: l.produit_id,
              nom: hit.nom,
              categorie: hit.categorie,
            } as Produit;
          }
        }
      }
    }
    setLignes(enrichedRaw);
  }

  /** Group by zone_preparation (particulier / professionnel / traiteur),
   *  cold-chain products first within each zone. */
  const groupedByZone = useMemo(() => {
    const known = new Set<ZoneKey>([
      "particulier",
      "professionnel",
      "traiteur",
    ]);
    const order: ZoneKey[] = [
      "particulier",
      "professionnel",
      "traiteur",
      "autre",
    ];
    const buckets = new Map<ZoneKey, EnrichedLigne[]>();
    for (const l of lignes) {
      const raw = (l.zone_preparation as ZoneKey) ?? "particulier";
      // Toute zone hors des trois connues retombe dans "autre" — garantit
      // qu'aucune ligne n'est invisible au préparateur (bucket de secours).
      const zone: ZoneKey = known.has(raw) ? raw : "autre";
      const list = buckets.get(zone) ?? [];
      list.push(l);
      buckets.set(zone, list);
    }
    for (const list of buckets.values()) {
      list.sort((a, b) => {
        const aCold = COLD_CATEGORIES.has(a.produit?.categorie ?? "") ? 0 : 1;
        const bCold = COLD_CATEGORIES.has(b.produit?.categorie ?? "") ? 0 : 1;
        return aCold - bCold;
      });
    }
    return order
      .map((z) => ({ zone: z, items: buckets.get(z) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [lignes]);

  /** Ordre de picking conseillé, adapté aux familles réellement présentes
   *  dans la commande (chaîne du froid d'abord). On n'affiche que les
   *  étapes correspondant à des produits effectivement à préparer. */
  const pickingOrder = useMemo(() => {
    const hasCold = lignes.some((l) =>
      COLD_CATEGORIES.has(l.produit?.categorie ?? ""),
    );
    const hasTraiteur = lignes.some(
      (l) => (l.zone_preparation ?? "particulier") === "traiteur",
    );
    const hasSec = lignes.some(
      (l) =>
        !COLD_CATEGORIES.has(l.produit?.categorie ?? "") &&
        (l.zone_preparation ?? "particulier") !== "traiteur",
    );
    const steps: string[] = [];
    if (hasCold) steps.push("Frais/congelé d'abord (chaîne du froid)");
    if (hasSec) steps.push("puis sec");
    if (hasTraiteur) steps.push("puis traiteur");
    return steps;
  }, [lignes]);

  const handleScanRef = useRef<((c: string) => void) | undefined>(undefined);
  const handleScan = async (code: string) => {
    setScannerOpen(false);
    const p = await findProduitByEan(code);
    if (!p) {
      toast.error("Code inconnu");
      return;
    }
    const ligne = lignes.find(
      (l) => l.produit_id === p.id && l.statut_preparation === "en_attente",
    );
    if (!ligne) {
      toast.warning(
        `${p.nom} n'est pas (ou plus) à préparer pour cette commande.`,
      );
      return;
    }
    if (!employe) return;
    // FIX 2026-05-17 : employes.id ≠ profiles.id. Le zustand local
    // stocke un id non-UUID ("u-ahmed") ou un UUID profile. Pour la
    // FK prepare_par_employe_id → employes(id), on passe par
    // getEmployeUuid() qui fallback sur Ahmed Nasri.
    const employeUuid = getEmployeUuid(employe.id);
    try {
      await updateLignePreparation(ligne.id, {
        statut_preparation: "prepare",
        prepare_par_employe_id: employeUuid,
        prepare_at: new Date().toISOString(),
      });
    } catch (e) {
      // Ne pas afficher un faux succès : l'écriture DB a échoué.
      console.error("[prep] enregistrement ligne échoué:", e);
      toast.error("Échec de l'enregistrement · réessaie");
      return;
    }
    setLignes((prev) =>
      prev.map((l) =>
        l.id === ligne.id
          ? {
              ...l,
              statut_preparation: "prepare",
              prepare_par_employe_id: employeUuid,
              prepare_at: new Date().toISOString(),
            }
          : l,
      ),
    );
    // Feedback visuel PERSISTANT (au-delà du toast 1.8s) : la carte passe
    // en état "fait" net (CheckCircle + fond success-soft) et reçoit un pop
    // d'entrée. justScannedId ne sert qu'au pop ; l'état prepare persiste.
    setJustScannedId(ligne.id);
    setTimeout(() => {
      setJustScannedId((cur) => (cur === ligne.id ? null : cur));
    }, 600);
    toast.success(`${p.nom} préparé`);
  };
  handleScanRef.current = handleScan;

  async function markMissing(ligneId: string, photoUrl: string) {
    if (!employe) return;
    const employeUuid = getEmployeUuid(employe.id);
    try {
      await updateLignePreparation(ligneId, {
        statut_preparation: "manquant",
        prepare_par_employe_id: employeUuid,
        prepare_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error("[prep] marquage manquant échoué:", e);
      toast.error("Échec de l'enregistrement · réessaie");
      return;
    }
    setLignes((prev) =>
      prev.map((l) =>
        l.id === ligneId
          ? {
              ...l,
              statut_preparation: "manquant",
              prepare_par_employe_id: employeUuid,
              prepare_at: new Date().toISOString(),
            }
          : l,
      ),
    );
    toast.warning("Marqué manquant. Photo de l'étagère enregistrée.");
    void photoUrl;
  }

  // ─── Drive au poids — helpers pesée ────────────────────────────────
  /** Une ligne est "à peser" si son produit est weight ou weight_bracket. */
  function isWeightLine(l: EnrichedLigne): boolean {
    const ut = l.produit?.unit_type;
    return ut === "weight" || ut === "weight_bracket";
  }

  /** Calcule le montant_reel_ttc d'une ligne weight/bracket selon la
   *  saisie locale. Retourne null si saisie invalide. */
  function computeMontantReel(l: EnrichedLigne): number | null {
    const ut = l.produit?.unit_type ?? "unit";
    if (ut === "weight") {
      const kg = parseWeightInput(l.weighedKg);
      if (!Number.isFinite(kg) || kg <= 0) return null;
      const ppk = l.produit?.price_per_kg ?? 0;
      if (ppk <= 0) return null;
      return Math.round(ppk * kg * 100) / 100;
    }
    if (ut === "weight_bracket") {
      return Math.round((l.prix_unitaire ?? 0) * (l.quantite ?? 1) * 100) / 100;
    }
    return null;
  }

  /**
   * Montant TTC sûr d'une ligne pour la capture Stripe, à partir d'une valeur
   * candidate (réel/estimé déjà connu) éventuellement nulle.
   *
   * FIX capture : pour une ligne AU POIDS, `prix_unitaire` est un €/kg et
   * `quantite` un nombre de pièces — `prix_unitaire * quantite` donne donc un
   * montant aberrant (€/kg × pièces) qu'il ne faut JAMAIS capturer. On ne
   * tombe sur ce produit que pour les lignes À L'UNITÉ. Pour une ligne weight
   * sans montant connu (cas théorique, la garde notDone l'empêche), on retombe
   * sur 0 plutôt que sur un montant faux, pour ne jamais sur-débiter le client.
   */
  function safeMontantLigne(
    l: EnrichedLigne,
    candidate: number | null | undefined,
  ): number {
    if (candidate != null && Number.isFinite(candidate)) return candidate;
    if (isWeightLine(l)) return 0;
    return l.prix_unitaire * l.quantite;
  }

  async function saveWeightLigne(l: EnrichedLigne) {
    const montant = computeMontantReel(l);
    if (montant == null) {
      toast.error("Poids invalide");
      return;
    }
    const ut = l.produit?.unit_type ?? "unit";
    const quantiteReelle =
      ut === "weight"
        ? parseWeightInput(l.weighedKg)
        : (l.weighedBracket ?? 0) + 1;
    setLignes((prev) =>
      prev.map((x) => (x.id === l.id ? { ...x, saving: true } : x)),
    );
    const res = await markLineWeighed({
      line_id: l.id,
      quantite_reelle: quantiteReelle,
      montant_reel_ttc: montant,
      user_id: getUserUuid(employe?.id ?? null),
      employe_id: getEmployeUuid(employe?.id ?? null),
    });
    if (!res.ok) {
      toast.error(`Sauvegarde échouée : ${res.error}`);
      setLignes((prev) =>
        prev.map((x) => (x.id === l.id ? { ...x, saving: false } : x)),
      );
      return;
    }
    setLignes((prev) =>
      prev.map((x) =>
        x.id === l.id
          ? {
              ...x,
              saving: false,
              saved: true,
              statut_preparation: "prepare",
              quantite_reelle_pesee: quantiteReelle,
              montant_reel_ttc: montant,
            }
          : x,
      ),
    );
    toast.success("Pesée enregistrée");
  }

  async function finalize() {
    if (!commande) return;
    // Branche Drive au poids — si la commande a un PI Stripe pré-
    // autorisé, on capture via le server action AVANT de notifier.
    // Sinon (commandes legacy 100% unit), flow scan + notify classique.
    if (commande.statut_paiement === "autorise") {
      const notDone = lignes.filter(
        (l) =>
          l.statut_preparation === "en_attente" ||
          (isWeightLine(l) && !l.saved && l.quantite_reelle_pesee == null),
      );
      if (notDone.length > 0) {
        toast.error(
          `${notDone.length} ligne(s) pas encore pesée(s)/préparée(s)`,
        );
        return;
      }
      const res = await finalizePreparation({
        commande_id: commande.id,
        user_id: getUserUuid(employe?.id ?? null),
        lignes: lignes.map((l) => ({
          id: l.id,
          montant_estime_ttc: safeMontantLigne(l, l.montant_estime_ttc),
          montant_reel_ttc: safeMontantLigne(
            l,
            l.montant_reel_ttc ?? computeMontantReel(l) ?? l.montant_estime_ttc,
          ),
        })),
      });
      if (!res.ok) {
        toast.error(`Capture Stripe échouée : ${res.error}`);
        return;
      }
      const captured = res.montantCaptureTtc;
      const refCmd = refCommande(commande);
      toast.success(
        captured != null
          ? `${refCmd} : ${captured.toFixed(2)} € capturés via Stripe`
          : `${refCmd} : finalisée (capture Stripe non confirmée — vérifier dashboard)`,
      );
      router.replace("/v2/preparation");
      return;
    }
    // Flow legacy (sans Stripe pré-auto)
    const remaining = lignes.filter(
      (l) => l.statut_preparation === "en_attente",
    );
    if (remaining.length > 0) {
      toast.error(`${remaining.length} ligne(s) encore en attente`);
      return;
    }
    // Passage en "prêt" + DÉCRÉMENT DU STOCK. Le flux legacy ne faisait qu'un
    // UPDATE statut → les commandes à l'unité (épicerie sèche, canal n°1) ne
    // réduisaient JAMAIS le stock. markOrderReadyAndDecrement fait les deux
    // (décrément idempotent côté serveur).
    try {
      const { markOrderReadyAndDecrement } =
        await import("@/lib/staff/preparation-actions");
      const res = await markOrderReadyAndDecrement({
        commande_id: commande.id,
        user_id: getUserUuid(employe?.id ?? null),
      });
      if (!res.ok) throw new Error(res.error);
    } catch (e) {
      // Échec DB : ne pas notifier/emailer un "prêt" qui n'a pas eu lieu.
      console.error("[prep] passage en prêt échoué:", e);
      toast.error("Échec du passage en prêt · réessaie");
      return;
    }
    // HOTFIX vague 7 : server action injecte x-internal-secret.
    try {
      const { sendInternalNotify } = await import("@/lib/actions/notify");
      await sendInternalNotify({
        kind: "commande_prete",
        payload: {
          commande: commande.numero_commande,
          client: commande.client_nom,
          telephone: commande.client_telephone,
        },
      });
    } catch {
      /* fire-and-forget */
    }
    // Send "commande prête" email — fire-and-forget via server action
    // (passe l'INTERNAL_API_SECRET côté serveur, /api/email/send n'accepte
    //  plus de POST anonyme depuis le navigateur).
    if (commande.client_email) {
      const { sendOperationalEmail } = await import("@/lib/actions/email-send");
      sendOperationalEmail({
        to: commande.client_email,
        subject: "Votre commande Salamarket est prête !",
        html: buildCommandePreteEmail({
          id: commande.id,
          numero_commande: commande.numero_commande,
          client_nom: commande.client_nom,
        }),
      }).catch(() => {});
    }
    toast.success(`Commande ${refCommande(commande)} prête. Client notifié.`);
    router.replace("/v2/preparation");
  }

  const totalCount = lignes.length;
  // Une ligne weight est "préparée" si elle a été pesée (saved=true OU
  // quantite_reelle_pesee renseignée) ; pour les lignes unit, le critère
  // historique reste statut_preparation !== en_attente.
  const prepCount = lignes.filter((l) => {
    if (isWeightLine(l)) {
      return l.saved === true || l.quantite_reelle_pesee != null;
    }
    return l.statut_preparation !== "en_attente";
  }).length;
  const isStripeFlow = commande?.statut_paiement === "autorise";
  const sumReelEur = lignes.reduce((s, l) => {
    if (isWeightLine(l)) {
      // Avant pesée, on affiche l'ESTIMÉ (jamais prix_unitaire*quantite, qui
      // pour une ligne au poids serait €/kg × pièces — un montant aberrant).
      const m =
        l.montant_reel_ttc ?? computeMontantReel(l) ?? l.montant_estime_ttc ?? 0;
      return s + m;
    }
    return s + l.prix_unitaire * l.quantite;
  }, 0);

  if (!commande) {
    return (
      <V2Shell hideNav>
        <div className="px-5 pt-10 text-center text-text-secondary">
          Commande introuvable.
        </div>
      </V2Shell>
    );
  }

  return (
    <V2Shell hideNav>
      <header className="px-5 pt-7">
        <BackButton />
        <p className="label-caps text-primary mt-3">Préparation</p>
        <h1 className="h1 text-text-primary mt-1">{refCommande(commande)}</h1>
        <p className="body-md text-text-secondary mt-1">
          {commande.client_nom} · retrait à{" "}
          {formatHeure(commande.creneau_retrait)}
        </p>
      </header>

      <section className="px-5 mt-4">
        <button
          onClick={() => setScannerOpen(true)}
          className="tap w-full bg-primary text-white rounded-2xl py-4 flex items-center justify-center gap-2"
        >
          <ScanBarcode className="w-5 h-5" />
          <span className="font-bold">Scanner le produit collecté</span>
        </button>
      </section>

      {pickingOrder.length > 1 && (
        <section className="px-5 mt-4">
          <div className="lg rise-in flex items-start gap-2.5 rounded-2xl px-3.5 py-3">
            <span className="shrink-0 mt-0.5 text-primary" aria-hidden>
              <Route className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="label-caps text-text-tertiary">Ordre conseillé</p>
              <p className="text-[13px] leading-snug text-text-secondary mt-0.5">
                {pickingOrder.join(", ")}.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* pb-cta-only : la dernière ligne scrollable ne doit jamais passer
          sous le CTA fixe (cta-height + safe-bottom + respiration). hideNav
          ici => pas de nav-height à compter. */}
      <section className="px-5 mt-5 space-y-4 pb-cta-only">
        {groupedByZone.length === 0 && (
          <div className="lg rise-in rounded-2xl px-4 py-8 text-center">
            <p className="text-sm font-bold text-text-primary">
              Aucun produit à préparer
            </p>
            <p className="text-[13px] text-text-secondary mt-1">
              Cette commande ne contient aucune ligne.
            </p>
          </div>
        )}
        {groupedByZone.map((group) => (
          <div key={group.zone}>
            <p className="label-caps text-text-tertiary mb-2">
              {ZONE_LABEL[group.zone]} · {group.items.length} produit
              {group.items.length > 1 ? "s" : ""}
            </p>
            <div className="grid gap-2 lg:grid-cols-2 items-start">
              {group.items.map((l, i) => {
                const cold = COLD_CATEGORIES.has(l.produit?.categorie ?? "");
                const done = l.statut_preparation !== "en_attente";
                const prepared = l.statut_preparation === "prepare";
                const missing = l.statut_preparation === "manquant";
                const weight = isWeightLine(l);
                const justScanned = justScannedId === l.id;
                // État visuel persistant (sur base verre .lg, cohérent jour/nuit) :
                //  - préparé   => teinte success-soft + bordure success (net)
                //  - manquant  => verre estompé
                //  - en attente=> carte verre standard
                const cardState = prepared
                  ? "bg-success-soft border border-success"
                  : missing
                    ? "lg opacity-60"
                    : "lg lg-hover";
                return (
                  <motion.div
                    key={l.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={
                      // Pop d'entrée persistant après un scan réussi (~360ms,
                      // ease-out). framer-motion + MotionConfig reducedMotion
                      // ="user" neutralise le scale si l'OS le demande.
                      justScanned
                        ? { opacity: 1, y: 0, scale: [1, 1.03, 1] }
                        : { opacity: 1, y: 0 }
                    }
                    transition={
                      justScanned
                        ? { duration: 0.36, ease: [0.16, 1, 0.3, 1] }
                        : { delay: i * 0.03 }
                    }
                    className={`rounded-2xl p-3 transition-colors duration-300 ease-out ${
                      weight ? "flex flex-col gap-3" : "flex items-center gap-3"
                    } ${cardState}`}
                  >
                    <div className="flex items-center gap-3 w-full">
                      <ProductThumbnail
                        nom={l.produit?.nom ?? "Produit non référencé"}
                        categorie={l.produit?.categorie}
                        size={48}
                        rounded="xl"
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm font-bold truncate ${done ? "line-through" : ""} ${
                            l.produit?.nom ? "" : "text-text-tertiary italic"
                          }`}
                        >
                          {l.produit?.nom ??
                            `Produit non référencé — réf. ${l.produit_id.slice(0, 8)}`}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <ClientTypeBadge
                            size="sm"
                            type={
                              (l.produit?.client_type as
                                | ClientType
                                | undefined) ??
                              (l.zone_preparation === "professionnel"
                                ? "pro"
                                : l.zone_preparation === "traiteur"
                                  ? "traiteur"
                                  : "particulier")
                            }
                          />
                          <span className="text-[11px] text-text-tertiary inline-flex items-center gap-1">
                            Qté {l.quantite}
                            {cold && (
                              <span className="inline-flex items-center gap-0.5 text-text-secondary ml-1">
                                <Snowflake className="w-3 h-3" />
                                Frais
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                      {/* — Ligne UNIT : état "fait" persistant / manquant / action — */}
                      {!weight && l.statut_preparation === "prepare" && (
                        <span className="inline-flex shrink-0 items-center gap-1 text-success font-bold text-[12px]">
                          <CheckCircle2 className="w-5 h-5" aria-hidden />
                          Préparé
                        </span>
                      )}
                      {!weight && l.statut_preparation === "manquant" && (
                        <span className="badge badge-danger text-[10px]">
                          Manquant
                        </span>
                      )}
                      {!weight && l.statut_preparation === "en_attente" && (
                        <button
                          onClick={() => setMissingPhotoFor(l.id)}
                          className="tap min-h-[44px] text-xs font-bold text-danger px-3 py-1.5 rounded-xl bg-danger-soft inline-flex items-center gap-1"
                        >
                          <PackageMinus className="w-3.5 h-3.5" />
                          Manquant
                        </button>
                      )}
                    </div>
                    {/* — Ligne WEIGHT/BRACKET : pesée Stripe (pleine largeur) — */}
                    {weight && (
                      <WeightLineRow
                        ligne={l}
                        onChange={(patch) =>
                          setLignes((prev) =>
                            prev.map((x) =>
                              x.id === l.id ? { ...x, ...patch } : x,
                            ),
                          )
                        }
                        onSave={() => saveWeightLigne(l)}
                      />
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      {/* CTA fixe ancré AU-DESSUS du safe-area iPad (home-indicator/notch) :
          cta-above-safe => bottom: var(--safe-bottom). Sans ça le bouton
          était coupé sous le home-indicator en PWA plein écran. */}
      <div className="fixed cta-above-safe inset-x-0 z-30 pointer-events-none">
        <div className="mx-auto max-w-[680px] px-4 pt-3 pb-4 pointer-events-auto">
          <button
            onClick={finalize}
            disabled={totalCount === 0 || prepCount < totalCount}
            className="tap w-full bg-primary text-white rounded-[22px] px-5 py-4 flex items-center justify-between shadow-card-lg disabled:opacity-50"
          >
            <div className="text-left">
              <p
                className="text-[10px] font-bold uppercase tracking-[0.14em]"
                style={{ color: "var(--accent-gold-bright)" }}
              >
                {isStripeFlow ? "Finaliser & capturer" : "Marquer prêt"}
              </p>
              <p className="text-[15px] font-extrabold mt-0.5">
                {isStripeFlow
                  ? `${sumReelEur.toFixed(2)} €`
                  : `${prepCount}/${totalCount} préparés`}
              </p>
            </div>
            <span className="bg-white/15 backdrop-blur-sm rounded-full p-2.5">
              {isStripeFlow ? (
                <CreditCard className="w-5 h-5" />
              ) : (
                <ShoppingBag className="w-5 h-5" />
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
        open={!!missingPhotoFor}
        onClose={() => setMissingPhotoFor(null)}
        onCapture={(photo) => {
          if (missingPhotoFor) {
            void markMissing(missingPhotoFor, photo);
            setMissingPhotoFor(null);
          }
        }}
      />
    </V2Shell>
  );
}

// ─── Composant pesée drive au poids (palette V2) ─────────────────────
function WeightLineRow({
  ligne,
  onChange,
  onSave,
}: {
  ligne: EnrichedLigne;
  onChange: (patch: Partial<EnrichedLigne>) => void;
  onSave: () => Promise<void> | void;
}) {
  const ut = ligne.produit?.unit_type ?? "unit";
  const estimeTtc =
    ligne.montant_estime_ttc ?? ligne.prix_unitaire * ligne.quantite;
  // Poids estimé : on remonte le montant estimé au prix/kg pour l'afficher
  // (purement informatif, n'entre PAS dans le calcul de capture).
  const ppk = ligne.produit?.price_per_kg ?? 0;
  const estimeKg = ut === "weight" && ppk > 0 ? estimeTtc / ppk : null;
  const reelKg =
    ut === "weight"
      ? (() => {
          const kg = parseWeightInput(ligne.weighedKg);
          return Number.isFinite(kg) && kg > 0 ? kg : null;
        })()
      : null;
  const reelTtcLive =
    ut === "weight"
      ? reelKg != null && ppk > 0
        ? // Arrondi au centime : l'écart affiché (pct/action) doit refléter le
          // montant RÉELLEMENT capturé (capture-payment arrondit aussi au centime),
          // sinon le seuil de validation client peut diverger à la marge.
          Math.round(ppk * reelKg * 100) / 100
        : null
      : ut === "weight_bracket"
        ? ligne.prix_unitaire
        : null;
  const pct =
    reelTtcLive != null && estimeTtc > 0
      ? computeEcartPct(estimeTtc, reelTtcLive)
      : 0;
  const eurEcart =
    reelTtcLive != null ? Number((reelTtcLive - estimeTtc).toFixed(2)) : 0;
  const action: EcartAction | null =
    reelTtcLive != null ? determineEcartAction(pct, eurEcart) : null;
  const needsClientValidation = action === "client_validation_required";

  // Confirmation explicite de l'écart fort (> 20 %) par l'employé. Réinitialisé
  // dès que la saisie de poids change (cf. effet ci-dessous).
  const [confirmedHighEcart, setConfirmedHighEcart] = useState(false);
  // Retour haptique discret la 1re fois qu'un écart fort est détecté.
  const buzzedRef = useRef(false);
  useEffect(() => {
    if (needsClientValidation) {
      if (!buzzedRef.current) {
        buzzedRef.current = true;
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate([90, 40, 90]);
        }
      }
    } else {
      buzzedRef.current = false;
      if (confirmedHighEcart) setConfirmedHighEcart(false);
    }
  }, [needsClientValidation, confirmedHighEcart]);
  // Toute nouvelle saisie de poids invalide la confirmation précédente.
  useEffect(() => {
    setConfirmedHighEcart(false);
    buzzedRef.current = false;
  }, [ligne.weighedKg]);

  const ecartBadgeClass =
    action === "auto_accept"
      ? "bg-success-soft text-success"
      : action === "preparator_decision"
        ? "bg-gold-soft text-primary-dark"
        : action === "client_notify"
          ? "bg-warning-soft text-warning"
          : "bg-danger-soft text-danger";
  const ecartTextClass =
    action === "auto_accept"
      ? "text-success"
      : action === "preparator_decision"
        ? "text-primary-dark"
        : action === "client_notify"
          ? "text-warning"
          : "text-danger";

  const saveBlocked = needsClientValidation && !confirmedHighEcart;

  return (
    <div className="w-full flex flex-col gap-2.5">
      {/* — Saisie + estimé/réel côte à côte — */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        {/* Estimé vs réel en badges lisibles */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex flex-col rounded-xl border border-rule bg-cream px-2.5 py-1.5">
            <span className="text-[10px] uppercase tracking-wide text-text-tertiary">
              Estimé
            </span>
            <span className="text-[13px] font-bold tabular-nums text-text-secondary">
              {estimeKg != null
                ? `${formatKg(estimeKg)} kg`
                : `${formatEur(estimeTtc)} €`}
            </span>
          </span>
          {ut === "weight" && (
            <span className="inline-flex flex-col rounded-xl border border-rule bg-cream px-2.5 py-1.5">
              <span className="text-[10px] uppercase tracking-wide text-text-tertiary">
                Réel
              </span>
              <span className="text-[13px] font-bold tabular-nums text-text-primary">
                {reelKg != null ? `${formatKg(reelKg)} kg` : "· kg"}
              </span>
            </span>
          )}
          {/* Écart % coloré + libellé conséquence */}
          {action && (
            <span className="inline-flex flex-col">
              <span
                className={
                  "inline-flex items-center gap-1 text-[12px] font-extrabold tabular-nums px-2 py-1 rounded-full " +
                  ecartBadgeClass
                }
              >
                {pct >= 0 ? "+" : ""}
                {pct.toFixed(0)}%
              </span>
              <span
                className={
                  "text-[10px] font-semibold mt-0.5 text-center " +
                  ecartTextClass
                }
              >
                {ECART_ACTION_LABEL[action]}
              </span>
            </span>
          )}
        </div>

        {/* Champ saisie / bornes bracket */}
        {ut === "weight" && (
          <div className="flex items-center gap-1.5">
            <input
              // type="text" (pas "number") : un input number rejette la
              // virgule décimale FR selon la locale navigateur (iPad FR), ce
              // qui vidait silencieusement la saisie "2,50". En texte +
              // inputMode="decimal" on garde le pavé numérique iOS tout en
              // acceptant virgule ET point ; le parse FR est fait au calcul.
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={ligne.weighedKg ?? ""}
              onChange={(e) => {
                // On filtre pour ne garder que chiffres + un séparateur
                // décimal (virgule ou point), sans convertir : l'employé
                // voit exactement ce qu'il tape ("2,5"). La normalisation
                // virgule→point se fait à la lecture (parseWeightInput).
                const cleaned = e.target.value
                  .replace(/[^0-9.,]/g, "")
                  .replace(/([.,].*)[.,]/g, "$1");
                onChange({ weighedKg: cleaned });
              }}
              // Anti-double-pesée : une fois la ligne enregistrée (ou pendant
              // l'envoi), l'input est verrouillé pour empêcher une double
              // capture. Pas de réactivation hors action explicite.
              disabled={ligne.saved || ligne.saving}
              className="w-24 min-h-[44px] px-3 py-3 rounded-xl border border-rule text-base text-right tabular-nums bg-cream focus:outline-none focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed"
              aria-label={`Poids pesé ${ligne.produit?.nom ?? ""} en kilogrammes`}
            />
            <span className="text-[11px] text-text-tertiary">kg</span>
          </div>
        )}
        {ut === "weight_bracket" && (
          <div className="text-[12px] text-text-secondary text-right">
            <span className="font-semibold text-primary tabular-nums">
              {ligne.produit?.poids_min_kg}-{ligne.produit?.poids_max_kg} kg
            </span>
            <span className="ml-1 tabular-nums">
              · {formatEur(ligne.prix_unitaire)} €
            </span>
          </div>
        )}
      </div>

      {/* — Bannière validation client (écart > 20 %) —
          Feedback visuel FORT, indépendant de la Vibration API : bandeau
          pleine largeur bg-danger + texte blanc. L'icône pulse uniquement
          si l'utilisateur tolère le motion (motion-safe). */}
      {needsClientValidation && !ligne.saved && (
        <div
          role="alert"
          className={`-mx-3 rounded-2xl px-3.5 py-3.5 ${
            confirmedHighEcart
              ? "bg-success-soft border border-success"
              : "bg-danger text-white"
          }`}
        >
          {confirmedHighEcart ? (
            <p className="text-[13px] font-bold text-success inline-flex items-center gap-1.5">
              <Check className="w-4 h-4 shrink-0" aria-hidden />
              Écart confirmé, tu peux enregistrer.
            </p>
          ) : (
            <>
              <p className="text-[14px] font-extrabold text-white inline-flex items-center gap-1.5">
                <TriangleAlert
                  className="w-5 h-5 shrink-0 motion-safe:animate-pulse"
                  aria-hidden
                />
                Écart &gt; 20 % : le client doit valider.
              </p>
              <p className="text-[12px] text-white/90 mt-1 tabular-nums">
                Estimé {formatEur(estimeTtc)} € · réel{" "}
                {formatEur(reelTtcLive ?? 0)} € ({eurEcart >= 0 ? "+" : ""}
                {formatEur(eurEcart)} €). Confirmes-tu cet écart ?
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setConfirmedHighEcart(true)}
                  className="tap flex-1 min-h-[44px] rounded-2xl bg-white text-danger text-sm font-extrabold px-3"
                >
                  Oui, confirmer
                </button>
                <button
                  onClick={() => onChange({ weighedKg: "" })}
                  className="tap flex-1 min-h-[44px] rounded-2xl border border-white/60 bg-transparent text-white text-sm font-bold px-3"
                >
                  Non, repeser
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* — Bouton Enregistrer / état saved (verrou anti-double-pesée) — */}
      <div className="flex items-center justify-end gap-3">
        {/* Rappel explicite du blocage tant que l'écart fort n'est pas
            confirmé (renforce la désactivation visuelle du bouton). */}
        {saveBlocked && !ligne.saved && (
          <span className="text-[12px] font-semibold text-danger inline-flex items-center gap-1">
            <Lock className="w-3.5 h-3.5" aria-hidden />
            Confirme l&apos;écart d&apos;abord
          </span>
        )}
        {ligne.saved ? (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-success inline-flex items-center gap-1 font-semibold">
              <Lock className="w-3.5 h-3.5" aria-hidden />
              <Check className="w-4 h-4" />
              Pesée enregistrée
            </span>
            {/* Recours anti-blocage : même un écart DANS la tolérance peut
                être erroné. "Corriger" rouvre l'édition de CETTE ligne
                (saved→false ré-active input + bouton Enregistrer) sans vider
                weighedKg, pour rectifier la valeur. Ne touche ni au calcul
                ni à la capture (re-passe par saveWeightLigne au ré-enreg.). */}
            <button
              onClick={() => onChange({ saved: false })}
              className="tap min-h-[44px] text-[12px] font-semibold text-text-secondary inline-flex items-center gap-1 px-2 rounded-xl hover:text-primary"
              aria-label={`Corriger la pesée ${ligne.produit?.nom ?? ""}`}
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden />
              Corriger
            </button>
          </div>
        ) : (
          <button
            onClick={() => void onSave()}
            disabled={ligne.saving || reelTtcLive == null || saveBlocked}
            className="tap min-h-[44px] text-sm font-bold text-white bg-primary px-4 rounded-2xl disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            {ligne.saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Scale className="w-4 h-4" />
            )}
            Enregistrer
          </button>
        )}
      </div>
    </div>
  );
}

function formatHeure(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

