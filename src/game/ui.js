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
      this.bindingsScreen = this.$('bindings-screen');
      this.creditsScreen = this.$('credits-screen');
      this.briefingScreen = this.$('briefing-screen');
      this.confirmScreen = this.$('confirm-screen');
      this.pointerLockScreen = this.$('pointer-lock-screen');
      this.storyChoiceScreen = this.$('story-choice-screen');
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
      this.selectedMode = 'story';
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
      this.bindingCapture = null;
      this.bindingReturn = null;
      this.bindingButtons = new Map();
      this.epilogue = document.createElement('div');
      this.epilogue.className = 'epilogue hidden';
      this.victoryScreen.querySelector('.victory-shell').appendChild(this.epilogue);
      const journalButton = document.createElement('button');
      journalButton.className = 'secondary-button';
      journalButton.setAttribute('id', 'victory-journal');
      journalButton.textContent = 'JOURNAL & ACCOMPLISSEMENTS';
      journalButton.addEventListener('click', () => this.openJournal());
      this.victoryScreen.querySelector('.victory-actions').appendChild(journalButton);
      this._ensureSettingDefaults();
      this._populateSectors();
      this._bind();
      this.applySettingsToControls();
      this.refreshMetaCurrency();
      this.renderCodex('bestiary');
      this._updateLoadoutSummary();
      this._syncSaveStatus();
      this._syncPWAStatus();
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
      this.$('pause-journal').addEventListener('click', () => this.openJournal());
      this.$('upgrade-settings').addEventListener('click', () => this.openSettings());
      this.$('story-choice-settings').addEventListener('click', () => this.openSettings());
      this.$('story-choice-journal').addEventListener('click', () => this.openJournal());
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
      this.$('save-recovery-export').addEventListener('click', () => this._exportSave(true));
      this.$('save-reload').addEventListener('click', () => this._confirmAction('Relire le dossier actuel ?', 'Les modifications non enregistrées de cet onglet seront abandonnées. Exportez-les d’abord si vous souhaitez les conserver. Le dossier déjà enregistré ne sera pas effacé.', () => window.location.reload()));
      this.$('save-import').addEventListener('click', () => { if (this.game.state === 'menu') this.$('save-file').click(); });
      this.$('save-file').addEventListener('change', event => this._readSaveFile(event.target));
      document.addEventListener('nt-save-status', () => this._syncSaveStatus());
      document.addEventListener('nt-pwa-status', () => this._syncPWAStatus());
      this.$('pwa-install').addEventListener('click', async () => {
        try { await window.nexusPWA?.install?.(); } catch { this.$('pwa-status').textContent = 'Installation indisponible. Le jeu reste accessible dans le navigateur.'; }
      });
      this.$('pointer-lock-button').addEventListener('click', () => this._resumePointerControl());

      this._bindSettings();
      this._bindRemapping();
      window.addEventListener('keydown', event => {
        if (!this.upgradeScreen.classList.contains('hidden')) {
          const index = event.code === 'Digit1' ? 0 : event.code === 'Digit2' ? 1 : event.code === 'Digit3' ? 2 : -1;
          if (index >= 0) this.selectUpgrade(index);
        }
        if (event.key === 'Escape' && this.activeModal) {
          event.preventDefault();
          this.closeModal(this.activeModal);
        } else if (event.key === 'Tab') {
          const modal = this.activeModal || [this.pauseScreen, this.upgradeScreen, this.storyChoiceScreen, this.victoryScreen, this.gameoverScreen, this.pointerLockScreen].find(screen => !screen.classList.contains('hidden'));
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
      const story = this.selectedMode === 'story';
      this.$('sector').disabled = story;
      this.$('mission-summary').textContent = story
        ? 'Retrouvez la voix humaine enfouie dans le Nœud 07. Sanctuaire → Nef → Ossuaire · 10 offices · décisions irréversibles pour cette tentative.'
        : this.selectedMode === 'endless' ? 'Survivez aussi longtemps que possible dans le secteur choisi. Boss tous les cinq offices, sans extraction finale.' : 'Purgez dix offices dans le secteur choisi, abattez les deux boss puis rejoignez le sceau d’extraction.';
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
      const warning = status && (!status.available || status.dirty || status.recovered || status.conflict || status.futureVersion);
      const element = this.$('save-status');
      element.classList.toggle('hidden', !warning);
      element.textContent = status?.conflict
        ? 'DOSSIER MODIFIÉ DANS UN AUTRE ONGLET — écriture bloquée pour protéger votre progression. Réglages : exportez cette tentative ou rechargez le dossier actuel.'
        : status?.futureVersion
        ? 'DOSSIER D’UNE VERSION PLUS RÉCENTE — aucune écriture autorisée. Fermez les onglets pour actualiser le jeu ; la copie originale reste exportable dans les réglages.'
        : !warning ? '' : !status.available || status.dirty
        ? 'SAUVEGARDE NON CONFIRMÉE — exportez une copie du dossier dans les réglages avant de fermer.'
        : 'DOSSIER RÉPARÉ — certaines données invalides ont été récupérées ; une copie de secours est conservée sur cet appareil.';
      this.$('save-recovery-export').classList.toggle('hidden', typeof this.game.save.recoveryBackup !== 'string');
      this.$('save-reload').classList.toggle('hidden', !status?.conflict);
      this.$('save-import').disabled = this.game.state !== 'menu' || Boolean(status?.conflict || status?.futureVersion);
    }

    _syncPWAStatus() {
      const status = window.nexusPWA?.status;
      if (!status) return;
      this.$('pwa-install').classList.toggle('hidden', !status.installAvailable || Boolean(status.installed));
      this.$('pwa-status').textContent = status.supported === false
        ? 'Ce navigateur ne permet pas le mode hors ligne. Le jeu reste accessible en ligne ; exportez votre dossier pour le conserver.'
        : status.error
        ? status.offlineReady
          ? 'Jeu déjà prêt hors ligne. Installation ou mise à jour indisponible pour le moment ; réessayez après avoir fermé les autres onglets du jeu.'
          : 'Mode hors ligne indisponible. Vérifiez la connexion et les autorisations du navigateur, puis rechargez le jeu. Le jeu en ligne reste accessible.'
        : status.updateAvailable
        ? 'Mise à jour prête. Fermez tous les onglets du jeu puis rouvrez-le : votre dossier est conservé.'
        : status.offlineReady
        ? (status.installed ? 'Application installée. ' : '') + 'Jeu prêt hors ligne sur cet appareil. La sauvegarde reste locale : conservez un export.'
        : 'Préparation du mode hors ligne… Gardez le jeu ouvert jusqu’à la fin du téléchargement.';
    }

    _exportSave(original = false) {
      try {
        const content = original ? this.game.save.recoveryBackup : this.game.save.exportJSON();
        if (typeof content !== 'string') throw new Error('Aucune copie originale disponible.');
        const url = URL.createObjectURL(new Blob([content], { type:'application/json' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = (original ? 'nexus-original-' : 'nexus-dossier-') + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.$('save-transfer-status').textContent = original ? 'Copie originale exportée sans modification ; elle peut contenir des données non compatibles avec cette version.' : 'Export préparé. Conservez le fichier JSON hors du stockage du navigateur.';
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

    _bindRemapping() {
      const Input = NT.Engine.Input;
      for (const [action, definition] of Object.entries(Input.ACTIONS)) {
        const button = document.createElement('button');
        button.className = 'binding-button secondary-button';
        button.setAttribute('data-bind-action', action);
        button.addEventListener('click', () => this._listenForBinding(action));
        this.$('bindings-grid').appendChild(button);
        this.bindingButtons.set(action, button);
      }
      this.$('bindings-button').addEventListener('click', () => {
        this.bindingReturn = { modal:this.activeModal, focus:this.lastFocused, button:document.activeElement };
        this.activeModal?.classList.add('hidden');
        this._refreshBindings();
        this.openModal(this.bindingsScreen);
      });
      this.$('bindings-cancel').addEventListener('click', () => this._cancelBinding());
      this.$('bindings-reset').addEventListener('click', () => {
        this._cancelBinding();
        this._confirmAction('Rétablir les commandes ?', 'Seules les affectations clavier et souris seront réinitialisées. Votre dossier et les autres réglages sont conservés.', () => {
          this.game.settings.bindings = Input.defaultBindings();
          this._commitSettings();
          this._refreshBindings();
          this.$('bindings-status').textContent = 'Commandes par défaut rétablies.';
        });
      });
      // Capture avant les raccourcis du jeu : aucune action n’est déclenchée
      // pendant l’affectation. Tab reste disponible pour sortir de la saisie.
      document.addEventListener('keydown', event => {
        if (!this.bindingCapture) return;
        if (event.code === 'Tab') { this._cancelBinding(); return; }
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.code === 'Escape') { this._cancelBinding(); return; }
        if (event.repeat) return;
        if (event.altKey || event.metaKey || (event.ctrlKey && !/^Control/.test(event.code))) {
          this.$('bindings-status').textContent = 'Les combinaisons système sont réservées. Choisissez une touche seule.';
          return;
        }
        this._assignBinding(event.code);
      }, { capture:true });
      document.addEventListener('mousedown', event => {
        if (!this.bindingCapture) return;
        if (event.target.closest?.('button, input, select, a')) { this._cancelBinding(); return; }
        event.preventDefault();
        event.stopImmediatePropagation();
        this._assignBinding('Mouse' + event.button);
      }, { capture:true });
      this.bindingsScreen.addEventListener('contextmenu', event => event.preventDefault());
      window.addEventListener('blur', () => this._cancelBinding());
      this._refreshBindings();
    }

    _listenForBinding(action) {
      this._cancelBinding();
      this.bindingCapture = action;
      const button = this.bindingButtons.get(action);
      button.textContent = NT.Engine.Input.ACTIONS[action].label + ' · APPUYEZ…';
      button.setAttribute('aria-pressed', 'true');
      this.$('bindings-cancel').disabled = false;
      this.$('bindings-capture').classList.add('listening');
      this.$('bindings-status').textContent = 'Nouvelle commande pour « ' + NT.Engine.Input.ACTIONS[action].label + ' ». Échap annule.';
    }

    _cancelBinding() {
      if (!this.bindingCapture) return;
      const button = this.bindingButtons.get(this.bindingCapture);
      this.bindingCapture = null;
      this.$('bindings-cancel').disabled = true;
      this.$('bindings-capture').classList.remove('listening');
      this._refreshBindings();
      this.$('bindings-status').textContent = 'Saisie annulée. Aucune commande modifiée.';
      button?.focus?.();
    }

    _assignBinding(code) {
      const Input = NT.Engine.Input, action = this.bindingCapture;
      if (!action) return;
      const candidate = Input.validateBindings({ ...this.game.settings.bindings, [action]:code });
      if (!Input.isBindingCode(code) || !candidate.valid) {
        this.$('bindings-status').textContent = candidate.error || 'Cette commande est réservée. Choisissez une autre touche.';
        return;
      }
      this.game.settings.bindings = candidate.bindings;
      this.bindingCapture = null;
      this.$('bindings-cancel').disabled = true;
      this.$('bindings-capture').classList.remove('listening');
      this._commitSettings();
      this._refreshBindings();
      const status = this.game.save.status;
      const unconfirmed = status?.available === false || status?.dirty || status?.conflict || status?.futureVersion;
      this.$('bindings-status').textContent = Input.ACTIONS[action].label + ' : ' + Input.bindingLabel(action, candidate.bindings) + (unconfirmed ? ' · commande locale, enregistrement non confirmé.' : ' · commande enregistrée.');
      this.bindingButtons.get(action)?.focus?.();
    }

    _refreshBindings() {
      const Input = NT.Engine.Input;
      this.game.settings.bindings ||= Input.defaultBindings();
      for (const [action, button] of this.bindingButtons) {
        const label = Input.ACTIONS[action].label + ' · ' + Input.bindingLabel(action, this.game.settings.bindings);
        button.textContent = label;
        button.setAttribute('aria-label', 'Modifier : ' + label);
        button.setAttribute('aria-pressed', 'false');
      }
      this.lastWeaponSlots = '';
      this._refreshBindingHints();
    }

    _bindingLabel(action, touch = false) {
      return (touch ? this.defaultBindingLabels : this.bindingLabels)?.[action] || NT.Engine.Input.bindingLabel(action, touch ? NT.Engine.Input.defaultBindings() : this.game.settings.bindings);
    }

    _refreshBindingHints() {
      const Input = NT.Engine.Input;
      this.bindingLabels = Object.fromEntries(Object.keys(Input.ACTIONS).map(action => [action, Input.bindingLabel(action, this.game.settings.bindings)]));
      this.defaultBindingLabels ||= Object.fromEntries(Object.keys(Input.ACTIONS).map(action => [action, Input.bindingLabel(action, Input.defaultBindings())]));
      const movement = ['moveForward','moveLeft','moveBack','moveRight'];
      document.querySelectorAll('[data-binding-directions]').forEach(element => {
        element.textContent = movement.some(action => this.game.settings.bindings?.[action]) ? movement.map(action => this._bindingLabel(action)).join(' · ') : 'ZQSD / WASD';
      });
      const weapons = Array.from({ length:6 }, (_, index) => 'weapon' + (index + 1));
      document.querySelectorAll('[data-binding-weapons]').forEach(element => {
        element.textContent = weapons.some(action => this.game.settings.bindings?.[action]) ? weapons.map(action => this._bindingLabel(action)).join(' · ') : '1–6';
      });
      document.querySelectorAll('[data-binding]').forEach(element => {
        const touchHUD = this.game.input.touchMode && Boolean(element.closest?.('#hud'));
        element.textContent = this._bindingLabel(element.dataset.binding, touchHUD);
      });
      this.$('bindings-summary').textContent = 'Commandes actuelles — Avancer : ' + this._bindingLabel('moveForward') + ' · Reculer : ' + this._bindingLabel('moveBack') + ' · Gauche : ' + this._bindingLabel('moveLeft') + ' · Droite : ' + this._bindingLabel('moveRight') + ' · Tir : ' + this._bindingLabel('fire') + ' · Visée : ' + this._bindingLabel('aim') + ' · Office suivant : ' + this._bindingLabel('nextWave') + '.';
    }

    _bindTabs() {
      const row = this.codexScreen.querySelector('.tab-row');
      for (const [id, label] of [['journal','JOURNAL'],['completion','ACCOMPLISSEMENTS']]) {
        const button = document.createElement('button');
        button.className = 'tab'; button.setAttribute('data-tab', id);
        button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', 'false');
        button.setAttribute('aria-controls', 'codex-content'); button.textContent = label;
        row.appendChild(button);
      }
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
      this._refreshBindings();
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
      this._refreshBindingHints();
    }

    _hideGameplayScreens() {
      for (const screen of [this.pauseScreen, this.gameoverScreen, this.victoryScreen, this.upgradeScreen, this.pointerLockScreen, this.storyChoiceScreen]) screen?.classList.add('hidden');
    }

    showMainMenu() {
      this._cancelBinding();
      this.bindingsScreen.classList.add('hidden');
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
      this._cancelBinding();
      this.bindingsScreen.classList.add('hidden');
      this.mainMenu.classList.add('hidden');
      for (const screen of [this.codexScreen, this.settingsScreen, this.creditsScreen, this.pauseScreen, this.gameoverScreen, this.victoryScreen, this.upgradeScreen, this.pointerLockScreen]) screen?.classList.add('hidden');
      this.hud.classList.remove('hidden');
      this.briefingScreen.classList.add('hidden');
      this.confirmScreen.classList.add('hidden');
      this.activeModal = null;
      this.mainMenu.removeAttribute('aria-hidden');
      this._setTouchControls(true);
      this.storyChoiceScreen.classList.add('hidden');
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
      this.epilogue.classList.toggle('hidden', !results.storyEnding);
      this.epilogue.innerHTML = results.storyEnding ? '<h3>' + escapeHtml(results.storyEnding.title) + '</h3><p>' + escapeHtml(results.storyEnding.text) + '</p>' : '';
      this.victoryScreen.querySelector('.victory-copy').textContent = results.storyEnding
        ? 'Les trois secteurs sont scellés. La synthèse de votre issue et vos découvertes sont consignées dans le Journal.'
        : 'La campagne est purgée. Le Nexus demeure pourtant assez vivant pour une survie sans fin.';
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
      if (element === this.bindingsScreen) {
        this._cancelBinding();
        const destination = this.bindingReturn;
        this.bindingReturn = null;
        element.classList.add('hidden');
        element.setAttribute('aria-hidden', 'true');
        if (destination?.modal) {
          this.openModal(destination.modal, false);
          this.lastFocused = destination.focus;
          destination.button?.focus?.();
          return;
        }
      }
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
      this._syncSaveStatus();
      this._syncPWAStatus();
      this.openModal(this.settingsScreen);
    }
    openCodex() { this.renderCodex(this.currentCodexTab); this.openModal(this.codexScreen); }
    openJournal() {
      this.pauseScreen.classList.add('hidden');
      this.openCodex();
      this.codexScreen.querySelector('[data-tab="journal"]').click();
    }

    showStoryChoice(choice, callback) {
      this._hideGameplayScreens();
      this.hud.classList.add('hidden');
      this._setTouchControls(false);
      this.storyChoiceScreen.classList.remove('hidden');
      this.$('story-choice-title').textContent = choice.title;
      this.$('story-choice-description').textContent = choice.text;
      this.$('story-choice-kicker').textContent = 'LES VOIX DU NŒUD · DÉCISION APRÈS L’OFFICE ' + choice.afterWave;
      const root = this.$('story-choice-options');
      root.innerHTML = '';
      for (const option of choice.options) {
        const button = document.createElement('button');
        button.className = 'story-option secondary-button';
        button.setAttribute('data-story-option', option.id);
        button.innerHTML = '<strong>' + escapeHtml(option.title) + '</strong><span>' + escapeHtml(option.text) + '</span><small>Bénéfice : ' + escapeHtml(option.benefit) + '</small><small class="story-cost">Coût : ' + escapeHtml(option.cost) + '</small>';
        button.addEventListener('click', () => callback(option.id));
        root.appendChild(button);
      }
      this._focusFirst(this.storyChoiceScreen);
    }

    hideStoryChoice() {
      this.storyChoiceScreen.classList.add('hidden');
      this.activeModal = null;
      this.hud.classList.remove('hidden');
      this._setTouchControls(true);
    }
    openBriefing(fromPause = false) {
      if (fromPause) this.pauseScreen.classList.add('hidden');
      this.openModal(this.briefingScreen);
    }

    _focusFirst(root) {
      requestAnimationFrame(() => root.querySelector('button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex="0"]')?.focus());
    }

    _trapFocus(event, root) {
      const focusables = [...root.querySelectorAll('button:not([disabled]), select:not([disabled]), input:not([disabled]), summary, [href], [tabindex]:not([tabindex="-1"])')].filter(node => node.offsetParent !== null);
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
      if (!this.upgradeScreen.classList.contains('hidden') && this.game.settings.timedUpgrades && !document.hidden &&
          !this.activeModal && !this.game.persistenceBlocked && !this.game.graphicsUnavailable) {
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
      this.setInteraction(game.interactionPrompt ? game.interactionPrompt() : game.arena.stationPrompt(game.arena.nearestStation(p.position)));
      this._updateGuidance();
      const story = this.$('story-hud');
      story.classList.toggle('hidden', game.modeId !== 'story');
      if (game.modeId === 'story') {
        const mission = game.currentStoryMission;
        story.textContent = mission ? 'LES VOIX DU NŒUD · ' + mission.title : 'LES VOIX DU NŒUD · JOURNAL EN PAUSE';
      }
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
        const label = zone.type === 'hunt' ? 'CIBLE MARQUÉE' : zone.type === 'transport' && !zone.carrying ? 'MODULE À PRENDRE' : zone.type === 'relay' ? 'RELAIS ' + (zone.index + 1) + '/' + zone.total : 'SCEAU';
        navigation.textContent = label + ' · ' + Math.ceil(distance) + ' M · ' + direction;
      }
      const guide = this.$('field-guide');
      const initial = enabled && game.wave === 1 && game.runTime < 25 && !game.intermissionActive;
      guide.classList.toggle('hidden', !initial);
      if (initial) guide.textContent = game.input.touchMode
        ? 'Stick gauche : bouger · Glissez à droite : regarder · FEU : tirer · R : recharger · C : capacité'
        : this._bindingLabel('moveForward') + ' : avancer · ' + this._bindingLabel('fire') + ' : tirer · ' + this._bindingLabel('reload') + ' : recharger · ' + this._bindingLabel('ability') + ' : capacité · ' + this._bindingLabel('interact') + ' : station · Échap : pause';
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
        div.textContent = this.game.input.touchMode ? weapon.slot : this._bindingLabel('weapon' + weapon.slot);
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
      // Le refus précède la consommation du callback et la fermeture de l’écran.
      // Les réglages/export restent accessibles, sans choisir derrière une modale.
      if (this.activeModal || this.game.persistenceBlocked || this.game.graphicsUnavailable) return false;
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
      if (tab === 'completion') {
        this._renderCompletion(root, save);
      } else if (tab === 'journal') {
        this._renderJournal(root, save);
      } else if (tab === 'bestiary') {
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

    _renderCompletion(root, save) {
      const progress = NT.Progression?.summary(save.progression);
      if (!progress) { root.textContent = 'Le dossier des accomplissements est indisponible.'; return; }
      const next = progress.next;
      root.innerHTML = '<div class="completion-summary"><strong>' + progress.completed + ' / ' + progress.total + ' accomplissements · ' + progress.percent + ' %</strong><p>' + progress.archives.completed + ' / ' + progress.archives.total + ' archives · ' + progress.endings.completed + ' / ' + progress.endings.total + ' épilogues</p>' + (next ? '<p>Prochain objectif : <b>' + escapeHtml(next.name) + '</b> · ' + escapeHtml(next.description) + ' (' + next.progress + ' / ' + next.target + ')</p>' : '<p>Tous les accomplissements sont consignés. La survie sans fin reste ouverte.</p>') + '<small>Les fragments sont attribués une seule fois par accomplissement. Les anciennes sauvegardes conservent leurs statistiques ; aucune victoire non enregistrée n’est inventée.</small></div><div class="codex-grid">' + NT.Progression.ACHIEVEMENTS.map(item => {
        const achieved = Boolean(save.progression?.achievements?.[item.id]);
        return '<article class="completion-card ' + (achieved ? 'achieved' : '') + '"><div class="eyebrow">' + (achieved ? 'ACCOMPLI' : 'À ACCOMPLIR') + '</div><h3>' + escapeHtml(item.name) + '</h3><p>' + escapeHtml(item.description) + '</p><footer>' + (achieved ? 'Récompense déjà attribuée' : 'Récompense unique') + ' · ◆ ' + item.reward + '</footer></article>';
      }).join('') + '</div>';
    }

    _renderJournal(root, save) {
      const story = NT.Story;
      if (!story) { root.textContent = 'Les archives du Nœud sont indisponibles.'; return; }
      const reached = Math.max(1, save.progression?.storyWave || 0);
      root.innerHTML = '<div class="journal-intro"><strong>Les voix du Nœud</strong><p>La mission officielle : refermer la porte. Ce que vous rapporterez de l’autre côté dépend de ce que vous acceptez d’entendre.</p><p>Les transmissions se révèlent au fil des offices. Les archives sont facultatives : approchez leur reliquaire et utilisez Interagir. Les découvertes restent dans votre dossier après une mort.</p></div>';
      for (const chapter of story.CHAPTERS) {
        const section = document.createElement('section');
        section.className = 'journal-chapter';
        section.innerHTML = '<h3>' + escapeHtml(chapter.title || chapter.name) + '</h3>';
        for (const mission of story.MISSIONS.filter(item => item.chapterId === chapter.id)) {
          const known = mission.wave <= reached;
          section.innerHTML += known
            ? '<details class="journal-entry"><summary>Office ' + mission.wave + ' · ' + escapeHtml(mission.title) + '</summary><p><b>' + escapeHtml(mission.speaker) + '</b> — ' + escapeHtml(mission.text) + '</p>' + (reached > mission.wave || Object.values(save.progression?.endings || {}).some(Boolean) ? '<p>' + escapeHtml(mission.journal.text) + '</p>' : '') + '</details>'
            : '<p class="journal-locked">Office ' + mission.wave + ' · Transmission non reçue</p>';
        }
        for (const archive of story.ARCHIVES.filter(item => item.sectorId === chapter.sectorId)) {
          const known = Boolean(save.progression?.archives?.[archive.id]);
          section.innerHTML += known
            ? '<details class="journal-entry" data-archive="' + archive.id + '"><summary>Archive retrouvée · ' + escapeHtml(archive.title) + '</summary><p><b>' + escapeHtml(archive.speaker) + '</b> — ' + escapeHtml(archive.text) + '</p></details>'
            : '<p class="journal-locked">Archive non retrouvée · ' + escapeHtml(archive.hint || archive.locationHint || '') + '</p>';
        }
        root.appendChild(section);
      }
      const endings = document.createElement('section'); endings.className = 'journal-chapter';
      endings.innerHTML = '<h3>Épilogues</h3>' + Object.values(story.ENDINGS).map(ending => save.progression?.endings?.[ending.id]
        ? '<details class="journal-entry"><summary>' + escapeHtml(ending.title) + '</summary><p><b>' + escapeHtml(ending.speaker) + '</b> — ' + escapeHtml(ending.text) + '</p><p>' + escapeHtml(ending.journal) + '</p></details>'
        : '<p class="journal-locked">Épilogue non découvert · Terminez l’histoire avec d’autres décisions.</p>').join('');
      root.appendChild(endings);
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
