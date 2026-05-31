/* Salam Stock — Service Worker
 *
 * Responsabilités :
 *  1. Web Push (iOS 16.4+ PWA standalone) — alertes staff.
 *  2. Offline shell : navigation HTML retombe sur /v2/offline.html
 *     pour éviter le "dino Chrome" quand le staff perd la 4G en magasin.
 *  3. Cache-first sur /_next/static/* (assets hashés Next 14, immuables).
 *  4. Network-only sur /api/* (jamais de stale data backend).
 *
 * Versioning : bump CACHE_VERSION pour purger les anciens caches.
 * L'activate listener nettoie les caches d'autres versions.
 */

const CACHE_VERSION = "v1";
const STATIC_CACHE = `salam-stock-static-${CACHE_VERSION}`;
const OFFLINE_CACHE = `salam-stock-offline-${CACHE_VERSION}`;
const OFFLINE_URL = "/v2/offline.html";
const OFFLINE_ASSETS = [
  OFFLINE_URL,
  "/icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  // Pré-cache l'écran offline + son icône pour qu'ils restent dispos
  // même si le device n'a jamais navigué dessus avant la perte de réseau.
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.addAll(OFFLINE_ASSETS))
      .catch(() => {
        /* Si une asset 404 au moment du install, on ne bloque pas
           l'install du SW. Le fallback reviendra en network sur ces
           ressources et l'offline.html sera quand même fonctionnel
           tant que le HTML lui-même est en cache. */
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Purge tous les caches d'anciennes versions (CACHE_VERSION bump).
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== OFFLINE_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

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

  // 2. Navigation HTML → network-first, fallback offline.html.
  //    request.mode === "navigate" couvre les liens et la barre URL.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL, { ignoreSearch: true }).then((cached) => {
          if (cached) return cached;
          // Ultime fallback texte au cas où le cache aurait été purgé.
          return new Response(
            "<h1>Hors ligne</h1><p>Vérifiez votre connexion.</p>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        })
      )
    );
    return;
  }

  // 3. Assets Next.js hashés (/_next/static/*) → cache-first.
  //    Ces URLs contiennent un hash de contenu, donc immuables.
  //    Un fichier dont l'URL change n'écrase jamais le précédent —
  //    le browser charge la nouvelle URL et le vieux chunk reste
  //    cacheable. Ratisse aussi les fonts/images statiques publiées.
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
            // Ne cache que les réponses OK (200) opaques exclues
            // (cross-origin déjà filtré plus haut, mais ceinture-bretelles).
            if (!response || response.status !== 200) return response;
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, clone).catch(() => {
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

  const url = (event.notification.data && event.notification.data.url) || "/v2/admin";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(url);
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
