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
import { EmptyState } from "@/components/v2/EmptyState";
import { DataTable } from "@/components/v2/DataTable";
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

/** Date compacte pour le tableau (colonnes serrées, alignement chiffré). */
function dateTableau(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}

/** État de paiement lisible : pastille de couleur + libellé en clair. */
function Pastille({ couleur, texte }: { couleur: string; texte: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: couleur }}
      />
      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
        {texte}
      </span>
    </span>
  );
}

/** Échappe une cellule CSV (quote si , ; " ou retour ligne). */
function csvCell(v: string | number): string {
  const s = String(v ?? "");
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function FacturesPanel() {
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
    <>
      {/* KPI impayé + retard */}
      {!loading && factures.length > 0 && (
        <div className="px-5 mt-5 grid grid-cols-2 gap-2.5 lg:max-w-[640px]">
          <div
            className="lg rise-in p-3.5"
            style={{ "--i": 0 } as React.CSSProperties}
          >
            <p className="label-caps text-text-tertiary">Reste à encaisser</p>
            <p className="text-[20px] font-extrabold text-text-primary tabular-nums mt-0.5">
              {eur(totalImpaye)}
            </p>
          </div>
          <div
            style={{ "--i": 1 } as React.CSSProperties}
            className={`lg rise-in p-3.5 ${nbRetard > 0 ? "bg-danger-soft !border-danger/30" : ""}`}
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
          <div className="lg p-10 flex items-center justify-center gap-3">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <p className="text-sm text-text-secondary">Chargement…</p>
          </div>
        ) : visibles.length === 0 ? (
          <div className="lg">
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
          <>
            {/* ── POSTE DE TRAVAIL (≥ lg) : tableau ────────────────────────
              Une relance se prépare en balayant échéances et retards : la
              carte n'en montrait qu'un par ligne. Le tableau les met en
              colonne, triables, avec le HT et la TVA pour la compta. */}
            <div className="hidden lg:block">
              <DataTable<CommandePro>
                rows={visibles}
                getKey={(c) => c.id}
                caption={`Factures pro, ${visibles.length} ligne${visibles.length > 1 ? "s" : ""}`}
                defaultSort={{ key: "date_echeance", dir: "asc" }}
                onRowClick={(c) => setDetail(c)}
                emptyLabel="Aucune facture pour ce filtre."
                rowAccent={(c) =>
                  estEnRetard(c, today)
                    ? "var(--danger)"
                    : c.statut === "facturee"
                      ? "var(--warning)"
                      : null
                }
                columns={[
                  {
                    key: "facture_numero",
                    label: "N° facture",
                    width: "155px",
                    sort: (a, b) =>
                      (a.facture_numero ?? "").localeCompare(
                        b.facture_numero ?? "",
                        "fr",
                      ),
                    render: (c) => (
                      <span
                        className="mono text-[12.5px]"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {c.facture_numero ?? "—"}
                      </span>
                    ),
                  },
                  {
                    key: "numero_commande",
                    label: "Commande",
                    width: "150px",
                    xlOnly: true,
                    render: (c) => (
                      <span
                        className="mono text-[12.5px]"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {c.numero_commande ?? "—"}
                      </span>
                    ),
                  },
                  {
                    key: "client",
                    label: "Client",
                    sort: (a, b) =>
                      (a.comptes_pro?.raison_sociale ?? "").localeCompare(
                        b.comptes_pro?.raison_sociale ?? "",
                        "fr",
                      ),
                    render: (c) => (
                      <span
                        className="font-semibold truncate block"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {c.comptes_pro?.raison_sociale ?? "Client inconnu"}
                      </span>
                    ),
                  },
                  {
                    key: "conditions",
                    label: "Conditions",
                    width: "165px",
                    xlOnly: true,
                    render: (c) => (
                      <span style={{ color: "var(--text-secondary)" }}>
                        {c.comptes_pro
                          ? CONDITIONS_LABEL[c.comptes_pro.conditions_paiement]
                          : "—"}
                      </span>
                    ),
                  },
                  {
                    key: "date_commande",
                    label: "Commandée le",
                    width: "135px",
                    xlOnly: true,
                    sort: (a, b) =>
                      a.date_commande.localeCompare(b.date_commande),
                    render: (c) => (
                      <span
                        className="tabular-nums"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {dateTableau(c.date_commande)}
                      </span>
                    ),
                  },
                  {
                    key: "date_echeance",
                    label: "Échéance",
                    width: "130px",
                    sort: (a, b) =>
                      (a.date_echeance ?? "").localeCompare(
                        b.date_echeance ?? "",
                      ),
                    render: (c) => (
                      <span
                        className="tabular-nums"
                        style={{
                          color: estEnRetard(c, today)
                            ? "var(--danger)"
                            : "var(--text-secondary)",
                        }}
                      >
                        {dateTableau(c.date_echeance)}
                      </span>
                    ),
                  },
                  {
                    key: "retard",
                    label: "Retard",
                    width: "95px",
                    align: "right",
                    sort: (a, b) => joursRetard(a, today) - joursRetard(b, today),
                    render: (c) => {
                      const j = joursRetard(c, today);
                      return j > 0 ? (
                        <span
                          className="font-bold"
                          style={{ color: "var(--danger)" }}
                        >
                          {j} j
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-tertiary)" }}>—</span>
                      );
                    },
                  },
                  {
                    key: "montant_ht",
                    label: "HT",
                    width: "120px",
                    align: "right",
                    xlOnly: true,
                    sort: (a, b) => a.montant_ht - b.montant_ht,
                    render: (c) => (
                      <span style={{ color: "var(--text-tertiary)" }}>
                        {eur(c.montant_ht)}
                      </span>
                    ),
                  },
                  {
                    key: "montant_ttc",
                    label: "Total TTC",
                    width: "130px",
                    align: "right",
                    sort: (a, b) => a.montant_ttc - b.montant_ttc,
                    render: (c) => (
                      <span
                        className="font-bold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {eur(c.montant_ttc)}
                      </span>
                    ),
                  },
                  {
                    key: "paiement",
                    label: "Paiement",
                    width: "170px",
                    render: (c) =>
                      c.statut === "payee" ? (
                        <Pastille
                          couleur="var(--success)"
                          texte={`Payée le ${dateTableau(c.date_paiement)}`}
                        />
                      ) : estEnRetard(c, today) ? (
                        <Pastille couleur="var(--danger)" texte="En retard" />
                      ) : (
                        <Pastille couleur="var(--warning)" texte="Impayée" />
                      ),
                  },
                ]}
              />
            </div>

            {/* ── TERRAIN (< lg) : cartes au pouce, inchangées ───────────── */}
            <div className="lg:hidden space-y-2.5">
              {visibles.map((c, idx) => (
                <FactureCard
                  key={c.id}
                  facture={c}
                  index={idx}
                  today={today}
                  onClick={() => setDetail(c)}
                />
              ))}
            </div>
          </>
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
    </>
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

      <button
        type="button"
        onClick={() => {
          // Ouvre l'onglet AVANT l'await (anti pop-up bloquée), puis pose
          // l'URL signée générée côté serveur (route protégée par token).
          const win = window.open("", "_blank", "noopener,noreferrer");
          void import("@/lib/actions/doc-url")
            .then((m) => m.signFacturePdfUrl(facture.id))
            .then((url) => {
              if (win) win.location.href = url;
            })
            .catch(() => win?.close());
        }}
        className="mt-5 w-full bg-[var(--surface-2)] border border-rule text-text-primary rounded-[18px] py-3.5 px-5 flex items-center justify-center gap-2 font-bold active:scale-[0.99] transition-transform"
      >
        <FileText className="w-4.5 h-4.5 text-[var(--primary-green)]" />
        Télécharger la facture PDF
      </button>

      <div className="mt-3">
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
  index,
  today,
  onClick,
}: {
  facture: CommandePro;
  index: number;
  today: Date;
  onClick: () => void;
}) {
  const payee = facture.statut === "payee";
  const retard = estEnRetard(facture, today);
  const jours = joursRetard(facture, today);
  return (
    <button
      onClick={onClick}
      style={{ "--i": Math.min(index, 8) } as React.CSSProperties}
      className={`lg lg-hover tap rise-in w-full p-3.5 flex items-center gap-3 text-left ${
        retard ? "!border-danger/40" : ""
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
