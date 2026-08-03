/**
 * Sylvia's House — Service Worker v2
 *
 * Strategy:
 *   - Network-first for everything: users always get fresh content when online.
 *   - Cache fallback for static assets (JS/CSS/images) when offline.
 *   - HTML navigation is NEVER cached: avoids serving stale pages after a deploy.
 *   - API routes bypass the SW entirely (always dynamic).
 *
 * To force cache invalidation on a new deploy: bump CACHE_NAME (e.g. v3, v4…).
 */

const CACHE_NAME = "sylvias-house-v2";

// ── Install ───────────────────────────────────────────────────────────────────
// No pre-caching of HTML pages — Next.js pages are server-rendered and must
// always come from the network. Skipping waitUntil keeps install instant.
self.addEventListener("install", () => {
  self.skipWaiting();
});

// ── Activate ──────────────────────────────────────────────────────────────────
// Delete every cache that isn't the current version, then claim all open tabs
// so the new SW takes effect immediately without a page reload.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept GET requests from the same origin.
  // This skips POST/DELETE, chrome-extension://, and cross-origin requests.
  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

  // API responses are always dynamic — never cache them.
  if (url.pathname.startsWith("/api/")) return;

  // HTML navigation: network-first, no caching.
  // This ensures users always get the latest server-rendered page after a deploy.
  const isNavigation =
    request.mode === "navigate" ||
    request.headers.get("accept")?.includes("text/html");

  if (isNavigation) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // Static assets (JS chunks, CSS, images, fonts): network-first, cache on success.
  // If offline, serve from cache so the app still works.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
