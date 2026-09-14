const CACHE_NAME = "melona-v5";

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./melona_logo.png"
];

/* =========================
   INSTALL
   ========================= */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(FILES_TO_CACHE))
      .catch((error) => {
        console.warn("Melona SW: sebagian cache awal gagal:", error);
      })
  );

  // Aktifkan versi baru segera.
  self.skipWaiting();
});

/* =========================
   ACTIVATE
   ========================= */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

/* =========================
   FETCH
   ========================= */
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Hanya tangani request GET.
  if (request.method !== "GET") return;

  /*
   * NAVIGASI:
   * Network-first.
   *
   * Ini penting untuk:
   * - OAuth Google/Supabase
   * - mendapatkan index.html terbaru
   * - mencegah halaman lama dari cache
   *
   * Jika internet gagal, gunakan index.html dari cache
   * sebagai fallback.
   */
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => cache.put("./index.html", copy))
              .catch(() => {});
          }

          return response;
        })
        .catch(() => {
          return caches.match("./index.html");
        })
    );

    return;
  }

  /*
   * ASSET LAIN:
   * Cache-first, lalu network.
   *
   * Supabase API/auth/realtime tidak perlu dan tidak boleh
   * disimpan sebagai cache aplikasi oleh Service Worker.
   */
  const url = new URL(request.url);

  // Jangan cache komunikasi Supabase/API.
  const isSupabase =
    url.hostname.endsWith(".supabase.co") ||
    url.hostname.endsWith(".supabase.com");

  if (isSupabase) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request)
          .then((response) => {
            if (!response || !response.ok) {
              return response;
            }

            const copy = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => cache.put(request, copy))
              .catch(() => {});

            return response;
          });
      })
  );
});

/* =========================
   MESSAGE
   ========================= */
self.addEventListener("message", (event) => {
  if (!event.data) return;

  // Memungkinkan halaman meminta SW langsung mengambil alih.
  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  // Membersihkan cache lama jika diminta dari aplikasi.
  if (event.data.type === "CLEAR_MELONA_CACHE") {
    event.waitUntil(
      caches.keys().then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith("melona-") && name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
    );
  }
});
