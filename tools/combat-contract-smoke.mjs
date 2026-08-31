import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sandbox = { window:{}, console, setTimeout, clearTimeout, structuredClone, performance:{ now:() => 0 } };
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

function makeHost(difficultyId='unstable', sectorId='sanctum') {
  const host = Object.create(NT.NexusGame.prototype);
  Object.assign(host, {
    state:'playing', modeId:'campaign', sectorId, wave:0, waveActive:false, time:0,
    pendingUpgrade:false, intermissionActive:false, extractionActive:false, extractionDuration:3.2,
    runFinalized:false, runTime:0, score:0, killStreak:0, killStreakTimer:0,
    lastClassId:'bulwark', lastDifficultyId:difficultyId, intermissionDuration:20,
    difficulty:NT.Data.DIFFICULTIES[difficultyId], currentModifier:NT.Data.WAVE_MODIFIERS[0],
    stats:NT.NexusGame.prototype._newStats(), renderer:{ meshes, draw:noop },
    settings:{ gore:false, sensitivity:1 },
    camera:{ yaw:0, pitch:0, position:new Vec3(), shake:new Vec3(), forward:new Vec3(0,0,-1) },
    enemies:[], projectiles:[], pickups:[], spawnQueue:[],
    particles:{ burst:noop, spawn:noop, clear:noop }, spawnAbilityRing:noop,
    audio:{ wave:noop, enemy:noop, ui:noop, hurt:noop, pickup:noop, ability:noop, boss:noop, explosion:noop, reload:noop },
    ui:{
      announce:noop, subtitle:noop, toast:noop, damageFlash:noop,
      showUpgrades(options) { host.upgradeOptions = options; },
      showGameOver:noop, showVictory:noop
    },
    input:{ mouseDX:0, mouseDY:0, keyAny:() => false, consume:() => false, combatReady:() => true, requestLock:noop, exitLock:noop },
    save:{ data:{ shards:0, records:{}, codex:{ enemyKills:{} }, meta:{}, activeRun:null }, save:() => true }
  });
  host.arena = new NT.Arena(host);
  host.player = new Player(host);
  host.player.reset('bulwark');
  host.arena.setSector(sectorId);
  host.weapons = new NT.WeaponSystem(host);
  host.weapons.reset({});
  return host;
}

// Les points testés proviennent des matrices des vraies pièces dessinées, pas d’une hitbox recopiée.
for (const type of Object.keys(NT.Data.ENEMIES).filter(id => id !== 'choir')) {
  test('Tête visible : ' + type + ', standard/élite et deux orientations', () => {
    const host = makeHost();
    host.wave = 10;
    for (const elite of [false,true]) for (const yaw of [0,Math.PI * .5]) {
      const enemy = new Enemy(host,type,new Vec3(0,0,0),{ instant:true, elite });
      enemy.yaw = yaw;
      enemy.draw(host.renderer,host.time);
      const head = enemy.parts.find(part => part.tag === 'head');
      const center = new Vec3(head.worldMatrix[12],head.worldMatrix[13],head.worldMatrix[14]);
      const direction = new Vec3(-Math.sin(yaw),0,-Math.cos(yaw));
      const hit = enemy.raycast(center.clone().addScaled(direction,-10),direction,20);
      assert.equal(hit.hit,true,type + ' doit recevoir le tir centré sur son modèle');
      assert.equal(hit.zone,'head',type + ' doit identifier son point faible visible');
      const high = center.clone();
      high.y += head.baseScale.y * 1.5;
      assert.equal(enemy.raycast(high.clone().addScaled(direction,-10),direction,20).hit,false,'Pas de hitbox généreuse au-dessus du modèle');
    }
  });
}

test('Chœur : chaque tête périphérique visible utilise sa position animée', () => {
  const host = makeHost();
  const enemy = new Enemy(host,'choir',new Vec3(0,0,0),{ instant:true });
  enemy.yaw = .7;
  for (const time of [0,1.5,4]) {
    host.time = time;
    enemy.draw(host.renderer,time);
    for (const head of enemy.parts.filter(part => part.tag === 'choirHead')) {
      const center = new Vec3(head.worldMatrix[12],head.worldMatrix[13],head.worldMatrix[14]);
      const outward = center.clone().sub(enemy.position); outward.y = 0; outward.normalizeXZ();
      const hit = enemy.raycast(center.clone().addScaled(outward,10),outward.scale(-1),20);
      assert.equal(hit.zone,'head');
    }
  }
});

for (const type of Object.keys(NT.Data.ENEMIES)) {
  test('Accessibilité ennemie : ' + type + ', flash réduit / contraste / retour normal', () => {
    const host = makeHost();
    for (const elite of [false,true]) {
      const enemy = new Enemy(host,type,new Vec3(0,0,0),{ instant:true, elite, marked:true });
      const scales = enemy.parts.map(part => [part.baseScale.x,part.baseScale.y,part.baseScale.z]);
      const originalMaterials = enemy.parts.map(part => part.material);
      const originalSnapshots = originalMaterials.map(material => JSON.stringify(material));
      const capture = () => {
        const calls=[];
        host.renderer.draw=(mesh,matrix,material) => calls.push({mesh,material});
        enemy.draw(host.renderer,3);
        return calls;
      };
      host.settings.enemyContrast=false;host.settings.reducedFlashes=false;
      const normal=capture();
      enemy.hitFlash=1;
      assert.ok(capture().slice(0,enemy.parts.length).every(call => call.material === enemy.materials.flash));
      host.settings.reducedFlashes=true;
      const reduced=capture();
      assert.equal(enemy.hitFlash,1,'L’option de rendu ne modifie pas l’état des dégâts');
      assert.ok(reduced.slice(0,enemy.parts.length).every((call,index) => call.material === originalMaterials[index]));
      host.settings.enemyContrast=true;
      const contrasted=capture(),cached=enemy.contrastMaterials;
      assert.equal(contrasted.length,normal.length,'Aucune passe de dessin ajoutée');
      assert.ok(contrasted.every((call,index) => call.mesh === normal[index].mesh),'Aucun mesh supplémentaire');
      assert.ok(contrasted.every(call => call.material !== enemy.materials.flash && call.material.pulse === 0));
      assert.ok(contrasted.slice(0,enemy.parts.length).every((call,index) => call.material !== originalMaterials[index]));
      assert.ok(contrasted.every(call => call.material.alpha >= .9 && !call.material.additive),'Silhouettes lisibles, même pour les castes du voile');
      for (let frame=0;frame<5;frame++) capture();
      assert.equal(enemy.contrastMaterials,cached,'La palette est réutilisée entre les images');
      host.settings.enemyContrast=false;
      const restored=capture();
      assert.ok(restored.every((call,index) => call.material === normal[index].material),'Retour immédiat aux matériaux d’origine');
      host.settings.reducedFlashes=false;
      assert.ok(capture().slice(0,enemy.parts.length).every(call => call.material === enemy.materials.flash),'Le comportement normal reste réversible');
      assert.deepEqual(enemy.parts.map(part => [part.baseScale.x,part.baseScale.y,part.baseScale.z]),scales);
      assert.deepEqual(originalMaterials.map(material => JSON.stringify(material)),originalSnapshots,'Les matériaux partagés ne sont pas mutés');
    }
  });
}

test('Joueur : un ralentissement expiré ne renforce pas le suivant', () => {
  const host = makeHost();
  host.player.slow(.48,.2);
  host.player.update(.3);
  host.player.slow(.1,1);
  assert.equal(host.player.slowAmount,.1);
  host.player.slow(.3,.5);
  assert.equal(host.player.slowAmount,.3,'Les effets encore actifs conservent le plus fort');
  host.player.reset('bulwark');
  assert.equal(host.player.slowAmount,0,'Une nouvelle tentative ne conserve pas le ralentissement');
});

test('Ennemi : expiration du ralentissement avant une nouvelle entrave', () => {
  const host = makeHost();
  const enemy = new Enemy(host,'sutured',new Vec3(0,0,-15),{ instant:true });
  enemy.takeDamage(1,{ slow:.42, slowDuration:.2 });
  enemy.update(.3);
  enemy.takeDamage(1,{ slow:.1, slowDuration:1 });
  assert.equal(enemy.slowAmount,.1);
});

test('Mêlée ennemie : deux positions sûres séparées par le coin d’un couvert', () => {
  const host = makeHost();
  const playerPosition = new Vec3(-10.45,0,6.95), enemyPosition = new Vec3(-9.35,0,5.85);
  assert.equal(host.arena._positionClear(playerPosition,.42),true);
  assert.equal(host.arena._positionClear(enemyPosition,.42),true);
  assert.equal(host.arena.lineBlocked(new Vec3(playerPosition.x,1.05,playerPosition.z),new Vec3(enemyPosition.x,1.05,enemyPosition.z)),true);
  host.player.position.copy(playerPosition);
  const enemy = new Enemy(host,'sutured',enemyPosition,{ instant:true });
  enemy.attackTimer = 0;
  const before = host.player.health + host.player.armor;
  assert.equal(enemy._melee(playerPosition.distanceToXZ(enemyPosition)),false);
  assert.equal(host.player.health + host.player.armor,before);
  host.player.position.set(0,0,10); enemy.position.set(0,0,11.3);
  assert.equal(enemy._melee(1.3),true,'Une vraie ouverture permet toujours la frappe');
  assert.ok(host.player.health + host.player.armor < before);
});

test('Munitions : coût exact, refus sans fonds et transfert réserve/chargeur', () => {
  const host = makeHost();
  const station = host.arena.stations.find(station => station.type === 'ammo');
  const rifle = host.weapons.states.rifle;
  rifle.mag = 0; rifle.reserve = 0; host.player.essence = station.cost - 1;
  assert.equal(host.arena.activateStation(station),false);
  assert.equal(rifle.reserve,0);
  assert.equal(host.player.essence,station.cost - 1);
  host.player.essence = station.cost;
  assert.equal(host.arena.activateStation(station),true);
  assert.equal(host.player.essence,0);
  const resupply = Math.ceil(rifle.maxReserve * .55);
  assert.equal(rifle.reserve,resupply);
  assert.equal(host.weapons.startReload(),true);
  host.weapons.finishReload();
  assert.equal(rifle.mag,host.weapons.magazineSize('rifle'));
  assert.equal(rifle.reserve + rifle.mag,resupply,'Aucune munition créée pendant le rechargement');
});

test('Rempart : égide et réduction de dégâts à santé critique effectives', () => {
  const host = makeHost();
  host.waveActive = true;
  assert.equal(host.player.useAbility(),true);
  host.player.armor = 0;
  assert.equal(host.player.damage(40),10);
  host.player.abilityActive = 0; host.player.invulnerable = 0; host.player.health = 30;
  assert.ok(Math.abs(host.player.damage(20) - 16.4) < 1e-9);
});

test('Exécuteur : frénésie distincte et armure sur élimination rapprochée', () => {
  const host = makeHost();
  host.player.reset('executioner'); host.waveActive = true;
  const baseDamage = host.player.damageMultiplier();
  assert.equal(host.player.useAbility(),true);
  assert.ok(Math.abs(host.player.damageMultiplier() / baseDamage - 1.32) < 1e-9);
  assert.equal(host.player.fireRateMultiplier(),1.48);
  assert.equal(host.player.reloadMultiplier(),.55);
  host.player.armor = 0;
  const enemy = new Enemy(host,'sutured',host.player.position.clone().add(new Vec3(0,0,-1)),{ instant:true });
  enemy.takeDamage(enemy.health + 1,{ zone:'body' });
  assert.equal(host.player.armor,3);
});

test('Occultiste : nova amplifiée par la Souillure puis purification réelle', () => {
  const damage = [];
  for (const corruption of [0,1]) {
    const host = makeHost();
    host.player.reset('occultist'); host.waveActive = true;
    host.player.corruption = corruption; host.player.health = 60;
    const enemy = new Enemy(host,'grinder',host.player.position.clone().add(new Vec3(0,0,-1)),{ instant:true });
    host.enemies.push(enemy);
    const before = enemy.health;
    assert.equal(host.player.useAbility(),true);
    damage.push(before - enemy.health);
    assert.equal(host.player.health,78);
    assert.ok(Math.abs(host.player.corruption - Math.max(0,corruption-.42)) < 1e-9);
  }
  assert.ok(damage[1] > damage[0] * 2);
});

// Campagnes déterministes : éliminations injectées via takeDamage, jamais un test d’équilibrage/FPS.
// Le directeur, les objectifs, achats, greffes, checkpoints et l’extraction restent les vrais modules.
for (const sectorId of Object.keys(NT.Data.SECTORS)) for (const difficultyId of Object.keys(NT.Data.DIFFICULTIES)) {
  test('Campagne 10 vagues : ' + sectorId + ' / ' + difficultyId, () => {
    const host = makeHost(difficultyId,sectorId);
    host.startNextWave();
    const acquired = [];
    for (let expectedWave = 1; expectedWave <= 10; expectedWave++) {
      assert.equal(host.wave,expectedWave);
      for (const station of host.arena.stations.filter(station => station.type === 'armory')) {
        if (station.unlockWave <= host.wave && !host.player.unlockedWeapons.has(station.weapon) && host.player.essence >= station.cost) {
          const before = host.player.essence;
          assert.equal(host.arena.activateStation(station),true);
          assert.equal(host.player.essence,before-station.cost);
          assert.ok(host.weapons.states[station.weapon].mag > 0 && host.weapons.states[station.weapon].reserve > 0);
          acquired.push(station.weapon);
        }
      }
      if (host.waveObjective.type === 'hold') {
        const safe = host.arena.findSafePosition(host.waveObjective.position,host.player.radius);
        assert.ok(safe.distanceToXZ(host.waveObjective.position) <= host.waveObjective.radius,'Une position praticable doit exister dans le sceau');
        host.player.position.copy(safe);
      }
      let ticks = 0;
      while (host.waveActive && !host.extractionActive && ticks++ < 400) {
        host._updateWaveObjective(.5);
        host._updateWaveDirector(.5);
        for (const enemy of [...host.enemies]) {
          enemy.spawnTimer = 0;
          enemy.takeDamage(enemy.health + 1,{ zone:'body', source:'contract-test' });
        }
        host._updateEntities(.01,false);
      }
      assert.ok(ticks < 400,'Le directeur ne doit pas rester bloqué');
      if (expectedWave === 10) {
        assert.equal(host.extractionActive,true);
        const safe = host.arena.findSafePosition(host.extractionZone.position,host.player.radius);
        assert.ok(safe.distanceToXZ(host.extractionZone.position) <= host.extractionZone.radius,'Extraction accessible à pied');
        host.player.position.copy(safe);
        host._updateExtraction(3.3);
      } else {
        assert.equal(host.pendingUpgrade,true);
        host._updateWaveDirector(2.2);
        assert.equal(host.state,'upgrade');
        host.applyUpgrade(host.upgradeOptions[0]);
        assert.equal(host.save.data.activeRun.nextWave,expectedWave+1);
        host._updateIntermission(20.1);
      }
    }
    assert.equal(host.state,'victory');
    assert.equal(host.stats.wavesCleared,10);
    assert.equal(host.stats.bossKills,2);
    assert.equal(host.save.data.activeRun,null);
    assert.equal(acquired.length,4,'Les quatre achats doivent être possibles sur ce parcours sans dépense de munitions');
  });
}

console.log('\nCombat/progression : ' + passed + ' réussis, ' + failed + ' échoués.');
if (failed) process.exitCode = 1;
