"use client";

/* /v2/fournisseurs — Admin certifs halal
 * ─────────────────────────────────────
 * Vue pour Otmane : tous les fournisseurs avec un focus sur l'expiration
 * de leur certificat halal. Tri par urgence (expirée → bientôt → ok).
 *
 * Édition inline simple : organisme + numéro + date d'expiration + URL
 * PDF. Pas d'upload de fichier ici (out of scope T+10) — on accepte une
 * URL (Drive, dropbox, mail).
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  Calendar,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  Pencil,
  Save,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { EditorialEyebrow } from "@/components/v2/EditorialEyebrow";
import { CertHalalBadge } from "@/components/po/cert-halal-badge";
import { supabase } from "@/lib/supabase";
import {
  certifAlerte,
  ORGANISME_LABELS,
  type CertifOrganisme,
  type FournisseurFull,
} from "@/lib/types/po";

const ORGANISMES: CertifOrganisme[] = [
  "AVS",
  "ARGML",
  "ACMIF",
  "SFCVH",
  "MOSQUEE_PARIS",
  "AUTRE",
];

/** Ordre de tri : urgence d'abord. */
const ALERTE_ORDER = {
  expiree: 0,
  manquante: 1,
  expire_30j: 2,
  expire_60j: 3,
  ok: 4,
} as const;

export default function FournisseursPage() {
  const [list, setList] = useState<FournisseurFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<FournisseurFull | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const sb = supabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    const { data, error } = await sb
      .from("fournisseurs")
      .select(
        `
        id, nom, email, email_commandes, lead_time_jours, min_commande_euros,
        franco_de_port, jours_livraison, certif_organisme, certif_numero,
        certif_expire_le, certif_pdf_url, actif, adresse, siret
      `,
      )
      .eq("actif", true)
      .order("nom");
    if (error) {
      console.error("[fournisseurs] load", error);
      toast.error(
        "Impossible de charger les fournisseurs. Vérifie ta connexion.",
      );
    } else {
      setList((data ?? []) as unknown as FournisseurFull[]);
    }
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filteredList = q
      ? list.filter(
          (f) =>
            f.nom.toLowerCase().includes(q) ||
            (f.certif_numero ?? "").toLowerCase().includes(q) ||
            (f.certif_organisme ?? "").toLowerCase().includes(q),
        )
      : list;
    return [...filteredList].sort((a, b) => {
      const aA = ALERTE_ORDER[certifAlerte(a.certif_expire_le)];
      const aB = ALERTE_ORDER[certifAlerte(b.certif_expire_le)];
      if (aA !== aB) return aA - aB;
      return a.nom.localeCompare(b.nom, "fr");
    });
  }, [list, search]);

  const counts = useMemo(() => {
    const acc = { expiree: 0, expire_30j: 0, ok: 0, manquante: 0 };
    for (const f of list) {
      const a = certifAlerte(f.certif_expire_le);
      if (a === "expiree") acc.expiree++;
      else if (a === "expire_30j") acc.expire_30j++;
      else if (a === "manquante") acc.manquante++;
      else acc.ok++;
    }
    return acc;
  }, [list]);

  return (
    <V2Shell>
      <PageAccentStripe accent="or-sapin" />
      <div className="px-5 pt-4 pb-nav-stack">
        <BackButton href="/v2/po" />

        <header className="mt-4 mb-5">
          <EditorialEyebrow num="02" label="Cockpit certifs" />
          <h1 className="h1-display mt-2">
            <em className="gold">Fournisseurs</em> halal
          </h1>
          <p
            className="body-md mt-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Tous tes fournisseurs, triés par urgence de renouvellement de
            certif. Une commande ne part jamais avec un certif KO.
          </p>
        </header>

        {/* Strip stats */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          <StatPill value={counts.expiree} label="Expirés" tone="danger" />
          <StatPill value={counts.manquante} label="Manquants" tone="danger" />
          <StatPill value={counts.expire_30j} label="< 30 j" tone="warning" />
          <StatPill value={counts.ok} label="OK" tone="success" />
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search
            size={16}
            color="var(--text-tertiary)"
            className="absolute top-1/2 -translate-y-1/2 left-4 pointer-events-none"
          />
          <input
            id="fournisseurs-search"
            type="search"
            aria-label="Chercher un fournisseur par nom ou numéro de certificat"
            placeholder="Chercher un fournisseur, n° AVS/ARGML…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field"
            style={{ paddingLeft: 40 }}
          />
        </div>

        {/* Liste */}
        {loading ? (
          <div
            className="flex items-center gap-2 text-[14px]"
            style={{ color: "var(--text-secondary)" }}
          >
            <Loader2 size={16} className="animate-spin" /> Chargement…
          </div>
        ) : filtered.length === 0 ? (
          <div className="card text-center" style={{ padding: 28 }}>
            <Building2
              size={32}
              color="var(--text-tertiary)"
              className="mx-auto mb-2"
            />
            <p className="body-md">Aucun fournisseur ne correspond.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((f) => (
              <motion.li
                key={f.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="card" style={{ padding: 14 }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3
                        className="h3"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {f.nom}
                      </h3>
                      <p className="body-sm mt-0.5 flex items-center gap-1.5">
                        <Mail size={12} />
                        {f.email_commandes ?? f.email ?? "Email non renseigné"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditing(f)}
                      className="btn-ghost"
                      style={{ minHeight: 36, paddingInline: 14 }}
                    >
                      <Pencil size={14} /> Éditer
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
                    <CertHalalBadge
                      organisme={f.certif_organisme}
                      numero={f.certif_numero}
                      expireLe={f.certif_expire_le}
                      size="md"
                      verbose
                    />
                    {f.certif_pdf_url && (
                      <a
                        href={f.certif_pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[13px] font-semibold"
                        style={{ color: "var(--primary-green)" }}
                      >
                        <FileText size={14} /> PDF certif
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </div>

      <EditDrawer
        fournisseur={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await load();
        }}
      />
    </V2Shell>
  );
}

function StatPill({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "danger" | "warning" | "success";
}) {
  const color = {
    danger: "var(--danger)",
    warning: "var(--warning)",
    success: "var(--success)",
  }[tone];
  return (
    <div
      className="card"
      style={{
        padding: 10,
        textAlign: "center",
        background:
          value === 0 && tone !== "success"
            ? "var(--bg-card)"
            : "var(--bg-card)",
      }}
    >
      <p
        className="font-bold tabular leading-none"
        style={{
          fontSize: 22,
          color: value > 0 ? color : "var(--text-tertiary)",
        }}
      >
        {value}
      </p>
      <p
        className="label-caps mt-1"
        style={{ fontSize: 9, color: "var(--text-secondary)" }}
      >
        {label}
      </p>
    </div>
  );
}

/* ───────────────────────── Edit Drawer ───────────────────────── */

function EditDrawer({
  fournisseur,
  onClose,
  onSaved,
}: {
  fournisseur: FournisseurFull | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<Partial<FournisseurFull>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(fournisseur ?? {});
  }, [fournisseur]);

  useEffect(() => {
    if (!fournisseur) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [fournisseur]);

  if (!fournisseur) return null;

  async function save() {
    const sb = supabase();
    if (!sb || !fournisseur) return;
    setSaving(true);
    const { error } = await sb
      .from("fournisseurs")
      .update({
        email_commandes: form.email_commandes ?? null,
        lead_time_jours: form.lead_time_jours ?? null,
        min_commande_euros: form.min_commande_euros ?? null,
        franco_de_port: form.franco_de_port ?? null,
        certif_organisme: form.certif_organisme ?? null,
        certif_numero: form.certif_numero ?? null,
        certif_expire_le: form.certif_expire_le ?? null,
        certif_pdf_url: form.certif_pdf_url ?? null,
      })
      .eq("id", fournisseur.id);
    setSaving(false);
    if (error) {
      console.error(error);
      toast.error(
        "Impossible d'enregistrer le fournisseur. Réessaie dans un instant.",
      );
      return;
    }
    toast.success("Fournisseur mis à jour");
    await onSaved();
  }

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
          maxHeight: "92vh",
          background: "var(--bg-cream)",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          boxShadow: "0 -8px 32px rgba(14, 59, 46, 0.2)",
        }}
      >
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
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-light)",
            }}
          >
            <X size={18} color="var(--text-secondary)" />
          </button>
        </div>

        <div className="px-5 pb-3">
          <p className="label-caps" style={{ color: "var(--text-secondary)" }}>
            Fournisseur
          </p>
          <h2 className="h2">{fournisseur.nom}</h2>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-4">
          <Field label="Email commandes" icon={<Mail size={14} />}>
            <input
              type="email"
              className="input-field"
              placeholder="commandes@fournisseur.fr"
              value={form.email_commandes ?? ""}
              onChange={(e) =>
                setForm({ ...form, email_commandes: e.target.value || null })
              }
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Lead-time (jours)">
              <input
                type="number"
                min={0}
                className="input-field"
                value={form.lead_time_jours ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    lead_time_jours: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              />
            </Field>
            <Field label="Mini cmd (€)">
              <input
                type="number"
                min={0}
                step="0.01"
                className="input-field"
                value={form.min_commande_euros ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    min_commande_euros: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              />
            </Field>
          </div>

          <Field label="Franco de port (€)">
            <input
              type="number"
              min={0}
              step="0.01"
              className="input-field"
              value={form.franco_de_port ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  franco_de_port: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
            />
          </Field>

          <div
            className="rounded-2xl p-4"
            style={{
              background: "var(--accent-gold-soft)",
              border: "1px solid var(--accent-gold-hairline)",
            }}
          >
            <p className="section-eyebrow mb-3 flex items-center gap-1.5">
              <ShieldCheck size={14} /> Certif halal
            </p>

            <Field label="Organisme">
              <select
                className="input-field"
                aria-label="Organisme certificateur halal"
                value={form.certif_organisme ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    certif_organisme:
                      (e.target.value as CertifOrganisme) || null,
                  })
                }
              >
                <option value="">Aucun</option>
                {ORGANISMES.map((o) => (
                  <option key={o} value={o}>
                    {ORGANISME_LABELS[o]}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="N° certif">
                <input
                  type="text"
                  className="input-field"
                  placeholder="AVS-2024-1234"
                  value={form.certif_numero ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, certif_numero: e.target.value || null })
                  }
                />
              </Field>
              <Field label="Expire le" icon={<Calendar size={14} />}>
                <input
                  type="date"
                  className="input-field"
                  value={form.certif_expire_le ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      certif_expire_le: e.target.value || null,
                    })
                  }
                />
              </Field>
            </div>

            <Field label="URL PDF certif" icon={<FileText size={14} />}>
              <input
                type="url"
                className="input-field"
                placeholder="https://drive.google.com/…"
                value={form.certif_pdf_url ?? ""}
                onChange={(e) =>
                  setForm({ ...form, certif_pdf_url: e.target.value || null })
                }
              />
            </Field>
          </div>
        </div>

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
            disabled={saving}
            onClick={save}
            className="btn-primary w-full"
            style={{ minHeight: 52 }}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Enregistrement…
              </>
            ) : (
              <>
                <Save size={16} /> Enregistrer
              </>
            )}
          </button>
        </div>
      </motion.div>
    </>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="label-caps mb-1.5 inline-flex items-center gap-1.5"
        style={{ color: "var(--text-secondary)" }}
      >
        {icon} {label}
      </span>
      {children}
    </label>
  );
}
