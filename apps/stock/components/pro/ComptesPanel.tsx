"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  CheckCircle2,
  Loader2,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/v2/EmptyState";
import { DataTable } from "@/components/v2/DataTable";
import { useV2 } from "@/lib/v2-store";
import {
  fetchComptesPro,
  setCompteStatut,
  COMPTE_STATUT_LABEL,
  CONDITIONS_LABEL,
  type ComptePro,
  type CompteProStatut,
} from "@/lib/db/pro";

function eur(n: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

type FiltreStatut = "tous" | CompteProStatut;

const FILTRES: { key: FiltreStatut; label: string }[] = [
  { key: "tous", label: "Tous" },
  { key: "en_validation", label: "En validation" },
  { key: "actif", label: "Actifs" },
  { key: "suspendu", label: "Suspendus" },
];

const STATUT_CHIP: Record<CompteProStatut, string> = {
  en_validation: "bg-warning-soft text-warning",
  actif: "bg-success-soft text-success",
  suspendu: "bg-danger-soft text-danger",
  archive: "bg-cream text-text-tertiary",
};

/** Couleur de gravité d'un statut, pour la pastille et le filet de ligne. */
const STATUT_COULEUR: Record<CompteProStatut, string> = {
  en_validation: "var(--warning)",
  actif: "var(--success)",
  suspendu: "var(--danger)",
  archive: "var(--text-tertiary)",
};

/** Statut lisible dans un tableau : pastille de couleur + libellé en clair. */
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

// ▼▼▼ RECETTE TEMPORAIRE — À RETIRER ▼▼▼
const DEMO_COMPTES: ComptePro[] = Array.from({ length: 14 }, (_, i) => ({
  id: "c" + i,
  raison_sociale: ["Restaurant Al Bahdja", "Traiteur Nour", "École Ibn Sina", "Boucherie du Mirail", "Snack Le Cèdre", "Pâtisserie Zohra", "Cantine Les Oliviers", "Épicerie Salam Rangueil", "Hôtel Le Capitole", "Cafétéria Papus", "Association Espoir 31", "Food-truck Chorba", "Boulangerie Aïcha", "Maison de retraite Bellevue"][i],
  siret: "8027738120" + (100 + i),
  forme_juridique: i % 2 ? "SARL" : "SAS",
  tva_intracom: "FR" + (40 + i) + "802773812",
  adresse_facturation: (2 + i) + " rue de la Faourette, 31100 Toulouse",
  adresse_livraison: null,
  delegue_nom: ["Ahmed Nasri", "Otmane Jamal", "Sofia Roux", "Karim Amrani", "Leïla Ben Salah"][i % 5],
  delegue_telephone: "06 12 34 " + (10 + i) + " " + (40 + i),
  delegue_email: "contact" + i + "@exemple.fr",
  conditions_paiement: (["comptant", "30_jours", "45_jours_fin_mois"] as const)[i % 3],
  encours_max: 1500 + i * 400,
  encours_actuel: i % 4 === 0 ? 2200 + i * 500 : 300 + i * 180,
  statut: (["en_validation", "actif", "actif", "suspendu", "actif", "archive"] as const)[i % 6],
  notes_interne: null,
  valide_at: null,
  created_at: new Date(Date.now() - i * 86400000).toISOString(),
}));
// ▲▲▲ RECETTE TEMPORAIRE ▲▲▲

export function ComptesPanel() {
  const employe = useV2((s) => s.currentEmploye);
  const [comptes, setComptes] = useState<ComptePro[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filtre, setFiltre] = useState<FiltreStatut>("en_validation");
  const [detail, setDetail] = useState<ComptePro | null>(null);

  async function reload() {
    setLoading(true);
    const d = await fetchComptesPro();
    // ▼▼▼ RECETTE TEMPORAIRE — À RETIRER ▼▼▼
    setComptes(d.length ? d : DEMO_COMPTES);
    // ▲▲▲ RECETTE TEMPORAIRE ▲▲▲
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, []);

  const visibles = useMemo(
    () =>
      filtre === "tous" ? comptes : comptes.filter((c) => c.statut === filtre),
    [comptes, filtre],
  );

  const nbEnValidation = comptes.filter(
    (c) => c.statut === "en_validation",
  ).length;

  async function changerStatut(compte: ComptePro, statut: CompteProStatut) {
    setBusy(true);
    const { error } = await setCompteStatut(
      compte.id,
      statut,
      employe?.id ?? null,
    );
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(
      statut === "actif"
        ? `${compte.raison_sociale} · compte validé`
        : statut === "suspendu"
          ? `${compte.raison_sociale} · compte suspendu`
          : "Compte mis à jour",
    );
    setDetail(null);
    void reload();
  }

  return (
    <>
      {/* Filtres */}
      <div className="px-5 mt-5 flex gap-2 overflow-x-auto scrollbar-hide">
        {FILTRES.map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltre(f.key)}
            data-active={filtre === f.key}
            className="pill-filter min-h-[44px]"
          >
            {f.label}
            {f.key === "en_validation" && nbEnValidation > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-warning text-white text-[10px] font-extrabold tabular-nums">
                {nbEnValidation}
              </span>
            )}
          </button>
        ))}
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
              icon={Building2}
              title={
                filtre === "en_validation"
                  ? "Aucun compte à valider"
                  : "Aucun compte"
              }
              description={
                filtre === "en_validation"
                  ? "Les demandes d'inscription pro apparaîtront ici."
                  : "Aucun compte pro pour ce filtre."
              }
              compact
            />
          </div>
        ) : (
          <>
            {/* ── POSTE DE TRAVAIL (≥ lg) : tableau ────────────────────────
              La grille de cartes montrait 3 comptes par rangée sans le SIRET
              ni les conditions de paiement. Le tableau porte l'encours, le
              plafond et le statut sur une seule ligne, sans plafond de lignes. */}
            <div className="hidden lg:block">
              <DataTable<ComptePro>
                rows={visibles}
                getKey={(c) => c.id}
                caption={`Comptes pro, ${visibles.length} ligne${visibles.length > 1 ? "s" : ""}`}
                defaultSort={{ key: "raison_sociale", dir: "asc" }}
                onRowClick={(c) => setDetail(c)}
                emptyLabel="Aucun compte pour ce filtre."
                rowAccent={(c) =>
                  c.statut === "en_validation"
                    ? "var(--warning)"
                    : c.statut === "suspendu" ||
                        c.encours_actuel > c.encours_max
                      ? "var(--danger)"
                      : null
                }
                columns={[
                  {
                    key: "raison_sociale",
                    label: "Raison sociale",
                    sort: (a, b) =>
                      a.raison_sociale.localeCompare(b.raison_sociale, "fr"),
                    render: (c) => (
                      <span
                        className="font-semibold truncate block"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {c.raison_sociale}
                      </span>
                    ),
                  },
                  {
                    key: "siret",
                    label: "SIRET",
                    width: "160px",
                    xlOnly: true,
                    render: (c) => (
                      <span
                        className="mono text-[12.5px]"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {c.siret || "—"}
                      </span>
                    ),
                  },
                  {
                    key: "delegue_nom",
                    label: "Délégué",
                    width: "170px",
                    sort: (a, b) =>
                      a.delegue_nom.localeCompare(b.delegue_nom, "fr"),
                    render: (c) => (
                      <span
                        className="truncate block"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {c.delegue_nom || "—"}
                      </span>
                    ),
                  },
                  {
                    key: "delegue_telephone",
                    label: "Téléphone",
                    width: "145px",
                    xlOnly: true,
                    render: (c) => (
                      <span
                        className="tabular-nums"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {c.delegue_telephone || "—"}
                      </span>
                    ),
                  },
                  {
                    key: "delegue_email",
                    label: "Email",
                    width: "230px",
                    xlOnly: true,
                    render: (c) => (
                      <span
                        className="truncate block"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {c.delegue_email || "—"}
                      </span>
                    ),
                  },
                  {
                    key: "conditions_paiement",
                    label: "Conditions",
                    width: "165px",
                    sort: (a, b) =>
                      CONDITIONS_LABEL[a.conditions_paiement].localeCompare(
                        CONDITIONS_LABEL[b.conditions_paiement],
                        "fr",
                      ),
                    render: (c) => (
                      <span style={{ color: "var(--text-secondary)" }}>
                        {CONDITIONS_LABEL[c.conditions_paiement]}
                      </span>
                    ),
                  },
                  {
                    key: "encours_actuel",
                    label: "Encours",
                    width: "115px",
                    align: "right",
                    sort: (a, b) => a.encours_actuel - b.encours_actuel,
                    render: (c) => (
                      <span
                        className="font-bold"
                        style={{
                          color:
                            c.encours_actuel > c.encours_max
                              ? "var(--danger)"
                              : "var(--text-primary)",
                        }}
                      >
                        {eur(c.encours_actuel)}
                      </span>
                    ),
                  },
                  {
                    key: "encours_max",
                    label: "Plafond",
                    width: "115px",
                    align: "right",
                    xlOnly: true,
                    sort: (a, b) => a.encours_max - b.encours_max,
                    render: (c) => (
                      <span style={{ color: "var(--text-tertiary)" }}>
                        {eur(c.encours_max)}
                      </span>
                    ),
                  },
                  {
                    key: "statut",
                    label: "Statut",
                    width: "140px",
                    sort: (a, b) =>
                      COMPTE_STATUT_LABEL[a.statut].localeCompare(
                        COMPTE_STATUT_LABEL[b.statut],
                        "fr",
                      ),
                    render: (c) => (
                      <Pastille
                        couleur={STATUT_COULEUR[c.statut]}
                        texte={COMPTE_STATUT_LABEL[c.statut]}
                      />
                    ),
                  },
                ]}
              />
            </div>

            {/* ── TERRAIN (< lg) : cartes au pouce, inchangées ───────────── */}
            <div className="lg:hidden space-y-2.5">
              {visibles.map((c, idx) => (
                <CompteCard
                  key={c.id}
                  compte={c}
                  index={idx}
                  onClick={() => setDetail(c)}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {/* Detail modal */}
      <AnimatePresence>
        {detail && (
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
              <div className="flex items-start justify-between mb-3">
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wide ${STATUT_CHIP[detail.statut]}`}
                >
                  {COMPTE_STATUT_LABEL[detail.statut]}
                </span>
                <button
                  onClick={() => setDetail(null)}
                  className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-end"
                  aria-label="Fermer"
                >
                  <X className="w-5 h-5 text-text-tertiary" />
                </button>
              </div>
              <h2 className="text-[20px] font-extrabold text-text-primary leading-tight">
                {detail.raison_sociale}
              </h2>
              <p className="text-[12px] font-mono bg-cream text-text-tertiary inline-block px-2 py-1 rounded-lg mt-2">
                SIRET {detail.siret}
              </p>

              {/* Encours */}
              <EncoursBar
                actuel={detail.encours_actuel}
                max={detail.encours_max}
              />

              <dl className="mt-5 space-y-3 text-[13px]">
                <Row label="Délégué" value={detail.delegue_nom} />
                <Row label="Téléphone" value={detail.delegue_telephone} />
                <Row label="Email" value={detail.delegue_email} />
                <Row
                  label="Conditions"
                  value={CONDITIONS_LABEL[detail.conditions_paiement]}
                />
                <Row
                  label="Forme juridique"
                  value={detail.forme_juridique ?? "·"}
                />
                <Row label="TVA intracom." value={detail.tva_intracom ?? "·"} />
                <Row label="Facturation" value={detail.adresse_facturation} />
                {detail.adresse_livraison && (
                  <Row label="Livraison" value={detail.adresse_livraison} />
                )}
              </dl>

              {detail.notes_interne && (
                <div className="mt-4 bg-cream rounded-2xl p-3">
                  <p className="label-caps text-text-tertiary mb-1">
                    Note interne
                  </p>
                  <p className="text-[13px] text-text-primary leading-relaxed">
                    {detail.notes_interne}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="mt-6 space-y-2.5">
                {detail.statut === "en_validation" && (
                  <button
                    disabled={busy}
                    onClick={() => void changerStatut(detail, "actif")}
                    className="w-full bg-success text-white rounded-[18px] py-4 px-5 flex items-center justify-between font-bold shadow-card-lg active:scale-[0.99] disabled:opacity-60"
                  >
                    <span className="text-left">
                      <span className="block label-caps text-white/80">
                        Valider
                      </span>
                      <span className="block text-[14px] font-extrabold">
                        Activer le compte pro
                      </span>
                    </span>
                    <ShieldCheck className="w-5 h-5" />
                  </button>
                )}
                {detail.statut === "actif" && (
                  <button
                    disabled={busy}
                    onClick={() => void changerStatut(detail, "suspendu")}
                    className="w-full bg-white border border-rule text-text-primary rounded-[18px] py-3.5 px-5 flex items-center justify-between font-bold active:scale-[0.99] disabled:opacity-60"
                  >
                    <span className="text-left">
                      <span className="block label-caps text-text-tertiary">
                        Suspendre
                      </span>
                      <span className="block text-[14px] font-extrabold">
                        Bloquer les nouvelles commandes
                      </span>
                    </span>
                    <PauseCircle className="w-5 h-5 text-danger" />
                  </button>
                )}
                {detail.statut === "suspendu" && (
                  <button
                    disabled={busy}
                    onClick={() => void changerStatut(detail, "actif")}
                    className="w-full bg-primary text-white rounded-[18px] py-4 px-5 flex items-center justify-between font-bold shadow-card-lg active:scale-[0.99] disabled:opacity-60"
                  >
                    <span className="text-left">
                      <span className="block label-caps text-white/80">
                        Réactiver
                      </span>
                      <span className="block text-[14px] font-extrabold">
                        Rouvrir le compte
                      </span>
                    </span>
                    <PlayCircle className="w-5 h-5" />
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function CompteCard({
  compte,
  index,
  onClick,
}: {
  compte: ComptePro;
  index: number;
  onClick: () => void;
}) {
  const depasse = compte.encours_actuel > compte.encours_max;
  return (
    <button
      onClick={onClick}
      style={{ "--i": Math.min(index, 8) } as React.CSSProperties}
      className={`lg lg-hover tap rise-in w-full p-3.5 flex items-center gap-3 text-left ${
        compte.statut === "en_validation" ? "!border-warning/40" : ""
      }`}
    >
      <span
        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${STATUT_CHIP[compte.statut]}`}
      >
        {compte.statut === "actif" ? (
          <CheckCircle2 className="w-5 h-5" />
        ) : compte.statut === "suspendu" ? (
          <PauseCircle className="w-5 h-5" />
        ) : (
          <Building2 className="w-5 h-5" />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-bold text-text-primary truncate">
          {compte.raison_sociale}
        </p>
        <p className="text-[11.5px] text-text-secondary mt-0.5 truncate">
          {compte.delegue_nom} · {COMPTE_STATUT_LABEL[compte.statut]}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p
          className={`text-[14px] font-extrabold tabular-nums ${depasse ? "text-danger" : "text-text-primary"}`}
        >
          {eur(compte.encours_actuel)}
        </p>
        <p className="text-[10px] text-text-tertiary mt-0.5 tabular-nums">
          / {eur(compte.encours_max)}
        </p>
      </div>
    </button>
  );
}

function EncoursBar({ actuel, max }: { actuel: number; max: number }) {
  const pct =
    max > 0 ? Math.min(100, (actuel / max) * 100) : actuel > 0 ? 100 : 0;
  const depasse = actuel > max;
  return (
    <div className="mt-4 bg-cream rounded-2xl p-3.5">
      <div className="flex items-baseline justify-between mb-2">
        <p className="label-caps text-text-tertiary">Encours</p>
        <p
          className={`text-[14px] font-extrabold tabular-nums ${depasse ? "text-danger" : "text-text-primary"}`}
        >
          {eur(actuel)}{" "}
          <span className="text-[11px] font-bold text-text-tertiary">
            / {eur(max)}
          </span>
        </p>
      </div>
      <div className="h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
        <div
          className={`h-full rounded-full ${depasse ? "bg-danger" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {depasse && (
        <p className="text-[11px] text-danger font-bold mt-1.5">
          Encours dépassé · à régulariser
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-text-tertiary text-[12px] font-bold uppercase tracking-wide shrink-0">
        {label}
      </span>
      <span className="font-bold text-text-primary text-right">{value}</span>
    </div>
  );
}
