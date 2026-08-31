"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ImagePlus,
  PackagePlus,
} from "lucide-react";
import { DataTable } from "@/components/v2/DataTable";
import type { BdlDetail, BdlLigne } from "./types";

/**
 * Lignes attendues du BDL, en deux formes selon la taille d'écran :
 *  - sous 1024 px : la liste de cartes du terrain, inchangée (`lg:hidden`) ;
 *  - à partir de 1024 px : un vrai tableau. La liste est franchement
 *    tabulaire — même produit, même paire attendu/reçu, même statut sur
 *    chaque ligne, aucun contrôle de saisie dans la ligne — c'est le cas
 *    d'usage exact de <DataTable>. Mesuré le 31/08/2026 sur un BDL de
 *    14 références : 14 cartes empilées occupaient 810 px de haut, le
 *    tableau les montre en 420 px, écart compris.
 *
 * Le bloc photos vit désormais dans `PhotosBloc` : sur un poste de travail il
 * rejoint la colonne d'action (les 2 vues palette sont un pré-requis de
 * validation), pendant que les lignes tiennent la colonne de contexte. Au
 * téléphone les deux blocs restent l'un sous l'autre, dans le même ordre.
 */

/** Tonalité métier d'une ligne — partagée par la carte et le tableau. */
function toneDeLigne(l: BdlLigne) {
  const surExcedent = l.quantite_recue - l.quantite_attendue;
  const isSurReception = surExcedent > 0 && l.quantite_attendue > 0;
  const isRecu = l.statut === "recu" && !isSurReception;
  const isSurplus = l.statut === "surplus";
  const libelle = isSurReception
    ? `Sur-réception +${surExcedent}`
    : isRecu
      ? "Reçu"
      : isSurplus
        ? "Surplus"
        : l.statut === "manquant"
          ? "Manquant"
          : "À scanner";
  const tone: "success" | "warning" | "danger" | "neutral" = isSurReception
    ? "warning"
    : isRecu
      ? "success"
      : isSurplus
        ? "danger"
        : "neutral";
  return { surExcedent, isSurReception, isRecu, isSurplus, tone, libelle };
}

/** Libellé de repli quand la ligne n'a pas de fiche produit rattachée. */
function nomLigne(l: BdlLigne): string {
  if (l.produits?.nom) return l.produits.nom;
  const ean = l.code_barre_attendu ?? l.produits?.ean;
  return `Produit non référencé${ean ? ` — EAN ${ean}` : ""}`;
}

export function LigneList({ bdl }: { bdl: BdlDetail }) {
  const lignes = bdl.bons_de_livraison_lignes;
  return (
    <section className="px-5 mt-4">
      <p className="label-caps text-text-tertiary mb-2">
        Produits attendus ({lignes.length})
      </p>

      {/* Terrain — cartes au pouce, inchangées sous 1024 px. */}
      <div className="space-y-2 lg:hidden">
        {lignes.map((l) => (
          <LigneRow key={l.id} ligne={l} />
        ))}
      </div>

      {/* Poste de travail — tableau à partir de 1024 px. */}
      <div className="hidden lg:block">
        <DataTable
          rows={lignes}
          getKey={(l) => l.id}
          caption={`Lignes du bon de livraison ${bdl.numero_bdl}, ${lignes.length} références`}
          rowAccent={(l) => {
            const t = toneDeLigne(l);
            if (t.tone === "danger") return "var(--danger)";
            if (t.tone === "warning") return "var(--warning)";
            return null;
          }}
          columns={[
            {
              key: "produit",
              label: "Produit",
              sort: (a, b) => nomLigne(a).localeCompare(nomLigne(b), "fr"),
              render: (l) => (
                <span
                  className="font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {nomLigne(l)}
                </span>
              ),
            },
            {
              key: "ean",
              label: "Code-barres",
              width: "142px",
              xlOnly: true,
              render: (l) => (
                <span
                  className="mono text-[12px]"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {l.code_barre_attendu ?? l.produits?.ean ?? "—"}
                </span>
              ),
            },
            {
              key: "attendu",
              label: "Attendu",
              width: "78px",
              align: "right",
              sort: (a, b) => a.quantite_attendue - b.quantite_attendue,
              render: (l) => (
                <span style={{ color: "var(--text-secondary)" }}>
                  {l.quantite_attendue}
                </span>
              ),
            },
            {
              key: "recu",
              label: "Reçu",
              width: "78px",
              align: "right",
              sort: (a, b) => a.quantite_recue - b.quantite_recue,
              render: (l) => (
                <span
                  className="font-bold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {l.quantite_recue}
                </span>
              ),
            },
            {
              key: "ecart",
              label: "Écart",
              width: "78px",
              align: "right",
              xlOnly: true,
              sort: (a, b) =>
                a.quantite_recue -
                a.quantite_attendue -
                (b.quantite_recue - b.quantite_attendue),
              render: (l) => {
                const e = l.quantite_recue - l.quantite_attendue;
                if (e === 0)
                  return (
                    <span style={{ color: "var(--text-tertiary)" }}>—</span>
                  );
                return (
                  <span
                    className="font-bold"
                    style={{
                      color: e > 0 ? "var(--warning)" : "var(--danger)",
                    }}
                  >
                    {e > 0 ? "+" : ""}
                    {e}
                  </span>
                );
              },
            },
            {
              key: "statut",
              label: "État",
              width: "168px",
              render: (l) => {
                const t = toneDeLigne(l);
                const couleur =
                  t.tone === "success"
                    ? "var(--success)"
                    : t.tone === "warning"
                      ? "var(--warning)"
                      : t.tone === "danger"
                        ? "var(--danger)"
                        : "var(--text-tertiary)";
                return (
                  <span
                    className="inline-flex items-center gap-1.5 font-semibold"
                    style={{ color: couleur }}
                  >
                    {t.isRecu ? (
                      <CheckCircle2 className="w-4 h-4" aria-hidden />
                    ) : t.isSurReception || t.isSurplus ? (
                      <AlertTriangle className="w-4 h-4" aria-hidden />
                    ) : (
                      <PackagePlus className="w-4 h-4" aria-hidden />
                    )}
                    {t.libelle}
                  </span>
                );
              },
            },
          ]}
        />
      </div>
    </section>
  );
}

/**
 * Photos palette (2 vues obligatoires) + photo du BDL papier (optionnelle).
 * Bloc séparé : sur ordinateur il rejoint la colonne d'action, au téléphone
 * il reste sous la liste des lignes, à la même place qu'avant.
 */
export function PhotosBloc({
  bdl,
  onOpenPhotoSlot,
}: {
  bdl: BdlDetail;
  onOpenPhotoSlot: (slot: 1 | 2 | 3) => void;
}) {
  return (
    <section className="px-5 mt-6 pb-[200px] lg:pb-0">
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
        className="relative w-full aspect-[16/6] rounded-2xl border-2 border-dashed border-text-tertiary/30 overflow-hidden bg-[color:var(--surface-1)] text-[color:var(--text-primary)] active:scale-[0.99] transition-transform"
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
    </section>
  );
}

/** Carte d'une ligne attendue (statut, nom, code-barre, qté reçue/attendue). */
function LigneRow({ ligne: l }: { ligne: BdlLigne }) {
  // Sur-réception : reçu STRICTEMENT plus que l'attendu. On la sort du vert
  // "Reçu" (qui suggère "tout va bien") vers un état d'avertissement ambre
  // avec l'excédent affiché — signal métier (erreur de saisie probable).
  // STK-OPS-03 / b10-02.
  const { isSurReception, isRecu, isSurplus, tone, libelle } = toneDeLigne(l);
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
      className={`bg-[color:var(--surface-1)] text-[color:var(--text-primary)] border rounded-2xl p-3 flex items-center gap-3 ${borderCls}`}
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
          {nomLigne(l)}
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
          {libelle}
        </p>
      </div>
    </motion.div>
  );
}
