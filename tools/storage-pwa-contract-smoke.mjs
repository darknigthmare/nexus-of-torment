import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { canonicalFileBytes, shellIntegrity, stampServiceWorker } from './build.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
let passed = 0;
function check(value, label) { assert.ok(value, label); console.log('OK  ' + label); passed++; }
const defaults = { version:2, shards:0, settings:{volume:1}, records:{runs:0}, activeRun:null };
function events(target = {}) {
  const handlers = new Map();
  return Object.assign(target, {
    addEventListener(type, callback) { if (!handlers.has(type)) handlers.set(type, []); handlers.get(type).push(callback); },
    dispatchEvent(event) { for (const handler of handlers.get(event.type) || []) handler(event); },
    emit(type, detail = {}) { this.dispatchEvent({ type, ...detail }); }, handlers
  });
}
class FixtureEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } }
function storageFixture() {
  const disk = new Map(), notifications = [];
  let writes = 0, denyRead = false, denyWrite = false;
  const localStorage = {
    getItem(key) { if (denyRead) throw new Error('SecurityError'); return disk.get(key) ?? null; },
    setItem(key, value) { if (denyWrite) throw new Error('QuotaExceededError'); writes++; disk.set(key, value); }
  };
  const document = events({ dispatchEvent(event) { notifications.push(event); } });
  document.addEventListener('nt-save-status', event => notifications.push(event));
  const window = events();
  const context = vm.createContext({ window, document, localStorage, console, CustomEvent:FixtureEvent, structuredClone, setTimeout, clearTimeout, performance:{now:()=>0} });
  for (const file of ['src/core/math.js', 'src/core/engine.js']) vm.runInContext(read(file), context, { filename:file });
  return { disk, document, window, context, localStorage, notifications, Store:window.NT.Engine.SaveStore,
    writes:() => writes, blockRead:value => { denyRead = value; }, blockWrite:value => { denyWrite = value; } };
}

const storage = storageFixture();
const first = new storage.Store('shared', defaults), stale = new storage.Store('shared', defaults);
first.data.shards = 15; first.data.records.runs = 2;
check(first.save() && first.save() && !first.status.conflict, 'Écritures propres successives : base brute actualisée après chaque succès');
const newestRaw = storage.disk.get('shared'), memory = stale.data;
stale.data.settings.volume = .25;
check(!stale.save() && stale.status.conflict && stale.status.dirty, 'Deux onglets : refus d’écriture du dossier périmé sans dépendre de storage');
check(storage.disk.get('shared') === newestRaw && stale.data === memory && stale.data.settings.volume === .25 && JSON.parse(stale.exportJSON()).settings.volume === .25, 'Conflit : progression distante et brouillon local exportable conservés');
check(!stale.importJSON(first.exportJSON()).ok && stale.data === memory && storage.disk.get('shared') === newestRaw, 'Import périmé refusé sans modifier ni disque ni mémoire');
storage.disk.delete('shared');
check(stale.checkExternalChanges() && stale.status.conflict && !stale.save(), 'Conflit acquis : aucune reprise silencieuse après suppression externe');
const current = new storage.Store('shared', defaults);
check(current.save() && !current.status.conflict, 'Rechargement explicite : nouvelle instance autorisée avec la base disque actuelle');
const removed = new storage.Store('shared', defaults);
storage.disk.delete('shared');
check(removed.checkExternalChanges() && removed.status.conflict && !removed.save() && !storage.disk.has('shared'), 'Effacement par un autre onglet : aucune résurrection du dossier supprimé');

const futureRaw = JSON.stringify({ ...defaults, version:3, shards:80, futureProgression:{chapter:4} });
storage.disk.set('future', futureRaw);
storage.disk.set('future:recovery', 'existing-recovery');
const beforeFutureWrites = storage.writes();
const future = new storage.Store('future', defaults);
check(future.status.futureVersion === 3 && !future.status.recovered && future.recoveryBackup === futureRaw && storage.writes() === beforeFutureWrites, 'Version future : lecture protégée et copie brute mémoire sans aucune écriture');
future.data.shards = 9;
check(!future.save() && !future.importJSON(JSON.stringify(defaults)).ok && storage.disk.get('future') === futureRaw && storage.disk.get('future:recovery') === 'existing-recovery' && storage.writes() === beforeFutureWrites, 'Version future : save/import ne rétrogradent ni le dossier ni le secours');
const upgraded = new storage.Store('upgrade', defaults);
upgraded.data.shards = 7; storage.disk.set('upgrade', futureRaw);
check(upgraded.checkExternalChanges() && upgraded.status.futureVersion === 3 && upgraded.status.conflict && upgraded.recoveryBackup === futureRaw && upgraded.data.shards === 7, 'Mise à jour concurrente : version future détectée sans abandon du brouillon');
const imports = new storage.Store('imports', defaults);
check(!imports.importJSON(futureRaw).ok && !storage.disk.has('imports') && imports.data.version === 2 && !imports.status.futureVersion, 'Import d’un futur format : rejet strict sans empoisonner le dossier courant');
check(imports.importJSON(JSON.stringify({...defaults, shards:4})).ok && imports.save(), 'Import valide : suivi de sa propre écriture prêt pour la sauvegarde suivante');
const unread = new storage.Store('unread', defaults);
storage.blockRead(true); unread.data.shards = 3;
check(!unread.save() && !unread.status.available && unread.data.shards === 3 && !storage.disk.has('unread'), 'Lecture du stockage refusée : aucune écriture aveugle et brouillon conservé');
const noBaseline = new storage.Store('no-baseline', defaults);
storage.blockRead(false);
check(unread.save() && unread.status.available, 'Lecture restaurée avec base connue : sauvegarde à nouveau possible');
check(!noBaseline.save() && noBaseline.status.conflict, 'Base jamais lue : rechargement exigé au lieu d’écraser des données inconnues');
const quota = new storage.Store('quota', defaults);
storage.blockWrite(true); quota.data.shards = 6;
check(!quota.save() && quota.status.dirty && !quota.status.available && !quota.status.conflict, 'Quota refusé : échec distinct d’un conflit de révision');
storage.blockWrite(false);
check(quota.save() && JSON.parse(storage.disk.get('quota')).shards === 6, 'Quota rétabli : la base ne progresse qu’après une vraie écriture');
check(storage.notifications.some(event => event.detail.conflict) && storage.notifications.some(event => event.detail.futureVersion === 3), 'Statuts conflit et version future effectivement publiés à l’interface');

function lifecycleFixture(protectedRaw = null) {
  const fixture = storageFixture();
  if (protectedRaw) fixture.disk.set('life', protectedRaw);
  let updates = 0, renders = 0, runs = 0, suspends = 0;
  const canvas = events({ getContext:()=>({}) });
  const fallback = { classList:{add() {},remove() {}} };
  Object.assign(fixture.document, { readyState:'complete', hidden:false, getElementById:id => id === 'game-canvas' ? canvas : fallback });
  fixture.window.NT.NexusGame = class {
    constructor() {
      this.state = 'playing'; this.save = new fixture.Store('life', defaults);
      this.input = { keys:new Set(['KeyW']), pressed:new Set(['KeyE']), mouseButtons:new Set([0]), mouseDX:8, mouseDY:6, wheel:1,
        clearVirtualInputs() { this.virtualCleared = true; }, exitLock() { this.lockExited = true; } };
      this.audio = { suspend:()=>suspends++ };
    }
    start() {} update() { updates++; } render() { renders++; }
    pause() { this.state = 'paused'; }
    startRun() { runs++; this.state = 'playing'; return true; }
    restartRun() { return this.startRun(); } resumeSavedRun() { return this.startRun(); } resume() { return this.startRun(); }
  };
  fixture.context.navigator = {};
  vm.runInContext(read('src/main.js'), fixture.context, { filename:'src/main.js' });
  return Object.assign(fixture, { game:fixture.window.nexusGame, counts:()=>({updates,renders,runs,suspends}) });
}
const life = lifecycleFixture();
life.window.emit('storage', {key:'other-project'});
check(life.game.state === 'playing' && !life.game.persistenceBlocked, 'Storage : les clés étrangères sont ignorées');
life.window.emit('storage', {key:'life'});
check(!life.game.persistenceBlocked, 'Storage sans changement effectif : pas de pause ni conflit artificiel');
life.disk.set('life', JSON.stringify({...defaults,shards:40}));
life.window.emit('storage', {key:'life'});
check(life.game.persistenceBlocked && life.game.state === 'paused' && !life.game.input.keys.size && life.game.input.virtualCleared && life.game.input.lockExited && life.counts().suspends > 0, 'Storage modifié : pause réelle, saisies et son suspendus');
life.game.update(.1); life.game.render();
check(life.counts().updates === 0 && life.counts().renders === 1 && typeof life.game.save.exportJSON() === 'string', 'Conflit : simulation gelée mais rendu/interface/export restent disponibles');
check(['startRun','restartRun','resumeSavedRun','resume'].every(name => life.game[name]() === false) && life.counts().runs === 0 && life.game.state === 'paused', 'Conflit : toutes les actions de lancement/reprise restent refusées');
const clearedLife = lifecycleFixture();
clearedLife.game.save.save(); clearedLife.disk.clear(); clearedLife.window.emit('storage', {key:null});
check(clearedLife.game.persistenceBlocked, 'Storage.clear : événement key null également protégé');
const futureLife = lifecycleFixture(futureRaw);
check(futureLife.game.persistenceBlocked && futureLife.game.startRun() === false && futureLife.game.save.recoveryBackup === futureRaw, 'Dossier futur au démarrage : aucune entrée dans un faux combat gelé');
const synchronous = lifecycleFixture();
synchronous.disk.set('life', JSON.stringify({...defaults,shards:25})); synchronous.game.save.save();
check(synchronous.game.persistenceBlocked, 'Conflit détecté par save : événement de statut gèle aussi la simulation sans storage');

function pwaFixture({waiting = false, fail = false, controlled = false} = {}) {
  const notices = [], document = events({readyState:'loading'}), window = events();
  document.addEventListener('nt-pwa-status', event => notices.push(event.detail));
  const registration = events({waiting:waiting ? {} : null, installing:null});
  let resolveReady, registrations = 0;
  const serviceWorker = { controller:controlled ? {} : null,
    register:async () => { registrations++; if (fail) throw new Error('registration-refused'); return registration; },
    ready:new Promise(resolve => { resolveReady = resolve; }) };
  vm.runInNewContext(read('src/main.js'), { window, document, navigator:{serviceWorker}, location:{protocol:'https:'}, CustomEvent:FixtureEvent, console:{warn() {}} });
  return { window, document, registration, serviceWorker, notices, resolveReady, registrations:()=>registrations,
    load:() => window.handlers.get('load')[0]() };
}
const pwa = pwaFixture();
check(!pwa.window.nexusPWA.status.installAvailable && await pwa.window.nexusPWA.install() === false, 'PWA : bouton indisponible sans vrai beforeinstallprompt');
const registering = pwa.load(); await new Promise(resolve => setImmediate(resolve));
check(!pwa.window.nexusPWA.status.offlineReady && pwa.registrations() === 1, 'PWA : pas de promesse hors ligne avant serviceWorker.ready');
pwa.resolveReady(pwa.registration); await registering;
check(pwa.window.nexusPWA.status.offlineReady && pwa.notices.some(status => status.offlineReady), 'PWA : ready publie un état hors ligne observable');
let prevented = 0, prompts = 0;
pwa.window.emit('beforeinstallprompt', { preventDefault:()=>prevented++, prompt:async()=>prompts++, userChoice:Promise.resolve({outcome:'accepted'}) });
check(prevented === 1 && pwa.window.nexusPWA.status.installAvailable && await pwa.window.nexusPWA.install() && prompts === 1 && !pwa.window.nexusPWA.status.installed && !pwa.window.nexusPWA.status.installAvailable, 'PWA : prompt réel à usage unique, acceptation distincte de l’installation');
pwa.window.emit('appinstalled');
check(pwa.window.nexusPWA.status.installed && await pwa.window.nexusPWA.install() === false, 'PWA : appinstalled seul confirme l’installation, sans second prompt');
const rejectedPrompt = pwaFixture();
rejectedPrompt.window.emit('beforeinstallprompt', {preventDefault() {},prompt:async()=>{throw new Error('prompt-refused');}});
check(!await rejectedPrompt.window.nexusPWA.install() && rejectedPrompt.window.nexusPWA.status.error === 'prompt-refused', 'PWA : rejet du prompt absorbé et rendu observable');
const updating = pwaFixture({waiting:true,controlled:true});
const updatingLoad = updating.load(); await new Promise(resolve => setImmediate(resolve));
check(updating.window.nexusPWA.status.updateAvailable && !updating.window.nexusPWA.status.offlineReady, 'PWA : worker en attente signalé sans activation ni rechargement forcés');
updating.resolveReady(updating.registration); await updatingLoad;
updating.window.nexusPWA.status.updateAvailable = false;
const worker = events({state:'installing'}); updating.registration.installing = worker;
updating.registration.emit('updatefound'); worker.state = 'installed'; worker.emit('statechange');
check(updating.window.nexusPWA.status.updateAvailable && updating.window.nexusPWA.status.offlineReady, 'PWA : updatefound/statechange signale la mise à jour en gardant la version active');
const failedPWA = pwaFixture({fail:true}); await failedPWA.load();
check(!failedPWA.window.nexusPWA.status.offlineReady && failedPWA.window.nexusPWA.status.error === 'registration-refused', 'PWA : échec d’enregistrement explicite, jamais annoncé prêt hors ligne');

const swSource = read('sw.js');
const discover = { URL, self:{location:{href:'https://nexus.test/sw.js',origin:'https://nexus.test'},addEventListener() {}} };
vm.runInNewContext(swSource + '\nglobalThis.shell = APP_SHELL;', discover);
const entries = [...new Set(discover.shell.map(relative => relative === './' ? 'index.html' : relative.slice(2)))].map(relative => ({
  relative, bytes:relative.endsWith('.png') ? Buffer.from([0,13,10,255,13,42]) : Buffer.from(relative + ' expected\r\n')
}));
const integrity = shellIntegrity(entries);
check(integrity['./'] === integrity['./index.html'] && !Object.hasOwn(integrity, './sw.js') && Object.keys(integrity).length === discover.shell.length, 'Build SRI : couverture exacte du shell, alias index et aucune auto-référence worker');
check(entries.every(entry => integrity['./'+entry.relative] === 'sha256-' + createHash('sha256').update(canonicalFileBytes(entry.relative,entry.bytes)).digest('base64')), 'Build SRI : SHA-256 recalculé indépendamment sur les octets canoniques');
check(JSON.stringify(shellIntegrity([...entries].reverse())) === JSON.stringify(integrity), 'Build SRI : mapping déterministe malgré l’ordre des fichiers');
assert.throws(() => stampServiceWorker('const CACHE_VERSION = "test";', 'revision', integrity), /SHELL_INTEGRITY/);
check(true, 'Build SRI : absence du jeton de mapping rejetée, sans build incomplet silencieux');
const builtWorker = stampServiceWorker(swSource, 'nexus-of-torment-build-contract', integrity);
const bodies = new Map(entries.map(entry => ['/' + entry.relative, canonicalFileBytes(entry.relative,entry.bytes)]));
bodies.set('/', bodies.get('/index.html'));
let servedBodies = new Map(bodies), fetches = 0;
const server = http.createServer((request,response) => {
  fetches++;
  const body = servedBodies.get(new URL(request.url,'http://fixture').pathname);
  response.writeHead(body ? 200 : 404, {'Content-Type':'application/octet-stream'}); response.end(body || 'missing');
});
await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
const origin = 'http://127.0.0.1:' + server.address().port;
function swFixture({abortOnly = false, source = builtWorker} = {}) {
  const handlers = {}, values = new Map(), batches = [];
  let commits = 0, clock = 10000, abortTimeout = null, timeoutMs = null, claims = 0, skips = 0;
  const resolveURL = request => { const url = new URL(typeof request === 'string' ? request : request.url, origin+'/sw.js'); url.search = ''; return url.href; };
  const cache = {
    async match(request) { return values.get(resolveURL(request))?.clone(); },
    async addAll(requests) {
      batches.push([...requests]);
      if (abortOnly) return new Promise((_,reject) => requests[0].signal.addEventListener('abort',()=>reject(new Error('aborted'))));
      // Node n’a pas CacheStorage : ce double suit le lot atomique de Cache.addAll.
      // Fetch est réel : les mismatches SRI ci-dessous sont rejetés par le moteur réseau.
      const staged = await Promise.all(requests.map(async request => {
        const response = await fetch(request);
        if (!response.ok) throw new Error('HTTP '+response.status);
        return [resolveURL(request),new Response(await response.arrayBuffer(),{status:response.status,headers:response.headers})];
      }));
      for (const [url,response] of staged) values.set(url,response);
      commits++;
    }
  };
  const context = vm.createContext({ URL, Request, Response, AbortController,
    Date:class extends Date { static now() { return clock; } },
    setTimeout:(callback,ms) => { abortTimeout = callback; timeoutMs = ms; return 1; },clearTimeout:()=>{abortTimeout=null;},
    self:{ location:{href:origin+'/sw.js',origin},addEventListener:(type,callback)=>{handlers[type]=callback;},skipWaiting:()=>skips++,clients:{claim:()=>claims++} },
    caches:{open:async()=>cache,keys:async()=>[],delete:async()=>true},fetch });
  vm.runInContext(source,context,{filename:'sw.js'});
  return { values,batches,cache,handlers,context,commits:()=>commits,advance:()=>{clock+=5001;},timeoutMs:()=>timeoutMs,abort:()=>abortTimeout?.(),forced:()=>claims+skips,
    async request(relative,mode='cors') { let answer; handlers.fetch({request:{url:new URL(relative,origin).href,method:'GET',mode},respondWith:promise=>{answer=promise;}}); return answer; },
    async install() { let promise; handlers.install({waitUntil:value=>{promise=value;}}); return promise; } };
}
try {
  const repaired = swFixture();
  const responses = await Promise.all([repaired.request('/','navigate'),repaired.request('/src/game/ui.js')]);
  check(responses.every(response=>response.status===200) && await responses[0].text()===bodies.get('/index.html').toString() && repaired.commits()===1 && repaired.batches.length===1, 'Cache perdu : navigation et module réparés ensemble par un seul lot partagé');
  check(repaired.batches[0].length===discover.shell.length && repaired.batches[0].every(request=>request.cache==='no-store' && request.integrity===integrity[new URL(request.url).pathname==='/' ? './' : '.'+new URL(request.url).pathname] && request.signal), 'Réparation : chaque requête porte la SRI attendue, sans cache HTTP et avec annulation');
  const requestsBeforeHit=fetches;
  check((await repaired.request('/src/game/ui.js?cacheBust=1')).status===200 && fetches===requestsBeforeHit, 'Cache complet : accès local ignoreSearch, sans requête réseau additionnelle');
  const oldUI=await repaired.values.get(origin+'/src/game/ui.js').clone().text();
  repaired.values.delete(origin+'/index.html');
  servedBodies.set('/src/game/ui.js',Buffer.from('a-newer-module'));
  check((await repaired.request('/','navigate')).status===503 && repaired.commits()===1 && !repaired.values.has(origin+'/index.html') && await repaired.values.get(origin+'/src/game/ui.js').clone().text()===oldUI, 'Révision distante différente : vrai Fetch rejette la SRI, lot refusé et cache antérieur intact');
  const failedBatches=repaired.batches.length;
  check((await repaired.request('/','navigate')).status===503 && repaired.batches.length===failedBatches, 'Échec : délai anti-boucle évite les téléchargements répétés du shell');
  servedBodies=new Map(bodies); repaired.advance();
  check((await repaired.request('/','navigate')).status===200 && repaired.commits()===2, 'Révision identique de nouveau disponible : réparation après délai sans nouvelle installation SW');
  const incomplete=swFixture(); incomplete.values.set(origin+'/src/core/math.js',new Response('preserved-local-copy'));
  servedBodies.delete('/styles.css');
  check((await incomplete.request('/','navigate')).status===503 && incomplete.commits()===0 && incomplete.values.size===1 && await incomplete.values.get(origin+'/src/core/math.js').clone().text()==='preserved-local-copy', 'Téléchargement partiel HTTP404 : aucun des fichiers réussis ne remplace le cache');
  servedBodies=new Map(bodies);
  const install=swFixture(); await install.install();
  check(install.commits()===1 && install.batches[0].every(request=>Boolean(request.integrity)) && install.forced()===0, 'Installation initiale : même contrôle SRI complet, sans skipWaiting ni clients.claim');
  const corruptInstall=swFixture(); servedBodies.set('/styles.css',Buffer.from('different styles'));
  await assert.rejects(corruptInstall.install());
  check(corruptInstall.commits()===0 && corruptInstall.values.size===0, 'Installation SRI refusée : aucun shell partiellement installé');
  const hanging=swFixture({abortOnly:true}); const pending=hanging.request('/','navigate');
  await new Promise(resolve => setImmediate(resolve));
  check(hanging.timeoutMs()===8000 && hanging.batches.length===1, 'Réparation lente : timeout explicite de huit secondes');
  hanging.abort();
  check((await pending).status===503 && hanging.batches[0].every(request=>request.signal.aborted) && hanging.commits()===0, 'Timeout : toutes les requêtes annulées et retour503 sans cache partiel');
  const sourceOnly=swFixture({source:swSource});
  check((await sourceOnly.request('/','navigate')).status===503 && sourceOnly.batches.length===0, 'Source non buildée : pas de réparation sans empreintes attendues');
} finally {
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
}
console.log('\nStockage / PWA : '+passed+' contrats validés.');
