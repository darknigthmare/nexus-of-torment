import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const windowObject = {};
windowObject.window = windowObject;
const context = vm.createContext({ window: windowObject, console });
for (const relative of ['src/core/math.js', 'src/core/engine.js', 'src/game/data.js', 'src/game/entities.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, relative), 'utf8'), context, { filename: relative });
}
vm.runInContext('Math.random = () => 0.5', context);

const NT = windowObject.NT;
const { Vec3 } = NT.Math;
const { Enemy } = NT.Entities;
const dummyMeshes = new Proxy({}, { get: (_, key) => ({ name: String(key) }) });
const renderer = { meshes: dummyMeshes, draw: () => {} };
const game = { renderer, wave: 10, difficulty: NT.Data.DIFFICULTIES.unstable, currentModifier: NT.Data.WAVE_MODIFIERS[0] };
let passed = 0;
function pass(label) { passed++; console.log(`OK  ${label}`); }
function snapshot(enemy, time) {
  const matrices = [];
  enemy.draw({ meshes: dummyMeshes, draw: (_mesh, matrix) => matrices.push(Array.from(matrix)) }, time);
  return matrices;
}

// These exercise the real Enemy.draw/Transform methods without a GPU. They prove
// visual transform contracts, not frame rate, raster quality or combat balance.
for (const type of Object.keys(NT.Data.ENEMIES)) {
  const enemy = new Enemy(game, type, new Vec3(2, 0, -3), { instant: true, elite: true, marked: true });
  enemy.age = 1.37;
  const first = snapshot(enemy, 7.25);
  for (let frame = 0; frame < 180; frame++) enemy.draw(renderer, 7.25);
  assert.deepEqual(snapshot(enemy, 7.25), first, `${type}: rendering the same pose must be idempotent`);
  pass(`${type}: dessin répété à temps constant sans dérive`);

  const baseScales = enemy.parts.map(part => [part.baseScale.x, part.baseScale.y, part.baseScale.z]);
  // Ten simulated minutes, sampled at 4 Hz, exercise every breathing phase.
  for (let step = 0; step <= 2400; step++) {
    const time = step / 4;
    enemy.age = time + 1.37;
    enemy.draw(renderer, time);
    for (let index = 0; index < enemy.parts.length; index++) {
      const part = enemy.parts[index];
      const [x, y, z] = baseScales[index];
      const breathing = ['torso', 'body', 'core'].includes(part.tag);
      const expectedY = y * (breathing ? 1 + Math.sin(enemy.age * 2.2 + part.phase) * .025 : 1);
      assert.ok(Math.abs(part.scale.y - expectedY) < 1e-12, `${type}/${part.tag}: bounded breathing`);
      assert.equal(part.scale.x, x);
      assert.equal(part.scale.z, z);
      assert.deepEqual([part.baseScale.x, part.baseScale.y, part.baseScale.z], baseScales[index]);
      assert.ok(Array.from(part.worldMatrix).every(Number.isFinite), `${type}/${part.tag}: finite matrix`);
    }
  }
  pass(`${type}: respiration bornée à ±2,5 % sur dix minutes simulées`);

  // Identical terminal poses must not depend on how many frames preceded them.
  let reference;
  for (const fps of [24, 60, 144]) {
    for (let frame = 0; frame < fps * 5; frame++) {
      const time = frame / fps;
      enemy.age = time + 1.37;
      enemy.draw(renderer, time);
    }
    enemy.age = 6.37;
    const terminal = snapshot(enemy, 5);
    if (reference) assert.deepEqual(terminal, reference, `${type}: frame-rate independent terminal pose`);
    reference = terminal;
  }
  pass(`${type}: même pose finale à 24, 60 et 144 images/s simulées`);
}

console.log(`\nContrats de rendu : ${passed}/${passed} contrôles réussis.`);
