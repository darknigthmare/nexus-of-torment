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

function pass(label) { console.log(`OK  ${label}`); }
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

console.log('\nRuntime smoke réussi : 23 comportements validés.');
