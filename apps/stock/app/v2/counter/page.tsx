"use client";

/**
 * /v2/counter — Pickup screen client (TV / iPad au comptoir).
 *
 * Différenciateur fort vs concurrence halal (aucun n'a ça).
 * Inspiration : Carrefour Drive bornes A1/A2/B1…
 *
 * - Fullscreen, AUCUN V2Shell (pas de nav staff, c'est un écran public).
 * - Background sapin → noir.
 * - Typographie énorme (bay label clamp 64-120px).
 * - Polling supabase realtime sur `commandes_drive`, fallback setInterval 15s.
 * - Filtre : statut='pret' AND retired_at IS NULL.
 * - Anonymisation RGPD : « Mohamed B. » (prénom + initiale nom).
 * - Marche portrait iPad (768×1024) ET landscape TV (1920×1080).
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, Clock3 } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface CounterRow {
  id: string;
  numero_commande: string;
  client_nom: string;
  bay_label: string | null;
  pret_at: string | null;
  creneau_retrait: string;
}

/** Anonymise « Mohamed Belhaj » → « Mohamed B. » (RGPD écran public). */
function anonymize(fullName: string): string {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return "Client";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const last = parts[parts.length - 1];
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}

function formatHm(iso: string | null): string {
  if (!iso) return "--:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Ordre stable : par bay_label (A1, A2 … B6, OVERFLOW dernier). */
const BAY_ORDER: Record<string, number> = {
  A1: 1,
  A2: 2,
  A3: 3,
  A4: 4,
  A5: 5,
  A6: 6,
  B1: 7,
  B2: 8,
  B3: 9,
  B4: 10,
  B5: 11,
  B6: 12,
};

function bayWeight(bay: string | null): number {
  if (!bay) return 999;
  return BAY_ORDER[bay] ?? 998;
}

export default function CounterPage() {
  const [rows, setRows] = useState<CounterRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Horloge : null au premier rendu (SSR + hydratation initiale identiques)
  // puis fixée côté client après le mount. Avant : useState(() => new Date())
  // rendait l'heure SERVEUR au SSR ≠ heure client → hydration mismatch
  // React #418/#425 sur l'écran comptoir.
  const [now, setNow] = useState<Date | null>(null);

  // Horloge en haut à droite — tick toutes les 30s (assez précis pour TV).
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const fetchRows = useCallback(async () => {
    const sb = supabase();
    if (!sb) {
      // Sans Supabase : en PROD on n'affiche JAMAIS de fausses commandes sur
      // l'écran comptoir (le préparateur croirait à de vraies commandes
      // prêtes). Le mock de preview reste réservé au dev local.
      if (process.env.NODE_ENV === "production") {
        setRows([]);
        setLoaded(true);
        return;
      }
      // Fallback dev sans Supabase — mock 3 commandes pour preview design.
      setRows([
        {
          id: "mock-1",
          numero_commande: "D2026-0142",
          client_nom: "Mohamed Belhaj",
          bay_label: "A1",
          pret_at: new Date(Date.now() - 4 * 60_000).toISOString(),
          creneau_retrait: new Date().toISOString(),
        },
        {
          id: "mock-2",
          numero_commande: "D2026-0143",
          client_nom: "Fatima Zahra",
          bay_label: "A3",
          pret_at: new Date(Date.now() - 2 * 60_000).toISOString(),
          creneau_retrait: new Date().toISOString(),
        },
        {
          id: "mock-3",
          numero_commande: "D2026-0144",
          client_nom: "Karim Idrissi",
          bay_label: "B1",
          pret_at: new Date(Date.now() - 1 * 60_000).toISOString(),
          creneau_retrait: new Date().toISOString(),
        },
      ]);
      setLoaded(true);
      return;
    }
    const { data, error } = await sb
      .from("commandes_drive")
      .select(
        "id, numero_commande, client_nom, bay_label, pret_at, creneau_retrait",
      )
      .eq("statut", "pret")
      .is("retired_at", null)
      .order("pret_at", { ascending: true });
    if (error) {
      // En cas d'erreur on garde l'état précédent — pas de flash écran vide.
      console.error("[counter] fetchRows error", error);
      setLoaded(true);
      return;
    }
    setRows((data ?? []) as CounterRow[]);
    setLoaded(true);
  }, []);

  // Initial load + realtime subscribe + fallback poll 15s.
  useEffect(() => {
    void fetchRows();

    const sb = supabase();
    let unsub: (() => void) | null = null;

    if (sb) {
      const channel = sb
        .channel("counter-commandes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "commandes_drive" },
          () => {
            void fetchRows();
          },
        )
        .subscribe();
      unsub = () => {
        void sb.removeChannel(channel);
      };
    }

    // Fallback polling 15s — couvre les ratés de realtime (reco wifi etc).
    const poll = setInterval(() => {
      void fetchRows();
    }, 15_000);

    return () => {
      clearInterval(poll);
      if (unsub) unsub();
    };
  }, [fetchRows]);

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const w = bayWeight(a.bay_label) - bayWeight(b.bay_label);
        if (w !== 0) return w;
        return (a.pret_at ?? "").localeCompare(b.pret_at ?? "");
      }),
    [rows],
  );

  // Commande la plus ANCIENNE (la plus petite pret_at) — celle qui attend
  // le plus longtemps. On lui pose un pulse glow or pour attirer l'œil du
  // client. Indépendant de l'ordre d'affichage (qui est par bay).
  const oldestId = useMemo(() => {
    let best: CounterRow | null = null;
    for (const r of rows) {
      if (!r.pret_at) continue;
      if (!best || r.pret_at < (best.pret_at ?? "")) best = r;
    }
    return best?.id ?? null;
  }, [rows]);

  return (
    <main
      data-theme="nuit"
      className="fixed inset-0 overflow-hidden text-[var(--text-primary)]"
      style={{
        fontFamily: "var(--font-jakarta), system-ui, sans-serif",
        background: "var(--bg-abyss)",
      }}
    >
      {/* Vignette radiale sapin — depth cinéma. Deux halos : un sapin
          haut-gauche (chaleur), un assombrissement périphérique. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(120% 90% at 18% 0%, rgba(27,106,74,0.30) 0%, transparent 55%), radial-gradient(140% 120% at 50% 50%, transparent 40%, rgba(4,12,9,0.55) 100%)",
        }}
      />

      {/* Header
          L99-iPad : contenu capé à 820px centré dès `md` pour ne pas gaspiller
          l'espace iPad paysage. Le cap est LEVÉ en `2xl` (≥1536px) → le mode
          TV/fullscreen (~1920px) reprend toute la largeur (pleine surface
          néon, inchangé). Le fond/vignette du <main> reste pleine page. */}
      <header className="relative w-full md:max-w-[820px] md:mx-auto 2xl:max-w-none 2xl:mx-0 px-8 lg:px-14 pt-8 lg:pt-12 pb-4 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p
            className="font-bold tracking-[0.32em] uppercase text-[var(--accent-gold-dim)]"
            style={{ fontSize: "clamp(11px, 1.1vw, 16px)" }}
          >
            Salam Market · Drive
          </p>
          <h1
            className="font-bold tracking-tight leading-[0.95] mt-3 text-[var(--text-primary)]"
            style={{ fontSize: "clamp(40px, 5.6vw, 92px)" }}
          >
            Commandes prêtes
          </h1>
          <p
            className="text-[var(--text-secondary)] mt-3 max-w-[28ch]"
            style={{ fontSize: "clamp(14px, 1.4vw, 22px)" }}
          >
            Présentez-vous à la borne indiquée à côté de votre numéro.
          </p>
        </div>
        <div className="text-right shrink-0">
          <div
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 font-bold tabular text-[var(--text-primary)] border border-[var(--border-card)]"
            style={{
              fontSize: "clamp(14px, 1.3vw, 20px)",
              background: "var(--glass-nav)",
              backdropFilter: "var(--glass-nav-blur)",
            }}
          >
            <Clock3 className="w-4 h-4 text-[var(--accent-gold-bright)]" />
            <span suppressHydrationWarning>
              {now
                ? now.toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "--:--"}
            </span>
          </div>
          <p
            className="text-[var(--text-tertiary)] mt-2 tracking-widest uppercase"
            style={{ fontSize: "clamp(9px, 0.7vw, 12px)" }}
          >
            {sorted.length} en attente
          </p>
        </div>
      </header>

      {/* Grid — overflow-y-auto pour absorber les pics (>12 commandes
          prêtes simultanément). overflow-hidden masquait les bay au-delà
          de la zone visible, ce qui était silencieusement dangereux :
          un client en bay B5 ne voyait jamais son numéro affiché. Avec
          le scroll + un badge "+N en attente", on garantit que
          personne n'est invisible. */}
      <CounterGrid sorted={sorted} loaded={loaded} oldestId={oldestId} />

      {/* Footer hint */}
      <footer className="absolute bottom-4 inset-x-0 text-center text-[var(--text-tertiary)] text-[11px] tracking-[0.18em] uppercase font-semibold pointer-events-none">
        Mise à jour automatique
      </footer>
    </main>
  );
}

/**
 * CounterGrid — grid scrollable avec badge overflow.
 *
 * Le badge "+N en attente" apparaît en bas-droite si la liste dépasse
 * la zone visible. Mesuré via ResizeObserver + scroll listener pour
 * être réactif au resize TV/iPad (rotation, fullscreen toggle).
 */
function CounterGrid({
  sorted,
  loaded,
  oldestId,
}: {
  sorted: CounterRow[];
  loaded: boolean;
  oldestId: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [overflowCount, setOverflowCount] = useState(0);

  // Compte les cards qui dépassent la zone visible. Utilise offsetTop
  // sur chaque enfant — coûteux mais on a ≤30 cards typiquement et
  // on ne recalcule qu'au scroll/resize/changement de liste.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const visibleBottom = el.scrollTop + el.clientHeight;
      let hidden = 0;
      const children = el.querySelectorAll<HTMLElement>("[data-bay-card]");
      children.forEach((child) => {
        const childBottom = child.offsetTop + child.offsetHeight;
        // Tolérance 8px pour pas compter les cards "à la limite".
        if (childBottom > visibleBottom + 8) hidden += 1;
      });
      setOverflowCount(hidden);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });

    const ro = new ResizeObserver(update);
    ro.observe(el);

    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [sorted.length, loaded]);

  return (
    // L99-iPad : même cadrage que le header (820px centré ≥md, levé en 2xl
    // pour le mode TV/fullscreen). overflow badge + EmptyState restent dans ce
    // cadre, donc l'écran iPad paysage ne disperse plus les bornes au bord.
    <section className="w-full md:max-w-[820px] md:mx-auto 2xl:max-w-none 2xl:mx-0 px-8 lg:px-14 pb-8 lg:pb-12 h-[calc(100%-200px)] relative">
      {!loaded ? null : sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div
            ref={containerRef}
            className="h-full overflow-y-auto pr-1 -mr-1"
            style={{ scrollbarColor: "rgba(255,255,255,0.2) transparent" }}
          >
            <div
              className="grid gap-5 lg:gap-7 content-start pb-2"
              style={{
                gridTemplateColumns:
                  "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
              }}
            >
              <AnimatePresence initial={false}>
                {sorted.map((row) => (
                  <BayCard
                    key={row.id}
                    row={row}
                    isOldest={row.id === oldestId}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Badge overflow — bottom-right au-dessus du footer hint.
              Apparaît seulement s'il y a des cards masquées. */}
          {overflowCount > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="absolute bottom-12 right-8 lg:right-14 z-10 pointer-events-none"
            >
              <div
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 font-bold text-[var(--accent-gold-bright)] border border-[var(--border-premium)]"
                style={{
                  fontSize: "clamp(13px, 1.1vw, 18px)",
                  background: "var(--surface-2)",
                  boxShadow: "var(--accent-gold-glow)",
                }}
              >
                <ArrowDown className="w-4 h-4" aria-hidden />+{overflowCount} en
                attente
              </div>
            </motion.div>
          )}
        </>
      )}
    </section>
  );
}

function BayCard({ row, isOldest }: { row: CounterRow; isOldest: boolean }) {
  // L99 : "OVERFLOW" ET bay non assignée (null) → couleur danger distincte.
  // Une commande sans borne lisible ne doit jamais se fondre dans l'or des
  // autres : on la signale en rouge pour ne pas la perdre visuellement.
  const isOverflow = row.bay_label === "OVERFLOW" || row.bay_label == null;
  return (
    <motion.div
      layout
      data-bay-card
      initial={{ opacity: 0, x: 60, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -40, scale: 0.94 }}
      transition={{ duration: 0.36, ease: [0.22, 0.61, 0.36, 1] }}
      className={`relative rounded-[28px] p-6 lg:p-8 flex flex-col gap-3 ${
        isOldest ? "counter-card-pulse" : ""
      }`}
      style={{
        background: "var(--surface-1)",
        border: isOldest
          ? "1px solid var(--border-premium)"
          : "1px solid var(--border-card)",
        boxShadow: "var(--shadow-elevated)",
      }}
    >
      {/* Bay label — gigantesque pour un code court (A1, B2…), rayonne comme un
          néon. Sans borne assignée (overflow), on N'affiche PAS le mot
          « OVERFLOW » (8 lettres qui débordaient la carte) : un libellé « En
          file » compact qui tient, le n° de commande reste l'identifiant. */}
      <p
        className="font-bold tabular tracking-tighter leading-none"
        style={{
          fontSize: isOverflow
            ? "clamp(28px, 3.4vw, 52px)"
            : "clamp(64px, 8.4vw, 124px)",
          color: isOverflow ? "var(--danger)" : "var(--accent-gold-bright)",
          textShadow: isOverflow
            ? "0 0 24px rgba(255,112,98,0.30)"
            : "0 0 32px rgba(242,212,105,0.42), 0 0 64px rgba(242,212,105,0.18)",
        }}
      >
        {isOverflow ? "En file" : row.bay_label}
      </p>

      {/* Numero commande */}
      <p
        className="font-bold tracking-wide text-[var(--text-primary)] tabular"
        style={{ fontSize: "clamp(18px, 1.8vw, 28px)" }}
      >
        {row.numero_commande}
      </p>

      {/* Client + heure */}
      <div className="flex items-baseline justify-between gap-3 mt-1">
        <p
          className="text-[var(--text-secondary)] truncate"
          style={{ fontSize: "clamp(14px, 1.2vw, 20px)" }}
        >
          {anonymize(row.client_nom)}
        </p>
        <p
          className="text-[var(--text-tertiary)] tabular shrink-0"
          style={{ fontSize: "clamp(12px, 1vw, 18px)" }}
        >
          {formatHm(row.pret_at)}
        </p>
      </div>
    </motion.div>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6">
      <div
        className="w-3 h-3 rounded-full animate-pulse mb-6"
        style={{
          background: "var(--accent-gold-bright)",
          boxShadow: "var(--accent-gold-glow)",
        }}
      />
      <p
        className="font-bold tracking-tight max-w-[24ch] text-[var(--text-primary)]"
        style={{ fontSize: "clamp(28px, 3.6vw, 56px)" }}
      >
        Aucune commande prête actuellement
      </p>
      <p
        className="text-[var(--text-secondary)] mt-4 max-w-[36ch]"
        style={{ fontSize: "clamp(14px, 1.3vw, 22px)" }}
      >
        Préparation en cours en arrière-boutique. Patientez quelques instants.
      </p>
    </div>
  );
}
