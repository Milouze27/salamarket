import { useLocation } from 'react-router-dom';
import { BottomNav } from '@/components/BottomNav';
import { StickyCartCTA } from '@/components/StickyCartCTA';
import { CookieBanner } from '@/components/CookieBanner';

/**
 * Centralises the global "chrome" (bottom nav, sticky cart CTA, cookie banner)
 * and decides per-route which pieces are appropriate. At 9.5 each screen carries
 * only the chrome that serves it:
 *
 *  - Auth & legal pages get NO bottom nav / sticky cart (full-screen / reading
 *    contexts where an e-commerce nav is noise).
 *  - Funnel pages (panier, créneaux, paiement) get the BottomNav but NOT the
 *    global StickyCartCTA, because each renders its own primary CTA — avoids the
 *    stacked-CTA scenario the user explicitly forbids.
 *  - The cookie banner is hidden on auth pages (full-bleed sapin) so it doesn't
 *    float over the centred sign-in card.
 */

// Routes with no bottom nav / sticky cart at all.
const AUTH_ROUTES = new Set<string>([
  '/connexion',
  '/inscription',
  '/mot-de-passe-oublie',
  '/reset-password',
]);

const LEGAL_ROUTES = new Set<string>([
  '/cgv',
  '/mentions-legales',
  '/confidentialite',
  '/a-propos',
]);

// Funnel routes: keep BottomNav, but suppress the global StickyCartCTA because a
// local primary CTA already lives at the bottom of the screen.
const FUNNEL_ROUTES = new Set<string>(['/panier', '/creneaux', '/paiement']);

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function RouteChrome() {
  const { pathname } = useLocation();
  const path = normalizePath(pathname);

  const isAuth = AUTH_ROUTES.has(path);
  const isLegal = LEGAL_ROUTES.has(path);
  const isFunnel = FUNNEL_ROUTES.has(path);
  // L'espace Pro (/pro/*) a sa propre nav d'onglets dans ProShell : on ne
  // superpose jamais la nav/CTA panier B2C (Accueil/Panier/Commandes/Compte
  // renvoient vers le tunnel Particulier — nav contradictoire pour un Pro).
  const isPro = path === '/pro' || path.startsWith('/pro/');

  // Bottom nav + sticky cart never appear on auth/legal/pro.
  const showBottomNav = !isAuth && !isLegal && !isPro;
  // Sticky cart also hidden on funnel routes (local CTA owns the bottom).
  const showStickyCart = !isAuth && !isLegal && !isPro && !isFunnel;
  // Cookie banner hidden only on the full-bleed auth screens.
  const showCookieBanner = !isAuth;

  return (
    <>
      {showStickyCart && <StickyCartCTA />}
      {showBottomNav && <BottomNav />}
      {showCookieBanner && (
        <CookieBanner hasBottomNav={showBottomNav} hasFunnelCta={isFunnel} />
      )}
    </>
  );
}

export default RouteChrome;
