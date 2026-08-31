(function () {
  'use strict';

  const NT = window.NT = window.NT || {};
  const M = NT.Math;
  const E = NT.Engine;
  const D = NT.Data;
  const { Vec3, clamp, lerp, damp, randRange, chance, pick, shuffle, weightedPick, mat4, colorHex } = M;
  const { Camera, Renderer, ParticleSystem, Input, SaveStore, Transform, Material, modelMatrixBetween } = E;
  const { Player, Enemy, Projectile, Pickup } = NT.Entities;
  const prefersReducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const RUN_MODES = Object.freeze({ campaign:true, endless:true });
  const ownedId = (map, id) => typeof id === 'string' && Boolean(map) && Object.hasOwn(map, id);
  const ownValue = (map, id, fallback = 0) => map && Object.hasOwn(map, id) ? map[id] : fallback;
  function safeMetaLevels(source) {
    const levels = {};
    for (const [id, definition] of Object.entries(D.META_UPGRADES)) {
      const value = ownValue(source, id);
      levels[id] = Number.isFinite(value) ? clamp(Math.floor(value), 0, definition.max) : 0;
    }
    return levels;
  }

  const DEFAULT_SETTINGS = Object.freeze({
    sensitivity: 1,
    volume: .72,
    fov: 82,
    renderScale: 1,
    hudScale: 1,
    shakeIntensity: 1,
    headBob: true,
    reducedFlashes: false,
    reducedMotion: prefersReducedMotion,
    gore: true,
    invertY: false,
    uiContrast: false,
    enemyContrast: false,
    subtitles: true,
    guidedHints: true,
    timedUpgrades: false
  });

  const DEFAULT_SAVE = {
    version: 2,
    settings: { ...DEFAULT_SETTINGS },
    shards: 0,
    meta: {
      vitalSeal: 0,
      ordinance: 0,
      reinforced: 0,
      scavenger: 0,
      ward: 0,
      munitions: 0
    },
    codex: { enemyKills: {} },
    records: {
      bestWave: 0,
      bestScore: 0,
      lifetimeKills: 0,
      bossKills: 0,
      headshots: 0,
      damage: 0,
      runs: 0,
      playTime: 0
    },
    activeRun: null
  };

  class NexusGame {
    constructor(canvas) {
      this.canvas = canvas;
      this.renderer = new Renderer(canvas);
      this.camera = new Camera();
      this.input = new Input(canvas);
      this.audio = new NT.AudioManager();
      this.save = new SaveStore('nexus-of-torment-save-v1', DEFAULT_SAVE);
      this.settings = { ...DEFAULT_SETTINGS, ...(this.save.data.settings || {}) };
      this.applySettings();

      this.state = 'menu';
      this.previousState = 'menu';
      this.time = 0;
      this.runTime = 0;
      this.lastFrame = performance.now();
      this.lastRender = 0;
      this.wave = 0;
      this.waveActive = false;
      this.currentModifier = D.WAVE_MODIFIERS[0];
      this.difficulty = D.DIFFICULTIES.unstable;
      this.objectiveText = 'EN ATTENTE DU PROTOCOLE';
      this.score = 0;
      this.killStreak = 0;
      this.killStreakTimer = 0;
      this.spawnsRemaining = 0;
      this.spawnQueue = [];
      this.spawnTimer = 0;
      this.chainStormTimer = 0;
      this.waveCompleteTimer = 0;
      this.pendingUpgrade = false;
      this.intermissionActive = false;
      this.intermissionTimer = 0;
      this.intermissionDuration = 20;
      this.intermissionReadyDelay = 0;
      this.waveObjective = null;
      this.extractionActive = false;
      this.extractionProgress = 0;
      this.extractionDuration = 3.2;
      this.extractionZone = null;
      this.modeId = 'campaign';
      this.sectorId = 'sanctum';
      this.deathTimer = 0;
      this.lastClassId = 'bulwark';
      this.lastDifficultyId = 'unstable';
      this.runFinalized = true;
      this.stats = this._newStats();

      this.enemies = [];
      this.projectiles = [];
      this.pickups = [];
      this.tracers = [];
      this.arcs = [];
      this.rings = [];
      this.hallucinations = [];
      this.menuEntities = [];

      this.player = new Player(this);
      this.arena = new NT.Arena(this);
      this.weapons = new NT.WeaponSystem(this);
      this.particles = new ParticleSystem(this.renderer, 2100);
      this.ui = new NT.UIManager(this);

      this.effectMaterials = {
        tracerRed: new Material({ color:0xff6855, emissive:0xff503d, pattern:3, metallic:0, alpha:.82, additive:true, depthWrite:false, pulse:.7 }),
        tracerCyan: new Material({ color:0x70edf3, emissive:0x4fdce7, pattern:3, metallic:0, alpha:.9, additive:true, depthWrite:false, pulse:1 }),
        arc: new Material({ color:0x7af2f3, emissive:0x54e4ef, pattern:3, metallic:0, alpha:.9, additive:true, depthWrite:false, pulse:1.3 }),
        ritual: new Material({ color:0x9c1f32, emissive:0xf03849, pattern:3, metallic:.1, alpha:.72, additive:true, depthWrite:false, pulse:1.25 }),
        ward: new Material({ color:0x2f929a, emissive:0x66f0ef, pattern:3, metallic:.1, alpha:.65, additive:true, depthWrite:false, pulse:1.2 }),
        ghost: new Material({ color:0x633653, emissive:0xd764a4, pattern:4, metallic:0, alpha:.34, additive:true, depthWrite:false, doubleSided:true, pulse:1.4 }),
        explosion: new Material({ color:0xe47739, emissive:0xff7933, pattern:3, metallic:0, alpha:.76, additive:true, depthWrite:false, pulse:1.5 }),
        bossWarning: new Material({ color:0xffb666, emissive:0xf49b38, pattern:0, metallic:0, alpha:.48, additive:true, depthWrite:false, pulse:0 })
      };
      this.effectTransform = new Transform();
      this.bossWarningTransform = new Transform();
      this.effectMatrix = mat4();
      this.lightA = new Vec3();
      this.lightB = new Vec3();
      this.lightC = new Vec3();
      this.lightD = new Vec3();

      this._bindLifecycle();
      this._buildMenuScene();
      this.ui.showMainMenu();
    }

    _newStats() {
      return {
        shots: 0,
        hits: 0,
        damage: 0,
        headshots: 0,
        kills: 0,
        eliteKills: 0,
        bossKills: 0,
        essenceSpent: 0,
        damageTaken: 0,
        wavesCleared: 0
      };
    }

    _bindLifecycle() {
      this.input.onLockChange = locked => {
        if (!locked && !this.input.touchMode && this.state === 'playing' && !this.pendingUpgrade && !this.player.dead) {
          this.pause();
        }
      };
      window.addEventListener('keydown', event => {
        if (event.defaultPrevented) return;
        if (event.code === 'Escape' && this.state === 'playing') {
          event.preventDefault();
          this.pause();
        } else if (event.code === 'Escape' && this.state === 'paused') {
          event.preventDefault();
          this.resume();
        }
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.state === 'playing') this.pause();
      });
    }

    applySettings() {
      this.camera.fov = clamp(Number(this.settings.fov) || 82, 65, 105);
      this.renderer.renderScale = clamp(Number(this.settings.renderScale) || 1, .55, 1.5);
      this.audio.setVolume?.(clamp(Number(this.settings.volume) || 0, 0, 1));
      document.body.classList.toggle('reduced-flashes', Boolean(this.settings.reducedFlashes));
      document.body.classList.toggle('gore-disabled', !this.settings.gore);
    }

    saveSettings() {
      this.save.data.settings = { ...this.settings };
      this.save.save();
    }

    resetSettings() {
      this.settings = { ...DEFAULT_SETTINGS };
      this.applySettings();
      this.saveSettings();
    }

    _buildMenuScene() {
      this.wave = 8;
      this.difficulty = D.DIFFICULTIES.unstable;
      this.currentModifier = D.WAVE_MODIFIERS[0];
      this.menuEntities = [
        new Enemy(this, 'hookbearer', new Vec3(-5,0,-5), { instant:true }),
        new Enemy(this, 'cherub', new Vec3(4,3.6,-8), { instant:true }),
        new Enemy(this, 'gatekeeper', new Vec3(0,0,-14), { instant:true })
      ];
      this.menuEntities[2].health = this.menuEntities[2].maxHealth;
      this.wave = 0;
    }

    start() {
      this.lastFrame = performance.now();
      requestAnimationFrame(now => this._frame(now));
    }

    _frame(now) {
      const dt = Math.min(.05, Math.max(0, (now - this.lastFrame) / 1000));
      this.lastFrame = now;
      this.time += dt;
      try {
        this.update(dt);
        const animatedState = this.state === 'playing' || this.state === 'dying' || this.state === 'menu';
        if (animatedState || now - this.lastRender >= 100) {
          this.render();
          this.lastRender = now;
        }
      } catch (error) {
        this._fatal(error);
        return;
      }
      this.input.endFrame();
      requestAnimationFrame(next => this._frame(next));
    }

    _fatal(error) {
      console.error(error);
      this.state = 'error';
      this.input.exitLock();
      const fallback = document.getElementById('webgl-fallback');
      if (fallback) {
        fallback.classList.remove('hidden');
        fallback.innerHTML = `<div><h1>RUPTURE DU MOTEUR</h1><p>${escapeHtml(error?.message || error)}</p><p>Rechargez la page ou utilisez un navigateur récent compatible WebGL 2.</p></div>`;
      }
    }

    startRun(classId = 'bulwark', difficultyId = 'unstable', modeId = 'campaign', sectorId = 'sanctum') {
      this.audio.init();
      this.lastClassId = ownedId(D.CLASSES, classId) ? classId : 'bulwark';
      this.lastDifficultyId = ownedId(D.DIFFICULTIES, difficultyId) ? difficultyId : 'unstable';
      this.modeId = ownedId(RUN_MODES, modeId) ? modeId : 'campaign';
      const sectorIds = Object.keys(D.SECTORS || {});
      this.sectorId = ownedId(D.SECTORS, sectorId) ? sectorId : sectorIds[0] || 'sanctum';
      this.difficulty = D.DIFFICULTIES[this.lastDifficultyId];
      this.currentModifier = D.WAVE_MODIFIERS[0];
      this.wave = 0;
      this.waveActive = false;
      this.objectiveText = 'STABILISATION DU NŒUD';
      this.score = 0;
      this.killStreak = 0;
      this.killStreakTimer = 0;
      this.spawnsRemaining = 0;
      this.spawnQueue.length = 0;
      this.spawnTimer = 0;
      this.chainStormTimer = 0;
      this.waveCompleteTimer = 0;
      this.pendingUpgrade = false;
      this.intermissionActive = false;
      this.intermissionTimer = 0;
      this.intermissionReadyDelay = 0;
      this.waveObjective = null;
      this.extractionActive = false;
      this.extractionProgress = 0;
      this.extractionZone = null;
      this.deathTimer = 0;
      this.runTime = 0;
      this.runFinalized = false;
      this.stats = this._newStats();
      this.enemies.length = 0;
      this.projectiles.length = 0;
      this.pickups.length = 0;
      this.tracers.length = 0;
      this.arcs.length = 0;
      this.rings.length = 0;
      this.hallucinations.length = 0;
      this.particles.clear();
      this.arena.reset();
      this.arena.setSector?.(this.sectorId);
      this.arena.setObjectiveZone?.(null);
      const metaLevels = safeMetaLevels(this.save.data.meta);
      this.player.reset(this.lastClassId, metaLevels);
      const startPosition = this.arena.getStartPosition?.();
      if (startPosition) {
        this.player.position.copy(startPosition);
        this.camera.position.set(startPosition.x, startPosition.y + this.player.eyeHeight, startPosition.z);
        const facing = D.SECTORS?.[this.sectorId]?.startFacing || [0, 0, 0];
        const targetX = Array.isArray(facing) ? Number(facing[0]) || 0 : Number(facing?.x) || 0;
        const targetZ = Array.isArray(facing) ? Number(facing[2]) || 0 : Number(facing?.z) || 0;
        this.camera.yaw = Math.atan2(targetX - startPosition.x, -(targetZ - startPosition.z));
        this.camera.pitch = 0;
      }
      this.weapons.reset(metaLevels);
      this.state = 'playing';
      this.previousState = 'playing';
      this.ui.enterGame();
      this.save.data.activeRun = null;
      this.save.data.records.runs = (this.save.data.records.runs || 0) + 1;
      this.save.save();
      this.ui.announce('PROTOCOLE DE CONFINEMENT', this.player.classData.name.toUpperCase(), this.difficulty.name, 2.4);
      this.ui.subtitle('Le Nœud s’ouvre. Tenez la ligne.', 3.2);
      this.arena.triggerGatePulse(1.4);
      this.startNextWave();
      this.input.requestLock();
    }

    restartRun() {
      if (!this.runFinalized && this.wave > 0) this._finalizeRun('abandon', false);
      this.input.exitLock();
      this.startRun(this.lastClassId, this.lastDifficultyId, this.modeId, this.sectorId);
    }

    quitToMenu() {
      if (!this.runFinalized && this.wave > 0) this._finalizeRun('abandon', false);
      this.state = 'menu';
      this.waveActive = false;
      this.pendingUpgrade = false;
      this.intermissionActive = false;
      this.extractionActive = false;
      this.waveObjective = null;
      this.arena.setObjectiveZone?.(null);
      this.input.exitLock();
      this.enemies.length = 0;
      this.projectiles.length = 0;
      this.pickups.length = 0;
      this.tracers.length = 0;
      this.arcs.length = 0;
      this.rings.length = 0;
      this.hallucinations.length = 0;
      this.particles.clear();
      this.arena.reset();
      this.wave = 0;
      this.currentModifier = D.WAVE_MODIFIERS[0];
      this.ui.showMainMenu();
    }

    pause() {
      if (this.state !== 'playing') return;
      this.state = 'paused';
      this.input.exitLock();
      this.audio.ui('select');
      this.ui.showPause();
    }

    resume() {
      if (this.state !== 'paused') return;
      this.state = 'playing';
      this.ui.hidePause();
      this.audio.ui('confirm');
      this.input.requestLock();
    }

    onPlayerDeath() {
      if (this.state === 'dying' || this.state === 'gameover') return;
      this._clearActiveRun();
      this.state = 'dying';
      this.waveActive = false;
      this.intermissionActive = false;
      this.extractionActive = false;
      this.arena.setObjectiveZone?.(null);
      this.deathTimer = 2.1;
      this.objectiveText = 'SIGNATURE VITALE PERDUE';
      this.input.exitLock();
      this.audio.death?.();
      this.ui.announce('ÉCHEC DU CONFINEMENT', 'LE NEXUS VOUS RÉCLAME', 'La brèche demeure ouverte.', 2.2);
      this.spawnAbilityRing(this.player.position, 0xa3172c, 9);
    }

    _finalizeRun(outcome = 'death', showScreen = true) {
      if (this.runFinalized) return;
      this.runFinalized = true;
      const completed = this.stats.wavesCleared;
      const base = Math.floor(completed / 2) + this.stats.bossKills * 3 + Math.floor(this.score / 7500);
      const eligible = outcome === 'death' || outcome === 'victory';
      const victoryBonus = outcome === 'victory' ? 8 : 0;
      const shards = eligible ? Math.max(completed > 0 ? 1 : 0, Math.floor(base * this.difficulty.shardRate) + victoryBonus) : 0;
      const records = this.save.data.records;
      this.save.data.shards = (this.save.data.shards || 0) + shards;
      records.bestWave = Math.max(records.bestWave || 0, this.wave);
      records.bestScore = Math.max(records.bestScore || 0, Math.round(this.score));
      records.lifetimeKills = (records.lifetimeKills || 0) + this.stats.kills;
      records.bossKills = (records.bossKills || 0) + this.stats.bossKills;
      records.headshots = (records.headshots || 0) + this.stats.headshots;
      records.damage = (records.damage || 0) + this.stats.damage;
      records.playTime = (records.playTime || 0) + this.runTime;
      this.save.data.activeRun = null;
      this.save.save();
      const results = { outcome, wave:this.wave, sectors:outcome === 'victory' ? 1 : 0, kills:this.stats.kills, score:this.score, shards };
      if (showScreen) {
        if (outcome === 'victory') {
          this.state = 'victory';
          if (this.ui.showVictory) this.ui.showVictory(results);
          else this.ui.showGameOver(results);
        } else {
          this.state = 'gameover';
          this.ui.showGameOver(results);
        }
      }
      return results;
    }

    update(dt) {
      this.ui.update(dt);
      if (this.state === 'menu') {
        this._updateMenu(dt);
        this.arena.update(dt, this.time);
        this.particles.update(dt);
        this.audio.update?.(dt, 0, .08, false);
        return;
      }
      if (this.state === 'paused' || this.state === 'upgrade' || this.state === 'gameover' || this.state === 'victory' || this.state === 'error') {
        this.audio.update?.(dt, 0, .05, false);
        return;
      }
      if (this.state === 'dying') {
        this.deathTimer -= dt;
        this.arena.update(dt, this.time);
        this._updateEntities(dt, false);
        this._updateEffects(dt);
        this.particles.update(dt);
        if (this.deathTimer <= 0) this._finalizeRun('death', true);
        return;
      }
      if (this.state !== 'playing') return;

      this.runTime += dt;
      this.killStreakTimer = Math.max(0, this.killStreakTimer - dt);
      if (this.killStreakTimer <= 0) this.killStreak = 0;
      this.player.update(dt);
      this.weapons.update(dt);
      this.arena.update(dt, this.time);
      this._handleInteraction();
      if (this.extractionActive) this._updateExtraction(dt);
      else if (this.intermissionActive) this._updateIntermission(dt);
      else {
        this._updateWaveObjective(dt);
        this._updateWaveDirector(dt);
      }
      if (this.state !== 'playing') return;
      this._updateEntities(dt, true);
      this._separateEnemies();
      this._updateEnemyWatchdog(dt);
      this._updateEffects(dt);
      this.particles.update(dt);
      const intensity = clamp(this.enemies.length / 24 + (this.wave % 5 === 0 ? .18 : 0), 0, 1);
      this.audio.update?.(dt, this.player.corruption, intensity, Boolean(this.enemies.find(enemy => enemy.alive && enemy.boss)));
    }

    _updateMenu(dt) {
      const radius = 17.5;
      const angle = this.time * .055 + .35;
      this.camera.position.set(Math.sin(angle) * radius, 4.2 + Math.sin(this.time*.18)*.35, Math.cos(angle) * radius - 3.5);
      const target = new Vec3(0, 2.2, -6);
      const dx = target.x - this.camera.position.x;
      const dy = target.y - this.camera.position.y;
      const dz = target.z - this.camera.position.z;
      this.camera.yaw = Math.atan2(dx, -dz);
      this.camera.pitch = Math.atan2(dy, Math.hypot(dx,dz));
      this.camera.shake.set(0,0,0);
      for (const enemy of this.menuEntities) {
        enemy.age += dt;
        enemy.yaw += Math.sin(this.time*.2 + enemy.position.x) * dt * .025;
      }
      if (chance(dt * 1.4)) {
        this.particles.spawn({
          position:new Vec3(randRange(-11,11), randRange(.1,4), randRange(-15,8)),
          velocity:new Vec3(randRange(-.1,.1), randRange(.15,.55), randRange(-.1,.1)),
          color:chance(.7)?0x9d2937:0xc58a4a,
          size:randRange(.035,.11), life:randRange(1.4,3.8), gravity:-.05, drag:.25, alpha:.45
        });
      }
    }

    _handleInteraction() {
      const station = this.arena.nearestStation(this.player.position);
      if (station && this.input.consume('KeyE') && this.arena.activateStation(station) && this.intermissionActive) {
        this._checkpointActiveRun(this.wave + 1);
      }
    }

    _updateEntities(dt, allowSpawns) {
      if (allowSpawns) {
        for (const enemy of this.enemies) enemy.update(dt);
      } else {
        for (const enemy of this.enemies) {
          enemy.age += dt;
          enemy.hitFlash = Math.max(0, enemy.hitFlash - dt * 6);
        }
      }
      for (const projectile of this.projectiles) projectile.update(dt);
      for (const pickup of this.pickups) pickup.update(dt);
      this.enemies = this.enemies.filter(enemy => enemy.alive);
      this.projectiles = this.projectiles.filter(projectile => projectile.alive);
      this.pickups = this.pickups.filter(pickup => pickup.alive);
    }

    _separateEnemies() {
      const enemies = this.enemies;
      for (let i = 0; i < enemies.length; i++) {
        const a = enemies[i];
        if (!a.alive || a.config.flying || a.spawnTimer > 0) continue;
        for (let j = i + 1; j < enemies.length; j++) {
          const b = enemies[j];
          if (!b.alive || b.config.flying || b.spawnTimer > 0) continue;
          const dx = b.position.x - a.position.x;
          const dz = b.position.z - a.position.z;
          const min = (a.radius + b.radius) * .82;
          const sq = dx*dx + dz*dz;
          if (sq <= .0001 || sq >= min*min) continue;
          const dist = Math.sqrt(sq);
          const push = (min - dist) * .5;
          const nx = dx / dist, nz = dz / dist;
          a.position.x -= nx * push; a.position.z -= nz * push;
          b.position.x += nx * push; b.position.z += nz * push;
          this.arena.resolvePosition(a.position, a.radius);
          this.arena.resolvePosition(b.position, b.radius);
        }
      }
    }

    _updateEnemyWatchdog(dt) {
      for (const enemy of this.enemies) {
        if (!enemy.alive || enemy.spawnTimer > 0 || enemy.stunTimer > 0) continue;
        enemy.watchdogTimer = (enemy.watchdogTimer || 0) + dt;
        if (!enemy.watchdogPosition) enemy.watchdogPosition = enemy.position.clone();
        if (enemy.watchdogTimer < .8) continue;
        const elapsed = enemy.watchdogTimer;
        enemy.watchdogTimer = 0;
        const moved = enemy.position.distanceToXZ(enemy.watchdogPosition);
        enemy.watchdogPosition.copy(enemy.position);
        const distance = enemy.position.distanceToXZ(this.player.position);
        const blocked = this.arena.lineBlocked(
          new Vec3(enemy.position.x, enemy.config.flying ? enemy.position.y : Math.min(enemy.height, 1.5), enemy.position.z),
          this.camera.position
        );
        const intentionallyStill = enemy.state?.toLowerCase().includes('windup') || enemy.state === 'vanish' || enemy.state === 'appear';
        const contactRange = (enemy.radius || .5) + (this.player.radius || .42) + .85;
        if (!intentionallyStill && blocked && distance > contactRange && moved < .16) {
          enemy.stuckTimer = (enemy.stuckTimer || 0) + elapsed;
        } else {
          enemy.stuckTimer = Math.max(0, (enemy.stuckTimer || 0) - elapsed * 1.5);
        }
        const threshold = enemy.boss ? 5.5 : 3.2;
        if (enemy.stuckTimer < threshold) continue;
        const replacement = this.arena.getSpawnPoint(this.player.position, enemy.boss ? 14 : 9);
        enemy.position.x = replacement.x;
        enemy.position.z = replacement.z;
        if (enemy.config.flying) enemy.position.y = Math.max(3.2, enemy.position.y);
        enemy.velocity.set(0,0,0);
        enemy.spawnTimer = .72;
        enemy.stuckTimer = 0;
        enemy.watchdogPosition.copy(enemy.position);
        this.spawnAbilityRing(enemy.position, enemy.config.emissive, Math.max(1.4, enemy.radius * 2.6), .45);
      }
    }

    startNextWave() {
      this.wave++;
      this.waveActive = true;
      this.pendingUpgrade = false;
      this.intermissionActive = false;
      this.waveCompleteTimer = 0;
      this.player.lastRiteUsedWave = -1;
      this.player.grenades = Math.min(this.player.maxGrenades, this.player.grenades + 1);
      this.currentModifier = this._pickModifier();
      this._configureWaveObjective();
      this.spawnQueue = this._buildWaveQueue();
      this.spawnsRemaining = this.spawnQueue.length;
      this.spawnTimer = this.wave % 5 === 0 ? .9 : .45;
      this.chainStormTimer = randRange(5.5, 8.5);
      const bossType = this.wave % 10 === 0 ? 'archdeacon' : 'gatekeeper';
      const bossData = D.ENEMIES[bossType];
      this._refreshObjectiveText();
      this.arena.triggerGatePulse(1.15);
      this.audio.wave();
      const bossWave = this.wave % 5 === 0;
      this.ui.announce(
        bossWave ? 'OUVERTURE CARDINALE' : `VAGUE ${String(this.wave).padStart(2,'0')}`,
        bossWave ? bossData.name.toUpperCase() : this.currentModifier.name,
        bossWave ? (bossType === 'archdeacon' ? 'Le réseau nerveux du Nexus envahit la chambre.' : 'La couronne de fer franchit la brèche.') : this.currentModifier.description,
        bossWave ? 3.2 : 2.3
      );
      if (bossWave) this.ui.subtitle(bossType === 'archdeacon' ? 'Coupez ses relais avant que la Souillure ne vous immobilise.' : 'Sa couronne marque les condamnés. Brisez ses phases.', 4);
      else if (this.waveObjective?.type === 'hold') this.ui.subtitle('Maintenez le sceau jusqu’à sa stabilisation, puis éliminez les survivants.', 3.4);
      else if (this.waveObjective?.type === 'hunt') this.ui.subtitle('Les signatures marquées alimentent la brèche. Abattez-les en priorité.', 3.4);
    }

    _pickModifier() {
      if (this.wave <= 2 || this.wave % 5 === 0) return D.WAVE_MODIFIERS[0];
      const available = D.WAVE_MODIFIERS.filter(mod => mod.minWave <= this.wave && mod.id !== this.currentModifier?.id);
      return weightedPick(available.length ? available : D.WAVE_MODIFIERS);
    }

    _enemyCap() {
      return Math.min(46, 24 + Math.floor(this.wave * 1.35));
    }

    _configureWaveObjective() {
      this.arena.setObjectiveZone?.(null);
      if (this.wave % 5 === 0) {
        this.waveObjective = { type:'boss', phase:'active', reinforcementTimer:0 };
        return;
      }
      const rotation = ['purge','hold','hunt'];
      const type = rotation[(this.wave - 1) % rotation.length];
      if (type === 'hold') {
        const fallbacks = [[-10,0,8],[10,0,8],[0,0,-7],[0,0,14]];
        const sector = D.SECTORS?.[this.sectorId];
        const zones = sector?.objectiveZones || sector?.holdZones;
        let source = Array.isArray(zones) && zones.length
          ? zones[(this.wave - 1) % zones.length]
          : sector?.objectiveAnchors?.hold || fallbacks[(this.wave - 1) % fallbacks.length];
        if (source?.position) source = source.position;
        const position = Array.isArray(source)
          ? new Vec3(Number(source[0]) || 0, Number(source[1]) || 0, Number(source[2]) || 0)
          : new Vec3(Number(source?.x) || 0, Number(source?.y) || 0, Number(source?.z) || 0);
        this.waveObjective = {
          type, phase:'active', position, radius:4.5,
          progress:0, duration:clamp(9 + this.wave * .45, 10, 16),
          reinforcementTimer:4
        };
        this.arena.setObjectiveZone?.(this.waveObjective);
      } else if (type === 'hunt') {
        const target = clamp(1 + Math.floor(this.wave / 3), 2, 4);
        this.waveObjective = { type, phase:'active', target, remaining:target, reinforcementTimer:4 };
      } else {
        this.waveObjective = { type:'purge', phase:'active', reinforcementTimer:0 };
      }
    }

    _refreshObjectiveText() {
      const objective = this.waveObjective;
      if (!objective) {
        this.objectiveText = 'PURGEZ TOUTES LES SIGNATURES';
      } else if (objective.type === 'boss') {
        const bossType = this.wave % 10 === 0 ? 'archdeacon' : 'gatekeeper';
        this.objectiveText = 'ÉLIMINEZ ' + D.ENEMIES[bossType].name.toUpperCase();
      } else if (objective.type === 'hold') {
        this.objectiveText = objective.phase === 'cleanup'
          ? 'SCEAU STABLE · PURGEZ LES SURVIVANTS'
          : 'MAINTENEZ LE SCEAU · ' + Math.ceil(Math.max(0, objective.duration - objective.progress)) + ' S';
      } else if (objective.type === 'hunt') {
        this.objectiveText = objective.phase === 'cleanup'
          ? 'MARQUES ROMPUES · PURGEZ LES SURVIVANTS'
          : 'ABATTEZ LES MARQUÉS · ' + Math.max(0, objective.remaining) + ' / ' + objective.target;
      } else {
        this.objectiveText = 'PURGEZ TOUTES LES SIGNATURES';
      }
    }

    _updateWaveObjective(dt) {
      const objective = this.waveObjective;
      if (!objective || objective.phase !== 'active') return;
      if (objective.type === 'hold') {
        const inside = this.player.position.distanceToXZ(objective.position) <= objective.radius;
        objective.progress = inside
          ? Math.min(objective.duration, objective.progress + dt)
          : Math.max(0, objective.progress - dt * .45);
        objective.reinforcementTimer -= dt;
        if (objective.reinforcementTimer <= 0 && this.enemies.filter(enemy => enemy.alive).length < Math.min(9, 4 + Math.floor(this.wave / 2))) {
          objective.reinforcementTimer = randRange(3.2, 5.2);
          this._spawnObjectiveReinforcement(false);
        }
        if (objective.progress >= objective.duration) {
          objective.phase = 'cleanup';
          this.spawnQueue.length = 0;
          this.spawnsRemaining = 0;
          this.arena.setObjectiveZone?.(null);
          this.ui.announce('SCEAU STABILISÉ', 'TENUE VALIDÉE', 'Éliminez les signatures restantes.', 2);
        }
      } else if (objective.type === 'hunt') {
        const aliveMarked = this.enemies.some(enemy => enemy.alive && enemy.objectiveMarked);
        const queuedMarked = this.spawnQueue.some(entry => entry.marked);
        objective.reinforcementTimer -= dt;
        if (objective.remaining > 0 && !aliveMarked && !queuedMarked && objective.reinforcementTimer <= 0) {
          objective.reinforcementTimer = 3;
          this._spawnObjectiveReinforcement(true);
        }
        if (objective.remaining <= 0) {
          objective.phase = 'cleanup';
          this.spawnQueue.length = 0;
          this.spawnsRemaining = 0;
          this.ui.announce('SIGNATURES ROMPUES', 'CHASSE TERMINÉE', 'Purgez les survivants.', 2);
        }
      }
      this._refreshObjectiveText();
    }

    _spawnObjectiveReinforcement(marked) {
      if (this.enemies.filter(enemy => enemy.alive).length >= this._enemyCap()) return null;
      const pool = Object.values(D.ENEMIES).filter(enemy => !enemy.boss && enemy.unlockWave <= this.wave);
      if (!pool.length) return null;
      return this.spawnEnemy(weightedPick(pool).id, null, { elite:marked, marked, instant:false, objectiveReinforcement:true });
    }

    _canCompleteWave() {
      if (!this.waveActive || this.extractionActive) return false;
      if (this.waveObjective?.phase === 'active' && (this.waveObjective.type === 'hold' || this.waveObjective.type === 'hunt')) return false;
      return !this.spawnQueue.length && !this.enemies.some(enemy => enemy.alive);
    }

    _beginIntermission(duration = this.intermissionDuration) {
      this.waveActive = false;
      this.pendingUpgrade = false;
      this.intermissionActive = true;
      this.intermissionTimer = Math.max(5, duration);
      this.intermissionReadyDelay = .65;
      this.waveObjective = { type:'intermission', phase:'active' };
      this.arena.setObjectiveZone?.(null);
      this.objectiveText = 'PRÉPARATION · ' + Math.ceil(this.intermissionTimer) + ' S · ENTRÉE/F POUR CONTINUER';
      this._checkpointActiveRun(this.wave + 1);
      this.ui.announce('INTERMISSION', 'PRÉPAREZ LE PROCHAIN OFFICE', 'Stations actives · Entrée ou F pour continuer.', 2.4);
    }

    _combatReady() {
      return typeof this.input.combatReady === 'function' ? Boolean(this.input.combatReady()) : Boolean(this.input.pointerLocked);
    }

    _updateIntermission(dt) {
      this.intermissionTimer = Math.max(0, this.intermissionTimer - dt);
      this.intermissionReadyDelay = Math.max(0, this.intermissionReadyDelay - dt);
      this.objectiveText = 'PRÉPARATION · ' + Math.ceil(this.intermissionTimer) + ' S · ENTRÉE/F POUR CONTINUER';
      const manual = this.intermissionReadyDelay <= 0 && (this.input.consume('Enter') || this.input.consume('KeyF'));
      if (manual && !this._combatReady()) {
        this.input.requestLock();
        return;
      }
      if (manual || this.intermissionTimer <= 0) this._startWaveFromIntermission();
    }

    _startWaveFromIntermission() {
      if (!this.intermissionActive) return false;
      this._checkpointActiveRun(this.wave + 1);
      this.intermissionActive = false;
      this.startNextWave();
      this.input.requestLock();
      return true;
    }

    _extractionPosition() {
      const sector = D.SECTORS?.[this.sectorId];
      let source = sector?.extractionPosition || sector?.extraction || sector?.objectiveAnchors?.extraction || [0,0,-7];
      if (source?.position) source = source.position;
      return Array.isArray(source)
        ? new Vec3(Number(source[0]) || 0, Number(source[1]) || 0, Number(source[2]) || 0)
        : new Vec3(Number(source?.x) || 0, Number(source?.y) || 0, Number(source?.z) || 0);
    }

    _beginExtraction() {
      if (this.extractionActive || this.modeId !== 'campaign' || this.wave !== 10) return false;
      this.waveActive = true;
      this.spawnQueue.length = 0;
      this.spawnsRemaining = 0;
      this.extractionActive = true;
      this.extractionProgress = 0;
      this.extractionZone = { type:'extraction', phase:'active', position:this._extractionPosition(), radius:3.6, progress:0, duration:this.extractionDuration };
      this.waveObjective = this.extractionZone;
      this.arena.setObjectiveZone?.(this.extractionZone);
      this.objectiveText = 'REJOIGNEZ LE SCEAU D’EXTRACTION';
      this.ui.announce('NEXUS DÉCAPITÉ', 'EXTRACTION OUVERTE', 'Tenez le sceau pendant trois secondes.', 3);
      this.ui.subtitle('Les survivants convergent. Ne quittez pas le sceau.', 3.2);
      this.arena.triggerGatePulse(2);
      return true;
    }

    _updateExtraction(dt) {
      const zone = this.extractionZone;
      if (!zone) return;
      const inside = this.player.position.distanceToXZ(zone.position) <= zone.radius;
      this.extractionProgress = inside
        ? Math.min(this.extractionDuration, this.extractionProgress + dt)
        : Math.max(0, this.extractionProgress - dt * 1.5);
      zone.progress = this.extractionProgress;
      this.objectiveText = inside
        ? 'EXTRACTION · ' + Math.ceil(Math.max(0, this.extractionDuration - this.extractionProgress)) + ' S'
        : 'REJOIGNEZ LE SCEAU D’EXTRACTION';
      if (this.extractionProgress < this.extractionDuration) return;
      this.extractionActive = false;
      this.waveActive = false;
      this.stats.wavesCleared++;
      this.score += 500 * this.wave;
      this.arena.setObjectiveZone?.(null);
      this._clearActiveRun();
      this.input.exitLock();
      this.audio.wave();
      this._finalizeRun('victory', true);
    }

    continueEndless() {
      if (this.state !== 'victory') return false;
      this.modeId = 'endless';
      this.runFinalized = false;
      this.state = 'playing';
      this.score = 0;
      this.runTime = 0;
      this.stats = this._newStats();
      this.killStreak = 0;
      this.killStreakTimer = 0;
      this.waveActive = false;
      this.pendingUpgrade = false;
      this.intermissionActive = false;
      this.waveCompleteTimer = 0;
      this.spawnQueue.length = 0;
      this.spawnsRemaining = 0;
      this.spawnTimer = 0;
      this.chainStormTimer = 0;
      this.waveObjective = null;
      this.extractionActive = false;
      this.extractionProgress = 0;
      this.extractionZone = null;
      // La victoire peut figer des survivants, projectiles et condamnations
      // encore actifs. Le mode sans fin repart du même survivant et du même
      // arsenal, mais jamais avec les menaces résiduelles de la campagne.
      this.enemies.length = 0;
      this.projectiles.length = 0;
      this.pickups.length = 0;
      this.tracers.length = 0;
      this.arcs.length = 0;
      this.rings.length = 0;
      this.hallucinations.length = 0;
      this.particles.clear();
      this.arena.reset();
      this.arena.setObjectiveZone?.(null);
      this.player.dead = false;
      this.player.velocity?.set(0,0,0);
      this.player.hitVelocity?.set(0,0,0);
      this.player.hookTimer = 0;
      this.player.slowTimer = 0;
      this.player.slowAmount = 0;
      this.currentModifier = D.WAVE_MODIFIERS[0];
      this.ui.enterGame();
      this._beginIntermission(12);
      this.input.requestLock();
      return true;
    }

    _snapshotActiveRun(nextWave = this.wave + 1) {
      const weaponStates = {};
      for (const [id, state] of Object.entries(this.weapons.states || {})) {
        if (!ownedId(D.WEAPONS, id)) continue;
        weaponStates[id] = { mag:state.mag, reserve:state.reserve, maxReserve:state.maxReserve };
      }
      return {
        version:1,
        savedAt:Date.now(),
        classId:this.lastClassId,
        difficultyId:this.lastDifficultyId,
        modeId:this.modeId,
        sectorId:this.sectorId,
        nextWave,
        score:this.score,
        runTime:this.runTime,
        stats:{ ...this.stats },
        player:{
          maxHealth:this.player.maxHealth, health:this.player.health,
          maxArmor:this.player.maxArmor, armor:this.player.armor,
          corruption:this.player.corruption, essence:this.player.essence,
          maxGrenades:this.player.maxGrenades, grenades:this.player.grenades,
          abilityCooldown:this.player.abilityCooldown,
          position:{ x:this.player.position.x, y:this.player.position.y, z:this.player.position.z },
          yaw:this.camera.yaw,
          unlockedWeapons:[...this.player.unlockedWeapons],
          modifiers:{ ...this.player.modifiers },
          upgradeStacks:{ ...this.player.upgradeStacks }
        },
        weapons:{ currentId:this.weapons.currentId, states:weaponStates }
      };
    }

    _checkpointActiveRun(nextWave = this.wave + 1) {
      if (this.runFinalized || this.state === 'dying' || this.state === 'victory' || this.state === 'gameover') return false;
      this.save.data.version = 2;
      this.save.data.activeRun = this._snapshotActiveRun(nextWave);
      const saved = this.save.save();
      if (!saved) this.ui.toast?.('SAUVEGARDE INDISPONIBLE', 'La reprise de tentative ne peut pas être garantie.', 'error');
      return saved;
    }

    _clearActiveRun() {
      if (!this.save?.data) return;
      if (this.save.data.activeRun === null) return;
      this.save.data.activeRun = null;
      this.save.save();
    }

    _validateActiveRun(raw) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== 1) return null;
      const number = (value, min, max, fallback = min) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
      };
      const classId = ownedId(D.CLASSES, raw.classId) ? raw.classId : null;
      const difficultyId = ownedId(D.DIFFICULTIES, raw.difficultyId) ? raw.difficultyId : null;
      if (!classId || !difficultyId) return null;
      const modeId = ownedId(RUN_MODES, raw.modeId) ? raw.modeId : 'campaign';
      const sectorIds = Object.keys(D.SECTORS || {});
      const sectorId = ownedId(D.SECTORS, raw.sectorId) ? raw.sectorId : sectorIds[0] || 'sanctum';
      const sectorBounds = D.SECTORS?.[sectorId]?.bounds;
      const playerRadius = .42;
      const positionBounds = {
        minX:Number.isFinite(Number(sectorBounds?.minX)) ? Number(sectorBounds.minX) + playerRadius : -24,
        maxX:Number.isFinite(Number(sectorBounds?.maxX)) ? Number(sectorBounds.maxX) - playerRadius : 24,
        minZ:Number.isFinite(Number(sectorBounds?.minZ)) ? Number(sectorBounds.minZ) + playerRadius : -24,
        maxZ:Number.isFinite(Number(sectorBounds?.maxZ)) ? Number(sectorBounds.maxZ) - playerRadius : 24
      };
      const player = raw.player && typeof raw.player === 'object' ? raw.player : {};
      const statsSource = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
      const statKeys = Object.keys(this._newStats());
      const stats = {};
      for (const key of statKeys) stats[key] = number(ownValue(statsSource, key), 0, 1e9, 0);
      const unlockedWeapons = Array.isArray(player.unlockedWeapons)
        ? [...new Set(player.unlockedWeapons.filter(id => ownedId(D.WEAPONS, id)))]
        : ['rifle','shotgun'];
      if (!unlockedWeapons.includes('rifle')) unlockedWeapons.unshift('rifle');
      if (!unlockedWeapons.includes('shotgun')) unlockedWeapons.push('shotgun');
      const modifiers = {};
      const modifierLimits = {
        damageMul:[.1,20], magazineMul:[.1,10], fireRateMul:[.1,10], reloadMul:[.1,5],
        spreadMul:[.1,5], recoilMul:[.1,5], speedMul:[.1,5], essenceMul:[.1,10],
        lifesteal:[0,.25], chainChance:[0,1], chainDamage:[0,5], ruptureChance:[0,1],
        ruptureDamage:[0,5000], headMul:[.1,10], corruptionResist:[0,.82],
        abilityRate:[.1,10], armorOnElite:[0,500], penetration:[0,10], lowHealthDamage:[0,5]
      };
      for (const [key, limits] of Object.entries(modifierLimits)) {
        if (player.modifiers && Object.hasOwn(player.modifiers, key)) modifiers[key] = number(player.modifiers[key], limits[0], limits[1], limits[0]);
      }
      modifiers.lastRite = Boolean(ownValue(player.modifiers, 'lastRite', false));
      const upgradeStacks = {};
      for (const upgrade of D.UPGRADES) {
        const value = Math.floor(number(ownValue(player.upgradeStacks, upgrade.id), 0, upgrade.max, 0));
        if (value > 0) upgradeStacks[upgrade.id] = value;
      }
      const states = {};
      const rawStates = raw.weapons?.states && typeof raw.weapons.states === 'object' ? raw.weapons.states : {};
      for (const id of unlockedWeapons) {
        const config = D.WEAPONS[id];
        const source = ownValue(rawStates, id, {}) || {};
        const maxReserve = number(source.maxReserve, 0, config.reserve * 10, config.reserve);
        states[id] = {
          mag:number(source.mag, 0, config.magazine * 10, config.magazine),
          reserve:number(source.reserve, 0, maxReserve, maxReserve),
          maxReserve
        };
      }
      const maxWave = modeId === 'campaign' ? 10 : 9999;
      return {
        version:1, classId, difficultyId, modeId, sectorId,
        nextWave:Math.floor(number(raw.nextWave, 1, maxWave, 1)),
        score:number(raw.score, 0, 1e12, 0),
        runTime:number(raw.runTime, 0, 1e9, 0),
        stats,
        player:{
          maxHealth:number(player.maxHealth, 1, 10000, 100),
          health:number(player.health, 1, 10000, 100),
          maxArmor:number(player.maxArmor, 0, 10000, 0),
          armor:number(player.armor, 0, 10000, 0),
          corruption:number(player.corruption, 0, 1, 0),
          essence:number(player.essence, 0, 1e9, 0),
          maxGrenades:Math.floor(number(player.maxGrenades, 0, 20, 2)),
          grenades:Math.floor(number(player.grenades, 0, 20, 2)),
          abilityCooldown:number(player.abilityCooldown, 0, 600, 0),
          position:{
            x:number(player.position?.x, positionBounds.minX, positionBounds.maxX, 0),
            y:number(player.position?.y, 0, 8, 0),
            z:number(player.position?.z, positionBounds.minZ, positionBounds.maxZ, 10)
          },
          yaw:number(player.yaw, -Math.PI * 4, Math.PI * 4, Math.PI),
          unlockedWeapons, modifiers, upgradeStacks
        },
        weapons:{
          currentId:ownedId(D.WEAPONS, raw.weapons?.currentId) && unlockedWeapons.includes(raw.weapons.currentId) ? raw.weapons.currentId : unlockedWeapons[0],
          states
        }
      };
    }

    resumeSavedRun() {
      const snapshot = this._validateActiveRun(this.save.data.activeRun);
      if (!snapshot) {
        this._clearActiveRun();
        this.ui.toast?.('REPRISE IMPOSSIBLE', 'Le checkpoint est absent ou invalide.', 'error');
        return false;
      }
      this.audio.init();
      this.lastClassId = snapshot.classId;
      this.lastDifficultyId = snapshot.difficultyId;
      this.modeId = snapshot.modeId;
      this.sectorId = snapshot.sectorId;
      this.difficulty = D.DIFFICULTIES[this.lastDifficultyId];
      this.currentModifier = D.WAVE_MODIFIERS[0];
      this.wave = snapshot.nextWave - 1;
      this.waveActive = false;
      this.pendingUpgrade = false;
      this.intermissionActive = false;
      this.extractionActive = false;
      this.extractionZone = null;
      this.killStreak = 0;
      this.killStreakTimer = 0;
      this.spawnTimer = 0;
      this.chainStormTimer = 0;
      this.waveCompleteTimer = 0;
      this.deathTimer = 0;
      this.score = snapshot.score;
      this.runTime = snapshot.runTime;
      this.runFinalized = false;
      this.stats = { ...snapshot.stats };
      this.spawnQueue.length = 0;
      this.spawnsRemaining = 0;
      this.enemies.length = 0;
      this.projectiles.length = 0;
      this.pickups.length = 0;
      this.tracers.length = 0;
      this.arcs.length = 0;
      this.rings.length = 0;
      this.hallucinations.length = 0;
      this.particles.clear();
      this.arena.reset();
      this.arena.setSector?.(this.sectorId);
      this.arena.setObjectiveZone?.(null);
      const metaLevels = safeMetaLevels(this.save.data.meta);
      this.player.reset(this.lastClassId, metaLevels);
      this.player.maxHealth = snapshot.player.maxHealth;
      this.player.health = clamp(snapshot.player.health, 1, this.player.maxHealth);
      this.player.maxArmor = snapshot.player.maxArmor;
      this.player.armor = clamp(snapshot.player.armor, 0, this.player.maxArmor);
      this.player.corruption = snapshot.player.corruption;
      this.player.essence = snapshot.player.essence;
      this.player.maxGrenades = snapshot.player.maxGrenades;
      this.player.grenades = clamp(snapshot.player.grenades, 0, this.player.maxGrenades);
      this.player.abilityCooldown = snapshot.player.abilityCooldown;
      this.player.position.set(snapshot.player.position.x, snapshot.player.position.y, snapshot.player.position.z);
      if (this.arena.repositionSafely) this.arena.repositionSafely(this.player, this.player.position, this.player.radius);
      else this.arena.resolvePosition(this.player.position, this.player.radius);
      this.camera.yaw = snapshot.player.yaw;
      this.player.unlockedWeapons = new Set(snapshot.player.unlockedWeapons);
      Object.assign(this.player.modifiers, snapshot.player.modifiers);
      this.player.upgradeStacks = { ...snapshot.player.upgradeStacks };
      this.weapons.reset(metaLevels);
      this.weapons.states = {};
      for (const id of snapshot.player.unlockedWeapons) {
        const state = this.weapons.ensureWeapon(id);
        const savedState = snapshot.weapons.states[id];
        state.maxReserve = Math.round(savedState.maxReserve);
        state.reserve = Math.round(clamp(savedState.reserve, 0, state.maxReserve));
        state.mag = Math.round(clamp(savedState.mag, 0, this.weapons.magazineSize(id)));
      }
      this.weapons.currentId = snapshot.weapons.currentId;
      this.state = 'playing';
      this.previousState = 'playing';
      this.ui.enterGame();
      this._beginIntermission(15);
      this.ui.announce('CHECKPOINT RESTAURÉ', 'OFFICE ' + String(snapshot.nextWave).padStart(2,'0'), this.difficulty.name, 2.6);
      this.input.requestLock();
      return true;
    }

    _buildWaveQueue() {
      const queue = [];
      const bossWave = this.wave % 5 === 0;
      let budget = Math.round((5 + this.wave * 3.35 + Math.pow(this.wave, 1.18)) * this.difficulty.count);
      if (bossWave) {
        queue.push({ type:this.wave % 10 === 0 ? 'archdeacon' : 'gatekeeper', elite:false, boss:true });
        budget = Math.max(5, Math.round(budget * .42));
      }
      const available = Object.values(D.ENEMIES).filter(enemy => !enemy.boss && enemy.unlockWave <= this.wave);
      let guard = 0;
      while (budget > 0 && guard++ < 250) {
        let candidates = available.filter(enemy => enemy.cost <= budget);
        if (!candidates.length) candidates = [D.ENEMIES.sutured];
        const chosen = weightedPick(candidates);
        const eliteChance = bossWave ? .045 : clamp(.018 + Math.max(0,this.wave-3) * .011, .018, .24);
        queue.push({ type:chosen.id, elite:chance(eliteChance), boss:false });
        budget -= chosen.cost;
      }
      const bossEntry = queue.shift();
      shuffle(queue);
      if (bossEntry) queue.unshift(bossEntry);
      if (this.waveObjective?.type === 'hunt') {
        const markedCount = Math.min(queue.length, this.waveObjective.target);
        for (let index = 0; index < markedCount; index++) queue[index].marked = true;
        this.waveObjective.target = markedCount;
        this.waveObjective.remaining = markedCount;
      }
      return queue;
    }

    _updateWaveDirector(dt) {
      if (this.waveActive) {
        this.spawnTimer -= dt;
        const cap = this._enemyCap();
        if (this.spawnQueue.length && this.spawnTimer <= 0 && this.enemies.length < cap) {
          const entry = this.spawnQueue.shift();
          this.spawnsRemaining = this.spawnQueue.length;
          this.spawnEnemy(entry.type, null, { elite:entry.elite, instant:false, marked:entry.marked });
          const pressure = clamp(this.enemies.length / cap, 0, 1);
          this.spawnTimer = (entry.boss ? 1.35 : randRange(.28,.72)) * lerp(.8,1.25,pressure);
        }
        if (this.currentModifier?.chainStorm) {
          this.chainStormTimer -= dt;
          if (this.chainStormTimer <= 0) {
            this.chainStormTimer = randRange(5, 8.5);
            const angle = Math.random() * Math.PI * 2;
            const distance = randRange(2.5, 8);
            const position = this.player.position.clone().add(new Vec3(Math.cos(angle)*distance,0,Math.sin(angle)*distance));
            this.arena.resolvePosition(position, 2.8);
            this.arena.scheduleChainStrike(position);
            if (chance(.32)) {
              const second = position.clone().add(new Vec3(randRange(-5,5),0,randRange(-5,5)));
              this.arena.resolvePosition(second,2.8);
              this.arena.scheduleChainStrike(second);
            }
          }
        }
        if (this._canCompleteWave()) this._completeWave();
      } else if (this.pendingUpgrade) {
        this.waveCompleteTimer -= dt;
        if (this.waveCompleteTimer <= 0) this._presentUpgrades();
      }
    }

    _completeWave() {
      if (!this.waveActive) return;
      this.waveActive = false;
      this.pendingUpgrade = true;
      this.waveCompleteTimer = 2.15;
      this.stats.wavesCleared++;
      const award = Math.round((45 + this.wave * 18) * this.difficulty.reward);
      this.player.essence += award;
      const healRate = this.currentModifier?.healingRate ?? 1;
      this.player.heal((8 + this.wave * .5) * healRate);
      this.player.addArmor(5 + Math.floor(this.wave / 3));
      this.player.corruption = Math.max(0, this.player.corruption - .12 * healRate);
      this.score += 500 * this.wave;
      this.objectiveText = 'LE NŒUD SE RECOMPOSE';
      this.audio.wave();
      this.arena.triggerGatePulse(.65);
      this.ui.announce('VAGUE PURGÉE', `+${award} ESSENCE`, 'Choisissez une greffe avant la prochaine ouverture.', 2.1);
    }

    _presentUpgrades() {
      if (!this.pendingUpgrade || this.state !== 'playing') return;
      this.pendingUpgrade = false;
      const available = D.UPGRADES.filter(upgrade => (this.player.upgradeStacks[upgrade.id] || 0) < upgrade.max);
      let options = shuffle([...available]).slice(0, 3);
      if (!options.length) {
        options = [{
          id:'terminal_supply', name:'Ravitaillement terminal', icon:'◆', rarity:'PROTOCOLE DE SURVIE',
          description:'Rend toute la santé, l’armure, les grenades et 300 essence.', max:999,
          effects:{ fullSupply:true }
        }];
      }
      while (options.length < 3) options.push(options[options.length - 1]);
      this.state = 'upgrade';
      this.input.exitLock();
      this.ui.showUpgrades(options, 24, upgrade => this.applyUpgrade(upgrade));
    }

    applyUpgrade(upgrade) {
      const effects = upgrade.effects || {};
      this.player.upgradeStacks[upgrade.id] = (this.player.upgradeStacks[upgrade.id] || 0) + 1;
      const mod = this.player.modifiers;
      if (effects.damageMul) mod.damageMul *= 1 + effects.damageMul;
      if (effects.magazineMul) mod.magazineMul *= 1 + effects.magazineMul;
      if (effects.fireRateMul) mod.fireRateMul *= 1 + effects.fireRateMul;
      if (effects.reloadMul) mod.reloadMul *= Math.max(.35, 1 + effects.reloadMul);
      if (effects.spreadMul) mod.spreadMul *= Math.max(.35, 1 + effects.spreadMul);
      if (effects.recoilMul) mod.recoilMul *= Math.max(.35, 1 + effects.recoilMul);
      if (effects.speedMul) mod.speedMul *= 1 + effects.speedMul;
      if (effects.essenceMul) mod.essenceMul *= 1 + effects.essenceMul;
      if (effects.lifesteal) mod.lifesteal += effects.lifesteal;
      if (effects.chainChance) mod.chainChance += effects.chainChance;
      if (effects.chainDamage) mod.chainDamage = Math.max(mod.chainDamage, effects.chainDamage);
      if (effects.ruptureChance) mod.ruptureChance += effects.ruptureChance;
      if (effects.ruptureDamage) mod.ruptureDamage += effects.ruptureDamage;
      if (effects.headMul) mod.headMul *= 1 + effects.headMul;
      if (effects.corruptionResist) mod.corruptionResist += effects.corruptionResist;
      if (effects.abilityRate) mod.abilityRate *= 1 + effects.abilityRate;
      if (effects.armorOnElite) mod.armorOnElite += effects.armorOnElite;
      if (effects.penetration) mod.penetration += effects.penetration;
      if (effects.lastRite) mod.lastRite = true;
      if (effects.lowHealthDamage) mod.lowHealthDamage += effects.lowHealthDamage;
      if (effects.maxHealth) { this.player.maxHealth += effects.maxHealth; }
      if (effects.heal) this.player.heal(effects.heal);
      if (effects.maxArmor) { this.player.maxArmor += effects.maxArmor; }
      if (effects.armor) this.player.addArmor(effects.armor);
      if (effects.maxGrenades) this.player.maxGrenades += effects.maxGrenades;
      if (effects.refillGrenades) this.player.grenades = this.player.maxGrenades;
      if (effects.fullSupply) {
        this.player.health = this.player.maxHealth;
        this.player.armor = this.player.maxArmor;
        this.player.grenades = this.player.maxGrenades;
        this.player.essence += 300;
        this.weapons.refillReserves(1);
      }
      if (effects.magazineMul || effects.refill) this.weapons.resizeMagazines(Boolean(effects.refill));
      this.ui.toast('GREFFE INTÉGRÉE', upgrade.name);
      this.ui.announce('MUTATION ACCEPTÉE', upgrade.name.toUpperCase(), upgrade.description, 2.1);
      this.state = 'playing';
      this.currentModifier = D.WAVE_MODIFIERS[0];
      this._beginIntermission();
      this.input.requestLock();
    }

    spawnEnemy(type, position = null, options = {}) {
      const config = D.ENEMIES[type];
      if (!config) return null;
      const isBoss = Boolean(config.boss);
      const spawnPosition = position ? position.clone() : this.arena.getSpawnPoint(this.player.position, isBoss ? 16 : 11);
      const enemy = new Enemy(this, type, spawnPosition, options);
      this.enemies.push(enemy);
      this.arena.triggerGatePulse(isBoss ? 1.7 : .28);
      this.spawnAbilityRing(spawnPosition, config.emissive, isBoss ? 5 : Math.max(1.1, config.radius*2.3), .75);
      this.particles.burst(new Vec3(spawnPosition.x,.35,spawnPosition.z), {
        count:isBoss ? 34 : 10,
        color:config.emissive,
        speedMin:.3,
        speedMax:isBoss ? 5 : 2,
        sizeMin:.04,
        sizeMax:isBoss ? .22 : .11,
        lifeMin:.2,
        lifeMax:1.1,
        gravity:-.2
      });
      return enemy;
    }

    spawnBossAdd(type, owner = null, options = {}) {
      const alive = this.enemies.filter(enemy => enemy.alive);
      const bossAdds = alive.filter(enemy => enemy.summonedByBoss).length;
      const phase = owner?.bossPhase || 1;
      const quota = Math.min(12, 5 + phase * 2);
      if (alive.length >= this._enemyCap() || bossAdds >= quota) return null;
      return this.spawnEnemy(type, null, { ...options, summonedByBoss:true, instant:false });
    }

    spawnEnemyProjectile(owner, type, target, speed, damage) {
      const origin = new Vec3(owner.position.x, owner.position.y + owner.height * .56, owner.position.z);
      const direction = target.clone().sub(origin);
      const distance = direction.length();
      direction.normalize();
      if (type !== 'hook') {
        const lead = clamp(distance / speed, 0, 1.1);
        direction.addScaled(this.player.velocity, lead * .035).normalize();
      }
      const colors = { hook:0xbec2c4, bone:0xe0c8b6, sentence:0xe23b49, bolt:0xc94b78, corruption:0xd659a0 };
      const corruption = type === 'corruption' ? .08 : type === 'sentence' ? .035 : type === 'bone' ? .018 : .012;
      this.projectiles.push(new Projectile(this, {
        type,
        owner,
        position:origin,
        velocity:direction.scale(speed),
        damage,
        radius:type === 'hook' ? .22 : .18,
        life:type === 'hook' ? 2.1 : 4,
        gravity:type === 'bone' ? 1.2 : 0,
        corruption,
        color:colors[type] || 0xd33a44
      }));
      this.audio.enemy(type === 'hook' ? 'hook' : 'cast', owner.position, this.player.position, this.camera.yaw);
    }

    damagePlayer(amount, sourcePosition = null, corruption = 0) {
      const before = this.player.health + this.player.armor;
      const dealt = this.player.damage(amount, sourcePosition, corruption);
      const after = this.player.health + this.player.armor;
      this.stats.damageTaken += Math.max(0, before - after);
      return dealt;
    }

    applyRadialDamage(position, radius, damage, options = {}) {
      let hits = 0;
      for (const enemy of [...this.enemies]) {
        if (!enemy.alive) continue;
        const distance = enemy.position.distanceTo(position);
        if (distance > radius + enemy.radius) continue;
        const t = clamp(distance / radius, 0, 1);
        const minimum = options.falloff ?? .35;
        let amount = damage * lerp(1, minimum, t);
        if (!options.ignoreCover) {
          const target = new Vec3(enemy.position.x, enemy.config.flying ? enemy.position.y : enemy.height * .55, enemy.position.z);
          const source = new Vec3(position.x, Math.max(.2, position.y), position.z);
          if (this.arena.lineBlocked(source, target)) amount *= options.coverMultiplier ?? .2;
        }
        if (amount <= .01) continue;
        const direction = enemy.position.clone().sub(position).normalize();
        const result = enemy.takeDamage(amount, {
          zone:'body',
          headMultiplier:1,
          direction,
          source:options.source || 'radial',
          stun:options.stun || 0
        });
        if (options.stun) enemy.stunTimer = Math.max(enemy.stunTimer, options.stun);
        if (options.slow) { enemy.slowTimer = Math.max(enemy.slowTimer, options.slow.duration || 1); enemy.slowAmount = Math.max(enemy.slowAmount, options.slow.amount || .35); }
        this.stats.damage += result.damage;
        hits++;
      }
      return hits;
    }

    explode(position, radius, damage, options = {}) {
      if (options.playerOwned !== false) this.applyRadialDamage(position, radius, damage, { source:options.source || 'explosion', falloff:.28, stun:.45 });
      if (!options.playerOwned) {
        const distance = this.player.position.distanceTo(position);
        if (distance < radius) this.damagePlayer(damage * lerp(1,.25,distance/radius), position, .02);
      }
      this.audio.explosion(position, this.player.position, this.camera.yaw, clamp(radius / 7, .65, 1.35));
      this.player.shake(clamp(radius*.035,.12,.36), .32);
      this.spawnAbilityRing(position, options.color || 0xf06b35, radius, .55, 'explosion');
      this.particles.burst(position, {
        count:this.settings.reducedFlashes ? 28 : 48,
        color:options.color || 0xf07838,
        speedMin:1.2,
        speedMax:8.5,
        sizeMin:.07,
        sizeMax:.32,
        lifeMin:.22,
        lifeMax:1.1,
        gravity:4.5,
        floorBounce:.12
      });
    }

    killEnemy(enemy, hit = {}) {
      const close = enemy.position.distanceToXZ(this.player.position) < 4.5;
      const multiplier = 1 + Math.min(2.5, this.killStreak * .035);
      const reward = Math.round(enemy.config.reward * this.difficulty.reward * this.player.modifiers.essenceMul * (enemy.elite ? 1.55 : 1));
      const points = enemy.config.score * multiplier * (enemy.elite ? 1.35 : 1);
      this.player.essence += reward;
      this.score += points;
      this.killStreak++;
      this.killStreakTimer = 3.5;
      this.stats.kills++;
      this.player.killsSinceDamage++;
      if (enemy.elite) {
        this.stats.eliteKills++;
        this.player.addArmor(this.player.modifiers.armorOnElite);
      }
      if (enemy.boss) {
        this.stats.bossKills++;
        this.player.essence += 500;
        this.ui.announce('SEUIL PROFANÉ', `${enemy.config.name.toUpperCase()} EST TOMBÉ`, '+500 essence · le portail vacille', 3);
        this.arena.triggerGatePulse(2);
        this.spawnAbilityRing(enemy.position, 0xf23645, 14, 1.05);
      }
      if (enemy.objectiveMarked && this.waveObjective?.type === 'hunt' && this.waveObjective.phase === 'active') {
        this.waveObjective.remaining = Math.max(0, this.waveObjective.remaining - 1);
        this._refreshObjectiveText();
      }
      if (this.player.classId === 'executioner' && close) this.player.addArmor(3);
      const codexKills = this.save.data.codex.enemyKills;
      codexKills[enemy.type] = (codexKills[enemy.type] || 0) + 1;
      this.arena.addBloodDecal(enemy.position, enemy.boss ? 4.8 : enemy.radius * 2.2, enemy.elite ? 0x713413 : 0x4d0710);
      const burstCount = enemy.boss ? 85 : enemy.elite ? 34 : 18;
      this.particles.burst(new Vec3(enemy.position.x, enemy.config.flying ? enemy.position.y : enemy.height*.55, enemy.position.z), {
        count:this.settings.gore ? burstCount : Math.ceil(burstCount*.35),
        color:enemy.elite ? 0xc66d2f : 0xb32d38,
        speedMin:.5,
        speedMax:enemy.boss ? 8 : 4.8,
        sizeMin:.05,
        sizeMax:enemy.boss ? .36 : .19,
        lifeMin:.25,
        lifeMax:1.25,
        gravity:6,
        floorBounce:.16
      });
      if (chance(enemy.dropChance)) this._dropPickup(enemy);
      if (chance(this.player.modifiers.ruptureChance) || chance(this.currentModifier?.volatileDeaths || 0)) {
        this.explode(enemy.position, enemy.boss ? 7 : 4.2, this.player.modifiers.ruptureDamage || 62, { playerOwned:true, source:'rupture', color:0x9a2937 });
      }
      this.audio.enemy('death', enemy.position, this.player.position, this.camera.yaw);
      if (enemy.boss && this.modeId === 'campaign' && this.wave === 10) this._beginExtraction();
    }

    _dropPickup(enemy) {
      let type = 'essence';
      const healthRatio = this.player.health / this.player.maxHealth;
      const armorRatio = this.player.armor / Math.max(1,this.player.maxArmor);
      const roll = Math.random();
      if (healthRatio < .55 && roll < .42) type = 'health';
      else if (armorRatio < .5 && roll < .66) type = 'armor';
      else if (roll < .86) type = 'ammo';
      const amount = type === 'health' ? 26 : type === 'armor' ? 24 : type === 'essence' ? (enemy.elite ? 90 : 38) : 0;
      this.pickups.push(new Pickup(this, type, enemy.position, amount));
    }

    activateShockGrid(position) {
      let affected = 0;
      for (const enemy of this.enemies) {
        if (!enemy.alive) continue;
        const distance = enemy.position.distanceToXZ(position);
        if (distance > 15) continue;
        const damage = lerp(170, 65, clamp(distance/15,0,1));
        const result = enemy.takeDamage(damage, { zone:'body', headMultiplier:1, source:'shock', stun:2.4 });
        enemy.stunTimer = Math.max(enemy.stunTimer, 2.4);
        this.stats.damage += result.damage;
        this.spawnArc(position, enemy.position, 0x65e9ee);
        affected++;
      }
      this.spawnAbilityRing(position, 0x58dce5, 15, .8, 'ward');
      this.audio.ability();
      this.ui.toast('RÉSEAU SURCHARGÉ', `${affected} signature${affected>1?'s':''} frappée${affected>1?'s':''}`);
    }

    onChainImpact(position, radius) {
      if (this.player.position.distanceToXZ(position) < radius + this.player.radius) {
        this.damagePlayer(38 * this.difficulty.enemyDamage, position, .045);
        this.player.hitVelocity.y += 2.5;
      }
      for (const enemy of this.enemies) {
        if (enemy.position.distanceToXZ(position) < radius) {
          enemy.stunTimer = Math.max(enemy.stunTimer, .75);
          enemy.takeDamage(55, { zone:'body', headMultiplier:1, source:'hazard' });
        }
      }
      this.explode(new Vec3(position.x,.2,position.z), radius, 0, { playerOwned:false, source:'chain', color:0xc73543 });
    }

    bossSlamRadius(phase = 1) {
      return 7.5 + phase * 1.2;
    }

    telegraphBossSlam(enemy) {
      if (!enemy?.alive || enemy.type !== 'gatekeeper' || enemy.state !== 'slamWindup') return false;
      this.audio.enemy('bell', enemy.position, this.player.position, this.camera.yaw);
      this.ui.subtitle?.('GARDIEN — Onde de choc : sortez du cercle.', 1.3);
      return true;
    }

    bossSlam(position, phase = 1) {
      const radius = this.bossSlamRadius(phase);
      const distance = this.player.position.distanceToXZ(position);
      if (distance < radius) {
        this.damagePlayer((24 + phase*7) * lerp(1,.35,distance/radius), position, .025 * phase);
        const knock = this.player.position.clone().sub(position).normalizeXZ();
        this.player.hitVelocity.addScaled(knock, 8 + phase*2);
      }
      this.spawnAbilityRing(position, 0xef3847, radius, .75);
      this.particles.burst(new Vec3(position.x,.2,position.z), { count:35+phase*9, color:0xb82b38, speedMin:1, speedMax:6, sizeMin:.06, sizeMax:.22, lifeMin:.2, lifeMax:.85, gravity:5 });
      this.audio.explosion(position, this.player.position, this.camera.yaw, clamp(radius / 7, .65, 1.35));
      for (let i=0; i<phase; i++) {
        const angle = Math.random()*Math.PI*2;
        const p = this.player.position.clone().add(new Vec3(Math.cos(angle)*randRange(2,5),0,Math.sin(angle)*randRange(2,5)));
        this.arena.resolvePosition(p,2.6);
        this.arena.scheduleChainStrike(p);
      }
    }

    spawnTracer(a, b, color = 0xff6655, width = .035) {
      this.tracers.push({ a:a.clone(), b:b.clone(), color, width, life:.105, maxLife:.105, matrix:mat4() });
      if (this.tracers.length > 80) this.tracers.shift();
    }

    spawnArc(a, b, color = 0x69e3e8) {
      const points = [a.clone()];
      const segments = 6;
      for (let i=1; i<segments; i++) {
        const t = i/segments;
        points.push(new Vec3(
          lerp(a.x,b.x,t)+randRange(-.22,.22),
          lerp(a.y,b.y,t)+randRange(-.18,.32),
          lerp(a.z,b.z,t)+randRange(-.22,.22)
        ));
      }
      points.push(b.clone());
      this.arcs.push({ points, color, life:.24, maxLife:.24 });
      if (this.arcs.length > 24) this.arcs.shift();
    }

    spawnAbilityRing(position, color = 0xe43b49, radius = 6, duration = .65, style = 'ritual') {
      this.rings.push({
        position:position.clone(),
        color,
        radius,
        life:duration,
        maxLife:duration,
        style,
        transform:new Transform(),
        material:new Material({ color, emissive:color, pattern:3, metallic:0, alpha:.72, additive:true, depthWrite:false, pulse:1.2 })
      });
      if (this.rings.length > 32) this.rings.shift();
    }

    spawnHallucination() {
      if (this.hallucinations.length >= 4 || this.state !== 'playing') return;
      const angle = Math.random()*Math.PI*2;
      const distance = randRange(5,10);
      const position = this.player.position.clone().add(new Vec3(Math.cos(angle)*distance,0,Math.sin(angle)*distance));
      this.arena.resolvePosition(position,.8);
      this.hallucinations.push({ position, life:randRange(1.3,2.7), maxLife:2.7, phase:Math.random()*Math.PI*2, transform:new Transform() });
      this.audio.enemy('whisper', position, this.player.position, this.camera.yaw);
    }

    _updateEffects(dt) {
      for (const tracer of this.tracers) tracer.life -= dt;
      for (const arc of this.arcs) arc.life -= dt;
      for (const ring of this.rings) ring.life -= dt;
      for (const ghost of this.hallucinations) ghost.life -= dt;
      this.tracers = this.tracers.filter(item => item.life > 0);
      this.arcs = this.arcs.filter(item => item.life > 0);
      this.rings = this.rings.filter(item => item.life > 0);
      this.hallucinations = this.hallucinations.filter(item => item.life > 0);
    }

    render() {
      this._configureAtmosphereAndLights();
      this.renderer.begin(this.camera, this.time);
      this.arena.draw(this.time);

      if (this.state === 'menu') {
        for (const enemy of this.menuEntities) enemy.draw(this.renderer, this.time);
      } else {
        for (const pickup of this.pickups) pickup.draw(this.renderer, this.time);
        for (const enemy of this.enemies) enemy.draw(this.renderer, this.time);
        for (const projectile of this.projectiles) projectile.draw(this.renderer, this.time);
      }

      this._drawEffects();
      this._drawBossTelegraphs();
      this.particles.draw();
      if (this.state === 'playing' && !this.player.dead) {
        this.renderer.clearDepth();
        this.weapons.drawViewmodel(this.renderer, this.time);
      }
    }

    _configureAtmosphereAndLights() {
      const corruption = this.player?.corruption || 0;
      const blackout = this.currentModifier?.id === 'blackout';
      const boss = this.enemies.find(enemy => enemy.alive && enemy.boss);
      const clear = colorHex(blackout ? 0x010104 : corruption > .75 ? 0x0d0309 : 0x070709);
      const fog = colorHex(blackout ? 0x020207 : corruption > .55 ? 0x1b0712 : 0x11080b);
      const ambient = colorHex(blackout ? 0x08080d : 0x21161a);
      this.renderer.setAtmosphere({
        clearColor:clear,
        fogColor:fog,
        fogNear:this.currentModifier?.fogNear ?? (this.state === 'menu' ? 10 : 18),
        fogFar:this.currentModifier?.fogFar ?? (this.state === 'menu' ? 62 : 76),
        ambient
      });
      const cameraLight = this.lightA.copy(this.camera.position).addScaled(this.camera.forward, 1.5);
      this.renderer.setLight(0, cameraLight, blackout ? 0xb7d0d8 : 0xffe4d2, blackout ? 7.5 : 5.2);
      // Three authored sector lights share the existing four-light shader budget
      // with the player light. The third becomes a readable boss accent in combat.
      const lights = (this.arena.sector || D.SECTORS[this.sectorId] || D.SECTORS.sanctum).lighting;
      this.lightB.set(...lights[0].position);
      this.renderer.setLight(1, this.lightB, lights[0].color, lights[0].power + this.arena.gatePulse*5);
      this.lightC.set(...lights[1].position);
      this.renderer.setLight(2, this.lightC, lights[1].color, lights[1].power);
      if (boss) this.lightD.set(boss.position.x,boss.position.y+2.4,boss.position.z);
      else this.lightD.set(...lights[2].position);
      this.renderer.setLight(3, this.lightD, boss ? 0xff263d : lights[2].color, boss ? 8.5 : lights[2].power);
    }

    _drawBossTelegraphs() {
      if (this.state !== 'playing' && this.state !== 'paused' && this.state !== 'input-paused') return;
      for (const enemy of this.enemies) {
        if (!enemy.alive || enemy.type !== 'gatekeeper' || enemy.state !== 'slamWindup') continue;
        const radius = this.bossSlamRadius(enemy.bossPhase);
        const transform = this.bossWarningTransform;
        transform.position.set(enemy.position.x, .065, enemy.position.z);
        transform.rotation.set(0, 0, 0);
        // Torus outer radius is 0.5: this scale matches the damaging radius,
        // rather than showing a smaller decorative ring. No flashing or spin.
        transform.scale.set(radius*2, .16, radius*2);
        transform.updateMatrix();
        this.renderer.draw(this.renderer.meshes.torusLow, transform.matrix, this.effectMaterials.bossWarning);
      }
    }

    _drawEffects() {
      for (const tracer of this.tracers) {
        const alpha = clamp(tracer.life / tracer.maxLife,0,1);
        const material = tracer.color === 0x65e4e8 ? this.effectMaterials.tracerCyan : this.effectMaterials.tracerRed;
        material.alpha = .82 * alpha;
        modelMatrixBetween(tracer.matrix, tracer.a, tracer.b, tracer.width * (0.65 + alpha*.35));
        this.renderer.draw(this.renderer.meshes.cylinder6, tracer.matrix, material);
      }
      for (const arc of this.arcs) {
        const alpha = clamp(arc.life / arc.maxLife,0,1);
        this.effectMaterials.arc.alpha = .9 * alpha;
        for (let i=0; i<arc.points.length-1; i++) {
          modelMatrixBetween(this.effectMatrix, arc.points[i], arc.points[i+1], .024 + alpha*.012);
          this.renderer.draw(this.renderer.meshes.cylinder6, this.effectMatrix, this.effectMaterials.arc);
        }
      }
      for (const ring of this.rings) {
        const progress = 1 - clamp(ring.life / ring.maxLife,0,1);
        const eased = 1 - Math.pow(1-progress,3);
        const scale = Math.max(.2, ring.radius * (0.12 + eased*.88));
        ring.material.alpha = (1-progress) * .72;
        ring.transform.position.set(ring.position.x, .06 + (ring.style==='explosion'?progress*.35:0), ring.position.z);
        ring.transform.rotation.set(0, this.time*.8, 0);
        ring.transform.scale.set(scale,scale,scale);
        ring.transform.updateMatrix();
        this.renderer.draw(this.renderer.meshes.torus, ring.transform.matrix, ring.material);
      }
      for (const ghost of this.hallucinations) {
        const alpha = Math.sin(clamp(ghost.life/ghost.maxLife,0,1)*Math.PI) * .32;
        this.effectMaterials.ghost.alpha = alpha;
        ghost.transform.position.set(ghost.position.x, 1.25 + Math.sin(this.time*2+ghost.phase)*.18, ghost.position.z);
        ghost.transform.rotation.set(0, Math.atan2(this.player.position.x-ghost.position.x, this.player.position.z-ghost.position.z), 0);
        ghost.transform.scale.set(.75,2.35,.48);
        ghost.transform.updateMatrix();
        this.renderer.draw(this.renderer.meshes.sphere8, ghost.transform.matrix, this.effectMaterials.ghost);
      }
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
  }

  NT.NexusGame = NexusGame;
})();
