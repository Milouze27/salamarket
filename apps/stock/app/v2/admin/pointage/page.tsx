"use client";

/**
 * /v2/admin/pointage — Pointage staff (kiosk tablette dépôt)
 * ─────────────────────────────────────────────────────────
 * Otmane pilote 16 FTE sur 3 dépôts. Cet écran remplace l'excel +
 * mémoire : l'employé courant pointe son arrivée / départ en 1 tap,
 * et l'admin/manager voit le tableau du jour (arrivée, départ, heures),
 * corrige en inline et exporte un CSV.
 *
 * Sources : tables `pointages` / `shifts` (migration 0038) via lib/db/pointage.
 * Le check-in/out passe par les RPC SQL (résolution du shift + anomalie).
 * Les heures travaillées viennent de la colonne générée duree_travaillee_min.
 *
 * Données réelles attendues dans ~20 j → on soigne l'empty + le flux
 * clock-in fonctionnel dès maintenant.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Coffee,
  Download,
  Loader2,
  LogIn,
  LogOut,
  Pencil,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { EditorialEyebrow } from "@/components/v2/EditorialEyebrow";
import { EmptyState } from "@/components/v2/EmptyState";
import { downloadOrShareBlob } from "@/lib/download-helper";
import { useV2 } from "@/lib/v2-store";
import {
  clockIn,
  clockOut,
  computeHeures,
  etatDe,
  formatHeureHM,
  formatHeures,
  getPointageDuJour,
  isoToTimeInput,
  listPointagesDuJour,
  timeToISO,
  updatePointage,
  type EtatPointage,
  type Pointage,
  type PointageAvecEmploye,
} from "@/lib/db/pointage";

const ANOMALIE_LABEL: Record<string, string> = {
  aucune: "",
  sans_planning: "Sans planning",
  retard: "Retard",
  depart_anticipe: "Départ anticipé",
  oubli: "Oubli",
  pause_trop_longue: "Pause longue",
};

function nomAffiche(p: {
  employe_prenom: string | null;
  employe_nom: string | null;
}): string {
  return p.employe_prenom?.trim() || p.employe_nom?.trim() || "Employé";
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default function PointagePage() {
  const employe = useV2((s) => s.currentEmploye);
  const depot = useV2((s) => s.currentDepot);

  const jour = useMemo(() => todayISO(), []);
  const isAdmin = employe?.role === "admin" || employe?.role === "manager";

  const [rows, setRows] = useState<PointageAvecEmploye[]>([]);
  const [mine, setMine] = useState<Pointage | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [editing, setEditing] = useState<PointageAvecEmploye | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [list, ownPointage] = await Promise.all([
      listPointagesDuJour(jour),
      employe?.id ? getPointageDuJour(employe.id, jour) : Promise.resolve(null),
    ]);
    setRows(list);
    setMine(ownPointage);
    setLoading(false);
  }, [jour, employe?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const etat: EtatPointage = etatDe(mine);

  async function handleClock() {
    if (!employe?.id) {
      toast.error("Aucun employé connecté. Identifie-toi avec ton code PIN.");
      return;
    }
    setActing(true);
    try {
      if (etat === "pas_pointe") {
        if (!depot?.id) {
          toast.error("Choisis d'abord un dépôt avant de pointer ton arrivée.");
          return;
        }
        const res = await clockIn(employe.id, depot.id);
        if (!res.ok) {
          toast.error(
            "Pointage d'arrivée impossible. " +
              (res.error ?? "Réessaie dans un instant."),
          );
          return;
        }
        toast.success("Arrivée enregistrée. Bonne journée !");
      } else if (etat === "au_travail" || etat === "en_pause") {
        const res = await clockOut(employe.id);
        if (!res.ok) {
          toast.error(
            "Pointage de départ impossible. " +
              (res.error ?? "Réessaie dans un instant."),
          );
          return;
        }
        toast.success("Départ enregistré. À bientôt !");
      }
      await load();
    } finally {
      setActing(false);
    }
  }

  function exportCsv() {
    if (rows.length === 0) {
      toast.info("Aucun pointage à exporter pour aujourd'hui.");
      return;
    }
    const header = [
      "Prénom",
      "Nom",
      "Jour",
      "Arrivée",
      "Départ",
      "Heures travaillées",
      "Minutes",
      "Anomalie",
    ];
    const lignes = rows.map((p) => {
      const min = computeHeures(p);
      return [
        p.employe_prenom ?? "",
        p.employe_nom ?? "",
        p.jour,
        formatHeureHM(p.check_in),
        formatHeureHM(p.check_out),
        formatHeures(min),
        min === null ? "" : String(min),
        ANOMALIE_LABEL[p.anomalie] || "",
      ];
    });
    // Échappe les champs CSV (guillemets + séparateur). BOM pour Excel FR.
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv =
      "﻿" +
      [header, ...lignes]
        .map((cols) => cols.map((c) => escape(String(c))).join(";"))
        .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    void downloadOrShareBlob({
      blob,
      filename: `pointage-${jour}.csv`,
      contentType: "text/csv;charset=utf-8",
      shareTitle: `Pointage staff ${jour}`,
    }).then((r) => {
      if (r.success) toast.success("CSV du jour généré.");
      else if (r.strategy === "error")
        toast.error("Export CSV impossible : " + r.error);
    });
  }

  // KPI du jour
  const kpi = useMemo(() => {
    let presents = 0;
    let totalMin = 0;
    let anomalies = 0;
    for (const p of rows) {
      if (p.check_in && !p.check_out) presents += 1;
      const m = computeHeures(p);
      if (m !== null) totalMin += m;
      if (p.anomalie !== "aucune") anomalies += 1;
    }
    return { total: rows.length, presents, totalMin, anomalies };
  }, [rows]);

  return (
    <V2Shell hideNav layout="full">
      <PageAccentStripe accent="sapin-or" />
      {/* 31/08/2026 — le plafond lg:max-w-5xl (1024 px) bridait la seule page
        du projet qui portait déjà un vrai tableau. Le pointage a autant de
        colonnes qu'il y a de jours travaillés : on lui rend la largeur. */}
      <div className="mx-auto w-full max-w-3xl lg:max-w-none">
      <header className="px-4 sm:px-5 pt-7">
        <BackButton />
        <EditorialEyebrow num="01" label="RH" className="mt-3" />
        <h1 className="h1-display mt-1">
          Pointage <span className="gold">staff</span>
        </h1>
        <p className="body-md text-text-secondary mt-2 max-w-prose">
          Arrivée et départ en un tap. Les heures travaillées se calculent
          toutes seules, prêtes pour la paie.
        </p>
      </header>

      {/* (a) Gros bouton Arrivée / Départ pour l'employé courant */}
      <section className="px-4 sm:px-5 mt-6">
        <ClockCard
          etat={etat}
          employeNom={employe?.prenom ?? employe?.nom ?? null}
          pointage={mine}
          acting={acting}
          onClock={() => void handleClock()}
        />
      </section>

      {/* KPI strip */}
      <section className="px-4 sm:px-5 mt-4 grid grid-cols-3 gap-2.5">
        <Kpi value={`${kpi.presents}`} label="présents" index={0} />
        <Kpi
          value={formatHeures(kpi.totalMin || null)}
          label="cumul jour"
          index={1}
        />
        <Kpi
          value={`${kpi.total}`}
          label="pointés"
          tone={kpi.anomalies > 0 ? "warn" : "neutral"}
          sub={kpi.anomalies > 0 ? `${kpi.anomalies} anomalie(s)` : undefined}
          index={2}
        />
      </section>

      {/* (c) Export CSV (admin / manager) */}
      {isAdmin && rows.length > 0 && (
        <section className="px-4 sm:px-5 mt-5">
          <button
            type="button"
            onClick={exportCsv}
            className="tap w-full min-h-[48px] rounded-[20px] py-3 text-[14px] font-bold flex items-center justify-center gap-2"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-primary)",
              border: "1px solid var(--accent-gold-hairline)",
            }}
          >
            <Download
              className="w-4 h-4"
              style={{ color: "var(--accent-gold)" }}
            />
            Exporter le CSV du jour
          </button>
        </section>
      )}

      {/* (b) Tableau du jour */}
      <section className="px-4 sm:px-5 mt-6 pb-[max(3rem,env(safe-area-inset-bottom))]">
        <p
          className="label-caps mb-3"
          style={{ color: "var(--text-secondary)" }}
        >
          Pointages du jour
        </p>

        {loading ? (
          <div className="lg p-10 flex items-center justify-center gap-2">
            <Loader2
              className="w-5 h-5 animate-spin"
              style={{ color: "var(--primary-green)" }}
            />
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Chargement…
            </p>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Personne n'a encore pointé"
            description="Dès qu'un membre de l'équipe pointe son arrivée, il apparaît ici avec ses heures."
          />
        ) : (
          <ul className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {rows.map((p, i) => {
              const min = computeHeures(p);
              const enService = p.check_in && !p.check_out;
              const anomalie =
                p.anomalie !== "aucune" ? ANOMALIE_LABEL[p.anomalie] : "";
              return (
                <li
                  key={p.id}
                  className="lg rise-in p-4"
                  style={
                    {
                      "--i": i,
                      border: enService
                        ? "1px solid var(--accent-gold-hairline)"
                        : undefined,
                    } as React.CSSProperties
                  }
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p
                          className="text-[15px] font-extrabold truncate"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {nomAffiche(p)}
                        </p>
                        {enService && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                            style={{
                              background: "var(--accent-gold-soft)",
                              color: "var(--or-text)",
                            }}
                          >
                            {p.pause_debut && !p.pause_fin ? (
                              <>
                                <Coffee className="w-3 h-3" /> En pause
                              </>
                            ) : (
                              "Au travail"
                            )}
                          </span>
                        )}
                        {anomalie && (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                            style={{
                              background: "var(--status-warning-bg)",
                              color: "var(--status-warning-text)",
                            }}
                          >
                            {anomalie}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className="text-[16px] font-extrabold tabular-nums leading-none"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {formatHeures(min)}
                      </p>
                      <p
                        className="text-[10px] font-bold uppercase tracking-wide mt-1"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        travaillées
                      </p>
                    </div>
                  </div>

                  <div
                    className="grid grid-cols-2 gap-2 mt-3 pt-3"
                    style={{ borderTop: "1px solid var(--border-light)" }}
                  >
                    <TimeStat
                      icon={<LogIn className="w-3.5 h-3.5" />}
                      label="Arrivée"
                      value={formatHeureHM(p.check_in)}
                    />
                    <TimeStat
                      icon={<LogOut className="w-3.5 h-3.5" />}
                      label="Départ"
                      value={formatHeureHM(p.check_out)}
                    />
                  </div>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setEditing(p)}
                      className="tap mt-3 w-full min-h-[44px] rounded-[16px] py-2.5 text-[13px] font-bold flex items-center justify-center gap-1.5"
                      style={{
                        background: "var(--surface-2)",
                        color: "var(--text-secondary)",
                        border: "1px solid var(--border-light)",
                      }}
                    >
                      <Pencil className="w-3.5 h-3.5" /> Corriger les horaires
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      </div>

      {isAdmin && (
        <EditDrawer
          pointage={editing}
          jour={jour}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </V2Shell>
  );
}

/* ─────────────────────────── Clock card ─────────────────────────── */

function ClockCard({
  etat,
  employeNom,
  pointage,
  acting,
  onClock,
}: {
  etat: EtatPointage;
  employeNom: string | null;
  pointage: Pointage | null;
  acting: boolean;
  onClock: () => void;
}) {
  const arriveeHM = formatHeureHM(pointage?.check_in ?? null);
  const departHM = formatHeureHM(pointage?.check_out ?? null);

  const config: Record<
    EtatPointage,
    { label: string; cta: string; icon: typeof LogIn; disabled: boolean }
  > = {
    pas_pointe: {
      label: "Tu n'as pas encore pointé aujourd'hui",
      cta: "Pointer mon arrivée",
      icon: LogIn,
      disabled: false,
    },
    au_travail: {
      label: `Au travail depuis ${arriveeHM}`,
      cta: "Pointer mon départ",
      icon: LogOut,
      disabled: false,
    },
    en_pause: {
      label: `En pause · arrivé à ${arriveeHM}`,
      cta: "Pointer mon départ",
      icon: LogOut,
      disabled: false,
    },
    parti: {
      label: `Journée terminée · ${arriveeHM} → ${departHM}`,
      cta: "Déjà pointé aujourd'hui",
      icon: CheckCircle2,
      disabled: true,
    },
  };
  const c = config[etat];
  const Icon = c.icon;
  const isDepart = etat === "au_travail" || etat === "en_pause";

  return (
    <div
      className={etat === "parti" ? "lg p-5" : "rounded-[28px] p-5"}
      style={
        etat === "parti"
          ? undefined
          : {
              background:
                "linear-gradient(135deg, var(--primary-green) 0%, var(--primary-green-hover) 100%)",
            }
      }
    >
      <p
        className="text-[10.5px] font-bold uppercase tracking-[0.18em]"
        style={{
          color:
            etat === "parti"
              ? "var(--text-tertiary)"
              : "var(--accent-gold-bright)",
        }}
      >
        {employeNom ? employeNom : "Mon pointage"}
      </p>
      <p
        className="text-[17px] font-extrabold leading-tight mt-1"
        style={{
          color: etat === "parti" ? "var(--text-primary)" : "#FFFFFF",
        }}
      >
        {c.label}
      </p>

      <button
        type="button"
        onClick={onClock}
        disabled={c.disabled || acting}
        className="tap mt-4 w-full min-h-[56px] rounded-[18px] py-4 text-[16px] font-extrabold flex items-center justify-center gap-2 disabled:opacity-60"
        style={
          etat === "parti"
            ? {
                background: "var(--surface-2)",
                color: "var(--text-tertiary)",
                border: "1px solid var(--border-light)",
              }
            : isDepart
              ? {
                  background: "#FFFFFF",
                  color: "var(--primary-green)",
                }
              : {
                  background: "var(--accent-gold)",
                  color: "var(--text-on-gold)",
                }
        }
      >
        {acting ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Icon className="w-5 h-5" />
        )}
        {c.cta}
      </button>
    </div>
  );
}

/* ───────────────────────────── KPI ───────────────────────────── */

function Kpi({
  value,
  label,
  sub,
  tone = "neutral",
  index = 0,
}: {
  value: string;
  label: string;
  sub?: string;
  tone?: "neutral" | "warn";
  index?: number;
}) {
  return (
    <div
      className={
        tone === "warn"
          ? "rise-in rounded-[20px] p-3.5"
          : "lg rise-in p-3.5"
      }
      style={
        tone === "warn"
          ? ({
              "--i": index,
              background: "var(--status-warning-bg)",
              border: "1px solid var(--status-warning)",
            } as React.CSSProperties)
          : ({ "--i": index } as React.CSSProperties)
      }
    >
      <p
        className="text-[22px] font-extrabold tabular-nums leading-none"
        style={{
          color:
            tone === "warn"
              ? "var(--status-warning-text)"
              : "var(--text-primary)",
        }}
      >
        {value}
      </p>
      <p
        className="text-[10.5px] mt-1"
        style={{ color: "var(--text-secondary)" }}
      >
        {sub ?? label}
      </p>
    </div>
  );
}

function TimeStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <p
        className="text-[10px] font-bold uppercase tracking-wide flex items-center gap-1"
        style={{ color: "var(--text-tertiary)" }}
      >
        {icon} {label}
      </p>
      <p
        className="text-[15px] font-bold tabular-nums mt-0.5"
        style={{ color: "var(--text-primary)" }}
      >
        {value}
      </p>
    </div>
  );
}

/* ─────────────────────── Edit drawer (admin) ─────────────────────── */

function EditDrawer({
  pointage,
  jour,
  onClose,
  onSaved,
}: {
  pointage: PointageAvecEmploye | null;
  jour: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const acteur = useV2((s) => s.currentEmploye);
  const [arrivee, setArrivee] = useState("");
  const [depart, setDepart] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setArrivee(isoToTimeInput(pointage?.check_in ?? null));
    setDepart(isoToTimeInput(pointage?.check_out ?? null));
  }, [pointage]);

  useEffect(() => {
    if (!pointage) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [pointage]);

  if (!pointage) return null;

  async function save() {
    if (!pointage) return;
    setSaving(true);
    const res = await updatePointage(
      pointage.id,
      {
        arrivee: arrivee ? timeToISO(jour, arrivee) : null,
        depart: depart ? timeToISO(jour, depart) : null,
      },
      acteur?.id ?? "",
    );
    setSaving(false);
    if (!res.ok) {
      toast.error(
        "Correction impossible. " + (res.error ?? "Réessaie dans un instant."),
      );
      return;
    }
    toast.success("Horaires corrigés.");
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
          background: "rgba(4,20,15,0.62)",
          backdropFilter: "blur(6px)",
        }}
      />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        transition={{ type: "spring", damping: 32, stiffness: 360 }}
        className="sheet-desktop fixed inset-x-0 bottom-0 z-50 flex flex-col lg:mx-auto lg:max-w-lg"
        style={{
          maxHeight: "92vh",
          background: "var(--surface-1)",
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          boxShadow: "0 -8px 32px rgba(0,0,0,0.45)",
          borderTop: "1px solid var(--border-light)",
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
            className="tap absolute right-4 top-3 p-2 rounded-full"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-light)",
            }}
          >
            <X size={18} color="var(--text-secondary)" />
          </button>
        </div>

        <div className="px-5 pb-3">
          <p className="label-caps" style={{ color: "var(--text-secondary)" }}>
            Corriger les horaires
          </p>
          <h2
            className="text-[20px] font-extrabold"
            style={{ color: "var(--text-primary)" }}
          >
            {nomAffiche(pointage)}
          </h2>
        </div>

        <div className="px-5 pb-4 space-y-4">
          <label className="block">
            <span
              className="label-caps mb-1.5 inline-flex items-center gap-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              <LogIn size={14} /> Arrivée
            </span>
            <input
              type="time"
              className="input-field"
              style={{ fontSize: 16 }}
              value={arrivee}
              onChange={(e) => setArrivee(e.target.value)}
            />
          </label>

          <label className="block">
            <span
              className="label-caps mb-1.5 inline-flex items-center gap-1.5"
              style={{ color: "var(--text-secondary)" }}
            >
              <LogOut size={14} /> Départ
            </span>
            <input
              type="time"
              className="input-field"
              style={{ fontSize: 16 }}
              value={depart}
              onChange={(e) => setDepart(e.target.value)}
            />
          </label>

          <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            Laisse le départ vide si l'employé est encore en service. Les heures
            travaillées sont recalculées automatiquement.
          </p>
        </div>

        <div
          className="px-5 pt-3"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
            borderTop: "1px solid var(--border-light)",
            background: "var(--surface-2)",
          }}
        >
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="tap w-full min-h-[52px] rounded-[18px] text-[15px] font-extrabold flex items-center justify-center gap-2 disabled:opacity-60"
            style={{
              background: "var(--primary-green)",
              color: "#FFFFFF",
              boxShadow: "var(--glow-cta)",
            }}
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <CheckCircle2 size={16} />
            )}
            Enregistrer
          </button>
        </div>
      </motion.div>
    </>
  );
}
