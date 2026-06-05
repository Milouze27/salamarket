"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, ArrowRight, Command as CommandIcon } from "lucide-react";
import { useV2 } from "@/lib/v2-store";

/**
 * OnboardingOverlay — accueil premier login, UN seul écran (L99).
 *
 * Léger et dismissible : pas de tour multi-étapes. Montré UNE fois (clé
 * localStorage `onboarding-seen-v1`), jamais ré-affiché ensuite. Le contenu
 * est role-aware : on pointe l'employé directement vers l'action principale
 * de sa journée (réception → scanner, préparation → commandes drive, etc.).
 *
 * Style brand sapin/or via tokens globals.css. Scrim verre teinté
 * (--glass-overlay), safe-area, focus trap simple, Échap + clic-extérieur
 * ferment, motion ease-out avec respect de prefers-reduced-motion.
 *
 * Anti-flash SSR : ne se monte qu'après hydratation du store (state.hydrated)
 * et lecture localStorage côté client. Jamais rendu si déjà vu.
 */

const SEEN_KEY = "onboarding-seen-v1";

/** Phrase d'action principale du jour, propre au rôle. */
function actionForRole(role: string | undefined): string {
  switch (role) {
    case "reception":
      return "Commence par scanner les cartons en bas (Réception).";
    case "preparation":
      return "Tape sur Préparation en bas pour voir les commandes drive.";
    case "caisse":
      return "Consulte le stock ou gère le retrait au comptoir.";
    case "manager":
    case "admin":
      return "Pilote tes dépôts et le drive depuis l'accueil.";
    default:
      return "Choisis une action en bas pour démarrer.";
  }
}

function hasSeen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // localStorage indisponible (mode privé strict) → ne pas spammer.
    return true;
  }
}

function markSeen() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* noop */
  }
}

export function OnboardingOverlay() {
  const hydrated = useV2((s) => s.hydrated);
  const employe = useV2((s) => s.currentEmploye);
  const role = employe?.role;
  const firstName = employe?.prenom ?? employe?.nom ?? "";

  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);

  // Décide de l'affichage côté client uniquement, après hydratation du store.
  // On exige un employé connecté : l'overlay est un accueil "premier login".
  useEffect(() => {
    if (!hydrated) return;
    if (!employe) return;
    if (hasSeen()) return;
    setOpen(true);
  }, [hydrated, employe]);

  const close = useCallback(() => {
    markSeen();
    setOpen(false);
  }, []);

  // Échap ferme + focus initial sur le CTA. Lock du scroll body pendant l'ouverture.
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      // Focus trap simple : Tab boucle dans le dialog (CTA = seul élément focusable).
      if (e.key === "Tab") {
        const root = dialogRef.current;
        if (!root) return;
        const focusables = root.querySelectorAll<HTMLElement>(
          'button, [href], [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKey);
    // Focus initial sur le bouton "C'est parti".
    const raf = window.requestAnimationFrame(() => ctaRef.current?.focus());

    return () => {
      document.removeEventListener("keydown", onKey);
      window.cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      className="onboarding-overlay fixed inset-0 z-[120] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      style={{
        paddingTop: "var(--safe-top, env(safe-area-inset-top, 0px))",
        paddingBottom: "var(--safe-bottom, env(safe-area-inset-bottom, 0px))",
      }}
    >
      {/* Scrim verre teinté sapin — clic ferme. */}
      <button
        type="button"
        aria-label="Fermer l'accueil"
        onClick={close}
        className="onboarding-scrim absolute inset-0"
        style={{
          background: "var(--glass-overlay)",
          backdropFilter: "var(--glass-overlay-blur)",
          WebkitBackdropFilter: "var(--glass-overlay-blur)",
        }}
      />

      {/* Carte — gradient sapin, accents or. */}
      <div
        ref={dialogRef}
        className="onboarding-card relative w-full sm:max-w-[440px] mx-3 mb-3 sm:mb-0 rounded-[24px] overflow-hidden p-6 text-[color:var(--text-on-dark)]"
        style={{
          background:
            "linear-gradient(135deg, var(--primary-green) 0%, var(--primary-green-hover) 55%, var(--accent-gold) 145%)",
          border: "1px solid var(--accent-gold-hairline)",
          boxShadow: "var(--shadow-elevated)",
        }}
      >
        {/* Pastille or pâle, glyphe or-bright (accent, jamais fill plein). */}
        <span
          aria-hidden
          className="inline-flex w-12 h-12 rounded-2xl items-center justify-center text-[color:var(--accent-gold-bright)] mb-4"
          style={{
            background: "var(--accent-gold-soft)",
            border: "1px solid var(--accent-gold-hairline)",
          }}
        >
          <Sparkles className="w-6 h-6" strokeWidth={2.2} />
        </span>

        <h2
          id="onboarding-title"
          className="text-[22px] font-bold leading-[1.15] tracking-tight"
        >
          Bienvenue {firstName && <span className="gold">{firstName}</span>}
          {!firstName && "sur Salam Stock"}.
        </h2>

        <p className="text-[14px] text-[color:var(--text-on-dark-muted)] mt-3 leading-snug">
          {actionForRole(role)}
        </p>

        {/* Rappel aide — menu (•••) ou ⌘K. */}
        <p className="text-[12.5px] text-[color:var(--text-on-dark-muted)] mt-4 inline-flex items-center gap-1.5 flex-wrap">
          Besoin d'aide ? Menu
          <span
            aria-label="bouton menu trois points"
            className="inline-flex items-center justify-center font-bold text-[color:var(--accent-gold-bright)] px-1.5 py-0.5 rounded-md"
            style={{
              background: "var(--accent-gold-soft)",
              border: "1px solid var(--accent-gold-hairline)",
            }}
          >
            •••
          </span>
          ou
          <span
            className="inline-flex items-center gap-1 font-bold text-[color:var(--accent-gold-bright)] px-1.5 py-0.5 rounded-md"
            style={{
              background: "var(--accent-gold-soft)",
              border: "1px solid var(--accent-gold-hairline)",
            }}
          >
            <CommandIcon className="w-3 h-3" strokeWidth={2.6} />K
          </span>
        </p>

        {/* CTA — cible ≥44px, or-bright plein sur sapin. */}
        <button
          ref={ctaRef}
          type="button"
          onClick={close}
          className="onboarding-cta mt-6 w-full min-h-[48px] rounded-2xl font-bold text-[15px] inline-flex items-center justify-center gap-2 text-[color:var(--primary-green-dark)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent-gold-bright)] card-tappable"
          style={{ background: "var(--accent-gold-bright)" }}
        >
          C'est parti
          <ArrowRight className="w-4 h-4" strokeWidth={2.6} />
        </button>
      </div>

      {/* Motion ease-out + respect prefers-reduced-motion. */}
      <style jsx>{`
        .onboarding-scrim {
          animation: onboarding-fade 0.24s cubic-bezier(0.22, 0.61, 0.36, 1)
            both;
        }
        .onboarding-card {
          animation: onboarding-rise 0.28s cubic-bezier(0.22, 0.61, 0.36, 1)
            both;
        }
        @keyframes onboarding-fade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes onboarding-rise {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .onboarding-scrim,
          .onboarding-card {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

export default OnboardingOverlay;
