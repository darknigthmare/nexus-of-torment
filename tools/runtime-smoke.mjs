import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const windowObject = {};
windowObject.window = windowObject;
const context = vm.createContext({
  window: windowObject,
  console,
  setTimeout,
  clearTimeout,
  structuredClone,
  performance: { now: () => 0 },
  localStorage: { getItem: () => null, setItem: () => {} }
});

for (const relative of [
  'src/core/math.js',
  'src/core/engine.js',
  'src/game/data.js',
  'src/game/arena.js',
  'src/game/entities.js',
  'src/game/weapons.js',
  'src/game/game.js'
]) {
  vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), context, { filename: relative });
}
vm.runInContext('Math.random = () => 0.5', context);

const NT = context.window.NT;
const { Vec3 } = NT.Math;
const { Enemy } = NT.Entities;
const dummyMeshes = new Proxy({}, { get: (_, key) => ({ name: String(key) }) });
const noop = () => {};
const events = {
  arcs: 0,
  tracers: 0,
  projectiles: [],
  chainStrikes: [],
  spawned: [],
  announcements: 0,
  corruption: 0,
  slow: 0,
  kills: 0
};

const input = {
  pointerLocked: true,
  mouseDX: 0,
  mouseDY: 0,
  wheel: 0,
  mouse: () => false,
  consume: () => false,
  consumeMouse: () => false
};
const player = {
  position: new Vec3(0, 0, 10),
  velocity: new Vec3(),
  radius: .42,
  corruption: .8,
  classId: 'occultist',
  grenades: 2,
  maxGrenades: 2,
  unlockedWeapons: new Set(Object.keys(NT.Data.WEAPONS)),
  modifiers: {
    magazineMul: 1,
    fireRateMul: 1,
    reloadMul: 1,
    spreadMul: 1,
    recoilMul: 1,
    damageMul: 1,
    headMul: 1,
    penetration: 0,
    lifesteal: 0,
    chainChance: 0,
    chainDamage: .38,
    ruptureChance: 0,
    lowHealthDamage: 0
  },
  damageMultiplier: () => 1,
  fireRateMultiplier: () => 1,
  reloadMultiplier: () => 1,
  addRecoil: noop,
  shake: noop,
  heal: noop,
  addCorruption: amount => { events.corruption += amount; },
  slow: (amount, duration) => { events.slow = Math.max(events.slow, amount * duration); },
  dead: false
};
const game = {
  wave: 1,
  state: 'playing',
  waveActive: true,
  difficulty: NT.Data.DIFFICULTIES.unstable,
  currentModifier: NT.Data.WAVE_MODIFIERS[0],
  renderer: { meshes: dummyMeshes },
  camera: { yaw: 0, pitch: 0, position: new Vec3(0, 1.72, 10) },
  input,
  player,
  enemies: [],
  projectiles: [],
  stats: { shots: 0, hits: 0, damage: 0, headshots: 0 },
  arena: {
    raycastWorld: (_origin, _direction, range) => ({ hit: false, distance: range }),
    lineBlocked: () => false,
    resolvePosition: () => false,
    scheduleChainStrike: position => events.chainStrikes.push(position.clone())
  },
  audio: {
    ui: noop, gun: noop, hit: noop, melee: noop, dryFire: noop, reload: noop,
    enemy: noop, boss: noop
  },
  particles: { burst: noop, spawn: noop },
  ui: { hitmarker: noop, announce: () => { events.announcements++; }, toast: noop },
  spawnTracer: () => { events.tracers++; },
  spawnArc: () => { events.arcs++; },
  spawnAbilityRing: noop,
  spawnEnemyProjectile: (_owner, type) => { events.projectiles.push(type); },
  damagePlayer: noop,
  killEnemy: enemy => { enemy.alive = false; events.kills++; },
  spawnEnemy: type => { events.spawned.push(type); return { alive: true, type }; }
};

let passed = 0;
function pass(label) { passed++; console.log(`OK  ${label}`); }
function check(condition, label) { assert.ok(condition, label); pass(label); }

// L’arène doit réellement instancier les quatre armureries, pas seulement les déclarer dans les données.
const arena = new NT.Arena({ renderer: { meshes: dummyMeshes } });
check(arena.stations.length === 7, 'Arène : sept stations physiques');
check(arena.stations.some(station => station.weapon === 'chainlance'), 'Arène : station Vesper présente');
check(arena.stations.some(station => station.weapon === 'exorcist'), 'Arène : station Sanctificateur présente');

// Le directeur de vague alterne les boss comme prévu.
const queue5 = NT.NexusGame.prototype._buildWaveQueue.call({ wave: 5, difficulty: NT.Data.DIFFICULTIES.unstable });
const queue10 = NT.NexusGame.prototype._buildWaveQueue.call({ wave: 10, difficulty: NT.Data.DIFFICULTIES.unstable });
check(queue5[0]?.type === 'gatekeeper', 'Directeur : Gardien du Seuil à la vague 5');
check(queue10[0]?.type === 'archdeacon', 'Directeur : Archidiacre des Nerfs à la vague 10');
check(queue10.every(entry => NT.Data.ENEMIES[entry.type]), 'Directeur : chaque entrée de vague est résolue');

// L’Écorché réduit bien les tirs frontaux mais pas ceux qui arrivent de dos.
game.wave = 5;
const armored = new Enemy(game, 'flayed', new Vec3(0, 0, 5), { instant: true });
armored.yaw = 0;
const front = armored.takeDamage(100, { zone: 'body', headMultiplier: 1, direction: new Vec3(0, 0, -1) }).damage;
const rear = armored.takeDamage(100, { zone: 'body', headMultiplier: 1, direction: new Vec3(0, 0, 1) }).damage;
check(front < rear && Math.abs(front - 42) < .001, 'Écorché : reliquaire frontal fonctionnel');

// Les deux nouvelles armes doivent déclencher leur mécanique sur une cible réelle.
game.wave = 1;
const target = new Enemy(game, 'flayed', new Vec3(0, 0, 5), { instant: true });
target.yaw = Math.PI;
target.stunTimer = 0;
game.enemies = [target];
const weapons = new NT.WeaponSystem(game);
game.weapons = weapons;
weapons.reset({});
for (const id of Object.keys(NT.Data.WEAPONS)) weapons.ensureWeapon(id);
const beforePullZ = target.position.z;
weapons.switchTo('chainlance', true);
weapons.switchTimer = 0;
weapons.cooldown = 0;
check(weapons.fire(), 'Vesper : tir accepté');
check(target.position.z > beforePullZ && target.slowTimer > 0, 'Vesper : attraction et entrave appliquées');
check(events.arcs > 0, 'Vesper : arc de chaîne généré');

weapons.switchTo('exorcist', true);
weapons.switchTimer = 0;
weapons.cooldown = 0;
check(weapons.fire(), 'Sanctificateur : tir accepté');
check(target.burnTimer > 0 && target.burnDps > 0, 'Sanctificateur : brûlure purificatrice appliquée');
const healthBeforeBurn = target.health;
target.update(.3);
check(target.health < healthBeforeBurn, 'Sanctificateur : dégâts persistants appliqués');

// La mêlée V doit toucher une cible proche et appliquer un étourdissement.
const meleeTarget = new Enemy(game, 'sutured', new Vec3(0, 0, 8.2), { instant: true });
game.enemies = [meleeTarget];
weapons.meleeCooldown = 0;
weapons.switchTimer = 0;
const meleeHealth = meleeTarget.health;
check(weapons.melee(), 'Mêlée : action acceptée');
check(meleeTarget.health < meleeHealth && meleeTarget.stunTimer > 0, 'Mêlée : dégâts et étourdissement appliqués');

// Le second boss doit exposer une hitbox cohérente avec son modèle suspendu et utiliser son kit.
game.wave = 10;
events.projectiles.length = 0;
events.chainStrikes.length = 0;
events.spawned.length = 0;
const boss = new Enemy(game, 'archdeacon', new Vec3(0, 0, 0), { instant: true });
boss.position.y = 4.8;
boss.attackTimer = 0;
boss.abilityTimer = 0;
boss.summonTimer = 0;
const headRay = boss.raycast(new Vec3(0, 6.35, 10), new Vec3(0, 0, -1), 30);
check(headRay.hit && headRay.zone === 'head', 'Archidiacre : hitbox de tête alignée au modèle');
boss.update(.1);
check(events.projectiles.includes('corruption'), 'Archidiacre : projectile psychique déclenché');
check(events.chainStrikes.length === 2, 'Archidiacre : condamnations de zone en phase 1');
check(events.corruption > 0 && events.slow > 0, 'Archidiacre : Souillure et ralentissement appliqués');
boss.health = boss.maxHealth * .30;
boss.abilityTimer = 0;
boss.summonTimer = 0;
boss.update(.1);
check(boss.bossPhase === 3 && events.spawned.includes('twin') && events.spawned.includes('confessor'), 'Archidiacre : transition et renforts de phase 3');
check(events.chainStrikes.length >= 6, 'Archidiacre : pression de zone renforcée en phase 3');

check(weapons.visuals.chainlance.parts.length > 5 && weapons.visuals.exorcist.parts.length > 5, 'Viewmodels : nouvelles armes assemblées');
check(events.tracers >= 2, 'Effets : traceurs produits par les armes rituelles');

// Les checkpoints de campagne sont strictement validés et bornés avant toute restauration.
const validCheckpoint = NT.NexusGame.prototype._validateActiveRun.call(NT.NexusGame.prototype, {
  version: 1,
  classId: 'bulwark',
  difficultyId: 'unstable',
  modeId: 'campaign',
  sectorId: 'sanctum',
  nextWave: 77,
  score: 1200,
  stats: { wavesCleared: 4, kills: 30 },
  player: {
    maxHealth: 125, health: 90, maxArmor: 80, armor: 40, corruption: .2, essence: 300,
    maxGrenades: 2, grenades: 1, unlockedWeapons: ['rifle'],
    modifiers: { damageMul: 999, lastRite: true },
    upgradeStacks: {}
  },
  weapons: { currentId: 'rifle', states: { rifle: { mag: 20, reserve: 90, maxReserve: 180 } } }
});
check(validCheckpoint?.nextWave === 10 && validCheckpoint.player.modifiers.damageMul === 20, 'Checkpoint : campagne et statistiques bornées');
check(NT.NexusGame.prototype._validateActiveRun.call(NT.NexusGame.prototype, { version: 1, classId: 'inconnu' }) === null, 'Checkpoint : données invalides rejetées');

const naveCheckpoint = {
  version: 1,
  classId: 'bulwark',
  difficultyId: 'unstable',
  modeId: 'campaign',
  sectorId: 'nave',
  nextWave: 4,
  score: 2100,
  runTime: 180,
  stats: { wavesCleared: 3, kills: 24 },
  player: {
    maxHealth: 125, health: 91, maxArmor: 80, armor: 33, corruption: .18, essence: 410,
    maxGrenades: 2, grenades: 1, abilityCooldown: 4.5,
    position: { x: 0, y: 0, z: 29 }, yaw: Math.PI,
    unlockedWeapons: ['rifle','shotgun'],
    modifiers: { damageMul: 1, magazineMul: 1 },
    upgradeStacks: {}
  },
  weapons: {
    currentId: 'rifle',
    states: {
      rifle: { mag: 19, reserve: 102, maxReserve: 180 },
      shotgun: { mag: 6, reserve: 38, maxReserve: 56 }
    }
  }
};
const validatedNaveCheckpoint = NT.NexusGame.prototype._validateActiveRun.call(NT.NexusGame.prototype, naveCheckpoint);
check(validatedNaveCheckpoint?.player.position.z === 29, 'Checkpoint : bornes longitudinales de la Nef conservées');

const resumeCamera = { yaw:0, pitch:0, position:new Vec3(), shake:new Vec3() };
const resumeHost = {
  renderer: { meshes: dummyMeshes },
  camera: resumeCamera,
  save: { data: { activeRun:naveCheckpoint, meta:{} }, save: () => true },
  audio: { init: noop },
  ui: { toast: noop, enterGame: noop, announce: noop },
  input: { requestLock: noop },
  particles: { clear: noop },
  enemies: [], projectiles: [], pickups: [], tracers: [], arcs: [], rings: [], hallucinations: [],
  spawnQueue: [],
  _newStats: NT.NexusGame.prototype._newStats,
  _validateActiveRun: NT.NexusGame.prototype._validateActiveRun,
  _beginIntermission(duration) { this.intermissionActive = true; this.intermissionDurationObserved = duration; }
};
resumeHost.player = new NT.Entities.Player(resumeHost);
resumeHost.arena = new NT.Arena(resumeHost);
resumeHost.weapons = new NT.WeaponSystem(resumeHost);
const resumedNave = NT.NexusGame.prototype.resumeSavedRun.call(resumeHost);
check(
  resumedNave && resumeHost.arena.currentSectorId === 'nave' &&
  resumeHost.player.position.z === 29 &&
  resumeHost.arena._positionClear(resumeHost.player.position, resumeHost.player.radius),
  'Reprise : position de la Nef restaurée en zone sûre'
);

// Le boss de la vague 10 ouvre une extraction tenue, qui seule produit la victoire.
let extractionOutcome = null;
const extractionHost = {
  modeId: 'campaign', sectorId: 'sanctum', wave: 10, waveActive: true,
  spawnQueue: [{ type: 'sutured' }], spawnsRemaining: 1,
  extractionActive: false, extractionProgress: 0, extractionDuration: 3.2, extractionZone: null,
  waveObjective: null, score: 0, stats: { wavesCleared: 0 },
  player: { position: new Vec3(0, 0, 10) },
  arena: { setObjectiveZone: noop, triggerGatePulse: noop },
  ui: { announce: noop, subtitle: noop },
  input: { exitLock: noop },
  audio: { wave: noop },
  _extractionPosition: NT.NexusGame.prototype._extractionPosition,
  _clearActiveRun: noop,
  _finalizeRun: outcome => { extractionOutcome = outcome; }
};
check(NT.NexusGame.prototype._beginExtraction.call(extractionHost) && extractionHost.extractionActive && extractionHost.spawnQueue.length === 0, 'Campagne : extraction ouverte après le boss final');
extractionHost.player.position.copy(extractionHost.extractionZone.position);
NT.NexusGame.prototype._updateExtraction.call(extractionHost, 3.3);
check(extractionOutcome === 'victory' && extractionHost.stats.wavesCleared === 1 && !extractionHost.waveActive, 'Campagne : tenue du sceau produit la victoire');

// La poursuite sans fin conserve le build du survivant, mais aucun danger de la vague 10.
let endlessArenaReset = false;
let endlessParticlesCleared = false;
const preservedWeaponState = { mag: 7, reserve: 31, maxReserve: 36 };
const endlessHost = {
  state: 'victory', modeId: 'campaign', sectorId: 'nave', wave: 10, runFinalized: true,
  score: 9200, runTime: 480, stats: { wavesCleared: 10, kills: 88 },
  killStreak: 12, killStreakTimer: 2.4, waveActive: true, pendingUpgrade: false,
  intermissionActive: false, waveCompleteTimer: 0, spawnQueue: [{ type: 'sutured' }],
  spawnsRemaining: 1, spawnTimer: .3, chainStormTimer: 1, waveObjective: { type: 'boss' },
  extractionActive: false, extractionProgress: 3.2, extractionZone: {}, currentModifier: null,
  enemies: [{ alive: true }], projectiles: [{}], pickups: [{}], tracers: [{}],
  arcs: [{}], rings: [{}], hallucinations: [{}],
  player: {
    dead: false, health: 37, essence: 640,
    velocity: new Vec3(2, 0, 1), hitVelocity: new Vec3(3, 0, 0),
    hookTimer: .8, slowTimer: 1.2, slowAmount: .4
  },
  weapons: { states: { chainlance: preservedWeaponState } },
  particles: { clear: () => { endlessParticlesCleared = true; } },
  arena: {
    hazards: [{}],
    reset() { endlessArenaReset = true; this.hazards.length = 0; },
    setObjectiveZone: noop
  },
  ui: { enterGame: noop },
  input: { requestLock: noop },
  _newStats: NT.NexusGame.prototype._newStats,
  _beginIntermission(duration) { this.intermissionActive = true; this.intermissionDurationObserved = duration; }
};
const continuedEndless = NT.NexusGame.prototype.continueEndless.call(endlessHost);
check(
  continuedEndless && endlessArenaReset && endlessParticlesCleared && endlessHost.arena.hazards.length === 0 &&
  ['enemies','projectiles','pickups','tracers','arcs','rings','hallucinations'].every(key => endlessHost[key].length === 0) &&
  endlessHost.spawnQueue.length === 0,
  'Endless : menaces et effets de campagne purgés'
);
check(
  endlessHost.player.health === 37 && endlessHost.player.essence === 640 &&
  endlessHost.weapons.states.chainlance === preservedWeaponState && endlessHost.sectorId === 'nave' &&
  endlessHost.wave === 10 && endlessHost.intermissionDurationObserved === 12,
  'Endless : survivant, arsenal et secteur conservés'
);

// Une apparition encore invulnérable ne doit plus absorber le tir destiné à une cible valide derrière elle.
game.wave = 4;
const spawningShield = new Enemy(game, 'grinder', new Vec3(0, 0, 8.2));
const validRearTarget = new Enemy(game, 'grinder', new Vec3(0, 0, 5.5), { instant: true });
game.enemies = [spawningShield, validRearTarget];
weapons.switchTo('rifle', true);
weapons.switchTimer = 0;
weapons.cooldown = 0;
const shieldHealth = spawningShield.health;
const rearHealth = validRearTarget.health;
weapons.fire();
check(spawningShield.health === shieldHealth && validRearTarget.health < rearHealth, 'Tir : apparition invulnérable ignorée sans protéger la cible arrière');

// Les invocations de boss respectent le plafond global du directeur.
let bypassedCap = false;
const cappedHost = {
  wave: 10,
  enemies: Array.from({ length: 24 }, () => ({ alive: true, summonedByBoss: false })),
  _enemyCap: () => 24,
  spawnEnemy: () => { bypassedCap = true; }
};
check(NT.NexusGame.prototype.spawnBossAdd.call(cappedHost, 'sutured', { bossPhase: 3 }) === null && !bypassedCap, 'Boss : invocations bloquées au plafond global');

// Le watchdog doit sauver un tireur réellement coincé, sans casser une attaque télégraphiée.
function watchdogEnemy(state) {
  return {
    alive:true, boss:false, state, spawnTimer:0, stunTimer:0,
    watchdogTimer:0, stuckTimer:0,
    position:new Vec3(0,0,0), watchdogPosition:new Vec3(0,0,0), velocity:new Vec3(),
    radius:.55, height:2,
    config:{ flying:false, attackRange:24, emissive:0xb84b91 }
  };
}
const blockedRanged = watchdogEnemy('seek');
const telegraphedWindup = watchdogEnemy('slamWindup');
const watchdogHost = {
  enemies:[blockedRanged, telegraphedWindup],
  player:{ position:new Vec3(0,0,10), radius:.42 },
  camera:{ position:new Vec3(0,1.72,10) },
  arena:{
    lineBlocked:() => true,
    getSpawnPoint:() => new Vec3(20,0,20)
  },
  spawnAbilityRing:noop
};
for(let index=0;index<4;index++) NT.NexusGame.prototype._updateEnemyWatchdog.call(watchdogHost,.8);
check(
  blockedRanged.position.x === 20 && blockedRanged.position.z === 20 &&
  telegraphedWindup.position.x === 0 && telegraphedWindup.position.z === 0 &&
  telegraphedWindup.stuckTimer === 0,
  'Watchdog : tireur bloqué replacé, vraie préparation préservée'
);

// Contrats de progression : méthodes runtime réelles, interfaces audio/UI/rendu neutralisées.
// Les éliminations sont injectées : cette suite ne constitue pas un test d’équilibrage ou de FPS.
function progressionHost(difficultyId = 'unstable') {
  const host = Object.create(NT.NexusGame.prototype);
  const pressed = new Set();
  const observed = { saves:0, locks:0, upgrades:null, results:[] };
  Object.assign(host, {
    state:'playing', modeId:'campaign', sectorId:'sanctum', wave:0, waveActive:false,
    pendingUpgrade:false, intermissionActive:false, extractionActive:false,
    runFinalized:false, runTime:120, score:0, killStreak:0, killStreakTimer:0,
    lastClassId:'bulwark', lastDifficultyId:difficultyId,
    difficulty:NT.Data.DIFFICULTIES[difficultyId], currentModifier:NT.Data.WAVE_MODIFIERS[0],
    intermissionDuration:20, stats:NT.NexusGame.prototype._newStats(),
    renderer:{ meshes:dummyMeshes }, settings:{ gore:false },
    camera:{ yaw:0, pitch:0, position:new Vec3(), shake:new Vec3(), forward:new Vec3(0,0,-1) },
    enemies:[], projectiles:[], pickups:[], spawnQueue:[],
    audio:{ wave:noop, enemy:noop, ui:noop },
    particles:{ burst:noop, clear:noop }, spawnAbilityRing:noop,
    ui:{
      announce:noop, subtitle:noop, toast:noop,
      showUpgrades:options => { observed.upgrades = options; },
      showGameOver:result => observed.results.push(result),
      showVictory:result => observed.results.push(result)
    },
    input:{
      ready:true, consume:code => pressed.delete(code),
      combatReady() { return this.ready; },
      requestLock:() => { observed.locks++; }, exitLock:noop
    },
    save:{
      data:{ shards:11, records:{}, codex:{ enemyKills:{} }, meta:{}, activeRun:null },
      save:() => { observed.saves++; return true; }
    },
    observed, pressed
  });
  host.arena = new NT.Arena(host);
  host.player = new NT.Entities.Player(host);
  host.player.reset('bulwark');
  host.weapons = new NT.WeaponSystem(host);
  host.weapons.reset({});
  return host;
}

function eliminateCurrentEnemies(host) {
  for (const enemy of [...host.enemies]) {
    // Fixture : l’apparition est terminée, puis la vraie chaîne takeDamage -> killEnemy s’exécute.
    enemy.spawnTimer = 0;
    enemy.takeDamage(enemy.health + 1, { zone:'body', source:'contract-test' });
  }
  host._updateEntities(.01, false);
}

for (const difficultyId of Object.keys(NT.Data.DIFFICULTIES)) {
  const host = progressionHost(difficultyId);
  host.startNextWave();
  for (const [index, type] of ['purge','hold','hunt'].entries()) {
    assert.equal(host.wave, index + 1);
    assert.equal(host.waveObjective.type, type);
    assert.ok(host.spawnQueue.length > 0);
    assert.equal(host._canCompleteWave(), false);
    if (type === 'hold') host.player.position.copy(host.waveObjective.position);
    if (type === 'hunt') {
      assert.equal(host.spawnQueue.filter(entry => entry.marked).length, host.waveObjective.target);
    }
    let ticks = 0;
    while (host.waveActive && ticks++ < 200) {
      host._updateWaveObjective(.5);
      host._updateWaveDirector(.5);
      eliminateCurrentEnemies(host);
    }
    check(
      ticks < 200 && !host.waveActive && host.pendingUpgrade &&
      host.stats.wavesCleared === index + 1 && host.enemies.length === 0 &&
      (type === 'purge' || host.waveObjective.phase === 'cleanup'),
      'Progression ' + difficultyId + ' : ' + type + ' rejoint les greffes sans blocage'
    );
    const clearedScore = host.score;
    host._completeWave();
    assert.equal(host.score, clearedScore, 'Une vague déjà terminée ne doit pas payer deux fois');
    if (type !== 'hunt') {
      host._updateWaveDirector(2.2);
      assert.equal(host.state, 'upgrade');
      assert.ok(host.observed.upgrades.length >= 1);
      host.applyUpgrade(host.observed.upgrades[0]);
      assert.equal(host.state, 'playing');
      assert.equal(host.intermissionActive, true);
      assert.equal(host.save.data.activeRun.nextWave, index + 2);
      host.pressed.add('Enter');
      host._updateIntermission(.7);
    }
  }
  check(
    host.stats.wavesCleared === 3 && host.stats.kills > 0 && host.score > 0 && host.observed.saves >= 4,
    'Progression ' + difficultyId + ' : purge -> greffe -> préparation -> maintien -> chasse'
  );
}

const holdHost = progressionHost();
holdHost.wave = 1;
holdHost.startNextWave();
holdHost.spawnQueue.length = 0;
holdHost.spawnsRemaining = 0;
holdHost.waveObjective.progress = 2;
holdHost.player.position.copy(holdHost.waveObjective.position).add(new Vec3(20,0,0));
holdHost._updateWaveObjective(1);
check(
  Math.abs(holdHost.waveObjective.progress - 1.55) < 1e-9 && !holdHost._canCompleteWave(),
  'Maintien : sortie du sceau réduit la progression sans terminer une arène vide'
);
holdHost.player.position.copy(holdHost.waveObjective.position);
holdHost._updateWaveObjective(holdHost.waveObjective.duration);
check(
  holdHost.waveObjective.phase === 'cleanup' && holdHost.spawnQueue.length === 0 &&
  holdHost.enemies.some(enemy => enemy.alive) && !holdHost._canCompleteWave(),
  'Maintien : sceau stabilisé exige encore la purge des survivants'
);
eliminateCurrentEnemies(holdHost);
check(holdHost._canCompleteWave(), 'Maintien : la dernière élimination débloque la vague stabilisée');

const huntHost = progressionHost();
huntHost.wave = 2;
huntHost.startNextWave();
huntHost.spawnQueue.length = 0;
huntHost.spawnsRemaining = 0;
huntHost._updateWaveObjective(4.1);
const replacementMarked = huntHost.enemies[0];
check(
  replacementMarked instanceof Enemy && replacementMarked.objectiveMarked && !huntHost._canCompleteWave(),
  'Chasse : une marque manquante fait apparaître un vrai renfort marqué'
);
huntHost._updateWaveObjective(4.1);
check(huntHost.enemies.length === 1, 'Chasse : une marque vivante empêche le renfort de secours en double');
const remainingBeforeKill = huntHost.waveObjective.remaining;
replacementMarked.spawnTimer = 0;
replacementMarked.takeDamage(replacementMarked.health + 1, { zone:'body' });
const markedKillCount = huntHost.stats.kills;
replacementMarked.takeDamage(1000, { zone:'body' });
check(
  huntHost.waveObjective.remaining === remainingBeforeKill - 1 && huntHost.stats.kills === markedKillCount,
  'Chasse : mort réelle décrémente la marque une seule fois'
);
huntHost._updateEntities(.01, false);
huntHost.spawnQueue.push({ type:'sutured', marked:true });
huntHost._updateWaveObjective(4.1);
check(huntHost.enemies.length === 0, 'Chasse : une marque déjà en file empêche le renfort de secours');
huntHost.spawnQueue.length = 0;
huntHost.enemies = Array.from({ length:huntHost._enemyCap() }, () => ({ alive:true }));
check(huntHost._spawnObjectiveReinforcement(true) === null, 'Objectifs : les renforts respectent le plafond global');
huntHost.enemies.length = 0;
huntHost._updateWaveObjective(4.1);
eliminateCurrentEnemies(huntHost);
huntHost._updateWaveObjective(.1);
check(
  huntHost.waveObjective.remaining === 0 && huntHost.waveObjective.phase === 'cleanup' && huntHost._canCompleteWave(),
  'Chasse : le renfort de secours ouvre réellement la fin de vague'
);

const intermissionHost = progressionHost();
intermissionHost.wave = 3;
intermissionHost._beginIntermission(1);
check(
  intermissionHost.intermissionTimer === 5 && intermissionHost.save.data.activeRun.nextWave === 4 &&
  intermissionHost.save.data.activeRun.classId === 'bulwark' && intermissionHost.observed.saves === 1,
  'Intermission : minimum cinq secondes et checkpoint réel de la prochaine vague'
);
intermissionHost.pressed.add('Enter');
intermissionHost._updateIntermission(.1);
check(intermissionHost.intermissionActive && intermissionHost.wave === 3, 'Intermission : délai anti-clic initial respecté');
intermissionHost.input.ready = false;
intermissionHost._updateIntermission(.6);
check(
  intermissionHost.intermissionActive && intermissionHost.wave === 3 && intermissionHost.observed.locks === 1,
  'Intermission : demande de capture sans lancer la vague si le combat est indisponible'
);
intermissionHost.input.ready = true;
intermissionHost.pressed.add('KeyF');
intermissionHost._updateIntermission(.01);
check(
  !intermissionHost.intermissionActive && intermissionHost.wave === 4 && intermissionHost.waveActive &&
  intermissionHost.save.data.activeRun.nextWave === 4,
  'Intermission : F démarre une seule vague dès que le contrôle tactile/clavier est prêt'
);
check(
  intermissionHost._startWaveFromIntermission() === false && intermissionHost.wave === 4,
  'Intermission : un second déclenchement ne saute aucune vague'
);
const autoHost = progressionHost();
autoHost.wave = 3;
autoHost._beginIntermission();
assert.equal(autoHost.intermissionTimer, 20);
autoHost._updateIntermission(20.1);
check(
  autoHost.wave === 4 && autoHost.waveActive && !autoHost.intermissionActive && autoHost.observed.locks === 1,
  'Intermission : expiration des vingt secondes déclenche automatiquement la vague'
);

for (const [outcome, expectedShards, expectedState] of [
  ['death',6,'gameover'], ['victory',14,'victory'], ['abandon',0,'playing']
]) {
  const host = progressionHost();
  host.wave = 5;
  host.score = 8000;
  Object.assign(host.stats, { wavesCleared:4, bossKills:1, kills:9, headshots:3, damage:450 });
  host.save.data.activeRun = { nextWave:5 };
  const result = host._finalizeRun(outcome, outcome !== 'abandon');
  check(
    result.outcome === outcome && result.shards === expectedShards && host.save.data.shards === 11 + expectedShards &&
    result.sectors === (outcome === 'victory' ? 1 : 0) && host.state === expectedState &&
    host.save.data.activeRun === null && host.save.data.records.lifetimeKills === 9 &&
    host.save.data.records.bossKills === 1 && host.save.data.records.playTime === 120,
    'Bilan ' + outcome + ' : récompense exacte, records conservés et checkpoint supprimé'
  );
  const persisted = JSON.stringify(host.save.data);
  const duplicate = host._finalizeRun(outcome === 'victory' ? 'death' : 'victory', true);
  check(
    duplicate === undefined && JSON.stringify(host.save.data) === persisted && host.observed.saves === 1 &&
    host.observed.results.length === (outcome === 'abandon' ? 0 : 1),
    'Bilan ' + outcome + ' : double finalisation sans paiement ni écran supplémentaire'
  );
}
const emptyDeath = progressionHost();
const emptyDeathResult = emptyDeath._finalizeRun('death');
check(emptyDeathResult.shards === 0 && emptyDeath.save.data.shards === 11, 'Bilan : mourir avant une vague terminée ne génère aucun éclat');

console.log('\nRuntime smoke réussi : ' + passed + ' comportements validés.');
