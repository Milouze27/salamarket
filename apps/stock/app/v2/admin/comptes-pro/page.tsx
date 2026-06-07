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
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { EmptyState } from "@/components/v2/EmptyState";
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

export default function ComptesProPage() {
  const employe = useV2((s) => s.currentEmploye);
  const [comptes, setComptes] = useState<ComptePro[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filtre, setFiltre] = useState<FiltreStatut>("en_validation");
  const [detail, setDetail] = useState<ComptePro | null>(null);

  async function reload() {
    setLoading(true);
    setComptes(await fetchComptesPro());
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
    <V2Shell hideNav wide>
      <PageAccentStripe accent="or-sapin" />
      <header className="px-5 pt-7">
        <BackButton />
        <p className="section-eyebrow mt-3">
          <Building2 className="w-3 h-3" />
          Clients pro · B2B
        </p>
        <h1 className="h1 text-text-primary mt-1">Comptes pro</h1>
        <p className="body-md text-text-secondary mt-1">
          Valide les nouveaux comptes, suis l&apos;encours et suspends si
          besoin.
        </p>
      </header>

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
          <div className="bg-[var(--surface-1)] border border-rule rounded-[20px] p-10 flex items-center justify-center gap-3">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <p className="text-sm text-text-secondary">Chargement…</p>
          </div>
        ) : visibles.length === 0 ? (
          <div className="bg-[var(--surface-1)] border border-rule rounded-[20px]">
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
          <div className="space-y-2.5 lg:space-y-0 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-2.5">
            {visibles.map((c) => (
              <CompteCard key={c.id} compte={c} onClick={() => setDetail(c)} />
            ))}
          </div>
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
    </V2Shell>
  );
}

function CompteCard({
  compte,
  onClick,
}: {
  compte: ComptePro;
  onClick: () => void;
}) {
  const depasse = compte.encours_actuel > compte.encours_max;
  return (
    <button
      onClick={onClick}
      className={`w-full bg-[var(--surface-1)] border rounded-2xl p-3.5 flex items-center gap-3 text-left active:scale-[0.99] transition-transform ${
        compte.statut === "en_validation"
          ? "border-warning/40 shadow-card"
          : "border-rule"
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
