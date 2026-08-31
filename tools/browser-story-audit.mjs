import path from 'node:path';
import { auditStoryConflict } from './browser-story-storage-audit.mjs';

// Parcours dans le vrai Chrome. Les combats sont accélérés explicitement par
// dégâts de fixture et déplacements vers les zones : ce n’est pas un playtest humain.
async function activateFixture(page) {
  await page.evaluate(() => {
    const g=window.nexusGame;
    g.input.touchMode=true; g.input.exitLock();
    if (g.state==='paused' || g.state==='input-paused') { g.state='playing'; g.ui.enterGame(); }
    g.player.invulnerable=120;
  });
  // Un clic de greffe/décision demande le pointeur de façon asynchrone. La
  // fixture tactile doit attendre sa sortie réelle avant d'envoyer la touche E.
  // Sinon pointerlockchange efface légitimement cette entrée anti-touche collée.
  await page.waitForFunction(()=>!document.pointerLockElement && !window.nexusGame.input.pointerLocked && !window.nexusGame.input.lockRequestPending);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function ready(page) {
  await page.waitForFunction(()=>window.nexusGame?.state==='menu',null,{timeout:15000});
}
async function collectArchive(page, id, touch=false) {
  await page.evaluate(archiveId=>{
    const g=window.nexusGame, a=g.storyArchives.find(item=>item.id===archiveId);
    const approach=g.arena.findSafePosition([a.position.x,a.position.y,a.position.z+1.5],g.player.radius);
    g.player.position.copy(approach); g.player.velocity.set(0,0,0);g.player.hitVelocity.set(0,0,0);
    g.camera.yaw=0; g.camera.pitch=.07; g.player.invulnerable=120;
    g.ui.updateHUD();
  },id);
  await page.waitForFunction(archiveId=>window.nexusGame._interactionTarget()?.id===archiveId,id,{timeout:3000});
  if (touch) await page.locator('[data-key="KeyE"]').tap();
  else await page.keyboard.press('e',{delay:80});
  await page.waitForFunction(archiveId=>window.nexusGame.save.data.progression.archives[archiveId],id,{timeout:3000});
}

async function completeOffice(page) {
  return page.evaluate(()=>{
    const g=window.nexusGame, type=g.waveObjective.type, sector=g.sectorId;
    const eliminate=enemy=>{ enemy.spawnTimer=0; enemy.takeDamage(1e7,{zone:'head',headMultiplier:1,source:'qa-story-fixture'}); };
    const queue=g.spawnQueue.splice(0); g.spawnsRemaining=0;
    for(const entry of queue) eliminate(g.spawnEnemy(entry.type,null,{instant:true,elite:entry.elite,marked:entry.marked}));
    for(const enemy of g.enemies.filter(e=>e.alive)) eliminate(enemy);
    // Traverser vraiment les états d’objectif, sans forcer phase/progress/remaining.
    let guard=0;
    while(['hold','hunt','relay','transport'].includes(type) && g.waveObjective.phase==='active' && guard++<800) {
      if(g.waveObjective.position) g.player.position.copy(g.waveObjective.position);
      g._updateWaveObjective(.1);
      for(const enemy of g.enemies.filter(e=>e.alive)) eliminate(enemy);
    }
    if(guard>=800) throw new Error('Objectif bloqué : '+type);
    if(g.wave===10) {
      if(!g.extractionActive) throw new Error('Extraction absente après Archidiacre');
      g.player.position.copy(g.extractionZone.position);
      for(let frame=0;frame<40 && g.state!=='victory';frame++) g._updateExtraction(.1);
    } else {
      if(!g._canCompleteWave()) throw new Error('Office non terminable : '+JSON.stringify({wave:g.wave,type,active:g.waveActive,phase:g.waveObjective.phase,remaining:g.waveObjective.remaining,queue:g.spawnQueue.length,alive:g.enemies.filter(e=>e.alive).map(e=>({type:e.type,health:e.health,spawn:e.spawnTimer}))}));
      g._completeWave(); g._presentUpgrades();
    }
    return {wave:g.wave,type,sector,state:g.state,checkpoint:g.save.data.activeRun?.nextWave,issues:g.save.status.recovered};
  });
}

export async function auditStory(browser,verify,url,shots,observePage) {
  const context=await browser.newContext({viewport:{width:1280,height:720},colorScheme:'dark',serviceWorkers:'allow'});
  const page=await context.newPage(); observePage(page,'story');
  try {
    await page.goto(url,{waitUntil:'domcontentloaded'}); await ready(page);
    verify('Histoire proposée avec trajet imposé et vingt accomplissements',await page.evaluate(()=>{
      const g=window.nexusGame;
      return document.querySelector('#mode').value==='story' && document.querySelector('#sector').disabled && window.NT.Progression.summary(g.save.data.progression).total===20;
    }));
    await page.locator('#codex-button').click(); await page.locator('[data-tab="journal"]').click();
    verify('Journal neuf sans révéler les missions et fins futures',await page.locator('#codex-content').evaluate(el=>/Arrêt de travail/.test(el.textContent) && !/Les noms sortent|Les trois relais/.test(el.textContent)));
    await page.screenshot({path:path.join(shots,'v1.3-journal-new.png')});
    await page.locator('[data-close="codex-screen"]').click();
    const variants=[['seal','purge','sealed','containment','bulwark'],['listen','preserve','witness','unstable','executioner'],['seal','preserve','scar','red','occultist'],['listen','purge','scar','nexus','bulwark']];
    for(let run=0;run<variants.length;run++) {
      const [protocol,testimony,ending,difficulty,doctrine]=variants[run];
      if(run) { await page.locator('#victory-menu').click(); }
      await page.locator('#mode').selectOption('story'); await page.locator('#difficulty').selectOption(difficulty);
      await page.locator('[data-class="'+doctrine+'"]').click(); await page.locator('#start-button').click();
      await activateFixture(page);
      const itinerary=[];
      for(let wave=1;wave<=10;wave++) {
        if(run===0 && [1,4,7].includes(wave)) {
          const archives=await page.evaluate(()=>window.nexusGame.storyArchives.filter(a=>!a.collected).map(a=>a.id));
          for(const id of archives) await collectArchive(page,id);
          verify('Archives physiques du chapitre '+wave+' récupérées avec E',await page.evaluate(ids=>ids.every(id=>window.nexusGame.save.data.progression.archives[id]),archives));
        }
        if(wave===4 && run===0) {
          verify('Relais : trois positions distinctes dans la Nef',await page.evaluate(()=>{const o=window.nexusGame.waveObjective; return o.type==='relay' && o.total===3 && new Set(o.positions.map(p=>p.x+':'+p.z)).size===3;}));
          await page.evaluate(()=>{
            const g=window.nexusGame, target=g.waveObjective.position;
            // Rester dans le dégagement du sceau : un point libre plus éloigné
            // peut placer une caisse entre la caméra et le relais photographié.
            const approach=g.arena.findSafePosition([target.x,0,target.z+2.2],g.player.radius);
            g.player.position.copy(approach);g.player.velocity.set(0,0,0);g.player.hitVelocity.set(0,0,0);
            g.camera.position.set(approach.x,approach.y+g.player.eyeHeight,approach.z);
            const dx=target.x-approach.x,dz=target.z-approach.z;
            g.camera.yaw=Math.atan2(dx,-dz);g.camera.pitch=Math.atan2(.15-g.player.eyeHeight,Math.hypot(dx,dz));g.render();
          });
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          await page.screenshot({path:path.join(shots,'v1.3-story-relays.png')});
        }
        if(wave===7) {
          await page.evaluate(()=>{const g=window.nexusGame;g.player.position.copy(g.waveObjective.pickupPosition);g.player.velocity.set(0,0,0);g.player.hitVelocity.set(0,0,0);g.player.hookTimer=0;g.player.invulnerable=120;g.enemies.forEach(e=>e.stunTimer=2);g.ui.updateHUD();});
          await page.waitForFunction(()=>window.nexusGame._interactionTarget()?.type==='transport');
          await page.keyboard.press('e',{delay:80});
          await page.waitForFunction(()=>window.nexusGame.waveObjective.carrying,null,{timeout:3000});
          verify('Transport réel via E et marche ralentie · '+difficulty,await page.evaluate(()=>window.nexusGame.storyMoveSpeedMultiplier()===.78 && window.nexusGame.waveObjective.position===window.nexusGame.waveObjective.deliveryPosition));
        }
        itinerary.push(await completeOffice(page));
        if(wave===10) break;
        await page.locator('.upgrade-card').first().click();
        if(wave===3 || wave===6) {
          await page.locator('#story-choice-screen').waitFor({state:'visible'});
          if(run===0 && wave===3) {
            verify('Décision affiche bénéfice, coût et lecture sans délai',await page.locator('#story-choice-options').evaluate(el=>/30 armure/.test(el.textContent)&&/15 santé/.test(el.textContent)));
            await page.screenshot({path:path.join(shots,'v1.3-story-choice.png')});
            await page.locator('#story-choice-journal').click();
            verify('Décision : journal consultable sans choisir ni reprendre',await page.evaluate(()=>window.nexusGame.state==='story-choice'&&window.nexusGame.ui.currentCodexTab==='journal'&&!window.nexusGame.story.choices.protocol));
            await page.locator('[data-close="codex-screen"]').click();
            verify('Décision : retour du journal avec focus restauré',await page.locator('#story-choice-journal').evaluate(el=>el===document.activeElement));
            await page.locator('#story-choice-settings').focus(); await page.keyboard.press('Tab');
            verify('Clavier contenu dans la décision',await page.locator('[data-story-option]').first().evaluate(el=>el===document.activeElement));
            const before=await page.evaluate(()=>JSON.stringify(window.nexusGame.save.data.activeRun));
            await page.keyboard.press('Escape');
            verify('Échap ne choisit pas et ne reprend pas le combat',await page.evaluate(()=>window.nexusGame.state==='story-choice'&&!window.nexusGame.story.choices.protocol));
            await auditStoryConflict(context,page,verify,observePage);
            await page.reload({waitUntil:'domcontentloaded'}); await ready(page); await page.locator('#continue-button').click();
            await page.locator('#story-choice-screen').waitFor({state:'visible'});
            verify('Reprise au choix non résolu sans fausse réparation',await page.evaluate(raw=>{const g=window.nexusGame,old=JSON.parse(raw);return g.story.pendingChoiceId==='protocol'&&!g.save.status.recovered&&g.player.maxHealth===old.player.maxHealth&&g.player.maxArmor===old.player.maxArmor;},before));
          }
          await page.locator('[data-story-option="'+(wave===3?protocol:testimony)+'"]').click();
          verify('Décision conservée et intermission disponible · '+run+'/'+wave,await page.evaluate(({key,value})=>{const g=window.nexusGame;return g.intermissionActive&&g.save.data.activeRun.story.choices[key]===value&&!g.save.status.recovered;},{key:wave===3?'protocol':'testimony',value:wave===3?protocol:testimony}));
        }
        await activateFixture(page);
        await page.evaluate(()=>{const g=window.nexusGame;g.intermissionReadyDelay=0;g._startWaveFromIntermission();g.player.invulnerable=120;});
      }
      verify('Histoire complète assistée, trois secteurs et fin '+ending+' · '+difficulty,itinerary.map(x=>x.sector).join(',')==='sanctum,sanctum,sanctum,nave,nave,nave,ossuary,ossuary,ossuary,ossuary'&&itinerary.at(-1).state==='victory',itinerary);
      verify('Épilogue affiché et persisté · '+protocol+'/'+testimony,await page.evaluate(id=>{const g=window.nexusGame;return g.save.data.progression.endings[id] && document.querySelector('.epilogue').textContent.includes(window.NT.Story.ENDINGS[id].title) && !g.save.data.activeRun;},ending));
      if(run===1) await page.screenshot({path:path.join(shots,'v1.3-story-ending.png')});
    }
    await page.locator('#victory-journal').click(); await page.locator('[data-tab="completion"]').click();
    verify('Trois fins et six archives visibles dans le dossier',await page.evaluate(()=>{const s=window.NT.Progression.summary(window.nexusGame.save.data.progression);return s.archives.completed===6&&s.endings.completed===3&&s.storyWave===10&&document.querySelectorAll('.completion-card').length===20;}));
    await page.screenshot({path:path.join(shots,'v1.3-completion.png')});
    const raw=await page.evaluate(()=>window.nexusGame.save.exportJSON());
    await page.reload({waitUntil:'domcontentloaded'}); await ready(page);
    verify('Dossier narratif persistant après rechargement sans réparation',await page.evaluate(before=>window.nexusGame.save.exportJSON()===before&&!window.nexusGame.save.status.recovered,raw));
  } catch(error) {
    const state=await page.evaluate(()=>{const g=window.nexusGame;return {state:g.state,wave:g.wave,sector:g.sectorId,story:g.story,save:g.save.status,position:g.player.position,interaction:g.interactionPrompt(),target:g._interactionTarget()?.id,keys:[...g.input.keys],touch:g.input.touchMode,enabled:g.input.enabled,focus:document.activeElement?.outerHTML?.slice(0,240),archives:g.storyArchives.map(a=>({id:a.id,position:a.position,collected:a.collected}))};}).catch(()=>null);
    await page.screenshot({path:path.join(shots,'v1.3-story-failure.png')}).catch(()=>{});
    error.stack+='\nÉtat histoire : '+JSON.stringify(state); throw error;
  } finally { await context.close(); }

  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,colorScheme:'dark'});
  const touch=await mobile.newPage(); observePage(touch,'story-mobile');
  try {
    await touch.goto(url,{waitUntil:'domcontentloaded'}); await ready(touch);
    await touch.locator('#start-button').tap();
    await touch.evaluate(()=>{window.nexusGame.player.invulnerable=120;});
    const id=await touch.evaluate(()=>window.nexusGame.storyArchives[0].id);
    await collectArchive(touch,id,true);
    verify('Archive tactile récupérée par le bouton Interagir',await touch.evaluate(archiveId=>window.nexusGame.save.data.progression.archives[archiveId],id));
    await touch.locator('#touch-pause').tap(); await touch.locator('#pause-journal').tap();
    verify('Journal tactile consultable sans relancer le combat',await touch.evaluate(()=>window.nexusGame.state==='paused'&&document.documentElement.scrollWidth<=innerWidth));
    await touch.screenshot({path:path.join(shots,'v1.3-mobile-journal.png')});
    await touch.locator('[data-close="codex-screen"]').tap(); await touch.locator('#resume-button').tap();
    // Fixture de frontière : vraie greffe puis vrai checkpoint et vrais boutons du choix.
    await touch.evaluate(()=>{const g=window.nexusGame;g.enemies.length=0;g.spawnQueue.length=0;g.wave=3;g.pendingUpgrade=true;g._presentUpgrades();});
    await touch.locator('.upgrade-card').first().tap();
    const layout=await touch.locator('#story-choice-options').evaluate(el=>({width:document.documentElement.scrollWidth,viewport:innerWidth,buttons:[...el.querySelectorAll('button')].map(b=>({width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height,text:b.textContent}))}));
    verify('Décision mobile lisible, coûts présents et cibles tactiles dimensionnées',layout.width<=layout.viewport&&layout.buttons.length===2&&layout.buttons.every(b=>b.width>=44&&b.height>=44&&/Bénéfice.*Coût/.test(b.text)),layout);
    await touch.screenshot({path:path.join(shots,'v1.3-mobile-choice.png')});
    await touch.locator('#story-choice-journal').tap();
    verify('Décision tactile : journal accessible après défilement sans effet',await touch.evaluate(()=>window.nexusGame.state==='story-choice'&&window.nexusGame.ui.currentCodexTab==='journal'&&!window.nexusGame.story.choices.protocol));
    await touch.locator('[data-close="codex-screen"]').tap();
    await touch.locator('#story-choice-settings').tap();
    verify('Décision tactile : réglages accessibles sans débordement',await touch.locator('#settings-screen').isVisible()&&await touch.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await touch.locator('[data-close="settings-screen"]').tap();
    await touch.locator('[data-story-option="listen"]').tap();
    verify('Décision tactile mène à la Nef avec choix sauvegardé',await touch.evaluate(()=>{const g=window.nexusGame;return g.sectorId==='nave'&&g.story.choices.protocol==='listen'&&g.save.data.activeRun.story.choices.protocol==='listen'&&!g.save.status.recovered;}));
  } finally { await mobile.close(); }
}
