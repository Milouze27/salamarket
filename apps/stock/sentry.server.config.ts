/**
 * sentry.server.config.ts — Initialise Sentry côté serveur Node (API
 * routes, server components, server actions).
 *
 * Chargé automatiquement par @sentry/nextjs au boot du runtime Node
 * (cf. `withSentryConfig` dans next.config.mjs).
 *
 * Politique : même que client mais sans options browser.
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
    // Spam à filtrer : healthcheck cron Vercel qui pinge /api/cron/*
    // toutes les heures — on ne veut pas que les 200 OK polluent les
    // performance metrics.
    ignoreTransactions: ["GET /api/health", "GET /api/cron"],
  });
}
