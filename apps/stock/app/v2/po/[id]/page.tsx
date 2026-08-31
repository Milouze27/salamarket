"use client";

/* /v2/po/[id] — Édition complète d'un PO (brouillon ou suivi)
 * ──────────────────────────────────────────────────────────
 * Permet à Otmane d'ajuster les quantités, le prix HT, supprimer une
 * ligne, écrire une note, AVANT d'envoyer. Sur un PO déjà envoyé, les
 * éditions sont verrouillées sauf "marquer reçu" / "matcher BDL".
 *
 * Mobile-first : chaque ligne = card empilée, contrôles +/− gros.
 *
 * POSTE DE TRAVAIL (≥ 1024 px) — 31/08/2026
 * Une fiche de commande n'est pas une bande verticale : à 1440 px, la pile
 * de cartes ne montrait que 2 lignes de commande sur 14 (mesuré au banc).
 * Doctrine appliquée : à gauche le DÉTAIL TABULAIRE (les lignes sont un
 * tableau, elles ont toutes les mêmes colonnes), à droite une colonne
 * collante d'IDENTITÉ & ACTIONS (totaux, envoi, sauvegarde).
 * Sous 1024 px, rien ne change : les cartes au pouce et la barre d'action
 * collée en bas restent le rendu de terrain.
 */

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
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
import { DataTable } from "@/components/v2/DataTable";
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

  // Recalcule et persiste le total du PO depuis les lignes fournies (le
  // trigger DB ne le fait pas, c'est notre app qui orchestre l'agrégation).
  // Partagé par saveLignes et removeLigne pour ne pas désynchroniser le total.
  async function persistTotal(
    sb: NonNullable<ReturnType<typeof supabase>>,
    lignesAJour: PurchaseOrderLigne[],
  ) {
    if (!poId) return;
    const nouveauTotal = lignesAJour.reduce(
      (s, l) =>
        s +
        (Number(l.prix_achat_ht) || 0) * (Number(l.quantite_commandee) || 0),
      0,
    );
    await sb
      .from("purchase_orders")
      .update({ total_ht: nouveauTotal, total_ttc: nouveauTotal * 1.055 })
      .eq("id", poId);
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
    const restantes = lignes.filter((l) => l.id !== id);
    setLignes(restantes);
    await persistTotal(sb, restantes);
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
    await persistTotal(sb, lignes);
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
      <V2Shell layout="flow">
        <PageAccentStripe accent="sapin-or" />
        <div className="px-5 pt-4 pb-nav-stack lg:px-8">
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
    <V2Shell layout="flow">
      <PageAccentStripe accent="sapin-or" />
      {/* 2xl:!pb-10 — à partir de 1536 px la barre d'action collée passe en
        colonne de droite : la réserve de 96 px du CTA du téléphone n'a plus
        d'objet. En dessous, la barre reste en bas et la réserve avec elle. */}
      <div className="px-5 pt-4 pb-cta-stack 2xl:!pb-10 lg:px-8">
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
            className="rise-in mt-4 rounded-[20px] px-4 py-3"
            style={{
              background: "var(--danger-soft)",
              border: "1px solid var(--danger-border)",
              color: "var(--danger)",
            }}
          >
            <p className="flex items-center gap-2 font-semibold text-[14px]">
              <ShieldAlert size={16} /> Envoi bloqué — certif{" "}
              {alerte === "expiree" ? "expiré" : "manquant"}
            </p>
            <p className="text-[13px] mt-1" style={{ color: "var(--danger)" }}>
              Mets à jour le PDF de certif dans la fiche fournisseur, ou bascule
              ces produits sur un fournisseur backup.
            </p>
          </div>
        )}

        {/* Deux volets à partir de 1536 px seulement. Deux mesures l'ont
          imposé : à 1024 px un panneau de 320 px ne laissait que 543 px au
          tableau (colonne « Sous-total » coupée) ; à 1280 px il restait
          602 px pour 556 px de colonnes fixes, soit 46 px pour la référence
          produit. En dessous de 1536 px le tableau prend donc toute la
          largeur et les totaux passent dessous. */}
        <div className="mt-5 grid gap-5 2xl:grid-cols-[minmax(0,1fr)_320px] 2xl:items-start 2xl:gap-8">
        {/* Lignes */}
        <section className="min-w-0">
          <p className="section-eyebrow mb-3">
            {lignes.length} ligne{lignes.length > 1 ? "s" : ""}
          </p>

          {/* ── POSTE DE TRAVAIL (≥lg) : les lignes sont un tableau ──────
            Même donnée, même édition, 14 lignes lisibles d'un coup au lieu
            de 2 cartes. La saisie reste possible : quantité et prix HT sont
            des champs, la corbeille garde sa cible de 36 px. */}
          {lignes.length > 0 && (
            <div className="hidden lg:block">
              <DataTable
                rows={lignes}
                getKey={(l) => l.id}
                caption={`Lignes de la commande ${po.numero_po}`}
                columns={[
                  {
                    key: "reference",
                    label: "Référence",
                    sort: (a, b) =>
                      (a.reference_fourn ?? a.produit_id).localeCompare(
                        b.reference_fourn ?? b.produit_id,
                        "fr",
                      ),
                    render: (l) => (
                      <span
                        className="font-semibold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {l.reference_fourn ??
                          `Produit ${l.produit_id.slice(0, 8)}`}
                      </span>
                    ),
                  },
                  {
                    key: "quantite",
                    label: "Quantité",
                    width: "140px",
                    align: "right",
                    sort: (a, b) =>
                      Number(a.quantite_commandee) - Number(b.quantite_commandee),
                    render: (l) => (
                      <ChampNombre
                        value={Number(l.quantite_commandee)}
                        readOnly={!isDraft}
                        ariaLabel={`Quantité commandée — ${l.reference_fourn ?? "ligne"}`}
                        onChange={(v) =>
                          updateLigne(l.id, { quantite_commandee: v })
                        }
                      />
                    ),
                  },
                  {
                    key: "prix",
                    label: "Prix HT",
                    width: "150px",
                    align: "right",
                    sort: (a, b) =>
                      Number(a.prix_achat_ht) - Number(b.prix_achat_ht),
                    render: (l) => (
                      <ChampNombre
                        value={Number(l.prix_achat_ht)}
                        pas="0.01"
                        suffixe="€"
                        readOnly={!isDraft}
                        ariaLabel={`Prix d'achat HT — ${l.reference_fourn ?? "ligne"}`}
                        onChange={(v) => updateLigne(l.id, { prix_achat_ht: v })}
                      />
                    ),
                  },
                  {
                    key: "tva",
                    label: "TVA",
                    width: "80px",
                    align: "right",
                    xlOnly: true,
                    render: (l) => (
                      <span style={{ color: "var(--text-secondary)" }}>
                        {Number(l.tva_pct).toLocaleString("fr-FR", {
                          maximumFractionDigits: 1,
                        })}
                        &nbsp;%
                      </span>
                    ),
                  },
                  {
                    key: "sous_total",
                    label: "Sous-total",
                    width: "130px",
                    align: "right",
                    sort: (a, b) =>
                      Number(a.prix_achat_ht) * Number(a.quantite_commandee) -
                      Number(b.prix_achat_ht) * Number(b.quantite_commandee),
                    render: (l) => (
                      <span
                        className="font-bold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {eur(
                          (Number(l.prix_achat_ht) || 0) *
                            (Number(l.quantite_commandee) || 0),
                        )}
                      </span>
                    ),
                  },
                  ...(isDraft
                    ? [
                        {
                          key: "retirer",
                          label: "",
                          width: "56px",
                          align: "center" as const,
                          render: (l: PurchaseOrderLigne) => (
                            <button
                              type="button"
                              onClick={() => removeLigne(l.id)}
                              aria-label={`Retirer ${l.reference_fourn ?? "la ligne"} du brouillon`}
                              className="w-9 h-9 rounded-full inline-flex items-center justify-center"
                              style={{
                                background: "var(--surface-2)",
                                color: "var(--danger)",
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          ),
                        },
                      ]
                    : []),
                ]}
                emptyLabel="Aucune ligne dans ce brouillon."
              />
              <p
                className="text-[12px] mt-3"
                style={{ color: "var(--text-tertiary)" }}
              >
                {lignes.length} ligne{lignes.length > 1 ? "s" : ""} affichée
                {lignes.length > 1 ? "s" : ""} — la commande est montrée en
                entier, sans plafond.
              </p>
            </div>
          )}

          {/* ── TERRAIN (<lg) : cartes au pouce, inchangées ───────────── */}
          {lignes.length === 0 ? (
            <div className="lg rise-in text-center" style={{ padding: 28 }}>
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
            <ul className="space-y-2 lg:hidden">
              {lignes.map((l, i) => (
                <li
                  key={l.id}
                  className="lg rise-in"
                  style={{ padding: 14, ["--i" as string]: i }}
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
                      className="tap mt-3 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-semibold"
                      style={{ color: "var(--danger)" }}
                    >
                      <Trash2 size={14} /> Retirer la ligne
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Totaux + actions — colonne d'identité du poste de travail.
          Sur ordinateur elle reste sous les yeux pendant qu'on fait défiler
          les lignes (sticky) ; au téléphone elle se referme sous la liste et
          l'action vit dans la barre collée en bas. */}
        <div className="2xl:sticky 2xl:top-4 space-y-3">
          <section className="lg rise-in" style={{ padding: 16 }}>
            <Row label="Total HT" value={eur(totalHt)} />
            <Row label="TVA 5,5 %" value={eur(totalHt * 0.055)} muted />
            <div
              className="mt-2 pt-2"
              style={{ borderTop: "1px solid var(--border-light)" }}
            >
              <Row label="Total TTC" value={eur(totalHt * 1.055)} bold />
            </div>
          </section>

          {isDraft && (
            <div className="hidden 2xl:block">
              {dirty ? (
                <button
                  type="button"
                  onClick={saveLignes}
                  disabled={saving}
                  className="tap btn-primary w-full"
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
                  className="tap btn-primary w-full"
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
          )}
        </div>
        </div>
      </div>

      {/* CTA bottom — terrain seulement : sur ordinateur l'action a rejoint la
        colonne d'identité, à droite du tableau. */}
      {isDraft && (
        <div
          className="bar-desktop 2xl:hidden fixed inset-x-0 cta-above-nav z-30 px-4"
          style={{ background: "transparent" }}
        >
          <div
            className="glass-bar flex gap-2 rounded-[24px]"
            style={{ padding: 10 }}
          >
            {dirty ? (
              <button
                type="button"
                onClick={saveLignes}
                disabled={saving}
                className="tap btn-primary flex-1"
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
                className="tap btn-primary flex-1"
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

/** Champ de saisie compact pour une cellule de tableau (≥ lg uniquement).
 * Le stepper +/− de 48 px est fait pour le pouce ; à la souris, un champ
 * aligné à droite se saisit plus vite et laisse la colonne étroite. */
function ChampNombre({
  value,
  onChange,
  readOnly,
  pas,
  suffixe,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  readOnly?: boolean;
  pas?: string;
  suffixe?: string;
  ariaLabel: string;
}) {
  if (readOnly) {
    return (
      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
        {value.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}
        {suffixe ? ` ${suffixe}` : ""}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-xl px-2"
      style={{
        background: "var(--surface-0)",
        border: "1px solid var(--border-light)",
        height: 34,
      }}
    >
      <input
        type="number"
        inputMode="decimal"
        step={pas}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-[84px] text-right font-semibold tabular bg-transparent outline-none"
        style={{ fontSize: 13.5, color: "var(--text-primary)" }}
      />
      {suffixe && (
        <span
          className="font-semibold"
          style={{ fontSize: 12.5, color: "var(--text-secondary)" }}
        >
          {suffixe}
        </span>
      )}
    </span>
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
          background: readOnly ? "var(--bg-cream)" : "var(--surface-0)",
          border: "1px solid var(--border-light)",
          borderRadius: "var(--radius-lg)",
          height: 48,
          overflow: "hidden",
        }}
      >
        <button
          type="button"
          disabled={readOnly}
          onClick={() => onChange(Math.max(0, value - 1))}
          className="tap px-3 h-full flex items-center justify-center"
          style={{ color: "var(--primary-green)", minWidth: 44 }}
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
          className="tap px-3 h-full flex items-center justify-center"
          style={{ color: "var(--primary-green)", minWidth: 44 }}
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
          background: readOnly ? "var(--bg-cream)" : "var(--surface-0)",
          border: "1px solid var(--border-light)",
          borderRadius: "var(--radius-lg)",
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
