const CACHE_VERSION = 'nexus-of-torment-v1.2.0';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './version.json',
  './icons/nexus-icon.svg',
  './src/core/math.js',
  './src/core/engine.js',
  './src/core/audio.js',
  './src/game/data.js',
  './src/game/arena.js',
  './src/game/entities.js',
  './src/game/weapons.js',
  './src/game/ui.js',
  './src/game/game.js',
  './src/main.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) || cache.match('./index.html');
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  const response = cached || await network;
  return response || new Response('Ressource indisponible hors ligne.', { status: 503, headers: { 'Content-Type':'text/plain; charset=utf-8' } });
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') event.respondWith(networkFirst(request));
  else event.respondWith(staleWhileRevalidate(request));
});
