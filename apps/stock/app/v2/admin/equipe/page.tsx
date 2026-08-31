"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  KeyRound,
  Loader2,
  Lock,
  PauseCircle,
  PlayCircle,
  Plus,
  ShieldCheck,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { EditorialEyebrow } from "@/components/v2/EditorialEyebrow";
import { EmptyState } from "@/components/v2/EmptyState";
import { roleLabel } from "@/lib/role-label";
import { useV2 } from "@/lib/v2-store";
import {
  createEmployeAdmin,
  listEmployesAdmin,
  setEmployeActifAdmin,
  setEmployePinAdmin,
  updateEmployeAdmin,
  type EmployeAdmin,
} from "@/lib/v2-store";
import { listDepots } from "@/lib/db";
import type { Depot, EmployeRole } from "@/lib/types/db";

const ROLES: EmployeRole[] = [
  "reception",
  "caisse",
  "preparation",
  "manager",
  "admin",
];

const ROLE_CHIP: Record<EmployeRole, string> = {
  admin: "bg-gold-soft text-primary-dark",
  manager: "bg-gold-soft text-primary-dark",
  preparation: "bg-cream text-text-secondary",
  reception: "bg-cream text-text-secondary",
  caisse: "bg-cream text-text-secondary",
};

interface FormState {
  id: string | null; // null = création
  nom: string;
  prenom: string;
  role: EmployeRole;
  depotId: string;
  pin: string; // création : requis ; édition : vide = inchangé
}

const EMPTY_FORM: FormState = {
  id: null,
  nom: "",
  prenom: "",
  role: "caisse",
  depotId: "",
  pin: "",
};

export default function EquipePage() {
  const acteur = useV2((s) => s.currentEmploye);
  const estAutorise = acteur?.role === "admin" || acteur?.role === "manager";

  const [employes, setEmployes] = useState<EmployeAdmin[]>([]);
  const [depots, setDepots] = useState<Depot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [pinTarget, setPinTarget] = useState<EmployeAdmin | null>(null);
  const [newPin, setNewPin] = useState("");

  async function reload() {
    if (!acteur || !estAutorise) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data, error }, ds] = await Promise.all([
      listEmployesAdmin(acteur.id),
      listDepots(),
    ]);
    if (error) toast.error(error);
    setEmployes(data);
    setDepots(ds);
    setLoading(false);
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acteur?.id, estAutorise]);

  const depotNom = useMemo(() => {
    const m = new Map(depots.map((d) => [d.id, d.nom]));
    return (id: string | null) => (id ? (m.get(id) ?? "—") : "—");
  }, [depots]);

  function ouvrirCreation() {
    setForm({ ...EMPTY_FORM, depotId: depots[0]?.id ?? "" });
  }

  function ouvrirEdition(e: EmployeAdmin) {
    setForm({
      id: e.id,
      nom: e.nom,
      prenom: e.prenom ?? "",
      role: e.role,
      depotId: e.depot_principal_id ?? "",
      pin: "",
    });
  }

  async function soumettre() {
    if (!acteur || !form) return;
    const nom = form.nom.trim();
    if (!nom) {
      toast.error("Le nom est requis.");
      return;
    }
    if (form.id === null && !/^[0-9]{4}$/.test(form.pin)) {
      toast.error("PIN à 4 chiffres requis pour un nouvel employé.");
      return;
    }
    setBusy(true);
    if (form.id === null) {
      const { error } = await createEmployeAdmin({
        acteurId: acteur.id,
        nom,
        prenom: form.prenom.trim() || null,
        role: form.role,
        depotPrincipalId: form.depotId || null,
        pin: form.pin,
      });
      setBusy(false);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success(`${nom} ajouté à l'équipe.`);
    } else {
      const { error } = await updateEmployeAdmin({
        acteurId: acteur.id,
        id: form.id,
        nom,
        prenom: form.prenom.trim() || null,
        role: form.role,
        depotPrincipalId: form.depotId || null,
      });
      setBusy(false);
      if (error) {
        toast.error(error);
        return;
      }
      toast.success("Fiche mise à jour.");
    }
    setForm(null);
    await reload();
  }

  async function basculerActif(e: EmployeAdmin) {
    if (!acteur) return;
    setBusy(true);
    const { error } = await setEmployeActifAdmin(acteur.id, e.id, !e.is_active);
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(
      e.is_active
        ? `${e.prenom ?? e.nom} désactivé.`
        : `${e.prenom ?? e.nom} réactivé.`,
    );
    await reload();
  }

  async function resetPin() {
    if (!acteur || !pinTarget) return;
    if (!/^[0-9]{4}$/.test(newPin)) {
      toast.error("PIN à 4 chiffres requis.");
      return;
    }
    setBusy(true);
    const { error } = await setEmployePinAdmin(acteur.id, pinTarget.id, newPin);
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`PIN de ${pinTarget.prenom ?? pinTarget.nom} réinitialisé.`);
    setPinTarget(null);
    setNewPin("");
  }

  /* ── Accès refusé ─────────────────────────────────────────────── */
  if (acteur && !estAutorise) {
    return (
      <V2Shell hideNav>
        <PageAccentStripe accent="or" />
        <header className="px-5 pt-7">
          <BackButton />
        </header>
        <div className="px-5 pt-10">
          <EmptyState
            icon={Lock}
            title="Accès réservé"
            description="La gestion de l'équipe est réservée aux managers et administrateurs."
          />
        </div>
      </V2Shell>
    );
  }

  return (
    <V2Shell hideNav>
      <PageAccentStripe accent="or" />
      <header className="px-5 pt-7">
        <BackButton />
        <EditorialEyebrow num="01" label="Gestion de l'équipe" className="mt-3" />
        <h1 className="h1-display mt-3">
          <span className="gold">{employes.filter((e) => e.is_active).length}</span>{" "}
          membre
          {employes.filter((e) => e.is_active).length > 1 ? "s" : ""} actif
          {employes.filter((e) => e.is_active).length > 1 ? "s" : ""}.
        </h1>
        <p className="body-md text-text-secondary mt-3 max-w-[40ch]">
          Crée un compte, attribue un rôle et un dépôt, gère le PIN de connexion.
        </p>
      </header>

      {loading ? (
        <div className="px-5 pt-10 text-center text-text-secondary">
          Chargement…
        </div>
      ) : employes.length === 0 ? (
        <div className="px-5 pt-10">
          <EmptyState
            icon={UserPlus}
            title="Aucun employé"
            description="Ajoute le premier membre de l'équipe."
            cta={{ label: "Ajouter un employé", onClick: ouvrirCreation }}
          />
        </div>
      ) : (
        <section className="px-5 mt-5 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 pb-28">
          {employes.map((e, i) => (
            <div
              key={e.id}
              style={{ "--i": i } as React.CSSProperties}
              className={`lg rise-in rounded-[20px] p-4 ${
                e.is_active ? "" : "opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-text-primary truncate">
                      {e.prenom ? `${e.prenom} ${e.nom}` : e.nom}
                    </p>
                    <span
                      className={`shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] px-2 py-0.5 rounded-full ${ROLE_CHIP[e.role]}`}
                    >
                      {roleLabel(e.role)}
                    </span>
                    {!e.is_active && (
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] px-2 py-0.5 rounded-full bg-danger-soft text-danger">
                        Désactivé
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-text-tertiary mt-1">
                    {depotNom(e.depot_principal_id)}
                    {e.a_un_pin ? " · PIN défini" : " · PIN manquant"}
                  </p>
                </div>
                <button
                  onClick={() => ouvrirEdition(e)}
                  className="tap shrink-0 text-[11px] font-bold text-primary px-3.5 py-1.5 rounded-full bg-cream min-h-[36px]"
                >
                  Modifier
                </button>
              </div>

              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => {
                    setPinTarget(e);
                    setNewPin("");
                  }}
                  disabled={busy}
                  className="tap flex-1 flex items-center justify-center gap-1.5 text-xs font-bold text-text-secondary border border-rule rounded-2xl py-2.5 min-h-[44px] disabled:opacity-50"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  Réinitialiser le PIN
                </button>
                <button
                  onClick={() => basculerActif(e)}
                  disabled={busy}
                  className={`tap flex-1 flex items-center justify-center gap-1.5 text-xs font-bold rounded-2xl py-2.5 min-h-[44px] disabled:opacity-50 ${
                    e.is_active
                      ? "text-danger border border-danger-soft"
                      : "text-success border border-success-soft"
                  }`}
                >
                  {e.is_active ? (
                    <>
                      <PauseCircle className="w-3.5 h-3.5" />
                      Désactiver
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-3.5 h-3.5" />
                      Réactiver
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* CTA créer — barre flottante */}
      {!loading && employes.length > 0 && (
        <div className="bar-desktop fixed bottom-0 inset-x-0 z-30 pb-safe pointer-events-none">
          <div className="mx-auto max-w-[460px] px-4 pt-3 pb-3 pointer-events-auto">
            <button
              onClick={ouvrirCreation}
              className="tap w-full rounded-[22px] px-5 py-4 flex items-center justify-between shadow-card-lg bg-primary text-white"
            >
              <div className="text-left">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold">
                  Équipe
                </p>
                <p className="text-[15px] font-extrabold mt-0.5">
                  Ajouter un employé
                </p>
              </div>
              <span className="bg-white/15 backdrop-blur-sm rounded-full p-2.5">
                <Plus className="w-5 h-5" />
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ── Sheet création / édition ──────────────────────────────── */}
      <AnimatePresence>
        {form && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center"
            onClick={() => !busy && setForm(null)}
          >
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 320 }}
              className="lg w-full max-w-[460px] rounded-t-[28px] pb-safe max-h-[90vh] overflow-y-auto"
              onClick={(ev) => ev.stopPropagation()}
            >
              <div className="glass-bar px-5 pt-5 pb-3 flex items-center justify-between sticky top-0 z-10">
                <h2 className="text-base font-extrabold text-text-primary">
                  {form.id === null ? "Nouvel employé" : "Modifier l'employé"}
                </h2>
                <button
                  onClick={() => !busy && setForm(null)}
                  className="p-2 -mr-2 text-text-tertiary"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-5 pb-6 space-y-4">
                <Field label="Nom">
                  <input
                    value={form.nom}
                    onChange={(e) =>
                      setForm({ ...form, nom: e.target.value })
                    }
                    placeholder="Nasri"
                    className="w-full bg-cream border border-rule rounded-2xl px-3.5 py-3 min-h-[44px] text-base"
                  />
                </Field>

                <Field label="Prénom">
                  <input
                    value={form.prenom}
                    onChange={(e) =>
                      setForm({ ...form, prenom: e.target.value })
                    }
                    placeholder="Ahmed"
                    className="w-full bg-cream border border-rule rounded-2xl px-3.5 py-3 min-h-[44px] text-base"
                  />
                </Field>

                <Field label="Rôle">
                  <div className="grid grid-cols-3 gap-2">
                    {ROLES.map((r) => (
                      <button
                        key={r}
                        onClick={() => setForm({ ...form, role: r })}
                        className={`tap text-xs font-bold rounded-2xl py-2.5 min-h-[44px] border transition-colors ${
                          form.role === r
                            ? "bg-primary text-white border-primary"
                            : "bg-cream text-text-secondary border-rule"
                        }`}
                      >
                        {roleLabel(r)}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="Dépôt principal">
                  <select
                    value={form.depotId}
                    onChange={(e) =>
                      setForm({ ...form, depotId: e.target.value })
                    }
                    className="w-full bg-cream border border-rule rounded-2xl px-3.5 py-3 min-h-[44px] text-base"
                  >
                    <option value="">Aucun</option>
                    {depots.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nom}
                      </option>
                    ))}
                  </select>
                </Field>

                {form.id === null && (
                  <Field label="PIN de connexion (4 chiffres)">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      value={form.pin}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          pin: e.target.value.replace(/[^0-9]/g, "").slice(0, 4),
                        })
                      }
                      placeholder="0000"
                      className="w-full bg-cream border border-rule rounded-2xl px-3.5 py-3 min-h-[44px] text-base tracking-[0.4em] font-bold text-center"
                    />
                  </Field>
                )}

                <button
                  onClick={soumettre}
                  disabled={busy}
                  className="tap w-full bg-primary text-white rounded-2xl py-4 min-h-[52px] font-extrabold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-5 h-5" />
                  )}
                  {form.id === null ? "Créer le compte" : "Enregistrer"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modale reset PIN ──────────────────────────────────────── */}
      <AnimatePresence>
        {pinTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-5"
            onClick={() => !busy && setPinTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="lg w-full max-w-[360px] rounded-[28px] p-5"
              onClick={(ev) => ev.stopPropagation()}
            >
              <div className="flex items-center gap-2 text-text-primary">
                <KeyRound className="w-5 h-5 text-primary" />
                <h2 className="text-base font-extrabold">
                  PIN de {pinTarget.prenom ?? pinTarget.nom}
                </h2>
              </div>
              <p className="text-xs text-text-secondary mt-2">
                Saisis un nouveau code à 4 chiffres. Il remplace l'ancien
                immédiatement.
              </p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={newPin}
                onChange={(e) =>
                  setNewPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))
                }
                placeholder="0000"
                autoFocus
                className="w-full mt-4 bg-cream border border-rule rounded-2xl px-3.5 py-3 min-h-[44px] text-lg tracking-[0.5em] font-bold text-center"
              />
              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => !busy && setPinTarget(null)}
                  className="tap flex-1 border border-rule rounded-2xl py-3 min-h-[44px] text-sm font-bold text-text-secondary"
                >
                  Annuler
                </button>
                <button
                  onClick={resetPin}
                  disabled={busy}
                  className="tap flex-1 bg-primary text-white rounded-2xl py-3 min-h-[44px] text-sm font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Valider"
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </V2Shell>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label-caps text-text-tertiary">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
