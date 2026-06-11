"use client";

/**
 * LotHalalDrawer — capture des métadonnées HALAL d'un LOT à la validation
 * d'une réception (V5-reception-lot-halal).
 *
 * À la validation du BDL, l'employé renseigne (une fois pour tout l'arrivage,
 * un BDL = un fournisseur) : DLC, date d'abattage, abattoir, certif AVS et
 * n° de lot fournisseur. Ces infos créent un LOT par produit reçu dans
 * `produits_lots` → alimente FEFO, alertes DLC et le passeport QR public.
 *
 * Scan-vision DLC : un bouton « Scanner le carton » ouvre la caméra
 * (PhotoCapture) et appelle /api/vision-dlc pour pré-remplir les dates +
 * n° de lot. Les valeurs restent éditables — aucune écriture auto sans
 * confirmation humaine. Fail-closed : si l'IA est indisponible, l'employé
 * saisit à la main, rien ne crashe.
 *
 * Composant frère de page.tsx (même répertoire) — pattern interne au flow
 * réception, comme les sheets de components/v2/reception/*.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Calendar,
  FileText,
  Loader2,
  ScanLine,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PhotoCapture } from "@/components/reception/PhotoCapture";

const ORGANISMES = [
  "AVS",
  "ARGML",
  "ACMIF",
  "SFCVH",
  "MOSQUEE_PARIS",
  "AUTRE",
] as const;

export interface LotHalalForm {
  dlc: string | null;
  ddm: string | null;
  date_abattage: string | null;
  supplier_lot: string | null;
  certifier_id: string | null;
  abattoir_nom: string | null;
  abattoir_pays: string | null;
}

const EMPTY: LotHalalForm = {
  dlc: null,
  ddm: null,
  date_abattage: null,
  supplier_lot: null,
  certifier_id: null,
  abattoir_nom: null,
  abattoir_pays: "FR",
};

interface DlcApiResult {
  dlc: string | null;
  ddm: string | null;
  date_abattage: string | null;
  supplier_lot: string | null;
  lisible: boolean;
  notes: string;
  ia_unavailable: boolean;
}

export function LotHalalDrawer({
  open,
  nbLignes,
  fournisseurNom,
  defaultCertifier,
  submitting,
  onClose,
  onConfirm,
}: {
  open: boolean;
  /** Nb de produits reçus → autant de lots créés (info affichée). */
  nbLignes: number;
  fournisseurNom: string | null;
  /** Organisme certif pré-rempli depuis la fiche fournisseur du BDL. */
  defaultCertifier: string | null;
  submitting: boolean;
  onClose: () => void;
  onConfirm: (form: LotHalalForm) => void;
}) {
  const [form, setForm] = useState<LotHalalForm>(EMPTY);
  const [scanOpen, setScanOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // Réinitialise le formulaire à chaque ouverture (pré-remplit le certif
  // depuis le fournisseur du BDL).
  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, certifier_id: defaultCertifier ?? null });
    }
  }, [open, defaultCertifier]);

  // Scroll-lock le body tant que le drawer est ouvert (cf. règle overlays).
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  async function handleVisionScan(dataUrl: string) {
    setScanOpen(false);
    setAnalyzing(true);
    try {
      const res = await fetch("/api/vision-dlc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ photo_data_url: dataUrl }),
      });
      if (!res.ok) {
        toast.error("Lecture IA indisponible — saisis les dates à la main.");
        return;
      }
      const r = (await res.json()) as DlcApiResult;
      if (r.ia_unavailable || !r.lisible) {
        toast.warning(
          r.notes || "Aucune date lisible — saisis-les à la main.",
          { duration: 3500 },
        );
        return;
      }
      // Pré-remplit uniquement les champs effectivement lus (ne écrase pas
      // une saisie manuelle existante par un null).
      setForm((f) => ({
        ...f,
        dlc: r.dlc ?? f.dlc,
        ddm: r.ddm ?? f.ddm,
        date_abattage: r.date_abattage ?? f.date_abattage,
        supplier_lot: r.supplier_lot ?? f.supplier_lot,
      }));
      toast.success(r.notes || "Dates pré-remplies — vérifie puis confirme.", {
        duration: 3000,
      });
    } catch {
      toast.error("Lecture IA échouée — saisis les dates à la main.");
    } finally {
      setAnalyzing(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer"
        className="fixed inset-0 z-40"
        style={{
          background: "rgba(8,42,32,0.55)",
          backdropFilter: "blur(6px)",
        }}
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        transition={{ type: "spring", damping: 32, stiffness: 360 }}
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col"
        style={{
          maxHeight: "94vh",
          background: "var(--bg-cream)",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          boxShadow: "0 -8px 32px rgba(14, 59, 46, 0.2)",
        }}
      >
        <div className="relative pt-3 pb-2 shrink-0">
          <div
            className="mx-auto rounded-full"
            style={{ width: 44, height: 5, background: "var(--border-medium)" }}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="absolute right-4 top-3 p-2 rounded-full"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-light)",
            }}
          >
            <X size={18} color="var(--text-secondary)" />
          </button>
        </div>

        <div className="px-5 pb-3 shrink-0">
          <p className="label-caps" style={{ color: "var(--text-secondary)" }}>
            Traçabilité halal
          </p>
          <h2 className="h2 flex items-center gap-2">
            <ShieldCheck size={20} color="var(--accent-gold)" />
            Lot de réception
          </h2>
          <p
            className="body-sm mt-1"
            style={{ color: "var(--text-secondary)" }}
          >
            {fournisseurNom ? `${fournisseurNom} · ` : ""}
            {nbLignes} produit{nbLignes > 1 ? "s" : ""} reçu
            {nbLignes > 1 ? "s" : ""} → {nbLignes} lot
            {nbLignes > 1 ? "s" : ""} tracé{nbLignes > 1 ? "s" : ""} (DLC, QR
            halal).
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-4">
          {/* Scan-vision DLC */}
          <button
            type="button"
            onClick={() => setScanOpen(true)}
            disabled={analyzing}
            className="w-full rounded-2xl flex items-center gap-3 text-left"
            style={{
              padding: 14,
              background: "var(--accent-gold-soft)",
              border: "1px dashed var(--accent-gold-hairline)",
              minHeight: 56,
            }}
          >
            {analyzing ? (
              <Loader2
                size={20}
                color="var(--accent-gold)"
                className="animate-spin shrink-0"
              />
            ) : (
              <ScanLine size={20} color="var(--accent-gold)" className="shrink-0" />
            )}
            <span className="min-w-0">
              <span
                className="block font-semibold text-[14px]"
                style={{ color: "var(--text-primary)" }}
              >
                {analyzing ? "Lecture en cours…" : "Scanner le carton (IA)"}
              </span>
              <span
                className="block body-sm flex items-center gap-1"
                style={{ color: "var(--text-secondary)" }}
              >
                <Sparkles size={11} />
                Photo de l&apos;étiquette → DLC + lot pré-remplis
              </span>
            </span>
          </button>

          <div className="grid grid-cols-2 gap-3">
            <DateField
              label="DLC (limite conso)"
              value={form.dlc}
              onChange={(v) => setForm({ ...form, dlc: v })}
            />
            <DateField
              label="DDM (de préférence)"
              value={form.ddm}
              onChange={(v) => setForm({ ...form, ddm: v })}
            />
          </div>

          <DateField
            label="Date d'abattage"
            value={form.date_abattage}
            onChange={(v) => setForm({ ...form, date_abattage: v })}
          />

          <label className="block">
            <span
              className="label-caps mb-1.5 inline-flex items-center gap-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              <FileText size={14} /> N° lot fournisseur
            </span>
            <input
              type="text"
              className="input-field"
              placeholder="BPM-2026-127"
              value={form.supplier_lot ?? ""}
              onChange={(e) =>
                setForm({ ...form, supplier_lot: e.target.value || null })
              }
            />
          </label>

          <div
            className="rounded-2xl p-4"
            style={{
              background: "var(--accent-gold-soft)",
              border: "1px solid var(--accent-gold-hairline)",
            }}
          >
            <p className="section-eyebrow mb-3 flex items-center gap-1.5">
              <ShieldCheck size={14} /> Certificat halal
            </p>
            <label className="block">
              <span
                className="label-caps mb-1.5 inline-block"
                style={{ color: "var(--text-secondary)" }}
              >
                Organisme certificateur
              </span>
              <select
                className="input-field"
                aria-label="Organisme certificateur halal du lot"
                value={form.certifier_id ?? ""}
                onChange={(e) =>
                  setForm({ ...form, certifier_id: e.target.value || null })
                }
              >
                <option value="">Aucun</option>
                {ORGANISMES.map((o) => (
                  <option key={o} value={o}>
                    {o === "MOSQUEE_PARIS" ? "Mosquée de Paris" : o}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <label className="block">
                <span
                  className="label-caps mb-1.5 inline-block"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Abattoir
                </span>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Bigard Castres"
                  value={form.abattoir_nom ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, abattoir_nom: e.target.value || null })
                  }
                />
              </label>
              <label className="block">
                <span
                  className="label-caps mb-1.5 inline-block"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Pays
                </span>
                <input
                  type="text"
                  className="input-field"
                  placeholder="FR"
                  maxLength={2}
                  value={form.abattoir_pays ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      abattoir_pays:
                        e.target.value.toUpperCase().slice(0, 2) || null,
                    })
                  }
                />
              </label>
            </div>
          </div>

          <p className="body-sm" style={{ color: "var(--text-tertiary)" }}>
            Tous les champs sont facultatifs : un lot sans DLC reste tracé. Mais
            sans DLC, pas d&apos;alerte de péremption sur ce lot.
          </p>
        </div>

        <div
          className="px-5 pt-3 shrink-0"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
            borderTop: "1px solid var(--border-light)",
            background: "var(--bg-card)",
          }}
        >
          <button
            type="button"
            disabled={submitting}
            onClick={() => onConfirm(form)}
            className="btn-primary w-full"
            style={{ minHeight: 52 }}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Validation…
              </>
            ) : (
              <>
                <ShieldCheck size={16} /> Valider la réception
              </>
            )}
          </button>
        </div>
      </motion.div>

      {/* Caméra dédiée au scan-vision DLC */}
      <PhotoCapture
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onCapture={(d) => void handleVisionScan(d)}
      />
    </>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="block">
      <span
        className="label-caps mb-1.5 inline-flex items-center gap-1.5"
        style={{ color: "var(--text-secondary)" }}
      >
        <Calendar size={14} /> {label}
      </span>
      <input
        type="date"
        className="input-field"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      />
    </label>
  );
}
