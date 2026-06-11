/**
 * Logique pure de la page Préparation (kanban + batch pick).
 *
 * Extrait de page.tsx (audit #7 — décomposition god-component) : types,
 * constantes de données et fonctions PURES, sans JSX ni hooks React. Aucun
 * changement de comportement — simple déplacement pour rendre la page lisible.
 */

import type { ClientType } from "@/components/v2/ClientTypeBadge";
import type { CommandeDrive, ZonePreparationDrive } from "@/lib/types/db";
import type { CommandeDriveLigneWithUnitType } from "@/lib/db";

export interface CommandeWithLignes extends CommandeDrive {
  lignes: CommandeDriveLigneWithUnitType[];
}

export type KanbanStatut = "a_preparer" | "en_preparation" | "pret" | "retire";
export type ViewMode = "kanban" | "batch";

// Filtres suivi-drive : segment client + fenêtre d'urgence.
export type SegmentFilter = "tous" | ClientType;
export type UrgenceFilter = "tous" | "urgent" | "normal" | "late";

export const SEGMENT_FILTERS: Array<{ key: SegmentFilter; label: string }> = [
  { key: "tous", label: "Tous" },
  { key: "particulier", label: "Particulier" },
  { key: "pro", label: "Pro" },
  { key: "traiteur", label: "Traiteur" },
];

export const URGENCE_FILTERS: Array<{ key: UrgenceFilter; label: string }> = [
  { key: "tous", label: "Tous" },
  { key: "urgent", label: "<30min" },
  { key: "normal", label: "30min-2h" },
  { key: "late", label: ">2h" },
];

// Segment client d'une commande, déduit des zones de préparation de ses
// lignes. Une commande est rattachée à un segment si au moins une ligne
// appartient à ce segment (cas mixte rare → match permissif).
export function commandeMatchesSegment(
  cmd: CommandeWithLignes,
  seg: SegmentFilter,
): boolean {
  if (seg === "tous") return true;
  return cmd.lignes.some((l) => clientTypeFromZone(l.zone_preparation) === seg);
}

/* ── Batch Pick helpers ─────────────────────────────────────────────── */

export interface BatchProduct {
  produit_id: string;
  nom: string;
  categorie: string;
  totalQty: number;
  unit: string; // "kg" or "pcs"
  orderCount: number;
  orders: { numero_commande: string; quantite: number }[];
}

export interface BatchCategory {
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

export function getCategoryEmoji(cat: string): string {
  return CATEGORY_EMOJI[cat] ?? "\u{1F4E6}"; // 📦
}

export function buildBatchCategories(
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

/**
 * Référence d'affichage d'une commande, ALIGNÉE sur ce que le client voit
 * dans Drive (OrderConfirmation/Orders affichent `order.id.slice(0,8)
 * .toUpperCase()`). Source unique pour le staff : tout endroit qui doit
 * matcher la commande avec le client (email, ticket, toasts, cartes kanban,
 * détail) DOIT passer par ici, sinon la ref staff et la ref client divergent
 * (ex. casse, présence/absence du toUpperCase) et le client↔staff ne se
 * comprennent plus au comptoir.
 */
export function refCommande(cmd: {
  numero_commande?: string | null;
  id: string;
}): string {
  return cmd.numero_commande || cmd.id.slice(0, 8).toUpperCase();
}

export function clientTypeFromZone(
  z: ZonePreparationDrive | string,
): ClientType {
  if (z === "professionnel") return "pro";
  if (z === "traiteur") return "traiteur";
  return "particulier";
}

export function formatHeure(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

// Tier urgence basé sur le délai avant retrait (creneau_retrait).
// urgent: <30min · normal: 30min-2h · late: >2h.
export type UrgencyTier = "urgent" | "normal" | "late";

export function getUrgencyTier(creneauIso: string): UrgencyTier {
  const diffMs = new Date(creneauIso).getTime() - Date.now();
  const diffMin = diffMs / 60000;
  if (diffMin < 30) return "urgent";
  if (diffMin <= 120) return "normal";
  return "late";
}

// Label relatif court : "Dans 18min", "Dans 1h25", "Dans 3h", "En retard".
export function formatRelativeToCreneau(creneauIso: string): string {
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

/** Échappe le HTML — empêche l'injection via client_nom (donnée client). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildCommandePreteEmail(commande: {
  id: string;
  numero_commande?: string | null;
  client_nom?: string | null;
}): string {
  const ref = escapeHtml(refCommande(commande));
  const greeting = commande.client_nom
    ? ` ${escapeHtml(commande.client_nom)}`
    : "";
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
      <p style="margin: 4px 0 0; font-size: 13px; color: #6B7280;">Lun-Sam 10h-19h30 · Dimanche fermé</p>
    </div>
    <p style="color: #0F1A14; font-size: 14px;">À très vite !</p>
    <p style="color: #6B7280; font-size: 12px; margin-top: 24px;">L'équipe Salamarket</p>
  </div>
</div>`;
}
