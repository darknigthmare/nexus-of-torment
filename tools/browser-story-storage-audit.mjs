// Extension de la QA Chrome : le contexte fourni appartient au harnais, jamais
// au profil utilisateur. Seul l'onglet pair créé ici sera fermé par ce helper.
export async function auditStoryConflict(context, page, verify, observePage = null) {
  const before = await page.evaluate(() => {
    const game = window.nexusGame;
    const snapshot = game._snapshotActiveRun();
    delete snapshot.savedAt;
    return {
      state:game.state, pending:game.story?.pendingChoiceId,
      blocked:Boolean(game.persistenceBlocked), key:game.save.key,
      runtime:JSON.stringify({state:game.state,pending:game.pendingStoryChoice?.id,snapshot}),
      memory:JSON.stringify(game.save.data), exported:game.save.exportJSON(),
      raw:localStorage.getItem(game.save.key), shards:game.save.data.shards
    };
  });
  verify('Histoire / conflit : choix du protocole et checkpoint présents avant le second onglet',
    before.state === 'story-choice' && before.pending === 'protocol' && !before.blocked &&
    Boolean(before.raw) && JSON.parse(before.raw).activeRun?.story?.pendingChoiceId === 'protocol' &&
    await page.locator('#story-choice-screen').isVisible());

  let peer;
  const peerErrors = [];
  try {
    peer = await context.newPage();
    peer.on('pageerror', error => peerErrors.push(String(error.message || error)));
    observePage?.(peer, 'story-storage-peer');
    const response = await peer.goto(page.url(), {waitUntil:'networkidle',timeout:20000});
    if (!response?.ok()) throw new Error('HTTP onglet pair histoire : ' + response?.status());
    await peer.waitForFunction(() => window.nexusGame?.state === 'menu' ||
      !document.querySelector('#webgl-fallback')?.classList.contains('hidden'), null, {timeout:15000});
    const latest = await peer.evaluate(key => {
      const game = window.nexusGame;
      if (game?.state !== 'menu') throw new Error('Le second onglet Nexus n’a pas atteint le menu.');
      const save = game.save;
      if (save.key !== key) throw new Error('Clé de sauvegarde différente entre les deux onglets.');
      save.data.shards += 1;
      return {saved:save.save(),shards:save.data.shards,raw:localStorage.getItem(key)};
    }, before.key);
    if (!latest.saved) throw new Error('Le second onglet n’a pas enregistré son nouveau dossier.');
    // L'événement storage doit venir du navigateur : aucun événement synthétique
    // ni appel direct du garde de l'onglet principal ne remplace ce parcours.
    await page.waitForFunction(() => window.nexusGame?.persistenceBlocked === true &&
      window.nexusGame.save.status.conflict === true, null, {timeout:10000});
    await page.bringToFront();
    verify('Histoire / conflit : vraie écriture distante reçue sans remplacer le brouillon',
      latest.shards === before.shards + 1 && await page.evaluate(({memory,raw}) =>
        JSON.stringify(window.nexusGame.save.data) === memory &&
        localStorage.getItem(window.nexusGame.save.key) === raw, {memory:before.memory,raw:latest.raw}) &&
      await page.locator('#save-status').isVisible());

    await page.locator('[data-story-option="seal"]').click();
    const refused = await page.evaluate(({runtime,memory,raw}) => {
      const game = window.nexusGame, snapshot = game._snapshotActiveRun();
      delete snapshot.savedAt;
      return {
        blocked:game.persistenceBlocked,
        unchangedRuntime:JSON.stringify({state:game.state,pending:game.pendingStoryChoice?.id,snapshot}) === runtime,
        unchangedMemory:JSON.stringify(game.save.data) === memory,
        unchangedDisk:localStorage.getItem(game.save.key) === raw
      };
    }, {runtime:before.runtime,memory:before.memory,raw:latest.raw});
    verify('Histoire / conflit : clic réel sur le choix refusé sans coût, bonus ni faux combat figé',
      refused.blocked && refused.unchangedRuntime && refused.unchangedMemory && refused.unchangedDisk &&
      await page.locator('#story-choice-screen').isVisible(), refused);

    await page.locator('#story-choice-settings').click();
    verify('Histoire / conflit : réglages et export accessibles, import toujours interdit',
      await page.locator('#settings-screen').isVisible() &&
      await page.locator('#save-export').isEnabled() && await page.locator('#save-import').isDisabled());
    const pendingDownload = page.waitForEvent('download', {timeout:10000});
    await page.locator('#save-export').click();
    const download = await pendingDownload, failure = await download.failure();
    if (failure) throw new Error('Export du choix suspendu refusé : ' + failure);
    const stream = await download.createReadStream();
    if (!stream) throw new Error('Flux d’export du choix suspendu indisponible.');
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    verify('Histoire / conflit : téléchargement exact du brouillon avant décision',
      /^nexus-dossier-.*\.json$/.test(download.suggestedFilename()) &&
      bytes.equals(Buffer.from(before.exported,'utf8')) &&
      JSON.parse(bytes.toString('utf8')).activeRun?.story?.pendingChoiceId === 'protocol',
      {filename:download.suggestedFilename(),bytes:bytes.length});
    await page.locator('[data-close="settings-screen"]').click();
    verify('Histoire / conflit : retour au choix bloqué, checkpoint distant intact pour la reprise',
      await page.locator('#settings-screen').isHidden() && await page.locator('#story-choice-screen').isVisible() &&
      await page.evaluate(({memory,raw}) => {
        const game = window.nexusGame;
        return game.state === 'story-choice' && game.persistenceBlocked && game.story.pendingChoiceId === 'protocol' &&
          JSON.stringify(game.save.data) === memory && localStorage.getItem(game.save.key) === raw;
      }, {memory:before.memory,raw:latest.raw}) && peerErrors.length === 0, {peerErrors});
    return {latestRaw:latest.raw,localShards:before.shards,remoteShards:latest.shards};
  } finally {
    if (peer) await peer.close();
  }
}
