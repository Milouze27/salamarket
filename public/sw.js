const CACHE_NAME = 'salamarket-v3';
const OFFLINE_URL = '/offline.html';
const OFFLINE_ASSETS = [OFFLINE_URL, '/brand/logo-horizontal.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Ne pas intercepter les requêtes API (Supabase, Stripe)
  if (url.includes('/functions/v1/') ||
      url.includes('supabase.co') ||
      url.includes('stripe.com')) {
    return;
  }

  // Pour les navigations HTML : network-first avec fallback offline.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Pour les assets pré-cachés (logo affiché dans offline.html) :
  // network-first avec fallback cache pour rester visibles hors ligne.
  if (OFFLINE_ASSETS.some((asset) => url.endsWith(asset))) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Autres requêtes (images, JS, CSS, fonts...) : on ne touche à rien.
  // Le navigateur gère lui-même réseau + erreurs natives, ce qui évite
  // de polluer ces ressources avec une réponse "Hors ligne" inutile.
});

// ── Web Push ─────────────────────────────────────────────────────────
// Reçoit les notifications poussées par l'edge function notify-new-order
// et les affiche au gérant même si l'app est fermée.

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

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // Si une fenêtre de l'app est déjà ouverte, on la focus + navigate.
      for (const win of wins) {
        if ('focus' in win) {
          win.focus();
          if ('navigate' in win) {
            win.navigate(target);
          }
          return;
        }
      }
      // Sinon on en ouvre une nouvelle.
      return clients.openWindow(target);
    })
  );
});
