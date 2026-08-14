// App-shell cache only (SPEC §85). No master-data offline CRUD, no caching of
// Supabase responses, no caching of anything that isn't a GET to our own origin.
const SHELL_CACHE = "sanci-shell-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll([OFFLINE_URL])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== SHELL_CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      url.pathname.startsWith("/icons/"))
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Never touch non-GET requests: Server Actions, mutations, and anything
  // that must always reach the real server (Permission/Delete/Activation
  // included — they are POST and simply pass through untouched).
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never touch cross-origin requests (Supabase, etc). Read-only caching is
  // for our own shell only, per SPEC §85 — not for master data.
  if (url.origin !== self.location.origin) return;

  // Hashed, immutable Next.js build assets: cache-first is safe.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Page navigations: always prefer the network so data is never stale.
  // Cache is only a last resort when there is truly no connection.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        () =>
          caches.match(request).then((cached) => cached) ||
          caches.match(OFFLINE_URL),
      ),
    );
    return;
  }

  // Everything else (RSC data fetches, API routes, etc.): pass through,
  // network-only. We never want to serve stale partner/branch/staff data.
});
