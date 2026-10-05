// Service worker mínimo de bolo.
// Su único fin es que el navegador ofrezca "Instalar / Agregar a inicio".
// No cachea nada: deja que la red funcione normal (passthrough).
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Tener un manejador de 'fetch' hace a la app instalable en Android.
// No llamamos a respondWith: el navegador usa la red como siempre.
self.addEventListener("fetch", () => {});
