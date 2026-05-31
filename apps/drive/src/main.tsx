import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";

// ─── Sentry init (browser bundle) ──────────────────────────────────
// Cf. backlog `obs-no-sentry-error-tracking`.
//
// DSN lue depuis VITE_SENTRY_DSN (Vercel expose les vars VITE_* au
// bundle browser). Si vide → init skip silencieux (dev local sans
// compte Sentry).
//
// tracesSampleRate : 0.1 en prod (10%), 1.0 ailleurs pour debug fin.
// environment : import.meta.env.MODE = "production" | "development".
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

if (SENTRY_DSN && SENTRY_DSN.trim().length > 0) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // Filtre noise classique (extensions browser, network flakes,
    // ResizeObserver loop limit — bug Chrome connu non actionnable).
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed",
      "Failed to fetch",
      "NetworkError",
      "Load failed",
      "top.GLOBALS",
    ],
  });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => console.log('[PWA] SW registered'))
      .catch((err) => console.error('[PWA] SW registration failed:', err));
  });
}

createRoot(document.getElementById("root")!).render(<App />);
