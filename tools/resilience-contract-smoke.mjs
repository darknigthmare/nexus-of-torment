import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let passed = 0;
function check(condition, label) { assert.ok(condition, label); console.log('OK  ' + label); passed++; }
const disk = new Map();
let blockedStorage = false;
const storageEvents = [];
const windowObject = {};
const context = vm.createContext({
  window:windowObject, console, setTimeout, clearTimeout, structuredClone,
  performance:{ now:() => 0 },
  CustomEvent:class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  document:{ dispatchEvent:event => storageEvents.push(event) },
  localStorage:{
    getItem:key => disk.get(key) ?? null,
    setItem:(key, value) => { if (blockedStorage) throw new Error('QuotaExceededError'); disk.set(key, value); }
  }
});
for (const relative of ['src/core/math.js','src/core/engine.js','src/core/audio.js','src/game/data.js','src/game/arena.js','src/game/entities.js','src/game/weapons.js','src/game/game.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), context, { filename:relative });
}
const NT = windowObject.NT;
const defaults = {
  version:2,
  settings:{ sensitivity:1, volume:.72, fov:82, renderScale:1, hudScale:1, shakeIntensity:1, headBob:true, reducedFlashes:false, reducedMotion:false, gore:true, invertY:false, uiContrast:false, enemyContrast:false, subtitles:true, guidedHints:true, timedUpgrades:false },
  shards:0, meta:Object.fromEntries(Object.keys(NT.Data.META_UPGRADES).map(key => [key, 0])),
  codex:{ enemyKills:{} },
  records:{ bestWave:0, bestScore:0, lifetimeKills:0, bossKills:0, headshots:0, damage:0, runs:0, playTime:0 }, activeRun:null
};
const key = 'resilience-test';
disk.set(key, JSON.stringify({ version:1, records:null, meta:null, codex:null, shards:'999', settings:{ sensitivity:-30, volume:100 } }));
const store = new NT.Engine.SaveStore(key, defaults);
check(store.data.version === 2 && store.data.records.bestWave === 0 && store.data.meta.vitalSeal === 0 && store.data.codex.enemyKills, 'Sauvegarde : migration et sous-objets null réparés');
check(store.data.shards === 0 && store.data.settings.sensitivity === .25 && store.data.settings.volume === 1, 'Sauvegarde : types et bornes économiques/options protégés');
check(store.status.recovered && store.recoveryBackup === disk.get(key + ':recovery'), 'Sauvegarde : original récupérable sans écrasement silencieux');
const poison = JSON.parse('{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}');
NT.Engine.deepMerge({}, poison);
check(vm.runInContext('({}).polluted', context) === undefined && ({}).polluted === undefined, 'Fusion : clés de pollution de prototype ignorées');
disk.set('broken-json', '{invalide');
const broken = new NT.Engine.SaveStore('broken-json', defaults);
check(broken.status.recovered && broken.data.records.runs === 0 && broken.recoveryBackup === '{invalide', 'JSON corrompu : defaults sûrs et copie récupérable');

const checkpoint = NT.NexusGame.prototype._validateActiveRun.call(NT.NexusGame.prototype, {
  version:1, classId:'bulwark', difficultyId:'unstable', modeId:'campaign', sectorId:'sanctum', nextWave:4,
  player:{ health:75, maxHealth:100, position:{x:0,y:0,z:10} }
});
checkpoint.savedAt = Date.now();
store.data.activeRun = checkpoint;
store.data.shards = 42;
check(store.save() && store.data.activeRun?.savedAt === checkpoint.savedAt, 'Checkpoint : timestamp actuel et reprise conservés par save');
const exported = store.exportJSON();
check(JSON.parse(exported).shards === 42 && JSON.parse(exported).activeRun.nextWave === 4, 'Export : progression et checkpoint complets');
const receiver = new NT.Engine.SaveStore('import-target', defaults);
check(receiver.importJSON(exported).ok && receiver.data.shards === 42 && receiver.data.activeRun.nextWave === 4, 'Import : round-trip strict compatible');
const setOwn = (target, key, value) => Object.defineProperty(target, key, { value, enumerable:true, writable:true, configurable:true });
for (const id of ['constructor', 'toString', '__proto__']) {
  for (const field of ['classId', 'difficultyId', 'modeId', 'sectorId', 'unlockedWeapons', 'currentId', 'weaponStates', 'upgradeStacks', 'meta']) {
    const poisoned = JSON.parse(exported);
    const run = poisoned.activeRun;
    if (['classId', 'difficultyId', 'modeId', 'sectorId'].includes(field)) run[field] = id;
    else if (field === 'unlockedWeapons') run.player.unlockedWeapons.push(id);
    else if (field === 'currentId') run.weapons.currentId = id;
    else if (field === 'weaponStates') setOwn(run.weapons.states, id, { mag:1, reserve:1, maxReserve:1 });
    else if (field === 'upgradeStacks') setOwn(run.player.upgradeStacks, id, 1);
    else setOwn(poisoned.meta, id, 1);
    const before = receiver.exportJSON();
    check(!receiver.importJSON(JSON.stringify(poisoned)).ok && receiver.exportJSON() === before, 'Import sans mutation : identifiant hérité ' + field + '=' + id);
  }
}

let fixtureIndex = 0;
function runFixture() {
  const game = Object.create(NT.NexusGame.prototype);
  Object.assign(game, {
    audio:{ init() {}, ui() {}, wave() {} },
    save:new NT.Engine.SaveStore('run-fixture-' + fixtureIndex++, defaults),
    camera:new NT.Engine.Camera(), renderer:{ meshes:new Proxy({}, { get:() => ({}) }) },
    spawnQueue:[], enemies:[], projectiles:[], pickups:[], tracers:[], arcs:[], rings:[], hallucinations:[],
    particles:{ clear() {} },
    arena:{ reset() {}, setSector() {}, setObjectiveZone() {}, resolvePosition() {}, getStartPosition:() => new NT.Math.Vec3(0, 0, 10), triggerGatePulse() {} },
    ui:{ enterGame() {}, announce() {}, subtitle() {} },
    input:{ requestLock:() => Promise.resolve(true) }
  });
  game.player = new NT.Entities.Player(game);
  game.weapons = new NT.WeaponSystem(game);
  return game;
}
const numericTreeIsFinite = value => {
  if (typeof value === 'number') return Number.isFinite(value);
  return !value || typeof value !== 'object' || Object.values(value).every(numericTreeIsFinite);
};
for (const id of ['constructor', 'toString', '__proto__']) {
  const game = runFixture();
  game.startRun(id, id, id, id);
  check(game.state === 'playing' && game.lastClassId === 'bulwark' && game.lastDifficultyId === 'unstable' && game.modeId === 'campaign' && game.sectorId === 'sanctum' && game.wave === 1 && game.spawnQueue.length > 0 && numericTreeIsFinite(game._snapshotActiveRun()), 'Lancement réel : identifiant hérité ' + id + ' neutralisé sans NaN');
}
const metaGame = runFixture();
metaGame.save.data.meta = Object.assign(Object.create({ vitalSeal:999999, ordinance:999999 }), { munitions:999999, reinforced:-10, ward:NaN, scavenger:Symbol('invalid') });
metaGame.startRun();
check(metaGame.player.maxHealth === NT.Data.CLASSES.bulwark.health && metaGame.player.maxArmor === NT.Data.CLASSES.bulwark.armor && metaGame.player.modifiers.damageMul === 1 && metaGame.player.modifiers.corruptionResist === 0 && metaGame.player.essence === 0 && metaGame.weapons.metaReserveMul === 1.3 && numericTreeIsFinite(metaGame._snapshotActiveRun()), 'Méta : rangs hérités ignorés, valeurs mal typées neutralisées et rang propre plafonné sans NaN');
const inheritedStacks = JSON.parse(exported).activeRun;
inheritedStacks.player.upgradeStacks = Object.create({ [NT.Data.UPGRADES[0].id]:NT.Data.UPGRADES[0].max });
inheritedStacks.stats = Object.create({ kills:999 });
inheritedStacks.weapons.states = Object.create({ rifle:{mag:999, reserve:999, maxReserve:999} });
const normalizedInherited = NT.NexusGame.prototype._validateActiveRun(inheritedStacks);
check(!Object.hasOwn(normalizedInherited.player.upgradeStacks, NT.Data.UPGRADES[0].id) && normalizedInherited.stats.kills === 0 && normalizedInherited.weapons.states.rifle.mag === NT.Data.WEAPONS.rifle.magazine && numericTreeIsFinite(normalizedInherited), 'Checkpoint : piles, compteurs et états d’armes hérités ignorés');
const snapshotGame = runFixture();
snapshotGame.startRun('bulwark', 'unstable', 'campaign', 'sanctum');
check(snapshotGame._checkpointActiveRun(2), 'Checkpoint : sauvegarde issue du vrai lancement');
const resumedGame = runFixture();
check(resumedGame.save.importJSON(snapshotGame.save.exportJSON()).ok && resumedGame.resumeSavedRun() && resumedGame.state === 'playing' && resumedGame.intermissionActive && numericTreeIsFinite(resumedGame._snapshotActiveRun()), 'Reprise réelle : export/import du lancement conservé sans NaN');

for (const [label, raw] of [
  ['racine tableau', '[]'], ['version absente', '{}'], ['version future', '{"version":99}'],
  ['nombre négatif', '{"version":2,"shards":-1}'], ['option typée incorrectement', '{"version":2,"settings":{"volume":"fort"}}'],
  ['clé inconnue', '{"version":2,"secret":true}'], ['prototype', '{"version":2,"__proto__":{"polluted":true}}'],
  ['checkpoint inconnu', '{"version":2,"activeRun":{"version":1,"classId":"inconnue","difficultyId":"unstable"}}']
]) {
  const before = receiver.exportJSON();
  check(!receiver.importJSON(raw).ok && receiver.exportJSON() === before, 'Import rejeté sans mutation : ' + label);
}
check(!receiver.importJSON(' '.repeat(262145)).ok, 'Import : limite de taille appliquée avant parsing');
blockedStorage = true;
store.data.shards = 44;
check(!store.save() && !store.status.available && store.status.dirty, 'Stockage refusé : save false et état non persistant visible');
const beforeImport = receiver.exportJSON();
check(!receiver.importJSON(exported).ok && receiver.exportJSON() === beforeImport, 'Stockage refusé : import atomique sans remplacement mémoire');
check(storageEvents.some(event => event.type === 'nt-save-status' && event.detail.available === false), 'Stockage : événement de statut transmis à l’interface');
blockedStorage = false;
check(store.save() && store.status.available && !store.status.dirty, 'Stockage rétabli : nouvelle écriture confirmée');

windowObject.AudioContext = class { constructor() { throw new Error('Audio device unavailable'); } };
const failedAudio = new NT.AudioManager();
check(failedAudio.init() === false && failedAudio.unavailable && failedAudio.context === null, 'Audio absent : initialisation non fatale');
assert.doesNotThrow(() => { failedAudio.ui('confirm'); failedAudio.gun('rifle'); failedAudio.enemy(); });
check(true, 'Audio absent : interface et combat restent appelables');
const param = () => ({ value:0, setTargetAtTime() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
const node = () => ({ gain:param(), frequency:param(), detune:param(), Q:param(), threshold:param(), knee:param(), ratio:param(), attack:param(), release:param(), connect() {}, start() {}, stop() {} });
windowObject.AudioContext = class {
  constructor() { this.state = 'running'; this.sampleRate = 8000; this.currentTime = 0; this.destination = {}; }
  createGain() { return node(); } createDynamicsCompressor() { return node(); }
  createOscillator() { return node(); } createBiquadFilter() { return node(); } createBufferSource() { return node(); }
  createBuffer(_, length) { return { getChannelData:() => new Float32Array(length) }; }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
};
const audio = new NT.AudioManager();
check(audio.init() && audio.compressor.ratio.value === 4 && audio.compressor.threshold.value === -14, 'Audio : bus compressé modérément et initialisé');
check(await audio.suspend() && audio.context.state === 'suspended', 'Audio : suspension explicite en arrière-plan');
audio.context.resume = () => Promise.reject(new Error('NotAllowedError'));
check(!(await audio._resumeSafely()) && audio.unavailable, 'Audio : promesse de reprise rejetée absorbée sans crash');
audio.context.state = 'closed';
assert.doesNotThrow(() => audio.gun('rifle'));
check(audio.context === null && !audio.started, 'Audio fermé : effets désactivés sans exception');

function lifecycleFixture() {
  const windowEvents = {}, documentEvents = {}, canvasEvents = {}, elements = [];
  let reloads = 0, updates = 0, renders = 0, suspensions = 0;
  const element = tag => {
    const classes = new Set();
    const e = { tag, children:[], listeners:{}, classList:{ add:value => classes.add(value), remove:value => classes.delete(value), contains:value => classes.has(value) }, setAttribute() {}, append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; }, addEventListener(type, callback) { this.listeners[type] = callback; }, focus() {} };
    elements.push(e); return e;
  };
  const canvas = { getContext:() => ({}), addEventListener:(name, callback) => { canvasEvents[name] = callback; } };
  const fallback = element('div'); fallback.classList.add('hidden');
  const documentObject = { readyState:'complete', hidden:false, getElementById:id => id === 'game-canvas' ? canvas : fallback, createElement:element, addEventListener:(name, callback) => { documentEvents[name] = callback; } };
  const gameWindow = {
    location:{ reload:() => reloads++ }, addEventListener:(name, callback) => { windowEvents[name] = callback; },
    NT:{ NexusGame:class {
      constructor() {
        this.state = 'playing'; this.save = { data:{ activeRun:{nextWave:4,score:720} } };
        this.input = { keys:new Set(['KeyW']), pressed:new Set(['KeyC']), mouseButtons:new Set([0]), enabled:true, touchMode:true, mouseDX:4, mouseDY:5, wheel:1, clearVirtualInputs() {}, exitLock() {} };
        this.audio = { suspend:() => { suspensions++; } };
      }
      start() {} update() { updates++; } render() { renders++; } pause() { this.state = 'paused'; }
    } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/main.js'), 'utf8'), { window:gameWindow, document:documentObject, navigator:{}, console:{error() {}} });
  return { game:gameWindow.nexusGame, windowEvents, documentEvents, documentObject, canvasEvents, fallback, elements, counts:() => ({reloads,updates,renders,suspensions}) };
}
const life = lifecycleFixture();
life.windowEvents.blur();
check(life.game.state === 'paused' && !life.game.input.keys.size && life.counts().suspensions === 1, 'Focus : blur visible en mode tactile met réellement en pause');
life.game.state = 'playing'; life.documentObject.hidden = true; life.documentEvents.visibilitychange();
check(life.game.state === 'paused' && life.counts().suspensions === 2, 'Visibilité : onglet caché suspend le jeu et le son');
const preservedCheckpoint = JSON.stringify(life.game.save.data.activeRun);
life.game.state = 'playing'; life.canvasEvents.webglcontextlost({preventDefault() {}});
life.game.update(.1); life.game.render();
check(life.game.state === 'graphics-lost' && life.game.graphicsUnavailable && !life.game.input.enabled && life.counts().updates === 0 && life.counts().renders === 0, 'WebGL perdu : simulation et rendu effectivement gelés');
life.canvasEvents.webglcontextrestored();
check(!life.fallback.classList.contains('hidden') && life.game.graphicsUnavailable && JSON.stringify(life.game.save.data.activeRun) === preservedCheckpoint, 'WebGL restauré : pas de faux retour au jeu, checkpoint inchangé');
life.elements.find(element => element.id === 'graphics-reload').listeners.click();
check(life.counts().reloads === 1, 'WebGL : action explicite de rechargement disponible');

const handlers = {}, cacheStorage = new Map(), deleted = [];
let networkCalls = 0, offline = false, skipWaiting = 0, claims = 0, precached = [];
const origin = 'https://nexus.test';
const resolveURL = request => new URL(typeof request === 'string' ? request : request.url, origin + '/sw.js').href;
const createCache = () => ({
  values:new Map(),
  async match(request) {
    const saved = this.values.get(resolveURL(request));
    const response = saved?.clone();
    if (response && saved.redirected) Object.defineProperty(response, 'redirected', { value:true });
    return response;
  },
  async addAll(entries) { precached = [...entries]; for (const entry of entries) this.values.set(resolveURL(entry), new Response('installed-' + entry)); }
});
const swContext = vm.createContext({
  URL, Response,
  self:{ location:{href:origin + '/sw.js',origin}, addEventListener:(name, handler) => { handlers[name] = handler; }, skipWaiting:() => skipWaiting++, clients:{claim:() => claims++} },
  caches:{ open:async name => { if (!cacheStorage.has(name)) cacheStorage.set(name, createCache()); return cacheStorage.get(name); }, keys:async () => [...cacheStorage.keys()], delete:async name => { deleted.push(name); return cacheStorage.delete(name); } },
  fetch:async () => { networkCalls++; if (offline) throw new Error('offline'); return new Response('new-version-from-network'); }
});
vm.runInContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), swContext);
let installed;
handlers.install({waitUntil:promise => { installed = promise; }}); await installed;
check(precached.includes('./assets/nexus-keyart-v1.png') && fs.existsSync(path.join(root, 'assets/nexus-keyart-v1.png')), 'PWA : création originale présente dans le précache atomique');
check(skipWaiting === 0 && claims === 0, 'PWA : aucune prise de contrôle forcée des anciens onglets');
const currentCache = cacheStorage.get(vm.runInContext('CACHE_VERSION', swContext));
currentCache.values.set(origin + '/index.html', new Response('old-index'));
currentCache.values.set(origin + '/src/game/ui.js', new Response('old-ui'));
let navigation, scriptResponse;
handlers.fetch({request:{url:origin + '/',method:'GET',mode:'navigate'},respondWith:promise => { navigation = promise; }});
handlers.fetch({request:{url:origin + '/src/game/ui.js',method:'GET',mode:'cors'},respondWith:promise => { scriptResponse = promise; }});
check(await (await navigation).text() === 'old-index' && await (await scriptResponse).text() === 'old-ui' && networkCalls === 0, 'PWA : HTML et modules d’une même révision, sans mélange réseau');
const redirectedIndex = new Response('redirected-index', { status:200, headers:{ 'content-type':'text/html', 'x-shell-revision':'installed' } });
Object.defineProperty(redirectedIndex, 'redirected', { value:true });
currentCache.values.set(origin + '/index.html', redirectedIndex);
handlers.fetch({request:{url:origin + '/',method:'GET',mode:'navigate'},respondWith:promise => { navigation = promise; }});
const restoredNavigation = await navigation;
check(!restoredNavigation.redirected && restoredNavigation.status === 200 && restoredNavigation.headers.get('content-type') === 'text/html' && restoredNavigation.headers.get('x-shell-revision') === 'installed' && await restoredNavigation.text() === 'redirected-index' && networkCalls === 0, 'PWA : navigation précachée redirigée reconstruite avec contenu et en-têtes intacts sans réseau');
currentCache.values.delete(origin + '/src/game/ui.js');
handlers.fetch({request:{url:origin + '/src/game/ui.js',method:'GET',mode:'cors'},respondWith:promise => { scriptResponse = promise; }});
check((await scriptResponse).status === 503 && networkCalls === 0, 'PWA : shell incomplet refusé au lieu de mixer les révisions');
offline = true;
handlers.fetch({request:{url:origin + '/qa-cache-miss.txt',method:'GET',mode:'cors'},respondWith:promise => { scriptResponse = promise; }});
check((await scriptResponse).status === 503, 'PWA : cache-miss hors ligne contrôlé');
cacheStorage.set('nexus-of-torment-old', createCache()); cacheStorage.set('foreign-application', createCache());
let activated;
handlers.activate({waitUntil:promise => { activated = promise; }}); await activated;
check(deleted.includes('nexus-of-torment-old') && cacheStorage.has('foreign-application'), 'PWA : nettoyage limité aux caches Nexus obsolètes');

console.log('\nRésilience : ' + passed + ' contrats validés.');
