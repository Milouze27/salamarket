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

// ─── Service Worker enregistrement + update prompt ──────────────────
// Le SW (public/sw.js) gère :
//   - Web Push (notifs commandes gérante).
//   - Cache offline : index.html + /assets/* hashés Vite + offline.html.
//
// Update prompt : quand un nouveau SW est installé en attente derrière
// le SW actif, on dispatch un CustomEvent('sw-update-available'). Un
// composant UI (Toast/banner) peut écouter et proposer "Recharger" qui
// envoie {type: 'SKIP_WAITING'} au SW puis reload la page.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Surveille les nouvelles installations de SW (uniquement après
        // la première install — la première fois on veut pas prompter,
        // l'utilisateur arrive sur l'app, c'est attendu).
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (
              installing.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              // Un SW prend la relève → notifier l'UI.
              window.dispatchEvent(
                new CustomEvent('sw-update-available', {
                  detail: { registration },
                })
              );
            }
          });
        });
      })
      .catch((err) => console.error('[PWA] SW registration failed:', err));

    // Quand l'utilisateur accepte le prompt, l'UI doit appeler :
    //   window.dispatchEvent(new CustomEvent('sw-activate-update'))
    // Ce listener envoie SKIP_WAITING au SW en attente puis reload une
    // fois le controllerchange détecté.
    window.addEventListener('sw-activate-update', async () => {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const waiting = reg?.waiting;
      if (!waiting) {
        window.location.reload();
        return;
      }
      let refreshed = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshed) return;
        refreshed = true;
        window.location.reload();
      });
      waiting.postMessage({ type: 'SKIP_WAITING' });
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
