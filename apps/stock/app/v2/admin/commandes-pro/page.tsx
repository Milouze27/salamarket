"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Lock,
  PackageCheck,
  ShieldAlert,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { EmptyState } from "@/components/v2/EmptyState";
import { useV2 } from "@/lib/v2-store";
import {
  fetchCommandesPro,
  setCommandeStatut,
  statutSuivant,
  COMMANDE_STATUT_LABEL,
  CONDITIONS_LABEL,
  SEUIL_VALIDATION_MANAGER,
  type CommandePro,
  type CommandeProStatut,
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
  }).format(new Date(iso));
}

type FiltreStatut = "actives" | "tous" | CommandeProStatut;

const FILTRES: { key: FiltreStatut; label: string }[] = [
  { key: "actives", label: "En cours" },
  { key: "a_valider", label: "À valider" },
  { key: "en_preparation", label: "Préparation" },
  { key: "expediee", label: "Expédiées" },
  { key: "tous", label: "Toutes" },
];

const STATUT_CHIP: Record<CommandeProStatut, string> = {
  a_valider: "bg-warning-soft text-warning",
  validee: "bg-primary/10 text-primary",
  en_preparation: "bg-primary/10 text-primary",
  expediee: "bg-primary/10 text-primary",
  livree: "bg-success-soft text-success",
  facturee: "bg-success-soft text-success",
  payee: "bg-success-soft text-success",
  annulee: "bg-cream text-text-tertiary",
};

/** Libellé du bouton d'avancement selon le statut courant. */
function libelleAction(suivant: CommandeProStatut): string {
  switch (suivant) {
    case "validee":
      return "Valider la commande";
    case "en_preparation":
      return "Lancer la préparation";
    case "expediee":
      return "Marquer expédiée";
    case "livree":
      return "Marquer livrée";
    case "facturee":
      return "Émettre la facture";
    case "payee":
      return "Marquer payée";
    default:
      return "Avancer";
  }
}

export default function CommandesProPage() {
  const employe = useV2((s) => s.currentEmploye);
  const isManager = employe?.role === "manager" || employe?.role === "admin";
  const [commandes, setCommandes] = useState<CommandePro[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filtre, setFiltre] = useState<FiltreStatut>("actives");
  const [detail, setDetail] = useState<CommandePro | null>(null);

  async function reload() {
    setLoading(true);
    setCommandes(await fetchCommandesPro());
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, []);

  const visibles = useMemo(() => {
    if (filtre === "tous") return commandes;
    if (filtre === "actives")
      return commandes.filter(
        (c) => c.statut !== "payee" && c.statut !== "annulee",
      );
    return commandes.filter((c) => c.statut === filtre);
  }, [commandes, filtre]);

  const nbAValider = commandes.filter((c) => c.statut === "a_valider").length;

  // Synchronise la modale ouverte avec la liste rechargée.
  const detailLive = detail
    ? (commandes.find((c) => c.id === detail.id) ?? detail)
    : null;

  async function avancer(commande: CommandePro) {
    const suivant = statutSuivant(commande.statut);
    if (!suivant) return;

    // Garde-fou validation manager : une commande > seuil ne peut passer
    // a_valider → validee que par un manager/admin.
    const requiertManager =
      commande.statut === "a_valider" &&
      commande.montant_ttc > SEUIL_VALIDATION_MANAGER;
    if (requiertManager && !isManager) {
      toast.error(
        `Validation manager requise au-delà de ${eur(SEUIL_VALIDATION_MANAGER)}`,
      );
      return;
    }

    setBusy(true);
    const { error } = await setCommandeStatut(
      commande.id,
      suivant,
      employe?.id ?? null,
    );
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`Commande ${COMMANDE_STATUT_LABEL[suivant].toLowerCase()}`);
    void reload();
  }

  async function annuler(commande: CommandePro) {
    setBusy(true);
    const { error } = await setCommandeStatut(
      commande.id,
      "annulee",
      employe?.id ?? null,
    );
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Commande annulée");
    setDetail(null);
    void reload();
  }

  return (
    <V2Shell hideNav wide>
      <PageAccentStripe accent="or-sapin" />
      <header className="px-5 pt-7">
        <BackButton />
        <p className="section-eyebrow mt-3">
          <ClipboardList className="w-3 h-3" />
          Commandes pro · B2B
        </p>
        <h1 className="h1 text-text-primary mt-1">Commandes pro</h1>
        <p className="body-md text-text-secondary mt-1">
          Valide, prépare et expédie. Au-delà de {eur(SEUIL_VALIDATION_MANAGER)}
          , validation manager requise.
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
            {f.key === "a_valider" && nbAValider > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-warning text-white text-[10px] font-extrabold tabular-nums">
                {nbAValider}
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
              icon={ClipboardList}
              title="Aucune commande"
              description="Les commandes pro passées par les clients apparaîtront ici."
              compact
            />
          </div>
        ) : (
          <div className="space-y-2.5 lg:space-y-0 lg:grid lg:grid-cols-2 xl:grid-cols-3 lg:gap-2.5">
            {visibles.map((c) => (
              <CommandeCard
                key={c.id}
                commande={c}
                isManager={isManager}
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
              <DetailContent
                commande={detailLive}
                isManager={isManager}
                busy={busy}
                onClose={() => setDetail(null)}
                onAvancer={() => void avancer(detailLive)}
                onAnnuler={() => void annuler(detailLive)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </V2Shell>
  );
}

function DetailContent({
  commande,
  isManager,
  busy,
  onClose,
  onAvancer,
  onAnnuler,
}: {
  commande: CommandePro;
  isManager: boolean;
  busy: boolean;
  onClose: () => void;
  onAvancer: () => void;
  onAnnuler: () => void;
}) {
  const suivant = statutSuivant(commande.statut);
  const requiertManager =
    commande.statut === "a_valider" &&
    commande.montant_ttc > SEUIL_VALIDATION_MANAGER;
  const bloqueParManager = requiertManager && !isManager;
  const annulable =
    commande.statut === "a_valider" || commande.statut === "validee";

  return (
    <>
      <div className="flex items-start justify-between mb-3">
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wide ${STATUT_CHIP[commande.statut]}`}
        >
          {COMMANDE_STATUT_LABEL[commande.statut]}
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
        {commande.comptes_pro?.raison_sociale ?? "Client inconnu"}
      </h2>
      <p className="text-[12px] font-mono bg-cream text-text-tertiary inline-block px-2 py-1 rounded-lg mt-2">
        {commande.numero_commande ?? "N° en attente"}
      </p>

      {/* Montant TTC mis en avant */}
      <div className="mt-4 bg-cream rounded-2xl p-3.5 flex items-baseline justify-between">
        <p className="label-caps text-text-tertiary">Total TTC</p>
        <p className="text-[22px] font-extrabold text-text-primary tabular-nums">
          {eur(commande.montant_ttc)}
        </p>
      </div>

      {requiertManager && (
        <div
          className={`mt-3 rounded-2xl p-3 flex items-start gap-2.5 ${bloqueParManager ? "bg-warning-soft" : "bg-success-soft"}`}
        >
          <ShieldAlert
            className={`w-5 h-5 shrink-0 mt-0.5 ${bloqueParManager ? "text-warning" : "text-success"}`}
          />
          <p className="text-[12.5px] font-bold leading-snug text-text-primary">
            {bloqueParManager
              ? `Commande > ${eur(SEUIL_VALIDATION_MANAGER)} · seul un manager peut la valider.`
              : `Commande > ${eur(SEUIL_VALIDATION_MANAGER)} · validation manager autorisée.`}
          </p>
        </div>
      )}

      <dl className="mt-5 space-y-3 text-[13px]">
        <Row label="Délégué" value={commande.comptes_pro?.delegue_nom ?? "·"} />
        <Row
          label="Conditions"
          value={
            commande.comptes_pro
              ? CONDITIONS_LABEL[commande.comptes_pro.conditions_paiement]
              : "·"
          }
        />
        <Row
          label="Récupération"
          value={
            commande.type_recuperation === "livraison"
              ? "Livraison"
              : "Retrait pro"
          }
        />
        <Row label="Commandée le" value={dateFr(commande.date_commande)} />
        <Row
          label="Livraison souhaitée"
          value={dateFr(commande.date_livraison_souhaitee)}
        />
        <Row label="Montant HT" value={eur(commande.montant_ht)} />
        <Row label="TVA" value={eur(commande.montant_tva)} />
      </dl>

      {commande.notes_client && (
        <div className="mt-4 bg-cream rounded-2xl p-3">
          <p className="label-caps text-text-tertiary mb-1">Note client</p>
          <p className="text-[13px] text-text-primary leading-relaxed">
            {commande.notes_client}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="mt-6 space-y-2.5">
        {suivant && (
          <button
            disabled={busy || bloqueParManager}
            onClick={onAvancer}
            className="w-full bg-primary text-white rounded-[18px] py-4 px-5 flex items-center justify-between font-bold shadow-card-lg active:scale-[0.99] disabled:opacity-50"
          >
            <span className="text-left">
              <span className="block label-caps text-white/80">
                {COMMANDE_STATUT_LABEL[commande.statut]} →{" "}
                {COMMANDE_STATUT_LABEL[suivant]}
              </span>
              <span className="block text-[14px] font-extrabold">
                {libelleAction(suivant)}
              </span>
            </span>
            {bloqueParManager ? (
              <Lock className="w-5 h-5" />
            ) : (
              <ArrowRight className="w-5 h-5" />
            )}
          </button>
        )}

        {!suivant && commande.statut === "payee" && (
          <div className="w-full bg-success-soft text-success rounded-[18px] py-3.5 px-5 flex items-center justify-center gap-2 font-extrabold">
            <CheckCircle2 className="w-5 h-5" />
            Commande payée · clôturée
          </div>
        )}

        {annulable && (
          <button
            disabled={busy}
            onClick={onAnnuler}
            className="w-full bg-white border border-rule text-text-secondary rounded-[18px] py-3 px-5 flex items-center justify-center gap-2 font-bold active:scale-[0.99] disabled:opacity-60"
          >
            <X className="w-4 h-4" />
            Annuler la commande
          </button>
        )}
      </div>
    </>
  );
}

function CommandeCard({
  commande,
  isManager,
  onClick,
}: {
  commande: CommandePro;
  isManager: boolean;
  onClick: () => void;
}) {
  const aValider = commande.statut === "a_valider";
  const bloque =
    aValider && commande.montant_ttc > SEUIL_VALIDATION_MANAGER && !isManager;
  return (
    <button
      onClick={onClick}
      className={`w-full bg-[var(--surface-1)] border rounded-2xl p-3.5 flex items-center gap-3 text-left active:scale-[0.99] transition-transform ${
        aValider ? "border-warning/40 shadow-card" : "border-rule"
      }`}
    >
      <span
        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${STATUT_CHIP[commande.statut]}`}
      >
        {commande.statut === "expediee" ? (
          <Truck className="w-5 h-5" />
        ) : commande.statut === "livree" ||
          commande.statut === "facturee" ||
          commande.statut === "payee" ? (
          <PackageCheck className="w-5 h-5" />
        ) : (
          <ClipboardList className="w-5 h-5" />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-bold text-text-primary truncate">
          {commande.comptes_pro?.raison_sociale ?? "Client inconnu"}
        </p>
        <p className="text-[11.5px] text-text-secondary mt-0.5 truncate">
          {commande.numero_commande ?? "N° en attente"} ·{" "}
          {COMMANDE_STATUT_LABEL[commande.statut]}
          {bloque && <span className="text-warning font-bold"> · manager</span>}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-[14px] font-extrabold text-text-primary tabular-nums">
          {eur(commande.montant_ttc)}
        </p>
        <p className="text-[10px] text-text-tertiary mt-0.5">
          {dateFr(commande.date_commande)}
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
