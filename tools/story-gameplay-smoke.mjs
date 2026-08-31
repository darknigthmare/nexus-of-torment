import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const disk = new Map(); let blockedStorage = false;
// Snapshot equality tests compare gameplay state, not wall-clock scheduling.
// Keep the persisted savedAt field intact under a deterministic VM clock.
const fixedNow = Date.UTC(2026,7,31,12);
class FixtureDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixedNow])); }
  static now() { return fixedNow; }
}
const context = vm.createContext({
  window:{}, console, setTimeout, clearTimeout, structuredClone, Date:FixtureDate, performance:{now:() => 0},
  document:{dispatchEvent() {},body:{classList:{toggle() {}}}},
  CustomEvent:class { constructor(type, options) {this.type=type;this.detail=options?.detail;} },
  localStorage:{getItem:key => disk.get(key) ?? null,setItem(key,value) {if (blockedStorage) throw new Error('QuotaExceededError');disk.set(key,value);}}
});
for (const relative of ['src/core/math.js','src/core/engine.js','src/game/data.js','src/game/story.js','src/game/progression.js','src/game/arena.js','src/game/entities.js','src/game/weapons.js','src/game/game.js']) {
  vm.runInContext(fs.readFileSync(path.join(root,relative),'utf8'),context,{filename:relative});
}
vm.runInContext('Math.random = () => .5',context);
const NT = context.window.NT, {Vec3} = NT.Math;
const noop = () => {};
const meshes = new Proxy({}, {get:(target,id) => target[id] || (target[id]={name:String(id)})});
let passed = 0, failed = 0, serial = 0;
function test(label, run) {
  try {run(); passed++; console.log('OK  '+label);}
  catch (error) {failed++;console.error('FAIL '+label+' : '+error.stack);}
}
const json = value => JSON.stringify(value);
function defaults() {
  return {
    version:3,settings:{sensitivity:1,volume:.72,fov:82,renderScale:1,hudScale:1,shakeIntensity:1,headBob:true,reducedFlashes:false,reducedMotion:false,gore:false,invertY:false,uiContrast:false,enemyContrast:false,subtitles:true,guidedHints:true,timedUpgrades:false,bindings:NT.Engine.Input.defaultBindings()},
    shards:0,meta:Object.fromEntries(Object.keys(NT.Data.META_UPGRADES).map(id => [id,0])),codex:{enemyKills:{}},
    records:{bestWave:0,bestScore:0,lifetimeKills:0,bossKills:0,headshots:0,damage:0,runs:0,playTime:0},
    activeRun:null,progression:NT.Progression.create()
  };
}
function fixture(key = 'story-fixture-'+serial++) {
  const game = Object.create(NT.NexusGame.prototype), pressed = new Set(), held = new Set();
  Object.assign(game,{
    state:'menu',previousState:'menu',modeId:'campaign',sectorId:'sanctum',wave:0,waveActive:false,
    story:null,pendingStoryChoice:null,storyArchives:[],currentStoryMission:null,currentStoryChapter:null,
    settings:defaults().settings,time:0,runTime:0,score:0,killStreak:0,killStreakTimer:0,
    intermissionDuration:20,intermissionReadyDelay:0,pendingUpgrade:false,intermissionActive:false,
    extractionActive:false,extractionDuration:3.2,runFinalized:true,
    enemies:[],projectiles:[],pickups:[],tracers:[],arcs:[],rings:[],hallucinations:[],spawnQueue:[],
    camera:new NT.Engine.Camera(),renderer:{meshes,draw:noop},particles:{clear:noop,burst:noop,spawn:noop},
    spawnAbilityRing:noop,spawnArc:noop,spawnTracer:noop,
    audio:new Proxy({}, {get:() => noop}),
    ui:{enterGame:noop,showMainMenu:noop,announce:noop,subtitle:noop,toast:noop,update:noop,damageFlash:noop,hideStoryChoice:noop,
      showStoryChoice(choice,callback) {game.presentedChoice=choice;game.choiceCallback=callback;},
      showUpgrades(options) {game.upgradeOptions=options;},showVictory(result) {game.result=result;},showGameOver(result) {game.result=result;}},
    input:{pointerLocked:true,mouseDX:0,mouseDY:0,wheel:0,combatReady:() => true,requestLock:noop,exitLock:noop,
      keyAny:(...codes) => codes.some(code => held.has(code)),consume:code => pressed.delete(code),mouse:() => false,consumeMouse:() => false,
      clearPhysicalInputs() {pressed.clear();held.clear();},clearVirtualInputs:noop},
    save:new NT.Engine.SaveStore(key,defaults()),pressed,held
  });
  game.player = new NT.Entities.Player(game);
  game.arena = new NT.Arena(game);
  game.weapons = new NT.WeaponSystem(game);
  return game;
}
function start(difficulty='unstable', key) {const game=fixture(key);game.startRun('bulwark',difficulty,'story','nave');return game;}
function choiceBoundary(game,wave) {
  game.wave=wave;game.waveActive=false;game.pendingUpgrade=false;game.spawnQueue.length=0;game.enemies.length=0;
  game.state='upgrade';game.applyUpgrade(NT.Data.UPGRADES.find(item => item.id==='steady_hands'));
  assert.equal(game.state,'story-choice');
}
function enterChapterTwo(game,option='seal') {choiceBoundary(game,3);assert.ok(game.chooseStoryOption(option));assert.equal(game.sectorId,'nave');assert.ok(game._startWaveFromIntermission());}
function enterChapterThree(game,option='preserve') {if (!game.story.choices.protocol) enterChapterTwo(game);choiceBoundary(game,6);assert.ok(game.chooseStoryOption(option));assert.equal(game.sectorId,'ossuary');assert.ok(game._startWaveFromIntermission());}
const finiteTree = value => typeof value === 'number' ? Number.isFinite(value) : !value || typeof value !== 'object' || Object.values(value).every(finiteTree);

test('Histoire : premier chapitre forcé, mission et deux archives réellement configurées', () => {
  const game=start();
  assert.equal(game.modeId,'story');assert.equal(game.sectorId,'sanctum');assert.equal(game.wave,1);
  assert.equal(game.currentStoryChapter.id,'threshold');assert.equal(game.currentStoryMission.wave,1);
  assert.equal(game.storyArchives.length,2);assert.ok(game.storyArchives.every(archive => !archive.collected && game.arena._positionClear(archive.position,.65)));
  assert.equal(game.save.data.progression.storyWave,1);
  assert.equal(JSON.parse(disk.get(game.save.key)).progression.storyWave,1,'Journal persisté sans avancer le checkpoint');
  assert.equal(game.save.data.activeRun,null);
});

test('Modes historiques : secteur libre, purge 4 et chasse 9 inchangés', () => {
  const game=fixture();game.startRun('bulwark','unstable','campaign','nave');
  assert.equal(game.sectorId,'nave');assert.equal(game.story,null);assert.equal(game.storyArchives.length,0);
  game.wave=4;game._configureWaveObjective();assert.equal(game.waveObjective.type,'purge');
  game.wave=9;game._configureWaveObjective();assert.equal(game.waveObjective.type,'hunt');
  game.startRun('bulwark','unstable','endless','ossuary');assert.equal(game.modeId,'endless');assert.equal(game.sectorId,'ossuary');
  assert.equal(game.save.data.progression.storyWave,0);
});

test('Choix : greffe appliquée puis arrêt sans limite, sans avance automatique ni double option', () => {
  const game=start();choiceBoundary(game,3);
  const snapshot=json(game._snapshotActiveRun(4)),runTime=game.runTime,health=game.player.health;
  game.update(900);assert.equal(game.state,'story-choice');assert.equal(game.runTime,runTime);assert.equal(game.player.health,health);
  assert.equal(game.startNextWave(),false);assert.equal(game.wave,3);
  assert.equal(game.chooseStoryOption('__proto__'),false);assert.equal(json(game._snapshotActiveRun(4)),snapshot);
  assert.equal(game.save.data.activeRun.version,2);assert.equal(game.save.data.activeRun.story.pendingChoiceId,'protocol');
  assert.ok(game.player.upgradeStacks.steady_hands===1,'La greffe précède le choix');
  assert.ok(game.chooseStoryOption('seal'));
  const after=json({story:game.story,player:game._snapshotActiveRun(4).player});
  assert.equal(game.chooseStoryOption('seal'),false);assert.equal(json({story:game.story,player:game._snapshotActiveRun(4).player}),after);
});

test('Reprise : choix non résolu restauré, greffe ni perdue ni doublée', () => {
  const game=start();choiceBoundary(game,3);
  assert.equal(game.save.status.recovered,false);
  const restored=fixture(game.save.key);assert.ok(restored.resumeSavedRun());
  assert.equal(restored.state,'story-choice');assert.equal(restored.wave,3);assert.equal(restored.sectorId,'sanctum');
  assert.equal(restored.pendingStoryChoice.id,'protocol');assert.equal(restored.player.upgradeStacks.steady_hands,1);
  assert.equal(restored.player.modifiers.spreadMul,game.player.modifiers.spreadMul);
  assert.ok(restored.chooseStoryOption('listen'));assert.equal(restored.sectorId,'nave');assert.equal(restored.save.data.activeRun.nextWave,4);
  assert.equal(restored.save.data.activeRun.story.pendingChoiceId,'');
  const again=fixture(restored.save.key);assert.ok(again.resumeSavedRun());assert.equal(again.state,'playing');
  assert.equal(again.pendingStoryChoice,null);assert.equal(again.story.choices.protocol,'listen');
  assert.equal(again.player.modifiers.damageMul,restored.player.modifiers.damageMul,'Aucun effet de choix rejoué au chargement');
});

test('Choix : conflits de persistance et perte graphique refusés avant tout effet', () => {
  for (const blocked of ['persistenceBlocked','graphicsUnavailable']) {
    const game=start();choiceBoundary(game,3);
    const before=json(game._snapshotActiveRun(4)),stored=disk.get(game.save.key);
    game[blocked]=true;
    assert.equal(game.chooseStoryOption('seal'),false);
    assert.equal(game.state,'story-choice');assert.equal(game.pendingStoryChoice.id,'protocol');
    assert.equal(json(game._snapshotActiveRun(4)),before);assert.equal(disk.get(game.save.key),stored);
    game[blocked]=false;assert.equal(game.chooseStoryOption('seal'),true,'Reprise explicite après résolution du blocage');
  }
});

test('Transition : loadout, santé, ressources et cooldown conservés ; menaces et impulsions purgées', () => {
  const game=start();choiceBoundary(game,3);
  game.player.health=61;game.player.essence=432;game.player.abilityCooldown=8.75;
  game.player.unlockedWeapons.add('smg');game.weapons.ensureWeapon('smg');game.weapons.currentId='smg';
  game.weapons.states.smg.mag=19;game.weapons.states.smg.reserve=92;
  game.enemies.push({alive:true});game.projectiles.push({alive:true});game.arena.hazards.push({});
  game.player.velocity.set(2,1,3);game.player.hitVelocity.set(1,0,1);
  const armor=game.player.maxArmor,maximum=game.player.maxHealth;
  assert.ok(game.chooseStoryOption('seal'));
  assert.equal(game.player.health,61);assert.equal(game.player.maxHealth,maximum-15);assert.equal(game.player.maxArmor,armor+30);
  assert.equal(game.player.essence,432);assert.equal(game.player.abilityCooldown,8.75);
  assert.equal(game.weapons.currentId,'smg');assert.equal(game.weapons.states.smg.mag,19);assert.equal(game.weapons.states.smg.reserve,92);
  assert.equal(game.enemies.length,0);assert.equal(game.projectiles.length,0);assert.equal(game.arena.hazards.length,0);
  assert.equal(game.player.velocity.lengthSq(),0);assert.equal(game.player.hitVelocity.lengthSq(),0);
  assert.ok(game.arena._positionClear(game.player.position,game.player.radius));assert.equal(game.storyArchives[0].chapterId,'sutures');
  assert.equal(game.save.data.activeRun.sectorId,'nave');
});

test('Relais : ordre des trois sceaux, maintien et nettoyage final obligatoires', () => {
  const game=start();enterChapterTwo(game);const objective=game.waveObjective;
  assert.equal(objective.type,'relay');assert.equal(objective.total,3);
  assert.ok(objective.positions.every(position => game.arena._positionClear(position,objective.radius)));
  game.player.position.copy(objective.positions[2]);game._updateWaveObjective(3);assert.equal(objective.index,0);assert.equal(objective.progress,0);
  game.player.position.copy(objective.position);game._updateWaveObjective(1);assert.equal(objective.progress,1);
  game.player.position.copy(game.arena.getStartPosition());game._updateWaveObjective(1);assert.ok(objective.progress<1);
  assert.equal(game._canCompleteWave(),false);
  for (let index=0;index<3;index++) {game.player.position.copy(objective.position);game._updateWaveObjective(3);assert.equal(objective.index,index+1);}
  assert.equal(objective.phase,'cleanup');assert.equal(objective.remaining,0);assert.equal(game.spawnQueue.length,0);
  assert.equal(game.arena.objectiveZone,null);assert.equal(game._canCompleteWave(),false,'Les renforts vivants restent à purger');
  game.enemies.length=0;assert.equal(game._canCompleteWave(),true);
  game._completeWave();assert.equal(game.save.data.progression.objectives.relay,1);
  const shards=game.save.data.shards;game._completeWave();assert.equal(game.save.data.shards,shards,'Récompense idempotente');
});

test('Transport : prise E explicite, vitesse réellement multipliée sans mutation de greffe, livraison tenue', () => {
  const game=start();enterChapterThree(game);const objective=game.waveObjective;
  assert.equal(objective.type,'transport');assert.equal(game.storyMoveSpeedMultiplier(),1);
  game.player.position.copy(objective.pickupPosition);game._updateWaveObjective(20);
  assert.equal(objective.carrying,false);assert.equal(objective.progress,0);assert.equal(game._canCompleteWave(),false);
  assert.match(game.interactionPrompt().title,/PRENDRE/);
  const sample=() => {game.player.position.set(0,0,19);game.player.velocity.set(0,0,0);game.player.hitVelocity.set(0,0,0);game.camera.yaw=0;game.held.add('KeyW');game.player.update(.05);game.held.clear();return 19-game.player.position.z;};
  const normal=sample(),modifiers=json(game.player.modifiers);
  game.player.position.copy(objective.pickupPosition);game.pressed.add('KeyE');game._handleInteraction();
  assert.equal(objective.carrying,true);assert.equal(objective.position,objective.deliveryPosition);assert.equal(game.storyMoveSpeedMultiplier(),.78);
  const carrying=sample();assert.ok(Math.abs(carrying/normal-.78)<1e-9);assert.equal(json(game.player.modifiers),modifiers);
  game.player.position.copy(objective.deliveryPosition);game._updateWaveObjective(1);assert.equal(objective.phase,'active');
  game._updateWaveObjective(2.1);assert.equal(objective.phase,'cleanup');assert.equal(objective.carrying,false);assert.equal(game.storyMoveSpeedMultiplier(),1);
  assert.equal(json(game.player.modifiers),modifiers);game.enemies.length=0;game._completeWave();assert.equal(game.save.data.progression.objectives.transport,1);
});

test('Transport : mort, nouveau run et transition Sans fin retirent le ralentissement', () => {
  const game=start();enterChapterThree(game);game.waveObjective.carrying=true;
  game.onPlayerDeath();assert.equal(game.storyMoveSpeedMultiplier(),.78,'Objet encore posé dans le monde mourant, simulation arrêtée');
  game.startRun('bulwark','unstable','campaign','sanctum');assert.equal(game.storyMoveSpeedMultiplier(),1);assert.equal(game.storyArchives.length,0);
  const story=start();enterChapterThree(story);story.waveObjective.carrying=true;story.state='victory';
  assert.ok(story.continueEndless());assert.equal(story.storyMoveSpeedMultiplier(),1);assert.equal(story.story,null);assert.equal(story.storyArchives.length,0);
});

test('Archives : collecte physique proche, lecture non bloquante et persistance sans avance de vague', () => {
  const game=start(),archive=game.storyArchives[0];
  game.player.position.set(0,0,10);game.pressed.add('KeyE');game._handleInteraction();assert.equal(archive.collected,false);
  game.player.position.copy(archive.position);assert.match(game.interactionPrompt().title,/RECUEILLIR/);
  game.pressed.add('KeyE');game._handleInteraction();assert.equal(archive.collected,true);assert.equal(game.state,'playing');assert.equal(game.wave,1);
  assert.equal(game.save.data.progression.archives[archive.id],true);assert.equal(game.save.data.activeRun,null);
  assert.equal(JSON.parse(disk.get(game.save.key)).progression.archives[archive.id],true);
  const before=game.save.data.shards;assert.equal(game._activateStoryInteraction({type:'archive',id:archive.id}),false);assert.equal(game.save.data.shards,before);
  const next=fixture(game.save.key);next.startRun('bulwark','unstable','story');assert.equal(next.storyArchives.find(item => item.id===archive.id).collected,true);
});

test('Archives : un couvert bloque l’interaction et la représentation reste bornée', () => {
  const game=start(),archive=game.storyArchives[0];game.player.position.copy(archive.position);
  const lineBlocked=game.arena.lineBlocked;game.arena.lineBlocked=() => true;
  game.pressed.add('KeyE');game._handleInteraction();assert.equal(archive.collected,false);game.arena.lineBlocked=lineBlocked;
  let draws=0;game.renderer.draw=()=>{draws++;};const transform=game.arena.storyArtifactTransform;
  for (let frame=0;frame<60;frame++) game.arena._drawStoryObjects(frame/60);
  assert.equal(draws,360);assert.equal(game.arena.storyArtifactTransform,transform);assert.equal(game.rings.length,0);
  archive.collected=true;draws=0;game.arena._drawStoryObjects(1);assert.equal(draws,6,'Une archive lue garde son repère, sans nouvelle passe');
});

test('Stockage refusé : choix jouable en mémoire, checkpoint précédent non écrasé', () => {
  const game=start();choiceBoundary(game,3);const before=disk.get(game.save.key);
  blockedStorage=true;
  try {assert.ok(game.chooseStoryOption('seal'));assert.equal(game.state,'playing');assert.equal(game.story.choices.protocol,'seal');assert.equal(disk.get(game.save.key),before);assert.equal(game.save.status.dirty,true);}
  finally {blockedStorage=false;}
});

test('Snapshots : anciennes reprises migrées v2, story mal formée ou incohérente rejetée strictement', () => {
  const game=start();choiceBoundary(game,3);const valid=JSON.parse(game.save.exportJSON());
  for (const mutate of [
    raw=>{raw.activeRun.story.pendingChoiceId='constructor';},raw=>{raw.activeRun.story.choices.protocol='unknown';},
    raw=>{raw.activeRun.story.choices.testimony='purge';},raw=>{raw.activeRun.story.pendingChoiceId='';},
    raw=>{raw.activeRun.sectorId='ossuary';},raw=>{raw.activeRun.nextWave=9;},
    raw=>{raw.activeRun.story.choices=JSON.parse('{"__proto__":{"polluted":true},"protocol":"","testimony":""}');}
  ]) {const raw=structuredClone(valid);mutate(raw);const before=game.save.exportJSON();assert.equal(game.save.importJSON(json(raw)).ok,false);assert.equal(game.save.exportJSON(),before);}
  const campaign=fixture();campaign.startRun();campaign.wave=1;campaign._beginIntermission();
  const legacy=JSON.parse(campaign.save.exportJSON());legacy.version=2;delete legacy.progression;legacy.activeRun.version=1;delete legacy.activeRun.story;
  const receiver=fixture();assert.equal(receiver.save.importJSON(json(legacy)).ok,true);assert.equal(receiver.save.data.version,3);
  assert.equal(receiver.save.data.activeRun.version,2);assert.equal(receiver.save.data.activeRun.story,null);assert.equal(receiver.save.status.recovered,false);
});

// Assisted deterministic campaigns: lethal hits and movement targets are injected.
// Director, objectives, choices, chapters, loadout, checkpoints and ending are real.
for (const difficulty of Object.keys(NT.Data.DIFFICULTIES)) for (const protocol of ['seal','listen']) for (const testimony of ['preserve','purge']) {
  test('Histoire 10 offices assistés : '+difficulty+' / '+protocol+' / '+testimony, () => {
    const game=start(difficulty);const expectedSectors=[];
    for (let wave=1;wave<=10;wave++) {
      assert.equal(game.wave,wave);expectedSectors.push(game.sectorId);
      assert.equal(game.currentStoryMission.wave,wave);assert.equal(game.waveObjective.type,NT.Story.getMission(wave).objective.type);
      for (const archive of game.storyArchives) if (!archive.collected) {game.player.position.copy(archive.position);game.pressed.add('KeyE');game._handleInteraction();}
      let steps=0;
      while (!game.pendingUpgrade && !game.extractionActive && steps++<150) {
        game._updateWaveDirector(1);
        const objective=game.waveObjective;
        if (objective.phase==='active') {
          if (objective.type==='hold' || objective.type==='relay') {game.player.position.copy(objective.position);game._updateWaveObjective(20);}
          else if (objective.type==='transport') {
            if (!objective.carrying) {game.player.position.copy(objective.pickupPosition);game.pressed.add('KeyE');game._handleInteraction();}
            game.player.position.copy(objective.deliveryPosition);game._updateWaveObjective(4);
          }
        }
        for (const enemy of [...game.enemies]) if (enemy.alive) {enemy.spawnTimer=0;enemy.takeDamage(1e8,{zone:'head',headMultiplier:1,source:'qa-assisted'});}
        game.enemies=game.enemies.filter(enemy=>enemy.alive);
        game._updateWaveObjective(.1);game._updateWaveDirector(.1);
      }
      assert.ok(steps<150,'Aucun blocage d’objectif à l’office '+wave);
      if (wave===10) {
        assert.ok(game.extractionActive);game.player.position.copy(game.extractionZone.position);game._updateExtraction(4);
        assert.equal(game.state,'victory');assert.equal(game.result.sectors,3);
        assert.equal(game.result.storyEnding.id,NT.Story.getEnding({protocol,testimony}).id);
        assert.equal(game.save.data.progression.endings[game.result.storyEnding.id],true);
        const after=game.save.exportJSON();game._finalizeRun('victory');assert.equal(game.save.exportJSON(),after,'Bilan sans double récompense');
      } else {
        assert.ok(game.pendingUpgrade);game._presentUpgrades();assert.equal(game.state,'upgrade');game.applyUpgrade(game.upgradeOptions[0]);
        if (wave===3 || wave===6) {assert.equal(game.state,'story-choice');assert.ok(game.chooseStoryOption(wave===3?protocol:testimony));}
        assert.ok(game.intermissionActive);assert.equal(game.save.status.dirty,false);
        assert.ok(game._validateActiveRun(game.save.data.activeRun));assert.ok(finiteTree(game.save.data));
        assert.ok(game._startWaveFromIntermission());
      }
    }
    assert.equal(expectedSectors.join(','),'sanctum,sanctum,sanctum,nave,nave,nave,ossuary,ossuary,ossuary,ossuary');
    assert.equal(game.save.data.progression.storyWave,10);assert.ok(Object.values(game.save.data.progression.archives).every(Boolean));
    assert.equal(game.save.data.progression.objectives.relay,1);assert.equal(game.save.data.progression.objectives.transport,1);
    assert.equal(game.save.data.progression.sectorWins.sanctum,0);assert.equal(game.save.data.progression.sectorWins.nave,0);assert.equal(game.save.data.progression.sectorWins.ossuary,1);
    assert.equal(game.save.data.activeRun,null);assert.ok(finiteTree(game.save.data));
  });
}

test('Carrière cumulative : 20/20 accomplissements atteints par 90 offices assistés, récompenses uniques et persistées', () => {
  const game=fixture(), events=[], receipts=new Map(), definitions=new Map(NT.Progression.ACHIEVEMENTS.map(item=>[item.id,item]));
  const progressEvent=game._progressEvent;
  let milestoneRewards=0;
  assert.equal(NT.Progression.summary(game.save.data.progression).completed,0);
  // Observe the actual runtime hook; never manufacture progression events or flags.
  game._progressEvent=function(event,persist=false) {
    const before=this.save.data.progression.achievements, shards=this.save.data.shards;
    const result=progressEvent.call(this,event,persist);
    assert.equal(result.error,null);
    assert.equal(this.save.data.shards-shards,result.reward,'Fragments crédités dans le même hook');
    assert.equal(result.reward,result.unlocked.reduce((total,id)=>total+definitions.get(id).reward,0));
    for (const id of result.unlocked) {
      assert.equal(before[id],false,'Le jalon doit réellement franchir son seuil');
      assert.equal(receipts.has(id),false,'Récompense de jalon attribuée une seule fois : '+id);
      receipts.set(id,definitions.get(id).reward);
    }
    milestoneRewards+=result.reward;
    events.push({event:{...event},reward:result.reward,unlocked:[...result.unlocked]});
    return result;
  };
  function assistRun(mode,difficulty,doctrine,sector,choices=null,offices=10) {
    game.startRun(doctrine,difficulty,mode,sector);
    for (let wave=1;wave<=offices;wave++) {
      assert.equal(game.wave,wave);
      if (mode==='endless' && wave===20) {
        assert.equal(game.save.data.progression.endlessBestWave,19);
        assert.equal(game.save.data.progression.achievements.endless_20,false,'Atteindre la vague 20 ne suffit pas');
      }
      for (const archive of game.storyArchives) {
        if (archive.collected) {
          const shards=game.save.data.shards;
          assert.equal(game._activateStoryInteraction({type:'archive',id:archive.id}),false);
          assert.equal(game.save.data.shards,shards,'Archive déjà recueillie sans nouvelle récompense');
        } else {
          game.player.position.copy(archive.position);game.pressed.add('KeyE');game._handleInteraction();
          assert.equal(archive.collected,true);
        }
      }
      // Same assistance as the sixteen branch runs: real director and damage,
      // real objective timers/interaction, no direct completion flag writes.
      let steps=0;
      while (!game.pendingUpgrade && !game.extractionActive && steps++<200) {
        game._updateWaveDirector(1);
        const objective=game.waveObjective;
        if (objective.phase==='active') {
          if (objective.type==='hold' || objective.type==='relay') {game.player.position.copy(objective.position);game._updateWaveObjective(20);}
          else if (objective.type==='transport') {
            if (!objective.carrying) {game.player.position.copy(objective.pickupPosition);game.pressed.add('KeyE');game._handleInteraction();}
            game.player.position.copy(objective.deliveryPosition);game._updateWaveObjective(4);
          }
        }
        for (const enemy of [...game.enemies]) if (enemy.alive) {enemy.spawnTimer=0;enemy.takeDamage(1e8,{zone:'head',headMultiplier:1,source:'qa-career-assisted'});}
        game.enemies=game.enemies.filter(enemy=>enemy.alive);
        game._updateWaveObjective(.1);game._updateWaveDirector(.1);
      }
      assert.ok(steps<200,'Carrière sans blocage : '+mode+' / '+wave);
      if (mode!=='endless' && wave===10) {
        assert.ok(game.extractionActive);game.player.position.copy(game.extractionZone.position);game._updateExtraction(4);
        assert.equal(game.state,'victory');assert.equal(game.result.sectors,mode==='story'?3:1);
        if (choices) assert.equal(game.result.storyEnding.id,NT.Story.getEnding(choices).id);
        const after=game.save.exportJSON();game._finalizeRun('victory');assert.equal(game.save.exportJSON(),after);
      } else {
        assert.ok(game.pendingUpgrade);
        const after=json(game.save.data);game._completeWave();assert.equal(json(game.save.data),after,'Fin de vague répétée sans nouvel événement');
        game._presentUpgrades();assert.equal(game.state,'upgrade');game.applyUpgrade(game.upgradeOptions[0]);
        if (mode==='story' && (wave===3 || wave===6)) assert.ok(game.chooseStoryOption(wave===3?choices.protocol:choices.testimony));
        assert.equal(game.save.status.dirty,false);assert.equal(game.save.status.recovered,false);
        if (wave<offices) assert.ok(game._startWaveFromIntermission());
      }
    }
  }
  // Independent historical interventions remain necessary for Sanctum/Nave;
  // Story records its one final extraction in Ossuary, not three fake wins.
  for (const [sector,difficulty,doctrine] of [
    ['sanctum','containment','bulwark'],['nave','unstable','executioner'],['ossuary','red','occultist']
  ]) assistRun('campaign',difficulty,doctrine,sector);
  for (const [protocol,testimony,doctrine] of [
    ['seal','purge','bulwark'],['listen','preserve','executioner'],['seal','preserve','occultist']
  ]) assistRun('story','nexus',doctrine,'sanctum',{protocol,testimony});
  assert.equal(NT.Progression.summary(game.save.data.progression).completed,19);
  assistRun('endless','containment','bulwark','sanctum',null,20);
  assert.equal(NT.Progression.summary(game.save.data.progression).percent,100);
  // Finish the endless run normally, then replay an already-earned story ending.
  game.onPlayerDeath();game._finalizeRun('death');
  const replayStart=events.length, rewardsBeforeReplay=milestoneRewards;
  assistRun('story','nexus','bulwark','sanctum',{protocol:'seal',testimony:'purge'});
  assert.ok(events.slice(replayStart).some(entry=>entry.event.type==='victory'));
  assert.ok(events.slice(replayStart).every(entry=>entry.reward===0 && entry.unlocked.length===0));
  assert.equal(milestoneRewards,rewardsBeforeReplay);
  const progression=game.save.data.progression;
  const seen=(type,field)=>[...new Set(events.filter(entry=>entry.event.type===type).map(entry=>entry.event[field]))].sort();
  assert.deepEqual(seen('objective','kind'),[...NT.Progression.OBJECTIVE_IDS].sort());
  assert.deepEqual(seen('boss','id'),[...NT.Progression.BOSS_IDS].sort());
  assert.deepEqual(seen('archive','id'),[...NT.Progression.ARCHIVE_IDS].sort());
  assert.deepEqual([...new Set(events.filter(entry=>entry.event.type==='victory' && entry.event.modeId==='story').map(entry=>entry.event.endingId))].sort(),[...NT.Progression.ENDING_IDS].sort());
  assert.deepEqual(events.filter(entry=>entry.event.type==='victory' && entry.event.modeId==='campaign').map(entry=>entry.event.sectorId).sort(),[...NT.Progression.SECTOR_IDS].sort());
  assert.deepEqual(events.filter(entry=>entry.event.type==='endless').map(entry=>entry.event.wave),Array.from({length:20},(_,index)=>index+1));
  for (const map of [progression.sectorWins,progression.doctrineWins,progression.difficultyWins]) assert.ok(Object.values(map).every(value=>value>0));
  assert.equal(receipts.size,20);assert.equal(NT.Progression.ACHIEVEMENTS.length,20);
  assert.equal(milestoneRewards,NT.Progression.ACHIEVEMENTS.reduce((total,item)=>total+item.reward,0));
  assert.ok(Object.values(progression.achievements).every(Boolean));assert.ok(finiteTree(game.save.data));
  const restored=fixture(game.save.key), summary=NT.Progression.summary(restored.save.data.progression);
  assert.equal(summary.completed,20);assert.equal(summary.total,20);assert.equal(summary.percent,100);assert.equal(summary.next,null);
  assert.equal(restored.save.data.shards,game.save.data.shards);assert.equal(restored.save.status.recovered,false);
});

test('Greffe : conflit, format futur et contexte perdu refusés avant mutation ou ouverture de décision', () => {
  for (const reason of ['conflict','future','graphics']) for (const wave of [1,3]) {
    const game=start(); game.wave=wave; game.pendingUpgrade=true; game._presentUpgrades();
    const before=json(game._snapshotActiveRun(wave+1)), stored=disk.get(game.save.key);
    if (reason==='graphics') game.graphicsUnavailable=true;
    else { game.persistenceBlocked=true; game.save.status.conflict=reason==='conflict'; game.save.status.futureVersion=reason==='future'?4:null; }
    assert.equal(game.applyUpgrade(NT.Data.UPGRADES.find(upgrade=>upgrade.id==='steady_hands')),false);
    assert.equal(game.state,'upgrade'); assert.equal(game.pendingStoryChoice,null);
    assert.equal(json(game._snapshotActiveRun(wave+1)),before); assert.equal(disk.get(game.save.key),stored);
  }
});
console.log(`\nStory gameplay : ${passed} réussis, ${failed} échoués.`);
if (failed) process.exitCode=1;
