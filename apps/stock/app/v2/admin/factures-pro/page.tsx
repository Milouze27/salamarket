"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  BadgeEuro,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { EmptyState } from "@/components/v2/EmptyState";
import {
  fetchCommandesPro,
  marquerPayee,
  estEnRetard,
  joursRetard,
  CONDITIONS_LABEL,
  type CommandePro,
} from "@/lib/db/pro";

function eur(n: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function dateFr(iso: string | null) {
  if (!iso) return "·";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

type Filtre = "toutes" | "impayees" | "retard" | "payees";

const FILTRES: { key: Filtre; label: string }[] = [
  { key: "impayees", label: "Impayées" },
  { key: "retard", label: "En retard" },
  { key: "payees", label: "Payées" },
  { key: "toutes", label: "Toutes" },
];

/** Échappe une cellule CSV (quote si , ; " ou retour ligne). */
function csvCell(v: string | number): string {
  const s = String(v ?? "");
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function FacturesProPage() {
  const [factures, setFactures] = useState<CommandePro[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filtre, setFiltre] = useState<Filtre>("impayees");
  const [detail, setDetail] = useState<CommandePro | null>(null);

  async function reload() {
    setLoading(true);
    const all = await fetchCommandesPro();
    // Une facture existe dès le statut facturee (ou payee).
    setFactures(
      all.filter((c) => c.statut === "facturee" || c.statut === "payee"),
    );
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, []);

  const today = useMemo(() => new Date(), []);

  const visibles = useMemo(() => {
    switch (filtre) {
      case "impayees":
        return factures.filter((c) => c.statut === "facturee");
      case "retard":
        return factures.filter((c) => estEnRetard(c, today));
      case "payees":
        return factures.filter((c) => c.statut === "payee");
      default:
        return factures;
    }
  }, [factures, filtre, today]);

  const nbRetard = factures.filter((c) => estEnRetard(c, today)).length;
  const totalImpaye = factures
    .filter((c) => c.statut === "facturee")
    .reduce((s, c) => s + c.montant_ttc, 0);

  const detailLive = detail
    ? (factures.find((c) => c.id === detail.id) ?? detail)
    : null;

  async function payer(c: CommandePro) {
    setBusy(true);
    const { error } = await marquerPayee(c.id);
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`${c.facture_numero ?? "Facture"} · marquée payée`);
    setDetail(null);
    void reload();
  }

  function exportCsv() {
    if (visibles.length === 0) {
      toast.error("Rien à exporter pour ce filtre");
      return;
    }
    const header = [
      "Facture",
      "Commande",
      "Client",
      "Conditions",
      "HT",
      "TVA",
      "TTC",
      "Echeance",
      "Statut",
      "Paiement",
      "Jours_retard",
    ];
    const rows = visibles.map((c) => [
      c.facture_numero ?? "",
      c.numero_commande ?? "",
      c.comptes_pro?.raison_sociale ?? "",
      c.comptes_pro ? CONDITIONS_LABEL[c.comptes_pro.conditions_paiement] : "",
      c.montant_ht.toFixed(2),
      c.montant_tva.toFixed(2),
      c.montant_ttc.toFixed(2),
      c.date_echeance ?? "",
      c.statut === "payee" ? "Payee" : "Impayee",
      c.date_paiement ? c.date_paiement.slice(0, 10) : "",
      String(joursRetard(c, today)),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map(csvCell).join(";"))
      .join("\n");
    const blob = new Blob(["﻿" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `factures-pro-${filtre}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${visibles.length} facture(s) exportée(s)`);
  }

  return (
    <V2Shell hideNav>
      <PageAccentStripe accent="or-sapin" />
      <header className="px-5 pt-7">
        <BackButton />
        <p className="section-eyebrow mt-3">
          <FileText className="w-3 h-3" />
          Factures pro · B2B
        </p>
        <h1 className="h1 text-text-primary mt-1">Factures pro</h1>
        <p className="body-md text-text-secondary mt-1">
          Suis les paiements, repère les retards et exporte la compta.
        </p>
      </header>

      {/* KPI impayé + retard */}
      {!loading && factures.length > 0 && (
        <div className="px-5 mt-5 grid grid-cols-2 gap-2.5">
          <div className="bg-[var(--surface-1)] border border-rule rounded-2xl p-3.5">
            <p className="label-caps text-text-tertiary">Reste à encaisser</p>
            <p className="text-[20px] font-extrabold text-text-primary tabular-nums mt-0.5">
              {eur(totalImpaye)}
            </p>
          </div>
          <div
            className={`rounded-2xl p-3.5 border ${nbRetard > 0 ? "bg-danger-soft border-danger/30" : "bg-[var(--surface-1)] border-rule"}`}
          >
            <p className="label-caps text-text-tertiary">En retard</p>
            <p
              className={`text-[20px] font-extrabold tabular-nums mt-0.5 ${nbRetard > 0 ? "text-danger" : "text-text-primary"}`}
            >
              {nbRetard}
            </p>
          </div>
        </div>
      )}

      {/* Filtres + export */}
      <div className="px-5 mt-5 flex items-center gap-2">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide flex-1">
          {FILTRES.map((f) => (
            <button
              key={f.key}
              onClick={() => setFiltre(f.key)}
              data-active={filtre === f.key}
              className="pill-filter min-h-[44px]"
            >
              {f.label}
              {f.key === "retard" && nbRetard > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-extrabold tabular-nums">
                  {nbRetard}
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          onClick={exportCsv}
          className="shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full bg-primary text-white text-[13px] font-bold active:scale-[0.97]"
          aria-label="Exporter en CSV"
        >
          <Download className="w-4 h-4" />
          CSV
        </button>
      </div>

      <section className="px-5 mt-5 pb-10">
        {loading ? (
          <div className="bg-[var(--surface-1)] border border-rule rounded-[20px] p-10 flex items-center justify-center gap-3">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <p className="text-sm text-text-secondary">Chargement…</p>
          </div>
        ) : visibles.length === 0 ? (
          <div className="bg-[var(--surface-1)] border border-rule rounded-[20px]">
            <EmptyState
              icon={FileText}
              title={
                filtre === "retard"
                  ? "Aucun retard"
                  : filtre === "impayees"
                    ? "Aucune facture impayée"
                    : "Aucune facture"
              }
              description={
                filtre === "retard"
                  ? "Toutes les factures sont dans les délais."
                  : "Les factures émises (statut facturée) apparaîtront ici."
              }
              compact
            />
          </div>
        ) : (
          <div className="space-y-2.5">
            {visibles.map((c) => (
              <FactureCard
                key={c.id}
                facture={c}
                today={today}
                onClick={() => setDetail(c)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Detail modal */}
      <AnimatePresence>
        {detailLive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-end justify-center"
            onClick={() => setDetail(null)}
          >
            <motion.div
              initial={{ y: 80 }}
              animate={{ y: 0 }}
              exit={{ y: 80 }}
              transition={{ type: "spring", damping: 26, stiffness: 280 }}
              className="bg-[var(--surface-1)] w-full max-w-[460px] rounded-t-[28px] p-6 pb-10 shadow-card-lg max-h-[88vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <FactureDetail
                facture={detailLive}
                today={today}
                busy={busy}
                onClose={() => setDetail(null)}
                onPayer={() => void payer(detailLive)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </V2Shell>
  );
}

function FactureDetail({
  facture,
  today,
  busy,
  onClose,
  onPayer,
}: {
  facture: CommandePro;
  today: Date;
  busy: boolean;
  onClose: () => void;
  onPayer: () => void;
}) {
  const payee = facture.statut === "payee";
  const retard = estEnRetard(facture, today);
  const jours = joursRetard(facture, today);

  return (
    <>
      <div className="flex items-start justify-between mb-3">
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wide ${
            payee
              ? "bg-success-soft text-success"
              : retard
                ? "bg-danger-soft text-danger"
                : "bg-warning-soft text-warning"
          }`}
        >
          {payee ? "Payée" : retard ? `Retard ${jours} j` : "Impayée"}
        </span>
        <button
          onClick={onClose}
          className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-end"
          aria-label="Fermer"
        >
          <X className="w-5 h-5 text-text-tertiary" />
        </button>
      </div>

      <h2 className="text-[20px] font-extrabold text-text-primary leading-tight">
        {facture.comptes_pro?.raison_sociale ?? "Client inconnu"}
      </h2>
      <p className="text-[12px] font-mono bg-cream text-text-tertiary inline-block px-2 py-1 rounded-lg mt-2">
        {facture.facture_numero ?? facture.numero_commande ?? "Facture"}
      </p>

      <div className="mt-4 bg-cream rounded-2xl p-3.5 flex items-baseline justify-between">
        <p className="label-caps text-text-tertiary">Total TTC</p>
        <p className="text-[22px] font-extrabold text-text-primary tabular-nums">
          {eur(facture.montant_ttc)}
        </p>
      </div>

      {retard && (
        <div className="mt-3 bg-danger-soft rounded-2xl p-3 flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
          <p className="text-[12.5px] font-bold leading-snug text-text-primary">
            Échéance dépassée de {jours} jour{jours > 1 ? "s" : ""} · relance
            recommandée.
          </p>
        </div>
      )}

      <dl className="mt-5 space-y-3 text-[13px]">
        <Row label="Commande" value={facture.numero_commande ?? "·"} />
        <Row
          label="Conditions"
          value={
            facture.comptes_pro
              ? CONDITIONS_LABEL[facture.comptes_pro.conditions_paiement]
              : "·"
          }
        />
        <Row label="Montant HT" value={eur(facture.montant_ht)} />
        <Row label="TVA" value={eur(facture.montant_tva)} />
        <Row label="Échéance" value={dateFr(facture.date_echeance)} />
        {payee && (
          <Row label="Payée le" value={dateFr(facture.date_paiement)} />
        )}
      </dl>

      <div className="mt-6">
        {payee ? (
          <div className="w-full bg-success-soft text-success rounded-[18px] py-3.5 px-5 flex items-center justify-center gap-2 font-extrabold">
            <CheckCircle2 className="w-5 h-5" />
            Réglée le {dateFr(facture.date_paiement)}
          </div>
        ) : (
          <button
            disabled={busy}
            onClick={onPayer}
            className="w-full bg-success text-white rounded-[18px] py-4 px-5 flex items-center justify-between font-bold shadow-card-lg active:scale-[0.99] disabled:opacity-60"
          >
            <span className="text-left">
              <span className="block label-caps text-white/80">
                Encaissement
              </span>
              <span className="block text-[14px] font-extrabold">
                Marquer comme payée
              </span>
            </span>
            <BadgeEuro className="w-5 h-5" />
          </button>
        )}
      </div>
    </>
  );
}

function FactureCard({
  facture,
  today,
  onClick,
}: {
  facture: CommandePro;
  today: Date;
  onClick: () => void;
}) {
  const payee = facture.statut === "payee";
  const retard = estEnRetard(facture, today);
  const jours = joursRetard(facture, today);
  return (
    <button
      onClick={onClick}
      className={`w-full bg-[var(--surface-1)] border rounded-2xl p-3.5 flex items-center gap-3 text-left active:scale-[0.99] transition-transform ${
        retard ? "border-danger/40 shadow-card" : "border-rule"
      }`}
    >
      <span
        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
          payee
            ? "bg-success-soft text-success"
            : retard
              ? "bg-danger-soft text-danger"
              : "bg-warning-soft text-warning"
        }`}
      >
        {payee ? (
          <CheckCircle2 className="w-5 h-5" />
        ) : retard ? (
          <AlertCircle className="w-5 h-5" />
        ) : (
          <Clock className="w-5 h-5" />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-bold text-text-primary truncate">
          {facture.comptes_pro?.raison_sociale ?? "Client inconnu"}
        </p>
        <p className="text-[11.5px] text-text-secondary mt-0.5 truncate">
          {facture.facture_numero ?? facture.numero_commande ?? "·"}
          {payee
            ? " · payée"
            : retard
              ? ` · retard ${jours} j`
              : ` · échéance ${dateFr(facture.date_echeance)}`}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[14px] font-extrabold text-text-primary tabular-nums">
          {eur(facture.montant_ttc)}
        </p>
      </div>
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-text-tertiary text-[12px] font-bold uppercase tracking-wide shrink-0">
        {label}
      </span>
      <span className="font-bold text-text-primary text-right tabular-nums">
        {value}
      </span>
    </div>
  );
}
