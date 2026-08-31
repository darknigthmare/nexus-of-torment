import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Runtime réel, dont SaveStore ; rendu/audio et stockage physique neutralisés, sans navigateur.
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const disk = new Map();
const sandbox = {
  window:{}, console, setTimeout, clearTimeout, structuredClone, performance:{ now:() => 0 },
  localStorage:{ getItem:key=>disk.get(key)??null,setItem:(key,value)=>disk.set(key,String(value)) }
};
sandbox.window.window = sandbox.window;
const context = vm.createContext(sandbox);
for (const relative of ['src/core/math.js','src/core/engine.js','src/game/data.js','src/game/arena.js','src/game/entities.js','src/game/weapons.js','src/game/game.js']) {
  vm.runInContext(fs.readFileSync(path.join(root,relative),'utf8'),context,{ filename:relative });
}
vm.runInContext('Math.random = () => 0.5',context);
const NT = context.window.NT;
const { Vec3 } = NT.Math;
const { Enemy, Player } = NT.Entities;
const noop = () => {};
const meshes = new Proxy({}, { get:(target,key) => target[key]||(target[key]={ name:String(key) }) });
let passed = 0, failed = 0;
function test(label, run) {
  try { run(); passed++; console.log('OK  ' + label); }
  catch (error) { failed++; console.error('FAIL ' + label + ': ' + error.message); }
}
function near(actual, expected, tolerance=1e-8) {
  assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
}
function makeHost(difficultyId='unstable') {
  const host = Object.assign(Object.create(NT.NexusGame.prototype), {
    state:'playing', previousState:'playing', modeId:'campaign', sectorId:'sanctum', wave:5, waveActive:true, time:0,
    pendingUpgrade:false, intermissionActive:false, extractionActive:false, extractionDuration:3.2,
    runFinalized:false, runTime:0, score:0, killStreak:0, killStreakTimer:0,
    lastClassId:'bulwark', lastDifficultyId:difficultyId, intermissionDuration:20,
    difficulty:NT.Data.DIFFICULTIES[difficultyId], currentModifier:NT.Data.WAVE_MODIFIERS[0],
    stats:NT.NexusGame.prototype._newStats(), renderer:{ meshes, draw:noop },
    settings:{ gore:false, sensitivity:1 },
    camera:{ yaw:0, pitch:0, position:new Vec3(), shake:new Vec3(), forward:new Vec3(0,0,-1) },
    enemies:[], projectiles:[], pickups:[], spawnQueue:[], tracers:[], arcs:[], rings:[], hallucinations:[],
    particles:{ burst:noop, spawn:noop, clear:noop }, spawnAbilityRing:noop,
    audio:{ init:noop, wave:noop, enemy:noop, ui:noop, hurt:noop, pickup:noop, ability:noop, boss:noop, explosion:noop, reload:noop },
    ui:{ announce:noop, subtitle:noop, toast:noop, damageFlash:noop, enterGame:noop, showGameOver:noop, showVictory:noop },
    input:{ mouseDX:0, mouseDY:0, keyAny:() => false, consume:() => false, combatReady:() => true, requestLock:noop, exitLock:noop },
    save:{ data:{ shards:0, records:{}, codex:{ enemyKills:{} }, meta:{}, activeRun:null }, save:() => true }
  });
  host.arena = new NT.Arena(host);
  host.player = new Player(host);
  host.player.reset('bulwark');
  host.arena.setSector('sanctum');
  host.weapons = new NT.WeaponSystem(host);
  host.weapons.reset({});
  return host;
}

const chargeCases = [
  { type:'grinder', player:[-10.75,0,7.06], enemy:[-9.2,0,5.5], state:'charge', multiplier:1.35 },
  { type:'flayed', player:[-10.65,0,6.86], enemy:[-9.3,0,5.7], state:'lunge', multiplier:1.28 },
  { type:'gatekeeper', player:[-10.8,0,7.11], enemy:[-8.85,0,5.14], state:'charge', multiplier:1.35 }
];
function chargeFixture(entry, covered=true, beyondRange=false) {
  const host=makeHost(),enemy=new Enemy(host,entry.type,new Vec3(...entry.enemy),{ instant:true });
  host.player.armor=0;
  host.player.position.set(...entry.player);
  if(!covered) {
    enemy.position.set(0,0,10);
    const reach=entry.type==='gatekeeper'?2.8:enemy.radius+host.player.radius+(entry.type==='grinder'?1:.8);
    host.player.position.set(0,0,10+(beyondRange?reach+.05:reach-.1));
  }
  host.camera.position.copy(host.player.position).add(new Vec3(0,host.player.eyeHeight,0));
  enemy.state=entry.state;enemy.stateTimer=.3;
  enemy.chargeDirection.copy(host.player.position).sub(enemy.position).normalizeXZ();
  host.enemies=[enemy];
  return { host,enemy };
}
for(const entry of chargeCases) {
  test(`${entry.type}: charge bloquée par un couvert réel sans consommer l’impact`,() => {
    const { host,enemy }=chargeFixture(entry);
    assert.ok(host.arena._positionClear(host.player.position,host.player.radius));
    assert.ok(host.arena._positionClear(enemy.position,enemy.radius));
    assert.equal(host.arena.lineBlocked(enemy.position.clone().add(new Vec3(0,1.05,0)),host.player.position.clone().add(new Vec3(0,1.05,0))),true);
    const before=host.player.health,control=chargeFixture(entry);
    // L’aura ambiante reste active derrière les couverts ; seul l’impact de contact est annulé.
    control.enemy.state='seek';control.enemy.attackTimer=99;control.enemy.abilityTimer=99;
    control.enemy.update(1/60);
    enemy.update(1/60);
    near(host.player.health,before);near(host.player.corruption,control.host.player.corruption);
    assert.equal(host.player.slowTimer,0);
    assert.equal(enemy.state,entry.state);near(enemy.stateTimer,.3-1/60);
  });
  test(`${entry.type}: charge à découvert conserve ses dégâts et son impact unique`,() => {
    const { host,enemy }=chargeFixture(entry,false);
    assert.equal(host.arena.lineBlocked(enemy.position.clone().add(new Vec3(0,1.05,0)),host.player.position.clone().add(new Vec3(0,1.05,0))),false);
    const before=host.player.health;
    enemy.update(1/60);
    near(before-host.player.health,enemy.damage*entry.multiplier);
    assert.equal(enemy.state,'seek');near(enemy.stateTimer,0);
    if(entry.type==='flayed')near(host.player.slowTimer,1.1);
    assert.ok(enemy.abilityTimer>0);
  });
  test(`${entry.type}: aucune extension de portée de charge`,() => {
    const { host,enemy }=chargeFixture(entry,false,true),before=host.player.health;
    enemy.update(1/60);
    near(host.player.health,before);assert.equal(enemy.state,entry.state);
  });
}

function slamFromBoss(difficultyId,wave,phase,options={}) {
  const host=makeHost(difficultyId);host.wave=wave;
  if(options.modifier)host.currentModifier=options.modifier;
  const enemy=new Enemy(host,'gatekeeper',new Vec3(0,0,10),{ instant:true,elite:options.elite });
  host.player.position.set(0,0,13.5);host.player.armor=0;
  enemy.health=enemy.maxHealth*(phase===1?.9:phase===2?.5:.2);
  enemy.bossPhase=phase;enemy.summonTimer=99;enemy.state='slamWindup';enemy.stateTimer=.001;
  host.enemies=[enemy];
  const requested=[],damagePlayer=host.damagePlayer.bind(host);
  host.damagePlayer=(amount,...args) => { requested.push(amount);return damagePlayer(amount,...args); };
  enemy.update(1/60);
  assert.equal(requested.length,1,'Le vrai update de boss doit produire un unique impact.');
  return { host,enemy,damage:requested[0],falloff:1-.65*3.5/host.bossSlamRadius(phase) };
}
for(const phase of [1,2,3]) {
  test(`Gardien phase ${phase}: référence instable vague 5 inchangée`,() => {
    const result=slamFromBoss('unstable',5,phase);
    near(result.damage,(24+phase*7)*result.falloff);
    assert.equal(result.enemy.state,'seek');
  });
}
for(const difficultyId of Object.keys(NT.Data.DIFFICULTIES)) {
  test(`Gardien ${difficultyId}: dégâts proportionnels en vagues 5, 25 et 9995`,() => {
    for(const phase of [1,2,3]) {
      let previous=0;
      for(const wave of [5,25,9995]) {
        const result=slamFromBoss(difficultyId,wave,phase);
        const expected=(24+phase*7)*NT.Data.DIFFICULTIES[difficultyId].enemyDamage*(1+(wave-1)*.025)/1.1*result.falloff;
        near(result.damage,expected,1e-7);
        assert.ok(Number.isFinite(result.damage)&&result.damage>previous);
        assert.ok(result.damage/result.falloff<=result.enemy.damage*1.35,'Le slam ne dépasse pas la charge du même Gardien, même en haut endless.');
        previous=result.damage;
      }
    }
  });
}
test('Gardien: facteurs élite et anomalie appliqués une seule fois',() => {
  const normal=slamFromBoss('red',25,3);
  const empowered=slamFromBoss('red',25,3,{ elite:true,modifier:{ enemyDamage:1.18 } });
  near(empowered.damage/normal.damage,1.22*1.18);
});
test('Gardien: anciens appels à deux arguments restent valides',() => {
  const host=makeHost();host.player.armor=0;
  const before=host.player.health;
  host.bossSlam(host.player.position.clone(),1);
  near(before-host.player.health,31);
});

function stationFixture(type) {
  const host=makeHost(),station=host.arena.stations.find(item=>item.type===type);
  host.player.essence=500;
  host.player.position.copy(station.position).add(new Vec3(1.6,0,0));
  assert.equal(host.arena.nearestStation(host.player.position),station);
  return { host,station };
}
for(const type of ['ammo','med']) {
  test(`Station ${type}: interaction sans effet refusée, prompt cohérent et aucun coût`,() => {
    const { host,station }=stationFixture(type),weapons=JSON.stringify(host.weapons.states);
    host.intermissionActive=true;
    let saves=0;host.save.save=()=>{ saves++;return true; };
    const prompt=host.arena.stationPrompt(station);
    assert.equal(prompt.cost,'');
    assert.equal(prompt.title,type==='ammo'?'RÉSERVES DÉJÀ PLEINES':'ÉTAT VITAL STABLE');
    host.input.consume=key=>key==='KeyE';host._handleInteraction();
    assert.equal(host.player.essence,500);assert.equal(host.stats.essenceSpent,0);
    assert.equal(station.cooldown,0);assert.equal(saves,0);
    assert.equal(JSON.stringify(host.weapons.states),weapons);
    assert.equal(host.player.health,host.player.maxHealth);assert.equal(host.player.corruption,0);
    assert.equal(host.arena.activateStation(station),false);
  });
}
test('Station ammo: une seule réserve vide permet un achat exact sans dépasser les autres',() => {
  const { host,station }=stationFixture('ammo'),rifle=host.weapons.states.rifle,shotgun=host.weapons.states.shotgun;
  shotgun.reserve=0;const rifleBefore=rifle.reserve;
  assert.equal(host.arena.stationPrompt(station).cost,'◆ 120');
  assert.equal(host.arena.activateStation(station),true);
  assert.equal(host.player.essence,380);assert.equal(host.stats.essenceSpent,120);
  assert.equal(shotgun.reserve,Math.ceil(shotgun.maxReserve*.55));assert.equal(rifle.reserve,rifleBefore);
  assert.equal(station.cooldown,4);
});
test('Station ammo: chargeur vide seul ne gaspille pas les réserves déjà pleines',() => {
  const { host,station }=stationFixture('ammo'),rifle=host.weapons.states.rifle;
  rifle.mag=0;
  assert.equal(host.arena.activateStation(station),false);assert.equal(host.player.essence,500);
  assert.equal(host.weapons.startReload(),true);host.weapons.finishReload();
  assert.equal(host.arena.stationPrompt(station).cost,'◆ 120');
  assert.equal(host.arena.activateStation(station),true);assert.equal(rifle.reserve,rifle.maxReserve);
});
for(const condition of ['health','corruption','both']) {
  test(`Station med: bénéfice ${condition} autorisé et réduction Silence respectée`,() => {
    const { host,station }=stationFixture('med');
    host.currentModifier=NT.Data.WAVE_MODIFIERS.find(modifier=>modifier.id==='silence');
    if(condition!=='corruption')host.player.health-=70;
    if(condition!=='health')host.player.corruption=.6;
    const health=host.player.health,corruption=host.player.corruption;
    assert.equal(host.arena.stationPrompt(station).cost,'◆ 140');
    assert.equal(host.arena.activateStation(station),true);
    near(host.player.health,Math.min(host.player.maxHealth,health+55*.65));
    near(host.player.corruption,Math.max(0,corruption-.28*.65));
    assert.equal(host.player.essence,360);assert.equal(host.stats.essenceSpent,140);assert.equal(station.cooldown,8);
  });
}
test('Stations: cooldown et refus sans fonds ne modifient pas les ressources',() => {
  const { host,station }=stationFixture('ammo');host.weapons.states.rifle.reserve=0;host.player.essence=119;
  assert.equal(host.arena.activateStation(station),false);assert.equal(host.player.essence,119);assert.equal(station.cooldown,0);
  host.player.essence=500;station.cooldown=2;
  assert.equal(host.arena.stationPrompt(station).title,'SYSTÈME EN RECHARGE');
  assert.equal(host.arena.activateStation(station),false);assert.equal(host.player.essence,500);
});

function assertOrientation(actual,expected) {
  assert.ok(Number.isFinite(actual)&&Math.abs(actual)<=Math.PI);
  near(Math.sin(actual),Math.sin(expected));near(Math.cos(actual),Math.cos(expected));
}
test('Checkpoint: angles finis normalisés sans changer l’orientation après plusieurs tours',() => {
  const host=makeHost();
  for(const yaw of [0,.73,-.73,Math.PI,-Math.PI,4*Math.PI+.73,-4*Math.PI-.73,200*Math.PI+1.2,-200*Math.PI-1.2,1e20,-1e20]) {
    host.camera.yaw=yaw;
    const validated=host._validateActiveRun(host._snapshotActiveRun(6));
    assertOrientation(validated.player.yaw,yaw);
  }
});
test('Checkpoint: anciens angles numériques sérialisés en texte restent orientés correctement',() => {
  const host=makeHost(),snapshot=host._snapshotActiveRun(6);
  snapshot.player.yaw=String(8*Math.PI+.42);
  assertOrientation(host._validateActiveRun(snapshot).player.yaw,Number(snapshot.player.yaw));
});
test('Checkpoint: yaw absent, invalide et infini conservent le fallback historique',() => {
  const host=makeHost();
  for(const yaw of [undefined,NaN,Infinity,-Infinity,'angle invalide']) {
    const snapshot=host._snapshotActiveRun(6);snapshot.player.yaw=yaw;
    assert.equal(host._validateActiveRun(snapshot).player.yaw,Math.PI);
  }
});
test('Reprise réelle: orientation positive et négative préservée après réécriture du checkpoint',() => {
  for(const yaw of [4*Math.PI+.73,-4*Math.PI-.73]) {
    const host=makeHost();host.camera.yaw=yaw;
    host.save.data.activeRun=host._snapshotActiveRun(6);
    assert.equal(host.resumeSavedRun(),true);
    assertOrientation(host.camera.yaw,yaw);
    assertOrientation(host.save.data.activeRun.player.yaw,yaw);
    assert.equal(host.wave,5);assert.equal(host.intermissionActive,true);
  }
});

function float64Bytes(value) {
  const bytes=Buffer.alloc(8);bytes.writeDoubleLE(value);return bytes;
}
test('Checkpoint: 1000 angles canoniques ou multitours bit-idempotents, dont les deux régressions Chrome',() => {
  const host=makeHost();
  const angles=[.1,.00022822839394567797,-.00022822839394567797,-0,Math.PI,-Math.PI];
  while(angles.length<1000) {
    const index=angles.length,base=-Math.PI+((index*.6180339887498949)%1)*Math.PI*2;
    angles.push(base+(index%2?Math.PI*2*Math.floor(index/2)*(index%3?-1:1):0));
  }
  for(const yaw of angles) {
    host.camera.yaw=yaw;
    const snapshot=host._snapshotActiveRun(6),canonical=host._validateActiveRun(snapshot);
    assertOrientation(snapshot.player.yaw,yaw);
    if(Math.abs(yaw)<=Math.PI)assert.deepEqual(float64Bytes(snapshot.player.yaw),float64Bytes(yaw));
    assert.deepEqual(float64Bytes(canonical.player.yaw),float64Bytes(snapshot.player.yaw));
    const encoded=JSON.stringify(canonical);
    let current=canonical;
    for(let pass=0;pass<5;pass++) {
      current=host._validateActiveRun(current);
      assert.deepEqual(float64Bytes(current.player.yaw),float64Bytes(canonical.player.yaw));
      assert.equal(JSON.stringify(current),encoded,'Le checkpoint canonique doit rester identique octet pour octet.');
    }
  }
});

const saveDefaults={
  version:2,
  settings:{ sensitivity:1,volume:.72,fov:82,renderScale:1,hudScale:1,shakeIntensity:1,headBob:true,reducedFlashes:false,reducedMotion:false,gore:true,invertY:false,uiContrast:false,enemyContrast:false,subtitles:true,guidedHints:true,timedUpgrades:false,bindings:NT.Engine.Input.defaultBindings() },
  shards:0,meta:Object.fromEntries(Object.keys(NT.Data.META_UPGRADES).map(key=>[key,0])),
  codex:{ enemyKills:{} },
  records:{ bestWave:0,bestScore:0,lifetimeKills:0,bossKills:0,headshots:0,damage:0,runs:0,playTime:0 },activeRun:null
};
let roundTripIndex=0;
function assertStrictSaveRoundTrip(yaw) {
  const prefix='yaw-round-trip-'+roundTripIndex++,host=makeHost();
  host.save=new NT.Engine.SaveStore(prefix,saveDefaults);
  host.camera.yaw=yaw;
  assert.equal(host._checkpointActiveRun(6),true);
  assert.equal(host.save.status.recovered,false,'Un checkpoint créé par le jeu ne doit pas être réparé.');
  assert.equal(host.save.recoveryBackup,null);
  const canonicalYaw=host.save.data.activeRun.player.yaw;
  assertOrientation(canonicalYaw,yaw);
  const firstNormalized=host.save._normalize(host.save.data,true);
  assert.equal(firstNormalized.repaired,false);assert.equal(firstNormalized.error,null);
  let store=host.save;
  for(let pass=0;pass<3;pass++) {
    const exported=store.exportJSON(),receiver=new NT.Engine.SaveStore(prefix+'-import-'+pass,saveDefaults);
    const imported=receiver.importJSON(exported);
    assert.equal(imported.ok,true,imported.error);
    assert.equal(imported.persisted,true);assert.equal(receiver.status.recovered,false);
    assert.equal(receiver.exportJSON(),exported,'Export/import strict ne doit pas changer un octet.');
    assert.deepEqual(float64Bytes(receiver.data.activeRun.player.yaw),float64Bytes(canonicalYaw));
    assert.equal(receiver.save(),true);assert.equal(receiver.status.recovered,false);
    const reloaded=new NT.Engine.SaveStore(receiver.key,saveDefaults);
    assert.equal(reloaded.status.recovered,false);assert.equal(reloaded.recoveryBackup,null);
    assert.equal(reloaded.exportJSON(),exported);
    store=reloaded;
  }
  const resumed=makeHost();resumed.save=store;
  assert.equal(resumed.resumeSavedRun(),true);
  assert.equal(resumed.save.status.recovered,false);
  assert.deepEqual(float64Bytes(resumed.camera.yaw),float64Bytes(canonicalYaw));
  assert.equal(resumed.save._normalize(resumed.save.data,true).error,null);
}
test('SaveStore réel: yaw 0.1 et petit recul Chrome sans réparation ni rejet d’import strict',() => {
  for(const yaw of [.1,.00022822839394567797,-.00022822839394567797])assertStrictSaveRoundTrip(yaw);
});
test('SaveStore réel: snapshots multitours exportables/importables et reprenables sans repaired',() => {
  for(const yaw of [6*Math.PI+.1,-6*Math.PI-.1,200*Math.PI+1.2,-200*Math.PI-1.2])assertStrictSaveRoundTrip(yaw);
});

console.log(`Gameplay polish contracts: ${passed} passed, ${failed} failed.`);
process.exitCode=failed?1:0;
