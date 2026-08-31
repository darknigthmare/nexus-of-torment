(function () {
  'use strict';

  const NT = window.NT = window.NT || {};
  const D = NT.Data;
  const { clamp } = NT.Math;

  class UIManager {
    constructor(game) {
      this.game = game;
      this.$ = id => document.getElementById(id);
      this.mainMenu = this.$('main-menu');
      this.hud = this.$('hud');
      this.upgradeScreen = this.$('upgrade-screen');
      this.pauseScreen = this.$('pause-screen');
      this.gameoverScreen = this.$('gameover-screen');
      this.victoryScreen = this.$('victory-screen');
      this.codexScreen = this.$('codex-screen');
      this.settingsScreen = this.$('settings-screen');
      this.creditsScreen = this.$('credits-screen');
      this.briefingScreen = this.$('briefing-screen');
      this.confirmScreen = this.$('confirm-screen');
      this.pointerLockScreen = this.$('pointer-lock-screen');
      this.touchControls = this.$('touch-controls');
      this.damageFlashEl = this.$('damage-flash');
      this.corruptionOverlay = this.$('corruption-overlay');
      this.announcementEl = this.$('announcement');
      this.hitmarkerEl = this.$('hitmarker');
      this.damageDirection = this.$('damage-direction');
      this.interactionPrompt = this.$('interaction-prompt');
      this.upgradeCards = this.$('upgrade-cards');
      this.upgradeTimerEl = this.$('upgrade-timer');
      this.selectedClass = 'bulwark';
      this.selectedDifficulty = 'unstable';
      this.selectedMode = 'campaign';
      this.selectedSector = '';
      this.damageFlashValue = 0;
      this.hitmarkerValue = 0;
      this.damageDirectionValue = 0;
      this.announcementTimer = 0;
      this.subtitleTimer = 0;
      this.upgradeTimer = 0;
      this.upgradeOptions = [];
      this.upgradeCallback = null;
      this.currentCodexTab = 'bestiary';
      this.lastWeaponSlots = '';
      this.activeModal = null;
      this.lastFocused = null;
      this.inputPauseState = null;
      this.pendingConfirmation = null;
      this._ensureSettingDefaults();
      this._populateSectors();
      this._bind();
      this.applySettingsToControls();
      this.refreshMetaCurrency();
      this.renderCodex('bestiary');
      this._updateLoadoutSummary();
      this._syncSaveStatus();
    }

    _ensureSettingDefaults() {
      const settings = this.game.settings;
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
      if (!Number.isFinite(Number(settings.hudScale))) settings.hudScale = 1;
      if (!Number.isFinite(Number(settings.shakeIntensity))) settings.shakeIntensity = 1;
      if (typeof settings.reducedMotion !== 'boolean') settings.reducedMotion = reduceMotion;
      if (typeof settings.uiContrast !== 'boolean') settings.uiContrast = false;
      if (typeof settings.enemyContrast !== 'boolean') settings.enemyContrast = false;
      if (typeof settings.subtitles !== 'boolean') settings.subtitles = true;
      if (typeof settings.guidedHints !== 'boolean') settings.guidedHints = true;
      if (typeof settings.timedUpgrades !== 'boolean') settings.timedUpgrades = false;
    }

    _populateSectors() {
      const select = this.$('sector');
      const sectors = Array.isArray(D.SECTORS) ? D.SECTORS : Object.values(D.SECTORS || {});
      select.innerHTML = '';
      if (!sectors.length) {
        const option = document.createElement('option');
        option.value = 'node-07';
        option.textContent = 'Nœud 07 — Chambre du seuil';
        select.appendChild(option);
      } else {
        sectors.forEach((sector, index) => {
          const option = document.createElement('option');
          option.value = sector.id || sector.key || `sector-${index + 1}`;
          option.textContent = sector.name || sector.title || `Secteur ${index + 1}`;
          option.disabled = sector.unlocked === false;
          select.appendChild(option);
        });
      }
      const first = [...select.options].find(option => !option.disabled);
      if (first) select.value = first.value;
      this.selectedSector = select.value;
    }

    _bind() {
      this.$('start-button').addEventListener('click', () => {
        this.game.audio.init();
        this.game.audio.ui('confirm');
        this.selectedDifficulty = this.$('difficulty').value;
        this.selectedMode = this.$('mode').value;
        this.selectedSector = this.$('sector').value;
        const start = () => this.game.startRun(this.selectedClass, this.selectedDifficulty, this.selectedMode, this.selectedSector);
        if (this.game.save.data.activeRun) this._confirmAction('Remplacer la tentative sauvegardée ?', 'Votre carrière est conservée, mais le checkpoint actuel sera effacé.', start);
        else start();
      });
      this.$('continue-button').addEventListener('click', () => {
        this.game.audio.init();
        this.game.audio.ui('confirm');
        if (typeof this.game.resumeSavedRun === 'function') this.game.resumeSavedRun();
      });

      const classCards = [...document.querySelectorAll('.class-card')];
      classCards.forEach((button, index) => {
        button.addEventListener('click', () => this._selectClass(button));
        button.addEventListener('keydown', event => {
          const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
          if (!keys.includes(event.key)) return;
          event.preventDefault();
          let target = index;
          if (event.key === 'Home') target = 0;
          else if (event.key === 'End') target = classCards.length - 1;
          else target = (index + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + classCards.length) % classCards.length;
          this._selectClass(classCards[target]);
          classCards[target].focus();
        });
      });

      for (const id of ['difficulty', 'mode', 'sector']) {
        this.$(id).addEventListener('change', event => {
          if (id === 'difficulty') this.selectedDifficulty = event.target.value;
          if (id === 'mode') this.selectedMode = event.target.value;
          if (id === 'sector') this.selectedSector = event.target.value;
          this._updateLoadoutSummary();
          this.game.audio.ui('select');
        });
      }

      this.$('codex-button').addEventListener('click', () => this.openCodex());
      this.$('briefing-button').addEventListener('click', () => this.openBriefing());
      this.$('pause-briefing').addEventListener('click', () => this.openBriefing(true));
      this.$('settings-button').addEventListener('click', () => this.openSettings());
      this.$('credits-button').addEventListener('click', () => this.openModal(this.creditsScreen));
      document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => this.closeModal(this.$(button.dataset.close))));
      this._bindTabs();

      this.$('resume-button').addEventListener('click', () => this.game.resume());
      this.$('pause-settings-button').addEventListener('click', () => this.openSettings(true));
      this.$('restart-button').addEventListener('click', () => this._confirmAction('Recommencer cette tentative ?', 'La progression de cette tentative et son checkpoint seront perdus. Aucun fragment ne sera versé.', () => this.game.restartRun()));
      this.$('quit-button').addEventListener('click', () => this._confirmAction('Abandonner le Nœud ?', 'Le checkpoint de cette tentative sera effacé. La carrière déjà enregistrée reste intacte ; aucun fragment ne sera versé pour cet abandon.', () => this.game.quitToMenu()));
      this.$('gameover-restart').addEventListener('click', () => this.game.restartRun());
      this.$('gameover-menu').addEventListener('click', () => this.game.quitToMenu());
      this.$('victory-endless').addEventListener('click', () => this.game.continueEndless?.());
      this.$('victory-restart').addEventListener('click', () => this.game.restartRun());
      this.$('victory-menu').addEventListener('click', () => this.game.quitToMenu());
      this.$('touch-pause').addEventListener('click', () => this.game.pause());
      this.$('touch-next-wave').addEventListener('click', () => {
        if (this.game.state === 'playing' && this.game.intermissionActive && this.game.intermissionReadyDelay <= 0) this.game._startWaveFromIntermission();
      });
      this.$('confirm-cancel').addEventListener('click', () => this._finishConfirmation(false));
      this.$('confirm-accept').addEventListener('click', () => this._finishConfirmation(true));
      this.$('save-export').addEventListener('click', () => this._exportSave());
      this.$('save-import').addEventListener('click', () => { if (this.game.state === 'menu') this.$('save-file').click(); });
      this.$('save-file').addEventListener('change', event => this._readSaveFile(event.target));
      document.addEventListener('nt-save-status', () => this._syncSaveStatus());
      this.$('pointer-lock-button').addEventListener('click', () => this._resumePointerControl());

      this._bindSettings();
      window.addEventListener('keydown', event => {
        if (!this.upgradeScreen.classList.contains('hidden')) {
          const index = event.code === 'Digit1' ? 0 : event.code === 'Digit2' ? 1 : event.code === 'Digit3' ? 2 : -1;
          if (index >= 0) this.selectUpgrade(index);
        }
        if (event.key === 'Escape' && this.activeModal) {
          event.preventDefault();
          this.closeModal(this.activeModal);
        } else if (event.key === 'Tab') {
          const modal = this.activeModal || [this.pauseScreen, this.upgradeScreen, this.victoryScreen, this.gameoverScreen, this.pointerLockScreen].find(screen => !screen.classList.contains('hidden'));
          if (modal) this._trapFocus(event, modal);
        }
      });
      document.addEventListener('nt-pointer-lock-error', () => this._showPointerPrompt());
      document.addEventListener('nt-pointer-lock-change', event => {
        if (event.detail?.locked) this._hidePointerPrompt(true);
      });
      document.addEventListener('nt-input-mode-change', () => {
        this._applyAccessibilityPreferences();
        if (this.game.state === 'playing') this._setTouchControls(true);
      });
    }

    _selectClass(button) {
      this.selectedClass = button.dataset.class;
      document.querySelectorAll('.class-card').forEach(card => {
        const selected = card === button;
        card.classList.toggle('selected', selected);
        card.setAttribute('aria-checked', selected ? 'true' : 'false');
        card.tabIndex = selected ? 0 : -1;
      });
      this.game.audio.ui('select');
      this._updateLoadoutSummary();
    }

    _updateLoadoutSummary() {
      const doctrine = D.CLASSES[this.selectedClass], difficulty = D.DIFFICULTIES[this.selectedDifficulty];
      const descriptions = { containment:'Pour découvrir les rites.', unstable:'Le défi de référence.', red:'Hordes renforcées, erreurs coûteuses.', nexus:'Épreuve extrême pour opérateurs aguerris.' };
      this.$('loadout-summary').textContent = doctrine.name + ' · ' + doctrine.health + ' santé / ' + doctrine.armor + ' armure. ' + doctrine.passive + ' ' + (descriptions[difficulty?.id] || '');
    }

    _confirmAction(title, detail, action) {
      if (this.pendingConfirmation) return;
      this.pendingConfirmation = { action, returnModal:this.activeModal, returnFocus:this.lastFocused, focus:document.activeElement };
      this.activeModal?.classList.add('hidden');
      this.$('confirm-title').textContent = title;
      this.$('confirm-detail').textContent = detail;
      this.openModal(this.confirmScreen);
    }

    _finishConfirmation(accept) {
      const pending = this.pendingConfirmation;
      if (!pending) return;
      this.pendingConfirmation = null;
      this.confirmScreen.classList.add('hidden');
      this.confirmScreen.setAttribute('aria-hidden', 'true');
      this.activeModal = null;
      this.mainMenu.removeAttribute('aria-hidden');
      if (pending.returnModal) {
        this.openModal(pending.returnModal, false);
        this.lastFocused = pending.returnFocus;
      }
      pending.focus?.focus?.();
      if (accept) pending.action();
    }

    _syncSaveStatus() {
      const status = this.game.save.status;
      const warning = status && (!status.available || status.dirty || status.recovered);
      const element = this.$('save-status');
      element.classList.toggle('hidden', !warning);
      element.textContent = !warning ? '' : !status.available || status.dirty
        ? 'SAUVEGARDE NON CONFIRMÉE — exportez une copie du dossier dans les réglages avant de fermer.'
        : 'DOSSIER RÉPARÉ — certaines données invalides ont été récupérées ; une copie de secours est conservée sur cet appareil.';
    }

    _exportSave() {
      try {
        const url = URL.createObjectURL(new Blob([this.game.save.exportJSON()], { type:'application/json' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'nexus-dossier-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.$('save-transfer-status').textContent = 'Export préparé. Conservez le fichier JSON hors du stockage du navigateur.';
      } catch {
        this.$('save-transfer-status').textContent = 'Export impossible. Votre dossier actuel n’a pas été remplacé.';
      }
    }

    async _readSaveFile(input) {
      const file = input.files?.[0];
      input.value = '';
      if (!file || this.game.state !== 'menu') return;
      if (file.size > 256 * 1024) {
        this.$('save-transfer-status').textContent = 'Fichier refusé : limite de 256 Ko.';
        return;
      }
      let content;
      try { content = await file.text(); } catch {
        this.$('save-transfer-status').textContent = 'Lecture du fichier impossible.';
        return;
      }
      if (this.game.state !== 'menu') return;
      this._confirmAction('Importer ce dossier ?', 'Les réglages, la carrière et le checkpoint actuels seront remplacés. Exportez-les d’abord si vous souhaitez les conserver.', () => {
        if (this.game.state !== 'menu') {
          this.$('save-transfer-status').textContent = 'Import refusé : retournez au menu avant de remplacer le dossier.';
          return;
        }
        const result = this.game.save.importJSON(content);
        this.$('save-transfer-status').textContent = result.ok
          ? 'Dossier importé et enregistré sur cet appareil.'
          : 'Import refusé : ' + (result.error || 'données invalides ou stockage indisponible') + '. Le dossier actuel est conservé.';
        if (!result.ok) return;
        this.game.settings = { ...this.game.settings, ...this.game.save.data.settings };
        this.game.applySettings();
        this.applySettingsToControls();
        this.refreshMetaCurrency();
        this.refreshContinueButton();
        this.renderCodex(this.currentCodexTab);
        this._syncSaveStatus();
      });
    }

    _bindTabs() {
      const tabs = [...document.querySelectorAll('.tab')];
      const select = button => {
        tabs.forEach(tab => {
          const active = tab === button;
          tab.classList.toggle('active', active);
          tab.setAttribute('aria-selected', active ? 'true' : 'false');
          tab.tabIndex = active ? 0 : -1;
        });
        this.currentCodexTab = button.dataset.tab;
        this.renderCodex(this.currentCodexTab);
        this.game.audio.ui('select');
      };
      tabs.forEach((button, index) => {
        button.tabIndex = index === 0 ? 0 : -1;
        button.addEventListener('click', () => select(button));
        button.addEventListener('keydown', event => {
          if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          let target = index;
          if (event.key === 'Home') target = 0;
          else if (event.key === 'End') target = tabs.length - 1;
          else target = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
          select(tabs[target]);
          tabs[target].focus();
        });
      });
    }

    _bindSettings() {
      const ranges = [
        ['sensitivity', 'sensitivity', value => Number(value), value => value.toFixed(2)],
        ['volume', 'volume', value => Number(value), value => `${Math.round(value * 100)}%`],
        ['fov', 'fov', value => Number(value), value => `${Math.round(value)}°`],
        ['shake-intensity', 'shakeIntensity', value => Number(value), value => `${Math.round(value * 100)}%`]
      ];
      ranges.forEach(([id, key, parse, format]) => {
        const input = this.$(id);
        input.addEventListener('input', () => {
          this.game.settings[key] = parse(input.value);
          this.$(`${id}-value`).textContent = format(this.game.settings[key]);
          this._commitSettings();
        });
      });
      for (const [id, key] of [['render-scale', 'renderScale'], ['hud-scale', 'hudScale']]) {
        this.$(id).addEventListener('change', event => {
          this.game.settings[key] = Number(event.target.value);
          this._commitSettings();
        });
      }
      const toggles = [
        ['head-bob', 'headBob'], ['reduced-flashes', 'reducedFlashes'], ['reduced-motion', 'reducedMotion'],
        ['gore', 'gore'], ['invert-y', 'invertY'], ['ui-contrast', 'uiContrast'],
        ['enemy-contrast', 'enemyContrast'], ['subtitles-enabled', 'subtitles'],
        ['guided-hints', 'guidedHints'], ['timed-upgrades', 'timedUpgrades']
      ];
      toggles.forEach(([id, key]) => this.$(id).addEventListener('change', event => {
        this.game.settings[key] = event.target.checked;
        this._commitSettings();
      }));
      this.$('reset-settings').addEventListener('click', () => {
        this.game.resetSettings();
        this._ensureSettingDefaults();
        this.applySettingsToControls();
        this.game.audio.ui('confirm');
      });
    }

    _commitSettings() {
      this.game.applySettings();
      this._applyAccessibilityPreferences();
      this.game.saveSettings();
    }

    applySettingsToControls() {
      this._ensureSettingDefaults();
      const s = this.game.settings;
      this.$('sensitivity').value = s.sensitivity;
      this.$('sensitivity-value').textContent = Number(s.sensitivity).toFixed(2);
      this.$('volume').value = s.volume;
      this.$('volume-value').textContent = `${Math.round(s.volume * 100)}%`;
      this.$('fov').value = s.fov;
      this.$('fov-value').textContent = `${Math.round(s.fov)}°`;
      this.$('render-scale').value = String(s.renderScale);
      this.$('hud-scale').value = String(s.hudScale);
      this.$('shake-intensity').value = s.shakeIntensity;
      this.$('shake-intensity-value').textContent = `${Math.round(s.shakeIntensity * 100)}%`;
      for (const [id, key] of [['head-bob', 'headBob'], ['reduced-flashes', 'reducedFlashes'], ['reduced-motion', 'reducedMotion'], ['gore', 'gore'], ['invert-y', 'invertY'], ['ui-contrast', 'uiContrast'], ['enemy-contrast', 'enemyContrast'], ['subtitles-enabled', 'subtitles'], ['guided-hints', 'guidedHints'], ['timed-upgrades', 'timedUpgrades']]) {
        this.$(id).checked = Boolean(s[key]);
      }
      this._applyAccessibilityPreferences();
    }

    _applyAccessibilityPreferences() {
      const s = this.game.settings;
      document.documentElement.style.setProperty('--hud-scale', String(clamp(Number(s.hudScale) || 1, .75, 1.3)));
      document.body.classList.toggle('reduced-motion', Boolean(s.reducedMotion));
      document.body.classList.toggle('reduced-flashes', Boolean(s.reducedFlashes));
      document.body.classList.toggle('ui-high-contrast', Boolean(s.uiContrast));
      document.body.classList.toggle('enemy-high-contrast', Boolean(s.enemyContrast));
      document.body.classList.toggle('subtitles-disabled', s.subtitles === false);
      document.body.classList.toggle('touch-mode', Boolean(this.game.input.touchMode));
    }

    _hideGameplayScreens() {
      for (const screen of [this.pauseScreen, this.gameoverScreen, this.victoryScreen, this.upgradeScreen, this.pointerLockScreen]) screen?.classList.add('hidden');
    }

    showMainMenu() {
      this.mainMenu.classList.remove('hidden');
      this.hud.classList.add('hidden');
      this._hideGameplayScreens();
      this.briefingScreen.classList.add('hidden');
      this.confirmScreen.classList.add('hidden');
      this.activeModal = null;
      this.mainMenu.removeAttribute('aria-hidden');
      this._setTouchControls(false);
      this.refreshMetaCurrency();
      this.refreshContinueButton();
    }

    enterGame() {
      this.mainMenu.classList.add('hidden');
      for (const screen of [this.codexScreen, this.settingsScreen, this.creditsScreen, this.pauseScreen, this.gameoverScreen, this.victoryScreen, this.upgradeScreen, this.pointerLockScreen]) screen?.classList.add('hidden');
      this.hud.classList.remove('hidden');
      this.briefingScreen.classList.add('hidden');
      this.confirmScreen.classList.add('hidden');
      this.activeModal = null;
      this.mainMenu.removeAttribute('aria-hidden');
      this._setTouchControls(true);
    }

    _setTouchControls(active) {
      const visible = active && Boolean(this.game.input.touchMode);
      this.touchControls.classList.toggle('hidden', !visible);
      document.body.classList.toggle('game-active', active);
      if (!active) this.game.input.clearVirtualInputs?.();
    }

    showPause() { this.pauseScreen.classList.remove('hidden'); this.hud.classList.add('hidden'); this._setTouchControls(false); this._focusFirst(this.pauseScreen); }
    hidePause() { this.pauseScreen.classList.add('hidden'); this.hud.classList.remove('hidden'); this._setTouchControls(true); }

    showGameOver(results) {
      this.hud.classList.add('hidden');
      this._hideGameplayScreens();
      this.gameoverScreen.classList.remove('hidden');
      this._setTouchControls(false);
      this.$('result-wave').textContent = results.wave;
      this.$('result-kills').textContent = results.kills;
      this.$('result-score').textContent = Math.round(results.score).toLocaleString('fr-FR');
      this.$('result-shards').textContent = `◆ ${results.shards}`;
      this._focusFirst(this.gameoverScreen);
    }

    showVictory(results = {}) {
      this.hud.classList.add('hidden');
      this._hideGameplayScreens();
      this.victoryScreen.classList.remove('hidden');
      this._setTouchControls(false);
      this.$('victory-sectors').textContent = results.sectors ?? results.sectorsCleared ?? (results.outcome === 'victory' ? 1 : 0);
      this.$('victory-kills').textContent = results.kills ?? 0;
      this.$('victory-score').textContent = Math.round(results.score || 0).toLocaleString('fr-FR');
      this.$('victory-shards').textContent = `◆ ${results.shards ?? 0}`;
      this._focusFirst(this.victoryScreen);
    }

    refreshContinueButton() {
      this.$('continue-button').classList.toggle('hidden', !this.game.save.data.activeRun);
    }

    openModal(element, focus = true) {
      if (!element) return;
      this.lastFocused = document.activeElement;
      this.activeModal = element;
      element.classList.remove('hidden');
      element.setAttribute('aria-hidden', 'false');
      this.mainMenu.setAttribute('aria-hidden', 'true');
      this.game.audio.init();
      this.game.audio.ui('select');
      if (focus) this._focusFirst(element);
    }

    closeModal(element) {
      if (!element) return;
      if (element === this.confirmScreen) { this._finishConfirmation(false); return; }
      element.classList.add('hidden');
      element.setAttribute('aria-hidden', 'true');
      this.activeModal = null;
      this.mainMenu.removeAttribute('aria-hidden');
      this.game.audio.ui('select');
      if (this.game.state === 'paused') this.pauseScreen.classList.remove('hidden');
      if (this.lastFocused?.focus) this.lastFocused.focus();
    }

    openSettings(fromPause = false) {
      if (fromPause) this.pauseScreen.classList.add('hidden');
      this.applySettingsToControls();
      this.$('save-import').disabled = this.game.state !== 'menu';
      this.openModal(this.settingsScreen);
    }
    openCodex() { this.renderCodex(this.currentCodexTab); this.openModal(this.codexScreen); }
    openBriefing(fromPause = false) {
      if (fromPause) this.pauseScreen.classList.add('hidden');
      this.openModal(this.briefingScreen);
    }

    _focusFirst(root) {
      requestAnimationFrame(() => root.querySelector('button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex="0"]')?.focus());
    }

    _trapFocus(event, root) {
      const focusables = [...root.querySelectorAll('button:not([disabled]), select:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')].filter(node => node.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }

    async _resumePointerControl() {
      const ok = await this.game.input.requestLock();
      if (ok || this.game.input.pointerLocked) this._hidePointerPrompt(true);
    }

    _showPointerPrompt() {
      if (this.game.input.touchMode || !['playing', 'input-paused'].includes(this.game.state)) return;
      if (this.game.state === 'playing') {
        this.inputPauseState = 'playing';
        this.game.state = 'input-paused';
      }
      this.pointerLockScreen.classList.remove('hidden');
      this.hud.classList.add('hidden');
      this._setTouchControls(false);
      this._focusFirst(this.pointerLockScreen);
    }

    _hidePointerPrompt(resume = false) {
      this.pointerLockScreen.classList.add('hidden');
      if (resume && this.game.state === 'input-paused') this.game.state = this.inputPauseState || 'playing';
      if (this.game.state === 'playing') {
        this.hud.classList.remove('hidden');
        this._setTouchControls(true);
      }
      this.inputPauseState = null;
    }

    update(dt) {
      const flashMultiplier = this.game.settings.reducedFlashes ? .22 : 1;
      this.damageFlashValue = Math.max(0, this.damageFlashValue - dt * 3.8);
      this.damageFlashEl.style.opacity = String(clamp(this.damageFlashValue * flashMultiplier, 0, .82));
      this.hitmarkerValue = Math.max(0, this.hitmarkerValue - dt * 7.5);
      this.hitmarkerEl.style.opacity = String(this.hitmarkerValue);
      this.damageDirectionValue = Math.max(0, this.damageDirectionValue - dt * 2.7);
      this.damageDirection.style.opacity = String(this.damageDirectionValue);
      this.announcementTimer = Math.max(0, this.announcementTimer - dt);
      if (this.announcementTimer <= 0) this.announcementEl.classList.add('hidden');
      this.subtitleTimer = Math.max(0, this.subtitleTimer - dt);
      if (this.subtitleTimer <= 0) this.$('subtitle').classList.add('hidden');
      if (!this.upgradeScreen.classList.contains('hidden') && this.game.settings.timedUpgrades && !document.hidden) {
        this.upgradeTimer = Math.max(0, this.upgradeTimer - dt);
        this.upgradeTimerEl.textContent = Math.ceil(this.upgradeTimer);
        if (this.upgradeTimer <= 0 && this.upgradeCallback) this.selectUpgrade(0);
      }
      if (this.game.state === 'playing') {
        this.updateHUD();
        if (!this.game.input.combatReady?.() && !this.game.input.lockRequestPending) this._showPointerPrompt();
      }
    }

    updateHUD() {
      const game = this.game, p = game.player, w = game.weapons.hud();
      this.$('wave-number').textContent = game.wave;
      this.$('wave-modifier').textContent = game.currentModifier?.name || 'STANDARD';
      this.$('objective').textContent = game.objectiveText;
      this.$('enemy-count').textContent = game.enemies.filter(e => e.alive).length + game.spawnsRemaining;
      this.$('essence-value').textContent = Math.floor(p.essence);
      this.$('score-value').textContent = String(Math.floor(game.score)).padStart(6, '0');
      this.$('health-text').textContent = Math.ceil(p.health);
      this.$('health-bar').style.width = `${clamp(p.health / p.maxHealth * 100, 0, 100)}%`;
      this.$('armor-text').textContent = Math.ceil(p.armor);
      this.$('armor-bar').style.width = `${clamp(p.armor / p.maxArmor * 100, 0, 100)}%`;
      this.$('corruption-text').textContent = `${Math.round(p.corruption * 100)}%`;
      this.$('corruption-bar').style.width = `${p.corruption * 100}%`;
      this.corruptionOverlay.style.opacity = String(clamp((p.corruption - .35) * .75, 0, .46));
      this.$('ability-name').textContent = p.classData.abilityName.toUpperCase();
      this.$('ability-fill').style.width = `${p.abilityProgress() * 100}%`;
      this.$('ability-widget').classList.toggle('ready', p.abilityCooldown <= 0);
      this.$('weapon-name').textContent = w.name;
      this.$('weapon-state').textContent = w.subtitle;
      this.$('ammo-mag').textContent = w.mag;
      this.$('ammo-reserve').textContent = w.reserve;
      this.$('grenade-count').textContent = p.grenades;
      this.$('reload-prompt').classList.toggle('hidden', !w.reloading);
      if (w.reloading) this.$('reload-prompt').textContent = `RECHARGEMENT ${Math.round(w.reloadProgress * 100)} %`;
      const spread = 7 + game.weapons.current().spread * 220 + (Math.hypot(p.velocity.x, p.velocity.z) > 1 ? 3 : 0) + game.weapons.weaponKick * 24;
      this.$('crosshair').style.setProperty('--spread', `${spread}px`);
      this._updateWeaponSlots();
      const boss = game.enemies.find(enemy => enemy.alive && enemy.boss);
      const bossWrap = this.$('boss-wrap');
      if (boss) {
        bossWrap.classList.remove('hidden');
        this.$('boss-name').textContent = boss.config.name.toUpperCase();
        this.$('boss-bar-fill').style.width = `${boss.health / boss.maxHealth * 100}%`;
      } else bossWrap.classList.add('hidden');
      const streak = game.killStreak >= 3 ? Math.min(8, 1 + Math.floor(game.killStreak / 3)) : 1;
      const streakEl = this.$('streak');
      streakEl.classList.toggle('hidden', streak <= 1);
      if (streak > 1) streakEl.querySelector('strong').textContent = streak;
      this.setInteraction(game.arena.stationPrompt(game.arena.nearestStation(p.position)));
      this._updateGuidance();
    }

    _updateGuidance() {
      const game = this.game, enabled = game.settings.guidedHints !== false;
      let zone = game.extractionActive ? game.extractionZone : game.waveObjective;
      if (zone?.type === 'hunt' && zone.phase === 'active') {
        const marked = game.enemies.filter(enemy => enemy.alive && enemy.objectiveMarked);
        const nearest = marked.reduce((best, enemy) => !best || enemy.position.distanceToXZ(game.player.position) < best.position.distanceToXZ(game.player.position) ? enemy : best, null);
        zone = nearest ? { position:nearest.position, type:'hunt', phase:'active', radius:0 } : null;
      }
      const navigation = this.$('navigation-hint');
      const showNavigation = enabled && zone?.position && zone.phase === 'active';
      navigation.classList.toggle('hidden', !showNavigation);
      if (showNavigation) {
        const dx = zone.position.x - game.player.position.x, dz = zone.position.z - game.player.position.z;
        const distance = Math.hypot(dx, dz), angle = Math.atan2(dx, -dz) - game.camera.yaw;
        const bearing = Math.atan2(Math.sin(angle), Math.cos(angle));
        const direction = distance <= (zone.radius || 0) ? 'DANS LE SCEAU' : Math.abs(bearing) < .35 ? 'EN FACE' : Math.abs(bearing) > 2.5 ? 'DERRIÈRE' : bearing > 0 ? 'À DROITE' : 'À GAUCHE';
        navigation.textContent = (zone.type === 'hunt' ? 'CIBLE MARQUÉE' : 'SCEAU') + ' · ' + Math.ceil(distance) + ' M · ' + direction;
      }
      const guide = this.$('field-guide');
      const initial = enabled && game.wave === 1 && game.runTime < 25 && !game.intermissionActive;
      guide.classList.toggle('hidden', !initial);
      if (initial) guide.textContent = game.input.touchMode
        ? 'Stick gauche : bouger · Glissez à droite : regarder · FEU : tirer · R : recharger · C : capacité'
        : 'ZQSD / WASD : bouger · Clic : tirer · R : recharger · C : capacité · E : station · Échap : aide';
      const next = this.$('touch-next-wave');
      next.classList.toggle('hidden', !game.intermissionActive || !game.input.touchMode);
      next.disabled = game.intermissionReadyDelay > 0;
      if (game.intermissionActive) next.textContent = 'LANCER L’OFFICE · ' + Math.ceil(game.intermissionTimer) + ' S';
    }

    _updateWeaponSlots() {
      const game = this.game;
      const signature = Object.values(D.WEAPONS).map(w => `${w.id}:${game.player.unlockedWeapons.has(w.id) ? 1 : 0}:${game.weapons.currentId === w.id ? 1 : 0}`).join('|');
      if (signature === this.lastWeaponSlots) return;
      this.lastWeaponSlots = signature;
      const root = this.$('weapon-slots');
      root.innerHTML = '';
      Object.values(D.WEAPONS).sort((a, b) => a.slot - b.slot).forEach(weapon => {
        const div = document.createElement('div');
        div.className = 'weapon-slot';
        div.textContent = weapon.slot;
        if (game.weapons.currentId === weapon.id) div.classList.add('active');
        if (!game.player.unlockedWeapons.has(weapon.id)) div.classList.add('locked');
        root.appendChild(div);
      });
    }

    setInteraction(prompt) {
      if (!prompt) { this.interactionPrompt.classList.add('hidden'); return; }
      this.interactionPrompt.classList.remove('hidden');
      this.$('interaction-title').textContent = prompt.title;
      this.$('interaction-cost').textContent = prompt.cost || '';
    }
    hitmarker(headshot = false, killed = false) {
      this.hitmarkerValue = killed ? .34 : .22;
      this.hitmarkerEl.classList.toggle('headshot', headshot);
      this.hitmarkerEl.style.transform = `rotate(45deg) scale(${killed ? 1.35 : 1})`;
    }
    damageFlash(amount, source) {
      this.damageFlashValue = Math.max(this.damageFlashValue, clamp(amount / 55, .18, .75));
      if (source) {
        const dx = source.x - this.game.player.position.x, dz = source.z - this.game.player.position.z;
        const angle = Math.atan2(dx, -dz) - this.game.camera.yaw;
        this.damageDirection.style.transform = `translate(-50%,-50%) rotate(${angle}rad)`;
        this.damageDirectionValue = .85;
      }
    }
    announce(kicker, title, subtitle = '', duration = 2.4) {
      this.$('announcement-kicker').textContent = kicker;
      this.$('announcement-title').textContent = title;
      this.$('announcement-subtitle').textContent = subtitle;
      this.announcementEl.classList.remove('hidden');
      this.announcementTimer = duration;
    }
    subtitle(text, duration = 3) {
      if (this.game.settings.subtitles === false) return;
      const el = this.$('subtitle');
      el.textContent = text;
      el.classList.remove('hidden');
      this.subtitleTimer = duration;
    }
    toast(title, detail = '', type = 'normal') {
      const node = document.createElement('div');
      node.className = 'toast';
      if (type === 'error') node.style.borderRightColor = '#ff5252';
      node.innerHTML = `<b>${escapeHtml(title)}</b><span>${escapeHtml(detail)}</span>`;
      this.$('toast-stack').appendChild(node);
      setTimeout(() => { node.style.opacity = '0'; node.style.transform = 'translateX(18px)'; node.style.transition = '.25s'; }, 2600);
      setTimeout(() => node.remove(), 3000);
    }

    showUpgrades(options, duration, callback) {
      this.upgradeOptions = options;
      this.upgradeCallback = callback;
      this.upgradeTimer = duration;
      this.$('upgrade-time-label').firstChild.textContent = this.game.settings.timedUpgrades ? 'Choix automatique dans ' : 'Aucune limite de lecture — choisissez votre greffe. ';
      this.upgradeTimerEl.textContent = this.game.settings.timedUpgrades ? Math.ceil(duration) : '';
      this.upgradeCards.innerHTML = '';
      options.forEach((upgrade, index) => {
        const stack = this.game.player.upgradeStacks[upgrade.id] || 0;
        const button = document.createElement('button');
        button.className = 'upgrade-card';
        button.dataset.key = String(index + 1);
        button.innerHTML = `<div class="upgrade-rarity">${escapeHtml(upgrade.rarity)}</div><div class="upgrade-icon">${escapeHtml(upgrade.icon)}</div><h3>${escapeHtml(upgrade.name)}</h3><p>${escapeHtml(upgrade.description)}</p><div class="upgrade-stack">RANG ${stack} / ${upgrade.max}</div>`;
        button.addEventListener('click', () => this.selectUpgrade(index));
        this.upgradeCards.appendChild(button);
      });
      this.upgradeScreen.classList.remove('hidden');
      this.hud.classList.add('hidden');
      this._setTouchControls(false);
      this._focusFirst(this.upgradeScreen);
    }
    selectUpgrade(index) {
      if (!this.upgradeCallback || !this.upgradeOptions[index]) return;
      const callback = this.upgradeCallback, upgrade = this.upgradeOptions[index];
      this.upgradeCallback = null;
      this.upgradeScreen.classList.add('hidden');
      this.hud.classList.remove('hidden');
      this._setTouchControls(true);
      this.game.audio.ui('confirm');
      callback(upgrade);
    }

    refreshMetaCurrency() { this.$('meta-shards').textContent = `◆ ${this.game.save.data.shards || 0}`; }

    renderCodex(tab) {
      const root = this.$('codex-content'), save = this.game.save.data;
      if (tab === 'bestiary') {
        root.innerHTML = '<div class="codex-grid">' + Object.values(D.ENEMIES).map(enemy => {
          const kills = save.codex?.enemyKills?.[enemy.id] || 0, locked = kills === 0 && !enemy.boss;
          return `<article class="codex-card ${locked ? 'locked' : ''}"><div class="codex-icon">${locked ? '?' : escapeHtml(enemy.icon)}</div><h3>${locked ? 'SIGNATURE NON IDENTIFIÉE' : escapeHtml(enemy.name)}</h3><p>${locked ? 'Éliminez cette caste pour ouvrir son dossier.' : escapeHtml(enemy.description)}</p><footer>${locked ? 'DONNÉES VERROUILLÉES' : `${kills} élimination${kills > 1 ? 's' : ''} · ${escapeHtml(enemy.role)}`}</footer></article>`;
        }).join('') + '</div>';
      } else if (tab === 'arsenal') {
        root.innerHTML = '<div class="codex-grid">' + Object.values(D.WEAPONS).map(w => `<article class="codex-card"><div class="codex-icon">${escapeHtml(w.icon)}</div><h3>${escapeHtml(w.name)}</h3><p>${escapeHtml(w.subtitle)}. ${w.damage} dégâts de base, chargeur de ${w.magazine}, portée effective ${w.falloffEnd} m.${w.mechanic ? ` ${escapeHtml(w.mechanic)}` : ''}</p><footer>DÉVERROUILLAGE : VAGUE ${w.unlockWave}</footer></article>`).join('') + '</div>';
      } else if (tab === 'meta') {
        root.innerHTML = `<div class="eyebrow">FRAGMENTS DISPONIBLES : ◆ ${save.shards || 0}</div><div class="meta-grid">` + Object.values(D.META_UPGRADES).map(meta => {
          const level = save.meta?.[meta.id] || 0, cost = meta.baseCost * (level + 1), maxed = level >= meta.max;
          return `<article class="meta-card"><div class="codex-icon">${escapeHtml(meta.icon)}</div><h3>${escapeHtml(meta.name)} ${level}/${meta.max}</h3><p>${escapeHtml(meta.description)}</p><button class="secondary-button meta-buy" data-meta="${meta.id}" ${maxed ? 'disabled' : ''}>${maxed ? 'MAXIMUM' : `GREFFER · ◆ ${cost}`}</button></article>`;
        }).join('') + '</div>';
        root.querySelectorAll('.meta-buy').forEach(button => button.addEventListener('click', () => this.buyMeta(button.dataset.meta)));
      } else {
        const r = save.records || {};
        root.innerHTML = `<div class="record-grid"><div class="record"><span>Meilleure vague</span><strong>${r.bestWave || 0}</strong></div><div class="record"><span>Score record</span><strong>${Math.round(r.bestScore || 0).toLocaleString('fr-FR')}</strong></div><div class="record"><span>Éliminations</span><strong>${r.lifetimeKills || 0}</strong></div><div class="record"><span>Boss abattus</span><strong>${r.bossKills || 0}</strong></div><div class="record"><span>Tirs à la tête</span><strong>${r.headshots || 0}</strong></div><div class="record"><span>Dégâts infligés</span><strong>${Math.round(r.damage || 0).toLocaleString('fr-FR')}</strong></div><div class="record"><span>Parties</span><strong>${r.runs || 0}</strong></div><div class="record"><span>Temps au Nexus</span><strong>${formatTime(r.playTime || 0)}</strong></div></div>`;
      }
    }

    buyMeta(id) {
      const meta = D.META_UPGRADES[id], save = this.game.save.data;
      if (!meta) return;
      const level = save.meta[id] || 0;
      if (level >= meta.max) return;
      const cost = meta.baseCost * (level + 1);
      if ((save.shards || 0) < cost) {
        this.game.audio.ui('error');
        this.toast('FRAGMENTS INSUFFISANTS', `◆ ${cost} requis`, 'error');
        return;
      }
      save.shards -= cost;
      save.meta[id] = level + 1;
      if (!this.game.save.save()) {
        save.shards += cost;
        save.meta[id] = level;
        this._syncSaveStatus();
        this.toast('GREFFE NON ENREGISTRÉE', 'Achat annulé : stockage indisponible. Exportez votre dossier.', 'error');
        this.game.audio.ui('error');
        return;
      }
      this.refreshMetaCurrency();
      this.renderCodex('meta');
      this.game.audio.ui('confirm');
    }
  }

  function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
  function formatTime(seconds) { const h = Math.floor(seconds / 3600), m = Math.floor(seconds % 3600 / 60); return h ? `${h} h ${m} min` : `${m} min`; }

  NT.UIManager = UIManager;
})();
