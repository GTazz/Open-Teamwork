// Service worker: lets the site be installed as an app and keeps the pages
// available when the connection drops. API calls are NEVER cached.
const CACHE = 'otw-shell-v1';

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['/index.html', '/assets/styles.css'])).catch(() => {}));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Network first (always the newest version), cache as a fallback when offline.
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then(hit => hit || caches.match('/index.html')))
  );
});
