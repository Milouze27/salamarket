"use client";

/* PoDrawer
 * ────────
 * Drawer mobile (sheet bottom > 50vh, scroll interne) — pas un modal.
 * Affiche le détail d'un brouillon PO directement depuis la liste, pour
 * qu'Otmane puisse valider/annuler sans changer de page.
 *
 * Animations : Framer Motion (déjà dans le bundle), spring smooth.
 * Backdrop : tap pour fermer, blur sapin.
 */

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { X, Send, Truck, FileText, ArrowRight } from "lucide-react";
import { CertHalalBadge } from "./cert-halal-badge";
import {
  certifAlerte,
  STATUT_LABELS,
  type PurchaseOrderWithJoin,
} from "@/lib/types/po";

interface Props {
  po: PurchaseOrderWithJoin | null;
  onClose: () => void;
  onSend?: (poId: string) => Promise<void> | void;
  sending?: boolean;
}

function eur(n: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n);
}

export function PoDrawer({ po, onClose, onSend, sending }: Props) {
  // Bloque le scroll body quand le drawer est ouvert (sinon iOS bounce
  // derrière le sheet, sensation cheap).
  useEffect(() => {
    if (!po) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [po]);

  const alerte = po ? certifAlerte(po.fournisseurs?.certif_expire_le) : "ok";
  const bloque = alerte === "expiree" || alerte === "manquante";
  const lignes = po?.purchase_order_lignes ?? [];

  return (
    <AnimatePresence>
      {po && (
        <>
          {/* Backdrop */}
          <motion.button
            key="backdrop"
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40"
            style={{
              background: "rgba(8, 42, 32, 0.55)",
              backdropFilter: "blur(6px)",
            }}
          />
          {/* Sheet */}
          <motion.div
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 360 }}
            className="fixed inset-x-0 bottom-0 z-50 flex flex-col"
            style={{
              maxHeight: "92vh",
              background: "var(--bg-cream)",
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              boxShadow: "0 -8px 32px rgba(14, 59, 46, 0.2)",
            }}
          >
            {/* Grip + close */}
            <div className="relative pt-3 pb-2">
              <div
                className="mx-auto rounded-full"
                style={{
                  width: 44,
                  height: 5,
                  background: "var(--border-medium)",
                }}
              />
              <button
                type="button"
                onClick={onClose}
                className="absolute right-4 top-3 p-2 rounded-full"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border-light)" }}
                aria-label="Fermer"
              >
                <X size={18} color="var(--text-secondary)" />
              </button>
            </div>

            {/* Header */}
            <div className="px-5 pb-4">
              <div className="flex items-baseline justify-between gap-3 mb-2">
                <p className="label-caps" style={{ color: "var(--text-secondary)" }}>
                  {po.numero_po}
                </p>
                <span className="badge badge-neutral">{STATUT_LABELS[po.statut]}</span>
              </div>
              <h2 className="h2" style={{ color: "var(--text-primary)" }}>
                {po.fournisseurs?.nom ?? "Fournisseur"}
              </h2>
              <p className="body-sm mt-1">
                Livraison vers <strong style={{ color: "var(--text-primary)" }}>{po.depots?.nom ?? "—"}</strong>
                {po.date_livraison_prevue && (
                  <> · prévue le <strong style={{ color: "var(--text-primary)" }}>
                    {new Date(po.date_livraison_prevue).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                  </strong></>
                )}
              </p>
              <div className="mt-3">
                <CertHalalBadge
                  organisme={po.fournisseurs?.certif_organisme ?? null}
                  numero={po.fournisseurs?.certif_numero}
                  expireLe={po.fournisseurs?.certif_expire_le}
                  size="md"
                  verbose
                />
              </div>
            </div>

            {/* Alert banner si certif bloque */}
            {bloque && (
              <div
                className="mx-5 mb-3 rounded-2xl px-4 py-3"
                style={{
                  background: "#FEF2F1",
                  border: "1px solid #F4B7B1",
                  color: "#A02921",
                }}
              >
                <p className="font-semibold text-[14px] leading-snug">
                  Envoi bloqué — certificat halal {alerte === "expiree" ? "expiré" : "manquant"}.
                </p>
                <p className="text-[13px] leading-snug mt-1" style={{ color: "#A02921" }}>
                  Tu peux ouvrir la fiche fournisseur pour mettre à jour le PDF de certif,
                  ou basculer ces produits sur un fournisseur backup.
                </p>
              </div>
            )}

            {/* Scroll zone lignes */}
            <div className="flex-1 overflow-y-auto px-5">
              <div className="card" style={{ padding: 0 }}>
                <div
                  className="px-4 py-3 flex items-center justify-between"
                  style={{ borderBottom: "1px solid var(--border-light)" }}
                >
                  <p className="label-caps" style={{ color: "var(--text-secondary)" }}>
                    {lignes.length} ligne{lignes.length > 1 ? "s" : ""}
                  </p>
                  <p className="font-semibold tabular" style={{ color: "var(--text-primary)" }}>
                    Total HT : {eur(po.total_ht ?? 0)}
                  </p>
                </div>
                <ul>
                  {lignes.map((l) => (
                    <li
                      key={l.id}
                      className="px-4 py-3 flex items-center justify-between gap-3"
                      style={{ borderBottom: "1px solid var(--border-light)" }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                          {l.reference_fourn ?? l.produit_id.slice(0, 8)}
                        </p>
                        <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                          {l.quantite_commandee} × {eur(l.prix_achat_ht ?? 0)}
                        </p>
                      </div>
                      <p className="text-[14px] font-bold tabular" style={{ color: "var(--text-primary)" }}>
                        {eur((l.prix_achat_ht ?? 0) * (l.quantite_commandee ?? 0))}
                      </p>
                    </li>
                  ))}
                  {lignes.length === 0 && (
                    <li className="px-4 py-6 text-center body-sm">
                      Aucune ligne — édite le brouillon pour ajouter des produits.
                    </li>
                  )}
                </ul>
              </div>

              <Link
                href={`/v2/po/${po.id}`}
                className="mt-3 mb-4 w-full inline-flex items-center justify-between px-4 py-3 rounded-2xl"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-light)",
                  color: "var(--text-primary)",
                }}
              >
                <span className="flex items-center gap-2">
                  <FileText size={16} color="var(--primary-green)" />
                  <span className="font-semibold text-[14px]">Éditer les lignes</span>
                </span>
                <ArrowRight size={16} color="var(--text-secondary)" />
              </Link>
            </div>

            {/* CTA bottom */}
            <div
              className="px-5 pt-3"
              style={{
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
                borderTop: "1px solid var(--border-light)",
                background: "var(--bg-card)",
              }}
            >
              <button
                type="button"
                disabled={bloque || sending || po.statut !== "brouillon"}
                onClick={() => onSend?.(po.id)}
                className="btn-primary w-full"
                style={{ minHeight: 52 }}
              >
                {sending ? (
                  <>Envoi en cours…</>
                ) : po.statut !== "brouillon" ? (
                  <>
                    <Truck size={18} /> Déjà envoyée
                  </>
                ) : bloque ? (
                  <>Envoi bloqué — certif KO</>
                ) : (
                  <>
                    <Send size={18} /> Envoyer au fournisseur
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
