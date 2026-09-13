const CACHE_NAME = 'melona-v3';

const APP_SHELL = [
  './',
  './index.html',
  './melona_logo.png',
  './manifest.json'
];

// 1. INSTALL
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// 2. ACTIVATE
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => {
        return Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
  );
});

// 3. FETCH
self.addEventListener('fetch', event => {
  const request = event.request;

  // Hanya proses GET
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // =====================================================
  // JANGAN CACHE SUPABASE
  // =====================================================
  // Supaya data tiap user selalu mengambil data terbaru
  // dari Supabase dan tidak tercampur antar-user.
  if (
    url.hostname === 'supabase.co' ||
    url.hostname.endsWith('.supabase.co')
  ) {
    return;
  }

  // =====================================================
  // JANGAN CACHE FIREBASE / GOOGLE API LAMA
  // =====================================================
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('googleapis.com')
  ) {
    return;
  }

  // =====================================================
  // CDN LIBRARY
  // Network First
  // =====================================================
  if (
    url.hostname.includes('cdnjs.cloudflare.com') ||
    url.hostname.includes('cdn.jsdelivr.net')
  ) {
    event.respondWith(
      fetch(request)
        .then(response => {

          if (response && response.ok) {
            const copy = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(request, copy);
              });
          }

          return response;
        })
        .catch(() => {
          return caches.match(request);
        })
    );

    return;
  }

  // =====================================================
  // ASET APLIKASI
  // Stale While Revalidate
  // =====================================================
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {

        const networkResponse = fetch(request)
          .then(response => {

            if (response && response.ok) {
              const copy = response.clone();

              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(request, copy);
                });
            }

            return response;
          })
          .catch(() => {
            return cachedResponse;
          });

        // Jika ada cache, tampilkan terlebih dahulu.
        // Network tetap berjalan untuk memperbarui cache.
        return cachedResponse || networkResponse;
      })
  );
});
