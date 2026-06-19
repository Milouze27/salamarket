"use client";

/**
 * /v2/cockpit/tv — Projection plein écran du cockpit pour l'écran du dépôt.
 *
 * Pensé pour une TV accrochée au mur de la réserve : Ahmed ou Otmane
 * la lit À DISTANCE (3-5 m). Donc : gros texte, contraste fort, charte
 * sombre sapin, zéro chrome (pas de header app, pas de nav). Les panneaux
 * tournent automatiquement (KPI → ruptures → DLC → brief) pour qu'un seul
 * écran raconte toute la journée sans interaction.
 *
 * Recyclage : on réutilise loadCockpitSnapshot + loadCockpitBriefing (mêmes
 * server actions que /v2/cockpit). Aucune nouvelle route data.
 *
 * Robustesse écran permanent :
 *   - wake-lock (l'écran ne se met pas en veille) avec ré-acquisition au
 *     retour de visibilité ;
 *   - auto-refresh des données toutes les 2 min ;
 *   - rotation de panneau toutes les 12 s ;
 *   - tout est résilient : un panneau sans data affiche un état "calme".
 *
 * Charte : on n'utilise QUE des tokens à valeur stable (sapin foncé, or,
 * text-on-dark) pour rester sombre quel que soit le thème jour/nuit actif.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Clock,
  Flame,
  ListChecks,
  PackageX,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { getHijriContext, getSalutation } from "@/lib/hijri";
import type { CockpitSnapshot } from "@/app/api/cockpit/snapshot/route";
import type { CockpitBriefing } from "@/app/api/cockpit/briefing/route";

const PANEL_ROTATE_MS = 12_000;
const DATA_REFRESH_MS = 120_000;

function formatEur(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

type PanelKind = "kpi" | "ruptures" | "dlc" | "brief";

export default function CockpitTvPage() {
  const router = useRouter();
  const [snap, setSnap] = useState<CockpitSnapshot | null>(null);
  const [briefing, setBriefing] = useState<CockpitBriefing | null>(null);
  // Tout l'écran dépend du temps (horloge, date, salutation, contexte hijri) et
  // de l'API navigateur (wake-lock). Rendu tel quel, le HTML SSR ≠ HTML client
  // → erreurs d'hydratation React #418/#425/#422. On garde donc `now` à null au
  // 1er rendu (serveur ET premier rendu client identiques = aucun mismatch), puis
  // on le renseigne dans un effet, côté client uniquement. `mounted` = guard.
  const [now, setNow] = useState<Date | null>(null);
  const mounted = now !== null;
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // ─── Data : snapshot + briefing, rechargés en boucle ──────────────
  const loadData = useCallback(async () => {
    try {
      const { loadCockpitSnapshot, loadCockpitBriefing } = await import(
        "@/lib/actions/cockpit"
      );
      const [s, b] = await Promise.all([
        loadCockpitSnapshot(),
        loadCockpitBriefing(),
      ]);
      if (s.ok && s.data) setSnap(s.data);
      if (b.ok && b.data) setBriefing(b.data);
    } catch {
      /* écran TV : on garde la dernière donnée connue, pas de crash */
    }
  }, []);

  useEffect(() => {
    void loadData();
    const id = setInterval(() => void loadData(), DATA_REFRESH_MS);
    return () => clearInterval(id);
  }, [loadData]);

  // ─── Horloge (1/s) pour le coin haut-droit ────────────────────────
  // Première valeur posée ici (et pas à l'init du state) → l'horloge n'existe
  // que côté client, ce qui élimine le mismatch d'hydratation.
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ─── Wake-lock : empêcher la mise en veille de l'écran ────────────
  useEffect(() => {
    let cancelled = false;
    async function acquire() {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> };
        };
        if (!nav.wakeLock) return;
        const sentinel = await nav.wakeLock.request("screen");
        if (cancelled) {
          void sentinel.release();
          return;
        }
        wakeLockRef.current = sentinel;
      } catch {
        /* wake-lock non supporté / refusé → tant pis, on continue */
      }
    }
    void acquire();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      const s = wakeLockRef.current;
      wakeLockRef.current = null;
      if (s) void s.release().catch(() => {});
    };
  }, []);

  // ─── Rotation des panneaux ────────────────────────────────────────
  // On ne montre que les panneaux qui ont du sens (ex. ruptures seulement
  // s'il y en a) — sinon la TV afficherait des écrans vides répétés.
  const panels = useMemo<PanelKind[]>(() => {
    const out: PanelKind[] = ["kpi"];
    if (snap && snap.stockout.count_total > 0) out.push("ruptures");
    if (snap && snap.dlc.count_total > 0) out.push("dlc");
    if (briefing && briefing.actions.length > 0) out.push("brief");
    return out;
  }, [snap, briefing]);

  const [panelIdx, setPanelIdx] = useState(0);
  useEffect(() => {
    if (panels.length <= 1) return;
    const id = setInterval(
      () => setPanelIdx((i) => (i + 1) % panels.length),
      PANEL_ROTATE_MS,
    );
    return () => clearInterval(id);
  }, [panels.length]);
  // Si la liste de panneaux rétrécit, on évite un index hors-bornes.
  useEffect(() => {
    if (panelIdx >= panels.length) setPanelIdx(0);
  }, [panels.length, panelIdx]);

  const activePanel = panels[panelIdx] ?? "kpi";

  // ─── Contexte hijri (fallback local instantané) ───────────────────
  // Tout ce bloc dépend de l'heure courante : on ne le calcule qu'une fois
  // monté côté client (now non-null) pour ne pas casser l'hydratation.
  const prenom = "Otmane";
  const salutation = snap?.salutation ?? (now ? getSalutation(now) : "");
  const hijriMessage = useMemo(
    () => snap?.hijri.message ?? (now ? getHijriContext().message : ""),
    [snap?.hijri.message, now],
  );

  const heure = now
    ? now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : "";
  const dateLong = now
    ? now.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : "";

  // Premier rendu (serveur + 1re passe client) : écran sapin neutre, identique
  // des deux côtés → React peut hydrater sans aucun mismatch. Le contenu réel
  // apparaît à la frame suivante, une fois `now` posé dans l'effet horloge.
  if (!mounted) {
    return (
      <div
        suppressHydrationWarning
        className="fixed inset-0 z-[200] overflow-hidden flex items-center justify-center"
        style={{
          background:
            "radial-gradient(120% 90% at 80% 0%, var(--primary-green) 0%, var(--primary-green-dark) 55%, var(--primary-green-dark) 100%)",
          color: "var(--text-on-dark-muted)",
        }}
      >
        <p
          className="font-bold"
          style={{ fontSize: "clamp(18px, 2vw, 30px)" }}
        >
          Chargement du cockpit…
        </p>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[200] overflow-hidden flex flex-col"
      style={{
        background:
          "radial-gradient(120% 90% at 80% 0%, var(--primary-green) 0%, var(--primary-green-dark) 55%, var(--primary-green-dark) 100%)",
        color: "var(--text-on-dark)",
        padding: "max(2.5vh, env(safe-area-inset-top)) 4vw",
      }}
    >
      {/* ─── Barre supérieure : marque + horloge + sortie ─────────── */}
      <div className="flex items-start justify-between gap-4 shrink-0">
        <div className="flex flex-col">
          <p
            className="font-extrabold uppercase tracking-[0.2em]"
            style={{
              fontSize: "clamp(11px, 1.4vw, 18px)",
              color: "var(--accent-gold-bright)",
            }}
          >
            Salamarket · Cockpit
          </p>
          <p
            className="font-bold capitalize"
            style={{
              fontSize: "clamp(13px, 1.6vw, 22px)",
              color: "var(--text-on-dark-muted)",
            }}
          >
            {dateLong}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <p
            className="font-extrabold tabular-nums"
            style={{ fontSize: "clamp(28px, 4.2vw, 64px)", lineHeight: 1 }}
          >
            {heure}
          </p>
          <button
            type="button"
            onClick={() => router.push("/v2/cockpit")}
            aria-label="Quitter le mode TV"
            className="rounded-full flex items-center justify-center transition active:scale-95"
            style={{
              width: "clamp(40px, 4vw, 56px)",
              height: "clamp(40px, 4vw, 56px)",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.16)",
              color: "var(--text-on-dark-muted)",
            }}
          >
            <X style={{ width: "55%", height: "55%" }} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      {/* ─── Salutation hijri (toujours visible, contexte permanent) ── */}
      <div className="shrink-0 mt-[2vh]">
        <p
          className="font-extrabold leading-tight"
          style={{ fontSize: "clamp(22px, 3vw, 46px)" }}
        >
          {salutation}{" "}
          <span style={{ color: "var(--accent-gold-bright)" }}>{prenom}</span>
        </p>
        <p
          className="font-semibold"
          style={{
            fontSize: "clamp(14px, 1.7vw, 26px)",
            color: "var(--text-on-dark-muted)",
          }}
        >
          {hijriMessage}
        </p>
      </div>

      {/* ─── Panneau central rotatif ─────────────────────────────── */}
      <div className="flex-1 min-h-0 flex items-center justify-center mt-[2vh]">
        {!snap ? (
          <p
            className="font-bold"
            style={{
              fontSize: "clamp(18px, 2vw, 30px)",
              color: "var(--text-on-dark-muted)",
            }}
          >
            Chargement du cockpit…
          </p>
        ) : activePanel === "kpi" ? (
          <KpiPanel snap={snap} />
        ) : activePanel === "ruptures" ? (
          <RupturesPanel snap={snap} />
        ) : activePanel === "dlc" ? (
          <DlcPanel snap={snap} />
        ) : (
          <BriefPanel briefing={briefing} prenom={prenom} />
        )}
      </div>

      {/* ─── Pied : indicateurs de rotation des panneaux ─────────── */}
      {panels.length > 1 && (
        <div className="shrink-0 flex items-center justify-center gap-2 mt-[2vh] pb-[max(1vh,env(safe-area-inset-bottom))]">
          {panels.map((p, i) => (
            <span
              key={p}
              className="rounded-full transition-all"
              style={{
                width: i === panelIdx ? "clamp(20px,2.4vw,40px)" : "8px",
                height: "8px",
                background:
                  i === panelIdx
                    ? "var(--accent-gold-bright)"
                    : "rgba(255,255,255,0.25)",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Panneaux ───────────────────────────────────────────────────────

function KpiPanel({ snap }: { snap: CockpitSnapshot }) {
  const ca = snap.ventes_hier?.ca_ttc ?? null;
  const delta = snap.delta_n1_pct;
  const pctTarget = snap.ventes_hier?.pct_target ?? null;
  const tickets = snap.ventes_hier?.nb_tickets ?? null;
  const deltaPositive = delta !== null && delta >= 0;
  const TrendIcon = deltaPositive ? TrendingUp : TrendingDown;

  return (
    <div className="w-full max-w-[1400px] text-center">
      <p
        className="font-bold uppercase tracking-[0.18em]"
        style={{
          fontSize: "clamp(13px, 1.5vw, 22px)",
          color: "var(--text-on-dark-muted)",
        }}
      >
        Chiffre d'affaires hier
      </p>
      <p
        className="font-black tabular-nums leading-none mt-[1vh]"
        style={{ fontSize: "clamp(56px, 13vw, 220px)" }}
      >
        {ca !== null ? formatEur(ca) : "—"}
      </p>
      <div className="flex items-center justify-center gap-3 flex-wrap mt-[3vh]">
        {delta !== null && (
          <span
            className="inline-flex items-center gap-2 rounded-full font-extrabold tabular-nums"
            style={{
              fontSize: "clamp(18px, 2.4vw, 40px)",
              padding: "0.4em 0.8em",
              background: deltaPositive
                ? "rgba(120,220,160,0.16)"
                : "rgba(255,140,120,0.16)",
              color: deltaPositive
                ? "var(--text-on-dark)"
                : "var(--text-on-dark)",
            }}
          >
            <TrendIcon style={{ width: "1.1em", height: "1.1em" }} />
            {delta > 0 ? "+" : ""}
            {delta.toFixed(1)}% vs N-1
          </span>
        )}
        {pctTarget !== null && (
          <span
            className="inline-flex items-center rounded-full font-extrabold tabular-nums"
            style={{
              fontSize: "clamp(18px, 2.4vw, 40px)",
              padding: "0.4em 0.8em",
              background: "rgba(255,255,255,0.08)",
              color: "var(--accent-gold-bright)",
            }}
          >
            {pctTarget.toFixed(0)}% objectif
          </span>
        )}
        {tickets !== null && (
          <span
            className="inline-flex items-center rounded-full font-extrabold tabular-nums"
            style={{
              fontSize: "clamp(18px, 2.4vw, 40px)",
              padding: "0.4em 0.8em",
              background: "rgba(255,255,255,0.08)",
              color: "var(--text-on-dark-muted)",
            }}
          >
            {tickets} tickets
          </span>
        )}
      </div>
    </div>
  );
}

function RupturesPanel({ snap }: { snap: CockpitSnapshot }) {
  const rows = snap.stockout.top.slice(0, 5);
  return (
    <div className="w-full max-w-[1400px]">
      <PanelTitle
        icon={PackageX}
        accent="rgba(255,160,120,1)"
        title={`${snap.stockout.count_total} produit${snap.stockout.count_total > 1 ? "s" : ""} sous tension`}
        sub={
          snap.stockout.count_out > 0
            ? `${snap.stockout.count_out} en rupture imminente`
            : "À surveiller aujourd'hui"
        }
      />
      <ul className="mt-[2.5vh] flex flex-col gap-[1.4vh]">
        {rows.map((s, i) => {
          const danger = s.tier === "out" || s.tier === "blocker";
          return (
            <BigRow
              key={`${s.produit_id}-${s.depot_nom}`}
              index={i}
              label={s.produit_nom}
              meta={`${s.depot_nom} · stock ${s.stock_actuel}`}
              value={
                s.days_cover === null
                  ? "⚠"
                  : s.days_cover < 1
                    ? "rupture"
                    : `${s.days_cover.toFixed(1)} j`
              }
              danger={danger}
            />
          );
        })}
      </ul>
    </div>
  );
}

function DlcPanel({ snap }: { snap: CockpitSnapshot }) {
  const rows = snap.dlc.top.slice(0, 5);
  return (
    <div className="w-full max-w-[1400px]">
      <PanelTitle
        icon={Clock}
        accent="var(--accent-gold-bright)"
        title={`${snap.dlc.count_total} produit${snap.dlc.count_total > 1 ? "s" : ""} à remiser`}
        sub={`${formatEur(snap.dlc.valeur_eur)} de démarque estimée`}
      />
      <ul className="mt-[2.5vh] flex flex-col gap-[1.4vh]">
        {rows.map((d, i) => (
          <BigRow
            key={d.lot_id}
            index={i}
            label={d.produit_nom}
            meta={`${d.jours_restants <= 0 ? "Périmé" : `J-${d.jours_restants}`} · ${d.remise_suggeree_pct}% remise`}
            value={d.quantite_recue ? `${d.quantite_recue} u` : d.niveau_alerte}
            danger={
              d.niveau_alerte === "forcé" || d.niveau_alerte === "critique"
            }
          />
        ))}
      </ul>
    </div>
  );
}

function BriefPanel({
  briefing,
  prenom,
}: {
  briefing: CockpitBriefing | null;
  prenom: string;
}) {
  const actions = briefing?.actions ?? [];
  return (
    <div className="w-full max-w-[1400px]">
      <PanelTitle
        icon={ListChecks}
        accent="var(--accent-gold-bright)"
        title={`${prenom}, ${actions.length} priorité${actions.length > 1 ? "s" : ""} avant 10h`}
        sub="Le moteur a trié ta matinée"
      />
      <ol className="mt-[2.5vh] flex flex-col gap-[1.4vh]">
        {actions.map((a, i) => (
          <li
            key={i}
            className="flex items-center gap-[2vw] rounded-[24px] rise-in"
            style={{
              padding: "1.4vh 2vw",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              ["--i" as string]: i,
            }}
          >
            <span
              className="font-black tabular-nums shrink-0"
              style={{
                fontSize: "clamp(28px, 4vw, 64px)",
                color: "var(--accent-gold-bright)",
              }}
            >
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p
                className="font-extrabold leading-tight"
                style={{ fontSize: "clamp(18px, 2.4vw, 40px)" }}
              >
                {a.texte}
              </p>
              {a.meta && (
                <p
                  className="font-semibold"
                  style={{
                    fontSize: "clamp(13px, 1.5vw, 24px)",
                    color: "var(--text-on-dark-muted)",
                  }}
                >
                  {a.meta}
                </p>
              )}
            </div>
            {a.tone === "danger" && (
              <AlertTriangle
                className="shrink-0"
                style={{
                  width: "clamp(24px,3vw,48px)",
                  height: "clamp(24px,3vw,48px)",
                  color: "rgba(255,160,120,1)",
                }}
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── Primitives partagées ───────────────────────────────────────────

function PanelTitle({
  icon: Icon,
  accent,
  title,
  sub,
}: {
  icon: typeof Flame;
  accent: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="flex items-center gap-[2vw]">
      <span
        className="rounded-[20px] flex items-center justify-center shrink-0"
        style={{
          width: "clamp(48px, 5vw, 84px)",
          height: "clamp(48px, 5vw, 84px)",
          background: "rgba(255,255,255,0.08)",
          color: accent,
        }}
      >
        <Icon style={{ width: "52%", height: "52%" }} strokeWidth={2.2} />
      </span>
      <div className="min-w-0">
        <p
          className="font-black leading-tight"
          style={{ fontSize: "clamp(24px, 3.4vw, 56px)" }}
        >
          {title}
        </p>
        <p
          className="font-semibold"
          style={{
            fontSize: "clamp(14px, 1.7vw, 28px)",
            color: "var(--text-on-dark-muted)",
          }}
        >
          {sub}
        </p>
      </div>
    </div>
  );
}

function BigRow({
  label,
  meta,
  value,
  danger,
  index = 0,
}: {
  label: string;
  meta: string;
  value: string;
  danger: boolean;
  index?: number;
}) {
  return (
    <li
      className="flex items-center gap-[2vw] rounded-[24px] rise-in"
      style={{
        padding: "1.4vh 2vw",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
        ["--i" as string]: index,
      }}
    >
      <div className="flex-1 min-w-0">
        <p
          className="font-extrabold leading-tight truncate"
          style={{ fontSize: "clamp(18px, 2.4vw, 40px)" }}
        >
          {label}
        </p>
        <p
          className="font-semibold truncate"
          style={{
            fontSize: "clamp(13px, 1.5vw, 24px)",
            color: "var(--text-on-dark-muted)",
          }}
        >
          {meta}
        </p>
      </div>
      <span
        className="font-black tabular-nums shrink-0 rounded-full"
        style={{
          fontSize: "clamp(16px, 2vw, 34px)",
          padding: "0.3em 0.7em",
          background: danger
            ? "rgba(255,140,120,0.18)"
            : "rgba(255,255,255,0.08)",
          color: danger ? "rgba(255,190,170,1)" : "var(--text-on-dark)",
        }}
      >
        {value}
      </span>
    </li>
  );
}
