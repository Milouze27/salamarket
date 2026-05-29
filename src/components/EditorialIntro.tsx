import { ArrowRight } from "lucide-react";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

// Hero éditorial poster — typographie dominante + photo magazine
// + pagination éditoriale "01" qui anchor la séquence du home.
//
// Composition :
// - Mobile : PHOTO d'abord (impact visuel immédiat à l'ouverture), puis
//   bloc texte (pagination + titre + body + CTAs + microcopy). Le user
//   voit le rayon avant le copy = registre Drive pro.
// - Desktop : grid 12-col, texte gauche (5 col) / photo droite (7 col)
//   asymétrique pour rythme visuel.
//
// Boutons "Commencer ma commande" et "Voir tous les rayons" : button +
// onClick + scrollIntoView pour fonctionner sur clics répétés (Link vers
// même URL ne refire pas). Smooth scroll vers le sticky CategoryTabs
// (id="nos-rayons").
export const EditorialIntro = () => {
  const navigate = useNavigate();

  // Scroll vers la nav rayons + offset pour passer au-dessus du sticky
  // header compact (~56-60px). Pas de useState, pas de query param qui
  // se collerait — l'utilisateur reste en mode vitrine et peut re-cliquer.
  const scrollToRayons = useCallback(() => {
    const el = document.getElementById("nos-rayons");
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 64;
    window.scrollTo({ top, behavior: "smooth" });
  }, []);

  // Jump direct sur le rayon boucherie (photo signature du hero).
  // navigate URL + scroll top — l'EditorialIntro disparaît (showVitrine
  // = false) et le catalogue boucherie devient visible immédiatement.
  const goToBoucherie = useCallback(() => {
    navigate("/?category=boucherie");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [navigate]);

  return (
    <section
      aria-labelledby="editorial-intro-title"
      className="relative w-full bg-[#FAF7EE] overflow-hidden"
    >
      <div className="max-w-7xl mx-auto px-6 md:px-8 pt-8 md:pt-24 pb-12 md:pb-28">
        <div className="grid gap-y-9 md:grid-cols-12 md:gap-x-10 lg:gap-x-16 items-center">
          {/* PHOTO — order-1 mobile (visible immédiat), order-2 desktop
              (à droite). Aspect-[5/6] portrait, sceau Halal Certifié
              flottant + cartel Salamarket bas-gauche. */}
          <figure className="order-1 md:order-2 md:col-span-7 relative">
            <div className="relative aspect-[5/6] md:aspect-[5/6] w-full overflow-hidden rounded-[28px] md:rounded-[40px] bg-[#082A20] shadow-[0_30px_60px_-30px_rgba(8,42,32,0.35)] md:shadow-[0_40px_80px_-32px_rgba(8,42,32,0.45)]">
              <img
                src="/hero/slide-1-boucherie.webp"
                alt="Sélection halal certifiée — comptoir boucherie Salamarket Toulouse"
                loading="eager"
                fetchPriority="high"
                decoding="async"
                width={1600}
                height={2000}
                className="absolute inset-0 w-full h-full object-cover"
              />
              {/* Voile bas renforcé pour lisibilité du titre + CTA
                  overlay. Gradient sapin foncé du bas vers transparent,
                  asymétrique pour préserver le contraste sur la zone
                  texte sans assombrir la moitié haute (où vit le sceau). */}
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-[#082A20]/85 via-[#082A20]/35 to-transparent"
              />

              {/* Cartel top-left — info magasin discrète, libère le bas
                  pour le bloc poster. */}
              <div className="absolute top-5 left-5 md:top-7 md:left-7 flex items-center gap-2 rounded-full bg-[#FAF7EE]/95 backdrop-blur-md px-3 py-1.5 shadow-md">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C9A227]" aria-hidden />
                <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-[#0E3B2E]">
                  Toulouse
                </span>
              </div>

              {/* Sceau Halal certifié — circulaire, signature visuelle */}
              <div className="absolute top-5 right-5 md:top-7 md:right-7 z-10">
                <div className="relative w-[88px] h-[88px] md:w-[110px] md:h-[110px] rounded-full bg-[#FAF7EE] shadow-xl shadow-[#082A20]/30 flex flex-col items-center justify-center text-center">
                  <span
                    aria-hidden
                    className="absolute inset-[6px] rounded-full border-[1.5px] border-[#C9A227]/45"
                  />
                  <span className="relative text-[9px] md:text-[10px] uppercase tracking-[0.18em] font-bold text-[#C9A227] leading-tight">
                    Halal
                  </span>
                  <span className="relative text-[14px] md:text-[16px] font-extrabold text-[#0E3B2E] leading-tight tracking-[-0.02em]">
                    Certifié
                  </span>
                  <span className="relative text-[8px] md:text-[9px] uppercase tracking-[0.22em] font-semibold text-[#0E3B2E]/55 mt-0.5">
                    Salamarket
                  </span>
                </div>
              </div>

              {/* Bloc poster bas-gauche : kicker + titre éditorial + CTA
                  pill. Le titre et le CTA portent sur le rayon affiché
                  (boucherie), donnent un point d'entrée direct au catalogue
                  filtré. */}
              <div className="absolute bottom-5 left-5 right-5 md:bottom-8 md:left-8 md:right-8 z-10">
                <p className="text-[10px] md:text-[11px] uppercase tracking-[0.24em] font-bold text-[#C9A227] mb-2">
                  Notre rayon · Aujourd&apos;hui
                </p>
                <h3 className="text-white text-[26px] sm:text-[30px] md:text-[34px] lg:text-[40px] leading-[0.98] font-extrabold tracking-[-0.03em] max-w-[20ch]">
                  Boucherie halal,
                  <br />
                  préparée chaque matin.
                </h3>
                <button
                  type="button"
                  onClick={goToBoucherie}
                  className="group mt-4 md:mt-5 inline-flex items-center gap-2 h-11 md:h-12 px-5 md:px-6 rounded-full bg-[#FAF7EE] text-[#0E3B2E] text-[13px] md:text-[14px] font-semibold shadow-lg shadow-[#082A20]/30 hover:bg-white active:scale-[0.98] transition-all"
                >
                  Voir le rayon boucherie
                  <ArrowRight
                    size={14}
                    className="transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </button>
              </div>
            </div>

            {/* Pavé crédit sous la photo — détail "magazine" desktop */}
            <figcaption className="hidden md:flex mt-5 items-center gap-3 text-[11px] uppercase tracking-[0.24em] font-bold text-[#0E3B2E]/55">
              <span aria-hidden className="h-px w-8 bg-[#C9A227]" />
              Boucherie · Sélection du jour
            </figcaption>
          </figure>

          {/* TEXTE — order-2 mobile, order-1 desktop. Pagination + titre
              + body + CTAs + microcopy. */}
          <div className="order-2 md:order-1 md:col-span-5">
            {/* Pagination éditoriale */}
            <div className="flex items-center gap-4 mb-5 md:mb-10">
              <span className="text-[24px] md:text-[32px] font-extrabold text-[#C9A227] tabular-nums leading-none tracking-[-0.04em]">
                01
              </span>
              <span aria-hidden className="h-px flex-1 max-w-[80px] bg-[#0E3B2E]/25" />
              <span className="text-[10px] uppercase tracking-[0.32em] font-bold text-[#0E3B2E]">
                Le magasin
              </span>
            </div>

            <h2
              id="editorial-intro-title"
              className="text-[34px] leading-[1.02] sm:text-[44px] sm:leading-[0.98] md:text-[56px] md:leading-[0.96] lg:text-[68px] lg:leading-[0.94] text-[#0E3B2E] font-extrabold tracking-[-0.035em] lg:tracking-[-0.04em]"
            >
              Votre supermarché halal,
              <br />
              <span className="text-[#C9A227]">en click&nbsp;&amp;&nbsp;collect.</span>
            </h2>

            <p className="mt-6 md:mt-9 text-[15px] md:text-[16px] leading-[1.55] text-[#0F1A14]/80 max-w-[44ch]">
              Préparé chaque matin avenue Larrieu&#8209;Thibaud. Vous
              commandez ce soir, vous récupérez demain sur le créneau de
              votre choix. Aucune file, aucune surprise.
            </p>

            {/* CTA primary unique + process strip 3 étapes.
                Avant : 2 CTAs vers la même cible (#nos-rayons) = redondant.
                Maintenant : 1 action claire ("Commencer ma commande")
                + un explicateur visuel du flow Drive en 3 temps. Sert
                first-timers (clarification) ET returning (réassurance). */}
            <div className="mt-7 md:mt-10">
              <button
                type="button"
                onClick={scrollToRayons}
                className="group inline-flex items-center gap-2 h-14 px-7 rounded-full bg-[#0E3B2E] text-white text-[15px] font-semibold shadow-md shadow-[#0E3B2E]/20 hover:bg-[#082A20] hover:shadow-lg hover:shadow-[#0E3B2E]/30 active:scale-[0.98] transition-all"
              >
                Commencer ma commande
                <ArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </button>

              {/* Process strip — 01 → 02 → 03 — explique le drive en
                  une lecture. Pas un CTA, un value prop typographique.
                  Compact pour tenir sur 1 ligne en 390px. */}
              <ol
                aria-label="Le Drive Salamarket en 3 étapes"
                className="mt-5 md:mt-6 flex items-center gap-2 md:gap-3 text-[10px] uppercase tracking-[0.16em] font-bold text-[#0E3B2E]"
              >
                <li className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="inline-flex w-5 h-5 rounded-full bg-[#C9A227]/15 text-[#C9A227] items-center justify-center text-[9px] font-extrabold tabular-nums"
                  >
                    1
                  </span>
                  Je commande
                </li>
                <span aria-hidden className="text-[#C9A227]/55 text-xs">
                  →
                </span>
                <li className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="inline-flex w-5 h-5 rounded-full bg-[#C9A227]/15 text-[#C9A227] items-center justify-center text-[9px] font-extrabold tabular-nums"
                  >
                    2
                  </span>
                  Je choisis
                </li>
                <span aria-hidden className="text-[#C9A227]/55 text-xs">
                  →
                </span>
                <li className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="inline-flex w-5 h-5 rounded-full bg-[#C9A227]/15 text-[#C9A227] items-center justify-center text-[9px] font-extrabold tabular-nums"
                  >
                    3
                  </span>
                  Je retire
                </li>
              </ol>
            </div>

            {/* Microcopy avec hairline supérieure */}
            <div className="mt-9 md:mt-14 pt-5 border-t border-[#0E3B2E]/15 grid grid-cols-2 gap-x-6 gap-y-3 text-[12px] text-[#0F1A14]/65 max-w-[400px]">
              <div>
                <p className="text-[#C9A227] font-bold uppercase tracking-[0.18em] text-[10px] mb-1">
                  Retrait
                </p>
                <p className="leading-snug">
                  8 av. Larrieu&#8209;Thibaud, 31100 Toulouse
                </p>
              </div>
              <div>
                <p className="text-[#C9A227] font-bold uppercase tracking-[0.18em] text-[10px] mb-1">
                  Horaires
                </p>
                <p className="leading-snug">Lun – Sam · 10h – 19h30</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default EditorialIntro;
