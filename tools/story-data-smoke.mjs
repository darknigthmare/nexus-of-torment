import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Données et résolveurs réels, sans scène ni simulation de combat.
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source=fs.readFileSync(path.join(root,'src/game/story.js'),'utf8');
const context=vm.createContext({window:{}});
vm.runInContext(source,context,{filename:'src/game/story.js'});
const S=context.window.NT.Story;
const dataContext=vm.createContext({window:{}});
vm.runInContext(fs.readFileSync(path.join(root,'src/game/data.js'),'utf8'),dataContext);
const D=dataContext.window.NT.Data;
const plain=value=>JSON.parse(JSON.stringify(value));
let passed=0,failed=0;
function test(label,run) {
  try {run();passed++;console.log('OK  '+label);}
  catch(error) {failed++;console.error('FAIL '+label+': '+error.message);}
}
function text(value,label,max=900) {
  assert.equal(typeof value,'string',label);
  assert.ok(value.trim().length>0 && value.length<=max,label+' non vide et borné');
  assert.doesNotMatch(value,/<[^>]*>|\b(?:TODO|TBD|lorem ipsum)\b/i,label+' sans HTML ni placeholder');
}
function unique(values) {assert.equal(new Set(values).size,values.length);}
function allFrozen(value) {
  if(!value || typeof value!=='object')return;
  assert.equal(Object.isFrozen(value),true);
  Object.values(value).forEach(allFrozen);
}
function position(point,sectorId) {
  assert.equal(point.length,3);
  assert.ok(point.every(Number.isFinite));
  assert.equal(point[1],0);
  const bounds=D.SECTORS[sectorId].bounds;
  assert.ok(point[0]>bounds.minX+1 && point[0]<bounds.maxX-1);
  assert.ok(point[2]>bounds.minZ+1 && point[2]<bounds.maxZ-1);
}

test('Registre autonome sans moteur, DOM, stockage ou horloge',()=>{
  assert.equal(S.VERSION,1);
  assert.deepEqual(Object.keys(context.window.NT),['Story']);
  for(const name of ['getMission','getChapter','getChoice','getOption','getArchives','getEnding'])assert.equal(typeof S[name],'function');
});
test('Chargement préserve les autres modules du namespace',()=>{
  const sentinel={preserved:true},sandbox={window:{NT:{Data:sentinel}}};
  vm.runInNewContext(source,sandbox);
  assert.equal(sandbox.window.NT.Data,sentinel);
  assert.ok(sandbox.window.NT.Story);
});
test('Tous les descripteurs imbriqués sont immuables',()=>{
  allFrozen(S);
  assert.throws(()=>{S.MISSIONS[3].objective.positions[0][0]=0;});
  assert.throws(()=>{S.CHOICES[0].options[0].effects.maxArmor=999;});
});
test('Registre sérialisable sans références cycliques ni nombres non finis',()=>{
  const value=JSON.stringify(S,(key,entry)=>{
    if(typeof entry==='number')assert.ok(Number.isFinite(entry));
    return entry;
  });
  assert.ok(value.length>10000);
  assert.equal(JSON.parse(value).MISSIONS.length,10);
});
test('Trois chapitres ordonnés, dix offices sans trou ni chevauchement',()=>{
  assert.deepEqual(plain(S.CHAPTERS.map(c=>[c.id,c.sectorId,c.firstWave,c.lastWave])),[
    ['threshold','sanctum',1,3],['sutures','nave',4,6],['testimony','ossuary',7,10]
  ]);
  assert.equal(S.MISSIONS.length,10);
  unique(S.MISSIONS.map(m=>m.id));
  unique(S.MISSIONS.map(m=>m.journal.id));
  for(let wave=1;wave<=10;wave++)assert.equal(S.CHAPTERS.filter(c=>wave>=c.firstWave&&wave<=c.lastWave).length,1);
});

const expectedTypes=['purge','hold','hunt','relay','boss','hunt','transport','hold','purge','boss'];
for(let wave=1;wave<=10;wave++)test('Office '+wave+' : scène, objectif, chapitre et journal cohérents',()=>{
  const mission=S.getMission(wave),chapter=S.getChapter(wave);
  assert.equal(mission,S.MISSIONS[wave-1]);
  assert.equal(mission.wave,wave);
  assert.equal(mission.chapterId,chapter.id);
  assert.equal(mission.sectorId,chapter.sectorId);
  assert.ok(D.SECTORS[mission.sectorId]);
  assert.equal(mission.objective.type,expectedTypes[wave-1]);
  text(mission.title,'titre',80);text(mission.speaker,'voix',70);text(mission.text,'annonce',350);
  text(mission.journal.title,'titre journal',80);text(mission.journal.text,'journal',650);
  assert.equal(mission.journal.id,mission.id);
  assert.notEqual(mission.journal.text,mission.text);
});
test('Résolveurs de mission refusent vagues invalides sans convertir les chaînes',()=>{
  for(const value of [-1,0,11,Infinity,NaN,1.5,'1','4',null,undefined,{},[]]){
    assert.equal(S.getMission(value),null);assert.equal(S.getChapter(value),null);
  }
});
test('Boss finaux alignés avec les castes et offices existants',()=>{
  assert.equal(S.getMission(5).objective.boss,'gatekeeper');
  assert.equal(S.getMission(10).objective.boss,'archdeacon');
  for(const wave of [5,10])assert.ok(D.ENEMIES[S.getMission(wave).objective.boss].boss);
});
test('Relais : trois étapes distinctes, durée et rayon praticables dans la Nef',()=>{
  const objective=S.getMission(4).objective;
  assert.equal(objective.positions.length,3);
  unique(objective.positions.map(p=>p.join(',')));
  objective.positions.forEach(p=>position(p,'nave'));
  assert.equal(objective.duration,2.5);assert.equal(objective.radius,2.6);
});
test('Transport : deux bornes séparées, portage −22 %, durée et rayon explicites',()=>{
  const objective=S.getMission(7).objective;
  position(objective.pickup,'ossuary');position(objective.delivery,'ossuary');
  assert.ok(Math.hypot(objective.pickup[0]-objective.delivery[0],objective.pickup[2]-objective.delivery[2])>30);
  assert.equal(objective.speedMultiplier,.78);assert.equal(objective.duration,3);assert.equal(objective.radius,2.8);
  assert.match(S.getMission(7).text,/22 %/);
});
test('Deux décisions non chronométrées seulement après les offices 3 et 6',()=>{
  assert.deepEqual(plain(S.CHOICES.map(c=>[c.id,c.afterWave,c.timed])),[['protocol',3,false],['testimony',6,false]]);
  for(const choice of S.CHOICES){
    assert.equal(S.getChoice(choice.id),choice);assert.equal(S.getChoice(choice.afterWave),choice);
    assert.equal(choice.options.length,2);unique(choice.options.map(o=>o.id));
    text(choice.title,'titre choix',80);text(choice.text,'texte choix',350);
    for(const option of choice.options){
      assert.equal(S.getOption(choice.id,option.id),option);
      text(option.title,'option',80);text(option.benefit,'bénéfice',180);text(option.cost,'coût',180);text(option.text,'motif',350);
      assert.ok(Object.values(option.effects).every(Number.isFinite));
    }
  }
});
test('IDs inconnus et permutations de choix refusés',()=>{
  for(const value of [0,1,4,7,10,'3','__proto__','constructor',null,undefined,{}])assert.equal(S.getChoice(value),null);
  assert.equal(S.getOption('protocol','preserve'),null);assert.equal(S.getOption('testimony','seal'),null);
  assert.equal(S.getOption('__proto__','seal'),null);
});
test('Contrat exact des bénéfices/coûts des quatre options',()=>{
  assert.deepEqual(plain(S.getOption('protocol','seal').effects),{maxArmor:30,armor:30,maxHealth:-15});
  assert.deepEqual(plain(S.getOption('protocol','listen').effects),{damageMul:.1,corruptionDelta:.15});
  assert.deepEqual(plain(S.getOption('testimony','preserve').effects),{abilityRate:.2,maxArmor:-20});
  assert.deepEqual(plain(S.getOption('testimony','purge').effects),{reserveFraction:1,maxGrenades:-1});
});
test('Coûts de capacité praticables pour les 3 doctrines et les 4 branches sans méta',()=>{
  // Borne analytique des descripteurs, pas une exécution de chooseStoryOption.
  for(const doctrine of Object.values(D.CLASSES))for(const protocol of S.CHOICES[0].options)for(const testimony of S.CHOICES[1].options){
    const effects=[protocol.effects,testimony.effects];
    const sum=key=>effects.reduce((total,e)=>total+(e[key]||0),0);
    assert.ok(doctrine.health+sum('maxHealth')>=77,doctrine.id+' santé');
    assert.ok(doctrine.armor+sum('maxArmor')>=18,doctrine.id+' armure');
    assert.ok(2+sum('maxGrenades')>=1,doctrine.id+' grenades');
  }
});

test('Six archives : IDs persistants uniques et deux pièces par chapitre',()=>{
  assert.deepEqual(plain(S.ARCHIVES.map(a=>a.id)),['shift_07','threshold_plan','maintenance_tape','sanctifier_order','names_ledger','evacuation_copy']);
  unique(S.ARCHIVES.map(a=>a.id));
  for(const chapter of S.CHAPTERS)assert.equal(S.getArchives(chapter.id).length,2);
  assert.equal(S.getArchives('unknown').length,0);
});
for(const archive of S.ARCHIVES)test('Archive '+archive.id+' : voix, indice et position dans son secteur',()=>{
  const chapter=S.CHAPTERS.find(c=>c.id===archive.chapterId);
  assert.equal(archive.sectorId,chapter.sectorId);
  position(archive.position,archive.sectorId);
  assert.equal(archive.radius,2.4);
  text(archive.title,'titre',80);text(archive.speaker,'voix',70);text(archive.text,'archive',650);text(archive.hint,'indice',130);
  assert.doesNotMatch(archive.hint,/\[|\d/,'Pas de coordonnées techniques dans le journal');
});
test('Filtrer les archives ne partage pas un tableau mutable avec le registre',()=>{
  const first=S.getArchives('threshold'),second=S.getArchives('threshold');
  assert.notEqual(first,second);first.pop();assert.equal(second.length,2);assert.equal(S.ARCHIVES.length,6);
  assert.equal(second[0],S.ARCHIVES[0]);assert.ok(Object.isFrozen(second[0]));
});
test('Onze ancrages loin des bornes payantes, sans preuve de routage ou de combat',()=>{
  const anchors=S.ARCHIVES.map(a=>({p:a.position,sector:a.sectorId}));
  anchors.push(...S.getMission(4).objective.positions.map(p=>({p,sector:'nave'})));
  const transport=S.getMission(7).objective;
  anchors.push({p:transport.pickup,sector:'ossuary'},{p:transport.delivery,sector:'ossuary'});
  assert.equal(anchors.length,11);
  for(const {p,sector} of anchors)for(const station of D.SECTORS[sector].stations){
    assert.ok(Math.hypot(p[0]-station[2],p[2]-station[3])>2.4,sector+' / '+station[0]);
  }
});
test('Quatre branches rendent trois fins accessibles, sans collecte imposée',()=>{
  assert.equal(S.getEnding({protocol:'seal',testimony:'purge'}).id,'sealed');
  assert.equal(S.getEnding({protocol:'listen',testimony:'preserve'}).id,'witness');
  assert.equal(S.getEnding({protocol:'seal',testimony:'preserve'}).id,'scar');
  assert.equal(S.getEnding({protocol:'listen',testimony:'purge'}).id,'scar');
  assert.deepEqual(Object.keys(S.ENDINGS).sort(),['scar','sealed','witness']);
  for(const ending of Object.values(S.ENDINGS)){text(ending.title,'titre fin',80);text(ending.text,'conclusion',650);text(ending.journal,'journal fin',650);}
});
test('Fins mixtes distinctes et résolution déterministe sans mutation du canon',()=>{
  const before=JSON.stringify(S.ENDINGS);
  const keep=S.getEnding({protocol:'seal',testimony:'preserve'}),purge=S.getEnding({protocol:'listen',testimony:'purge'});
  assert.notEqual(keep.text,purge.text);assert.equal(keep.id,purge.id);
  assert.match(keep.text,/empreinte.*sort/);assert.match(purge.text,/effacé l’empreinte/);
  allFrozen(keep);allFrozen(purge);
  for(let i=0;i<100;i++)assert.equal(JSON.stringify(S.getEnding({protocol:'seal',testimony:'preserve'})),JSON.stringify(keep));
  assert.equal(JSON.stringify(S.ENDINGS),before);
});
test('Pas de fausse victoire narrative pour décisions incomplètes ou héritées',()=>{
  for(const input of [null,undefined,[],{},'sealed',{protocol:'seal'},{testimony:'purge'},{protocol:'',testimony:''},{protocol:'wrong',testimony:'preserve'},Object.create({protocol:'seal',testimony:'purge'})])assert.equal(S.getEnding(input),null);
});
test('Canon : empreinte non ressuscitable et archive locale après la purge',()=>{
  assert.match(S.getMission(6).journal.text,/pas une personne/);
  assert.match(S.getMission(8).speaker,/ARCHIVE LOCALE/);
  assert.match(S.ENDINGS.witness.journal,/pas les disparus à la vie/);
  assert.match(S.ARCHIVES.find(a=>a.id==='sanctifier_order').text,/évacuer/);
});

console.log('\n'+passed+' contrats de données réussis, '+failed+' échec(s). Aucun combat, navigateur ou déploiement simulé.');
if(failed)process.exitCode=1;
