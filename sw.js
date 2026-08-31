const CACHE_VERSION = 'nexus-of-torment-v1.2.0-r2';
const CACHE_PREFIX = 'nexus-of-torment-';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './version.json',
  './icons/nexus-icon.svg',
  './assets/nexus-keyart-v1.png',
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
  // Installation atomique du shell complet ; un échec laisse l’ancienne version active.
  // Pas de skipWaiting : les onglets d’une ancienne version gardent leurs modules cohérents.
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION).map(key => caches.delete(key))))
  );
});

function unavailable() {
  return new Response('Ressource indisponible hors ligne. Fermez les onglets du jeu puis rouvrez-le en ligne pour actualiser son installation.', {
    status:503, headers:{ 'Content-Type':'text/plain; charset=utf-8' }
  });
}

async function shellResponse(request) {
  const cache = await caches.open(CACHE_VERSION);
  // HTML, styles, scripts et images proviennent TOUJOURS de la même révision installée.
  // Un fichier manquant ne doit pas être remplacé silencieusement par un module plus récent.
  const cached = await cache.match(request, { ignoreSearch:true });
  // cleanUrls peut rediriger index.html vers /. Une réponse marquée redirected
  // est refusée pour certaines navigations interceptées (ERR_FAILED dans Chrome).
  // Garder ses octets/headers, mais reconstruire une réponse locale non redirigée.
  if (cached?.redirected) return new Response(cached.body, { status:cached.status, statusText:cached.statusText, headers:cached.headers });
  return cached || unavailable();
}

async function externalToShell(request) {
  try { return await fetch(request); } catch { return unavailable(); }
}

const shellURLs = new Set(APP_SHELL.map(relative => new URL(relative, self.location.href).href));

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') event.respondWith(shellResponse('./index.html'));
  else {
    url.search = '';
    url.hash = '';
    event.respondWith(shellURLs.has(url.href) ? shellResponse(request) : externalToShell(request));
  }
});
