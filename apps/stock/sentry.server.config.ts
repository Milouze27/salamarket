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
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    // RGPD : ne jamais envoyer de PII par défaut.
    sendDefaultPii: false,
    // Spam à filtrer : healthcheck cron Vercel qui pinge /api/cron/*
    // toutes les heures — on ne veut pas que les 200 OK polluent les
    // performance metrics.
    ignoreTransactions: ["GET /api/health", "GET /api/cron"],
    // RGPD — scrub des champs PII (emails clients, téléphones, noms, PIN,
    // clés push, secrets) avant tout envoi à Sentry.
    beforeSend(event) {
      if (event.request) {
        if (event.request.data) event.request.data = "[redacted]";
        delete event.request.cookies;
      }
      const PII =
        /e?mail|tel|phone|client_nom|nom_client|pin|p256dh|auth|token|secret|service_role/i;
      const scrub = (obj: unknown, depth = 0): void => {
        if (depth > 6 || !obj || typeof obj !== "object") return;
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
          if (PII.test(k)) (obj as Record<string, unknown>)[k] = "[redacted]";
          else scrub(v, depth + 1);
        }
      };
      scrub(event.extra);
      scrub(event.contexts);
      return event;
    },
  });
}
