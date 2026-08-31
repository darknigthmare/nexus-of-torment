(function () {
  'use strict';
  const NT = window.NT = window.NT || {};
  const VERSION = 1;
  const ARCHIVE_IDS = Object.freeze(['shift_07','threshold_plan','maintenance_tape','sanctifier_order','names_ledger','evacuation_copy']);
  const ENDING_IDS = Object.freeze(['sealed','witness','scar']);
  const SECTOR_IDS = Object.freeze(['sanctum','nave','ossuary']);
  const DOCTRINE_IDS = Object.freeze(['bulwark','executioner','occultist']);
  const DIFFICULTY_IDS = Object.freeze(['containment','unstable','red','nexus']);
  const OBJECTIVE_IDS = Object.freeze(['purge','hold','hunt','relay','transport']);
  const BOSS_IDS = Object.freeze(['gatekeeper','archdeacon']);
  const own = (value, key) => Boolean(value && typeof value === 'object' && Object.hasOwn(value,key));
  const plain = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
  const map = (ids, initial) => Object.fromEntries(ids.map(id => [id,initial]));
  const countTrue = value => Object.values(value).filter(Boolean).length;
  const metrics = {};
  function achievement(id, name, description, reward, metric, target = 1) {
    metrics[id] = metric;
    return Object.freeze({id,name,description,reward,target});
  }

  const ACHIEVEMENTS = Object.freeze([
    achievement('first_purge','Premier office','Terminer un objectif de purge.',1,p=>p.objectives.purge),
    achievement('first_hold','Sceau stable','Terminer un objectif de maintien du sceau.',1,p=>p.objectives.hold),
    achievement('first_hunt','Signatures rompues','Terminer une chasse aux signatures marquées.',1,p=>p.objectives.hunt),
    achievement('first_relay','Circuit rétabli','Terminer un objectif de relais.',1,p=>p.objectives.relay),
    achievement('first_transport','Mémoire portée','Terminer un objectif de transport.',1,p=>p.objectives.transport),
    achievement('boss_gatekeeper','Gardien déchu','Abattre le Gardien du Seuil.',1,p=>p.bosses.gatekeeper),
    achievement('boss_archdeacon','Dernière sentence','Abattre l’Archidiacre des Nerfs.',2,p=>p.bosses.archdeacon),
    achievement('sector_sanctum','Fer silencieux','Réussir une extraction depuis le Sanctuaire de Fer.',2,p=>p.sectorWins.sanctum),
    achievement('sector_nave','Nef rendue','Réussir une extraction depuis la Nef des Sutures.',2,p=>p.sectorWins.nave),
    achievement('sector_ossuary','Témoignage extrait','Réussir une extraction depuis l’Ossuaire des Crochets.',2,p=>p.sectorWins.ossuary),
    achievement('doctrine_bulwark','Maîtrise du Rempart','Réussir une extraction avec le Rempart.',2,p=>p.doctrineWins.bulwark),
    achievement('doctrine_executioner','Maîtrise de l’Exécuteur','Réussir une extraction avec l’Exécuteur.',2,p=>p.doctrineWins.executioner),
    achievement('doctrine_occultist','Maîtrise de l’Occultiste','Réussir une extraction avec l’Occultiste.',2,p=>p.doctrineWins.occultist),
    ...DIFFICULTY_IDS.map((id,index) => achievement('difficulty_'+id,
      ['Confinement confirmé','Brèche maîtrisée','Liturgie traversée','Nexus dominé'][index],
      'Réussir une extraction en '+['Confinement local','Brèche instable','Liturgie rouge','Nexus ouvert'][index]+(index<3?' ou difficulté supérieure.':'.'),
      index+1,p=>DIFFICULTY_IDS.slice(index).reduce((total,key)=>total+p.difficultyWins[key],0))),
    achievement('all_archives','Dossier intégral','Retrouver les six archives physiques de l’histoire.',3,p=>countTrue(p.archives),6),
    achievement('all_endings','Trois issues au silence','Découvrir les trois fins de l’histoire.',5,p=>countTrue(p.endings),3),
    achievement('endless_20','Vingtième office','Terminer l’office 20 en mode sans fin.',3,p=>p.endlessBestWave,20)
  ]);

  function create() {
    return {
      version:VERSION,
      archives:map(ARCHIVE_IDS,false), endings:map(ENDING_IDS,false),
      achievements:map(ACHIEVEMENTS.map(item=>item.id),false),
      sectorWins:map(SECTOR_IDS,0), doctrineWins:map(DOCTRINE_IDS,0), difficultyWins:map(DIFFICULTY_IDS,0),
      objectives:map(OBJECTIVE_IDS,0), bosses:map(BOSS_IDS,0), endlessBestWave:0, storyWave:0
    };
  }

  function normalize(raw, options = {}) {
    const strict = typeof options === 'boolean' ? options : Boolean(options.strict);
    const issues = [], defaults = create();
    const invalid = path => { issues.push(path || 'progression'); };
    function walk(value, template, path = '') {
      if (plain(template)) {
        if (!plain(value)) { invalid(path); return template; }
        for (const key of Object.keys(value)) if (!Object.hasOwn(template,key)) invalid(path ? path+'.'+key : key);
        const result = {};
        for (const [key,fallback] of Object.entries(template)) {
          result[key] = own(value,key) ? walk(value[key],fallback,path ? path+'.'+key : key) : fallback;
        }
        return result;
      }
      if (typeof template === 'boolean') {
        if (typeof value !== 'boolean') { invalid(path); return template; }
        return value;
      }
      const max = path === 'version' ? VERSION : path === 'storyWave' ? 10 : path === 'endlessBestWave' ? 9999 : 1e9;
      const min = path === 'version' ? VERSION : 0;
      if (typeof value !== 'number' || !Number.isFinite(value)) { invalid(path); return template; }
      const bounded = Math.max(min,Math.min(max,Math.floor(value)));
      if (bounded !== value) invalid(path);
      return bounded;
    }
    const data = walk(raw,defaults);
    if (strict && !own(raw,'version')) invalid('version');
    return {data,repaired:issues.length>0,error:strict&&issues.length?'Progression invalide : '+[...new Set(issues)].slice(0,5).join(', '):null};
  }

  // Réducteur pur : le caller enregistre data ET reward dans la même sauvegarde.
  // Les booléens achievements sont le reçu des récompenses déjà attribuées.
  // Aucun timer, localStorage, hasard, statut UI ou bonus de puissance caché ici.
  function apply(raw, event) {
    const normalized = normalize(raw,{strict:true});
    const data = normalized.data, unlocked = [];
    const failed = message => ({data,unlocked,reward:0,changed:false,error:message});
    if (normalized.error) return failed(normalized.error);
    if (!plain(event) || !own(event,'type') || typeof event.type !== 'string') return failed('Événement de progression invalide.');
    const validId = (field,ids) => own(event,field) && typeof event[field] === 'string' && ids.includes(event[field]);
    const increment = (target,id) => { target[id]=Math.min(1e9,target[id]+1); };
    const before = JSON.stringify(data);
    if (event.type === 'objective') {
      if (!validId('kind',OBJECTIVE_IDS)) return failed('Objectif inconnu.');
      increment(data.objectives,event.kind);
    } else if (event.type === 'boss') {
      if (!validId('id',BOSS_IDS)) return failed('Boss inconnu.');
      increment(data.bosses,event.id);
    } else if (event.type === 'archive') {
      if (!validId('id',ARCHIVE_IDS)) return failed('Archive inconnue.');
      data.archives[event.id]=true;
    } else if (event.type === 'mission') {
      if (!own(event,'wave') || !Number.isInteger(event.wave) || event.wave<1 || event.wave>10) return failed('Mission inconnue.');
      data.storyWave=Math.max(data.storyWave,event.wave);
    } else if (event.type === 'endless') {
      if (!own(event,'wave') || !Number.isInteger(event.wave) || event.wave<1 || event.wave>9999) return failed('Office sans fin invalide.');
      data.endlessBestWave=Math.max(data.endlessBestWave,event.wave);
    } else if (event.type === 'victory') {
      if (!validId('modeId',['campaign','story']) || !validId('sectorId',SECTOR_IDS) ||
          !validId('classId',DOCTRINE_IDS) || !validId('difficultyId',DIFFICULTY_IDS) ||
          (event.modeId==='story' && !validId('endingId',ENDING_IDS)) ||
          (event.modeId!=='story' && own(event,'endingId') && event.endingId!=null)) return failed('Extraction invalide.');
      // Une histoire est une extraction, pas trois victoires sectorielles inventées.
      increment(data.sectorWins,event.sectorId);
      increment(data.doctrineWins,event.classId);
      increment(data.difficultyWins,event.difficultyId);
      if (event.modeId==='story') data.endings[event.endingId]=true;
    } else return failed('Type d’événement inconnu.');
    let reward = 0;
    for (const item of ACHIEVEMENTS) {
      if (!data.achievements[item.id] && metrics[item.id](data)>=item.target) {
        data.achievements[item.id]=true;
        unlocked.push(item.id);
        reward+=item.reward;
      }
    }
    return {data,unlocked,reward,changed:before!==JSON.stringify(data),error:null};
  }

  function summary(raw) {
    const data = normalize(raw).data;
    const items = ACHIEVEMENTS.map(item => ({...item,completed:data.achievements[item.id],progress:Math.min(item.target,metrics[item.id](data))}));
    const completed = items.filter(item=>item.completed).length;
    const next = items.filter(item=>!item.completed).sort((a,b)=>b.progress/b.target-a.progress/a.target)[0] || null;
    return {
      completed,total:items.length,percent:Math.round(completed*100/items.length),
      next:next?{id:next.id,name:next.name,description:next.description,progress:next.progress,target:next.target}:null,
      archives:{completed:countTrue(data.archives),total:ARCHIVE_IDS.length},
      endings:{completed:countTrue(data.endings),total:ENDING_IDS.length},storyWave:data.storyWave,items
    };
  }

  NT.Progression = Object.freeze({VERSION,ARCHIVE_IDS,ENDING_IDS,SECTOR_IDS,DOCTRINE_IDS,DIFFICULTY_IDS,OBJECTIVE_IDS,BOSS_IDS,ACHIEVEMENTS,create,normalize,apply,summary});
})();
