// Guarda la app en el teléfono para que abra sin conexión.
// Cambiar VERSION en cada publicación para que los teléfonos descarguen la nueva.
const VERSION = "v0.1.0";
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "config.js",
  "manifest.webmanifest",
  "vendor/msal-browser.min.js",
  "js/app.js",
  "js/auth.js",
  "js/camera.js",
  "js/clock.js",
  "js/db.js",
  "js/geo.js",
  "js/graph.js",
  "js/sync.js",
  "js/watermark.js",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Solo archivos propios; Microsoft y la hora del servidor van siempre a la red.
  if (event.request.method !== "GET" || url.origin !== location.origin || url.pathname.endsWith("/time.txt")) return;
  // Al volver del login de Microsoft la URL trae ?code=...: se sirve la página guardada.
  event.respondWith(
    caches.match(event.request, { ignoreSearch: event.request.mode === "navigate" }).then((hit) => hit || fetch(event.request))
  );
});
