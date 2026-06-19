"use client";

/**
 * /v2/admin/ramadan — MODE SAISONNIER (MYTH-05)
 *
 * Le moat hijri rendu ACTIONNABLE. Quand un événement majeur approche
 * (pré-Ramadan J-7, Ramadan, pré-Aïd al-Adha J-7, Aïd), cette page
 * devient le centre de pilotage saisonnier d'Otmane :
 *
 *   • Hero compte à rebours ("J-7 avant l'Aïd al-Adha")
 *   • Multiplicateurs de demande par catégorie (depuis la courbe hijri)
 *   • Checklist de constitution de stocks (cochage persisté en local)
 *   • PO prévisionnel pré-rempli en 1 tap (api/po/auto-generate avec le
 *     boost saisonnier) → Otmane n'a plus qu'à valider.
 *
 * Hors fenêtre saisonnière : on affiche le prochain événement + un état
 * "rien à anticiper" calme (pas de fausse urgence).
 *
 * Tokens MYTHOS dark par défaut. L'or reste ACCENT (countdown, liserés,
 * pastilles), jamais fill de grande surface.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  Loader2,
  Moon,
  PackageCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { EditorialEyebrow } from "@/components/v2/EditorialEyebrow";
import { getSeasonalMode, type SeasonalMode } from "@/lib/hijri";

const CHECK_STORAGE_KEY = "salam:ramadan:checklist";

function loadChecks(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CHECK_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export default function RamadanModePage() {
  const router = useRouter();
  // Résolution locale instantanée (pas d'attente réseau pour le hero).
  const mode = useMemo<SeasonalMode | null>(() => getSeasonalMode(), []);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setChecks(loadChecks());
  }, []);

  const toggleCheck = useCallback((key: string) => {
    setChecks((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        window.localStorage.setItem(CHECK_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* quota / private mode — on ignore */
      }
      return next;
    });
  }, []);

  const checklistDone = useMemo(() => {
    if (!mode) return 0;
    return mode.checklist.filter((c) => checks[c.key]).length;
  }, [mode, checks]);

  async function genererPoPrevisionnel() {
    setGenerating(true);
    try {
      const res = await fetch("/api/po/auto-generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "proactif" }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        created?: number;
        updated?: number;
        candidates?: number;
        blocked_count?: number;
        seasonal_mode?: string | null;
        horizon_cible_jours?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Échec génération");
      }
      const total = (data.created ?? 0) + (data.updated ?? 0);
      if (total === 0 && (data.candidates ?? 0) === 0) {
        toast.info("Stocks suffisants — aucun PO à anticiper pour l'instant.");
      } else {
        toast.success(
          `${total} brouillon${total > 1 ? "s" : ""} de PO prévisionnel prêt${
            total > 1 ? "s" : ""
          } — couverture ${data.horizon_cible_jours ?? "?"} j`,
          { duration: 3800 },
        );
      }
      if (data.blocked_count && data.blocked_count > 0) {
        toast.warning(
          `${data.blocked_count} ligne${
            data.blocked_count > 1 ? "s" : ""
          } bloquée${data.blocked_count > 1 ? "s" : ""} (certif halal à renouveler)`,
          { duration: 4500 },
        );
      }
      // On laisse Otmane filer sur la file PO pour valider.
      if (total > 0) {
        setTimeout(() => router.push("/v2/po"), 900);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur génération PO");
    } finally {
      setGenerating(false);
    }
  }

  // ─── Hors saison : état calme ───────────────────────────────────
  if (!mode) {
    return (
      <V2Shell hideNav>
        <PageAccentStripe accent="sapin-or" />
        <header className="px-4 sm:px-5 pt-7">
          <BackButton href="/v2/admin" />
          <EditorialEyebrow num="08" label="Mode saisonnier" className="mt-3" />
          <h1 className="h1-display mt-1">
            Calendrier <span className="gold">hijri</span>
          </h1>
        </header>
        <section className="px-4 sm:px-5 mt-8 pb-[max(3rem,env(safe-area-inset-bottom))]">
          <div className="lg rise-in p-8 text-center max-w-prose mx-auto">
            <Moon
              className="w-8 h-8 mx-auto mb-3 text-[var(--accent-gold-bright)]"
              strokeWidth={2}
            />
            <p className="text-[15px] font-bold text-[var(--text-primary)]">
              Aucun événement majeur dans les 7 prochains jours
            </p>
            <p className="text-[13px] text-[var(--text-secondary)] mt-2 max-w-prose mx-auto">
              Le mode saisonnier s&apos;activera automatiquement à J-7 avant le
              Ramadan ou l&apos;Aïd al-Adha — avec la checklist de stocks et le
              PO prévisionnel pré-rempli.
            </p>
          </div>
        </section>
      </V2Shell>
    );
  }

  const ramp = mode.kind.startsWith("pre_");

  return (
    <V2Shell hideNav>
      <PageAccentStripe accent="sapin-or" />
      <header className="px-4 sm:px-5 pt-7">
        <BackButton href="/v2/admin" />
        <EditorialEyebrow num="08" label="Mode saisonnier" className="mt-3" />
        <h1 className="h1-display mt-1">
          {mode.titre.replace("Mode ", "")}{" "}
          <span className="gold">activé</span>
        </h1>
        <p className="body-md text-[var(--text-secondary)] mt-2 max-w-prose">
          {mode.sous_titre}.
        </p>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}
        className="px-4 sm:px-5 mt-5 flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:gap-5 lg:items-start pb-[max(3rem,env(safe-area-inset-bottom))]"
      >
        {/* ── HERO COUNTDOWN ──
            .hero-action-card = surface hero dual-mode du design system :
            dégradé sapin en nuit, verre clair en jour. Les tokens texte
            (--text-primary, --accent-gold-bright) restent lisibles dans les
            deux modes — pas de texte sombre sur fond sombre. */}
        <div className="hero-action-card relative rounded-[28px] p-6 overflow-hidden rise-in lg:col-span-2">
          <span
            aria-hidden
            className="absolute right-[-30px] top-[-30px] w-40 h-40 rounded-full opacity-[0.10]"
            style={{ background: "var(--accent-gold-bright)", filter: "blur(40px)" }}
          />
          <div className="relative flex items-center gap-2">
            <Moon
              className="w-4 h-4 text-[var(--accent-gold-bright)]"
              strokeWidth={2.4}
            />
            <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-[var(--accent-gold-dim)]">
              Compte à rebours
            </p>
          </div>
          <div className="relative flex items-end gap-3 mt-3 flex-wrap">
            <p
              className="text-[60px] sm:text-[72px] font-extrabold leading-none tracking-tight text-[var(--accent-gold-bright)] tabular"
              style={{ textShadow: "var(--bignum-glow)" }}
            >
              {mode.en_cours
                ? "EN COURS"
                : mode.jours_jusqua === 0
                  ? "J"
                  : `J-${mode.jours_jusqua}`}
            </p>
          </div>
          <p className="relative text-[15px] font-bold text-[var(--text-primary)] mt-2">
            {mode.countdown_label}
          </p>
          <div
            className="relative mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{
              background: "var(--accent-gold-soft)",
              border: "1px solid var(--border-premium)",
            }}
          >
            <TrendingUp
              className="w-3.5 h-3.5 text-[var(--accent-gold-bright)]"
              strokeWidth={2.6}
            />
            <span className="text-[12px] font-bold text-[var(--accent-gold-bright)] tabular">
              Demande jusqu&apos;à ×{mode.multiplicateur_max.toFixed(1)}
            </span>
          </div>
        </div>

        {/* ── ACTION : PO PRÉVISIONNEL ── */}
        <div
          className="lg rise-in p-5 flex flex-col lg:col-span-2"
          style={{ ["--i" as string]: 1 }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                background: "var(--primary-green-soft)",
              }}
            >
              <Sparkles
                className="w-5 h-5 text-[var(--accent-gold-bright)]"
                strokeWidth={2.2}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-bold text-[var(--text-primary)]">
                PO prévisionnel pré-rempli
              </p>
              <p className="text-[12.5px] text-[var(--text-secondary)] mt-1">
                On dimensionne les commandes sur la demande ajustée du{" "}
                {mode.titre.toLowerCase()} et on gonfle la couverture pour tenir
                le pic. Vous validez.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void genererPoPrevisionnel()}
            disabled={generating}
            className="tap w-full min-h-[52px] mt-4 rounded-[20px] text-[15px] font-bold flex items-center justify-center gap-2 transition disabled:opacity-60"
            style={{
              background: "var(--primary-green)",
              color: "var(--text-primary)",
              boxShadow: "var(--glow-cta)",
            }}
          >
            {generating ? (
              <Loader2 className="w-[18px] h-[18px] animate-spin" />
            ) : (
              <PackageCheck className="w-[18px] h-[18px]" strokeWidth={2.4} />
            )}
            {generating ? "Génération…" : "Générer le PO prévisionnel"}
          </button>
        </div>

        {/* ── MULTIPLICATEURS PAR CATÉGORIE ── */}
        <div className="lg rise-in p-5" style={{ ["--i" as string]: 2 }}>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp
              className="w-4 h-4 text-[var(--accent-gold-dim)]"
              strokeWidth={2.4}
            />
            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--accent-gold-dim)]">
              Multiplicateurs de demande
            </p>
          </div>
          <ul className="flex flex-col gap-2.5">
            {mode.multiplicateurs.map((m) => {
              const pct = Math.min(100, (m.multiplicateur / 4.5) * 100);
              const hot = m.multiplicateur >= 2;
              return (
                <li key={m.categorie} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13.5px] font-semibold text-[var(--text-primary)]">
                      {m.label}
                    </span>
                    <span
                      className="text-[13px] font-extrabold tabular shrink-0"
                      style={{
                        color: hot
                          ? "var(--accent-gold-bright)"
                          : "var(--text-secondary)",
                      }}
                    >
                      ×{m.multiplicateur.toFixed(2)}
                    </span>
                  </div>
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ background: "var(--surface-0)" }}
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${pct}%`,
                        background: hot
                          ? "linear-gradient(90deg, var(--accent-gold) 0%, var(--accent-gold-bright) 100%)"
                          : "var(--primary-green-hover)",
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-[var(--text-tertiary)] mt-3">
            Issus de la courbe hijri × catégorie (estimation Otmane v1, affinée
            chaque saison avec les ventes réelles).
          </p>
        </div>

        {/* ── CHECKLIST ── */}
        <div className="lg rise-in p-5" style={{ ["--i" as string]: 3 }}>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <CalendarClock
                className="w-4 h-4 text-[var(--accent-gold-dim)]"
                strokeWidth={2.4}
              />
              <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--accent-gold-dim)]">
                Checklist {ramp ? "anticipation" : "pic"}
              </p>
            </div>
            <span className="text-[12px] font-bold text-[var(--text-secondary)] tabular">
              {checklistDone}/{mode.checklist.length}
            </span>
          </div>
          <ul className="flex flex-col">
            {mode.checklist.map((c, i) => {
              const done = !!checks[c.key];
              return (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={() => toggleCheck(c.key)}
                    className={`tap w-full flex items-center gap-3 min-h-[44px] py-3 text-left ${
                      i > 0 ? "border-t border-[var(--border-hairline)]" : ""
                    }`}
                  >
                    {done ? (
                      <CheckCircle2
                        className="w-5 h-5 shrink-0 text-[var(--success)]"
                        strokeWidth={2.2}
                      />
                    ) : (
                      <Circle
                        className="w-5 h-5 shrink-0 text-[var(--text-tertiary)]"
                        strokeWidth={2}
                      />
                    )}
                    <span
                      className={`text-[14px] font-semibold ${
                        done
                          ? "text-[var(--text-tertiary)] line-through"
                          : "text-[var(--text-primary)]"
                      }`}
                    >
                      {c.label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </motion.div>
    </V2Shell>
  );
}
