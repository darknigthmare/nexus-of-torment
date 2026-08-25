import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const errors = [];
const checks = [];

function pass(label, details = '') {
  checks.push({ ok: true, label, details });
}

function fail(label, details = '') {
  errors.push({ ok: false, label, details });
}

function expect(condition, label, details = '') {
  condition ? pass(label, details) : fail(label, details);
}

const requiredFiles = [
  'index.html', 'styles.css', 'package.json', 'version.json', 'server.mjs',
  'start-game.bat', 'start-game.sh', 'README.md', 'CHANGELOG.md', 'LICENSE',
  'src/core/math.js', 'src/core/engine.js', 'src/core/audio.js',
  'src/game/data.js', 'src/game/arena.js', 'src/game/entities.js',
  'src/game/weapons.js', 'src/game/ui.js', 'src/game/game.js', 'src/main.js',
  'tools/check.mjs', 'tools/audit.mjs', 'tools/runtime-smoke.mjs', 'tools/http-smoke.mjs',
  'docs/GDD.md', 'docs/TECHNICAL.md', 'docs/CODEX.md', 'docs/QA_REPORT.md', 'docs/ROADMAP.md', 'docs/QA_BROWSER_1.1.json',
  'screenshots/menu.png', 'screenshots/gameplay.png', 'screenshots/verified-gameplay.png',
  'screenshots/menu-1.1.png', 'screenshots/gameplay-1.1.png'
];

for (const relative of requiredFiles) {
  const full = path.join(root, relative);
  expect(fs.existsSync(full) && fs.statSync(full).size > 0, `Fichier requis : ${relative}`);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const versionJson = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
expect(!packageJson.dependencies && !packageJson.devDependencies, 'Projet sans dépendance npm');
expect(packageJson.version === versionJson.version, 'Versions package/version alignées', packageJson.version);

const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const localRefs = [];
const refPattern = /(?:src|href)=["']([^"']+)["']/g;
let match;
while ((match = refPattern.exec(indexSource))) {
  const reference = match[1];
  if (reference.startsWith('#') || reference.startsWith('data:') || /^(?:https?:)?\/\//i.test(reference)) continue;
  localRefs.push(reference.split(/[?#]/)[0]);
}
for (const reference of localRefs) {
  expect(fs.existsSync(path.join(root, reference)), `Ressource HTML résolue : ${reference}`);
}
expect(!/<script[^>]+src=["'](?:https?:)?\/\//i.test(indexSource), 'Aucun script externe');
expect(!/<link[^>]+href=["'](?:https?:)?\/\//i.test(indexSource), 'Aucune feuille de style externe');

const idMatches = [...indexSource.matchAll(/\bid=["']([^"']+)["']/g)].map((entry) => entry[1]);
const duplicatedIds = [...new Set(idMatches.filter((id, index) => idMatches.indexOf(id) !== index))];
expect(duplicatedIds.length === 0, 'Identifiants HTML uniques', duplicatedIds.join(', '));

const normalizedIndex = indexSource.toLocaleLowerCase('fr');
expect(indexSource.includes('1–6') && normalizedIndex.includes('<kbd>v</kbd>') && normalizedIndex.includes('mêlée'), 'Interface : six emplacements et mêlée documentés');

const context = vm.createContext({ window: {} });
const dataSource = fs.readFileSync(path.join(root, 'src/game/data.js'), 'utf8');
vm.runInContext(dataSource, context, { filename: 'src/game/data.js' });
const data = context.window.NT?.Data;
expect(Boolean(data), 'Données de jeu chargeables en isolation');

if (data) {
  const actualCounts = {
    classes: Object.keys(data.CLASSES).length,
    weapons: Object.keys(data.WEAPONS).length,
    enemyCastes: Object.keys(data.ENEMIES).length,
    waveModifiers: data.WAVE_MODIFIERS.length,
    runUpgrades: data.UPGRADES.length,
    metaUpgrades: Object.keys(data.META_UPGRADES).length,
    difficultyLevels: Object.keys(data.DIFFICULTIES).length
  };
  for (const [key, actual] of Object.entries(actualCounts)) {
    const expected = versionJson.content[key];
    expect(actual === expected, `Inventaire ${key}`, `${actual}/${expected}`);
  }
  const stationCount = Object.values(data.STATIONS).reduce((sum, station) => sum + (station.instances || 1), 0);
  expect(stationCount === versionJson.content.stations, 'Inventaire stations', `${stationCount}/${versionJson.content.stations}`);

  const weaponSlots = Object.values(data.WEAPONS).map((weapon) => weapon.slot);
  expect(new Set(weaponSlots).size === weaponSlots.length, 'Emplacements d’armes uniques');
  expect(Object.values(data.WEAPONS).every((weapon) => weapon.damage > 0 && weapon.magazine > 0 && weapon.reserve >= 0), 'Arsenal correctement paramétré');
  expect(Object.values(data.ENEMIES).filter((enemy) => enemy.boss).length >= 2, 'Roster de boss distincts');
  expect(Object.values(data.ENEMIES).filter((enemy) => !enemy.boss).every((enemy) => enemy.cost > 0 && enemy.weight > 0), 'Castes standards compatibles avec le directeur de vagues');
  expect(Boolean(data.WEAPONS.chainlance?.special && data.WEAPONS.exorcist?.special), 'Armes rituelles dotées de mécaniques spéciales');

  const allIds = [
    ...Object.values(data.CLASSES).map((item) => item.id),
    ...Object.values(data.WEAPONS).map((item) => item.id),
    ...Object.values(data.ENEMIES).map((item) => item.id),
    ...data.WAVE_MODIFIERS.map((item) => item.id),
    ...data.UPGRADES.map((item) => item.id),
    ...Object.values(data.META_UPGRADES).map((item) => item.id)
  ];
  expect(allIds.every(Boolean), 'Tous les contenus possèdent un identifiant');
}

for (const item of checks) {
  console.log(`OK  ${item.label}${item.details ? ` — ${item.details}` : ''}`);
}
for (const item of errors) {
  console.error(`ERR ${item.label}${item.details ? ` — ${item.details}` : ''}`);
}

if (errors.length) {
  console.error(`\nAudit échoué : ${errors.length} anomalie(s).`);
  process.exit(1);
}

console.log(`\nAudit réussi : ${checks.length} contrôles validés.`);
