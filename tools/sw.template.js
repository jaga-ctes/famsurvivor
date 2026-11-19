/* FamSurvivor — Service Worker (alcance: /app/).
 * tools/build.mjs completa la versión y la lista de archivos en cada build. La versión incluye un hash
 * del HTML de la app: si la app cambia, el Service Worker cambia solo y los dispositivos lo detectan.
 * No se edita a mano en dist/: se edita esta plantilla. */
"use strict";

const VERSION = "__VERSION__";
const CACHE = "famsurvivor-" + VERSION;
const PRECACHE = __PRECACHE__;

self.addEventListener("install", (event) => {
  // Sin skipWaiting() acá: la app muestra «Hay una versión nueva» y la persona decide cuándo actualizar.
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" }))))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("famsurvivor-") && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(respond(request));
});

async function respond(request) {
  const cache = await caches.open(CACHE);
  // ignoreSearch: «/app/?mode=emergency», «/app/?tab=plan» y «/app/?selftest» usan la misma página guardada.
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  try {
    return await fetch(request);
  } catch (err) {
    if (request.mode === "navigate") {
      const shell = await cache.match("/app/");
      if (shell) return shell;
    }
    return Response.error();
  }
}
