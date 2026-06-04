"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Inbox,
  Layers,
  ListChecks,
  Lock,
  PackageCheck,
  PackageOpen,
  PlayCircle,
  Scale,
  Sparkles,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { PriceTag } from "@/components/v2/PriceTag";
import { EditorialEyebrow } from "@/components/v2/EditorialEyebrow";
import { DlcBanner } from "@/components/v2/DlcBanner";
import {
  ClientTypeBadgeGroup,
  type ClientType,
} from "@/components/v2/ClientTypeBadge";
import {
  listCommandesDrive,
  listLignesPourCommandeAvecUnitType,
  setCommandeStatut,
  type CommandeDriveLigneWithUnitType,
} from "@/lib/db";
import { supabase } from "@/lib/supabase";
import type { CommandeDrive, ZonePreparationDrive } from "@/lib/types/db";

interface CommandeWithLignes extends CommandeDrive {
  lignes: CommandeDriveLigneWithUnitType[];
}

type KanbanStatut = "a_preparer" | "en_preparation" | "pret" | "retire";
type ViewMode = "kanban" | "batch";

// Filtres suivi-drive : segment client + fenêtre d'urgence.
type SegmentFilter = "tous" | ClientType;
type UrgenceFilter = "tous" | "urgent" | "normal" | "late";

const SEGMENT_FILTERS: Array<{ key: SegmentFilter; label: string }> = [
  { key: "tous", label: "Tous" },
  { key: "particulier", label: "Particulier" },
  { key: "pro", label: "Pro" },
  { key: "traiteur", label: "Traiteur" },
];

const URGENCE_FILTERS: Array<{ key: UrgenceFilter; label: string }> = [
  { key: "tous", label: "Tous" },
  { key: "urgent", label: "<30min" },
  { key: "normal", label: "30min-2h" },
  { key: "late", label: ">2h" },
];

// Segment client d'une commande, déduit des zones de préparation de ses
// lignes. Une commande est rattachée à un segment si au moins une ligne
// appartient à ce segment (cas mixte rare → match permissif).
function commandeMatchesSegment(
  cmd: CommandeWithLignes,
  seg: SegmentFilter,
): boolean {
  if (seg === "tous") return true;
  return cmd.lignes.some((l) => clientTypeFromZone(l.zone_preparation) === seg);
}

/* ── Batch Pick helpers ─────────────────────────────────────────────── */

interface BatchProduct {
  produit_id: string;
  nom: string;
  categorie: string;
  totalQty: number;
  unit: string; // "kg" or "pcs"
  orderCount: number;
  orders: { numero_commande: string; quantite: number }[];
}

interface BatchCategory {
  categorie: string;
  emoji: string;
  products: BatchProduct[];
  orderCount: number; // unique orders in this category
}

const CATEGORY_EMOJI: Record<string, string> = {
  Boucherie: "\u{1F969}", // 🥩
  Charcuterie: "\u{1F356}", // 🍖
  Surgelés: "\u{1F9CA}", // 🧊
  Frais: "\u{2744}\u{FE0F}", // ❄️
  Épicerie: "\u{1F6D2}", // 🛒
  Epicerie: "\u{1F6D2}", // 🛒
  Boissons: "\u{1F95B}", // 🥛
  "Fruits & Légumes": "\u{1F966}", // 🥦
};

/** Cold-chain first ordering for batch pick. */
const CATEGORY_ORDER: string[] = [
  "Surgelés",
  "Frais",
  "Boucherie",
  "Charcuterie",
];

function getCategoryEmoji(cat: string): string {
  return CATEGORY_EMOJI[cat] ?? "\u{1F4E6}"; // 📦
}

function buildBatchCategories(
  commandes: CommandeWithLignes[],
): BatchCategory[] {
  const aPreparer = commandes.filter((c) => c.statut === "a_preparer");
  const productMap = new Map<string, BatchProduct>();

  for (const cmd of aPreparer) {
    for (const l of cmd.lignes) {
      const key = l.produit_id;
      const existing = productMap.get(key);
      const isWeight =
        l.produit_unit_type === "weight" ||
        l.produit_unit_type === "weight_bracket";
      if (existing) {
        existing.totalQty += l.quantite;
        existing.orderCount += 1;
        existing.orders.push({
          numero_commande: cmd.numero_commande,
          quantite: l.quantite,
        });
      } else {
        productMap.set(key, {
          produit_id: key,
          nom: l.produit_nom ?? key,
          categorie: l.produit_categorie ?? "Autre",
          totalQty: l.quantite,
          unit: isWeight ? "kg" : "pcs",
          orderCount: 1,
          orders: [
            {
              numero_commande: cmd.numero_commande,
              quantite: l.quantite,
            },
          ],
        });
      }
    }
  }

  // Group by category
  const catMap = new Map<string, BatchProduct[]>();
  for (const p of productMap.values()) {
    const cat = p.categorie;
    if (!catMap.has(cat)) catMap.set(cat, []);
    catMap.get(cat)!.push(p);
  }

  // Sort products alphabetically within each category
  for (const list of catMap.values()) {
    list.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  }

  // Build category list and sort: cold chain first, then alphabetical
  const categories: BatchCategory[] = [];
  for (const [cat, products] of catMap.entries()) {
    const uniqueOrders = new Set(
      products.flatMap((p) => p.orders.map((o) => o.numero_commande)),
    );
    categories.push({
      categorie: cat,
      emoji: getCategoryEmoji(cat),
      products,
      orderCount: uniqueOrders.size,
    });
  }

  categories.sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.categorie);
    const bi = CATEGORY_ORDER.indexOf(b.categorie);
    const aIdx = ai >= 0 ? ai : CATEGORY_ORDER.length;
    const bIdx = bi >= 0 ? bi : CATEGORY_ORDER.length;
    if (aIdx !== bIdx) return aIdx - bIdx;
    return a.categorie.localeCompare(b.categorie, "fr");
  });

  return categories;
}

const COLUMNS: Array<{
  key: KanbanStatut;
  label: string;
  next: KanbanStatut | null;
  nextLabel: string | null;
  accent: string;
  textAccent: string;
  /** État vide explicite par colonne (icône + texte court positif). */
  emptyIcon: LucideIcon;
  emptyLabel: string;
}> = [
  {
    key: "a_preparer",
    label: "À préparer",
    next: "en_preparation",
    nextLabel: "Accepter la commande",
    accent: "bg-danger-soft border-danger/30",
    textAccent: "text-danger",
    emptyIcon: Inbox,
    emptyLabel: "Rien à préparer pour l'instant",
  },
  {
    key: "en_preparation",
    label: "En préparation",
    next: "pret",
    nextLabel: "Marquer prête",
    accent: "bg-warning-soft border-warning/30",
    textAccent: "text-warning",
    emptyIcon: PackageOpen,
    emptyLabel: "Aucune préparation en cours",
  },
  {
    key: "pret",
    label: "Prêtes au retrait",
    next: "retire",
    nextLabel: "Marquer retirée",
    accent: "bg-gold-soft border-gold/30",
    textAccent: "text-primary-dark",
    emptyIcon: PackageCheck,
    emptyLabel: "Aucune commande prête",
  },
  {
    key: "retire",
    label: "Retirées",
    next: null,
    nextLabel: null,
    accent: "bg-success-soft border-success/20",
    textAccent: "text-success",
    emptyIcon: Sparkles,
    emptyLabel: "Aucun retrait encore",
  },
];

function clientTypeFromZone(z: ZonePreparationDrive | string): ClientType {
  if (z === "professionnel") return "pro";
  if (z === "traiteur") return "traiteur";
  return "particulier";
}

function formatHeure(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

// Tier urgence basé sur le délai avant retrait (creneau_retrait).
// urgent: <30min · normal: 30min-2h · late: >2h.
type UrgencyTier = "urgent" | "normal" | "late";

function getUrgencyTier(creneauIso: string): UrgencyTier {
  const diffMs = new Date(creneauIso).getTime() - Date.now();
  const diffMin = diffMs / 60000;
  if (diffMin < 30) return "urgent";
  if (diffMin <= 120) return "normal";
  return "late";
}

// Label relatif court : "Dans 18min", "Dans 1h25", "Dans 3h", "En retard".
function formatRelativeToCreneau(creneauIso: string): string {
  const diffMs = new Date(creneauIso).getTime() - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 0) {
    const lateMin = Math.abs(diffMin);
    if (lateMin < 60) return `Retard ${lateMin}min`;
    const h = Math.floor(lateMin / 60);
    const m = lateMin % 60;
    return m === 0
      ? `Retard ${h}h`
      : `Retard ${h}h${String(m).padStart(2, "0")}`;
  }
  if (diffMin < 60) return `Dans ${diffMin}min`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m === 0 ? `Dans ${h}h` : `Dans ${h}h${String(m).padStart(2, "0")}`;
}

export default function V2PreparationKanbanPage() {
  const [commandes, setCommandes] = useState<CommandeWithLignes[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFor, setActionFor] = useState<CommandeWithLignes | null>(null);
  const [updating, setUpdating] = useState(false);
  const [isLive, setIsLive] = useState(false);
  // viewMode persisté entre sessions (clé 'prep-viewmode'). Restauré au
  // mount via un effet pour rester safe SSR (pas d'accès localStorage à
  // l'init côté serveur).
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>("tous");
  const [urgenceFilter, setUrgenceFilter] = useState<UrgenceFilter>("tous");
  const [pickedProducts, setPickedProducts] = useState<Set<string>>(
    () => new Set(),
  );
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    () => new Set(),
  );

  // Restaure le mode de vue préféré au mount (guard SSR).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("prep-viewmode");
    if (saved === "kanban" || saved === "batch") setViewMode(saved);
  }, []);

  // Persiste le mode de vue à chaque changement.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("prep-viewmode", viewMode);
  }, [viewMode]);

  async function reload() {
    // NOTE : /api/sync/drive-pull existe pour syncer les orders du
    // projet Supabase Drive vers Stock, mais nécessite la service-role
    // du projet Drive (RLS bloque l'anon). Tant que cette clé n'est pas
    // configurée en env Vercel (DRIVE_SUPABASE_SERVICE_ROLE_KEY), on ne
    // l'appelle pas — ça reviendrait à un round-trip réseau sans effet.
    if (process.env.NEXT_PUBLIC_HAS_DRIVE_SYNC === "1") {
      try {
        await fetch("/api/sync/drive-pull", { method: "POST" });
      } catch {
        /* échec sync → on continue avec ce qui est déjà en local */
      }
    }

    const cmds = await listCommandesDrive();
    const enriched = await Promise.all(
      cmds.map(async (c) => ({
        ...c,
        lignes: await listLignesPourCommandeAvecUnitType(c.id),
      })),
    );
    // Filtres :
    //  - statut != 'annule' (commande annulée par client ou admin)
    //  - statut_paiement != 'echec' (paiement Stripe a échoué — la
    //    commande existe en DB mais ne doit pas apparaître au préparateur)
    //  - les commandes legacy avec statut_paiement = null restent
    //    visibles (paiement en magasin, Checkout hosted classique,
    //    pas de Drive au poids)
    setCommandes(
      enriched.filter(
        (c) => c.statut !== "annule" && c.statut_paiement !== "echec",
      ),
    );
    setLoading(false);
  }

  useEffect(() => {
    void reload();
    // Realtime : suivre les changements de statut/lignes en live.
    // Si Realtime indispo (mode local), fallback polling 12s.
    const sb = supabase();
    if (!sb) {
      const t = setInterval(() => void reload(), 12_000);
      return () => clearInterval(t);
    }
    const ch = sb
      .channel("kanban-drive")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "commandes_drive" },
        () => {
          void reload();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "commandes_drive_lignes" },
        () => {
          void reload();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setIsLive(true);
      });
    return () => {
      ch.unsubscribe();
    };
  }, []);

  // Commandes filtrées par segment client. Le filtre urgence ne s'applique
  // qu'aux commandes "à préparer" (seul statut où le tier a du sens), il est
  // donc appliqué plus bas, colonne par colonne, pour ne pas vider les autres.
  const filteredCommandes = useMemo(
    () => commandes.filter((c) => commandeMatchesSegment(c, segmentFilter)),
    [commandes, segmentFilter],
  );

  const filtersActive = segmentFilter !== "tous" || urgenceFilter !== "tous";

  const byColumn = useMemo(() => {
    const map = new Map<KanbanStatut, CommandeWithLignes[]>();
    for (const col of COLUMNS) map.set(col.key, []);
    for (const c of filteredCommandes) {
      if (
        c.statut === "a_preparer" ||
        c.statut === "en_preparation" ||
        c.statut === "pret" ||
        c.statut === "retire"
      ) {
        // Filtre urgence : actif uniquement sur la colonne "à préparer".
        if (
          c.statut === "a_preparer" &&
          urgenceFilter !== "tous" &&
          getUrgencyTier(c.creneau_retrait) !== urgenceFilter
        ) {
          continue;
        }
        map.get(c.statut)!.push(c);
      }
    }
    // Default: sort by créneau ascendant.
    for (const [key, list] of map.entries()) {
      if (key === "a_preparer") {
        // Tri urgent → normal → late, puis créneau ascendant à l'intérieur
        // de chaque tier. Garantit que les imminents remontent visuellement.
        const tierWeight: Record<UrgencyTier, number> = {
          urgent: 0,
          normal: 1,
          late: 2,
        };
        list.sort((a, b) => {
          const ta = tierWeight[getUrgencyTier(a.creneau_retrait)];
          const tb = tierWeight[getUrgencyTier(b.creneau_retrait)];
          if (ta !== tb) return ta - tb;
          return a.creneau_retrait.localeCompare(b.creneau_retrait);
        });
      } else {
        list.sort((a, b) => a.creneau_retrait.localeCompare(b.creneau_retrait));
      }
    }
    return map;
  }, [filteredCommandes, urgenceFilter]);

  // Batch pick : segment toujours appliqué ; urgence appliquée aussi car le
  // batch ne pioche que dans les commandes "à préparer" (tier pertinent).
  const batchSourceCommandes = useMemo(
    () =>
      urgenceFilter === "tous"
        ? filteredCommandes
        : filteredCommandes.filter(
            (c) =>
              c.statut !== "a_preparer" ||
              getUrgencyTier(c.creneau_retrait) === urgenceFilter,
          ),
    [filteredCommandes, urgenceFilter],
  );

  const batchCategories = useMemo(
    () => buildBatchCategories(batchSourceCommandes),
    [batchSourceCommandes],
  );

  const totalBatchProducts = useMemo(
    () => batchCategories.reduce((s, c) => s + c.products.length, 0),
    [batchCategories],
  );

  const pickedCount = useMemo(() => {
    let count = 0;
    for (const cat of batchCategories) {
      for (const p of cat.products) {
        if (pickedProducts.has(p.produit_id)) count++;
      }
    }
    return count;
  }, [batchCategories, pickedProducts]);

  function togglePicked(produitId: string) {
    setPickedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(produitId)) next.delete(produitId);
      else next.add(produitId);
      return next;
    });
  }

  function toggleExpanded(produitId: string) {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(produitId)) next.delete(produitId);
      else next.add(produitId);
      return next;
    });
  }

  function toggleCategory(cat: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  async function advance(cmd: CommandeWithLignes, target: KanbanStatut) {
    setUpdating(true);
    try {
      await setCommandeStatut(cmd.id, target);
      // Send "commande prête" email — fire-and-forget via server action
      // (passe l'INTERNAL_API_SECRET côté serveur).
      if (target === "pret" && cmd.client_email) {
        const { sendOperationalEmail } =
          await import("@/lib/actions/email-send");
        sendOperationalEmail({
          to: cmd.client_email,
          subject: "Votre commande Salamarket est prête !",
          html: buildCommandePreteEmail({
            id: cmd.id,
            numero_commande: cmd.numero_commande,
            client_nom: cmd.client_nom,
          }),
        }).catch(() => {});
      }
      const label =
        target === "en_preparation"
          ? "acceptée · en préparation"
          : target === "pret"
            ? "marquée prête"
            : "marquée retirée";
      toast.success(`${cmd.numero_commande} ${label}`, { duration: 1800 });
      setActionFor(null);
      void reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setUpdating(false);
    }
  }

  return (
    // L99-iPad : `wide` cape le shell à 820px ≥md (cohérent avec la
    // bottom-nav, le Plus-sheet et les modales déjà capés à 820px). Sans ça
    // la grille kanban md:grid-cols-4 n'avait aucun cadrage propre — elle
    // sprawlait jusqu'au bord sur iPad paysage (1366px), incohérent avec les
    // modales centrées. 820px → 4 colonnes lisibles + alignement visuel global.
    <V2Shell wide>
      <PageAccentStripe accent="sapin-or" />
      <header className="px-5 pt-7">
        <BackButton />
        <div className="flex items-end justify-between gap-3 mt-3">
          <div className="min-w-0">
            <EditorialEyebrow num="01" label="Préparation" />
            <h1 className="h1-display mt-3">
              Préparation <span className="gold">Drive</span>.
            </h1>
          </div>
          <span
            className={`inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${
              isLive
                ? "bg-success-soft text-success"
                : "bg-cream text-text-tertiary"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isLive ? "bg-success animate-pulse" : "bg-text-tertiary"
              }`}
            />
            {isLive ? "Temps réel" : "Polling 12s"}
          </span>
        </div>

        <div className="mt-4">
          <DlcBanner />
        </div>

        {/* View mode toggle */}
        <div
          className="mt-4 inline-flex rounded-full p-1 gap-1 border"
          style={{
            background: "var(--surface-1)",
            borderColor: "var(--border-light)",
          }}
        >
          <button
            onClick={() => setViewMode("kanban")}
            aria-pressed={viewMode === "kanban"}
            className={`inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full text-[13px] font-bold transition-colors ${
              viewMode === "kanban"
                ? "bg-primary text-white"
                : "text-text-primary"
            }`}
          >
            <Layers className="w-4 h-4" aria-hidden />
            Kanban
          </button>
          <button
            onClick={() => setViewMode("batch")}
            aria-pressed={viewMode === "batch"}
            className={`inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full text-[13px] font-bold transition-colors ${
              viewMode === "batch"
                ? "bg-primary text-white"
                : "text-text-primary"
            }`}
          >
            <ListChecks className="w-4 h-4" aria-hidden />
            Batch
          </button>
        </div>
        {/* Micro-légende des deux modes (affichée une seule fois) */}
        <p className="mt-2 text-[11px] leading-snug text-text-tertiary">
          Kanban : une commande à la fois · Batch : pick par catégorie
        </p>
      </header>

      {/* Filtres suivi-drive : sticky sous le header, communs aux 2 vues.
          Z-INDEX documenté (L99-iPad) : z-20 < header sapin du shell (z-30)
          < bottom-nav (z-40) < modales/sheet (z-[60]/[70]). Au-dessus du
          contenu kanban pour rester lisible, mais jamais devant le header
          au scroll rapide iPad (évite tout overlap visuel). */}
      {!loading && (
        <div
          className="sticky top-0 z-20 px-5 py-3 mt-4 space-y-2 border-b backdrop-blur-sm"
          style={{
            background: "var(--surface-1)",
            borderColor: "var(--border-light)",
          }}
        >
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none -mx-1 px-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary shrink-0 pr-0.5">
              Client
            </span>
            {SEGMENT_FILTERS.map((f) => {
              const active = segmentFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setSegmentFilter(f.key)}
                  aria-pressed={active}
                  className={`shrink-0 min-h-[44px] px-3.5 rounded-full text-[12.5px] font-bold border transition-colors ${
                    active
                      ? "bg-primary text-white border-transparent"
                      : "text-text-primary"
                  }`}
                  style={
                    active
                      ? undefined
                      : {
                          background: "var(--surface-2)",
                          borderColor: "var(--border-light)",
                        }
                  }
                >
                  {f.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none -mx-1 px-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-text-tertiary shrink-0 pr-0.5">
              Urgence
            </span>
            {URGENCE_FILTERS.map((f) => {
              const active = urgenceFilter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setUrgenceFilter(f.key)}
                  aria-pressed={active}
                  className={`shrink-0 min-h-[44px] px-3.5 rounded-full text-[12.5px] font-bold border transition-colors ${
                    active
                      ? "bg-primary text-white border-transparent"
                      : "text-text-primary"
                  }`}
                  style={
                    active
                      ? undefined
                      : {
                          background: "var(--surface-2)",
                          borderColor: "var(--border-light)",
                        }
                  }
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <p className="px-5 py-10 text-center text-text-secondary">
          Chargement…
        </p>
      ) : viewMode === "kanban" ? (
        /* ────────────────── KANBAN VIEW ──────────────────
           Mobile : colonnes empilées (space-y). iPad/desktop : grille
           multi-colonnes pour voir les statuts côte à côte.
           L99-iPad : la grille hérite du cadrage du shell `wide` (820px),
           donc aucun sprawl pleine largeur. Les 4 colonnes passent dès `md`
           (le shell capant à 820px, `lg` ne s'activerait jamais à l'intérieur
           et laisserait 2 colonnes sur iPad paysage). À 820px → 4 colonnes
           lisibles, cohérent avec les modales centrées. */
        <div className="px-5 mt-5 space-y-6 md:space-y-0 md:grid md:grid-cols-4 md:gap-4 md:items-start pb-nav-stack">
          {(() => {
            // Quand un filtre est actif, on masque les colonnes vides pour
            // garder l'écran lisible. Sans filtre, on garde toutes les
            // colonnes (état vide explicite informatif).
            const visibleColumns = filtersActive
              ? COLUMNS.filter(
                  (col) => (byColumn.get(col.key) ?? []).length > 0,
                )
              : COLUMNS;
            if (filtersActive && visibleColumns.length === 0) {
              return (
                <div
                  className="border rounded-2xl p-6 text-center text-[13px] text-text-tertiary md:col-span-full"
                  style={{
                    background: "var(--surface-2)",
                    borderColor: "var(--border-light)",
                  }}
                >
                  Aucune commande ne correspond aux filtres.
                </div>
              );
            }
            return visibleColumns.map((col) => {
              const items = byColumn.get(col.key) ?? [];
              const EmptyIcon = col.emptyIcon;
              return (
                <section key={col.key}>
                  <div className="flex items-baseline justify-between mb-2 px-1">
                    <p className={`label-caps ${col.textAccent}`}>
                      {col.label}
                    </p>
                    <span className="text-[12px] font-extrabold tabular text-text-primary">
                      {items.length}
                    </span>
                  </div>
                  {items.length === 0 ? (
                    /* État vide explicite par colonne (L99) : icône or dans un
                       disque surface-2 cerclé d'un hairline or + message court
                       positif, dans l'esprit du composant EmptyState mais
                       compacté pour une colonne kanban étroite. Évite la
                       colonne muette. */
                    <div
                      className={`border rounded-2xl px-3 py-6 flex flex-col items-center justify-center text-center ${col.accent}`}
                    >
                      <span
                        className="w-10 h-10 rounded-full flex items-center justify-center mb-2"
                        style={{
                          background: "var(--surface-2)",
                          boxShadow:
                            "inset 0 0 0 1px var(--accent-gold-hairline)",
                        }}
                      >
                        <EmptyIcon
                          className="w-5 h-5"
                          style={{ color: "var(--accent-gold)" }}
                          strokeWidth={1.8}
                          aria-hidden
                        />
                      </span>
                      <p className="text-[12px] font-semibold text-text-secondary leading-snug max-w-[18ch]">
                        {col.emptyLabel}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {items.map((cmd) => {
                        const totalLignes = cmd.lignes.length;
                        const prepares = cmd.lignes.filter(
                          (l) => l.statut_preparation === "prepare",
                        ).length;
                        const types = Array.from(
                          new Set(
                            cmd.lignes.map((l) =>
                              clientTypeFromZone(l.zone_preparation),
                            ),
                          ),
                        );
                        const isFinal = col.key === "retire";
                        // Drive au poids — badges Stripe + nb à peser
                        const nbAPeser = cmd.lignes.filter(
                          (l) =>
                            l.produit_unit_type === "weight" ||
                            l.produit_unit_type === "weight_bracket",
                        ).length;
                        const isPreAutorise =
                          cmd.statut_paiement === "autorise";
                        const isCapture = cmd.statut_paiement === "capture";

                        // Urgency tier appliqué uniquement sur la colonne
                        // À préparer — sur les autres colonnes (en cours,
                        // prête, retirée) la priorité visuelle n'a plus de
                        // sens, on garde le style de colonne d'origine.
                        const tier =
                          col.key === "a_preparer"
                            ? getUrgencyTier(cmd.creneau_retrait)
                            : null;
                        // Urgent : liseré or (token). Late : dé-emphasé via
                        // surface-2 + bordure carte SANS opacity (qui cassait
                        // le contraste en dark mode), texte tertiaire.
                        const isUrgent = tier === "urgent";
                        const isLate = tier === "late";
                        const cardClass = isUrgent
                          ? "ring-1"
                          : isLate
                            ? ""
                            : col.accent.split(" ")[1];
                        const cardStyle: CSSProperties = isUrgent
                          ? {
                              borderColor: "var(--accent-gold)",
                              // ring via box-shadow tokenisé
                              boxShadow:
                                "0 0 0 1px var(--accent-gold-hairline), 0 0 0 3px var(--accent-gold-soft)",
                            }
                          : isLate
                            ? {
                                background: "var(--surface-2)",
                                borderColor: "var(--border-card)",
                              }
                            : {};
                        const chipClass = isUrgent
                          ? "text-primary-dark"
                          : isLate
                            ? "text-text-tertiary"
                            : "bg-cream text-text-primary";
                        const chipStyle: CSSProperties = isUrgent
                          ? { background: "var(--accent-gold)" }
                          : isLate
                            ? { background: "var(--border-light)" }
                            : {};
                        return (
                          <motion.div
                            key={cmd.id}
                            layout
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.18 }}
                            className={`bg-white border rounded-2xl p-3.5 shadow-card ${cardClass}`}
                            style={cardStyle}
                          >
                            {isUrgent && (
                              <span
                                className="inline-flex items-center gap-1 text-[9.5px] font-extrabold uppercase tracking-[0.18em] mb-2"
                                style={{ color: "var(--accent-gold-dim)" }}
                              >
                                <span
                                  className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                                  style={{ background: "var(--accent-gold)" }}
                                />
                                Urgent
                              </span>
                            )}
                            {isLate && (
                              <span className="inline-flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.18em] text-text-tertiary mb-2">
                                Plus tard
                              </span>
                            )}
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-[14px] font-extrabold text-text-primary">
                                  {cmd.numero_commande}
                                </p>
                                <p className="text-[11.5px] text-text-secondary truncate">
                                  {cmd.client_nom}
                                </p>
                              </div>
                              <span
                                className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${chipClass}`}
                                style={chipStyle}
                                title={`Créneau : ${formatHeure(cmd.creneau_retrait)}`}
                              >
                                <Clock className="w-3 h-3" />
                                {tier
                                  ? formatRelativeToCreneau(cmd.creneau_retrait)
                                  : formatHeure(cmd.creneau_retrait)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                              <ClientTypeBadgeGroup size="sm" types={types} />
                              {nbAPeser > 0 && (
                                <span
                                  title="Lignes au poids à peser"
                                  className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide bg-gold-soft text-primary-dark px-2 py-0.5 rounded-full"
                                >
                                  <Scale className="w-3 h-3" aria-hidden />
                                  {nbAPeser} à peser
                                </span>
                              )}
                              <span className="text-[11px] text-text-secondary inline-flex items-center gap-1 ml-auto">
                                {prepares}/{totalLignes} préparés
                                {isPreAutorise ? (
                                  <span
                                    title="Stripe pré-autorisé, capture après pesée"
                                    className="ml-1 inline-flex items-center gap-1 text-[10.5px] font-bold bg-cream text-primary px-2 py-0.5 rounded-full"
                                  >
                                    <Lock className="w-3 h-3" aria-hidden />
                                    Pré-aut.{" "}
                                    {(
                                      cmd.montant_autorise_ttc ?? cmd.total_ttc
                                    ).toFixed(0)}{" "}
                                    €
                                  </span>
                                ) : isCapture ? (
                                  <span
                                    title="Capture Stripe effectuée"
                                    className="ml-1 inline-flex items-center gap-1 text-[10.5px] font-bold bg-success-soft text-success px-2 py-0.5 rounded-full"
                                  >
                                    <Check className="w-3 h-3" aria-hidden />
                                    Capt.{" "}
                                    {(
                                      cmd.montant_capture_ttc ?? cmd.total_ttc
                                    ).toFixed(0)}{" "}
                                    €
                                  </span>
                                ) : (
                                  <PriceTag
                                    amount={cmd.total_ttc}
                                    decimals={0}
                                    className="ml-1"
                                  />
                                )}
                              </span>
                            </div>
                            <div className="mt-3 flex gap-2">
                              <Link
                                href={`/v2/preparation/${cmd.id}`}
                                className="flex-1 inline-flex items-center justify-center gap-1 text-[12px] font-bold text-primary bg-cream rounded-full py-2 active:scale-[0.98] transition-transform"
                              >
                                Détail
                                <ChevronRight className="w-3.5 h-3.5" />
                              </Link>
                              {!isFinal && (
                                <button
                                  onClick={() => setActionFor(cmd)}
                                  className="flex-1 inline-flex items-center justify-center gap-1 text-[12px] font-bold text-white bg-primary rounded-full py-2 active:scale-[0.98] transition-transform"
                                >
                                  Avancer
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            });
          })()}
        </div>
      ) : (
        /* ────────────────── BATCH PICK VIEW ──────────────────
           CTA fixe en bas → padding cumulant CTA + nav + safe + breathing
           pour que le scroll révèle TOUT le contenu (règle UX user). */
        <div className="px-5 mt-5 pb-cta-stack">
          {/* Progress bar */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[13px] font-bold text-text-primary">
                {pickedCount}/{totalBatchProducts} produits{" "}
                {totalBatchProducts > 0 ? "récupérés" : ""}
              </p>
              <p className="text-[11px] font-bold text-text-secondary">
                {totalBatchProducts > 0
                  ? `${Math.round((pickedCount / totalBatchProducts) * 100)}%`
                  : "0%"}
              </p>
            </div>
            <div
              className="h-2.5 rounded-full overflow-hidden"
              style={{ background: "var(--border-light)" }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ background: "var(--accent-gold)" }}
                initial={{ width: 0 }}
                animate={{
                  width:
                    totalBatchProducts > 0
                      ? `${(pickedCount / totalBatchProducts) * 100}%`
                      : "0%",
                }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>
          </div>

          {batchCategories.length === 0 ? (
            <div
              className="border rounded-2xl p-6 text-center text-[13px] text-text-secondary"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--border-light)",
              }}
            >
              {filtersActive
                ? "Aucune commande ne correspond aux filtres."
                : "Aucune commande en attente de préparation."}
            </div>
          ) : (
            <div className="space-y-4">
              {batchCategories.map((cat) => {
                const isCollapsed = collapsedCategories.has(cat.categorie);
                return (
                  <section key={cat.categorie}>
                    {/* Category header */}
                    <button
                      onClick={() => toggleCategory(cat.categorie)}
                      className="w-full flex items-center justify-between rounded-lg px-3.5 min-h-[44px] mb-2"
                      style={{ background: "var(--surface-2)" }}
                    >
                      <span className="text-[13px] font-bold text-text-primary text-left">
                        {cat.emoji} {cat.categorie} ({cat.products.length}{" "}
                        produit{cat.products.length > 1 ? "s" : ""},{" "}
                        {cat.orderCount} commande
                        {cat.orderCount > 1 ? "s" : ""})
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-text-tertiary transition-transform ${
                          isCollapsed ? "-rotate-90" : ""
                        }`}
                      />
                    </button>

                    {/* Product rows */}
                    <AnimatePresence initial={false}>
                      {!isCollapsed && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-2">
                            {cat.products.map((product) => {
                              const isPicked = pickedProducts.has(
                                product.produit_id,
                              );
                              const isExpanded = expandedProducts.has(
                                product.produit_id,
                              );
                              return (
                                <div
                                  key={product.produit_id}
                                  className={`bg-white rounded-lg border transition-opacity ${
                                    isPicked ? "opacity-60" : ""
                                  }`}
                                  style={{ borderColor: "var(--border-light)" }}
                                >
                                  <div className="flex items-center gap-3 p-3">
                                    {/* Checkbox */}
                                    <button
                                      onClick={() =>
                                        togglePicked(product.produit_id)
                                      }
                                      aria-pressed={isPicked}
                                      className="flex-shrink-0 w-11 h-11 -m-2.5 mr-0 flex items-center justify-center"
                                    >
                                      <span
                                        className="w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors"
                                        style={{
                                          background: isPicked
                                            ? "var(--primary-green)"
                                            : "var(--bg-card)",
                                          borderColor: isPicked
                                            ? "var(--primary-green)"
                                            : "var(--border-light)",
                                        }}
                                      >
                                        {isPicked && (
                                          <Check className="w-3.5 h-3.5 text-white" />
                                        )}
                                      </span>
                                    </button>

                                    {/* Product info — tap to expand */}
                                    <button
                                      onClick={() =>
                                        toggleExpanded(product.produit_id)
                                      }
                                      className="flex-1 min-w-0 text-left min-h-[44px] flex items-center"
                                    >
                                      <p
                                        className={`text-[13px] font-bold text-text-primary ${
                                          isPicked ? "line-through" : ""
                                        }`}
                                      >
                                        {product.nom}
                                      </p>
                                    </button>

                                    {/* Quantity + orders badge */}
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <span
                                        className={`text-[13px] font-bold tabular-nums text-text-primary ${
                                          isPicked ? "line-through" : ""
                                        }`}
                                      >
                                        {product.unit === "kg"
                                          ? `${product.totalQty.toFixed(
                                              product.totalQty % 1 === 0
                                                ? 0
                                                : 1,
                                            )} kg`
                                          : `${product.totalQty}`}
                                      </span>
                                      <span
                                        className="text-[10.5px] font-bold text-text-secondary px-2 py-0.5 rounded-full"
                                        style={{
                                          background: "var(--surface-2)",
                                        }}
                                      >
                                        {product.orderCount} cmd
                                        {product.orderCount > 1 ? "s" : ""}
                                      </span>
                                      <ChevronDown
                                        className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${
                                          isExpanded ? "" : "-rotate-90"
                                        }`}
                                      />
                                    </div>
                                  </div>

                                  {/* Per-order breakdown */}
                                  <AnimatePresence initial={false}>
                                    {isExpanded && (
                                      <motion.div
                                        initial={{
                                          height: 0,
                                          opacity: 0,
                                        }}
                                        animate={{
                                          height: "auto",
                                          opacity: 1,
                                        }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.15 }}
                                        className="overflow-hidden"
                                      >
                                        <div
                                          className="px-3 pb-3 pt-0 border-t"
                                          style={{
                                            borderColor: "var(--border-light)",
                                          }}
                                        >
                                          <div className="pt-2 space-y-1">
                                            {product.orders.map((o, i) => (
                                              <div
                                                key={i}
                                                className="flex items-center justify-between text-[12px] text-text-secondary"
                                              >
                                                <span className="font-medium">
                                                  {o.numero_commande}
                                                </span>
                                                <span className="tabular-nums">
                                                  {product.unit === "kg"
                                                    ? `${o.quantite.toFixed(
                                                        o.quantite % 1 === 0
                                                          ? 0
                                                          : 1,
                                                      )} kg`
                                                    : `${o.quantite}`}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </section>
                );
              })}
            </div>
          )}

          {/* Bottom CTA */}
          {totalBatchProducts > 0 && (
            <div
              className="fixed cta-above-nav left-0 right-0 z-[60] border-t px-5 py-4"
              style={{
                background: "var(--surface-1)",
                borderColor: "var(--border-light)",
              }}
            >
              <button
                onClick={() => setViewMode("kanban")}
                className="w-full bg-primary text-white rounded-full py-3.5 px-5 flex items-center justify-center gap-2 text-[14px] font-bold active:scale-[0.99] transition-transform"
              >
                Dispatcher par commande
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Action sheet */}
      <AnimatePresence>
        {actionFor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end justify-center"
            onClick={() => setActionFor(null)}
          >
            <motion.div
              initial={{ y: 60 }}
              animate={{ y: 0 }}
              exit={{ y: 60 }}
              transition={{ type: "spring", damping: 26, stiffness: 280 }}
              className="bg-white w-full max-w-[460px] md:max-w-[600px] rounded-t-[28px] p-6 pb-8 shadow-card-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="label-caps text-text-tertiary">Commande</p>
                  <h2 className="text-[18px] font-extrabold text-text-primary mt-0.5">
                    {actionFor.numero_commande}
                  </h2>
                  <p className="text-[12px] text-text-secondary mt-0.5">
                    {actionFor.client_nom}
                  </p>
                </div>
                <button onClick={() => setActionFor(null)}>
                  <X className="w-5 h-5 text-text-tertiary" />
                </button>
              </div>
              <div className="space-y-2 mt-4">
                {actionFor.statut === "a_preparer" && (
                  <button
                    onClick={() => void advance(actionFor, "en_preparation")}
                    disabled={updating}
                    className="w-full bg-primary text-white rounded-[18px] py-3.5 px-5 flex items-center justify-center gap-2 font-bold shadow-card active:scale-[0.99] disabled:opacity-50"
                  >
                    <PlayCircle className="w-4 h-4" />
                    Accepter et commencer la préparation
                  </button>
                )}
                {actionFor.statut === "en_preparation" && (
                  <button
                    onClick={() => void advance(actionFor, "pret")}
                    disabled={updating}
                    className="w-full bg-gold-bright text-primary-dark rounded-[18px] py-3.5 px-5 flex items-center justify-center gap-2 font-bold shadow-card active:scale-[0.99] disabled:opacity-50"
                  >
                    <PackageCheck className="w-4 h-4" />
                    Marquer prête au retrait
                  </button>
                )}
                {actionFor.statut === "pret" && (
                  <button
                    onClick={() => void advance(actionFor, "retire")}
                    disabled={updating}
                    className="w-full bg-success text-white rounded-[18px] py-3.5 px-5 flex items-center justify-center gap-2 font-bold shadow-card active:scale-[0.99] disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Marquer retirée par le client
                  </button>
                )}
                <Link
                  href={`/v2/preparation/${actionFor.id}`}
                  className="w-full bg-white border border-rule text-text-primary rounded-[18px] py-3 px-5 flex items-center justify-center gap-2 font-bold active:scale-[0.99] transition-transform"
                >
                  <PlayCircle className="w-4 h-4 text-primary" />
                  Ouvrir le détail
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </V2Shell>
  );
}

function buildCommandePreteEmail(commande: {
  id: string;
  numero_commande?: string | null;
  client_nom?: string | null;
}): string {
  const ref = commande.numero_commande || commande.id.slice(0, 8).toUpperCase();
  const greeting = commande.client_nom ? ` ${commande.client_nom}` : "";
  return `<div style="font-family: 'Plus Jakarta Sans', system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
  <div style="background: linear-gradient(180deg, #0E3B2E 0%, #082A20 100%); padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
    <h1 style="color: #C9A227; font-size: 20px; margin: 0;">Salamarket Drive</h1>
  </div>
  <div style="background: #FAF7EE; padding: 24px; border-radius: 0 0 12px 12px;">
    <h2 style="color: #0E3B2E; font-size: 18px;">Votre commande est prête !</h2>
    <p style="color: #0F1A14; font-size: 14px; line-height: 1.6;">
      Bonjour${greeting},<br><br>
      Votre commande <strong>${ref}</strong> est prête à être retirée.
    </p>
    <div style="background: white; border: 1px solid #E8E4D8; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <p style="margin: 0; font-size: 13px; color: #6B7280;">📍 Retrait au</p>
      <p style="margin: 4px 0 0; font-size: 15px; font-weight: 600; color: #0E3B2E;">8 av. Larrieu-Thibaud, 31100 Toulouse</p>
      <p style="margin: 4px 0 0; font-size: 13px; color: #6B7280;">Lun-Sam 10h-19h30 · Dimanche 10h-18h</p>
    </div>
    <p style="color: #0F1A14; font-size: 14px;">À très vite !</p>
    <p style="color: #6B7280; font-size: 12px; margin-top: 24px;">L'équipe Salamarket</p>
  </div>
</div>`;
}
