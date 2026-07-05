const CACHE_VERSION = "vyron-cost-shell-v3";
const APP_SHELL_CACHE = CACHE_VERSION;
const APP_SHELL_ASSETS = [
  "/offline.html",
  "/manifest.json",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-192.png",
  "/icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_ASSETS)).catch(() => undefined)
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== APP_SHELL_CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(async () => {
          return caches.match("/offline.html");
        })
    );
    return;
  }

  const destination = request.destination;
  const isStaticAsset = destination === "script" || destination === "style" || destination === "image" || destination === "font" || url.pathname.startsWith("/_next/static/");

  if (!isStaticAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        fetch(request)
          .then((networkResponse) => {
            if (!networkResponse || networkResponse.status !== 200) return;
            caches.open(APP_SHELL_CACHE).then((cache) => cache.put(request, networkResponse)).catch(() => undefined);
          })
          .catch(() => undefined);
        return cached;
      }

      return fetch(request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) return networkResponse;
          const responseClone = networkResponse.clone();
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put(request, responseClone)).catch(() => undefined);
          return networkResponse;
        })
        .catch(() => caches.match("/offline.html"));
    })
  );
});
