const CACHE_VERSION = 'nexus-of-torment-v1.3.0-r1';
const CACHE_PREFIX = 'nexus-of-torment-';
// Le build remplace null par les SHA-256 des octets publiés (textes LF, binaires intacts).
const SHELL_INTEGRITY = null;
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
  './src/game/story.js',
  './src/game/progression.js',
  './src/game/arena.js',
  './src/game/entities.js',
  './src/game/weapons.js',
  './src/game/ui.js',
  './src/game/game.js',
  './src/main.js'
];

function integrityRequests(signal) {
  if (SHELL_INTEGRITY === null) return null;
  return APP_SHELL.map(relative => {
    const integrity = Object.hasOwn(SHELL_INTEGRITY, relative) && SHELL_INTEGRITY[relative];
    if (typeof integrity !== 'string' || !/^sha256-[A-Za-z0-9+/]{43}=$/.test(integrity)) throw new Error('Empreinte du shell absente : ' + relative);
    const request = new Request(new URL(relative, self.location.href), { cache:'no-store', integrity, signal });
    if (request.integrity !== integrity) throw new Error('Vérification d’intégrité indisponible.');
    return request;
  });
}

self.addEventListener('install', event => {
  // Installation atomique du shell complet ; un échec laisse l’ancienne version active.
  // Pas de skipWaiting : les onglets d’une ancienne version gardent leurs modules cohérents.
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(integrityRequests() || APP_SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION).map(key => caches.delete(key))))
  );
});

function unavailable() {
  return new Response('Ressource indisponible hors ligne ou installation incomplète. Reconnectez-vous puis réessayez. Si une nouvelle version est disponible, fermez tous les onglets du jeu avant de le rouvrir pour terminer sa mise à jour.', {
    status:503, headers:{ 'Content-Type':'text/plain; charset=utf-8' }
  });
}

let repairPromise = null;
let repairRetryAt = 0;
function repairShell(cache) {
  if (repairPromise) return repairPromise;
  if (SHELL_INTEGRITY === null || Date.now() < repairRetryAt) return Promise.resolve(false);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  repairPromise = (async () => {
    try {
      // addAll vérifie les SRI via Fetch avant son unique lot atomique. Un seul
      // octet différent ou une erreur réseau laisse tout le cache précédent intact.
      // Jamais de cache.put/fetch isolé d’un module d’une autre révision.
      await cache.addAll(integrityRequests(controller.signal));
      return true;
    } catch {
      repairRetryAt = Date.now() + 5000;
      return false;
    } finally {
      clearTimeout(timeout);
      repairPromise = null;
    }
  })();
  return repairPromise;
}

async function shellResponse(request) {
  const cache = await caches.open(CACHE_VERSION);
  // HTML, styles, scripts et images proviennent TOUJOURS de la même révision installée.
  // Un fichier manquant ne doit pas être remplacé silencieusement par un module plus récent.
  let cached = await cache.match(request, { ignoreSearch:true });
  if (!cached && await repairShell(cache)) cached = await cache.match(request, { ignoreSearch:true });
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
