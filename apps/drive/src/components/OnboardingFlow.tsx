import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, CreditCard, ShoppingBag, type LucideIcon } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";

type Slide = {
  Icon: LucideIcon;
  title: string;
  subtitle: string;
};

const SLIDES: Slide[] = [
  {
    Icon: ShoppingBag,
    title: "Vos produits halal de confiance",
    subtitle: "Sélectionnés avec soin par Salamarket Toulouse",
  },
  {
    Icon: Clock,
    title: "Récupérez à votre rythme",
    subtitle: "Choisissez le créneau qui s'adapte à votre journée",
  },
  {
    Icon: CreditCard,
    title: "Votre commerce, simplifié",
    subtitle: "Tout votre marché halal, sans bouger de chez vous",
  },
];

const EXIT_DURATION_MS = 300;

interface OnboardingFlowProps {
  /** Called by OnboardingGate to dismiss the overlay. */
  onDismiss?: () => void;
}

export const OnboardingFlow = ({ onDismiss }: OnboardingFlowProps) => {
  const navigate = useNavigate();
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  // Slides déjà arrivés en position active dans cette session.
  // Ref (pas state) pour ne pas déclencher de re-render qui interromprait
  // l'animation CSS en cours.
  const visitedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    const handleSelect = () => setCurrent(api.selectedScrollSnap());
    api.on("select", handleSelect);
    return () => {
      api.off("select", handleSelect);
    };
  }, [api]);

  // Marque le slide comme visité APRÈS la durée de l'animation cascade.
  // Sinon, un re-render rapide (par ex. embla qui set son api après mount)
  // retire les classes animate-* avant la fin et interrompt l'animation.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      visitedRef.current.add(current);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [current]);

  // Verrouille le scroll du body pendant que l'onboarding est affiché,
  // sinon la scrollbar de la page sous-jacente reste visible à droite.
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
        // Fallback: set localStorage directly if no callback provided
        try {
          localStorage.setItem("onboarding_completed", "true");
        } catch {
          // ignore
        }
      }
      navigate("/", { replace: true });
    }, EXIT_DURATION_MS);
  };

  const isLastSlide = current === SLIDES.length - 1;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[60] min-h-dvh overflow-hidden bg-gradient-to-br from-[#0E3B2E] via-[#082A20] to-[#082A20]",
        "transition-opacity duration-300 ease-out",
        isExiting && "opacity-0",
      )}
    >
      {!isLastSlide && (
        <button
          type="button"
          onClick={handleComplete}
          className="absolute right-6 top-6 z-30 pointer-events-auto text-sm text-white/70 underline-offset-4 hover:underline focus:outline-none"
          style={{ top: "calc(env(safe-area-inset-top) + 1.5rem)" }}
        >
          Passer
        </button>
      )}

      <Carousel
        setApi={setApi}
        opts={{ loop: false }}
        className="h-full [&>div]:h-full"
      >
        <CarouselContent className="ml-0 h-full">
          {SLIDES.map(({ Icon, title, subtitle }, index) => {
            const shouldAnimate =
              index === current && !visitedRef.current.has(index);
            const isLastIndex = index === SLIDES.length - 1;
            return (
              <CarouselItem
                key={index}
                className="flex h-full flex-col items-center justify-center pl-0 pb-32 md:pb-40 lg:flex-row lg:gap-12 lg:px-12 lg:pb-0 xl:gap-20 xl:px-24"
              >
                <div
                  key={`slide-${index}-${current}`}
                  className="flex flex-col items-center lg:flex-row lg:gap-16 lg:max-w-6xl lg:w-full lg:items-center xl:gap-24"
                >
                  {/* Cercle doré + halo radial + icône */}
                  <div className="lg:flex lg:w-1/2 lg:justify-center lg:flex-shrink-0">
                    <div
                      className={cn(
                        "relative flex h-60 w-60 items-center justify-center rounded-full bg-[#C9A227]/20",
                        "lg:h-80 lg:w-80",
                        // Halo radial circulaire (évite le bug iOS Safari du
                        // filter:blur qui produit un halo carré).
                        "before:absolute before:-inset-6 before:rounded-full before:content-['']",
                        "before:bg-[radial-gradient(circle,rgba(212,169,60,0.35)_0%,transparent_70%)]",
                        shouldAnimate &&
                          "animate-in fade-in zoom-in-95 duration-500 [animation-fill-mode:backwards]",
                      )}
                    >
                      <Icon
                        className="relative z-10 text-[#C9A227] lg:hidden"
                        size={120}
                        strokeWidth={1.5}
                      />
                      <Icon
                        className="relative z-10 hidden text-[#C9A227] lg:block"
                        size={160}
                        strokeWidth={1.5}
                      />
                    </div>
                  </div>

                  <div className="mt-10 flex flex-col items-center lg:mt-0 lg:w-1/2 lg:items-start">
                    <h2
                      className={cn(
                        "text-3xl md:text-4xl font-bold tracking-tight text-white text-center px-6",
                        "lg:text-5xl lg:text-left lg:px-0",
                        shouldAnimate &&
                          "animate-in fade-in slide-in-from-bottom-4 duration-500 delay-150 [animation-fill-mode:backwards]",
                      )}
                    >
                      {title}
                    </h2>
                    <div
                      className={cn(
                        "my-5 mx-auto h-0.5 w-16 bg-[#C9A227] lg:mx-0",
                        shouldAnimate &&
                          "animate-in fade-in duration-500 delay-200 [animation-fill-mode:backwards]",
                      )}
                    />
                    <p
                      className={cn(
                        "max-w-sm px-6 text-center text-lg leading-relaxed text-white/80",
                        "lg:max-w-md lg:px-0 lg:text-left lg:text-xl",
                        shouldAnimate &&
                          "animate-in fade-in slide-in-from-bottom-4 duration-500 delay-300 [animation-fill-mode:backwards]",
                      )}
                    >
                      {subtitle}
                    </p>

                    {/* Dots + CTA — desktop only, sous le texte dans la
                        colonne droite. Mobile garde sa version absolute
                        en bas (cf. plus bas). */}
                    <div className="hidden lg:flex lg:mt-10 lg:items-center lg:gap-2">
                      {SLIDES.map((_, dotIndex) => (
                        <span
                          key={dotIndex}
                          className={cn(
                            "h-2 rounded-full transition-all duration-300",
                            dotIndex === current
                              ? "w-8 bg-[#C9A227]"
                              : "w-2 bg-white/30",
                          )}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={
                        isLastIndex
                          ? handleComplete
                          : () => api?.scrollNext()
                      }
                      className="hidden lg:inline-flex lg:mt-8 lg:items-center lg:justify-center lg:h-14 lg:px-10 lg:rounded-2xl lg:bg-[#C9A227] lg:font-bold lg:text-[#0E3B2E] lg:shadow-lg lg:shadow-[#C9A227]/25 lg:transition-all lg:hover:bg-[#DDB31C] lg:active:scale-[0.98]"
                    >
                      {isLastIndex ? "Découvrir le catalogue" : "Suivant"}
                    </button>
                  </div>
                </div>
              </CarouselItem>
            );
          })}
        </CarouselContent>
      </Carousel>

      {/* Indicateurs dots — mobile/tablet uniquement */}
      <div className="absolute bottom-24 left-0 right-0 z-10 flex items-center justify-center gap-2 lg:hidden">
        {SLIDES.map((_, index) => (
          <span
            key={index}
            className={cn(
              "h-2 rounded-full transition-all duration-300",
              index === current ? "w-8 bg-[#C9A227]" : "w-2 bg-white/30",
            )}
          />
        ))}
      </div>

      {/* Bouton final mobile/tablet — slide 3 uniquement */}
      {isLastSlide && (
        <button
          type="button"
          onClick={handleComplete}
          className="fixed bottom-8 left-6 right-6 z-30 pointer-events-auto h-14 w-auto rounded-2xl bg-[#C9A227] font-bold text-[#0E3B2E] shadow-lg shadow-[#C9A227]/25 transition-all hover:bg-[#DDB31C] active:scale-[0.98] lg:hidden"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 2rem)" }}
        >
          Découvrir le catalogue
        </button>
      )}
    </div>
  );
};

export default OnboardingFlow;
