import nodeAssert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const describe = value => value?.tagName ? value.tagName + '#' + (value.getAttribute('id') || '') : typeof value === 'object' ? '[object]' : String(value);
// Avoid recursively dumping the entire cyclic fake DOM on a focus mismatch.
const assert = { ...nodeAssert, equal(actual, expected, message) { nodeAssert.ok(Object.is(actual, expected), message || describe(actual) + ' !== ' + describe(expected)); } };

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = ['src/core/math.js', 'src/core/engine.js', 'src/game/data.js', 'src/game/story.js', 'src/game/progression.js', 'src/game/ui.js'].map(relative => [relative, fs.readFileSync(path.join(root, relative), 'utf8')]);
// A deliberately small DOM for behavior contracts. Markup comes from index.html;
// real UIManager/SaveStore code runs unchanged. Layout, downloads and browser
// accessibility semantics still require the separate real-browser QA.
class Events {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) { const list = this.listeners.get(type) || []; list.push(fn); this.listeners.set(type, list); }
  dispatchEvent(event) {
    event.target ||= this;
    event.preventDefault ||= function () { this.defaultPrevented = true; };
    for (const fn of this.listeners.get(event.type) || []) fn(event);
    return !event.defaultPrevented;
  }
}
class Node extends Events {
  constructor(tag, document) {
    super(); this.tagName = tag.toUpperCase(); this.document = document; this.children = []; this.attributes = {}; this.dataset = {};
    this.style = { setProperty(key, value) { this[key] = value; } }; this.parentNode = null; this.disabled = false; this.checked = false; this._value = undefined;
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: (...names) => { this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' '); },
      remove: (...names) => { this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '); },
      toggle: (name, force) => { const on = force ?? !this.classList.contains(name); this.classList[on ? 'add' : 'remove'](name); return on; }
    };
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
    if (name === 'disabled') this.disabled = true;
    if (name === 'checked') this.checked = true;
    if (name === 'value') this._value = String(value);
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; if (name === 'disabled') this.disabled = false; }
  get className() { return this.attributes.class || ''; }
  set className(value) { this.attributes.class = value; }
  get tabIndex() { return Number(this.attributes.tabindex ?? (['BUTTON', 'INPUT', 'SELECT'].includes(this.tagName) ? 0 : -1)); }
  set tabIndex(value) { this.attributes.tabindex = String(value); }
  get value() { return this._value ?? (this.tagName === 'SELECT' ? (this.options.find(option => option.getAttribute('selected') !== null) || this.options[0])?.value : '') ?? ''; }
  set value(value) { this._value = String(value); }
  get options() { return this.children.filter(child => child.tagName === 'OPTION'); }
  get textContent() { return this.children.length ? this.children.map(child => child.textContent).join('') : this._text || ''; }
  set textContent(value) { this.children = []; this._text = String(value); }
  get firstChild() { return this.children[0] || null; }
  set innerHTML(value) { this.children = []; this._text = ''; parseMarkup(String(value), this, this.document); }
  get innerHTML() { return this.textContent; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); this.parentNode = null; }
  get offsetParent() { for (let node = this; node; node = node.parentNode) if (node.classList?.contains('hidden') || node.getAttribute?.('hidden') !== null && node.getAttribute?.('hidden') !== undefined) return null; return this.parentNode || this.document.body; }
  focus() { if (!this.disabled && this.offsetParent !== null) this.document.activeElement = this; }
  click() { if (this.disabled) return; if (this.tagName === 'A') this.document.downloads.push(this); this.dispatchEvent({ type: 'click' }); }
  querySelectorAll(selector) {
    const result = [];
    const matches = (node, fragment) => {
      if (!node.tagName || node.tagName === '#TEXT') return false;
      if (fragment.includes(':not([disabled])') && node.disabled) return false;
      if (fragment.includes(':not([tabindex="-1"])') && node.tabIndex === -1) return false;
      const clean = fragment.replace(/:not\([^)]*\)/g, '').trim();
      const tag = clean.match(/^[a-z]+/i)?.[0];
      if (tag && node.tagName !== tag.toUpperCase()) return false;
      for (const [, className] of clean.matchAll(/\.([\w-]+)/g)) if (!node.classList.contains(className)) return false;
      for (const [, name, value] of clean.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)) if (node.getAttribute(name) === null || value !== undefined && node.getAttribute(name) !== value) return false;
      return true;
    };
    const visit = node => { for (const child of node.children) { if (selector.split(',').some(part => matches(child, part))) result.push(child); visit(child); } };
    visit(this); return result;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
function parseMarkup(markup, parent, document) {
  const stack = [parent], voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  for (const token of markup.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-z][^>]*>|[^<]+/gi)) {
    const value = token[0];
    if (value.startsWith('<!')) continue;
    if (value.startsWith('</')) { const tag = value.match(/^<\/([\w-]+)/)[1].toUpperCase(); const index = stack.findLastIndex(node => node.tagName === tag); if (index > 0) stack.length = index; continue; }
    if (value.startsWith('<')) {
      const tag = value.match(/^<([\w-]+)/)[1], node = new Node(tag, document);
      const attrs = value.slice(tag.length + 1).replace(/\/?\s*>$/, '');
      for (const [, name, quoted, single, bare] of attrs.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) node.setAttribute(name, quoted ?? single ?? bare ?? '');
      stack.at(-1).appendChild(node);
      if (!voidTags.has(tag.toLowerCase()) && !value.endsWith('/>')) stack.push(node);
    } else { const text = new Node('#text', document); text.textContent = value; stack.at(-1).appendChild(text); }
  }
}

function fixture() {
  const document = new Events(); document.hidden = false; document.downloads = [];
  const domRoot = new Node('root', document); parseMarkup(html, domRoot, document);
  document.documentElement = domRoot.querySelector('html'); document.body = domRoot.querySelector('body'); document.activeElement = document.body;
  document.getElementById = id => domRoot.querySelectorAll('[id]').find(node => node.getAttribute('id') === id) || null;
  document.querySelectorAll = selector => domRoot.querySelectorAll(selector); document.createElement = tag => new Node(tag, document);
  const raf = [], timers = [], objectUrls = [], revoked = [], disk = new Map(); let failWrites = false;
  const windowObject = new Events(); windowObject.window = windowObject; windowObject.matchMedia = () => ({ matches: false });
  const storage = { getItem: key => disk.get(key) ?? null, setItem: (key, value) => { if (failWrites) throw new Error('QuotaExceededError'); disk.set(key, value); } };
  const context = vm.createContext({
    window: windowObject, document, console, structuredClone, Blob, localStorage: storage,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    URL: { createObjectURL: blob => { objectUrls.push(blob); return 'blob:nexus-test'; }, revokeObjectURL: url => revoked.push(url) },
    requestAnimationFrame: fn => raf.push(fn), setTimeout: (fn, delay) => timers.push({ fn, delay }), clearTimeout: () => {}
  });
  for (const [name, source] of scripts) vm.runInContext(source, context, { filename: name });
  const NT = windowObject.NT;
  const settings = { sensitivity:1,volume:.72,fov:82,renderScale:1,hudScale:1,shakeIntensity:1,headBob:true,reducedFlashes:false,reducedMotion:false,gore:true,invertY:false,uiContrast:false,enemyContrast:false,subtitles:true,guidedHints:true,timedUpgrades:false };
  const defaults = { version:2,settings,shards:600,meta:Object.fromEntries(Object.keys(NT.Data.META_UPGRADES).map(key => [key, 0])),codex:{enemyKills:{}},records:{},activeRun:null };
  const save = new NT.Engine.SaveStore('nexus-ui-contract', defaults); save.save();
  const events = { start:0,resume:0,restart:0,quit:0,settings:0,next:0,sounds:[] };
  const game = {
    save, settings:{...settings}, state:'menu', wave:1,runTime:1,intermissionActive:false,intermissionReadyDelay:0,intermissionTimer:20,
    input:{touchMode:false,clearVirtualInputs:()=>{},combatReady:()=>true},
    player:{position:new NT.Math.Vec3(),upgradeStacks:{}}, camera:{yaw:0}, enemies:[],
    audio:{init:()=>{},ui:kind=>events.sounds.push(kind)},
    startRun:()=>events.start++,resumeSavedRun:()=>events.resume++,resume:()=>{game.state='playing';},restartRun:()=>events.restart++,quitToMenu:()=>events.quit++,
    applySettings:()=>events.settings++,saveSettings:()=>{},resetSettings:()=>{},_startWaveFromIntermission:()=>events.next++
  };
  const ui = new NT.UIManager(game); game.ui = ui;
  const flushRaf = () => { for (const callback of raf.splice(0)) callback(); };
  return { NT,ui,game,document,window:windowObject,events,disk,objectUrls,revoked,timers,flushRaf,$:id=>document.getElementById(id),failWrites:value=>{failWrites=value;} };
}

let passed = 0; const failures = [];
async function test(label, callback) {
  try { await callback(); passed++; console.log(`OK  ${label}`); }
  catch (error) { failures.push(label); console.error(`FAIL ${label}\n${error.stack}`); }
}
const payload = f => JSON.stringify({ ...JSON.parse(f.game.save.exportJSON()), shards:900 });
const fileInput = (text, size = Buffer.byteLength(text)) => ({ value:'chosen.json', files:[{size,text:async()=>text}] });

await test('Construction UI depuis index.html et valeurs de greffe non chronométrée', () => { const f=fixture(); assert.equal(f.$('timed-upgrades').checked,false); assert.equal(f.$('guided-hints').checked,true); assert.equal(f.ui.selectedSector,'sanctum'); });
await test('Remplacer un checkpoint exige confirmation, annuler conserve le dossier', () => { const f=fixture(); f.game.save.data.activeRun={sentinel:true}; f.$('start-button').focus(); f.$('start-button').click(); f.flushRaf(); assert.equal(f.events.start,0); f.$('confirm-cancel').click(); f.flushRaf(); assert.equal(f.events.start,0); assert.equal(f.game.save.data.activeRun.sentinel,true); assert.equal(f.document.activeElement,f.$('start-button')); });
await test('Confirmation acceptée une seule fois même si double activation', () => { const f=fixture(); f.$('quit-button').click(); f.flushRaf(); f.$('confirm-accept').click(); f.$('confirm-accept').click(); assert.equal(f.events.quit,1); assert.equal(f.ui.pendingConfirmation,null); });
await test('Échap annule la confirmation sans exécuter son action', () => { const f=fixture(); f.$('restart-button').click(); f.flushRaf(); const event={type:'keydown',key:'Escape',code:'Escape'}; f.window.dispatchEvent(event); f.flushRaf(); assert.equal(event.defaultPrevented,true); assert.equal(f.events.restart,0); assert.equal(f.ui.pendingConfirmation,null); });
await test('Annulation imbriquée restaure la modale et le focus exact après animation frame', () => { const f=fixture(); f.$('settings-button').focus(); f.ui.openSettings(); f.flushRaf(); f.$('save-import').focus(); f.ui._confirmAction('Importer','Test',()=>{}); f.flushRaf(); f.$('confirm-cancel').click(); f.flushRaf(); assert.equal(f.ui.activeModal,f.ui.settingsScreen); assert.equal(f.document.activeElement,f.$('save-import')); f.ui.closeModal(f.ui.settingsScreen); f.flushRaf(); assert.equal(f.document.activeElement,f.$('settings-button')); });
await test('Tab et Maj+Tab restent dans la confirmation', () => { const f=fixture(); f.ui._confirmAction('Test','Test',()=>{}); f.flushRaf(); f.$('confirm-accept').focus(); const forward={type:'keydown',key:'Tab'}; f.window.dispatchEvent(forward); assert.equal(forward.defaultPrevented,true); assert.equal(f.document.activeElement,f.$('confirm-cancel')); const backward={type:'keydown',key:'Tab',shiftKey:true}; f.window.dispatchEvent(backward); assert.equal(f.document.activeElement,f.$('confirm-accept')); });
await test('Briefing depuis pause ferme et restaure la pause sans reprendre le jeu', () => { const f=fixture(); f.game.state='paused'; f.ui.mainMenu.classList.add('hidden'); f.ui.showPause(); f.flushRaf(); f.$('pause-briefing').focus(); f.$('pause-briefing').click(); f.flushRaf(); assert.equal(f.ui.pauseScreen.classList.contains('hidden'),true); f.ui.closeModal(f.ui.briefingScreen); f.flushRaf(); assert.equal(f.game.state,'paused'); assert.equal(f.ui.pauseScreen.classList.contains('hidden'),false); assert.equal(f.document.activeElement,f.$('pause-briefing')); });

await test('Import refusé hors menu avant même lecture du fichier', async () => { const f=fixture(); f.game.state='paused'; let reads=0; const input={value:'x',files:[{size:1,text:async()=>{reads++;return '{}';}}]}; await f.ui._readSaveFile(input); assert.equal(reads,0); assert.equal(input.value,''); assert.equal(f.ui.pendingConfirmation,null); });
await test('Import refuse plus de 256 Ko et ne lit pas le contenu', async () => { const f=fixture(); let reads=0; await f.ui._readSaveFile({value:'x',files:[{size:262145,text:async()=>{reads++;return '{}';}}]}); assert.equal(reads,0); assert.match(f.$('save-transfer-status').textContent,/256/); assert.equal(f.ui.pendingConfirmation,null); });
await test('Import accepte exactement 256 Ko et attend le consentement', async () => { const f=fixture(); await f.ui._readSaveFile(fileInput(payload(f).padEnd(262144,' '))); assert.ok(f.ui.pendingConfirmation); assert.equal(f.game.save.data.shards,600); f.ui._finishConfirmation(false); assert.equal(f.game.save.data.shards,600); });
await test('Changement d’état pendant lecture asynchrone annule l’import', async () => { const f=fixture(); let resolve; const pending=f.ui._readSaveFile({value:'x',files:[{size:10,text:()=>new Promise(done=>{resolve=done;})}]}); f.game.state='playing'; resolve(payload(f)); await pending; assert.equal(f.ui.pendingConfirmation,null); assert.equal(f.game.save.data.shards,600); });
await test('Import reste réservé au menu au moment de confirmer', async () => { const f=fixture(); await f.ui._readSaveFile(fileInput(payload(f))); f.flushRaf(); f.game.state='playing'; f.ui._finishConfirmation(true); assert.equal(f.game.save.data.shards,600); });
await test('Import valide persiste puis met à jour réglages et carrière', async () => { const f=fixture(); await f.ui._readSaveFile(fileInput(payload(f))); f.flushRaf(); f.ui._finishConfirmation(true); assert.equal(f.game.save.data.shards,900); assert.equal(JSON.parse(f.disk.get(f.game.save.key)).shards,900); assert.equal(f.events.settings,1); assert.match(f.$('save-transfer-status').textContent,/importé et enregistré/); });
await test('Import JSON invalide conserve données mémoire et disque', async () => { const f=fixture(); const before=f.game.save.exportJSON(),disk=f.disk.get(f.game.save.key); await f.ui._readSaveFile(fileInput('{invalid')); f.ui._finishConfirmation(true); assert.equal(f.game.save.exportJSON(),before); assert.equal(f.disk.get(f.game.save.key),disk); assert.equal(f.events.settings,0); assert.match(f.$('save-transfer-status').textContent,/Import refusé/); });
await test('Échec écriture import conserve intégralement la sauvegarde existante', async () => { const f=fixture(); const before=f.game.save.exportJSON(),disk=f.disk.get(f.game.save.key); await f.ui._readSaveFile(fileInput(payload(f))); f.failWrites(true); f.ui._finishConfirmation(true); assert.equal(f.game.save.exportJSON(),before); assert.equal(f.disk.get(f.game.save.key),disk); assert.equal(f.events.settings,0); assert.equal(f.$('save-status').classList.contains('hidden'),false); });
await test('Erreur de lecture fichier rend la main sans confirmation', async () => { const f=fixture(); await f.ui._readSaveFile({value:'x',files:[{size:10,text:async()=>{throw new Error('read');}}]}); assert.equal(f.ui.pendingConfirmation,null); assert.match(f.$('save-transfer-status').textContent,/Lecture.*impossible/); });
await test('Export prépare un Blob JSON valide et libère son URL', async () => { const f=fixture(); const before=f.game.save.exportJSON(); f.ui._exportSave(); assert.equal(f.objectUrls.length,1); assert.equal(await f.objectUrls[0].text(),before); assert.equal(f.objectUrls[0].type,'application/json'); assert.equal(f.document.downloads.length,1); assert.match(f.document.downloads[0].download,/^nexus-dossier-.*\.json$/); f.timers.filter(timer=>timer.delay===1000).forEach(timer=>timer.fn()); assert.deepEqual(f.revoked,['blob:nexus-test']); assert.equal(f.game.save.exportJSON(),before); });

await test('Achat réussi déduit exactement les fragments et persiste le rang', () => { const f=fixture(); const meta=Object.values(f.NT.Data.META_UPGRADES)[0]; f.ui.buyMeta(meta.id); assert.equal(f.game.save.data.shards,600-meta.baseCost); assert.equal(f.game.save.data.meta[meta.id],1); assert.equal(JSON.parse(f.disk.get(f.game.save.key)).meta[meta.id],1); });
await test('Achat échoué restaure fragments et rang avec SaveStore réel', () => { const f=fixture(); const meta=Object.values(f.NT.Data.META_UPGRADES)[0],before=f.game.save.exportJSON(),disk=f.disk.get(f.game.save.key); f.failWrites(true); f.ui.buyMeta(meta.id); assert.equal(f.game.save.exportJSON(),before); assert.equal(f.disk.get(f.game.save.key),disk); assert.equal(f.$('save-status').classList.contains('hidden'),false); assert.equal(f.events.sounds.at(-1),'error'); });
await test('Achat refuse fonds insuffisants, rang maximal et identifiant inconnu', () => { const f=fixture(); const meta=Object.values(f.NT.Data.META_UPGRADES)[0]; f.game.save.data.shards=0; f.ui.buyMeta(meta.id); assert.equal(f.game.save.data.meta[meta.id],0); f.game.save.data.shards=600; f.game.save.data.meta[meta.id]=meta.max; f.ui.buyMeta(meta.id); f.ui.buyMeta('inconnu'); assert.equal(f.game.save.data.shards,600); assert.equal(f.game.save.data.meta[meta.id],meta.max); });

await test('Greffe par défaut attend sans limite et accepte un seul choix manuel', () => { const f=fixture(); f.game.state='upgrade'; let selected=0; f.ui.showUpgrades(f.NT.Data.UPGRADES.slice(0,3),24,()=>selected++); f.flushRaf(); f.ui.update(300); assert.equal(f.ui.upgradeTimer,24); assert.equal(selected,0); f.ui.selectUpgrade(1); f.ui.selectUpgrade(1); assert.equal(selected,1); });
await test('Greffe chronométrée se règle par le contrôle et choisit à échéance', () => { const f=fixture(); f.$('timed-upgrades').checked=true; f.$('timed-upgrades').dispatchEvent({type:'change'}); assert.equal(f.game.settings.timedUpgrades,true); f.game.state='upgrade'; let chosen; const options=f.NT.Data.UPGRADES.slice(0,3); f.ui.showUpgrades(options,24,upgrade=>{chosen=upgrade;}); f.ui.update(23); assert.equal(chosen,undefined); f.ui.update(1); assert.equal(chosen,options[0]); f.ui.update(1); assert.equal(f.ui.upgradeCallback,null); });
await test('Greffe chronométrée suspend le délai pendant onglet caché', () => { const f=fixture(); f.game.state='upgrade'; f.game.settings.timedUpgrades=true; let selected=0; f.ui.showUpgrades(f.NT.Data.UPGRADES.slice(0,3),24,()=>selected++); f.ui.update(4); f.document.hidden=true; f.ui.update(100); assert.equal(f.ui.upgradeTimer,20); assert.equal(selected,0); f.document.hidden=false; f.ui.update(20); assert.equal(selected,1); });
await test('Greffe clavier correspond au numéro visible sans choix invalide', () => { const f=fixture(); f.game.state='upgrade'; const options=f.NT.Data.UPGRADES.slice(0,3); let chosen; f.ui.showUpgrades(options,24,value=>{chosen=value;}); f.window.dispatchEvent({type:'keydown',code:'Digit8',key:'8'}); assert.equal(chosen,undefined); f.window.dispatchEvent({type:'keydown',code:'Digit3',key:'3'}); assert.equal(chosen,options[2]); });

await test('Guidage traduit les quatre directions et la présence dans le sceau', () => { const f=fixture(); for (const [x,z,direction] of [[0,-10,'EN FACE'],[10,0,'À DROITE'],[-10,0,'À GAUCHE'],[0,10,'DERRIÈRE'],[0,0,'DANS LE SCEAU']]) { f.game.waveObjective={type:'hold',phase:'active',position:new f.NT.Math.Vec3(x,0,z),radius:2}; f.ui._updateGuidance(); assert.match(f.$('navigation-hint').textContent,new RegExp(direction)); } });
await test('Chasse guide vers la cible marquée vivante la plus proche', () => { const f=fixture(); f.game.waveObjective={type:'hunt',phase:'active'}; f.game.enemies=[{alive:false,objectiveMarked:true,position:new f.NT.Math.Vec3(0,0,-.5)},{alive:true,objectiveMarked:true,position:new f.NT.Math.Vec3(9,0,0)},{alive:true,objectiveMarked:true,position:new f.NT.Math.Vec3(0,0,-2)}]; f.ui._updateGuidance(); assert.match(f.$('navigation-hint').textContent,/CIBLE MARQUÉE · 2 M · EN FACE/); f.game.settings.guidedHints=false; f.ui._updateGuidance(); assert.equal(f.$('navigation-hint').classList.contains('hidden'),true); assert.equal(f.$('field-guide').classList.contains('hidden'),true); });
await test('Intermission tactile respecte le délai avant lancement manuel', () => { const f=fixture(); f.game.state='playing'; f.game.input.touchMode=true; f.game.intermissionActive=true; f.game.intermissionReadyDelay=1; f.ui._updateGuidance(); assert.equal(f.$('touch-next-wave').disabled,true); f.$('touch-next-wave').click(); assert.equal(f.events.next,0); f.game.intermissionReadyDelay=0; f.ui._updateGuidance(); f.$('touch-next-wave').click(); assert.equal(f.events.next,1); });
await test('Navigation clavier des doctrines et onglets garde un seul item sélectionné', () => { const f=fixture(); const cards=f.document.querySelectorAll('.class-card'); cards[0].dispatchEvent({type:'keydown',key:'End'}); assert.equal(f.ui.selectedClass,cards.at(-1).dataset.class); assert.equal(cards.filter(card=>card.getAttribute('aria-checked')==='true').length,1); const tabs=f.document.querySelectorAll('.tab'); tabs[0].dispatchEvent({type:'keydown',key:'End'}); assert.equal(f.ui.currentCodexTab,tabs.at(-1).dataset.tab); assert.equal(tabs.filter(tab=>tab.getAttribute('aria-selected')==='true').length,1); });

// Contrats de finition ajoutés ; les 28 scénarios précédents restent inchangés.
const openBindings = f => { f.$('settings-button').focus(); f.ui.openSettings(); f.flushRaf(); f.$('bindings-button').focus(); f.$('bindings-button').click(); f.flushRaf(); };
const bindingKey = (f, code, extra = {}) => { const event={type:'keydown',code,key:code,stopImmediatePropagation(){this.stopped=true;},...extra}; f.document.dispatchEvent(event); return event; };
await test('Commandes : vingt actions accessibles et retour exact vers les réglages', () => { const f=fixture(); openBindings(f); assert.equal(f.ui.bindingButtons.size,20); assert.equal(f.ui.activeModal,f.ui.bindingsScreen); f.ui.closeModal(f.ui.bindingsScreen); f.flushRaf(); assert.equal(f.ui.activeModal,f.ui.settingsScreen); assert.equal(f.document.activeElement,f.$('bindings-button')); f.ui.closeModal(f.ui.settingsScreen); assert.equal(f.document.activeElement,f.$('settings-button')); });
await test('Commandes : affectation valide applique les réglages et actualise les indications', () => { const f=fixture(); openBindings(f); f.ui.bindingButtons.get('reload').click(); const event=bindingKey(f,'KeyT'); assert.equal(event.defaultPrevented,true); assert.equal(event.stopped,true); assert.equal(f.game.settings.bindings.reload,'KeyT'); assert.equal(f.events.settings,1); assert.equal(f.ui.bindingCapture,null); assert.ok(f.document.querySelectorAll('[data-binding]').filter(el=>el.dataset.binding==='reload').every(el=>el.textContent==='T')); });
await test('Commandes : conflit refusé sans mutation et saisie encore active', () => { const f=fixture(); openBindings(f); const before=JSON.stringify(f.game.settings.bindings); f.ui.bindingButtons.get('grenade').click(); bindingKey(f,'KeyR'); assert.equal(JSON.stringify(f.game.settings.bindings),before); assert.equal(f.ui.bindingCapture,'grenade'); assert.match(f.$('bindings-status').textContent,/Conflit/); assert.equal(f.events.settings,0); });
await test('Commandes : raccourci système refusé puis Échap annule sans fermer les commandes', () => { const f=fixture(); openBindings(f); f.ui.bindingButtons.get('ability').click(); bindingKey(f,'F5'); assert.equal(f.ui.bindingCapture,'ability'); bindingKey(f,'KeyR',{ctrlKey:true}); assert.equal(f.events.settings,0); bindingKey(f,'Escape'); assert.equal(f.ui.bindingCapture,null); assert.equal(f.ui.activeModal,f.ui.bindingsScreen); assert.equal(f.$('bindings-cancel').disabled,true); });
await test('Commandes : Tab et perte de focus annulent sans affectation involontaire', () => { const f=fixture(); openBindings(f); f.ui.bindingButtons.get('jump').click(); const event=bindingKey(f,'Tab'); assert.equal(Boolean(event.defaultPrevented),false); assert.equal(f.ui.bindingCapture,null); f.ui.bindingButtons.get('jump').click(); f.window.dispatchEvent({type:'blur'}); assert.equal(f.ui.bindingCapture,null); assert.equal(f.events.settings,0); });
await test('Commandes : capture souris exploite un bouton libéré sans toucher au tactile', () => { const f=fixture(); openBindings(f); f.ui.bindingButtons.get('fire').click(); bindingKey(f,'KeyI'); f.ui.bindingButtons.get('ability').click(); f.document.dispatchEvent({type:'mousedown',button:0,target:f.$('bindings-capture'),stopImmediatePropagation(){}}); assert.equal(f.game.settings.bindings.ability,'Mouse0'); assert.equal(f.game.settings.bindings.fire,'KeyI'); assert.equal(f.game.input.touchMode,false); });
await test('Commandes : réinitialisation confirmable ne change pas la carrière', () => { const f=fixture(); openBindings(f); f.ui.bindingButtons.get('jump').click(); bindingKey(f,'KeyJ'); f.$('bindings-reset').click(); f.ui._finishConfirmation(false); assert.equal(f.game.settings.bindings.jump,'KeyJ'); f.$('bindings-reset').click(); f.ui._finishConfirmation(true); assert.equal(f.game.settings.bindings.jump,''); assert.equal(f.game.save.data.shards,600); assert.equal(f.ui.activeModal,f.ui.bindingsScreen); });
await test('Sauvegarde : conflit visible, import bloqué et rechargement soumis à confirmation', () => { const f=fixture(); f.game.save.status.conflict=true; f.ui._syncSaveStatus(); assert.equal(f.$('save-status').classList.contains('hidden'),false); assert.match(f.$('save-status').textContent,/AUTRE ONGLET/); assert.equal(f.$('save-import').disabled,true); assert.equal(f.$('save-reload').classList.contains('hidden'),false); f.$('save-reload').click(); assert.ok(f.ui.pendingConfirmation); f.ui._finishConfirmation(false); assert.equal(f.game.save.data.shards,600); });
await test('Sauvegarde : version future avertit même sans erreur de stockage', () => { const f=fixture(); f.game.save.status.futureVersion=3; f.ui._syncSaveStatus(); assert.equal(f.$('save-status').classList.contains('hidden'),false); assert.match(f.$('save-status').textContent,/VERSION PLUS RÉCENTE/); assert.equal(f.$('save-import').disabled,true); });
await test('Sauvegarde : copie de récupération exportée octet pour octet', async () => { const f=fixture(); const raw='{"version":3,"unknown":"conservé"}'; f.game.save.recoveryBackup=raw; f.ui._syncSaveStatus(); assert.equal(f.$('save-recovery-export').classList.contains('hidden'),false); f.$('save-recovery-export').click(); assert.equal(await f.objectUrls[0].text(),raw); assert.match(f.document.downloads[0].download,/nexus-original/); });
await test('PWA : disponibilité et installation sont deux états distincts', () => { const f=fixture(); f.window.nexusPWA={status:{installAvailable:true,offlineReady:true,installed:false}}; f.ui._syncPWAStatus(); assert.equal(f.$('pwa-install').classList.contains('hidden'),false); assert.doesNotMatch(f.$('pwa-status').textContent,/Application installée/); f.window.nexusPWA.status.installed=true; f.ui._syncPWAStatus(); assert.equal(f.$('pwa-install').classList.contains('hidden'),true); assert.match(f.$('pwa-status').textContent,/Application installée/); });
await test('PWA : mise à jour demande fermeture des onglets, échec annoncé sans succès', () => { const f=fixture(); f.window.nexusPWA={status:{updateAvailable:true,offlineReady:true}}; f.ui._syncPWAStatus(); assert.match(f.$('pwa-status').textContent,/Fermez tous les onglets/); f.window.nexusPWA.status.error='Connexion interrompue'; f.ui._syncPWAStatus(); assert.match(f.$('pwa-status').textContent,/indisponible/); });

await test('PWA : navigateur non compatible ne prétend pas préparer le hors ligne', () => { const f=fixture(); f.window.nexusPWA={status:{supported:false,offlineReady:false,installed:false}}; f.ui._syncPWAStatus(); assert.match(f.$('pwa-status').textContent,/ne permet pas/); assert.doesNotMatch(f.$('pwa-status').textContent,/Préparation/); });

await test('Commandes : conflit de sauvegarde ne prétend jamais enregistrer la commande', () => { const f=fixture(); openBindings(f); f.game.save.status.conflict=true; f.game.save.status.dirty=true; f.ui.bindingButtons.get('reload').click(); bindingKey(f,'KeyT'); assert.match(f.$('bindings-status').textContent,/non confirmé/); assert.doesNotMatch(f.$('bindings-status').textContent,/commande enregistrée/); });
await test('Commandes : aide de déplacement, arme et prochaine vague suit les touches actuelles', () => { const f=fixture(); openBindings(f); for (const [action,code] of [['moveForward','KeyI'],['weapon1','KeyJ'],['nextWave','KeyK']]) { f.ui.bindingButtons.get(action).click(); bindingKey(f,code); } assert.ok(f.document.querySelectorAll('[data-binding-directions]').every(el=>el.textContent.startsWith('I'))); assert.ok(f.document.querySelectorAll('[data-binding-weapons]').every(el=>el.textContent.startsWith('J'))); assert.ok(f.document.querySelectorAll('[data-binding]').filter(el=>el.dataset.binding==='nextWave').every(el=>el.textContent==='K')); });

await test('PWA : erreur technique reste hors du message joueur et cache prêt reste distingué', () => { const f=fixture(); f.window.nexusPWA={status:{error:'Cannot read properties of undefined'}}; f.ui._syncPWAStatus(); assert.match(f.$('pwa-status').textContent,/autorisations du navigateur/); assert.doesNotMatch(f.$('pwa-status').textContent,/undefined|Cannot read/); f.window.nexusPWA.status.offlineReady=true; f.ui._syncPWAStatus(); assert.match(f.$('pwa-status').textContent,/déjà prêt hors ligne/); });

await test('Histoire : mode initial et secteur verrouillé explicitent le trajet', () => { const f=fixture(); assert.equal(f.ui.selectedMode,'story'); assert.equal(f.$('sector').disabled,true); assert.match(f.$('mission-summary').textContent,/Sanctuaire.*Nef.*Ossuaire/); f.$('mode').value='campaign'; f.$('mode').dispatchEvent({type:'change'}); assert.equal(f.$('sector').disabled,false); });
await test('Histoire : choix affichent bénéfice et coût exacts sans compte à rebours', () => { const f=fixture(); f.game.state='story-choice'; let selected=''; const choice=f.NT.Story.getChoice(3); f.ui.showStoryChoice(choice,id=>{selected=id;}); f.flushRaf(); assert.equal(f.document.activeElement,f.$('story-choice-options').querySelector('button')); const buttons=f.$('story-choice-options').querySelectorAll('button'); assert.equal(buttons.length,2); assert.match(buttons[0].textContent,/30 armure/); assert.match(buttons[0].textContent,/15 santé/); f.ui.update(999); assert.equal(selected,''); buttons[1].click(); assert.equal(selected,'listen'); });
await test('Histoire : Tab reste dans les décisions et Échap ne décide jamais', () => { const f=fixture(); f.game.state='story-choice'; let selected=0; f.ui.showStoryChoice(f.NT.Story.getChoice(6),()=>selected++); f.flushRaf(); f.$('story-choice-settings').focus(); const event={type:'keydown',key:'Tab'}; f.window.dispatchEvent(event); assert.equal(event.defaultPrevented,true); assert.equal(f.document.activeElement,f.$('story-choice-options').querySelector('button')); f.window.dispatchEvent({type:'keydown',key:'Escape',code:'Escape'}); assert.equal(selected,0); assert.equal(f.$('story-choice-screen').classList.contains('hidden'),false); });
await test('Journal : transmissions et fins futures restent masquées', () => { const f=fixture(); f.game.save.data.progression=f.NT.Progression.create(); f.ui.renderCodex('journal'); const text=f.$('codex-content').textContent; assert.match(text,/Arrêt de travail/); assert.doesNotMatch(text,/Les trois relais|Confinement sans témoin|Les noms sortent/); assert.match(text,/Transmission non reçue/); });
await test('Journal : une archive collectée devient consultable', () => { const f=fixture(); f.game.save.data.progression=f.NT.Progression.apply(f.NT.Progression.create(),{type:'archive',id:'shift_07'}).data; f.ui.renderCodex('journal'); assert.match(f.$('codex-content').textContent,/Feuille de quart 07/); assert.match(f.$('codex-content').textContent,/Nous avons fermé trois fois/); });
await test('Accomplissements : vingt objectifs et prochaine action sont visibles', () => { const f=fixture(); f.game.save.data.progression=f.NT.Progression.create(); f.ui.renderCodex('completion'); assert.equal(f.$('codex-content').querySelectorAll('.completion-card').length,20); assert.match(f.$('codex-content').textContent,/0 \/ 20 accomplissements/); assert.match(f.$('codex-content').textContent,/Prochain objectif/); });
await test('Journal en pause : fermeture ne relance pas les ennemis', () => { const f=fixture(); f.game.state='paused'; f.ui.showPause(); f.$('pause-journal').focus(); f.$('pause-journal').click(); f.flushRaf(); assert.equal(f.ui.currentCodexTab,'journal'); f.ui.closeModal(f.ui.codexScreen); assert.equal(f.game.state,'paused'); assert.equal(f.$('pause-screen').classList.contains('hidden'),false); });
await test('Victoire : épilogue issu des décisions et nettoyé pour le mode sectoriel', () => { const f=fixture(); f.ui.showVictory({outcome:'victory',sectors:3,storyEnding:f.NT.Story.getEnding({protocol:'listen',testimony:'preserve'})}); assert.match(f.ui.epilogue.textContent,/Les noms sortent/); assert.equal(f.$('victory-sectors').textContent,'3'); f.ui.showVictory({outcome:'victory',sectors:1}); assert.equal(f.ui.epilogue.classList.contains('hidden'),true); assert.equal(f.ui.epilogue.textContent,''); });
await test('Décision : journal relisible puis retour au choix et focus sans effet', () => { const f=fixture(); f.game.state='story-choice'; let chosen=0; f.ui.showStoryChoice(f.NT.Story.getChoice(3),()=>chosen++); f.flushRaf(); f.$('story-choice-journal').focus(); f.$('story-choice-journal').click(); f.flushRaf(); assert.equal(f.ui.currentCodexTab,'journal'); assert.equal(f.ui.activeModal,f.ui.codexScreen); f.ui.closeModal(f.ui.codexScreen); assert.equal(f.game.state,'story-choice'); assert.equal(chosen,0); assert.equal(f.document.activeElement,f.$('story-choice-journal')); });
await test('Journal : attribution des archives et bilan de fin conservés', () => { const f=fixture(); const p=f.NT.Progression.create(); p.archives.sanctifier_order=true; p.endings.scar=true; f.game.save.data.progression=p; f.ui.renderCodex('journal'); const text=f.$('codex-content').textContent; assert.ok(text.includes(f.NT.Story.ARCHIVES.find(a=>a.id==='sanctifier_order').speaker)); assert.ok(text.includes(f.NT.Story.ENDINGS.scar.journal)); });
for (const blocked of ['persistenceBlocked','graphicsUnavailable']) await test('Greffe : '+blocked+' refuse clic, clavier et délai sans consommer le choix', () => {
  const f=fixture(); f.game.state='upgrade'; f.game.settings.timedUpgrades=true; let chosen=0;
  f.ui.showUpgrades(f.NT.Data.UPGRADES.slice(0,3),24,()=>chosen++);
  const callback=f.ui.upgradeCallback, before=f.game.save.exportJSON(), disk=f.disk.get(f.game.save.key);
  f.game[blocked]=true;
  f.$('upgrade-cards').querySelector('button').click();
  f.window.dispatchEvent({type:'keydown',code:'Digit2',key:'2'}); f.ui.update(999);
  assert.equal(chosen,0); assert.equal(f.ui.upgradeCallback,callback); assert.equal(f.ui.upgradeTimer,24);
  assert.equal(f.game.state,'upgrade'); assert.equal(f.$('upgrade-screen').classList.contains('hidden'),false);
  assert.equal(f.game.save.exportJSON(),before); assert.equal(f.disk.get(f.game.save.key),disk);
  f.game[blocked]=false; f.ui.selectUpgrade(0); assert.equal(chosen,1); assert.equal(f.ui.upgradeCallback,null);
});
await test('Greffe : conflit exportable depuis les réglages et retour exact sans choix', async () => {
  const f=fixture(); f.game.state='upgrade'; let chosen=0;
  f.ui.showUpgrades(f.NT.Data.UPGRADES.slice(0,3),24,()=>chosen++);
  f.game.persistenceBlocked=true; f.game.save.status.conflict=true; f.ui._syncSaveStatus();
  const before=f.game.save.exportJSON(), disk=f.disk.get(f.game.save.key), callback=f.ui.upgradeCallback;
  f.$('upgrade-settings').focus(); f.$('upgrade-settings').click(); f.flushRaf();
  assert.equal(f.ui.activeModal,f.ui.settingsScreen); assert.equal(f.$('save-import').disabled,true);
  assert.equal(f.$('save-reload').classList.contains('hidden'),false); f.$('save-export').click();
  assert.equal(await f.objectUrls[0].text(),before); assert.equal(f.document.downloads.length,1);
  f.ui.closeModal(f.ui.settingsScreen); f.flushRaf();
  assert.equal(f.game.state,'upgrade'); assert.equal(f.game.persistenceBlocked,true); assert.equal(chosen,0);
  assert.equal(f.ui.upgradeCallback,callback); assert.equal(f.$('upgrade-screen').classList.contains('hidden'),false);
  assert.equal(f.document.activeElement,f.$('upgrade-settings'));
  assert.equal(f.game.save.exportJSON(),before); assert.equal(f.disk.get(f.game.save.key),disk);
});
await test('Greffe : réglages suspendent le délai et les raccourcis puis rendent le temps restant', () => {
  const f=fixture(); f.game.state='upgrade'; f.game.settings.timedUpgrades=true; let chosen=0;
  f.ui.showUpgrades(f.NT.Data.UPGRADES.slice(0,3),24,()=>chosen++); f.ui.update(5);
  f.$('upgrade-settings').focus(); f.$('upgrade-settings').click(); f.flushRaf();
  f.ui.update(999); f.window.dispatchEvent({type:'keydown',code:'Digit1',key:'1'});
  assert.equal(chosen,0); assert.equal(f.ui.upgradeTimer,19);
  f.ui.closeModal(f.ui.settingsScreen); f.ui.update(18.5);
  assert.equal(chosen,0); assert.equal(f.ui.upgradeTimer,.5);
  f.ui.update(.6); assert.equal(chosen,1); assert.equal(f.ui.upgradeCallback,null);
});
console.log(`\nContrats UI : ${passed}/${passed+failures.length} contrôles réussis.`);
if (failures.length) process.exitCode = 1;
