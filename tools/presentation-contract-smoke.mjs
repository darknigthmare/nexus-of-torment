import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const windowObject = {};
windowObject.window = windowObject;
const context = vm.createContext({ window: windowObject, console });
for (const relative of ['src/core/math.js', 'src/core/engine.js', 'src/game/data.js', 'src/game/entities.js', 'src/game/weapons.js', 'src/game/game.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), context, { filename: relative });
}
vm.runInContext('Math.random = () => 0.5', context);
const NT = windowObject.NT;
const { Vec3 } = NT.Math;
const { Transform, Material } = NT.Engine;
const meshes = new Proxy({}, { get: (_, key) => ({ name: String(key) }) });
const noop = () => {};
let passed = 0;
function pass(label) { passed++; console.log(`OK  ${label}`); }
function near(actual, expected, tolerance = 1e-5) { assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`); }
function fixture(sectorId = 'sanctum') {
  const lights = [], draws = [], sounds = [], subtitles = [], damage = [];
  const game = Object.assign(Object.create(NT.NexusGame.prototype), {
    sectorId, state: 'playing', time: 2, currentModifier: {}, enemies: [], settings: {},
    camera: { position: new Vec3(0, 1.7, 12), forward: new Vec3(0, 0, -1), yaw: 0, pitch: 0 },
    player: { position: new Vec3(0, 0, 0), hitVelocity: new Vec3(), corruption: 0, bobTime: 0, bobAmount: 0 },
    arena: { sector: NT.Data.SECTORS[sectorId], gatePulse: .6, resolvePosition: noop, scheduleChainStrike: noop },
    renderer: {
      meshes,
      setAtmosphere: noop,
      setLight: (slot, position, color, power) => lights.push({ slot, position: [position.x, position.y, position.z], color, power }),
      draw: (mesh, matrix, material) => draws.push({ name: mesh.name, matrix: Array.from(matrix), material })
    },
    audio: { enemy: (...args) => sounds.push(args), explosion: noop },
    ui: { subtitle: (...args) => subtitles.push(args) },
    particles: { burst: noop },
    damagePlayer: amount => damage.push(amount), spawnAbilityRing: noop,
    lightA: new Vec3(), lightB: new Vec3(), lightC: new Vec3(), lightD: new Vec3(),
    bossWarningTransform: new Transform(), effectMaterials: { bossWarning: new Material({ pulse: 0 }) }
  });
  return { game, lights, draws, sounds, subtitles, damage };
}

// Method/geometry contracts only: browser QA remains responsible for pixels,
// accessibility appearance, real WebGL draw counts and hardware performance.
for (const sector of Object.values(NT.Data.SECTORS)) {
  assert.equal(sector.lighting.length, 3);
  for (const light of sector.lighting) {
    assert.ok(light.position.every(Number.isFinite));
    assert.ok(Number.isInteger(light.color) && light.color >= 0 && light.color <= 0xffffff);
    assert.ok(light.power > 0 && light.power <= 8);
  }
  const { game, lights } = fixture(sector.id);
  game._configureAtmosphereAndLights();
  assert.deepEqual(lights.map(light => light.slot), [0, 1, 2, 3]);
  sector.lighting.forEach((light, index) => {
    assert.deepEqual(lights[index + 1].position, Array.from(light.position));
    assert.equal(lights[index + 1].color, light.color);
    near(lights[index + 1].power, light.power + (index === 0 ? 3 : 0));
  });
  pass(`${sector.id}: trois sources sectorielles dans un budget total de quatre lumières`);

  lights.length = 0;
  game.enemies = [{ alive: true, boss: true, position: new Vec3(3, 4, -2) }];
  game._configureAtmosphereAndLights();
  assert.equal(lights.length, 4);
  assert.deepEqual(lights[3].position, [3, 6.4, -2]);
  assert.equal(lights[3].color, 0xff263d);
  assert.equal(lights[3].power, 8.5);
  assert.deepEqual(lights[1].position, Array.from(sector.lighting[0].position));
  pass(`${sector.id}: accent du boss remplace la quatrième lumière sans en ajouter`);
}

{
  const { game, lights } = fixture('nave');
  game.currentModifier = { id: 'blackout' };
  game._configureAtmosphereAndLights();
  assert.equal(lights[0].color, 0xb7d0d8);
  assert.equal(lights[0].power, 7.5);
  assert.equal(lights.length, 4);
  pass('Blackout: lumière joueur conservée avec éclairage sectoriel');
}

for (const phase of [1, 2, 3]) {
  const { game, draws, damage } = fixture();
  const enemy = { alive: true, type: 'gatekeeper', state: 'slamWindup', bossPhase: phase, position: new Vec3(2, 0, -3) };
  game.enemies = [enemy];
  game._drawBossTelegraphs();
  assert.equal(draws.length, 1);
  const radius = 7.5 + phase * 1.2;
  near(draws[0].matrix[0] * .5, radius);
  near(draws[0].matrix[10] * .5, radius);
  near(draws[0].matrix[12], 2);
  near(draws[0].matrix[14], -3);
  assert.equal(draws[0].name, 'torusLow');
  assert.equal(draws[0].material.pulse, 0);
  assert.equal(damage.length, 0);
  pass(`Gardien phase ${phase}: cercle stable au rayon réel avant dégâts`);

  game.player.position.set(enemy.position.x + radius + .01, 0, enemy.position.z);
  game.bossSlam(enemy.position, phase);
  assert.equal(damage.length, 0);
  game.player.position.set(enemy.position.x + radius - .01, 0, enemy.position.z);
  game.bossSlam(enemy.position, phase);
  assert.equal(damage.length, 1);
  assert.ok(damage[0] > 0);
  pass(`Gardien phase ${phase}: frontière de dégâts identique au télégraphe`);
}

{
  const { game, draws, sounds, subtitles, damage } = fixture();
  const enemy = { alive: true, type: 'gatekeeper', state: 'slamWindup', bossPhase: 1, position: new Vec3(2, 0, 4) };
  game.enemies = [enemy];
  assert.equal(game.telegraphBossSlam(enemy), true);
  assert.equal(sounds.length, 1);
  assert.equal(sounds[0][0], 'bell');
  assert.equal(sounds[0][1], enemy.position);
  assert.equal(subtitles.length, 1);
  assert.equal(damage.length, 0);
  pass('Slam: avertissement spatial et textuel sans déclencher de dégâts');

  enemy.state = 'seek';
  assert.equal(game.telegraphBossSlam(enemy), false);
  game._drawBossTelegraphs();
  enemy.state = 'slamWindup'; enemy.alive = false;
  game._drawBossTelegraphs();
  enemy.alive = true; game.state = 'victory';
  game._drawBossTelegraphs();
  assert.equal(draws.length, 0);
  assert.equal(sounds.length, 1);
  pass('Slam: pas de télégraphe résiduel après annulation, mort ou victoire');
}

for (const id of Object.keys(NT.Data.WEAPONS)) {
  const { game, draws } = fixture();
  const weapons = new NT.WeaponSystem(game);
  weapons.currentId = id; weapons.muzzleFlash = 1; weapons.cooldown = .4;
  weapons.drawViewmodel(game.renderer, 2);
  const normal = draws.splice(0);
  game.settings.reducedFlashes = true;
  weapons.drawViewmodel(game.renderer, 2);
  const reduced = draws.splice(0);
  assert.equal(reduced.length, normal.length);
  const flash = reduced.at(-1);
  assert.equal(flash.material, weapons.materials.muzzleReduced);
  assert.ok(flash.material.alpha < normal.at(-1).material.alpha * .2);
  assert.equal(flash.material.pulse, 0);
  near(Math.hypot(...flash.matrix.slice(0, 3)), Math.hypot(...normal.at(-1).matrix.slice(0, 3)) * .4);
  assert.deepEqual(reduced.slice(0, -1), normal.slice(0, -1));
  assert.equal(weapons.muzzleFlash, 1);
  assert.equal(weapons.cooldown, .4);
  pass(`${id}: flash atténué, non pulsé, arme et état de tir inchangés`);

  game.settings.reducedFlashes = false;
  weapons.drawViewmodel(game.renderer, 2);
  assert.deepEqual(draws, normal);
  pass(`${id}: rendu normal restauré immédiatement en désactivant l'option`);
}

console.log(`\nContrats de présentation : ${passed}/${passed} contrôles réussis.`);
