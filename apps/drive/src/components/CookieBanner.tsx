import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Cookie, X } from "lucide-react";
import { Link } from "react-router-dom";
import { emitConsentChange } from "@/lib/cookie-consent";
import { useDialogA11y } from "@/hooks/useDialogA11y";

const STORAGE_KEY = "cookieConsent";

// Événement de réouverture du bandeau. Permet à n'importe quelle page (ex :
// Politique de confidentialité) de laisser l'utilisateur revenir sur son choix
// — exigence CNIL : le retrait du consentement doit être aussi simple que son
// recueil. `reopenCookieBanner()` est l'API publique appelée par ces pages.
const REOPEN_EVENT = "sala:reopen-cookie-banner";

export function reopenCookieBanner(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(REOPEN_EVENT));
}

type Consent = {
  necessary: true; // toujours true (cookies techniques)
  analytics: boolean;
  marketing: boolean;
  ts: number;
};

const readConsent = (): Consent | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Consent;
    if (typeof parsed?.ts !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeConsent = (c: Omit<Consent, "ts" | "necessary">) => {
  if (typeof window === "undefined") return;
  const payload: Consent = {
    necessary: true,
    analytics: c.analytics,
    marketing: c.marketing,
    ts: Date.now(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage indisponible (mode privé Safari saturé) — on tombe en silence.
    // Le banner réapparaîtra à la prochaine session, ce qui est acceptable.
  }
  // Notifie les scripts tiers (analytics/marketing) qui s'abonnent via
  // onConsentChange : ils ne se chargent qu'après consentement de la
  // catégorie correspondante (RGPD opt-in réellement câblé).
  emitConsentChange();
};

/**
 * CookieBanner — bandeau RGPD bottom-fixed.
 *
 * Affiché si aucun choix n'a été enregistré dans localStorage.cookieConsent.
 * 2 boutons primaires : "J'accepte tout" et "Préférences" (ouvre un portail
 * plein écran avec checkboxes par catégorie). Bouton secondaire "Refuser
 * tout" pour le respect strict du principe RGPD : refus aussi facile
 * qu'accepter (recommandation CNIL).
 *
 * Le bandeau est rendu dans un portail au body pour ne jamais être
 * masqué par la BottomNav ou la StickyCartCTA. Surtout, il ne masque
 * RIEN en retour : il se POSITIONNE au-dessus de la chrome bottom
 * (BottomNav mobile + CTA des pages funnel) au lieu de la recouvrir,
 * conformément à la règle UX "la nav/les CTA ne doivent jamais cacher
 * de contenu utile" — et réciproquement le banner ne doit pas voler les
 * clics du CTA en-dessous.
 *
 * RouteChrome lui communique le contexte de la route courante :
 *  - `hasBottomNav` : la BottomNav mobile (z-40, ~56px + safe-area) est
 *    affichée → le banner se cale au-dessus.
 *  - `hasFunnelCta` : la page funnel (panier / créneaux / paiement) rend
 *    son propre CTA fixed bottom-0 (desktop ET mobile) → le banner se
 *    cale au-dessus de ce CTA pour ne pas voler le clic "Choisir un
 *    créneau" / "Payer".
 */
type CookieBannerProps = {
  hasBottomNav?: boolean;
  hasFunnelCta?: boolean;
};

export const CookieBanner = ({
  hasBottomNav = false,
  hasFunnelCta = false,
}: CookieBannerProps) => {
  const [visible, setVisible] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const existing = readConsent();
    let t: number | undefined;
    if (!existing) {
      // Léger délai pour ne pas concurrencer le 1st paint + l'install
      // prompt. UX : l'utilisateur voit d'abord la page, puis le banner
      // apparaît une fois la navigation principale visible.
      t = window.setTimeout(() => setVisible(true), 600);
    }

    // Réouverture à la demande (depuis la page Confidentialité). On pré-remplit
    // les toggles avec le choix déjà enregistré pour que l'utilisateur parte de
    // son état courant, pas de zéro.
    const onReopen = () => {
      const prev = readConsent();
      setAnalytics(Boolean(prev?.analytics));
      setMarketing(Boolean(prev?.marketing));
      setShowPrefs(true);
      setVisible(true);
    };
    window.addEventListener(REOPEN_EVENT, onReopen);

    return () => {
      if (t) window.clearTimeout(t);
      window.removeEventListener(REOPEN_EVENT, onReopen);
    };
  }, []);

  const acceptAll = () => {
    writeConsent({ analytics: true, marketing: true });
    setVisible(false);
    setShowPrefs(false);
  };

  const refuseAll = () => {
    writeConsent({ analytics: false, marketing: false });
    setVisible(false);
    setShowPrefs(false);
  };

  const savePrefs = () => {
    writeConsent({ analytics, marketing });
    setVisible(false);
    setShowPrefs(false);
  };

  // a11y (A11Y-02/03) : la modale Préférences est un vrai dialog modal
  // (scrim + aria-modal) → Escape la ferme, le focus initial entre dedans,
  // Tab y est piégé et le focus revient au déclencheur à la fermeture.
  const prefsRef = useDialogA11y<HTMLDivElement>(showPrefs, () =>
    setShowPrefs(false),
  );

  if (!visible || typeof document === "undefined") return null;

  // Offset du banner au-dessus de la chrome bottom de la route courante.
  // On ne RECOUVRE jamais la nav ni le CTA funnel : on se cale au-dessus.
  //
  // - BottomNav mobile : ~56px de contenu + max(safe-area, 16px) de
  //   padding (cf. BottomNav.tsx). Le banner passe au-dessus → +72px env.
  // - CTA funnel (panier/créneaux/paiement) : bouton h-14 (56px) +
  //   pt-3 (12px) + padding bottom (≥12px / safe-area) ≈ 84px. Ce CTA
  //   existe sur desktop ET mobile (les composants ci-dessus sont
  //   md:hidden, donc seule cette branche s'applique en desktop).
  //
  // En pratique hasBottomNav et hasFunnelCta sont exclusifs (sur les
  // pages funnel la BottomNav se masque). On garde malgré tout l'offset
  // le plus grand des deux pour rester robuste.
  const navOffsetMobile = hasBottomNav ? 72 : 0;
  const funnelOffset = hasFunnelCta ? 84 : 0;
  // Mobile : la nav (md:hidden) ET le CTA funnel peuvent exister.
  const bottomMobile = Math.max(navOffsetMobile, funnelOffset) + 12;
  // Desktop : la nav mobile n'existe pas ; seul le CTA funnel compte.
  const bottomDesktop = funnelOffset + 12;

  return createPortal(
    <>
      {/* Banner principal — fixed, ne RECOUVRE jamais la chrome bottom :
          `bottom` calculé pour se poser au-dessus de la BottomNav mobile
          et/ou du CTA des pages funnel (memory rule "Nav bottom / CTA ne
          doivent jamais cacher de contenu utile" — ici l'inverse aussi :
          le banner ne vole pas le clic du CTA en-dessous).
          Offset mobile et desktop distincts via CSS vars (les media
          queries ne passent pas en style inline). */}
      <div
        role="dialog"
        aria-label="Préférences de cookies"
        aria-describedby="cookie-banner-desc"
        className="fixed inset-x-0 z-50 px-3 pb-3 md:px-6 md:pb-6 pointer-events-none bottom-[var(--cookie-bottom-mobile)] md:bottom-[var(--cookie-bottom-desktop)]"
        style={
          {
            "--cookie-bottom-mobile": `calc(env(safe-area-inset-bottom) + ${bottomMobile}px)`,
            "--cookie-bottom-desktop": `calc(env(safe-area-inset-bottom) + ${bottomDesktop}px)`,
          } as CSSProperties
        }
      >
        <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl bg-sapin-deep text-[#FAF7EE] shadow-2xl ring-1 ring-[#C9A227]/30">
          {/* ─── MOBILE COMPACT (≤25% viewport) ───────────────────────
              Layout 1 ligne : icône + texte court + 2 boutons inline.
              Padding p-3 pour minimiser la hauteur. Le bouton
              "Préférences" reste accessible via lien underline pour
              éviter de surcharger la barre tactile. */}
          <div className="md:hidden p-3">
            <div className="flex items-center gap-2.5">
              <Cookie className="h-4 w-4 text-[#C9A227] shrink-0" aria-hidden />
              <p
                id="cookie-banner-desc"
                className="text-[12px] leading-[1.35] text-[#FAF7EE]/90 flex-1 min-w-0"
              >
                Cookies pour mesurer l'audience.{" "}
                <button
                  type="button"
                  onClick={() => {
                    setAnalytics(false);
                    setMarketing(false);
                    setShowPrefs(true);
                  }}
                  className="underline underline-offset-2 text-[#C9A227] hover:text-[#DDB31C] font-semibold"
                >
                  Détails
                </button>
              </p>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={refuseAll}
                  className="h-11 px-4 rounded-lg text-[13px] font-semibold bg-transparent text-[#FAF7EE] ring-1 ring-[#FAF7EE]/30 hover:bg-[#FAF7EE]/10 active:scale-[0.96] transition"
                >
                  Refuser
                </button>
                <button
                  type="button"
                  onClick={acceptAll}
                  className="h-11 px-4 rounded-lg text-[13px] font-bold bg-[#C9A227] text-sapin-deep hover:bg-[#DDB31C] active:scale-[0.96] transition"
                >
                  Accepter
                </button>
              </div>
            </div>
          </div>

          {/* ─── DESKTOP (≥md) — layout original full ──────────────── */}
          <div className="hidden md:flex p-6 flex-row gap-4 items-center">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <Cookie
                className="h-5 w-5 text-[#C9A227] shrink-0 mt-0.5"
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-[#FAF7EE]">
                  Vos cookies, votre choix
                </p>
                <p className="text-[13px] leading-[1.55] text-[#FAF7EE]/75 mt-1">
                  Nous utilisons des cookies nécessaires au bon fonctionnement
                  du site. Avec votre accord, nous mesurons aussi l'audience
                  pour améliorer le service. Détails dans notre{" "}
                  <Link
                    to="/confidentialite"
                    className="underline underline-offset-2 text-[#C9A227] hover:text-[#DDB31C]"
                  >
                    politique de confidentialité
                  </Link>
                  .
                </p>
              </div>
            </div>
            <div className="flex flex-row gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={refuseAll}
                className="min-h-[44px] px-4 rounded-xl text-[14px] font-semibold bg-transparent text-[#FAF7EE] ring-1 ring-[#FAF7EE]/30 hover:bg-[#FAF7EE]/10 active:scale-[0.98] transition"
              >
                Refuser tout
              </button>
              <button
                type="button"
                onClick={() => {
                  setAnalytics(false);
                  setMarketing(false);
                  setShowPrefs(true);
                }}
                className="min-h-[44px] px-4 rounded-xl text-[14px] font-semibold bg-[#FAF7EE]/10 text-[#FAF7EE] hover:bg-[#FAF7EE]/15 active:scale-[0.98] transition"
              >
                Préférences
              </button>
              <button
                type="button"
                onClick={acceptAll}
                className="min-h-[44px] px-4 rounded-xl text-[14px] font-bold bg-[#C9A227] text-sapin-deep hover:bg-[#DDB31C] active:scale-[0.98] transition"
              >
                J'accepte tout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal "Préférences" — full-screen on mobile, centered card on
          desktop. Pattern portail demandé par memory rule : "portails
          pas popovers". */}
      {showPrefs && (
        <div
          ref={prefsRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="cookie-prefs-title"
          className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/55 backdrop-blur-sm p-0 md:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPrefs(false);
          }}
        >
          <div className="w-full md:max-w-lg bg-[#FAF7EE] rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col max-h-[90dvh]">
            <header className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-[#0E3B2E]/10">
              <h2
                id="cookie-prefs-title"
                className="text-[18px] font-bold text-[#0E3B2E]"
              >
                Préférences de cookies
              </h2>
              <button
                type="button"
                onClick={() => setShowPrefs(false)}
                aria-label="Fermer"
                className="w-10 h-10 -mr-2 rounded-full flex items-center justify-center text-[#0E3B2E] hover:bg-[#0E3B2E]/5 active:scale-90 transition"
              >
                <X size={20} aria-hidden />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Nécessaires — toggle off */}
              <article className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[14px] font-bold text-[#0E3B2E]">
                    Cookies nécessaires
                  </p>
                  <p className="text-[13px] text-[#0F1A14]/65 mt-1 leading-[1.5]">
                    Session, panier, sécurité. Indispensables au fonctionnement,
                    pas de consentement requis.
                  </p>
                </div>
                <span className="text-[11px] uppercase tracking-[0.18em] font-bold text-[#0E3B2E]/45 mt-1.5">
                  Toujours actif
                </span>
              </article>

              <article className="flex items-start justify-between gap-4 pt-4 border-t border-[#0E3B2E]/8">
                <div className="flex-1">
                  <label
                    htmlFor="cookie-analytics"
                    className="text-[14px] font-bold text-[#0E3B2E] cursor-pointer"
                  >
                    Mesure d'audience
                  </label>
                  <p className="text-[13px] text-[#0F1A14]/65 mt-1 leading-[1.5]">
                    Statistiques anonymisées pour améliorer l'app (pages les
                    plus lues, erreurs rencontrées).
                  </p>
                </div>
                <Toggle
                  id="cookie-analytics"
                  checked={analytics}
                  onChange={setAnalytics}
                  label="Mesure d'audience"
                />
              </article>

              <article className="flex items-start justify-between gap-4 pt-4 border-t border-[#0E3B2E]/8">
                <div className="flex-1">
                  <label
                    htmlFor="cookie-marketing"
                    className="text-[14px] font-bold text-[#0E3B2E] cursor-pointer"
                  >
                    Marketing
                  </label>
                  <p className="text-[13px] text-[#0F1A14]/65 mt-1 leading-[1.5]">
                    Personnalisation de nos communications (newsletters,
                    promotions ciblées). Désactivé par défaut.
                  </p>
                </div>
                <Toggle
                  id="cookie-marketing"
                  checked={marketing}
                  onChange={setMarketing}
                  label="Marketing"
                />
              </article>
            </div>

            <footer
              className="px-6 pt-3 pb-5 border-t border-[#0E3B2E]/10 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end"
              style={{
                paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)",
              }}
            >
              <button
                type="button"
                onClick={refuseAll}
                className="min-h-[44px] px-4 rounded-xl text-[14px] font-semibold bg-transparent text-[#0E3B2E] ring-1 ring-[#0E3B2E]/25 hover:bg-[#0E3B2E]/5 active:scale-[0.98] transition"
              >
                Tout refuser
              </button>
              <button
                type="button"
                onClick={savePrefs}
                className="min-h-[44px] px-4 rounded-xl text-[14px] font-bold bg-[#0E3B2E] text-[#FAF7EE] hover:bg-sapin-deep active:scale-[0.98] transition"
              >
                Enregistrer mes choix
              </button>
            </footer>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
};

interface ToggleProps {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}

const Toggle = ({ id, checked, onChange, label }: ToggleProps) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors mt-1 ${
      checked ? "bg-[#0E3B2E]" : "bg-[#0F1A14]/20"
    }`}
  >
    <span
      aria-hidden
      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
        checked ? "translate-x-6" : "translate-x-1"
      }`}
    />
  </button>
);
