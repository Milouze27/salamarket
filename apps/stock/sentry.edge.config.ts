/**
 * sentry.edge.config.ts — Initialise Sentry dans l'Edge runtime
 * (middleware.ts, edge API routes).
 *
 * Chargé automatiquement par @sentry/nextjs quand une route tourne
 * en Edge runtime (cf. `withSentryConfig` dans next.config.mjs).
 *
 * L'API Sentry est plus limitée en Edge (pas de profiling, pas de
 * file IO) — on garde l'essentiel : capture exceptions + tracing.
 */

import * as Sentry from "@sentry/nextjs";

const DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN && DSN.trim().length > 0) {
  Sentry.init({
    dsn: DSN,
    environment:
      process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    tracesSampleRate:
      process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  });
}
