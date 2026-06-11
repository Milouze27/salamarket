import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { HalalSeal } from "@/components/HalalSeal";
import { useDialogA11y } from "@/hooks/useDialogA11y";

const EXIT_DURATION_MS = 300;

interface OnboardingFlowProps {
  /** Called by OnboardingGate to dismiss the overlay. */
  onDismiss?: () => void;
}

/**
 * Onboarding 1 slide poster — sapin nuit + sceau Halal Certifié au
 * centre + une phrase de bienvenue + un CTA unique "Commencer mes
 * courses".
 *
 * Audit 2026-05-30 : les 3 slides "Suivant / Passer" précédents
 * ressemblaient à un template SaaS et masquaient le vrai hero
 * éditorial. Cette version retient juste l'essentiel : poser la
 * marque, dégager la voie vers le catalogue.
 *
 * Garde le contrat existant : appelle onDismiss (qui set le flag
 * localStorage côté OnboardingGate) puis navigate("/").
 */
export const OnboardingFlow = ({ onDismiss }: OnboardingFlowProps) => {
  const navigate = useNavigate();
  const [isExiting, setIsExiting] = useState(false);

  // Verrouille le scroll du body pendant l'affichage de l'overlay.
  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  const handleComplete = () => {
    if (isExiting) return;
    setIsExiting(true);
    window.setTimeout(() => {
      if (onDismiss) {
        onDismiss();
      } else {
        // Fallback si pas de callback : set localStorage directement.
        try {
          localStorage.setItem("onboarding_completed", "true");
        } catch {
          // ignore
        }
      }
      navigate("/", { replace: true });
    }, EXIT_DURATION_MS);
  };

  // a11y (A11Y-03 / B1-14 / WELCOME-MODAL-NO-FOCUS) : focus initial dans le
  // modal, focus-trap (Tab borné), et Escape ferme l'onboarding comme le CTA —
  // un overlay plein écran sans échappatoire clavier piégeait l'utilisateur.
  const containerRef = useDialogA11y<HTMLDivElement>(!isExiting, handleComplete);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className={cn(
        "fixed inset-0 z-[60] min-h-dvh overflow-hidden bg-gradient-to-br from-[#0E3B2E] via-[#082A20] to-[#082A20]",
        "transition-opacity duration-300 ease-out",
        "flex flex-col items-center justify-center px-8",
        isExiting && "opacity-0",
      )}
    >
      {/* Sceau Halal Certifié au centre — signature visuelle de la marque,
          ring or qui pulse via .halal-seal-ring (cohérence avec le hero). */}
      <div
        className={cn(
          "relative flex items-center justify-center mb-12 md:mb-16",
          "animate-in fade-in zoom-in-95 duration-500 [animation-fill-mode:backwards]",
        )}
        aria-hidden
      >
        <span className="absolute inset-0 -m-4 rounded-full bg-[radial-gradient(circle,rgba(212,169,60,0.30)_0%,transparent_70%)]" />
        {/* Sceau partagé <HalalSeal> (DSN-17) — pixel-identique au hero.
            lg en mobile, xl ≥768px. */}
        <HalalSeal size="lg" className="md:hidden shadow-2xl shadow-[#082A20]/40" />
        <HalalSeal
          size="xl"
          className="hidden md:flex shadow-2xl shadow-[#082A20]/40"
        />
      </div>

      {/* Phrase de bienvenue — display sobre, cream sur sapin nuit. */}
      <h2
        id="onboarding-title"
        className={cn(
          "max-w-[26ch] text-center text-white",
          "text-[26px] sm:text-[32px] md:text-[40px] lg:text-[44px]",
          "font-extrabold tracking-[-0.03em] leading-[1.08]",
          "animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150 [animation-fill-mode:backwards]",
        )}
      >
        Bienvenue chez{" "}
        <span className="text-[#C9A227]">Salamarket</span>.
      </h2>
      <p
        className={cn(
          "mt-5 md:mt-7 max-w-[40ch] text-center text-white/75",
          "text-[14.5px] md:text-[16px] leading-[1.55]",
          "animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300 [animation-fill-mode:backwards]",
        )}
      >
        Votre supermarché halal indépendant de Toulouse, en click &amp; collect.
      </p>

      {/* CTA unique — or plein, large tap target (≥44px), single action focus. */}
      <button
        type="button"
        onClick={handleComplete}
        className={cn(
          "mt-10 md:mt-14 inline-flex items-center justify-center gap-2.5",
          "h-14 md:h-[60px] px-8 md:px-10 rounded-full",
          "bg-[#C9A227] text-[#082A20] text-[15px] md:text-[16px] font-bold",
          "shadow-lg shadow-[#C9A227]/25 hover:bg-[#DDB31C] active:scale-[0.98]",
          "transition-all min-h-[44px]",
          "animate-in fade-in slide-in-from-bottom-4 duration-500 delay-500 [animation-fill-mode:backwards]",
        )}
      >
        Commencer mes courses
        <ArrowRight size={18} strokeWidth={2.4} aria-hidden />
      </button>
    </div>
  );
};

export default OnboardingFlow;
