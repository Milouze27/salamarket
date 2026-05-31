/* Salamarket Drive — Service Worker
 *
 * Responsabilités :
 *  1. Web Push (iOS 16.4+ PWA standalone) — notifs commandes gérante.
 *  2. Offline shell : si on a déjà chargé l'app au moins une fois, on
 *     ressert index.html + le JS/CSS hashé depuis le cache. Sinon
 *     fallback /offline.html (sapin design).
 *  3. Runtime cache stale-while-revalidate sur /assets/* (Vite hash → URLs
 *     immuables, donc tout est cacheable sans risque de version stale).
 *
 * Versioning : bump CACHE_VERSION pour purger les anciens caches.
 */

const CACHE_VERSION = 'v4';
const SHELL_CACHE = `salamarket-shell-${CACHE_VERSION}`;
const ASSETS_CACHE = `salamarket-assets-${CACHE_VERSION}`;
const OFFLINE_CACHE = `salamarket-offline-${CACHE_VERSION}`;

const OFFLINE_URL = '/offline.html';
const SHELL_URL = '/index.html';
const OFFLINE_ASSETS = [
  OFFLINE_URL,
  '/brand/logo-horizontal.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      // Pré-cache la coquille offline (toujours dispo, même au 1er load).
      caches.open(OFFLINE_CACHE).then((cache) => cache.addAll(OFFLINE_ASSETS)),
      // Pré-cache l'index.html — le navigateur fetch déjà cette URL au
      // chargement, donc on l'aura aussi via le runtime handler ; ce
      // preload garantit qu'on en a une copie même si l'utilisateur a
      // installé la PWA depuis un share-link direct (deep route).
      caches.open(SHELL_CACHE).then((cache) =>
        cache.add(SHELL_URL).catch(() => {
          /* Si le HTML n'est pas atteignable au install (rare), on
             ne bloque pas — il sera caché dès la première navigation. */
        })
      ),
    ])
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Purge tous les caches d'anciennes versions (CACHE_VERSION bump).
  const allowed = new Set([SHELL_CACHE, ASSETS_CACHE, OFFLINE_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !allowed.has(k)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // GET uniquement (jamais cache écriture).
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin : Supabase, Stripe, Sentry, Google Fonts. Le navigateur
  // gère lui-même + politique cache propre de chaque tiers.
  if (url.origin !== self.location.origin) return;

  // Functions Supabase / Stripe rejoués par sécurité (au cas où ils
  // seraient proxifiés sous le même domaine plus tard).
  if (
    url.pathname.startsWith('/functions/v1/') ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  // 1. Navigation HTML : network-first, fallback index.html cache,
  //    puis offline.html en dernier recours.
  //    Stratégie : on PRÉFÈRE servir index.html cache (qui sait charger
  //    l'app SPA si JS/CSS sont aussi cachés) plutôt qu'offline.html
  //    qui est juste un message statique. Si index.html non caché ou
  //    SPA non encore initialisée → offline.html sapin.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // En passant, on rafraîchit notre copie du shell pour la
          // prochaine navigation offline (stale-while-revalidate-ish).
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(SHELL_CACHE).then((cache) => {
              cache.put(SHELL_URL, clone).catch(() => {});
            });
          }
          return response;
        })
        .catch(async () => {
          // Offline : ressert le shell SPA si dispo, sinon écran offline.
          const shell = await caches.match(SHELL_URL, { ignoreSearch: true });
          if (shell) return shell;
          const offline = await caches.match(OFFLINE_URL, { ignoreSearch: true });
          if (offline) return offline;
          return new Response(
            '<h1>Hors ligne</h1><p>Vérifiez votre connexion.</p>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        })
    );
    return;
  }

  // 2. Assets Vite hashés (/assets/*.js, .css, .woff2…) → stale-while-
  //    revalidate. Vite met un hash de contenu dans le filename donc
  //    chaque URL est immuable — un fichier change = nouvelle URL =
  //    nouvelle entrée cache, la vieille ne pose pas problème.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkPromise = fetch(request)
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(ASSETS_CACHE).then((cache) => {
                cache.put(request, clone).catch(() => {
                  /* QuotaExceeded silencieux. */
                });
              });
            }
            return response;
          })
          .catch(() => cached); // Offline + pas en cache → undefined
        // Si on a un cache, on répond immédiatement et on refresh en BG.
        return cached || networkPromise;
      })
    );
    return;
  }

  // 3. Offline assets pré-cachés (logo affiché dans offline.html) :
  //    network-first avec fallback cache pour rester visibles hors ligne.
  if (OFFLINE_ASSETS.some((asset) => url.pathname === asset)) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // 4. Autres requêtes (images Supabase Storage CDN, sons, OG, fonts
  //    Google…) → on ne touche à rien. Le browser cache HTTP natif est
  //    suffisant et la stratégie cache custom risquerait de remplir le
  //    storage avec les milliers d'images produit.
});

// ── Web Push ─────────────────────────────────────────────────────────
// Reçoit les notifications poussées par l'edge function notify-new-order
// et les affiche à la gérante même si l'app est fermée.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Salamarket', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Nouvelle commande';
  const options = {
    body: data.body || 'Vous avez une nouvelle commande.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/admin' },
    vibrate: [200, 100, 200],
    requireInteraction: false,
    tag: data.tag || 'new-order',
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/admin';
  const targetUrl = new URL(target, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // 1. Une fenêtre déjà sur la cible exacte → focus simple.
      for (const win of wins) {
        if (win.url === targetUrl && 'focus' in win) {
          return win.focus();
        }
      }
      // 2. Une fenêtre même-origine ouverte ailleurs → focus + tente
      //    navigate() (fiable sur Android/Chromium) + postMessage en
      //    fallback pour router côté React (BrowserRouter) sur iOS PWA,
      //    où WindowClient.navigate() est inconstant. On ne return PAS
      //    avant d'avoir tenté de router la fenêtre vers la cible.
      for (const win of wins) {
        if (win.url.startsWith(self.location.origin) && 'focus' in win) {
          const focused = win.focus();
          if ('navigate' in win) {
            win.navigate(targetUrl).catch(() => {});
          }
          win.postMessage({ type: 'sw-navigate', url: target });
          return focused;
        }
      }
      // 3. Aucune fenêtre exploitable → on en ouvre une.
      return clients.openWindow(target);
    })
  );
});

// ── Update prompt ────────────────────────────────────────────────────
// Le client peut envoyer {type: "SKIP_WAITING"} pour activer une nouvelle
// version du SW immédiatement après confirmation utilisateur.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
