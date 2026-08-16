// A redirected response is never stored under the original request key.
// Visiting /cashier while logged out follows the auth redirect to the login
// page; caching that 200 under /cashier would serve the login screen back to
// an already-authenticated user, and because documents are answered
// cache-first it would take a second reload to clear. The Cache API also
// rejects redirected responses outright.
const CACHE_NAME = 'bomedia-cache-v5';
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
          if (res.ok && !res.redirected) {
            const cloned = res.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((c) => c.put(event.request, cloned))
            );
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

  // ── Next.js static assets: cache-first, fall back to network with background caching ─────────────
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const networkFetch = fetch(event.request)
          .then((res) => {
            if (res.status === 200 && !res.redirected) {
              const cloned = res.clone();
              event.waitUntil(
                caches.open(CACHE_NAME).then((c) => c.put(event.request, cloned))
              );
            }
            return res;
          })
          .catch(() => cached || new Response('Asset unavailable offline', { status: 503 }));

        if (cached) {
          event.waitUntil(networkFetch);
          return cached;
        }
        return networkFetch;
      })
    );
    return;
  }

  // ── Page navigations: network-first, cache only as an offline fallback ────
  // These land on routes guarded by proxy.ts. Answering them from cache means
  // the service worker replies before the request ever reaches the network, so
  // the redirect to /login never runs and a signed-out person on a shared
  // device sees the dashboard shell. Going to the network first keeps the gate
  // intact, and also stops a just-deployed change from being masked by a
  // cached copy of the previous page. The cached copy is still there for when
  // the network genuinely is not.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.status === 200 && !res.redirected) {
            const cloned = res.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((c) => c.put(event.request, cloned))
            );
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          // Fall back to the precached landing page so an offline launch shows
          // the app rather than a browser error.
          const root = await caches.match('/');
          return root || new Response('Offline', { status: 503 });
        })
    );
    return;
  }

  // ── Everything else: stale-while-revalidate ───────────────────────────────
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((res) => {
          if (res.status === 200 && !res.redirected) {
            const cloned = res.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((c) => c.put(event.request, cloned))
            );
          }
          return res;
        })
        .catch(() => cached || new Response('Offline', { status: 503 }));

      if (cached) {
        event.waitUntil(networkFetch);
        return cached;
      }
      return networkFetch;
    })
  );
});
