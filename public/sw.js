const CACHE_NAME = 'bomedia-cache-v4';
const ASSETS_TO_CACHE = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  // On localhost let Next.js HMR and versioned chunks pass through untouched —
  // intercepting them causes "promise rejected" noise during development.
  if (url.hostname === 'localhost' && url.pathname.startsWith('/_next/')) {
    return;
  }

  // ── API: network-first, fall back to cache, then offline JSON ────────────
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            caches.open(CACHE_NAME).then((c) => c.put(event.request, res.clone()));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          return (
            cached ||
            new Response(JSON.stringify({ error: 'You are offline' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' },
            })
          );
        })
    );
    return;
  }

  // ── Next.js static assets: network-first, fall back to cache ─────────────
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.status === 200) {
            caches.open(CACHE_NAME).then((c) => c.put(event.request, res.clone()));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          return cached || new Response('Asset unavailable offline', { status: 503 });
        })
    );
    return;
  }

  // ── Everything else: stale-while-revalidate ───────────────────────────────
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((res) => {
          if (res.status === 200) {
            caches.open(CACHE_NAME).then((c) => c.put(event.request, res.clone()));
          }
          return res;
        })
        .catch(() => cached || new Response('Offline', { status: 503 }));

      return cached || networkFetch;
    })
  );
});
