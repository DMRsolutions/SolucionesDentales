// Service worker de DMR Consultorio Dental
// Estrategia: el index.html (y cualquier navegación) va SIEMPRE primero a la red
// para que las actualizaciones se vean de inmediato en el siguiente reload, con
// respaldo en caché solo si no hay internet. El resto del "app shell" (íconos,
// manifest) usa caché primero para carga instantánea, y los recursos externos
// (React, jsPDF, fuentes) van con red primero y respaldo en caché.
//
// IMPORTANTE: cada vez que subas un index.html actualizado, sube TAMBIÉN a este
// archivo (service-worker.js) con CACHE_VERSION incrementado — eso obliga a que
// se descarte por completo el caché viejo del "app shell" en cuanto el navegador
// detecte el nuevo service-worker.js, en vez de depender solo de la estrategia
// de red. Si no subes este archivo, la estrategia de red-primero de abajo debería
// bastar por sí sola, pero subir la versión es la forma más segura de garantizar
// que no quede nada viejo en caché.
const CACHE_VERSION = "dmr-dental-v3";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== APP_SHELL_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  const isNavigation = request.mode === "navigate" || url.pathname.endsWith("index.html") || url.pathname.endsWith("/");

  if (isSameOrigin && isNavigation) {
    // index.html / navegación: RED PRIMERO. Así, en cuanto subas una actualización
    // y el doctor recargue, ve la versión nueva de inmediato — el caché solo se usa
    // como respaldo si no hay conexión.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(APP_SHELL_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
  } else if (isSameOrigin) {
    // Resto del app shell (íconos, manifest): caché primero, con actualización
    // silenciosa en segundo plano — cambian poco y no urge que se vean al instante.
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const clone = response.clone();
              caches.open(APP_SHELL_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    );
  } else {
    // Recursos externos (CDN de React, Babel, jsPDF, fuentes): network-first,
    // con respaldo en caché para que la app siga funcionando sin conexión
    // una vez que se cargó al menos una vez.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});
