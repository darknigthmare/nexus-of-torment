import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const files = [
  'src/core/math.js',
  'src/core/engine.js',
  'src/core/audio.js',
  'src/game/data.js',
  'src/game/arena.js',
  'src/game/entities.js',
  'src/game/weapons.js',
  'src/game/ui.js',
  'src/game/game.js',
  'src/main.js'
];
let failed = false;
for (const relative of files) {
  const full = path.join(root, relative);
  const source = fs.readFileSync(full, 'utf8');
  try {
    new vm.Script(source, { filename: relative });
    console.log(`OK  ${relative}`);
  } catch (error) {
    failed = true;
    console.error(`ERR ${relative}\n${error.stack}`);
  }
}
if (failed) process.exit(1);
console.log('Tous les fichiers JavaScript sont syntaxiquement valides.');
