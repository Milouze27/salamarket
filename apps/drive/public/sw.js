/* Salamarket Drive — Service Worker
 *
 * Responsabilités :
 *  1. Web Push (iOS 16.4+ PWA standalone) — notifs commandes gérante.
 *  2. Navigation HTML : NETWORK-FIRST STRICT. On ne ressert JAMAIS un
 *     index.html mis en cache tant qu'on a du réseau. Fallback uniquement
 *     /offline.html (écran sapin statique) si le réseau est mort.
 *  3. Runtime cache cache-first sur /assets/* (Vite hash → URLs immuables,
 *     donc tout est cacheable sans risque de version stale).
 *
 * ⚠️ POURQUOI PAS DE SHELL CACHE (index.html) — bug d'hydratation
 * (P1 sw-hydration). index.html référence les chunks JS hashés du build
 * COURANT (<script src="/assets/index-HASH.js">). Servir un index.html
 * mis en cache lors d'un build PRÉCÉDENT pointe vers des chunks périmés :
 * React monte le DOM (root.children > 0, 0 erreur console) mais le bundle
 * chargé ne correspond plus → les event handlers ne se rattachent pas →
 * steppers/boutons/CTA inertes. Le `unregister()+reload` réparait tout
 * parce qu'il forçait le navigateur à refetch un index.html frais.
 * Network-first strict élimine la classe entière de ce bug : la coquille
 * vient toujours du réseau, donc HTML et chunks sont toujours cohérents.
 * Drive est une app en ligne (catalogue/panier/Stripe ont besoin du
 * réseau) — un mode "offline app complète" n'a aucun sens ici.
 *
 * Versioning : bump CACHE_VERSION à chaque déploiement qui touche ce SW.
 * Comme le contenu de sw.js change alors, le navigateur réinstalle le SW
 * → activate purge les caches des anciennes versions.
 */

const CACHE_VERSION = 'v5';
const ASSETS_CACHE = `salamarket-assets-${CACHE_VERSION}`;
const OFFLINE_CACHE = `salamarket-offline-${CACHE_VERSION}`;

const OFFLINE_URL = '/offline.html';
const OFFLINE_ASSETS = [
  OFFLINE_URL,
  '/brand/logo-horizontal.png',
];

self.addEventListener('install', (event) => {
  // Pré-cache la coquille offline (toujours dispo, même au 1er load).
  // On NE pré-cache PAS index.html (cf. note en tête : source du bug
  // d'hydratation).
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => cache.addAll(OFFLINE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Purge tous les caches d'anciennes versions (CACHE_VERSION bump), y
  // compris les anciens SHELL_CACHE (salamarket-shell-v4) qui contenaient
  // l'index.html périmé responsable du bug d'hydratation.
  const allowed = new Set([ASSETS_CACHE, OFFLINE_CACHE]);
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

  // 1. Navigation HTML : NETWORK-FIRST STRICT.
  //    On sert TOUJOURS l'index.html du réseau (coquille SPA fraîche,
  //    cohérente avec les chunks hashés du build courant). On ne met PAS
  //    en cache l'index.html et on ne le ressert JAMAIS depuis un cache :
  //    c'était la cause du bug d'hydratation (cf. note en tête de fichier).
  //    Seul fallback en cas de réseau mort : offline.html (écran statique).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
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
