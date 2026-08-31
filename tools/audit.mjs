import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const errors = [];
const checks = [];
const releaseAudit = process.argv.includes('--release');

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
  'manifest.webmanifest', 'sw.js', 'icons/nexus-icon.svg',
  'start-game.bat', 'start-game.sh', 'README.md', 'CHANGELOG.md', 'LICENSE',
  'src/core/math.js', 'src/core/engine.js', 'src/core/audio.js',
  'src/game/data.js', 'src/game/arena.js', 'src/game/entities.js',
  'src/game/weapons.js', 'src/game/ui.js', 'src/game/game.js', 'src/main.js',
  'tools/check.mjs', 'tools/audit.mjs', 'tools/runtime-smoke.mjs', 'tools/http-smoke.mjs', 'tools/build.mjs', 'tools/browser-qa.mjs',
  '.github/workflows/ci.yml', 'assets/nexus-keyart-v1.png', 'docs/ASSET_PROVENANCE.md',
  'tools/combat-contract-smoke.mjs', 'tools/render-contract-smoke.mjs', 'tools/presentation-contract-smoke.mjs',
  'tools/resilience-contract-smoke.mjs', 'tools/ui-contract-smoke.mjs',
  'tools/input-contract-smoke.mjs', 'tools/storage-pwa-contract-smoke.mjs', 'tools/gameplay-polish-contract-smoke.mjs',
  'tools/browser-bindings-audit.mjs', 'tools/browser-storage-audit.mjs', 'tools/browser-shell-audit.mjs',
  'docs/GAMEPLAY_POLISH_1.2.1.md',
  'src/game/story.js', 'src/game/progression.js',
  'tools/story-data-smoke.mjs', 'tools/progression-contract-smoke.mjs', 'tools/story-gameplay-smoke.mjs', 'tools/browser-story-audit.mjs', 'docs/STORY_CANON.md',
  'tools/browser-story-storage-audit.mjs',
  'tools/browser-upgrade-storage-audit.mjs', 'docs/CONTENT_AUDIT_1.3.md',
  'tools/browser-product-audit.mjs', 'tools/build-smoke.mjs', 'tools/production-smoke.mjs',
  'docs/GDD.md', 'docs/TECHNICAL.md', 'docs/CODEX.md', 'docs/QA_REPORT.md', 'docs/ROADMAP.md'
];

for (const relative of requiredFiles) {
  const full = path.join(root, relative);
  expect(fs.existsSync(full) && fs.statSync(full).size > 0, `Fichier requis : ${relative}`);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const versionJson = JSON.parse(fs.readFileSync(path.join(root, 'version.json'), 'utf8'));
const runtimeDependencies = Object.keys(packageJson.dependencies || {});
const developmentDependencies = Object.keys(packageJson.devDependencies || {});
const allowedDevelopmentDependencies = new Set(['playwright-core']);
expect(
  runtimeDependencies.length === 0 && developmentDependencies.every(name => allowedDevelopmentDependencies.has(name)),
  'Projet sans dépendance d’exécution et outillage QA borné',
  developmentDependencies.join(', ')
);
expect(
  packageJson.version === versionJson.version,
  'Versions package et contenu alignées',
  packageJson.version
);
const releaseScript = packageJson.scripts?.['qa:release'] || '';
expect(
  Boolean(
    packageJson.scripts?.build &&
    packageJson.scripts?.qa &&
    packageJson.scripts?.['qa:browser'] &&
    packageJson.scripts?.['audit:release'] === 'node tools/audit.mjs --release' &&
    releaseScript === 'npm run qa && npm run qa:browser && npm run audit:release' &&
    fs.existsSync(path.join(root, 'tools/browser-qa.mjs'))
  ),
  'Pipeline build et qa:release déclaré'
);

// La preuve fraîche n’est contrôlée qu’après la passe navigateur : un échec précédent
// ne doit jamais empêcher de reconstruire puis de réexécuter la suite.
if (releaseAudit) {
  let browserEvidence;
  try {
    browserEvidence = JSON.parse(fs.readFileSync(path.join(root, 'docs/QA_BROWSER_1.2.json'), 'utf8'));
  } catch (error) {
    fail('Preuve navigateur locale lisible', error.message);
  }
  const validReport = browserEvidence !== null && typeof browserEvidence === 'object' && !Array.isArray(browserEvidence);
  expect(validReport, 'Preuve locale : structure de rapport valide');
  if (validReport) {
    const browserChecks = Array.isArray(browserEvidence.checks) ? browserEvidence.checks : [];
    expect(
      browserEvidence.target === 'local-build' && browserEvidence.scope === 'complete' && browserEvidence.version === versionJson.version &&
      browserChecks.length > 0 && browserChecks.every(check => check?.passed === true) &&
      browserEvidence.summary?.passed === browserChecks.length && browserEvidence.summary?.failed === 0 &&
      Array.isArray(browserEvidence.failures) && browserEvidence.failures.length === 0 && !browserEvidence.error,
      'Preuve locale : version, contrôles et résultat cohérents',
      String(browserEvidence.summary?.passed || 0) + ' contrôles'
    );
    expect(
      Array.isArray(browserEvidence.runtimeErrors) && browserEvidence.runtimeErrors.length === 0,
      'Preuve locale : console et runtime sans erreur'
    );
    const builtWorker = fs.existsSync(path.join(root, 'dist/sw.js')) ? fs.readFileSync(path.join(root, 'dist/sw.js'), 'utf8') : '';
    const builtRevision = builtWorker.match(/const CACHE_VERSION = '([^']+)'/)?.[1];
    expect(Boolean(builtRevision) && browserEvidence.buildRevision === builtRevision, 'Preuve locale : empreinte de build identique au navigateur');
    const requiredBrowserChecks = [
      'Boot WebGL2 sans fallback',
      'Accessibilité appliquée et focus contenu',
      'Run desktop lancé via UI',
      'Cadence jouable à 1280x720 sur trois échantillons',
      'Quatre difficultés instanciées',
      'Trois secteurs instanciés avec départs distincts',
      'Boss dédiés aux offices 5 et 10',
      'Checkpoint écrit',
      'Reprise restaure le run',
      'Mort finalisée sur résultats',
      'Nouvelle tentative après mort',
      'Boss final, extraction et victoire',
      'Victoire prolongeable en survie infinie propre',
      'Service worker et cache installés',
      'PWA redémarre hors-ligne',
      'Cache-miss hors-ligne répond proprement en 503',
      'Menu mobile sans débordement',
      'Run tactile lancé via UI',
      'FEU tactile pilote le système d’arme',
      'Stick tactile transmet le déplacement',
      'Pause tactile opérationnelle',
      'Export puis import exact du dossier',
      'Abandon annulable sans perdre la tentative',
      'Greffes sans délai de lecture par défaut',
      'Intermission lançable par bouton tactile',
      'Checkpoint tactile valide sans fausse réparation',
      'Commandes tactiles contenues en paysage',
      'Dossier endommagé réparé avec copie et avertissement',
      'Démarrage jouable sans périphérique audio',
      'Perte WebGL réelle suspend la simulation',
      'Rechargement après perte graphique conserve la reprise',
      'Commandes desktop : I avancer et T recharger enregistrés réellement',
      'Commandes combat : I déplace réellement le joueur dans la simulation',
      'Commandes combat : defaults restaurés et persistés sans modifier le dossier',
      'Commandes mobile : dialogue sans débordement horizontal',
      'Multi-onglets : vrai événement storage bloque le brouillon sans écraser 21 fragments',
      'Multi-onglets : rechargement confirmé adopte 21 fragments et lève le blocage',
      'Version future : téléchargement de la copie originale exact octet pour octet',
      'Cache incomplet réparé atomiquement en ligne dans Chrome',
      'SRI réel refuse un module distant altéré sans cache partiel',
      'Réparation récupérable après refus d’intégrité',
      'Journal neuf sans révéler les missions et fins futures',
      'Reprise au choix non résolu sans fausse réparation',
      'Trois fins et six archives visibles dans le dossier',
      'Dossier narratif persistant après rechargement sans réparation',
      'Décision tactile mène à la Nef avec choix sauvegardé',
      'Histoire et accomplissements chargés hors ligne',
      'Histoire / conflit : clic réel sur le choix refusé sans coût, bonus ni faux combat figé',
      'Histoire complète assistée, trois secteurs et fin sealed · containment',
      'Histoire complète assistée, trois secteurs et fin witness · unstable',
      'Histoire complète assistée, trois secteurs et fin scar · red',
      'Histoire complète assistée, trois secteurs et fin scar · nexus',
      'Transport réel via E et marche ralentie · nexus',
      'Archive tactile récupérée par le bouton Interagir',
      'Décision : journal consultable sans choisir ni reprendre',
      'Décision tactile : réglages accessibles sans débordement',
      'Greffe / conflit : clic et raccourci refusés sans mutation ni disparition du choix',
      'Greffe / conflit : export téléchargé exact du brouillon conservé',
      'Décision mobile lisible, coûts présents et cibles tactiles dimensionnées',
      'Console et runtime sans erreur'
    ];
    const missingBrowserChecks = requiredBrowserChecks.filter(name =>
      !browserChecks.some(check => check?.name === name && check.passed === true)
    );
    expect(missingBrowserChecks.length === 0, 'Preuve locale : parcours critiques présents', missingBrowserChecks.join(', '));
    const expectedCaptures = {
      desktopMenu:'docs/screenshots/v1.2-desktop-menu.png',
      desktopGameplay:'docs/screenshots/v1.2-desktop-gameplay.png',
      mobileGameplay:'docs/screenshots/v1.2-mobile-gameplay.png'
    };
    expect(
      Object.keys(browserEvidence.evidence || {}).length === 3 &&
      Object.entries(expectedCaptures).every(([key, relative]) => {
        const full = path.join(root, relative);
        return browserEvidence.evidence?.[key] === relative && fs.existsSync(full) && fs.statSync(full).size > 0;
      }),
      'Preuve locale : trois captures présentes et correctement référencées'
    );
    const performance = browserEvidence.performance || {};
    const polishCaptures = ['bindings','mobile-bindings','storage-conflict','future-save'];
    expect(polishCaptures.every(name => {
      const relative = 'docs/screenshots/v1.2-' + name + '.png';
      const file = path.join(root, relative);
      return browserEvidence.auditEvidence?.[name] === relative && fs.existsSync(file) && fs.statSync(file).size > 0;
    }), 'Preuve locale : captures commandes et sauvegardes protégées présentes');
    const storyCaptures = ['journal-new','story-relays','story-choice','story-ending','completion','mobile-journal','mobile-choice'];
    expect(storyCaptures.every(name => {
      const relative = 'docs/screenshots/v1.3-' + name + '.png';
      const file = path.join(root, relative);
      return browserEvidence.storyEvidence?.[name] === relative && fs.existsSync(file) && fs.statSync(file).size > 0;
    }), 'Preuve locale : sept captures narratives présentes et référencées');
    const samples = Array.isArray(performance.samples) ? performance.samples : [];
    const median = samples.length === 3 && samples.every(Number.isFinite)
      ? [...samples].sort((a, b) => a - b)[1] : 0;
    expect(
      samples.length === 3 && samples.every(value => Number.isFinite(value) && value >= 24) && median >= 30 &&
      performance.averageFps === median && performance.viewport === '1280x720' &&
      performance.renderScale === 1 && performance.buffer === '1280x720' &&
      typeof performance.renderer === 'string' && performance.renderer.length > 0 &&
      !/swiftshader|llvmpipe|softpipe|lavapipe|software|non exposé/i.test(performance.renderer),
      'Preuve locale : rendu matériel natif, médiane ≥30 FPS et minimum ≥24 FPS',
      'médiane ' + median + ' · échantillons ' + samples.join(', ') + ' · échelle ' + performance.renderScale
    );
  }
}

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

const uiSource = fs.readFileSync(path.join(root, 'src/game/ui.js'), 'utf8');
const uiIdRefs = [...uiSource.matchAll(/this\.\$\(['"]([^'"]+)['"]\)/g)].map((entry) => entry[1]);
const missingUiIds = [...new Set(uiIdRefs.filter((id) => !idMatches.includes(id)))];
expect(missingUiIds.length === 0, 'Contrat UI/HTML complet', missingUiIds.join(', '));

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
expect(manifest.display === 'standalone' && manifest.start_url && manifest.scope, 'Manifeste PWA installable');
expect(Array.isArray(manifest.icons) && manifest.icons.every((icon) => fs.existsSync(path.join(root, icon.src))), 'Icônes PWA résolues');
const serviceWorkerSource = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
expect(indexSource.includes('manifest.webmanifest') && fs.readFileSync(path.join(root, 'src/main.js'), 'utf8').includes('serviceWorker.register'), 'PWA enregistrée');
expect(['index.html', 'styles.css', 'src/game/game.js', 'version.json'].every((entry) => serviceWorkerSource.includes(entry)), 'Cache hors-ligne couvre le cœur du jeu');
expect(serviceWorkerSource.includes('assets/nexus-keyart-v1.png') && fs.readFileSync(path.join(root, 'tools/build.mjs'), 'utf8').includes("'assets'"), 'Illustration originale incluse dans le build et le cache');

const normalizedIndex = indexSource.toLocaleLowerCase('fr');
expect(
  indexSource.includes('1–6') &&
  /<kbd(?:\s[^>]*)?>c<\/kbd>/.test(normalizedIndex) &&
  !/<kbd(?:\s[^>]*)?>q<\/kbd>/.test(normalizedIndex) &&
  /<kbd(?:\s[^>]*)?>v<\/kbd>/.test(normalizedIndex) &&
  normalizedIndex.includes('mêlée'),
  'Interface : six emplacements, capacité C et mêlée documentés'
);

const context = vm.createContext({ window: {} });
const dataSource = fs.readFileSync(path.join(root, 'src/game/data.js'), 'utf8');
vm.runInContext(dataSource, context, { filename: 'src/game/data.js' });
for (const file of ['src/game/story.js','src/game/progression.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
const data = context.window.NT?.Data;
expect(Boolean(data), 'Données de jeu chargeables en isolation');

if (data) {
  const actualCounts = {
    storyChapters: context.window.NT.Story.CHAPTERS.length,
    storyMissions: context.window.NT.Story.MISSIONS.length,
    storyChoices: context.window.NT.Story.CHOICES.length,
    archives: context.window.NT.Story.ARCHIVES.length,
    endings: Object.keys(context.window.NT.Story.ENDINGS).length,
    achievements: context.window.NT.Progression.ACHIEVEMENTS.length,
    classes: Object.keys(data.CLASSES).length,
    weapons: Object.keys(data.WEAPONS).length,
    enemyCastes: Object.keys(data.ENEMIES).length,
    waveModifiers: data.WAVE_MODIFIERS.length,
    runUpgrades: data.UPGRADES.length,
    metaUpgrades: Object.keys(data.META_UPGRADES).length,
    difficultyLevels: Object.keys(data.DIFFICULTIES).length,
    sectors: Object.keys(data.SECTORS || {}).length
  };
  for (const [key, actual] of Object.entries(actualCounts)) {
    const expected = versionJson.content[key];
    expect(actual === expected, `Inventaire ${key}`, `${actual}/${expected}`);
  }
  const stationCount = Object.values(data.STATIONS).reduce((sum, station) => sum + (station.instances || 1), 0);
  expect(stationCount === versionJson.content.stations, 'Inventaire stations', `${stationCount}/${versionJson.content.stations}`);
  expect(versionJson.content.waveObjectives === 5 && versionJson.content.campaignWaves === 10, 'Contrat cinq objectifs et campagne dix offices');

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
