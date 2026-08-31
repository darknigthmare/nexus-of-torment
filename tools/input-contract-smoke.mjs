import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

// Real Input/SaveStore code, deterministic event targets; no browser claims.
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sources = ['src/core/math.js', 'src/core/engine.js'].map(relative => [relative, fs.readFileSync(path.join(root, relative), 'utf8')]);
let passed = 0;
const check = (condition, label) => { assert.ok(condition, label); console.log('OK  ' + label); passed++; };
const json = value => JSON.stringify(value);
function target(id = '', tagName = 'DIV') {
  const listeners = new Map(), classes = new Set();
  return {
    id, tagName, style:{}, dataset:{}, isContentEditable:false,
    classList:{ contains:name => classes.has(name), add:name => classes.add(name), remove:name => classes.delete(name), toggle(name, active) { if (active ?? !classes.has(name)) classes.add(name); else classes.delete(name); } },
    closest() { return this.isContentEditable || ['INPUT','SELECT','TEXTAREA','BUTTON'].includes(this.tagName) ? this : null; },
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter(listener => listener !== fn)); },
    dispatchEvent(event) { event.target ||= this; for (const fn of listeners.get(event.type) || []) fn(event); return !event.defaultPrevented; },
    getBoundingClientRect:() => ({ left:0, top:0, width:100, height:100 }),
    setPointerCapture() {}, querySelectorAll:() => []
  };
}
function emit(receiver, type, properties = {}) {
  const event = { type, code:'', button:0, pointerId:1, pointerType:'touch', clientX:50, clientY:50, defaultPrevented:false, preventDefault() { this.defaultPrevented = true; }, ...properties };
  receiver.dispatchEvent(event);
  return event;
}
function fixture() {
  const windowObject = target('window'), document = target('document');
  const canvas = target('game-canvas', 'CANVAS');
  const controls = target('touch-controls');
  const move = target('touch-move'), knob = target('touch-move-knob'), look = target('touch-look');
  const fire = target('touch-fire', 'BUTTON'), reload = target('touch-reload', 'BUTTON'), wheel = target('touch-wheel', 'BUTTON');
  fire.dataset.mouse = '0'; reload.dataset.key = 'KeyR'; wheel.dataset.wheel = '1';
  controls.querySelectorAll = () => [fire, reload, wheel];
  const elements = new Map([controls,move,knob,look,fire,reload,wheel].map(element => [element.id, element]));
  document.getElementById = id => elements.get(id) || null;
  document.body = target('body', 'BODY'); document.pointerLockElement = null;
  document.exitPointerLock = () => { document.pointerLockElement = null; emit(document, 'pointerlockchange'); };
  windowObject.matchMedia = () => ({ matches:false });
  const disk = new Map(); let storageBlocked = false;
  const context = vm.createContext({
    window:windowObject, document, navigator:{maxTouchPoints:0}, console, setTimeout, clearTimeout, structuredClone,
    performance:{now:() => 0}, CustomEvent:class { constructor(type, options = {}) { this.type = type; this.detail = options.detail; } },
    localStorage:{getItem:key => disk.get(key) ?? null, setItem(key, value) { if (storageBlocked) throw new Error('QuotaExceededError'); disk.set(key, value); }}
  });
  for (const [relative, source] of sources) vm.runInContext(source, context, {filename:relative});
  const { Input, SaveStore } = windowObject.NT.Engine;
  const input = new Input(canvas);
  const key = (type, code, properties = {}) => emit(windowObject, type, {target:canvas, code, ...properties});
  const mouse = (type, button = 0, properties = {}) => emit(windowObject, type, {target:canvas, button, ...properties});
  const lock = active => { document.pointerLockElement = active ? canvas : null; emit(document, 'pointerlockchange'); };
  return {Input, SaveStore, input, window:windowObject, document, canvas, move, knob, look, fire, reload, wheel, disk, context, key, mouse, lock, blockStorage:value => {storageBlocked = value;}};
}

const api = fixture(), { Input } = api;
const expected = ['moveForward','moveBack','moveLeft','moveRight','sprint','jump','reload','grenade','ability','melee','interact','nextWave','weapon1','weapon2','weapon3','weapon4','weapon5','weapon6','fire','aim'];
check(json(Object.keys(Input.ACTIONS)) === json(expected) && expected.every(id => Input.defaultBindings()[id] === ''), 'API : vingt actions et aliases par défaut explicites');
check(Object.isFrozen(Input.ACTIONS) && Object.values(Input.ACTIONS).every(action => Object.isFrozen(action) && Object.isFrozen(action.codes)), 'API : définitions et aliases immuables');
const firstDefaults = Input.defaultBindings(); firstDefaults.fire = 'KeyH';
check(Input.defaultBindings().fire === '' && Input.validateBindings(undefined).valid && Input.validateBindings({}).valid, 'API : defaults frais et ancien profil sans commandes accepté');
check(Input.bindingLabel('moveForward', {}) === 'W / Z / ↑' && Input.bindingLabel('fire', {fire:'KeyH'}) === 'H' && Input.bindingLabel('aim', {aim:'Mouse1'}) === 'Clic milieu', 'Libellés : aliases AZERTY/QWERTY, clavier et souris');
check(['absent','constructor','__proto__'].every(id => Input.bindingLabel(id, {}) === ''), 'Libellés : identifiants inconnus/hérités sûrs');
for (const code of ['Escape','Tab','AltLeft','AltRight','MetaLeft','MetaRight','F1','F12','F24','PrintScreen','Unidentified','Mouse5','Keyé']) {
  check(!Input.isBindingCode(code) && !Input.validateBindings({fire:code}).valid, 'Validation : code réservé/inconnu refusé ' + code);
}
check(['KeyI','Numpad0','Mouse4','ControlLeft','ShiftRight','Space','ArrowUp'].every(code => Input.isBindingCode(code)), 'Validation : codes physiques usuels autorisés');
for (const [label, value] of [
  ['null',null], ['tableau',[]], ['valeur non textuelle',{fire:3}], ['action inconnue',{shoot:'KeyH'}],
  ['prototype JSON',JSON.parse('{"__proto__":{"polluted":true}}')], ['constructor',{constructor:'KeyH'}],
  ['prototype hérité',Object.create({fire:'KeyH'})], ['symbole',{[Symbol('fire')]:'KeyH'}],
  ['getter',Object.defineProperty({}, 'fire', {enumerable:true,get() {throw new Error('must not execute');}})],
  ['pollution non énumérable',Object.defineProperty({}, '__proto__', {value:{polluted:true}})]
]) {
  const result = Input.validateBindings(value);
  check(!result.valid && Boolean(result.error) && json(result.bindings) === json(Input.defaultBindings()), 'Validation : rejet atomique ' + label);
}
check(({}).polluted === undefined && vm.runInContext('({}).polluted', api.context) === undefined, 'Validation : aucun prototype pollué dans les deux contextes');
check(['KeyW','KeyZ','ArrowUp','Enter','KeyF','Mouse2'].every(code => !Input.validateBindings({fire:code}).valid), 'Conflits : tous aliases actifs, y compris suivants et visée, sont réservés');
check(Input.validateBindings({moveForward:'KeyI',fire:'KeyW'}).valid && Input.validateBindings({moveForward:'KeyS',moveBack:'KeyW'}).valid, 'Conflits : aliases libérés par réaffectation et échange simultané permis');
check(!Input.validateBindings({fire:'KeyH',aim:'KeyH'}).valid, 'Conflits : doublon personnalisé rejeté');

{
  const f = fixture(); f.lock(true);
  for (const [id, action] of Object.entries(Input.ACTIONS)) {
    for (const code of action.codes) {
      f.input.clearPhysicalInputs();
      const isMouse = code.startsWith('Mouse'), value = isMouse ? Number(code.slice(5)) : code;
      if (isMouse) f.mouse('mousedown', value); else f.key('keydown', value);
      const held = isMouse ? f.input.mouse(value) : f.input.key(code);
      const once = isMouse ? f.input.consumeMouse(value) : f.input.consume(code);
      const twice = isMouse ? f.input.consumeMouse(value) : f.input.consume(code);
      assert.ok(held && once && !twice, id + ' : ' + code);
      if (isMouse) f.mouse('mouseup', value); else f.key('keyup', value);
      assert.ok(!(isMouse ? f.input.mouse(value) : f.input.key(code)), id + ' released');
    }
  }
  check(true, 'Contrat historique : tous aliases des vingt actions, maintien, front unique et relâchement');
}
{
  const f = fixture(); f.lock(true); f.input.setBindings({moveForward:'KeyI'});
  for (const alias of ['KeyW','KeyZ','ArrowUp']) f.key('keydown', alias);
  check(!f.input.keyAny('KeyW','KeyZ','ArrowUp') && f.input.keys.size === 0, 'Réaffectation : W, Z et flèche haut deviennent tous inactifs');
  f.key('keydown', 'KeyI');
  check(['KeyW','KeyZ','ArrowUp'].every(code => f.input.key(code)) && f.input.consume('KeyW') && !f.input.consume('KeyZ'), 'Réaffectation : I pilote les requêtes canoniques sans double front');
  f.key('keyup','KeyI'); f.input.setVirtualKey('KeyW',true);
  check(f.input.key('KeyW') && f.input.consume('KeyW') && !f.input.key('KeyI'), 'Tactile : canonical virtuel W indépendant de sa touche physique');
  f.input.setBindings({nextWave:'KeyN'}); f.input.clearVirtualInputs();
  f.key('keydown','Enter'); f.key('keydown','KeyF');
  check(!f.input.consume('Enter') && !f.input.consume('KeyF'), 'Office suivant : anciens aliases désactivés ensemble');
  f.key('keydown','KeyN');
  check(f.input.consume('Enter') && !f.input.consume('KeyF'), 'Office suivant : un seul événement via Enter/F après réaffectation');
}
{
  const f = fixture(); f.lock(true); f.input.setBindings({fire:'KeyH',aim:'Mouse1',reload:'Mouse3'});
  f.mouse('mousedown',0); f.mouse('mousedown',2);
  check(!f.input.mouse(0) && !f.input.mouse(2), 'Combat : anciens boutons tir/visée désactivés');
  f.key('keydown','KeyH'); f.mouse('mousedown',1);
  check(f.input.mouse(0) && f.input.consumeMouse(0) && !f.input.consumeMouse(0) && f.input.mouse(2), 'Combat : tir au clavier et visée au clic milieu via API historique');
  const down = f.mouse('mousedown',3), up = f.mouse('mouseup',3), aux = f.mouse('auxclick',3);
  check(f.input.consume('KeyR') && down.defaultPrevented && up.defaultPrevented && aux.defaultPrevented, 'Souris latérale : action clavier et prévention de navigation native');
  f.input.clearPhysicalInputs(); f.input.setVirtualMouse(0,true); f.input.setVirtualKey('KeyR',true);
  check(f.input.mouse(0) && f.input.consumeMouse(0) && f.input.consume('KeyR'), 'Tactile : tir et recharge gardent leur signification malgré les bindings');
}
{
  const f = fixture(); f.lock(true);
  f.key('keydown','KeyW'); const button = target('pause-button','BUTTON'); f.key('keyup','KeyW',{target:button});
  check(!f.input.key('KeyW'), 'Régression : keyup sur bouton après changement de focus libère la marche');
  f.input.clearPhysicalInputs(); f.lock(false); f.mouse('mousedown',0,{target:button}); f.mouse('mouseup',0,{target:button}); f.lock(true);
  check(!f.input.mouse(0) && !f.input.consumeMouse(0), 'Régression : clic de menu ne produit pas un tir en reprenant');
  const editable = target('editor'); editable.isContentEditable = true;
  for (const form of [button, target('input','INPUT'), target('select','SELECT'), target('textarea','TEXTAREA'), editable]) {
    const event = f.key('keydown','Space',{target:form});
    assert.ok(!event.defaultPrevented && !f.input.key('Space'));
  }
  check(true, 'Formulaires et contenus éditables : ni interception ni action de jeu');
  for (const flags of [{defaultPrevented:true},{isComposing:true},{metaKey:true},{altKey:true}]) f.key('keydown','KeyW',flags);
  check(!f.input.key('KeyW'), 'Événements UI, IME et raccourcis Alt/Meta exclus');
  f.key('keydown','KeyW'); f.input.consume('KeyW'); f.key('keydown','KeyW',{repeat:true});
  check(f.input.key('KeyW') && !f.input.consume('KeyW'), 'Répétition clavier : maintien sans nouvelles actions discrètes');
  f.input.mouseDX = 15; f.input.wheel = 1; f.input.setVirtualMouse(0,true); f.lock(false);
  check(!f.input.key('KeyW') && f.input.mouseDX === 0 && f.input.wheel === 0, 'Perte pointer lock : états physiques et deltas purgés');
  f.lock(true); f.key('keydown','KeyW'); emit(f.window,'blur');
  check(!f.input.key('KeyW') && !f.input.mouse(0), 'Perte focus : clavier, souris et virtuels libérés');
  f.input.enabled = false; f.key('keydown','KeyW'); f.mouse('mousedown',0);
  check(!f.input.key('KeyW') && !f.input.mouse(0), 'Entrées désactivées : aucune capture physique');
}
{
  const f = fixture();
  f.key('keydown','KeyW');
  check(!f.input.key('KeyW'), 'Menu desktop sans verrouillage : le clavier reste au navigateur');
  f.mouse('mousedown',0);
  check(f.input.consumeMouse(0), 'Canvas : clic physique conservé hors verrouillage');
  f.input.touchMode = true; f.document.body.classList.add('game-active'); f.key('keydown','KeyW');
  check(f.input.key('KeyW'), 'Mode hybride tactile actif : clavier physique accepté');
  f.input.clearPhysicalInputs();
  const form = target('slider','INPUT');
  const ignored = f.mouse('wheel',0,{target:form,deltaY:120});
  const used = f.mouse('wheel',0,{deltaY:-120});
  check(!ignored.defaultPrevented && used.defaultPrevented && f.input.wheel === -1, 'Molette : préservée en jeu, non capturée dans les formulaires');
  f.key('keydown','KeyW'); f.input.setVirtualKey('Space',true); f.input.addLookDelta(3,4); f.input.endFrame();
  check(f.input.key('KeyW') && f.input.key('Space') && !f.input.consume('KeyW') && !f.input.consume('Space') && f.input.wheel === 0 && f.input.mouseDX === 0, 'Fin de frame : fronts/deltas remis à zéro, maintien intact');
}
{
  const f = fixture();
  emit(f.fire,'pointerdown',{pointerId:10}); emit(f.fire,'pointerdown',{pointerId:11});
  emit(f.fire,'pointerup',{pointerId:10});
  check(f.input.mouse(0) && f.fire.classList.contains('pressed'), 'Régression multitouch : deuxième doigt maintient FEU après relâchement du premier');
  emit(f.fire,'pointerup',{pointerId:99});
  check(f.input.mouse(0), 'Multitouch : relâchement étranger ignoré');
  emit(f.fire,'pointercancel',{pointerId:11});
  check(!f.input.mouse(0) && !f.fire.classList.contains('pressed'), 'Multitouch : dernier pointeur annulé libère FEU et état visuel');
  emit(f.reload,'pointerdown',{pointerId:20}); emit(f.reload,'pointerdown',{pointerId:21}); emit(f.reload,'lostpointercapture',{pointerId:20});
  check(f.input.key('KeyR') && f.input.consume('KeyR') && !f.input.consume('KeyR'), 'Multitouch : même contrat pour actions clavier virtuelles');
  f.input.clearVirtualInputs();
  check(!f.input.key('KeyR') && !f.reload.classList.contains('pressed'), 'Purge tactile : actions et apparence remises à zéro');
  emit(f.reload,'pointerdown',{pointerId:21});
  check(f.input.key('KeyR') && f.input.consume('KeyR'), 'Purge tactile : ownership libéré pour une nouvelle pression');
  emit(f.wheel,'pointerdown',{pointerId:30}); emit(f.wheel,'pointerdown',{pointerId:30});
  check(f.input.wheel === 1, 'Molette tactile : doublon du même pointeur sans double changement');
}
{
  const f = fixture();
  emit(f.move,'pointerdown',{pointerId:1,clientY:0});
  emit(f.move,'pointerdown',{pointerId:2,clientY:100}); emit(f.move,'pointermove',{pointerId:2,clientY:100}); emit(f.move,'pointerup',{pointerId:2});
  check(f.input.key('KeyW') && !f.input.key('KeyS'), 'Stick : premier pointeur propriétaire, aucun vol par le second');
  emit(f.move,'pointerup',{pointerId:1});
  check(!f.input.key('KeyW') && f.knob.style.transform === 'translate(-50%, -50%)', 'Stick : relâchement propriétaire recentre et arrête');
  emit(f.move,'pointerdown',{pointerId:1,clientY:0}); f.input.clearVirtualInputs();
  emit(f.move,'pointerdown',{pointerId:3,clientY:100});
  check(f.input.key('KeyS') && !f.input.key('KeyW'), 'Stick : purge de pause libère le propriétaire et recentre');
  emit(f.look,'pointerdown',{pointerId:1,clientX:50}); emit(f.look,'pointerdown',{pointerId:2,clientX:80}); emit(f.look,'pointermove',{pointerId:2,clientX:90});
  check(f.input.mouseDX === 0, 'Visée tactile : un deuxième doigt ne déplace pas la caméra');
  emit(f.look,'pointermove',{pointerId:1,clientX:60});
  check(f.input.mouseDX === 11.5, 'Visée tactile : delta du propriétaire conservé');
  f.input.clearVirtualInputs(); f.input.endFrame(); emit(f.look,'pointerdown',{pointerId:2,clientX:80}); emit(f.look,'pointermove',{pointerId:2,clientX:90});
  check(f.input.mouseDX === 11.5, 'Visée tactile : ownership libéré après purge');
}
{
  const f = fixture(); f.lock(true); f.key('keydown','KeyW');
  const custom = {moveForward:'KeyI'}; const result = f.input.setBindings(custom); custom.moveForward = 'KeyO'; result.bindings.moveForward = 'KeyP';
  check(f.input.bindings.moveForward === 'KeyI' && !f.input.key('KeyW'), 'Application : copie détachée des réglages et purge des entrées précédentes');
  const invalid = f.input.setBindings({fire:'Tab'});
  check(!invalid.valid && json(f.input.bindings) === json(Input.defaultBindings()), 'Application invalide : retour explicite et defaults sûrs');
}
{
  const f = fixture();
  f.window.NT.Data = {}; f.window.NT.Entities = {};
  vm.runInContext(fs.readFileSync(path.join(root, 'src/game/game.js'), 'utf8'), f.context, {filename:'src/game/game.js'});
  const prototype = f.window.NT.NexusGame.prototype;
  let persisted = 0, volume = null;
  const game = {
    input:f.input, camera:{}, renderer:{}, audio:{setVolume:value => {volume = value;}},
    settings:{bindings:{fire:'KeyH'},fov:200,renderScale:2,volume:.4,reducedFlashes:true,gore:false},
    applySettings:prototype.applySettings, saveSettings:() => {persisted++;}
  };
  game.applySettings(); f.lock(true); f.key('keydown','KeyH');
  check(f.input.mouse(0) && game.settings.bindings.fire === 'KeyH' && Object.keys(game.settings.bindings).length === 20, 'Game.applySettings : configuration normalisée raccordée au vrai Input');
  check(game.camera.fov === 105 && game.renderer.renderScale === 1.5 && volume === .4 && f.document.body.classList.contains('reduced-flashes'), 'Game.applySettings : caméra, audio et accessibilité préservés');
  game.settings.bindings.fire = 'Escape'; game.applySettings();
  check(game.settings.bindings.fire === '' && !f.input.mouse(0), 'Game.applySettings : option invalide neutralisée et touche précédente libérée');
  prototype.resetSettings.call(game);
  check(json(game.settings.bindings) === json(Input.defaultBindings()) && persisted === 1 && game.settings.timedUpgrades === false && game.settings.guidedHints === true, 'Game.resetSettings : commandes par défaut avec guidage et greffes sans chrono conservés');
}
{
  const f = fixture();
  const defaults = {version:2,settings:{bindings:Input.defaultBindings(),volume:.72},shards:0};
  f.disk.set('legacy',json({version:1,settings:{volume:.5},shards:12}));
  const legacy = new f.SaveStore('legacy',defaults);
  check(legacy.data.shards === 12 && legacy.data.settings.volume === .5 && json(legacy.data.settings.bindings) === json(Input.defaultBindings()), 'Sauvegarde : profil ancien conserve la progression et reçoit les aliases par défaut');
  const custom = {version:2,settings:{volume:.5,bindings:{moveForward:'KeyI',fire:'KeyW',aim:'Mouse1'}},shards:42};
  const store = new f.SaveStore('custom',defaults);
  check(store.importJSON(json(custom)).ok && store.data.settings.bindings.moveForward === 'KeyI', 'Import strict : commandes valides appliquées avec progression');
  const loaded = new f.SaveStore('custom',defaults);
  check(loaded.data.shards === 42 && loaded.data.settings.bindings.fire === 'KeyW' && loaded.data.settings.bindings.aim === 'Mouse1', 'Sauvegarde : commandes persistées puis relues sans perte');
  const input = f.input; input.setBindings(loaded.data.settings.bindings); f.lock(true); f.key('keydown','KeyW');
  check(input.mouse(0) && !input.keyAny('KeyW','KeyZ','ArrowUp'), 'Sauvegarde→Input : touche W de tir ne réactive pas la marche après relecture');
  for (const [label,bindings] of [
    ['code réservé',{fire:'Escape'}], ['code inconnu',{fire:'Invalid'}], ['conflit alias',{fire:'KeyZ'}], ['action inconnue',{shoot:'KeyH'}],
    ['prototype',JSON.parse('{"__proto__":{"polluted":true}}')], ['type invalide',null]
  ]) {
    const before = store.exportJSON(), diskBefore = f.disk.get('custom');
    const result = store.importJSON(json({...custom,settings:{...custom.settings,bindings}}));
    check(!result.ok && store.exportJSON() === before && f.disk.get('custom') === diskBefore, 'Import strict : ' + label + ' rejeté sans mutation mémoire/disque');
  }
  const corrupted = json({...custom,settings:{...custom.settings,bindings:{fire:'KeyZ'}}}); f.disk.set('repair',corrupted);
  const repaired = new f.SaveStore('repair',defaults);
  check(repaired.data.shards === 42 && json(repaired.data.settings.bindings) === json(Input.defaultBindings()) && repaired.recoveryBackup === corrupted && f.disk.get('repair:recovery') === corrupted, 'Chargement : commandes invalides réparées, progression et original récupérable conservés');
  f.blockStorage(true); const before = store.exportJSON();
  check(!store.importJSON(json({...custom,settings:{bindings:{fire:'KeyH'},volume:.3}})).ok && store.exportJSON() === before, 'Import : stockage refusé ne remplace pas les commandes mémoire');
}

console.log(`\nInput contracts : ${passed}/${passed} assertions vérifiées.`);
