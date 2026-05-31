/**
 * sentry.client.config.ts — Initialise Sentry dans le bundle browser.
 *
 * Chargé automatiquement par @sentry/nextjs côté client (cf.
 * `withSentryConfig` dans next.config.mjs).
 *
 * Politique :
 *   - DSN lue depuis NEXT_PUBLIC_SENTRY_DSN. Si vide → init skip
 *     silencieux (utile en dev local sans compte Sentry).
 *   - tracesSampleRate : 0.1 en prod (10% des requêtes tracées),
 *     1.0 ailleurs pour debug fin.
 *   - environment : process.env.VERCEL_ENV (production/preview/dev)
 *     pour différencier les déploiements Vercel dans Sentry.
 *   - replaysSessionSampleRate : 0 par défaut. Activable plus tard si
 *     on souscrit au plan Replay.
 */

import * as Sentry from "@sentry/nextjs";

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN && DSN.trim().length > 0) {
  Sentry.init({
    dsn: DSN,
    environment:
      process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    tracesSampleRate:
      process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    replaysOnErrorSampleRate: 0,
    replaysSessionSampleRate: 0,
    // Filtre les bruits browser qui n'ont rien à faire dans Sentry.
    ignoreErrors: [
      // Extensions browser
      "top.GLOBALS",
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed",
      // Service worker installs / network glitches
      "Failed to fetch",
      "NetworkError",
      "Load failed",
    ],
  });
}
