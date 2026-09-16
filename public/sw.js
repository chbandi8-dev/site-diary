/**
 * The service worker.
 *
 * Two jobs, and deliberately not a third.
 *
 * 1. Serve the app's own static files from cache, so opening it on a site with
 *    one bar is not a blank screen while 90KB of JavaScript crawls in.
 * 2. Show a readable page instead of the browser's dinosaur when a navigation
 *    fails entirely.
 *
 * It does NOT cache API responses or pages. Everything here is a build's live
 * state — stages, updates, who is waiting on an answer — and a stale answer to
 * "has this been sent" is worse than an honest failure. Pages are always
 * fetched fresh; only the shell is cached.
 */

const VERSION = "v1";
const SHELL = `shell-${VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll([OFFLINE_URL])).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  // Drop caches from older versions, or a bad build would be served forever.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache anything that reflects live state.
  if (url.pathname.startsWith("/api/")) return;

  // Next's build output is content-hashed, so it can be cached hard and
  // forever — a new build produces new filenames.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL);
        return (await cache.match(OFFLINE_URL)) ?? Response.error();
      })
    );
  }
});
