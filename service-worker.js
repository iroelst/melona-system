/* e-Kasir offline app shell + Firebase SDK cache */
const CACHE_PREFIX = 'ekasir-pwa-';
const CACHE_NAME = CACHE_PREFIX + 'v3';
const BASE = self.registration.scope;
const APP_SHELL = [
  new URL('./index.html', BASE).href,
  new URL('./manifest.json', BASE).href,
  new URL('./icon-192.png', BASE).href,
  new URL('./icon-512.png', BASE).href,
  new URL('./favicon-96.png', BASE).href
];
const FIREBASE_SCRIPTS = [
  'https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // App shell must be cached. Firebase libraries are best-effort so a CDN issue
    // does not prevent installation of the offline app shell.
    await cache.addAll(APP_SHELL);
    await Promise.allSettled(FIREBASE_SCRIPTS.map(async url => {
      const response = await fetch(url, { mode: 'cors', cache: 'no-cache' });
      if (response && response.ok) await cache.put(url, response.clone());
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return; // Never cache Firestore writes or other POST requests.
  const url = new URL(request.url);

  // Firebase compat SDK scripts: cache-first after the first successful online load.
  if (url.hostname === 'www.gstatic.com' && url.pathname.includes('/firebasejs/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone()).catch(() => {});
        return response;
      } catch (error) {
        return new Response('Firebase SDK belum tersimpan untuk penggunaan offline. Buka e-Kasir sekali saat online terlebih dahulu.', {
          status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })());
    return;
  }

  // Navigations: prefer network while online, but fall back to the cached app shell.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response && response.ok) cache.put(new URL('./index.html', BASE).href, response.clone()).catch(() => {});
        return response;
      } catch (_) {
        return (await cache.match(new URL('./index.html', BASE).href)) || Response.error();
      }
    })());
    return;
  }

  // Same-origin app shell and static assets: cache-first with a network refresh fallback.
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) {
        fetch(request).then(response => { if (response && response.ok) cache.put(request, response.clone()); }).catch(() => {});
        return cached;
      }
      try {
        const response = await fetch(request);
        if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
        return response;
      } catch (_) {
        return Response.error();
      }
    })());
  }
});
