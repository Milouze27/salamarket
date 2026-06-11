"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ImagePlus,
  PackagePlus,
} from "lucide-react";
import type { BdlDetail, BdlLigne } from "./types";

/**
 * Liste des lignes attendues + zone photos (palette x2 obligatoires + BDL
 * papier optionnel).
 *
 * Composant PUR : reçoit le BDL et un callback d'ouverture du capture photo.
 * Aucun accès Supabase, aucune mutation.
 */
export function LigneList({
  bdl,
  onOpenPhotoSlot,
}: {
  bdl: BdlDetail;
  onOpenPhotoSlot: (slot: 1 | 2 | 3) => void;
}) {
  return (
    <section className="px-5 mt-4 pb-[200px]">
      <p className="label-caps text-text-tertiary mb-2">
        Produits attendus ({bdl.bons_de_livraison_lignes.length})
      </p>
      <div className="space-y-2">
        {bdl.bons_de_livraison_lignes.map((l) => (
          <LigneRow key={l.id} ligne={l} />
        ))}
      </div>

      {/* Photos palette + photo BDL papier (preuve archivée) */}
      <div className="mt-6">
        <p className="label-caps text-text-tertiary mb-2">
          Photos palette (obligatoires)
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          {[1, 2].map((slot) => {
            const url =
              slot === 1 ? bdl.photo_palette_url_1 : bdl.photo_palette_url_2;
            return (
              <button
                key={slot}
                onClick={() => onOpenPhotoSlot(slot as 1 | 2)}
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

        {/* Photo BDL papier (optionnelle, preuve en cas de litige) */}
        <p className="label-caps text-text-tertiary mt-5 mb-2">
          Photo du BDL papier (optionnelle)
        </p>
        <button
          onClick={() => onOpenPhotoSlot(3)}
          className="relative w-full aspect-[16/6] rounded-2xl border-2 border-dashed border-text-tertiary/30 overflow-hidden bg-white active:scale-[0.99] transition-transform"
        >
          {bdl.photo_bdl_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              loading="lazy"
              decoding="async"
              src={bdl.photo_bdl_url}
              alt="BDL papier"
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-text-secondary">
              <ImagePlus className="w-4 h-4" />
              <span className="text-[12px] font-bold">
                Scanner ou photographier le BDL du fournisseur
              </span>
            </div>
          )}
        </button>
      </div>
    </section>
  );
}

/** Carte d'une ligne attendue (statut, nom, code-barre, qté reçue/attendue). */
function LigneRow({ ligne: l }: { ligne: BdlLigne }) {
  // Sur-réception : reçu STRICTEMENT plus que l'attendu. On la sort du vert
  // "Reçu" (qui suggère "tout va bien") vers un état d'avertissement ambre
  // avec l'excédent affiché — signal métier (erreur de saisie probable).
  // STK-OPS-03 / b10-02.
  const surExcedent = l.quantite_recue - l.quantite_attendue;
  const isSurReception = surExcedent > 0 && l.quantite_attendue > 0;
  const isRecu = l.statut === "recu" && !isSurReception;
  const isSurplus = l.statut === "surplus";
  const tone = isSurReception
    ? "warning"
    : isRecu
      ? "success"
      : isSurplus
        ? "danger"
        : "neutral";
  const borderCls =
    tone === "success"
      ? "border-success/40"
      : tone === "warning"
        ? "border-warning/50"
        : tone === "danger"
          ? "border-danger/40"
          : "border-rule";
  const badgeBgCls =
    tone === "success"
      ? "bg-success-soft text-success"
      : tone === "warning"
        ? "bg-warning-soft text-warning"
        : tone === "danger"
          ? "bg-danger-soft text-danger"
          : "bg-cream text-text-tertiary";
  const textCls =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-danger"
          : "text-text-primary";
  const labelCls =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-danger"
          : "text-text-tertiary";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white border rounded-2xl p-3 flex items-center gap-3 ${borderCls}`}
    >
      <span
        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${badgeBgCls}`}
      >
        {isRecu ? (
          <CheckCircle2 className="w-5 h-5" />
        ) : isSurReception || isSurplus ? (
          <AlertTriangle className="w-5 h-5" />
        ) : (
          <PackagePlus className="w-5 h-5" />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-bold text-text-primary truncate">
          {l.produits?.nom ??
            `Produit non référencé${
              l.code_barre_attendu || l.produits?.ean
                ? ` — EAN ${l.code_barre_attendu ?? l.produits?.ean}`
                : ""
            }`}
        </p>
        <p className="text-[11px] text-text-tertiary mono mt-0.5">
          {l.code_barre_attendu ?? l.produits?.ean ?? "—"}
        </p>
      </div>
      <div className="text-right">
        <p className={`text-[14px] font-extrabold tabular ${textCls}`}>
          {l.quantite_recue} / {l.quantite_attendue}
        </p>
        <p
          className={`text-[10.5px] uppercase font-bold tracking-wide mt-0.5 ${labelCls}`}
        >
          {isSurReception
            ? `Sur-réception +${surExcedent}`
            : isRecu
              ? "Reçu"
              : isSurplus
                ? "Surplus"
                : l.statut === "manquant"
                  ? "Manquant"
                  : "À scanner"}
        </p>
      </div>
    </motion.div>
  );
}
