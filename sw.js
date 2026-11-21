/* Service worker: precache the whole app, then serve cache-first (works offline).
 * CACHE_VERSION is rewritten by `node tools/bump_version.js` – run it whenever
 * you change deck.json or any app file, then redeploy. A new version makes the
 * browser install a new SW, which drops the old cache and takes over. */
const CACHE_VERSION = 'v65e5f0badc';
const CACHE = 'dansk-verber-' + CACHE_VERSION;
const FILES = [
  './', 'index.html', 'style.css', 'app.js', 'srs.js', 'deck.json', 'forms.json', 'manifest.json',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  // cache: 'reload' bypasses the HTTP cache so a new version never precaches stale files.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('dansk-verber-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request))
  );
});
