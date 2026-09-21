// 🛡️ Heera Advertising Offline Resilience & Cache Service Worker
// CACHE_VERSION is rewritten automatically by scripts/sync-version.js on every build,
// so a new deployment always invalidates the previous cache.
const CACHE_VERSION = '1.8.0-1790005925696';
const CACHE_NAME = `heera-staff-cache-v${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/?mode=staff',
  '/index.html',
  '/manifest.json',
  '/heera-logo.png',
  '/app-icon-192.png'
];

// Install: precache essential shell assets.
// Each URL is cached individually so a single 404 cannot abort the whole precache.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Skipped precache for', url, err);
          })
        )
      )
    )
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Network-First for HTML/pages, Cache-First for hashed assets
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Always bypass cache for non-GET, API calls, and version check
  if (
    request.method !== 'GET' ||
    url.pathname.includes('version.json') ||
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('googleusercontent.com')
  ) {
    return;
  }

  // Network-First with Cache fallback strategy
  event.respondWith(
    fetch(request)
      .then((response) => {
        // If response is valid, clone and update cache
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(async () => {
        // Fallback to cache when offline
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }
        // Fallback to root for navigation requests
        if (request.mode === 'navigate') {
          return (await caches.match('/?mode=staff')) || (await caches.match('/index.html'));
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      })
  );
});
