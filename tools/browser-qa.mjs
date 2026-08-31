import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { auditMenu, auditPause, auditMobileMenu, auditMobileCombat, auditRecovery } from './browser-product-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let url = process.argv[2] || process.env.NEXUS_QA_URL || null;
const explicitUrl = Boolean(url);
// Playwright 1.55 leaves worker networking unmanaged without this opt-in:
// context.setOffline(true) would only disconnect the page, not its service worker.
// This affects the isolated QA process only, never the game or the host network.
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const chrome = process.env.NEXUS_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const headless = process.env.NEXUS_QA_HEADLESS !== 'false';
const softwareRenderer = process.env.NEXUS_QA_SOFTWARE_RENDERER === '1';
const launchArgs = ['--enable-webgl','--enable-gpu','--ignore-gpu-blocklist','--disable-dev-shm-usage'];
// SwANGLE explicite pour les bots sans GPU ; le chemin matériel par défaut reste intact.
// https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md
if (softwareRenderer) launchArgs.push('--use-gl=angle', '--use-angle=swiftshader');
const minFps = Math.max(1, Number.parseFloat(process.env.NEXUS_MIN_FPS || '30') || 30);
const minSampleFps = Math.max(1, Number.parseFloat(process.env.NEXUS_MIN_SAMPLE_FPS || '24') || 24);
const requestedRenderScale = Number.parseFloat(process.env.NEXUS_QA_RENDER_SCALE || '');
const renderScaleOverride = Number.isFinite(requestedRenderScale)
  ? Math.min(1.5, Math.max(.55, requestedRenderScale))
  : null;
const outputDirectory = process.env.NEXUS_QA_OUTPUT_DIR
  ? path.resolve(root, process.env.NEXUS_QA_OUTPUT_DIR)
  : path.join(root, explicitUrl ? '.qa/production' : 'docs');
const shots = path.join(outputDirectory, 'screenshots');
const reportFile = path.join(outputDirectory, 'QA_BROWSER_1.2.json');
const evidencePath = filename => path.relative(root, path.join(shots, filename)).replaceAll('\\', '/');
fs.mkdirSync(shots, { recursive:true });
const report = {
  schemaVersion:1, product:'NEXUS OF TORMENT — Liturgie nerveuse', version:'1.2.0',
  target:explicitUrl ? 'production-url' : 'local-build',
  executedAt:new Date().toISOString(), url,
  browser:{ engine:'Chromium', executable:chrome, headless, softwareRenderer, launchArgs, serviceWorkerNetworkEvents:true },
  checks:[], failures:[], evidence:{
    desktopMenu:evidencePath('v1.2-desktop-menu.png'),
    desktopGameplay:evidencePath('v1.2-desktop-gameplay.png'),
    mobileGameplay:evidencePath('v1.2-mobile-gameplay.png')
  }
};
report.auditEvidence = Object.fromEntries(['briefing','save-tools','mobile-menu','mobile-grafts','mobile-landscape'].map(name => [name, evidencePath('v1.2-' + name + '.png')]));
function verify(name, value, details) {
  report.checks.push({ name, passed:Boolean(value), ...(details === undefined ? {} : { details }) });
  if (!value) { report.failures.push(name); throw new Error(name); }
}
async function ready(page) {
  await page.waitForFunction(() => {
    const fallback = document.querySelector('#webgl-fallback');
    return window.nexusGame?.state === 'menu' || (fallback && !fallback.classList.contains('hidden'));
  }, null, { timeout:15000 });
  const bootError = await page.evaluate(() => window.nexusGame?.state === 'menu'
    ? null : document.querySelector('#webgl-fallback')?.textContent?.trim());
  if (bootError) throw new Error('Démarrage Nexus impossible : ' + bootError);
}
async function snapshot(page) {
  return page.evaluate(() => {
    const g = window.nexusGame;
    const gl = document.querySelector('#game-canvas')?.getContext('webgl2');
    const rendererInfo = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      state:g?.state, wave:g?.wave, mode:g?.modeId, sector:g?.sectorId, difficulty:g?.lastDifficultyId,
      cameraYaw:g?.camera?.yaw,
      webgl2:Boolean(gl),
      gpuRenderer:rendererInfo ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL) : null,
      renderScale:g?.renderer?.renderScale,
      buffer:gl ? gl.drawingBufferWidth + 'x' + gl.drawingBufferHeight : null,
      fallbackHidden:document.querySelector('#webgl-fallback')?.classList.contains('hidden'),
      drawCalls:g?.renderer?.drawCalls, triangles:g?.renderer?.triangles,
      enemies:g?.enemies?.filter(e => e.alive).length, queued:g?.spawnQueue?.length
    };
  });
}
async function fps(page, count = 75) {
  return page.evaluate(n => new Promise(resolve => {
    let first = 0, frame = 0;
    const tick = now => {
      if (!first) first = now;
      if (++frame >= n) resolve(Math.round(((n - 1) * 10000 / Math.max(1, now - first))) / 10);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), count);
}

let browser;
let offline = false;
const errors = [];
const diagnosticEvents = [];
const diagnosticPages = [];
function rememberDiagnostic(event) {
  diagnosticEvents.push({ at:new Date().toISOString(), ...event });
  if (diagnosticEvents.length > 150) diagnosticEvents.shift();
}
function observePage(page, label, expectedConsoleMessages = []) {
  diagnosticPages.push({ page, label });
  page.on('pageerror', error => {
    errors.push({ type:label + '-pageerror', message:error.message });
    rememberDiagnostic({ page:label, type:'pageerror', message:error.message, stack:error.stack });
  });
  page.on('console', message => {
    rememberDiagnostic({ page:label, type:'console', level:message.type(), message:message.text(), location:message.location() });
    if (message.type() === 'error') errors.push({ type:label + '-console', message:message.text(), expectedOffline:offline, expectedRecovery:expectedConsoleMessages.some(text => message.text().includes(text)) });
  });
  page.on('requestfailed', request => {
    rememberDiagnostic({ page:label, type:'requestfailed', url:request.url(), failure:request.failure() });
    if (!offline) errors.push({ type:label + '-request', message:request.url() });
  });
  page.on('crash', () => {
    errors.push({ type:label + '-crash', message:'Processus renderer interrompu' });
    rememberDiagnostic({ page:label, type:'crash' });
  });
}
function unexpectedErrors() {
  return errors.filter(error =>
    !error.expectedRecovery &&
    !(error.expectedOffline && /status of 503/i.test(error.message))
  );
}
async function collectFailureDiagnostics() {
  const pages = [];
  for (const { page, label } of diagnosticPages) {
    if (page.isClosed()) { pages.push({ label, closed:true }); continue; }
    let timeout;
    const diagnostic = { label, url:page.url() };
    try {
      diagnostic.init = await Promise.race([
        page.evaluate(() => {
          const canvas = document.querySelector('#game-canvas');
          const fallback = document.querySelector('#webgl-fallback');
          const gl = canvas?.getContext('webgl2');
          const rendererInfo = gl?.getExtension('WEBGL_debug_renderer_info');
          return {
            readyState:document.readyState, title:document.title,
            gameConstructed:Boolean(window.nexusGame), gameState:window.nexusGame?.state || null,
            modules:Object.keys(window.NT || {}), canvasPresent:Boolean(canvas),
            fallbackVisible:Boolean(fallback && !fallback.classList.contains('hidden')),
            fallbackText:fallback?.textContent?.trim() || null,
            webgl2:Boolean(gl), contextLost:gl?.isContextLost() ?? null,
            gpuRenderer:rendererInfo ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL) : null,
            scripts:Array.from(document.scripts, script => script.src)
          };
        }),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Diagnostic de page interrompu après 3 secondes')), 3000); })
      ]);
    } catch (error) { diagnostic.error = error.message; }
    finally { clearTimeout(timeout); }
    try {
      const filename = 'failure-' + label + '.png';
      await page.screenshot({ path:path.join(shots, filename), timeout:3000 });
      diagnostic.screenshot = evidencePath(filename);
    } catch (error) { diagnostic.screenshotError = error.message; }
    pages.push(diagnostic);
  }
  return { lastCheck:report.checks.at(-1) || null, pages, events:diagnosticEvents, capturedErrors:errors };
}
let qaServer;
async function startBuiltServer(port = 0) {
  const dist = path.join(root, 'dist');
  verify('Build dist disponible pour le navigateur', fs.existsSync(path.join(dist, 'index.html')), dist);
  const types = {
    '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
    '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
    '.webmanifest':'application/manifest+json; charset=utf-8', '.svg':'image/svg+xml',
    '.png':'image/png'
  };
  const server = http.createServer((request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname); }
    catch { response.writeHead(400).end('Bad request'); return; }
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    // Même redirection que cleanUrls sur Vercel ; elle fait partie du contrat PWA.
    if (relative === 'index.html' && pathname !== '/') {
      response.writeHead(308, { Location:'/' }).end(); return;
    }
    const file = path.resolve(dist, relative);
    if (file !== dist && !file.startsWith(dist + path.sep)) {
      response.writeHead(403).end('Forbidden'); return;
    }
    fs.readFile(file, (error, data) => {
      if (error) { response.writeHead(404).end('Not found'); return; }
      response.writeHead(200, {
        'Content-Type':types[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'
      });
      response.end(data);
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}
try {
  verify('Chrome local disponible', fs.existsSync(chrome), chrome);
  if (!url) {
    qaServer = await startBuiltServer();
    const address = qaServer.address();
    url = 'http://127.0.0.1:' + address.port + '/';
    report.url = url;
    report.buildRevision = fs.readFileSync(path.join(root, 'dist/sw.js'), 'utf8').match(/const CACHE_VERSION = '([^']+)'/)?.[1];
  }
  browser = await chromium.launch({
    executablePath:chrome, headless,
    args:launchArgs
  });
  const desktop = await browser.newContext({
    viewport:{ width:1280, height:720 }, colorScheme:'dark',
    reducedMotion:'no-preference', serviceWorkers:'allow'
  });
  const page = await desktop.newPage();
  observePage(page, 'desktop');
  const response = await page.goto(url, { waitUntil:'networkidle', timeout:20000 });
  verify('Chargement HTTP desktop', response?.ok(), response?.status());
  await ready(page);
  const boot = await snapshot(page);
  verify('Boot WebGL2 sans fallback', boot.state === 'menu' && boot.webgl2 && boot.fallbackHidden, boot);
  const menu = await page.evaluate(() => ({
    classes:document.querySelectorAll('.class-card').length,
    difficulties:document.querySelectorAll('#difficulty option').length,
    modes:document.querySelectorAll('#mode option').length,
    sectors:document.querySelectorAll('#sector option:not([disabled])').length,
    lang:document.documentElement.lang, title:document.title
  }));
  verify('Menu complet: 3 classes, 4 difficultés, 2 modes, 3 secteurs',
    menu.classes === 3 && menu.difficulties === 4 && menu.modes === 2 && menu.sectors === 3, menu);
  verify('Document français titré', menu.lang === 'fr' && /NEXUS OF TORMENT/i.test(menu.title), menu);
  await page.screenshot({ path:path.join(shots, 'v1.2-desktop-menu.png') });
  await auditMenu(page, verify, shots);

  await page.locator('#settings-button').click();
  await page.locator('#reduced-motion').check();
  await page.locator('#ui-contrast').check();
  await page.locator('#enemy-contrast').check();
  await page.locator('#subtitles-enabled').uncheck();
  const access = await page.evaluate(() => ({
    motion:document.body.classList.contains('reduced-motion'),
    ui:document.body.classList.contains('ui-high-contrast'),
    enemy:document.body.classList.contains('enemy-high-contrast'),
    subtitles:document.body.classList.contains('subtitles-disabled'),
    focus:Boolean(document.activeElement?.closest('#settings-screen'))
  }));
  verify('Accessibilité appliquée et focus contenu', Object.values(access).every(Boolean), access);
  await page.locator('[data-close="settings-screen"]').click();
  if (renderScaleOverride !== null) {
    await page.evaluate(scale => {
      window.nexusGame.settings.renderScale = scale;
      window.nexusGame.applySettings();
    }, renderScaleOverride);
  }

  await page.locator('#difficulty').selectOption('red');
  await page.locator('#mode').selectOption('campaign');
  await page.locator('#sector').selectOption('nave');
  await page.locator('#start-button').click();
  await page.waitForTimeout(1050);
  const pointer = await page.evaluate(() => ({
    locked:window.nexusGame.input.pointerLocked,
    prompt:!document.querySelector('#pointer-lock-screen').classList.contains('hidden'),
    state:window.nexusGame.state
  }));
  verify('Pointeur verrouillé ou reprise explicite affichée', pointer.locked || pointer.prompt, pointer);
  await page.evaluate(() => {
    const g = window.nexusGame;
    g.input.touchMode = false;
    g.input.pointerLocked = true;
    if (g.state === 'input-paused') g.ui._hidePointerPrompt(true);
  });
  await page.waitForTimeout(800);
  const combat = await snapshot(page);
  verify('Run desktop lancé via UI', combat.state === 'playing' && combat.wave === 1 &&
    combat.sector === 'nave' && combat.difficulty === 'red' && Math.abs(combat.cameraYaw) < .01, combat);
  verify('Rendu de combat actif', combat.drawCalls > 0 && combat.triangles > 0, combat);
  const fpsSamples = [];
  for (let index = 0; index < 3; index++) fpsSamples.push(await fps(page, 60));
  const sortedFps = [...fpsSamples].sort((a, b) => a - b);
  const averageFps = sortedFps[1];
  verify('Cadence jouable à 1280x720 sur trois échantillons',
    averageFps >= minFps && sortedFps[0] >= minSampleFps,
    { median:averageFps, samples:fpsSamples, thresholds:{ median:minFps, minimum:minSampleFps } });
  report.performance = {
    viewport:'1280x720', averageFps, drawCalls:combat.drawCalls,
    triangles:combat.triangles, samples:fpsSamples, renderer:combat.gpuRenderer || 'non exposé',
    renderScale:combat.renderScale, buffer:combat.buffer
  };
  await page.screenshot({ path:path.join(shots, 'v1.2-desktop-gameplay.png') });
  await auditPause(page, verify);

  const difficulties = await page.evaluate(() => {
    const g = window.nexusGame;
    return ['containment','unstable','red','nexus'].map(id => {
      g.startRun('bulwark', id, 'campaign', 'sanctum'); g.input.touchMode = true;
      const enemy = g.spawnEnemy('sutured', null, { instant:true });
      return { id, health:enemy.maxHealth, damage:g.difficulty.enemyDamage, count:g._buildWaveQueue().length };
    });
  });
  verify('Quatre difficultés instanciées', difficulties.length === 4, difficulties);
  verify('Santé et dégâts croissent avec la difficulté', difficulties.every((r, i) =>
    !i || (r.health > difficulties[i-1].health && r.damage > difficulties[i-1].damage)), difficulties);
  const sectors = await page.evaluate(() => {
    const g = window.nexusGame;
    return ['sanctum','nave','ossuary'].map(id => {
      g.startRun('bulwark', 'unstable', 'campaign', id); g.input.touchMode = true;
      return { id:g.sectorId, start:[g.player.position.x,g.player.position.y,g.player.position.z] };
    });
  });
  verify('Trois secteurs instanciés avec départs distincts',
    sectors.map(x => x.id).join(',') === 'sanctum,nave,ossuary' &&
    new Set(sectors.map(x => x.start.join(','))).size === 3, sectors);

  const bosses = await page.evaluate(() => {
    const g = window.nexusGame;
    return [5,10].map(wave => {
      g.startRun('executioner', 'red', 'campaign', 'ossuary'); g.input.touchMode = true;
      g.enemies.length = 0; g.spawnQueue.length = 0; g.wave = wave - 1;
      g.startNextWave(); g.spawnTimer = 0; g._updateWaveDirector(.016);
      const boss = g.enemies.find(e => e.boss);
      return { wave:g.wave, type:boss?.type, alive:boss?.alive, objective:g.waveObjective?.type };
    });
  });
  verify('Boss dédiés aux offices 5 et 10',
    bosses[0].type === 'gatekeeper' && bosses[1].type === 'archdeacon' &&
    bosses.every(x => x.alive && x.objective === 'boss'), bosses);

  const checkpoint = await page.evaluate(() => {
    const g = window.nexusGame;
    g.startRun('occultist', 'nexus', 'campaign', 'ossuary'); g.input.touchMode = true;
    g.wave = 3; g.score = 4321; g.runTime = 87.5; g.player.health = 61;
    g.player.essence = 777; g.stats.kills = 19;
    const saved = g._checkpointActiveRun(4); g.pause();
    return { saved, next:g.save.data.activeRun?.nextWave };
  });
  verify('Checkpoint écrit', checkpoint.saved && checkpoint.next === 4, checkpoint);
  await page.reload({ waitUntil:'networkidle' });
  await ready(page);
  verify('Bouton continuer après rechargement', await page.locator('#continue-button').isVisible());
  await page.evaluate(() => { window.nexusGame.input.touchMode = true; });
  await page.locator('#continue-button').click();
  await page.waitForTimeout(200);
  const resumed = await page.evaluate(() => {
    const g = window.nexusGame;
    return {
      state:g.state, wave:g.wave, sector:g.sectorId, difficulty:g.lastDifficultyId,
      score:g.score, health:g.player.health, essence:g.player.essence,
      kills:g.stats.kills, intermission:g.intermissionActive
    };
  });
  verify('Reprise restaure le run',
    resumed.state === 'playing' && resumed.wave === 3 && resumed.sector === 'ossuary' &&
    resumed.difficulty === 'nexus' && resumed.score === 4321 && resumed.health === 61 &&
    resumed.essence === 777 && resumed.kills === 19 && resumed.intermission, resumed);

  const death = await page.evaluate(() => {
    const g = window.nexusGame;
    g.startRun('bulwark', 'unstable', 'campaign', 'sanctum'); g.input.touchMode = true;
    g.stats.wavesCleared = 2; g.stats.kills = 11; g.score = 2800;
    g.player.dead = true; g.player.health = 0; g.onPlayerDeath(); g.update(2.2);
    return {
      state:g.state, screen:!document.querySelector('#gameover-screen').classList.contains('hidden'),
      active:g.save.data.activeRun
    };
  });
  verify('Mort finalisée sur résultats', death.state === 'gameover' && death.screen && death.active === null, death);
  await page.locator('#gameover-restart').click();
  await page.waitForTimeout(150);
  const restarted = await snapshot(page);
  verify('Nouvelle tentative après mort', restarted.state === 'playing' && restarted.wave === 1, restarted);

  const victory = await page.evaluate(() => {
    const g = window.nexusGame;
    g.startRun('executioner', 'red', 'campaign', 'nave'); g.input.touchMode = true;
    g.wave = 9; g.startNextWave(); g.spawnTimer = 0; g._updateWaveDirector(.016);
    const boss = g.enemies.find(e => e.alive && e.boss);
    boss.spawnTimer = 0;
    boss.takeDamage(boss.maxHealth * 4, { zone:'head', headMultiplier:1, source:'qa' });
    if (!g.extractionActive || !g.extractionZone) {
      throw new Error('La mort du boss final ne déclenche pas automatiquement l’extraction.');
    }
    g.player.position.copy(g.extractionZone.position);
    g._updateExtraction(g.extractionDuration + .1);
    return {
      state:g.state, bossKills:g.stats.bossKills, finalized:g.runFinalized,
      screen:!document.querySelector('#victory-screen').classList.contains('hidden'),
      active:g.save.data.activeRun
    };
  });
  verify('Boss final, extraction et victoire',
    victory.state === 'victory' && victory.bossKills === 1 && victory.finalized &&
    victory.screen && victory.active === null, victory);
  await page.locator('#victory-endless').click();
  const endless = await page.evaluate(() => {
    const g = window.nexusGame;
    return {
      state:g.state, mode:g.modeId, intermission:g.intermissionActive,
      finalized:g.runFinalized, hostiles:g.enemies.filter(e => e.alive).length,
      projectiles:g.projectiles.length, hazards:g.arena.hazards?.length || 0
    };
  });
  verify('Victoire prolongeable en survie infinie propre',
    endless.state === 'playing' && endless.mode === 'endless' && endless.intermission &&
    !endless.finalized && !endless.hostiles && !endless.projectiles && !endless.hazards, endless);

  const pwa = await page.evaluate(async () => {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('service worker timeout')), 7000))
    ]);
    return {
      scope:registration.scope, controlled:Boolean(navigator.serviceWorker.controller),
      caches:await caches.keys()
    };
  });
  verify('Service worker et cache installés',
    /\/$/.test(pwa.scope) && pwa.caches.some(x => x.includes('nexus-of-torment')), pwa);
  offline = true;
  const offlinePort = qaServer?.address()?.port || null;
  if (qaServer) {
    await new Promise(resolve => qaServer.close(resolve));
    qaServer = null;
  } else {
    await desktop.setOffline(true);
    // A direct worker fetch bypasses its own fetch handler and HTTP cache.
    // Prove that Vercel really is unreachable before testing the cached reboot.
    const workerNetwork = await Promise.all(desktop.serviceWorkers().map(async worker => ({
      worker:worker.url(),
      ...await worker.evaluate(async () => {
        try {
          const response = await fetch('./version.json?qa-network-probe', {
            cache:'no-store', signal:AbortSignal.timeout(7000)
          });
          return { blocked:false, status:response.status };
        } catch (error) {
          return { blocked:error.name === 'TypeError', error:error.name };
        }
      })
    })));
    verify('Coupure réseau confirmée dans le service worker',
      workerNetwork.length > 0 && workerNetwork.every(result => result.blocked), workerNetwork);
  }
  await page.reload({ waitUntil:'domcontentloaded', timeout:15000 });
  await ready(page);
  const offlineBoot = await snapshot(page);
  verify('PWA redémarre hors-ligne',
    offlineBoot.state === 'menu' && offlineBoot.webgl2 && offlineBoot.fallbackHidden, offlineBoot);
  const offlineMiss = await page.evaluate(async () => {
    const response = await fetch('./qa-cache-miss.txt');
    return { status:response.status, text:await response.text() };
  });
  verify('Cache-miss hors-ligne répond proprement en 503',
    offlineMiss.status === 503 && /hors ligne/i.test(offlineMiss.text), offlineMiss);
  if (offlinePort) qaServer = await startBuiltServer(offlinePort);
  else await desktop.setOffline(false);
  offline = false;
  await desktop.close();

  const mobile = await browser.newContext({
    viewport:{ width:390, height:844 }, deviceScaleFactor:2,
    isMobile:true, hasTouch:true, colorScheme:'dark', serviceWorkers:'allow'
  });
  const mobilePage = await mobile.newPage();
  observePage(mobilePage, 'mobile');
  const mobileResponse = await mobilePage.goto(url, { waitUntil:'networkidle', timeout:20000 });
  verify('Chargement HTTP mobile', mobileResponse?.ok(), mobileResponse?.status());
  await ready(mobilePage);
  const responsive = await mobilePage.evaluate(() => ({
    touch:window.nexusGame.input.touchMode,
    width:window.innerWidth,
    scroll:document.documentElement.scrollWidth,
    sectors:document.querySelectorAll('#sector option:not([disabled])').length
  }));
  verify('Menu mobile sans débordement', responsive.touch && responsive.scroll <= responsive.width + 1 &&
    responsive.sectors === 3, responsive);
  await auditMobileMenu(mobilePage, verify, shots);
  await mobilePage.locator('#difficulty').selectOption('nexus');
  await mobilePage.locator('#mode').selectOption('endless');
  await mobilePage.locator('#sector').selectOption('ossuary');
  await mobilePage.locator('#start-button').tap();
  await mobilePage.waitForTimeout(400);
  const mobileCombat = await snapshot(mobilePage);
  verify('Run tactile lancé via UI', mobileCombat.state === 'playing' &&
    mobileCombat.sector === 'ossuary' && mobileCombat.mode === 'endless' &&
    mobileCombat.difficulty === 'nexus' && await mobilePage.locator('#touch-controls').isVisible(), mobileCombat);

  const fire = await mobilePage.locator('#touch-fire').boundingBox();
  verify('Cible FEU au moins 44 px', fire && fire.width >= 44 && fire.height >= 44, fire);
  const cdp = await mobile.newCDPSession(mobilePage);
  const point = { x:fire.x + fire.width/2, y:fire.y + fire.height/2 };
  const before = await mobilePage.evaluate(() => window.nexusGame.stats.shots);
  await cdp.send('Input.dispatchTouchEvent', { type:'touchStart',
    touchPoints:[{ ...point, id:7, radiusX:4, radiusY:4, force:1 }] });
  await mobilePage.waitForTimeout(180);
  const held = await mobilePage.evaluate(() => window.nexusGame.input.virtualMouseButtons.has(0));
  await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
  const after = await mobilePage.evaluate(() => window.nexusGame.stats.shots);
  verify('FEU tactile pilote le système d’arme', held && after > before, { before, after, held });

  const stick = await mobilePage.locator('#touch-move').boundingBox();
  verify('Stick tactile disponible', stick && stick.width >= 80 && stick.height >= 80, stick);
  const center = { x:stick.x + stick.width/2, y:stick.y + stick.height/2 };
  await cdp.send('Input.dispatchTouchEvent', { type:'touchStart',
    touchPoints:[{ ...center, id:8, radiusX:5, radiusY:5, force:1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type:'touchMove',
    touchPoints:[{ x:center.x, y:stick.y + 8, id:8, radiusX:5, radiusY:5, force:1 }] });
  await mobilePage.waitForTimeout(100);
  const moving = await mobilePage.evaluate(() => window.nexusGame.input.virtualKeys.has('KeyW'));
  await cdp.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
  verify('Stick tactile transmet le déplacement', moving, moving);
  await mobilePage.waitForTimeout(2200);
  await mobilePage.screenshot({ path:path.join(shots, 'v1.2-mobile-gameplay.png') });
  await mobilePage.locator('#touch-pause').tap();
  verify('Pause tactile opérationnelle',
    await mobilePage.locator('#pause-screen').isVisible() && (await snapshot(mobilePage)).state === 'paused');
  await auditMobileCombat(mobilePage, verify, shots);
  await mobile.close();

  const recoveryContext = await browser.newContext({ viewport:{ width:1280, height:720 }, serviceWorkers:'block' });
  const recoveryPage = await recoveryContext.newPage();
  observePage(recoveryPage, 'recovery', ['Le contexte graphique a été perdu. Aucun ennemi ne peut agir pendant cette interruption.']);
  await auditRecovery(recoveryPage, verify, url);
  await recoveryContext.close();

  const realErrors = unexpectedErrors();
  verify('Console et runtime sans erreur', realErrors.length === 0, realErrors);
  report.runtimeErrors = realErrors;
  report.expectedRecoverySignals = errors.filter(x => x.expectedRecovery);
  report.expectedOfflineSignals = errors.filter(x => x.expectedOffline && /status of 503/i.test(x.message));
  report.summary = { passed:report.checks.filter(x => x.passed).length, failed:0 };
} catch (error) {
  report.error = error?.stack || String(error);
  report.diagnostics = await collectFailureDiagnostics();
  report.runtimeErrors = unexpectedErrors();
  report.summary = {
    passed:report.checks.filter(x => x.passed).length,
    failed:Math.max(1, report.failures.length)
  };
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  await new Promise(resolve => qaServer ? qaServer.close(resolve) : resolve());
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  console.log('QA navigateur Nexus:', report.summary);
  console.log('Rapport:', reportFile);
  if (report.error) console.error(report.error);
}
