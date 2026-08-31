import path from 'node:path';

// Parcours UI exécutés par la suite Chrome du dépôt. Les fixtures sont nommées
// explicitement : elles ne constituent pas une campagne gagnée sans assistance.
export async function auditMenu(page, verify, shots) {
  const title = await page.evaluate(async () => {
    const image = new Image();
    image.src = 'assets/nexus-keyart-v1.png';
    await image.decode();
    return { loaded:image.naturalWidth > 1000, background:getComputedStyle(document.querySelector('#main-menu')).backgroundImage.includes('nexus-keyart-v1.png'), summary:document.querySelector('#loadout-summary').textContent };
  });
  verify('Illustration originale chargée et doctrine explicitée', title.loaded && title.background && !/undefined|NaN/.test(title.summary) && /125 santé/.test(title.summary), title);
  await page.locator('#briefing-button').click();
  verify('Briefing accessible depuis le dossier', await page.locator('#briefing-screen').isVisible());
  await page.screenshot({ path:path.join(shots, 'v1.2-briefing.png') });
  await page.keyboard.press('Escape');
  verify('Fermeture du briefing restaure le focus', await page.locator('#briefing-screen').isHidden() && await page.locator('#briefing-button').evaluate(el => document.activeElement === el));
  await page.locator('#settings-button').click();
  const data = await page.evaluate(() => window.nexusGame.save.exportJSON());
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#save-export').click();
  const download = await downloadPromise;
  verify('Export JSON téléchargeable depuis les réglages', /^nexus-dossier-.*\.json$/.test(download.suggestedFilename()));
  await page.locator('#save-file').setInputFiles({ name:'invalid.json', mimeType:'application/json', buffer:Buffer.from('{"version":999,"shards":99}') });
  await page.locator('#confirm-accept').click();
  verify('Import invalide rejeté sans perte', /Import refusé/.test(await page.locator('#save-transfer-status').textContent()) && await page.evaluate(original => window.nexusGame.save.exportJSON() === original, data));
  await page.locator('#save-file').setInputFiles({ name:'nexus-backup.json', mimeType:'application/json', buffer:Buffer.from(data) });
  await page.locator('#confirm-cancel').click();
  verify('Import annulable sans modification', await page.evaluate(original => window.nexusGame.save.exportJSON() === original, data));
  await page.locator('#save-file').setInputFiles({ name:'nexus-backup.json', mimeType:'application/json', buffer:Buffer.from(data) });
  await page.locator('#confirm-accept').click();
  verify('Export puis import exact du dossier', /importé et enregistré/.test(await page.locator('#save-transfer-status').textContent()) && await page.evaluate(original => window.nexusGame.save.exportJSON() === original, data));
  await page.locator('#save-tools-title').scrollIntoViewIfNeeded();
  await page.screenshot({ path:path.join(shots, 'v1.2-save-tools.png') });
  await page.locator('[data-close="settings-screen"]').click();
}

export async function auditPause(page, verify) {
  await page.keyboard.press('Escape');
  await page.locator('#pause-screen').waitFor({ state:'visible' });
  await page.locator('#restart-button').click();
  verify('Redémarrage protégé par confirmation', await page.locator('#confirm-screen').isVisible() && await page.evaluate(() => window.nexusGame.state === 'paused'));
  await page.keyboard.press('Escape');
  verify('Annuler le redémarrage conserve la pause', await page.locator('#confirm-screen').isHidden() && await page.evaluate(() => window.nexusGame.state === 'paused'));
  await page.locator('#pause-briefing').click();
  await page.keyboard.press('Escape');
  verify('Aide en pause ne relance pas le combat', await page.locator('#pause-screen').isVisible() && await page.evaluate(() => window.nexusGame.state === 'paused'));
  await page.locator('#pause-settings-button').click();
  verify('Import désactivé pendant une tentative', await page.locator('#save-import').isDisabled());
  await page.locator('[data-close="settings-screen"]').click();
  await page.locator('#quit-button').click();
  await page.locator('#confirm-cancel').click();
  verify('Abandon annulable sans perdre la tentative', await page.evaluate(() => window.nexusGame.state === 'paused' && window.nexusGame.wave === 1));
}

export async function auditMobileMenu(page, verify, shots) {
  await page.locator('#briefing-button').tap();
  verify('Briefing mobile disponible et sans débordement', await page.locator('#briefing-screen').isVisible() && await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.locator('[data-close="briefing-screen"]').first().tap();
  await page.locator('#settings-button').tap();
  verify('Réglages accessibles au menu mobile', await page.locator('#settings-screen').isVisible());
  await page.locator('[data-close="settings-screen"]').tap();
  await page.locator('#codex-button').tap();
  await page.locator('[data-tab="meta"]').tap();
  verify('Progression persistante accessible sur mobile', await page.locator('.meta-card').count() === 6);
  await page.locator('[data-close="codex-screen"]').tap();
  await page.locator('#main-menu').evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path:path.join(shots, 'v1.2-mobile-menu.png') });
}

export async function auditMobileCombat(page, verify, shots) {
  await page.locator('#resume-button').tap();
  const graft = await page.evaluate(() => {
    const g = window.nexusGame;
    g.enemies.length = 0; g.spawnQueue.length = 0; g.spawnsRemaining = 0; g.waveActive = false;
    g.state = 'upgrade';
    g.ui.showUpgrades(window.NT.Data.UPGRADES.slice(0, 3), 24, () => { g.state = 'playing'; g._beginIntermission(); });
    const before = g.ui.upgradeTimer;
    g.ui.update(25);
    return { before, after:g.ui.upgradeTimer, state:g.state, timed:g.settings.timedUpgrades };
  });
  verify('Greffes sans délai de lecture par défaut', !graft.timed && graft.before === graft.after && graft.state === 'upgrade', graft);
  await page.screenshot({ path:path.join(shots, 'v1.2-mobile-grafts.png') });
  await page.locator('.upgrade-card').first().tap();
  await page.waitForTimeout(800);
  const nextBefore = await page.evaluate(() => window.nexusGame.wave);
  await page.locator('#touch-next-wave').tap();
  verify('Intermission lançable par bouton tactile', await page.evaluate(wave => window.nexusGame.wave === wave + 1 && !window.nexusGame.intermissionActive, nextBefore));
  const checkpointStatus = await page.evaluate(() => {
    const save = window.nexusGame.save;
    return { ...save.status, strictError:save._normalize(save.data, true).error };
  });
  verify('Checkpoint tactile valide sans fausse réparation', checkpointStatus.available && !checkpointStatus.dirty && !checkpointStatus.recovered && !checkpointStatus.strictError, checkpointStatus);
  const guidance = await page.evaluate(() => {
    const g = window.nexusGame;
    g.waveObjective = { type:'hold', phase:'active', radius:2, progress:0, duration:18, reinforcementTimer:4, position:new window.NT.Math.Vec3(g.player.position.x + 12, 0, g.player.position.z) };
    g.camera.yaw = 0; g.ui._updateGuidance();
    return document.querySelector('#navigation-hint').textContent;
  });
  verify('Guidage objectif orienté et chiffré', /12 M.*À DROITE/.test(guidance), guidance);
  await page.locator('#touch-pause').tap();
  await page.setViewportSize({ width:844, height:390 });
  await page.locator('#resume-button').tap();
  await page.waitForTimeout(150);
  const landscape = await page.evaluate(() => {
    const ids = ['touch-fire','touch-move','touch-pause'];
    return ids.map(id => {
      const r = document.getElementById(id).getBoundingClientRect();
      return { id, x:r.x, y:r.y, width:r.width, height:r.height, inViewport:r.x >= 0 && r.y >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 };
    });
  });
  verify('Commandes tactiles contenues en paysage', landscape.every(x => x.inViewport && x.width >= 44 && x.height >= 44), landscape);
  await page.screenshot({ path:path.join(shots, 'v1.2-mobile-landscape.png') });
  const blurred = await page.evaluate(() => {
    const g = window.nexusGame;
    g.input.setVirtualKey('KeyW', true);
    window.dispatchEvent(new Event('blur'));
    return { state:g.state, held:g.input.virtualKeys.size, audio:g.audio.context?.state || g.audio.ctx?.state || null };
  });
  verify('Perte de focus suspend le tactile et libère les entrées', blurred.state === 'paused' && blurred.held === 0, blurred);
}

export async function auditRecovery(page, verify, url) {
  await page.addInitScript(() => {
    window.AudioContext = class { constructor() { throw new Error('QA : audio indisponible'); } };
    window.webkitAudioContext = window.AudioContext;
    if (!sessionStorage.getItem('nexus-recovery-seeded')) {
      localStorage.setItem('nexus-of-torment-save-v1', JSON.stringify({ version:2, shards:11, records:null }));
      sessionStorage.setItem('nexus-recovery-seeded', '1');
    }
  });
  await page.goto(url, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.nexusGame?.state === 'menu');
  const recovery = await page.evaluate(() => ({
    safe:window.nexusGame.save.data.records.bestWave === 0,
    backup:Boolean(localStorage.getItem('nexus-of-torment-save-v1:recovery')),
    visible:!document.querySelector('#save-status').classList.contains('hidden')
  }));
  verify('Dossier endommagé réparé avec copie et avertissement', recovery.safe && recovery.backup && recovery.visible, recovery);
  await page.evaluate(() => { window.nexusGame.input.touchMode = true; });
  await page.locator('#start-button').click();
  verify('Démarrage jouable sans périphérique audio', await page.evaluate(() => window.nexusGame.state === 'playing' && window.nexusGame.audio.unavailable && Number.isFinite(window.nexusGame.player.health)));
  const before = await page.evaluate(() => {
    const g = window.nexusGame;
    g._checkpointActiveRun(2);
    const original = localStorage.getItem(g.save.key);
    window.nexusLossExtension = g.renderer.gl.getExtension('WEBGL_lose_context');
    if (!window.nexusLossExtension) throw new Error('Extension de perte WebGL indisponible');
    window.nexusLossExtension.loseContext();
    return original;
  });
  await page.locator('#graphics-reload').waitFor({ state:'visible' });
  const stopped = await page.evaluate(() => {
    const g = window.nexusGame, time = g.runTime, health = g.player.health;
    g.update(3);
    return { state:g.state, frozen:g.runTime === time && g.player.health === health, enabled:g.input.enabled };
  });
  verify('Perte WebGL réelle suspend la simulation', stopped.state === 'graphics-lost' && stopped.frozen && !stopped.enabled, stopped);
  await page.waitForTimeout(150);
  await page.evaluate(() => window.nexusLossExtension.restoreContext());
  await page.waitForFunction(() => window.nexusGame.graphicsContextRestored === true);
  verify('Restauration WebGL exige reconstruction explicite', await page.locator('#graphics-reload').isVisible() && await page.evaluate(original => window.nexusGame.state === 'graphics-lost' && localStorage.getItem(window.nexusGame.save.key) === original, before));
  await page.locator('#graphics-reload').click();
  await page.waitForFunction(() => window.nexusGame?.state === 'menu');
  verify('Rechargement après perte graphique conserve la reprise', await page.locator('#continue-button').isVisible() && await page.evaluate(() => !window.nexusGame.graphicsUnavailable && Boolean(document.querySelector('#game-canvas').getContext('webgl2'))));
}
