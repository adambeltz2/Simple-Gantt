// Simple Gantt service worker (backlog #15: PWA support).
//
// Caches the static app shell plus whatever CDN libraries the page actually
// loads, so a repeat visit -- including offline -- works without hitting the
// network again. There's no build step to hash filenames for cache-busting,
// so CACHE_NAME is bumped by hand; do that whenever a shipped file's content
// changes, so the old cache is evicted on the next activate rather than
// silently serving stale bytes forever.
const CACHE_NAME = 'simple-gantt-v2.31.0';

// Same-origin files only -- cache.addAll() fails the whole install if any one
// fetch fails, and a transient CDN hiccup shouldn't block the service worker
// from installing at all. The CDN libraries (frappe-gantt, jexcel, etc.) are
// picked up by the runtime cache-first path below on the first real page
// load instead.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/favicon-16.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only GET is cacheable; let everything else (there isn't any today, but
  // the Dropbox SDK talks to Dropbox's own API directly from the page, not
  // through same-origin requests this worker would see) pass through.
  if (event.request.method !== 'GET') return;

  const isSameOrigin = new URL(event.request.url).origin === self.location.origin;
  event.respondWith(isSameOrigin ? networkFirst(event.request) : cacheFirst(event.request));
});

// App shell: network-first, so a redeploy is picked up immediately whenever
// there's connectivity, falling back to cache so the app still opens offline.
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

// CDN libraries: cache-first. These are pinned to an exact version (SRI
// hash and all, per CLAUDE.md's dependency rules) except jsuites.js/jexcel.js
// -- see the TODO(security) comment in index.html -- so re-fetching them on
// every load buys nothing except breaking offline use, which is the whole
// point of caching them at all.
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  const cache = await caches.open(CACHE_NAME);
  // jsuites.net/bossanova.uk are loaded without a `crossorigin` attribute
  // (that TODO again), so their responses land here as opaque -- status
  // isn't readable, but they're still cacheable and still work when served
  // back out, so cache unconditionally rather than gating on response.ok.
  cache.put(request, response.clone());
  return response;
}
