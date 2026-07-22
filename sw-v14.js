const CACHE_NAME = "atelie-da-mirna-v14";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/atelier.css",
  "/workspace.css",
  "/app.js",
  "/app-config.js",
  "/bootstrap-v14.js",
  "/atelier.js",
  "/teacher-migration-v1.js",
  "/teacher-workflow-v1.js",
  "/teacher-recurring-v1.js",
  "/atelier-nav.js",
  "/sidebar-v7.js",
  "/workspace.js",
  "/data-hub.js",
  "/calendar-guard-v1.js",
  "/calendar-v6.js",
  "/runtime-v5.js",
  "/diagnostics-v1.js",
  "/calendar.js",
  "/spotify.js",
  "/icon.svg",
  "/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/index.html")))
  );
});
