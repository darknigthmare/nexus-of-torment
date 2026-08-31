// Diagnostic analytique, jamais un bot de jeu ni une mesure de difficulté humaine.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const seedCount=Math.max(1,Math.min(32,Number(process.argv.find(arg=>arg.startsWith('--seeds='))?.split('=')[1])||8));
const json=process.argv.includes('--json');
const noop=()=>{};
let runtimeRandom=()=>.5;
const context=vm.createContext({window:{},console,setTimeout,clearTimeout,performance:{now:()=>0},random:()=>runtimeRandom()});
for(const file of ['src/core/math.js','src/core/engine.js','src/game/data.js','src/game/arena.js','src/game/entities.js','src/game/weapons.js','src/game/game.js']){
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
}
vm.runInContext('Math.random = random',context);
const NT=context.window.NT,D=NT.Data,{Vec3}=NT.Math;
const meshes=new Proxy({}, {get:(target,key)=>target[key]||(target[key]={name:String(key)})});
const silent=new Proxy({}, {get:()=>noop});
function rng(seed){let state=seed>>>0;return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}
function hostFor(difficultyId){
  const host=Object.create(NT.NexusGame.prototype);
  Object.assign(host,{
    wave:0,waveActive:true,state:'playing',modeId:'analysis',sectorId:'sanctum',
    difficulty:D.DIFFICULTIES[difficultyId],currentModifier:D.WAVE_MODIFIERS[0],
    renderer:{meshes},camera:{yaw:0,pitch:0,position:new Vec3(),shake:new Vec3(),forward:new Vec3(0,0,-1)},
    settings:{gore:false},audio:silent,ui:silent,particles:silent,
    enemies:[],projectiles:[],pickups:[],spawnQueue:[],score:0,killStreak:0,killStreakTimer:0,
    stats:NT.NexusGame.prototype._newStats(),save:{data:{codex:{enemyKills:{}}}},
    spawnAbilityRing:noop,explode:noop
  });
  host.arena={
    game:host,setObjectiveZone:noop,triggerGatePulse:noop,addBloodDecal:noop,
    getSpawnPoint:()=>new Vec3(0,0,0),resolvePosition:noop,scheduleChainStrike:noop
  };
  host.player=new NT.Entities.Player(host);host.player.reset('bulwark',{});
  host.weapons=new NT.WeaponSystem(host);host.weapons.reset({});
  return host;
}
function campaignPlan(seed,difficultyId){
  runtimeRandom=rng(seed);
  const host=hostFor(difficultyId),waves=[];
  for(let wave=1;wave<=10;wave++){
    host.wave=wave;host.currentModifier=host._pickModifier();host._configureWaveObjective();
    waves.push({wave,modifierId:host.currentModifier.id,objective:host.waveObjective.type,queue:host._buildWaveQueue()});
  }
  return waves;
}
const profiles=[
  {id:'corps10',accuracy:.1,heads:0},
  {id:'corps15',accuracy:.15,heads:0},
  {id:'corps25',accuracy:.25,heads:0},
  {id:'corps50',accuracy:.5,heads:0},
  {id:'tetes65',accuracy:.65,heads:1}
];
const supplies=[
  {id:'favorable',health:1,armor:1,collection:1,medicalEvery:0},
  {id:'pression',health:.5,armor:.4,collection:.6,medicalEvery:2}
];
function station(type){return {type,cost:D.STATIONS[type].cost,cooldown:0};}
function modeledRun(plan,difficultyId,profile,supply,arsenal,seed){
  runtimeRandom=rng(seed+7231);
  const shotRandom=rng(seed+98123),collectionRandom=rng(seed+77129),host=hostFor(difficultyId);
  const ammo=station('ammo'),med=station('med');
  const result={completed:false,failedWave:null,shots:0,reloads:0,seconds:0,ammoVisits:0,ammoSpent:0,medicalSpent:0,medicalMissed:0,weaponSpent:0,dropAmmo:0,dropOther:0,lostDrops:0,bossAdds:0,essence:0,buys:[],waves:[]};
  const originalSpawn=host.spawnEnemy;
  host.spawnEnemy=function(type,position,options){
    const enemy=originalSpawn.call(this,type,position,options);
    if(options?.summonedByBoss)result.bossAdds++;
    return enemy;
  };
  function advance(dt){
    result.seconds+=dt;ammo.cooldown=Math.max(0,ammo.cooldown-dt);med.cooldown=Math.max(0,med.cooldown-dt);
    // Seuls les calendriers d’invocation réels sont exécutés. Mouvement/attaques désactivés.
    for(const boss of host.enemies.filter(enemy=>enemy.alive&&enemy.boss)){
      boss.attackTimer=1e9;boss.abilityTimer=1e9;boss.state='slamWindup';boss.stateTimer=1e9;
      if(boss.type==='archdeacon')boss._updateArchdeacon(dt,new Vec3(0,0,1),30,0);
      else boss._updateBoss(dt,new Vec3(0,0,1),30,0);
    }
  }
  function collectDrops(){
    for(const pickup of host.pickups.splice(0)){
      if(collectionRandom()>supply.collection){result.lostDrops++;continue;}
      if(pickup.type==='ammo')result.dropAmmo++;else result.dropOther++;
      const old=host.player.position.clone();host.player.position.copy(pickup.position);pickup.update(.01);host.player.position.copy(old);
    }
  }
  function expectedDamage(config,enemy){
    const distance=config.id==='shotgun'?8:20;
    const falloff=distance<=config.falloffStart?1:distance>=config.falloffEnd?.55:1-.45*(distance-config.falloffStart)/(config.falloffEnd-config.falloffStart);
    const armor=enemy.config.frontalArmor||0;
    const multiplier=(1-profile.heads)*(1-armor)+profile.heads*config.headMultiplier;
    const purifier=config.special==='purifier'&&(enemy.config.flying||enemy.type==='choir'||enemy.type==='archdeacon')?1.24:1;
    return config.damage*config.pellets*profile.accuracy*multiplier*falloff*purifier;
  }
  function chooseWeapon(enemy){
    return [...host.player.unlockedWeapons].filter(id=>{const state=host.weapons.states[id];return state.mag+state.reserve>0;})
      .sort((a,b)=>{
        const speed=id=>{const config=D.WEAPONS[id];return expectedDamage(config,enemy)*config.magazine/((config.magazine-1)/config.fireRate+config.reload);};
        return speed(b)-speed(a);
      })[0];
  }
  function fireAt(enemy){
    let weaponId=chooseWeapon(enemy);
    if(!weaponId){
      if(host.player.essence<ammo.cost){result.failedWave=host.wave;result.blockedEnemy=enemy.type;result.ammoDeficit=ammo.cost-host.player.essence;return false;}
      advance(8+ammo.cooldown);
      if(!NT.Arena.prototype.activateStation.call(host.arena,ammo))throw new Error('Contrat station munitions invalide');
      result.ammoVisits++;result.ammoSpent+=ammo.cost;
      weaponId=chooseWeapon(enemy);
    }
    if(host.weapons.currentId!==weaponId){host.weapons.switchTo(weaponId,true);advance(.42);host.weapons.switchTimer=0;}
    const state=host.weapons.state(),config=D.WEAPONS[weaponId];
    if(!state.mag){
      if(!host.weapons.startReload())throw new Error('Rechargement modèle impossible');
      advance(host.weapons.reloadDuration);host.weapons.finishReload();result.reloads++;
    }
    state.mag--;result.shots++;
    const distance=weaponId==='shotgun'?8:20;
    const falloff=distance<=config.falloffStart?1:distance>=config.falloffEnd?.55:1-.45*(distance-config.falloffStart)/(config.falloffEnd-config.falloffStart);
    for(let pellet=0;pellet<config.pellets&&enemy.alive;pellet++){
      if(shotRandom()>profile.accuracy)continue;
      const head=shotRandom()<profile.heads;
      let damage=config.damage*falloff;
      if(config.special==='purifier'&&(enemy.config.flying||enemy.type==='choir'||enemy.type==='archdeacon'))damage*=1.24;
      // Pression statistique des drops, pas simulation de blessures ni invincibilité jouée.
      host.player.health=host.player.maxHealth*supply.health;host.player.armor=host.player.maxArmor*supply.armor;
      enemy.takeDamage(damage,{zone:head?'head':'body',headMultiplier:config.headMultiplier,direction:new Vec3(0,0,-1),source:'analytical-round'});
    }
    advance(1/config.fireRate);collectDrops();return true;
  }
  for(const wave of plan){
    host.wave=wave.wave;host.currentModifier=D.WAVE_MODIFIERS.find(mod=>mod.id===wave.modifierId);host.enemies=[];
    const before={seconds:result.seconds,shots:result.shots,ammoSpent:result.ammoSpent,essence:host.player.essence};
    if(arsenal==='achats')for(const config of Object.values(D.WEAPONS)){
      if(config.price&&config.unlockWave<=host.wave&&!host.player.unlockedWeapons.has(config.id)&&host.player.essence>=config.price+ammo.cost){
        const armory={type:'armory',weapon:config.id,cost:config.price,cooldown:0};
        NT.Arena.prototype.activateStation.call(host.arena,armory);advance(6);result.weaponSpent+=config.price;result.buys.push({wave:host.wave,id:config.id});
      }
    }
    // Le budget entier est traité : maintien/chasse/extraction peuvent le raccourcir en jeu.
    for(const entry of wave.queue){
      const enemy=new NT.Entities.Enemy(host,entry.type,new Vec3(0,0,0),{instant:true,elite:entry.elite});
      enemy.yaw=0;host.enemies.push(enemy);
    }
    let guard=0;
    while(host.enemies.some(enemy=>enemy.alive)&&guard++<100000){
      const target=host.enemies.find(enemy=>enemy.alive&&!enemy.boss&&!enemy.summonedByBoss)
        ||host.enemies.find(enemy=>enemy.alive&&enemy.boss)||host.enemies.find(enemy=>enemy.alive);
      target.spawnTimer=0;
      if(!fireAt(target)){result.essence=host.player.essence;return result;}
    }
    if(guard>=100000)throw new Error('Garde analytique atteinte');
    if(host.wave<10){host.waveActive=true;host._completeWave();advance(2.15+20);}
    else advance(3.2);
    if(supply.medicalEvery&&host.wave% supply.medicalEvery===0&&host.wave<10){
      if(host.player.essence>=med.cost){advance(8+med.cooldown);NT.Arena.prototype.activateStation.call(host.arena,med);result.medicalSpent+=med.cost;}
      else result.medicalMissed++;
    }
    result.waves.push({wave:host.wave,queue:wave.queue.length,shots:result.shots-before.shots,seconds:result.seconds-before.seconds,ammoSpent:result.ammoSpent-before.ammoSpent,essence:host.player.essence});
  }
  result.completed=true;result.essence=host.player.essence;result.reserveRounds=Object.values(host.weapons.states).reduce((sum,state)=>sum+state.mag+state.reserve,0);
  return result;
}
function reachableStations(){
  const output=[];
  for(const id of Object.keys(D.SECTORS)){
    const host=hostFor('unstable');host.wave=10;host.arena=new NT.Arena(host);host.arena.setSector(id);
    const arena=host.arena,step=.75,start=arena.findSafePosition(arena.getStartPosition(),.42);
    const point=(x,z)=>new Vec3(x*step,0,z*step),clear=(x,z)=>arena._positionClear(point(x,z),.42);
    let sx=Math.round(start.x/step),sz=Math.round(start.z/step);
    if(!clear(sx,sz)){
      let found=false;
      for(let dx=-2;dx<=2&&!found;dx++)for(let dz=-2;dz<=2&&!found;dz++)if(clear(sx+dx,sz+dz)){sx+=dx;sz+=dz;found=true;}
    }
    const queue=[[sx,sz]],seen=new Set([sx+','+sz]),found=new Set();
    for(let index=0;index<queue.length;index++){
      const [x,z]=queue[index],position=point(x,z);
      for(const station of arena.stations)if(position.distanceToXZ(station.position)<=2.5)found.add(station.id);
      for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const key=(x+dx)+','+(z+dz);if(seen.has(key)||!clear(x+dx,z+dz))continue;
        if([.25,.5,.75].some(t=>!arena._positionClear(point(x+dx*t,z+dz*t),.42)))continue;
        seen.add(key);queue.push([x+dx,z+dz]);
      }
    }
    output.push({sector:id,reachable:[...found],total:arena.stations.length,visited:seen.size});
  }
  return output;
}
const plans=new Map(),groups=[];
for(const difficultyId of Object.keys(D.DIFFICULTIES))for(let seed=1;seed<=seedCount;seed++)plans.set(difficultyId+seed,campaignPlan(seed*7919,difficultyId));
for(const difficultyId of Object.keys(D.DIFFICULTIES))for(const arsenal of ['depart','achats'])for(const profile of profiles)for(const supply of supplies){
  const runs=[];
  for(let seed=1;seed<=seedCount;seed++)runs.push(modeledRun(plans.get(difficultyId+seed),difficultyId,profile,supply,arsenal,seed*7919));
  const range=key=>[Math.min(...runs.map(run=>run[key])),Math.max(...runs.map(run=>run[key]))].map(value=>Math.round(value*10)/10);
  groups.push({difficultyId,arsenal,profile:profile.id,supply:supply.id,completed:runs.filter(run=>run.completed).length,total:seedCount,
    shots:range('shots'),seconds:range('seconds'),ammoSpent:range('ammoSpent'),medicalSpent:range('medicalSpent'),weaponSpent:range('weaponSpent'),essence:range('essence'),bossAdds:range('bossAdds'),dropAmmo:range('dropAmmo'),failures:runs.filter(run=>!run.completed).map(run=>({wave:run.failedWave,enemy:run.blockedEnemy,deficit:run.ammoDeficit})),
    waves:Array.from({length:10},(_,index)=>{const samples=runs.map(run=>run.waves[index]).filter(Boolean);return {wave:index+1,samples:samples.length,shots:samples.length?Math.round(samples.reduce((sum,wave)=>sum+wave.shots,0)/samples.length):null,seconds:samples.length?Math.round(samples.reduce((sum,wave)=>sum+wave.seconds,0)/samples.length):null};})});
}
const report={seedCount,runs:groups.reduce((sum,group)=>sum+group.total,0),profiles,supplies,groups,stations:reachableStations()};
if(json)console.log(JSON.stringify(report,null,2));
else{
  console.log('MODELE ANALYTIQUE — aucun playtest humain, aucune IA de combat / blessure simulée.');
  console.log('Précision par projectile/plomb ; tetes65 = 65 % touchent, TOUS ces impacts sont critiques.');
  console.log('Files complètes, sans greffes offensives/grenades/mêlée/brûlure/pénétration ; invocations boss plafonnées réelles.');
  console.log('| Difficulté | Arsenal | Profil | Drops | Financement | Tirs | Minutes modélisées | Essence munitions | Essence finale |');
  console.log('|---|---|---|---|---:|---:|---:|---:|---:|');
  for(const group of groups)console.log('| '+[group.difficultyId,group.arsenal,group.profile,group.supply,group.completed+'/'+group.total,group.shots.join('–'),group.seconds.map(s=>(s/60).toFixed(1)).join('–'),group.ammoSpent.join('–'),group.essence.join('–')].join(' | ')+' |');
  console.log('Stations (grille de collision de 0,75 m, pas parcours navigateur) : '+JSON.stringify(report.stations));
  console.log('Diagnostics terminés : '+report.runs+' scénarios. --json donne les moyennes par vague, coûts et échecs.');
}
