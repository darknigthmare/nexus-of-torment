// Contexte jetable : le navigateur, les profils utilisateur et les autres
// parcours ne sont jamais fermés ou nettoyés par cette régression.
export async function auditUpgradeConflict(browser, verify, url, observePage = null) {
  const context = await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block',acceptDownloads:true});
  const errors = [];
  const observe = (page,label) => {
    page.on('pageerror',error=>errors.push(String(error.message || error)));
    observePage?.(page,label);
  };
  const ready = page => page.waitForFunction(()=>window.nexusGame?.state==='menu',null,{timeout:15000});
  try {
    const page = await context.newPage(); observe(page,'upgrade-conflict');
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000}); await ready(page);
    await page.locator('#mode').selectOption('story'); await page.locator('#start-button').click();
    // Frontière assistée explicitement : checkpoint avant l'office 3, puis vraie
    // présentation des greffes. Ce n'est pas une victoire de combat sans aide.
    const before = await page.evaluate(()=>{
      const g=window.nexusGame;
      g.input.exitLock(); g.input.clearPhysicalInputs(); g.input.clearVirtualInputs();
      g.state='playing'; g.wave=2; g.enemies.length=0; g.spawnQueue.length=0;
      g.player.position.copy(g.arena.findSafePosition(g.player.position,g.player.radius));
      g._beginIntermission();
      if (g.save.status.dirty || g.save.status.recovered) throw new Error('Checkpoint préalable de greffe non confirmé.');
      g.wave=3; g.intermissionActive=false; g.pendingUpgrade=true; g._presentUpgrades();
      const snapshot=g._snapshotActiveRun(); delete snapshot.savedAt;
      return {runtime:JSON.stringify(snapshot),memory:JSON.stringify(g.save.data),exported:g.save.exportJSON(),shards:g.save.data.shards,key:g.save.key};
    });
    verify('Greffe / conflit : vraie sélection présentée après checkpoint de fixture valide',
      await page.locator('#upgrade-screen').isVisible() && await page.locator('#upgrade-settings').isVisible() &&
      await page.evaluate(()=>window.nexusGame.state==='upgrade'&&typeof window.nexusGame.ui.upgradeCallback==='function'));
    const peer = await context.newPage(); observe(peer,'upgrade-conflict-peer');
    await peer.goto(url,{waitUntil:'domcontentloaded',timeout:20000}); await ready(peer);
    const latest = await peer.evaluate(key=>{
      const save=window.nexusGame.save;
      if (save.key!==key) throw new Error('Clés de dossier différentes.');
      save.data.shards+=1;
      if (!save.save()) throw new Error('Écriture distante refusée.');
      return {raw:localStorage.getItem(key),shards:save.data.shards};
    },before.key);
    await page.waitForFunction(()=>window.nexusGame.persistenceBlocked&&window.nexusGame.save.status.conflict,null,{timeout:10000});
    await page.bringToFront();
    verify('Greffe / conflit : événement storage réel protège le dossier distant',
      latest.shards===before.shards+1 && await page.evaluate(({memory,raw})=>
        window.nexusGame.state==='upgrade'&&JSON.stringify(window.nexusGame.save.data)===memory&&
        localStorage.getItem(window.nexusGame.save.key)===raw,{memory:before.memory,raw:latest.raw}));
    await page.locator('.upgrade-card').first().click();
    await page.keyboard.press('2');
    const blocked = await page.evaluate(({runtime,memory,raw})=>{
      const g=window.nexusGame,snapshot=g._snapshotActiveRun();delete snapshot.savedAt;
      return {state:g.state,blocked:g.persistenceBlocked,callback:typeof g.ui.upgradeCallback==='function',
        sameRuntime:JSON.stringify(snapshot)===runtime,sameMemory:JSON.stringify(g.save.data)===memory,
        sameDisk:localStorage.getItem(g.save.key)===raw};
    },{runtime:before.runtime,memory:before.memory,raw:latest.raw});
    verify('Greffe / conflit : clic et raccourci refusés sans mutation ni disparition du choix',
      blocked.state==='upgrade'&&blocked.blocked&&blocked.callback&&blocked.sameRuntime&&blocked.sameMemory&&blocked.sameDisk&&
      await page.locator('#upgrade-screen').isVisible(),blocked);
    await page.locator('#upgrade-settings').click();
    verify('Greffe / conflit : réglages de récupération accessibles et import interdit',
      await page.locator('#settings-screen').isVisible()&&await page.locator('#save-export').isEnabled()&&
      await page.locator('#save-import').isDisabled()&&await page.locator('#save-reload').isVisible());
    const pending = page.waitForEvent('download',{timeout:10000}); await page.locator('#save-export').click();
    const download=await pending,failure=await download.failure();
    if(failure) throw new Error('Export de greffe refusé : '+failure);
    const stream=await download.createReadStream(); if(!stream) throw new Error('Flux du dossier exporté absent.');
    const chunks=[];for await(const chunk of stream) chunks.push(Buffer.from(chunk));const bytes=Buffer.concat(chunks);
    verify('Greffe / conflit : export téléchargé exact du brouillon conservé',
      /^nexus-dossier-.*\.json$/.test(download.suggestedFilename())&&bytes.equals(Buffer.from(before.exported,'utf8')),
      {filename:download.suggestedFilename(),bytes:bytes.length});
    await page.locator('[data-close="settings-screen"]').click();
    verify('Greffe / conflit : retour avec focus au choix bloqué et dossier inchangé',
      await page.locator('#settings-screen').isHidden()&&await page.locator('#upgrade-screen').isVisible()&&
      await page.locator('#upgrade-settings').evaluate(el=>el===document.activeElement)&&
      await page.evaluate(({memory,raw})=>{
        const g=window.nexusGame;return g.state==='upgrade'&&g.persistenceBlocked&&typeof g.ui.upgradeCallback==='function'&&
          JSON.stringify(g.save.data)===memory&&localStorage.getItem(g.save.key)===raw;
      },{memory:before.memory,raw:latest.raw})&&errors.length===0,{errors});
  } finally { await context.close(); }
}
