/**
 * Schémas Zod centralisés pour les routes API critiques de Salam Stock.
 *
 * Pattern : 1 schema par route critique. Le helper `validateBody()`
 * (cf. ./helper.ts) renvoie 400 + détail si invalide, sinon retourne
 * le data typé.
 *
 * Routes couvertes en priorité demo :
 *   - /api/bdl/scan-carton  → scanCartonSchema
 *   - /api/bdl/finalize     → finalizeBdlSchema
 *   - /api/po (auto-generate, send) → createPoSchema, sendPoSchema
 *   - /api/assistant        → assistantQuerySchema
 */

import { z } from "zod";

// ─── UUID strict (Postgres uuid type) ─────────────────────────────────
const UUID = z
  .string()
  .uuid({ message: "Doit être un UUID valide (Postgres uuid type)" });

// ─── EAN/code-barres : 4 à 20 caractères alphanum ────────────────────
const EAN = z
  .string()
  .trim()
  .min(4, "EAN trop court (min 4 caractères)")
  .max(20, "EAN trop long (max 20 caractères)")
  .regex(/^[0-9A-Za-z-]+$/, "EAN doit être alphanumérique");

// ═══════════════════════════════════════════════════════════════════════
//  BDL — réception scanner-first
// ═══════════════════════════════════════════════════════════════════════

export const scanCartonSchema = z.object({
  bdl_id: UUID,
  ean: EAN,
  employe_id: UUID.optional(),
  lot_id: z.string().trim().max(40).optional(),
  // Confirmation explicite du staff quand un scan ferait dépasser 150 % de
  // la quantité attendue (sur-comptage / double scan probable). Sans ce
  // flag, le serveur renvoie kind:"blocked" et N'INCRÉMENTE PAS.
  confirm_over: z.boolean().optional(),
});

export type ScanCartonInput = z.infer<typeof scanCartonSchema>;

export const finalizeBdlSchema = z.object({
  bdl_id: UUID,
  employe_id: UUID.optional(),
});

export type FinalizeBdlInput = z.infer<typeof finalizeBdlSchema>;

// ═══════════════════════════════════════════════════════════════════════
//  PO — purchase orders
// ═══════════════════════════════════════════════════════════════════════

export const sendPoSchema = z.object({
  po_id: UUID,
});

export type SendPoInput = z.infer<typeof sendPoSchema>;

/**
 * POST /api/po — création manuelle d'un PO (route legacy, encore appelée
 * depuis l'admin pour les commandes ad-hoc hors algo de réassort).
 * Le body est large : on valide les champs critiques et on tolère le
 * reste via passthrough() pour rester compatible avec les anciens callers.
 */
export const createPoSchema = z
  .object({
    fournisseur_id: UUID,
    depot_destination_id: UUID,
    date_livraison_prevue: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Format date attendu YYYY-MM-DD")
      .optional(),
    notes: z.string().max(2000).optional(),
    lignes: z
      .array(
        z.object({
          produit_id: UUID,
          quantite_commandee: z.number().int().positive().max(100000),
          prix_achat_ht: z.number().nonnegative().max(100000),
          reference_fourn: z.string().max(120).optional(),
          tva_pct: z.number().min(0).max(100).optional(),
        }),
      )
      .min(1, "Au moins une ligne requise")
      .max(500, "Trop de lignes (max 500)"),
  })
  .passthrough();

export type CreatePoInput = z.infer<typeof createPoSchema>;

// ═══════════════════════════════════════════════════════════════════════
//  Assistant IA — query Claude
// ═══════════════════════════════════════════════════════════════════════

export const assistantQuerySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z
          .string()
          .min(1, "Message vide")
          .max(8000, "Message trop long (max 8000 caractères)"),
      }),
    )
    .min(1, "Au moins un message requis")
    .max(40, "Trop de messages (max 40 dans la conversation)"),
});

export type AssistantQueryInput = z.infer<typeof assistantQuerySchema>;
