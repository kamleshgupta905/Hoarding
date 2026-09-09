// 🛡️ Heera Advertising Offline Resilience & Cache Service Worker
const CACHE_NAME = 'heera-staff-cache-v1';

const PRECACHE_URLS = [
  '/',
  '/?mode=staff',
  '/index.html',
  '/manifest.json',
  '/hira-logo.png',
  '/favicon.ico'
];

// Install: precache essential shell assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW] Precache notice:', err);
      });
    })
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
