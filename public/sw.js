/**
 * Apex Service Worker — Phase 3 PWA
 *
 * Strategy:
 *   - Static assets (JS, CSS, fonts, images): Cache-first with network fallback
 *   - API routes (/api/*): Network-first with no cache (always fresh data)
 *   - Navigation (HTML pages): Network-first, fall back to cached shell
 *
 * Cache versioning ensures stale assets are evicted on deploy.
 */

const CACHE_VERSION = 'apex-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const SHELL_CACHE = `${CACHE_VERSION}-shell`;

/** Static assets to pre-cache on install */
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate — evict old caches ──────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('apex-') && k !== STATIC_CACHE && k !== SHELL_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept API calls — always hit the network for live data
  if (url.pathname.startsWith('/api/')) return;

  // For navigation requests: network-first, fall back to cached shell
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match('/') ?? Response.error())
    );
    return;
  }

  // For static assets: cache-first, update cache in background
  if (
    url.pathname.match(/\.(js|css|woff2?|png|jpg|jpeg|svg|ico|webp)$/) ||
    url.pathname.startsWith('/_next/static/')
  ) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) {
          // Refresh cache in background (stale-while-revalidate)
          fetch(request).then((res) => { if (res.ok) cache.put(request, res); }).catch(() => {});
          return cached;
        }
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      })
    );
  }
});
