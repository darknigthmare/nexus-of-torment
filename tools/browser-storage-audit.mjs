import path from 'node:path';

// Ces fixtures vivent exclusivement dans des contextes temporaires. Aucun profil,
// cookie ou stockage de l’utilisateur n’est ouvert, effacé ou réutilisé.
const SAVE_KEY = 'nexus-of-torment-save-v1';
const contextOptions = {
  viewport:{ width:1280, height:800 }, deviceScaleFactor:1,
  serviceWorkers:'block', acceptDownloads:true
};

async function menuReady(page) {
  await page.waitForFunction(() => {
    const fallback = document.querySelector('#webgl-fallback');
    return window.nexusGame?.state === 'menu' || Boolean(fallback && !fallback.classList.contains('hidden'));
  }, null, { timeout:15000 });
  const failure = await page.evaluate(() => window.nexusGame?.state === 'menu' ? null :
    document.querySelector('#webgl-fallback')?.textContent?.trim() || 'Nexus non initialisé');
  if (failure) throw new Error('Audit stockage : ' + failure);
}

async function readDownload(page, selector) {
  const pending = page.waitForEvent('download', { timeout:10000 });
  await page.locator(selector).click();
  const download = await pending;
  const failure = await download.failure();
  if (failure) throw new Error('Téléchargement de sauvegarde refusé : ' + failure);
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Flux du téléchargement de sauvegarde indisponible.');
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return { filename:download.suggestedFilename(), bytes:Buffer.concat(chunks) };
}

export async function auditStorageTabs(browser, verify, url, shots, observePage) {
  const context = await browser.newContext(contextOptions);
  try {
    const owner = await context.newPage();
    observePage(owner, 'storage-owner');
    const response = await owner.goto(url, { waitUntil:'domcontentloaded', timeout:20000 });
    if (!response?.ok()) throw new Error('HTTP audit stockage : ' + response?.status());
    await menuReady(owner);
    const baseline = await owner.evaluate(() => {
      const save = window.nexusGame.save;
      save.data.shards = 19;
      const saved = save.save();
      return { saved, key:save.key, shards:save.data.shards, raw:localStorage.getItem(save.key) };
    });
    verify('Multi-onglets : dossier initial réellement enregistré à 19 fragments',
      baseline.saved && baseline.key === SAVE_KEY && JSON.parse(baseline.raw).shards === 19);

    const stale = await context.newPage();
    observePage(stale, 'storage-stale');
    await stale.goto(url, { waitUntil:'domcontentloaded', timeout:20000 });
    await menuReady(stale);
    const loaded = await stale.evaluate(() => ({
      shards:window.nexusGame.save.data.shards,
      conflict:window.nexusGame.save.status.conflict,
      blocked:Boolean(window.nexusGame.persistenceBlocked)
    }));
    verify('Multi-onglets : deuxième page charge la même base sans conflit',
      loaded.shards === 19 && !loaded.conflict && !loaded.blocked, loaded);

    // Ce setItem vient de SaveStore dans A. B doit recevoir le véritable événement
    // storage du navigateur : aucun dispatchEvent ni appel de son garde ici.
    const latest = await owner.evaluate(() => {
      const save = window.nexusGame.save;
      save.data.shards = 21;
      return { saved:save.save(), raw:localStorage.getItem(save.key) };
    });
    if (!latest.saved) throw new Error('Le premier onglet n’a pas enregistré ses 21 fragments.');
    await stale.waitForFunction(() => window.nexusGame?.persistenceBlocked === true &&
      window.nexusGame.save.status.conflict === true, null, { timeout:10000 });
    const conflict = await stale.evaluate(() => ({
      state:window.nexusGame.state,
      localShards:window.nexusGame.save.data.shards,
      diskShards:JSON.parse(localStorage.getItem(window.nexusGame.save.key)).shards,
      alert:document.querySelector('#save-status').textContent
    }));
    verify('Multi-onglets : vrai événement storage bloque le brouillon sans écraser 21 fragments',
      conflict.state === 'menu' && conflict.localShards === 19 && conflict.diskShards === 21 &&
      /AUTRE ONGLET/.test(conflict.alert) && await stale.locator('#save-status').isVisible(), conflict);

    await stale.bringToFront();
    await stale.locator('#start-button').click();
    verify('Multi-onglets : bouton de lancement refusé sans cacher le dossier',
      await stale.locator('#main-menu').isVisible() && await stale.evaluate(raw =>
        window.nexusGame.state === 'menu' && localStorage.getItem(window.nexusGame.save.key) === raw, latest.raw));
    await stale.locator('#settings-button').click();
    const oldVolume = Number(await stale.locator('#volume').inputValue());
    await stale.locator('#volume').focus();
    await stale.locator('#volume').press(oldVolume > 0 ? 'ArrowLeft' : 'ArrowRight');
    await stale.waitForFunction(before => window.nexusGame.settings.volume !== before,
      oldVolume, { timeout:5000 });
    const draft = await stale.evaluate(raw => ({
      exported:window.nexusGame.save.exportJSON(),
      shards:window.nexusGame.save.data.shards,
      volume:window.nexusGame.save.data.settings.volume,
      unchangedDisk:localStorage.getItem(window.nexusGame.save.key) === raw,
      conflict:window.nexusGame.save.status.conflict
    }), latest.raw);
    verify('Multi-onglets : réglage clavier conserve le brouillon et refuse sa persistance',
      draft.volume !== oldVolume && draft.shards === 19 && draft.unchangedDisk && draft.conflict &&
      await stale.locator('#save-import').isDisabled(), { shards:draft.shards, volume:draft.volume, unchangedDisk:draft.unchangedDisk });
    const download = await readDownload(stale, '#save-export');
    verify('Multi-onglets : export téléchargé contient exactement le brouillon local',
      /^nexus-dossier-.*\.json$/.test(download.filename) && download.bytes.equals(Buffer.from(draft.exported,'utf8')) &&
      JSON.parse(download.bytes.toString('utf8')).shards === 19, { filename:download.filename, bytes:download.bytes.length });
    await stale.locator('#save-reload').scrollIntoViewIfNeeded();
    await stale.screenshot({ path:path.join(shots, 'v1.2-storage-conflict.png') });
    await stale.locator('#save-reload').click();
    verify('Multi-onglets : relecture du dossier protégée par confirmation',
      await stale.locator('#confirm-screen').isVisible() &&
      await stale.evaluate(raw => localStorage.getItem(window.nexusGame.save.key) === raw, latest.raw));
    const reloaded = stale.waitForEvent('domcontentloaded', { timeout:20000 });
    await stale.locator('#confirm-accept').click();
    await reloaded;
    await menuReady(stale);
    const restored = await stale.evaluate(raw => ({
      shards:window.nexusGame.save.data.shards,
      conflict:window.nexusGame.save.status.conflict,
      blocked:Boolean(window.nexusGame.persistenceBlocked),
      unchangedDisk:localStorage.getItem(window.nexusGame.save.key) === raw
    }), latest.raw);
    verify('Multi-onglets : rechargement confirmé adopte 21 fragments et lève le blocage',
      restored.shards === 21 && !restored.conflict && !restored.blocked && restored.unchangedDisk &&
      await stale.locator('#save-status').isHidden(), restored);
  } finally {
    await context.close();
  }
}

export async function auditFutureSave(browser, verify, url, shots, observePage) {
  const context = await browser.newContext(contextOptions);
  try {
    const page = await context.newPage();
    observePage(page, 'future-save');
    // Espaces, Unicode et CRLF permettent de détecter une re-sérialisation de la
    // copie brute. Le champ futur est volontairement inconnu de cette application.
    const raw = '{\r\n  "version": 999,\r\n  "shards": 29,\r\n  "futureProgression": { "chapter": 4, "note": "Mémoire — à conserver" }\r\n}\r\n';
    const previousRecovery = 'secours préexistant — inchangé';
    await page.addInitScript(({key,raw,previousRecovery}) => {
      if (sessionStorage.getItem('nexus-qa-future-seeded')) return;
      localStorage.setItem(key,raw);
      localStorage.setItem(key+':recovery',previousRecovery);
      sessionStorage.setItem('nexus-qa-future-seeded','1');
    }, {key:SAVE_KEY,raw,previousRecovery});
    const response = await page.goto(url, { waitUntil:'domcontentloaded', timeout:20000 });
    if (!response?.ok()) throw new Error('HTTP audit version future : ' + response?.status());
    await menuReady(page);
    const protectedSave = await page.evaluate(({raw,previousRecovery}) => {
      const game = window.nexusGame;
      return {
        futureVersion:game.save.status.futureVersion,
        blocked:game.persistenceBlocked,
        backupExact:game.save.recoveryBackup === raw,
        diskExact:localStorage.getItem(game.save.key) === raw,
        recoveryExact:localStorage.getItem(game.save.key+':recovery') === previousRecovery,
        alert:document.querySelector('#save-status').textContent
      };
    }, {raw,previousRecovery});
    verify('Version future : dossier 999 protégé dès le démarrage et avertissement visible',
      protectedSave.futureVersion === 999 && protectedSave.blocked && protectedSave.backupExact &&
      protectedSave.diskExact && protectedSave.recoveryExact && /VERSION PLUS RÉCENTE/.test(protectedSave.alert) &&
      await page.locator('#save-status').isVisible(), protectedSave);
    await page.locator('#start-button').click();
    verify('Version future : lancement UI refusé et écriture SaveStore bloquée',
      await page.locator('#main-menu').isVisible() && await page.evaluate(raw => {
        const game = window.nexusGame;
        return game.state === 'menu' && game.save.save() === false && localStorage.getItem(game.save.key) === raw;
      }, raw));
    await page.locator('#settings-button').click();
    verify('Version future : copie originale accessible et import désactivé',
      await page.locator('#save-recovery-export').isVisible() && await page.locator('#save-import').isDisabled());
    const downloaded = await readDownload(page, '#save-recovery-export');
    verify('Version future : téléchargement de la copie originale exact octet pour octet',
      /^nexus-original-.*\.json$/.test(downloaded.filename) && downloaded.bytes.equals(Buffer.from(raw,'utf8')),
      { filename:downloaded.filename, bytes:downloaded.bytes.length });
    await page.locator('#save-recovery-export').scrollIntoViewIfNeeded();
    await page.screenshot({ path:path.join(shots,'v1.2-future-save.png') });
    verify('Version future : export et actions UI ne modifient ni dossier ni secours',
      await page.evaluate(({raw,previousRecovery}) => {
        const game = window.nexusGame;
        return game.save.status.futureVersion === 999 && game.persistenceBlocked &&
          localStorage.getItem(game.save.key) === raw && localStorage.getItem(game.save.key+':recovery') === previousRecovery;
      }, {raw,previousRecovery}));
  } finally {
    await context.close();
  }
}
