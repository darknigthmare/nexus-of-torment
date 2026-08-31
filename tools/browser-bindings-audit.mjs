import path from 'node:path';

// The caller owns the Playwright page, verification report and screenshot folder.
// Fixtures below exercise actual DOM/key events, not a human campaign benchmark.
const action = (page, id) => page.locator('[data-bind-action="' + id + '"]');

async function openBindings(page, { mobile = false, paused = false } = {}) {
  const press = locator => mobile ? locator.tap() : locator.click();
  await press(page.locator(paused ? '#pause-settings-button' : '#settings-button'));
  await page.locator('#settings-screen').waitFor({state:'visible'});
  await press(page.locator('#bindings-button'));
  await page.locator('#bindings-screen').waitFor({state:'visible'});
}

async function closeBindings(page, mobile = false) {
  const press = locator => mobile ? locator.tap() : locator.click();
  await press(page.locator('[data-close="bindings-screen"]'));
  await page.locator('#settings-screen').waitFor({state:'visible'});
  await press(page.locator('[data-close="settings-screen"]'));
}

export async function auditBindingsMenu(page, verify, shots) {
  await openBindings(page);
  const controls = await page.locator('#bindings-grid .binding-button').evaluateAll(buttons => buttons.map(button => ({
    action:button.dataset.bindAction, label:button.getAttribute('aria-label'), text:button.textContent
  })));
  verify('Commandes desktop : vingt actions nommées et accessibles', controls.length === 20 && new Set(controls.map(button => button.action)).size === 20 && controls.every(button => button.label?.startsWith('Modifier : ') && !/undefined|NaN/.test(button.text)), controls);

  const original = await page.evaluate(() => JSON.stringify(window.nexusGame.settings.bindings));
  await action(page, 'grenade').click();
  await page.keyboard.press('r');
  const conflict = await page.evaluate(() => ({
    status:document.querySelector('#bindings-status').textContent,
    capture:window.nexusGame.ui.bindingCapture,
    bindings:JSON.stringify(window.nexusGame.settings.bindings)
  }));
  verify('Commandes desktop : R déjà affecté refuse grenade sans mutation', /Conflit/.test(conflict.status) && conflict.capture === 'grenade' && conflict.bindings === original, conflict);
  await page.keyboard.press('Escape');
  const cancelled = await page.evaluate(() => ({
    capture:window.nexusGame.ui.bindingCapture,
    active:window.nexusGame.ui.activeModal?.id,
    focus:document.activeElement?.dataset.bindAction,
    bindings:JSON.stringify(window.nexusGame.settings.bindings)
  }));
  verify('Commandes desktop : Échap annule la saisie sans fermer le dialogue', cancelled.capture === null && cancelled.active === 'bindings-screen' && cancelled.focus === 'grenade' && cancelled.bindings === original && await page.locator('#bindings-screen').isVisible(), cancelled);

  await action(page, 'moveForward').click();
  await page.keyboard.press('i');
  await action(page, 'reload').click();
  await page.keyboard.press('t');
  const saved = await page.evaluate(() => {
    const g = window.nexusGame;
    return {
      settings:g.settings.bindings, input:g.input.bindings,
      stored:JSON.parse(localStorage.getItem(g.save.key)).settings.bindings,
      status:{...g.save.status}, capture:g.ui.bindingCapture
    };
  });
  verify('Commandes desktop : I avancer et T recharger enregistrés réellement', [saved.settings,saved.input,saved.stored].every(bindings => bindings.moveForward === 'KeyI' && bindings.reload === 'KeyT') && saved.status.available && !saved.status.dirty && !saved.status.conflict && saved.capture === null, saved);
  await page.locator('[data-close="bindings-screen"]').click();
  verify('Commandes desktop : fermeture restaure les réglages et le focus', await page.locator('#settings-screen').isVisible() && await page.locator('#bindings-button').evaluate(element => document.activeElement === element));
  await page.locator('[data-close="settings-screen"]').click();

  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(() => window.nexusGame?.state === 'menu', null, {timeout:15000});
  const restored = await page.evaluate(() => {
    const g = window.nexusGame;
    return {settings:g.settings.bindings, input:g.input.bindings, recovered:g.save.status.recovered};
  });
  verify('Commandes desktop : rechargement restaure les affectations persistées', [restored.settings,restored.input].every(bindings => bindings.moveForward === 'KeyI' && bindings.reload === 'KeyT') && !restored.recovered, restored);
  await openBindings(page);
  const labels = {forward:await action(page, 'moveForward').textContent(), reload:await action(page, 'reload').textContent()};
  verify('Commandes desktop : libellés restaurés après rechargement', /Avancer · I$/.test(labels.forward) && /Recharger · T$/.test(labels.reload), labels);
  await page.locator('#bindings-screen .bindings-shell').evaluate(element => {element.scrollTop = 0;});
  await page.screenshot({path:path.join(shots, 'v1.2-bindings.png')});
  await closeBindings(page);
  verify('Commandes desktop : retour au menu sans saisie résiduelle', await page.locator('#main-menu').isVisible() && await page.evaluate(() => window.nexusGame.state === 'menu' && window.nexusGame.ui.bindingCapture === null && window.nexusGame.ui.activeModal === null));
}

export async function auditBindingsGameplay(page, verify) {
  const initial = await page.evaluate(() => ({state:window.nexusGame.state, wave:window.nexusGame.wave, locked:window.nexusGame.input.pointerLocked, forward:window.nexusGame.settings.bindings.moveForward, reload:window.nexusGame.settings.bindings.reload}));
  verify('Commandes combat : scénario I/T issu du menu, office 1 actif', initial.state === 'playing' && initial.wave === 1 && initial.locked && initial.forward === 'KeyI' && initial.reload === 'KeyT', initial);

  // Isolate the movement sample from damage and residual knockback. The horde,
  // spawn queue, director and render load remain alive and are never cleared.
  const start = await page.evaluate(() => {
    const g = window.nexusGame, p = g.player;
    window.__nexusBindingsMovementFixture = {
      position:p.position.clone(), velocity:p.velocity.clone(), hitVelocity:p.hitVelocity.clone(),
      invulnerable:p.invulnerable, slowTimer:p.slowTimer, slowAmount:p.slowAmount, hookTimer:p.hookTimer,
      yaw:g.camera.yaw, pitch:g.camera.pitch
    };
    p.position.copy(g.arena.getStartPosition()); p.velocity.set(0,0,0); p.hitVelocity.set(0,0,0);
    p.invulnerable = 20; p.slowTimer = 0; p.slowAmount = 0; p.hookTimer = 0;
    g.camera.yaw = 0; g.camera.pitch = 0;
    g.input.clearPhysicalInputs(); g.input.clearVirtualInputs();
    return {x:p.position.x,z:p.position.z};
  });
  try {
    await page.keyboard.down('i');
    const held = await page.evaluate(() => ({
      physical:window.nexusGame.input.keys.has('KeyI'),
      canonical:window.nexusGame.input.key('KeyW'),
      aliases:['KeyW','KeyZ','ArrowUp'].map(code => window.nexusGame.input.key(code)),
      focused:document.activeElement?.tagName
    }));
    verify('Commandes combat : vraie touche I maintient les aliases canoniques', held.physical && held.canonical && held.aliases.every(Boolean), held);
    await page.waitForFunction(origin => {
      const p = window.nexusGame.player.position;
      return Math.hypot(p.x-origin.x,p.z-origin.z) > .5;
    }, start, {timeout:3000}).catch(() => {});
    const moved = await page.evaluate(origin => {
      const g = window.nexusGame, p = g.player.position;
      return {state:g.state, wave:g.wave, distance:Math.hypot(p.x-origin.x,p.z-origin.z), forward:origin.z-p.z};
    }, start);
    verify('Commandes combat : I déplace réellement le joueur dans la simulation', moved.state === 'playing' && moved.wave === 1 && moved.distance > .5 && moved.forward > .45, moved);
    await page.keyboard.up('i');
    const released = await page.evaluate(() => ({physical:window.nexusGame.input.keys.has('KeyI'), canonical:window.nexusGame.input.keyAny('KeyW','KeyZ','ArrowUp')}));
    verify('Commandes combat : relâcher I libère toutes les entrées de marche', !released.physical && !released.canonical, released);

    const idle = await page.evaluate(() => {
      const p = window.nexusGame.player;
      p.velocity.set(0,0,0); p.hitVelocity.set(0,0,0);
      return {x:p.position.x,z:p.position.z};
    });
    await page.keyboard.down('w');
    await page.waitForTimeout(350);
    const ignored = await page.evaluate(origin => {
      const g = window.nexusGame, p = g.player.position;
      return {state:g.state,wave:g.wave,physical:g.input.keys.has('KeyW'),canonical:g.input.keyAny('KeyW','KeyZ','ArrowUp'),distance:Math.hypot(p.x-origin.x,p.z-origin.z)};
    }, idle);
    await page.keyboard.up('w');
    verify('Commandes combat : ancien W inactif sans déplacement fantôme', ignored.state === 'playing' && ignored.wave === 1 && !ignored.physical && !ignored.canonical && ignored.distance < .04, ignored);
  } finally {
    await page.keyboard.up('i');
    await page.keyboard.up('w');
    await page.evaluate(() => {
      const g = window.nexusGame, p = g.player, saved = window.__nexusBindingsMovementFixture;
      if (!saved) return;
      p.position.copy(saved.position); p.velocity.copy(saved.velocity); p.hitVelocity.copy(saved.hitVelocity);
      p.invulnerable = saved.invulnerable; p.slowTimer = saved.slowTimer; p.slowAmount = saved.slowAmount; p.hookTimer = saved.hookTimer;
      g.camera.yaw = saved.yaw; g.camera.pitch = saved.pitch;
      delete window.__nexusBindingsMovementFixture;
    });
  }

  await page.keyboard.press('Escape');
  await page.locator('#pause-screen').waitFor({state:'visible'});
  const runBefore = await page.evaluate(() => ({wave:window.nexusGame.wave, shards:window.nexusGame.save.data.shards, kills:window.nexusGame.stats.kills}));
  await openBindings(page, {paused:true});
  await page.locator('#bindings-reset').click();
  verify('Commandes combat : restauration des defaults protégée par confirmation', await page.locator('#confirm-screen').isVisible() && await page.evaluate(() => window.nexusGame.settings.bindings.moveForward === 'KeyI' && window.nexusGame.state === 'paused'));
  await page.locator('#confirm-accept').click();
  const reset = await page.evaluate(() => {
    const g = window.nexusGame;
    return {settings:g.settings.bindings, stored:JSON.parse(localStorage.getItem(g.save.key)).settings.bindings, wave:g.wave, shards:g.save.data.shards, kills:g.stats.kills};
  });
  verify('Commandes combat : defaults restaurés et persistés sans modifier le dossier', [reset.settings,reset.stored].every(bindings => Object.keys(bindings).length === 20 && Object.values(bindings).every(code => code === '')) && reset.wave === runBefore.wave && reset.shards === runBefore.shards && reset.kills === runBefore.kills, reset);
  await closeBindings(page);
  await page.locator('#resume-button').click();
  await page.waitForFunction(() => !window.nexusGame.input.lockRequestPending, null, {timeout:3000});
  // The parent QA already exposes a pointer-lock fixture for unattended Chrome.
  // Preserve that explicit contract if native lock is unavailable after Resume.
  const resumed = await page.evaluate(() => {
    const g = window.nexusGame, nativeLock = document.pointerLockElement === g.canvas;
    const pointerFixture = !g.input.pointerLocked;
    if (pointerFixture) {g.input.pointerLocked = true; if (g.state === 'input-paused') g.ui._hidePointerPrompt(true);}
    return {state:g.state,wave:g.wave,locked:g.input.pointerLocked,nativeLock,pointerFixture,binding:g.settings.bindings.moveForward};
  });
  verify('Commandes combat : reprise office 1 avec commandes par défaut', resumed.state === 'playing' && resumed.wave === 1 && resumed.locked && resumed.binding === '', resumed);
}

export async function auditBindingsMobile(page, verify, shots) {
  await openBindings(page, {mobile:true});
  const layout = await page.evaluate(() => {
    const shell = document.querySelector('#bindings-screen .bindings-shell');
    const shellBox = shell.getBoundingClientRect();
    return {
      viewport:{width:innerWidth,height:innerHeight}, documentWidth:document.documentElement.scrollWidth,
      shell:{left:shellBox.left,right:shellBox.right,clientWidth:shell.clientWidth,scrollWidth:shell.scrollWidth},
      buttons:[...document.querySelectorAll('#bindings-grid .binding-button')].map(button => {
        const rect = button.getBoundingClientRect();
        return {action:button.dataset.bindAction,label:button.getAttribute('aria-label'),width:rect.width,height:rect.height,left:rect.left,right:rect.right};
      })
    };
  });
  verify('Commandes mobile : vingt cibles tactiles nommées d’au moins 44 px', layout.buttons.length === 20 && layout.buttons.every(button => button.width >= 44 && button.height >= 44 && Boolean(button.label)), layout);
  verify('Commandes mobile : dialogue sans débordement horizontal', layout.documentWidth <= layout.viewport.width + 1 && layout.shell.scrollWidth <= layout.shell.clientWidth + 1 && layout.shell.left >= -1 && layout.shell.right <= layout.viewport.width + 1 && layout.buttons.every(button => button.left >= -1 && button.right <= layout.viewport.width + 1), layout);
  await action(page, 'aim').scrollIntoViewIfNeeded();
  const last = await action(page, 'aim').evaluate(button => {
    const rect = button.getBoundingClientRect();
    return {top:rect.top,bottom:rect.bottom,viewport:innerHeight};
  });
  verify('Commandes mobile : dernière action atteignable par défilement', last.top >= 0 && last.bottom <= last.viewport + 1, last);
  await page.locator('#bindings-screen .bindings-shell').evaluate(element => {element.scrollTop = 0;});
  await page.screenshot({path:path.join(shots, 'v1.2-mobile-bindings.png')});
  await closeBindings(page, true);
  verify('Commandes mobile : retour au dossier avec tactile indépendant', await page.locator('#main-menu').isVisible() && await page.evaluate(() => window.nexusGame.state === 'menu' && window.nexusGame.input.touchMode && window.nexusGame.ui.bindingCapture === null && window.nexusGame.input.virtualKeys.size === 0 && window.nexusGame.input.virtualMouseButtons.size === 0));
}
