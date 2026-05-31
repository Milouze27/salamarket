/* Salam Stock — Service Worker
 *
 * Responsabilités :
 *  1. Web Push (iOS 16.4+ PWA standalone) — alertes staff.
 *  2. Offline shell : précache des routes /v2 chaudes à l'install +
 *     fallback intelligent (dernière route /v2 équivalente en cache,
 *     puis /v2/offline.html) pour éviter le "dino Chrome" quand le
 *     staff perd la 4G en magasin, même sur une route jamais ouverte.
 *  3. Cache-first borné (LRU) sur /_next/static/* (assets hashés Next 14,
 *     immuables) — évite le gonflement storage iOS → QuotaExceeded.
 *  4. Network-only sur /api/* (jamais de stale data backend).
 *
 * Versioning : CACHE_VERSION est dérivé du build id Next injecté dans
 * l'URL d'enregistrement (`/sw.js?v=<buildId>`, cf. SWRegister.tsx).
 * Chaque déploiement change donc l'URL du SW → le navigateur réinstalle
 * le SW ET purge les caches de l'ancienne version (activate listener).
 * En l'absence de build id (dev local, vieux client), on retombe sur
 * BUILD_VERSION ci-dessous. Le préfixe permet de purger TOUT cache d'une
 * autre version (clé ne contenant pas le suffixe courant).
 */

// Build id injecté via la query string d'enregistrement du SW.
// Ex: navigator.serviceWorker.register('/sw.js?v=abc123').
// Fallback statique si absent (dev / anciens enregistrements).
const BUILD_VERSION = (() => {
  try {
    return new URL(self.location.href).searchParams.get("v") || "dev";
  } catch (_e) {
    return "dev";
  }
})();

const CACHE_VERSION = `v2-${BUILD_VERSION}`;
const STATIC_CACHE = `salam-stock-static-${CACHE_VERSION}`;
const OFFLINE_CACHE = `salam-stock-offline-${CACHE_VERSION}`;
const SHELL_CACHE = `salam-stock-shell-${CACHE_VERSION}`;

const OFFLINE_URL = "/v2/offline.html";

// Coquille offline minimale (toujours dispo, même au 1er load).
const OFFLINE_ASSETS = [OFFLINE_URL, "/icons/icon-192.png"];

// Routes /v2 chaudes pré-cachées à l'install pour que le staff puisse
// ouvrir une route jamais visitée avant la coupure réseau et tomber sur
// le HTML SSR réel (ou au pire son équivalent caché) plutôt que sur
// l'écran "Hors ligne". On reste volontairement court : ces routes
// rapatrient ensuite leurs chunks /_next/static via le handler dédié.
const SHELL_ROUTES = [
  "/v2",
  "/v2/sortie",
  "/v2/reception",
  "/v2/cockpit",
  "/v2/preparation",
];

// Plafond du cache d'assets hashés. iOS coupe agressivement le storage
// PWA ; sans borne, les chunks _next/static des anciens déploiements
// s'accumulent → QuotaExceeded → le SW cesse silencieusement de cacher.
// Eviction FIFO (≈ LRU à l'échelle d'un déploiement, les entrées les
// plus anciennes étant les chunks orphelins des routes peu visitées).
const STATIC_CACHE_MAX_ENTRIES = 120;

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      // Coquille offline — addAll atomique, on tolère un 404 isolé.
      caches
        .open(OFFLINE_CACHE)
        .then((cache) => cache.addAll(OFFLINE_ASSETS))
        .catch(() => {
          /* Si une asset 404 au moment du install, on ne bloque pas
             l'install du SW : le fallback reviendra en network et
             offline.html restera fonctionnel tant que son HTML est caché. */
        }),
      // App-shell : on précache chaque route /v2 chaude individuellement
      // pour qu'un 404/redirect isolé (auth, route renommée) ne fasse pas
      // échouer tout le batch. `cache.add` suit les redirections.
      caches.open(SHELL_CACHE).then((cache) =>
        Promise.all(
          SHELL_ROUTES.map((route) =>
            cache.add(new Request(route, { credentials: "same-origin" })).catch(
              () => {
                /* Route non atteignable au install (offline au 1er lancement,
                   ou gate auth) : sera cachée à la 1ère navigation réussie. */
              }
            )
          )
        )
      ),
    ])
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Purge tous les caches qui n'appartiennent pas à la version courante.
  const allowed = new Set([STATIC_CACHE, OFFLINE_CACHE, SHELL_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            // On ne touche qu'à NOS caches (préfixe salam-stock-) pour ne
            // pas écraser d'éventuels caches d'autres SW co-résidents.
            .filter(
              (key) => key.startsWith("salam-stock-") && !allowed.has(key)
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Eviction FIFO bornée du cache d'assets hashés.
async function trimCache(cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length <= maxEntries) return;
    // Supprime les plus anciennes entrées (ordre d'insertion préservé par
    // l'API Cache) jusqu'à repasser sous le plafond.
    const excess = keys.length - maxEntries;
    for (let i = 0; i < excess; i++) {
      await cache.delete(keys[i]);
    }
  } catch (_e) {
    /* Best-effort : si l'eviction échoue, on ne casse pas la réponse. */
  }
}

// Cherche dans le SHELL_CACHE la meilleure route équivalente à servir
// hors ligne : exact match d'abord, sinon le préfixe le plus long
// (ex: /v2/sortie/123 → /v2/sortie → /v2), sinon null.
async function matchShellRoute(pathname) {
  const shell = await caches.open(SHELL_CACHE);
  // Exact.
  const exact = await shell.match(pathname, { ignoreSearch: true });
  if (exact) return exact;
  // Préfixe le plus spécifique parmi les routes pré-cachées.
  const candidates = SHELL_ROUTES.filter(
    (r) => pathname === r || pathname.startsWith(r + "/")
  ).sort((a, b) => b.length - a.length);
  for (const route of candidates) {
    const hit = await shell.match(route, { ignoreSearch: true });
    if (hit) return hit;
  }
  // Dernier recours interne : le hub /v2 s'il est caché.
  return shell.match("/v2", { ignoreSearch: true });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // GET uniquement. Les POST/PUT/DELETE passent toujours au réseau
  // (jamais de cache d'écriture, ça créerait des bugs de double-submit).
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Cross-origin (Supabase, Stripe, Sentry, Anthropic, fonts Google…) :
  // on ne touche à rien, le browser gère.
  if (url.origin !== self.location.origin) return;

  // 1. Routes /api/* → network-only. Pas de cache backend (orders,
  //    stock, auth), risque de double-traitement ou de données périmées.
  if (url.pathname.startsWith("/api/")) return;

  // 2. Navigation HTML → network-first. Au succès on rafraîchit le
  //    shell de la route (stale-while-revalidate-ish) ; à l'échec on
  //    sert la route /v2 équivalente cachée, puis offline.html.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Rafraîchit la copie shell de cette route pour la prochaine
          // navigation offline (uniquement les routes /v2, et seulement
          // les réponses HTML 200 — pas les redirections vers /login).
          if (
            response &&
            response.status === 200 &&
            response.type === "basic" &&
            url.pathname.startsWith("/v2")
          ) {
            const clone = response.clone();
            caches.open(SHELL_CACHE).then((cache) => {
              cache.put(url.pathname, clone).catch(() => {});
            });
          }
          return response;
        })
        .catch(async () => {
          // Offline : route /v2 équivalente cachée si on en a une…
          if (url.pathname.startsWith("/v2")) {
            const shell = await matchShellRoute(url.pathname);
            if (shell) return shell;
          }
          // …sinon écran offline dédié…
          const offline = await caches.match(OFFLINE_URL, {
            ignoreSearch: true,
          });
          if (offline) return offline;
          // …sinon fallback texte minimal.
          return new Response(
            "<h1>Hors ligne</h1><p>Vérifiez votre connexion.</p>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        })
    );
    return;
  }

  // 3. Assets Next.js hashés (/_next/static/*) → cache-first borné.
  //    Ces URLs contiennent un hash de contenu, donc immuables.
  const isHashedAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/splash/");

  if (isHashedAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            // Ne cache que les réponses OK (200). Cross-origin déjà
            // filtré plus haut (ceinture-bretelles).
            if (!response || response.status !== 200) return response;
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache
                .put(request, clone)
                .then(() => trimCache(STATIC_CACHE, STATIC_CACHE_MAX_ENTRIES))
                .catch(() => {
                  /* QuotaExceeded ou cache désactivé : silencieux. */
                });
            });
            return response;
          })
          .catch(() => {
            // Pas de fallback pour les assets (laisser le browser
            // afficher son erreur native, ça reste moins moche qu'un
            // HTML offline rendu à la place d'un .js).
            return new Response("", { status: 504, statusText: "Offline" });
          });
      })
    );
    return;
  }

  // 4. Autres requêtes (images dynamiques, fetch JSON depuis le client…) :
  //    on ne touche à rien, le browser gère lui-même réseau + erreurs.
});

// ── Web Push ─────────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch (e) {
    data = { title: "Salam Stock", body: event.data.text() };
  }

  const title = data.title || "Salam Stock";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || "salam-alert",
    data: {
      url: data.url || "/v2/admin",
      alerteId: data.alerteId || null,
    },
    vibrate: [200, 100, 200],
    requireInteraction: data.urgent === true,
    actions: [
      { action: "view", title: "Voir" },
      { action: "dismiss", title: "Ignorer" },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  const target =
    (event.notification.data && event.notification.data.url) || "/v2/admin";
  const targetUrl = new URL(target, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // 1. Une fenêtre déjà sur la cible exacte → focus simple.
        for (const client of clientList) {
          if (client.url === targetUrl && "focus" in client) {
            return client.focus();
          }
        }
        // 2. Une fenêtre même-origine ouverte ailleurs → focus + tente
        //    navigate (Android/Chromium) + postMessage pour router côté
        //    React si l'app écoute (fallback iOS PWA où navigate() est
        //    inconstant). On NE return PAS prématurément avant d'avoir
        //    tenté de router.
        for (const client of clientList) {
          if (client.url.startsWith(self.location.origin) && "focus" in client) {
            const focused = client.focus();
            if ("navigate" in client) {
              client.navigate(targetUrl).catch(() => {});
            }
            client.postMessage({ type: "sw-navigate", url: target });
            return focused;
          }
        }
        // 3. Aucune fenêtre exploitable → on en ouvre une.
        if (self.clients.openWindow) return self.clients.openWindow(target);
      })
  );
});

// ── Update prompt ────────────────────────────────────────────────────
// Quand un nouveau SW est installé en attente, le client peut envoyer
// {type: "SKIP_WAITING"} pour activer la nouvelle version immédiatement
// (au lieu d'attendre la fermeture de tous les onglets).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
