const CACHE_NAME = "atelie-da-mirna-v18";
const HOME_SHELL = [
  "/",
  "/index.html",
  "/portal-shell-v16.css",
  "/portal-shell-v16.js",
  "/auth-client-v18.js",
  "/auth-shell-v18.css",
  "/home-v16.css",
  "/home-smart-v18.css",
  "/app.js",
  "/app-config.js",
  "/login/",
  "/login/index.html",
  "/login/login.css",
  "/login/login.js",
  "/icon.svg",
  "/manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(HOME_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    if (event.request.mode === "navigate") {
      if (url.pathname.startsWith("/login")) return caches.match("/login/index.html");
      return caches.match("/index.html");
    }
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }));
});
