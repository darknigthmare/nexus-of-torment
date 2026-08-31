import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let passed=0;
function check(condition,label){assert.ok(condition,label);console.log('OK  '+label);passed++;}
const disk=new Map(), notices=[];
let denied=false,writes=0;
const windowObject={matchMedia:()=>({matches:false})};
const context=vm.createContext({window:windowObject,console,structuredClone,setTimeout,clearTimeout,performance:{now:()=>0},
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},
  document:{dispatchEvent:event=>notices.push(event)},
  localStorage:{getItem:key=>disk.get(key)??null,setItem:(key,value)=>{if(denied)throw new Error('QuotaExceededError');writes++;disk.set(key,value);}}
});
for(const relative of ['src/core/math.js','src/core/engine.js','src/core/audio.js','src/game/data.js','src/game/progression.js','src/game/arena.js','src/game/entities.js','src/game/weapons.js','src/game/game.js']){
  vm.runInContext(fs.readFileSync(path.join(root,relative),'utf8'),context,{filename:relative});
}
const {Progression:P}=windowObject.NT;
const copy=value=>JSON.parse(JSON.stringify(value));
const initial=P.create(),independent=P.create();initial.archives.shift_07=true;
check(!independent.archives.shift_07,'Progression : defaults indépendants, aucune référence mutable partagée');
check(P.ACHIEVEMENTS.length===20&&new Set(P.ACHIEVEMENTS.map(item=>item.id)).size===20&&P.ACHIEVEMENTS.every(item=>item.name&&item.description&&Number.isInteger(item.reward)&&item.reward>0&&item.target>0),'Catalogue : vingt jalons nommés, bornés et récompensés');
check(P.ACHIEVEMENTS.reduce((sum,item)=>sum+item.reward,0)===41,'Économie : budget maximal explicite de 41 fragments pour les vingt jalons');
const empty=P.summary(P.create());
check(empty.completed===0&&empty.total===20&&empty.percent===0&&empty.next.id==='first_purge'&&empty.archives.total===6&&empty.endings.total===3&&empty.storyWave===0,'Complétion : aperçu vide exact et premier objectif concret');

let progress=P.create(),rewardTotal=0;
function event(value){const before=JSON.stringify(progress),result=P.apply(progress,value);assert.equal(JSON.stringify(progress),before,'Réducteur a muté son entrée');assert.equal(result.error,null);progress=result.data;rewardTotal+=result.reward;return result;}
for(const kind of P.OBJECTIVE_IDS){
  const first=event({type:'objective',kind}),second=event({type:'objective',kind});
  check(first.reward===1&&first.unlocked.length===1&&second.reward===0&&second.unlocked.length===0&&progress.objectives[kind]===2,'Objectif '+kind+' : événement réel compté, récompense une seule fois');
}
for(const id of P.BOSS_IDS){
  const first=event({type:'boss',id}),second=event({type:'boss',id});
  check(first.reward>0&&first.unlocked.length===1&&second.reward===0,'Boss '+id+' : maîtrise acquise une fois');
}
const high=event({type:'victory',modeId:'campaign',sectorId:'sanctum',classId:'bulwark',difficultyId:'nexus'});
check(high.reward===14&&P.DIFFICULTY_IDS.every(id=>progress.achievements['difficulty_'+id])&&progress.difficultyWins.nexus===1&&progress.difficultyWins.containment===0,'Difficultés : victoire Nexus certifie les seuils inférieurs sans fabriquer leurs compteurs');
check(event({type:'victory',modeId:'campaign',sectorId:'sanctum',classId:'bulwark',difficultyId:'nexus'}).reward===0,'Extraction répétée : aucun fragment de jalon rejoué');
const story=event({type:'victory',modeId:'story',sectorId:'ossuary',classId:'executioner',difficultyId:'unstable',endingId:'sealed'});
check(story.reward===4&&progress.sectorWins.sanctum===2&&progress.sectorWins.nave===0&&progress.sectorWins.ossuary===1&&progress.endings.sealed,'Histoire : une extraction réelle, pas trois victoires sectorielles inventées');
event({type:'victory',modeId:'campaign',sectorId:'nave',classId:'occultist',difficultyId:'red',endingId:undefined});
for(const endingId of ['witness','scar'])event({type:'victory',modeId:'story',sectorId:'ossuary',classId:'executioner',difficultyId:'unstable',endingId});
check(P.ENDING_IDS.every(id=>progress.endings[id])&&progress.achievements.all_endings,'Fins : les trois issues réellement enregistrées complètent le jalon');
for(let index=0;index<P.ARCHIVE_IDS.length;index++){
  const result=event({type:'archive',id:P.ARCHIVE_IDS[index]});
  check(result.reward===(index===5?3:0)&&event({type:'archive',id:P.ARCHIVE_IDS[index]}).changed===false,'Archive '+P.ARCHIVE_IDS[index]+' : découverte persistante et collecte répétée idempotente');
}
check(event({type:'endless',wave:19}).reward===0&&event({type:'endless',wave:20}).reward===3&&event({type:'endless',wave:20}).changed===false,'Sans fin : le jalon exige vingt offices terminés, jamais simplement le lancement du vingtième');
event({type:'mission',wave:4});event({type:'mission',wave:1});
check(progress.storyWave===4&&P.summary(progress).storyWave===4,'Journal : le maximum de mission découverte ne régresse pas');
const full=P.summary(progress);
check(full.completed===20&&full.percent===100&&full.next===null&&rewardTotal===41&&full.archives.completed===6&&full.endings.completed===3,'Atteignabilité : vingt jalons complétables par les événements autorisés pour exactement 41 fragments');

for(const bad of [null,{},Object.create({type:'archive',id:'shift_07'}),{type:'archive',id:'constructor'},{type:'archive',id:'toString'},{type:'boss',id:'__proto__'},
  {type:'objective',kind:'unknown'},{type:'mission',wave:11},{type:'mission',wave:.5},{type:'endless',wave:Infinity},
  {type:'victory',modeId:'endless',sectorId:'sanctum',classId:'bulwark',difficultyId:'nexus'},
  {type:'victory',modeId:'story',sectorId:'ossuary',classId:'bulwark',difficultyId:'nexus',endingId:'constructor'},
  {type:'victory',modeId:'campaign',sectorId:'sanctum',classId:'bulwark',difficultyId:'nexus',endingId:'sealed'}]){
  const before=JSON.stringify(progress),result=P.apply(progress,bad);
  check(Boolean(result.error)&&!result.changed&&result.reward===0&&JSON.stringify(progress)===before,'Événement invalide/hérité refusé : '+JSON.stringify(bad));
}
for(const mutate of [p=>{p.objectives.hold=-1;},p=>{p.storyWave=11;},p=>{p.endlessBestWave=10000;},p=>{p.archives.shift_07=1;},p=>{p.achievements.first_purge='yes';},p=>{p.version=2;},p=>{p.bosses.gatekeeper=NaN;},p=>{Object.defineProperty(p.archives,'__proto__',{value:{polluted:true},enumerable:true});}]){
  const invalid=P.create();mutate(invalid);const result=P.normalize(invalid,{strict:true});
  check(Boolean(result.error)&&result.repaired&&!P.normalize(result.data,{strict:true}).error,'Normalisation : valeur invalide réparée de manière idempotente et import strict refusé');
}
const inherited=P.create();inherited.archives=Object.create({shift_07:true});
check(!P.normalize(inherited).data.archives.shift_07&&({}).polluted===undefined,'Prototype : progression héritée ignorée, aucune pollution globale');

const NT=windowObject.NT,Store=NT.Engine.SaveStore;
const defaults={version:3,settings:{volume:.72,bindings:NT.Engine.Input.defaultBindings()},shards:0,
  meta:Object.fromEntries(Object.keys(NT.Data.META_UPGRADES).map(id=>[id,0])),codex:{enemyKills:{}},
  records:{bestWave:0,bestScore:0,lifetimeKills:0,bossKills:0,headshots:0,damage:0,runs:0,playTime:0},
  progression:P.create(),activeRun:null};
const canonical=NT.NexusGame.prototype._validateActiveRun({version:1,classId:'bulwark',difficultyId:'unstable',modeId:'campaign',sectorId:'sanctum',nextWave:4,player:{maxHealth:125,health:112,position:{x:0,y:0,z:10},yaw:.1}});
check(canonical?.version===2&&canonical.story===null,'Checkpoint : runtime migre explicitement le format historique vers v2');
const oldRun=copy(canonical);oldRun.version=1;oldRun.savedAt=123456789;delete oldRun.story;
const oldSave={...copy(defaults),version:2,shards:37,activeRun:oldRun};delete oldSave.progression;
oldSave.meta.vitalSeal=3;oldSave.codex.enemyKills.sutured=42;oldSave.records.runs=8;oldSave.records.bestWave=7;
const rawOld=JSON.stringify(oldSave);disk.set('legacy',rawOld);
const legacy=new Store('legacy',defaults);
check(legacy.data.version===3&&legacy.data.activeRun.version===2&&legacy.data.activeRun.story===null&&legacy.data.activeRun.savedAt===oldRun.savedAt&&!legacy.status.recovered,'Migration v2→v3 / checkpoint v1→v2 sans fausse réparation ni perte de timestamp');
check(legacy.data.shards===37&&legacy.data.meta.vitalSeal===3&&legacy.data.codex.enemyKills.sutured===42&&legacy.data.records.runs===8&&legacy.data.records.bestWave===7&&P.summary(legacy.data.progression).completed===0,'Migration : carrière, greffes, codex et records préservés sans victoires rétroactives inventées');
check(disk.get('legacy')===rawOld&&!disk.has('legacy:recovery'),'Migration de lecture : aucun écrasement avant une vraie sauvegarde');
check(legacy.save()&&!legacy.status.recovered&&JSON.parse(disk.get('legacy')).version===3,'Migration : première sauvegarde publie le nouveau schéma complet');
const receiver=new Store('receiver',defaults);
check(receiver.importJSON(rawOld).ok&&receiver.data.version===3&&receiver.data.activeRun.version===2&&!receiver.status.recovered,'Import JSON historique strict : migration explicite compatible');
for(const mutate of [s=>{s.activeRun.player.health=-1;},s=>{s.activeRun.classId='constructor';},s=>{s.activeRun.fakeField=1;},s=>{s.activeRun.story={version:1};},s=>{s.meta.vitalSeal=99;}]){
  const invalid=copy(oldSave);mutate(invalid);const before=receiver.exportJSON();
  check(!receiver.importJSON(JSON.stringify(invalid)).ok&&receiver.exportJSON()===before,'Migration stricte : données corrompues anciennes jamais blanchies par le changement de version');
}
const exported=legacy.exportJSON();
for(let index=0;index<3;index++)check(receiver.importJSON(exported).ok&&receiver.exportJSON()===exported&&!receiver._normalize(receiver.data,true).error,'Round-trip v3 strict stable '+(index+1));
const quota=new Store('quota',defaults),earned=P.apply(quota.data.progression,{type:'objective',kind:'purge'});
quota.data.progression=earned.data;quota.data.shards+=earned.reward;denied=true;
check(!quota.save()&&!disk.has('quota')&&quota.data.shards===1&&P.apply(quota.data.progression,{type:'objective',kind:'purge'}).reward===0,'Stockage refusé : reçu et fragments restent ensemble en mémoire, aucun double bonus');
denied=false;check(quota.save(),'Réessai du même gain : écriture confirmée sans nouvelle attribution');
const resumed=new Store('quota',defaults);
check(resumed.data.shards===1&&P.apply(resumed.data.progression,{type:'objective',kind:'purge'}).reward===0,'Rechargement : reçu de jalon durable interdit une récompense rejouée');
const oldDefaults=copy(defaults);oldDefaults.version=2;delete oldDefaults.progression;
disk.set('old-client',disk.get('legacy'));const beforeWrites=writes;
const oldClient=new Store('old-client',oldDefaults);
check(oldClient.status.futureVersion===3&&!oldClient.save()&&writes===beforeWrites&&oldClient.recoveryBackup===disk.get('legacy'),'Ancienne PWA v2 : refuse le dossier v3 au lieu d’effacer sa progression');
const stale=new Store('quota',defaults);resumed.data.shards=2;resumed.save();
const failedReward=P.apply(stale.data.progression,{type:'objective',kind:'hunt'});stale.data.progression=failedReward.data;stale.data.shards+=failedReward.reward;
check(!stale.save()&&stale.status.conflict&&JSON.parse(disk.get('quota')).shards===2&&!JSON.parse(disk.get('quota')).progression.achievements.first_hunt,'Multi-onglets : une récompense périmée ne remplace pas le dossier plus récent');
console.log('\nProgression : '+passed+' contrats validés.');
