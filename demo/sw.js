// Demo service worker: makes the demo installable and fast on repeat visits.
// VERSION and the ?v= values are replaced with a content hash at Docker build time.
const VERSION = "demo-v2";
const SHELL = ["/", "/styles.css?v=2", "/app.js?v=2", "/bandwagon-logo.svg?v=2", "/icon.svg?v=2", "/icons/icon-192.png?v=2", "/manifest.webmanifest?v=2"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    // Page: network first so updates show right away, cached copy when offline.
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((cache) => cache.put("/", copy));
        return res;
      }).catch(() => caches.match("/")),
    );
    return;
  }
  // Versioned static files: cache first.
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
