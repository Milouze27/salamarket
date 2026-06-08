"use client";

/* /v2/po/[id] — Édition complète d'un PO (brouillon ou suivi)
 * ──────────────────────────────────────────────────────────
 * Permet à Otmane d'ajuster les quantités, le prix HT, supprimer une
 * ligne, écrire une note, AVANT d'envoyer. Sur un PO déjà envoyé, les
 * éditions sont verrouillées sauf "marquer reçu" / "matcher BDL".
 *
 * Mobile-first : chaque ligne = card empilée, contrôles +/− gros.
 */

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Check,
  Loader2,
  Minus,
  Plus,
  Save,
  Send,
  ShieldAlert,
  ShoppingCart,
  Trash2,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { CertHalalBadge } from "@/components/po/cert-halal-badge";
import { supabase } from "@/lib/supabase";
import {
  certifAlerte,
  STATUT_LABELS,
  type PurchaseOrderLigne,
  type PurchaseOrderWithJoin,
} from "@/lib/types/po";

function eur(n: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n);
}

export default function PoDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const poId = params?.id;

  const [po, setPo] = useState<PurchaseOrderWithJoin | null>(null);
  const [lignes, setLignes] = useState<PurchaseOrderLigne[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!poId) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poId]);

  async function load() {
    setLoading(true);
    const sb = supabase();
    if (!sb || !poId) {
      setLoading(false);
      return;
    }
    const { data, error } = await sb
      .from("purchase_orders")
      .select(
        `
        id, numero_po, fournisseur_id, depot_destination_id, statut,
        date_creation, date_envoi, date_livraison_prevue, date_reception,
        total_ht, total_ttc, email_envoye_a, email_message_id, bdl_id, notes,
        certif_organisme_snapshot, certif_numero_snapshot, certif_expire_le_snapshot,
        created_at, updated_at,
        fournisseurs:fournisseur_id ( nom, email_commandes, certif_organisme, certif_numero, certif_expire_le ),
        depots:depot_destination_id ( nom ),
        purchase_order_lignes ( id, po_id, produit_id, reference_fourn, quantite_commandee, quantite_recue, prix_achat_ht, tva_pct, ligne_total_ht, notes )
      `,
      )
      .eq("id", poId)
      .single();
    if (error || !data) {
      toast.error("Commande introuvable");
      router.push("/v2/po");
      return;
    }
    const typed = data as unknown as PurchaseOrderWithJoin;
    setPo(typed);
    setLignes(typed.purchase_order_lignes ?? []);
    setLoading(false);
  }

  const isDraft = po?.statut === "brouillon";
  const alerte = po ? certifAlerte(po.fournisseurs?.certif_expire_le) : "ok";
  const bloque = alerte === "expiree" || alerte === "manquante";

  const totalHt = useMemo(
    () =>
      lignes.reduce(
        (s, l) =>
          s +
          (Number(l.prix_achat_ht) || 0) * (Number(l.quantite_commandee) || 0),
        0,
      ),
    [lignes],
  );

  function updateLigne(id: string, patch: Partial<PurchaseOrderLigne>) {
    setLignes((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    );
    setDirty(true);
  }

  async function removeLigne(id: string) {
    if (!confirm("Supprimer cette ligne du brouillon ?")) return;
    const sb = supabase();
    if (!sb) return;
    const { error } = await sb
      .from("purchase_order_lignes")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Suppression impossible");
      return;
    }
    setLignes((prev) => prev.filter((l) => l.id !== id));
  }

  async function saveLignes() {
    if (!isDraft) return;
    const sb = supabase();
    if (!sb || !poId) return;
    setSaving(true);
    // Updates en lot. On évite upsert pour ne pas créer de doublons.
    const updates = await Promise.all(
      lignes.map((l) =>
        sb
          .from("purchase_order_lignes")
          .update({
            quantite_commandee: l.quantite_commandee,
            prix_achat_ht: l.prix_achat_ht,
            notes: l.notes,
          })
          .eq("id", l.id),
      ),
    );
    const failed = updates.find((r) => r.error);
    if (failed?.error) {
      toast.error("Sauvegarde partielle — réessaie");
      setSaving(false);
      return;
    }
    // Recalcule le total HT côté PO (le trigger ne le fait pas, c'est
    // notre app qui orchestre l'agrégation).
    await sb
      .from("purchase_orders")
      .update({ total_ht: totalHt, total_ttc: totalHt * 1.055 })
      .eq("id", poId);
    setDirty(false);
    setSaving(false);
    toast.success("Brouillon mis à jour");
    await load();
  }

  async function sendPo() {
    if (!po || !poId) return;
    if (dirty) {
      toast.error("Sauvegarde tes modifications avant d'envoyer");
      return;
    }
    setSending(true);
    try {
      // Server action (injecte x-internal-secret côté serveur) au lieu d'un
      // fetch direct : la route /api/po/send refuse les appels externes.
      const { sendPoAction } = await import("@/lib/actions/po");
      const r = await sendPoAction(poId);
      if (!r.ok) throw new Error(r.error ?? "Erreur d'envoi");
      toast.success(`Email envoyé à ${r.email}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  if (loading || !po) {
    return (
      <V2Shell>
        <PageAccentStripe accent="sapin-or" />
        <div className="px-5 pt-4 pb-nav-stack">
          <BackButton href="/v2/po" />
          <div
            className="mt-6 flex items-center gap-2 text-[14px]"
            style={{ color: "var(--text-secondary)" }}
          >
            <Loader2 size={16} className="animate-spin" /> Chargement…
          </div>
        </div>
      </V2Shell>
    );
  }

  return (
    <V2Shell>
      <PageAccentStripe accent="sapin-or" />
      <div className="px-5 pt-4 pb-cta-stack">
        <BackButton href="/v2/po" />

        {/* Header */}
        <header className="mt-4">
          <p className="label-caps" style={{ color: "var(--text-secondary)" }}>
            {po.numero_po} · {STATUT_LABELS[po.statut]}
          </p>
          <h1 className="h1 mt-1">{po.fournisseurs?.nom ?? "Fournisseur"}</h1>
          <p className="body-sm mt-1">
            <Truck
              size={12}
              className="inline mr-1"
              style={{ verticalAlign: -2 }}
            />
            {po.depots?.nom ?? "—"}
            {po.date_livraison_prevue && (
              <>
                {" "}
                · livraison prévue{" "}
                {new Date(po.date_livraison_prevue).toLocaleDateString(
                  "fr-FR",
                  { weekday: "short", day: "numeric", month: "long" },
                )}
              </>
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
        </header>

        {/* Alerte certif KO */}
        {bloque && isDraft && (
          <div
            className="mt-4 rounded-2xl px-4 py-3"
            style={{
              background: "#FEF2F1",
              border: "1px solid #F4B7B1",
              color: "#A02921",
            }}
          >
            <p className="flex items-center gap-2 font-semibold text-[14px]">
              <ShieldAlert size={16} /> Envoi bloqué — certif{" "}
              {alerte === "expiree" ? "expiré" : "manquant"}
            </p>
            <p className="text-[13px] mt-1" style={{ color: "#A02921" }}>
              Mets à jour le PDF de certif dans la fiche fournisseur, ou bascule
              ces produits sur un fournisseur backup.
            </p>
          </div>
        )}

        {/* Lignes */}
        <section className="mt-5">
          <p className="section-eyebrow mb-3">
            {lignes.length} ligne{lignes.length > 1 ? "s" : ""}
          </p>
          {lignes.length === 0 ? (
            <div className="card text-center" style={{ padding: 28 }}>
              <ShoppingCart
                size={28}
                color="var(--text-tertiary)"
                className="mx-auto mb-2"
              />
              <p className="body-sm">
                Aucune ligne. Annule ce brouillon ou ajoute des produits depuis
                la page d&apos;un fournisseur.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {lignes.map((l) => (
                <motion.li
                  key={l.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="card"
                  style={{ padding: 14 }}
                >
                  <p
                    className="font-semibold text-[14px]"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {l.reference_fourn ?? `Produit ${l.produit_id.slice(0, 8)}`}
                  </p>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <QtyControl
                      label="Qté"
                      value={Number(l.quantite_commandee)}
                      readOnly={!isDraft}
                      onChange={(v) =>
                        updateLigne(l.id, { quantite_commandee: v })
                      }
                    />
                    <PriceControl
                      label="Prix HT"
                      value={Number(l.prix_achat_ht)}
                      readOnly={!isDraft}
                      onChange={(v) => updateLigne(l.id, { prix_achat_ht: v })}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <p
                      className="text-[13px]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Sous-total
                    </p>
                    <p
                      className="font-bold tabular text-[16px]"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {eur(
                        (Number(l.prix_achat_ht) || 0) *
                          (Number(l.quantite_commandee) || 0),
                      )}
                    </p>
                  </div>
                  {isDraft && (
                    <button
                      type="button"
                      onClick={() => removeLigne(l.id)}
                      className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold"
                      style={{ color: "var(--danger)" }}
                    >
                      <Trash2 size={14} /> Retirer la ligne
                    </button>
                  )}
                </motion.li>
              ))}
            </ul>
          )}
        </section>

        {/* Totaux */}
        <section className="mt-5 card" style={{ padding: 16 }}>
          <Row label="Total HT" value={eur(totalHt)} />
          <Row label="TVA 5,5 %" value={eur(totalHt * 0.055)} muted />
          <div
            className="mt-2 pt-2"
            style={{ borderTop: "1px solid var(--border-light)" }}
          >
            <Row label="Total TTC" value={eur(totalHt * 1.055)} bold />
          </div>
        </section>
      </div>

      {/* CTA bottom */}
      {isDraft && (
        <div
          className="fixed inset-x-0 cta-above-nav z-30 px-4"
          style={{ background: "transparent" }}
        >
          <div
            className="card flex gap-2"
            style={{
              padding: 10,
              boxShadow: "0 -4px 24px rgba(14,59,46,0.10)",
            }}
          >
            {dirty ? (
              <button
                type="button"
                onClick={saveLignes}
                disabled={saving}
                className="btn-primary flex-1"
                style={{ minHeight: 48 }}
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Sauvegarde…
                  </>
                ) : (
                  <>
                    <Save size={16} /> Enregistrer
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={sendPo}
                disabled={sending || bloque}
                className="btn-primary flex-1"
                style={{ minHeight: 48 }}
              >
                {sending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Envoi…
                  </>
                ) : bloque ? (
                  <>
                    <ShieldAlert size={16} /> Bloqué — certif KO
                  </>
                ) : (
                  <>
                    <Send size={16} /> Envoyer au fournisseur
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </V2Shell>
  );
}

/** Stepper qty avec +/− gros — mobile friendly. */
function QtyControl({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  readOnly?: boolean;
}) {
  return (
    <div>
      <p
        className="label-caps mb-1.5"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </p>
      <div
        className="flex items-center"
        style={{
          background: readOnly ? "var(--bg-cream)" : "white",
          border: "1px solid var(--border-light)",
          borderRadius: 14,
          height: 48,
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          disabled={readOnly}
          onClick={() => onChange(Math.max(0, value - 1))}
          className="px-3 h-full flex items-center justify-center"
          style={{ color: "var(--primary-green)" }}
          aria-label="Diminuer"
        >
          <Minus size={18} />
        </button>
        <input
          inputMode="decimal"
          type="number"
          disabled={readOnly}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="flex-1 text-center font-bold tabular bg-transparent outline-none"
          style={{ fontSize: 16, color: "var(--text-primary)" }}
        />
        <button
          type="button"
          disabled={readOnly}
          onClick={() => onChange(value + 1)}
          className="px-3 h-full flex items-center justify-center"
          style={{ color: "var(--primary-green)" }}
          aria-label="Augmenter"
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}

function PriceControl({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  readOnly?: boolean;
}) {
  return (
    <div>
      <p
        className="label-caps mb-1.5"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </p>
      <div
        className="flex items-center"
        style={{
          background: readOnly ? "var(--bg-cream)" : "white",
          border: "1px solid var(--border-light)",
          borderRadius: 14,
          height: 48,
          paddingInline: 12,
        }}
      >
        <input
          inputMode="decimal"
          type="number"
          step="0.01"
          disabled={readOnly}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="flex-1 font-bold tabular bg-transparent outline-none"
          style={{ fontSize: 16, color: "var(--text-primary)" }}
        />
        <span
          className="font-semibold text-[14px]"
          style={{ color: "var(--text-secondary)" }}
        >
          €
        </span>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <p
        className={muted ? "body-sm" : "text-[14px]"}
        style={{
          color: muted ? "var(--text-secondary)" : "var(--text-primary)",
        }}
      >
        {label}
      </p>
      <p
        className="tabular"
        style={{
          fontSize: bold ? 18 : 15,
          fontWeight: bold ? 800 : 600,
          color: muted ? "var(--text-secondary)" : "var(--text-primary)",
        }}
      >
        {value}
      </p>
    </div>
  );
}
