(function () {
  'use strict';

  const NT = window.NT = window.NT || {};
  const M = NT.Math;
  const E = NT.Engine;
  const D = NT.Data;
  const {
    Vec3, clamp, lerp, damp, deltaAngle, randRange, chance, pick, mat4, mat4Multiply,
    mat4FromTransform, raySphere, colorHex
  } = M;
  const { Transform, Material, modelMatrixBetween } = E;

  class Player {
    constructor(game) {
      this.game = game;
      this.camera = game.camera;
      this.position = new Vec3(0, 0, 10);
      this.velocity = new Vec3();
      this.radius = .42;
      this.eyeHeight = 1.72;
      this.grounded = true;
      this.dead = false;
      this.classId = 'bulwark';
      this.classData = D.CLASSES.bulwark;
      this.maxHealth = 100;
      this.health = 100;
      this.maxArmor = 50;
      this.armor = 50;
      this.corruption = 0;
      this.essence = 0;
      this.maxGrenades = 2;
      this.grenades = 2;
      this.unlockedWeapons = new Set(['rifle','shotgun']);
      this.abilityCooldown = 0;
      this.abilityActive = 0;
      this.invulnerable = 0;
      this.slowTimer = 0;
      this.slowAmount = 0;
      this.hookTimer = 0;
      this.hookSource = new Vec3();
      this.hitVelocity = new Vec3();
      this.bobTime = 0;
      this.bobAmount = 0;
      this.landKick = 0;
      this.recoilPitch = 0;
      this.recoilYaw = 0;
      this.cameraShake = 0;
      this.cameraShakeTime = 0;
      this.lastDamageTime = -99;
      this.lastRiteUsedWave = -1;
      this.killsSinceDamage = 0;
      this.modifiers = this._baseModifiers();
      this.upgradeStacks = {};
    }

    _baseModifiers() {
      return {
        damageMul:1, magazineMul:1, fireRateMul:1, reloadMul:1, spreadMul:1, recoilMul:1,
        speedMul:1, essenceMul:1, lifesteal:0, chainChance:0, chainDamage:.38,
        ruptureChance:0, ruptureDamage:62, headMul:1, corruptionResist:0,
        abilityRate:1, armorOnElite:0, penetration:0, lastRite:false, lowHealthDamage:0
      };
    }

    reset(classId, metaLevels = {}) {
      this.classId = classId;
      this.classData = D.CLASSES[classId] || D.CLASSES.bulwark;
      const vital = metaLevels.vitalSeal || 0;
      const reinforced = metaLevels.reinforced || 0;
      const scavenger = metaLevels.scavenger || 0;
      const ward = metaLevels.ward || 0;
      const ordinance = metaLevels.ordinance || 0;
      this.maxHealth = Math.round(this.classData.health * (1 + vital * .05));
      this.health = this.maxHealth;
      this.maxArmor = this.classData.armor + reinforced * 8;
      this.armor = this.maxArmor;
      this.corruption = 0;
      this.essence = scavenger * 35;
      this.maxGrenades = 2;
      this.grenades = 2;
      this.unlockedWeapons = new Set(['rifle','shotgun']);
      this.position.set(0,0,10);
      this.velocity.set(0,0,0);
      this.hitVelocity.set(0,0,0);
      this.grounded = true;
      this.dead = false;
      this.abilityCooldown = 0;
      this.abilityActive = 0;
      this.invulnerable = 0;
      this.slowTimer = 0;
      this.hookTimer = 0;
      this.slowAmount = 0;
      this.camera.yaw = Math.PI;
      this.camera.pitch = 0;
      this.camera.position.set(0,this.eyeHeight,10);
      this.camera.shake.set(0,0,0);
      this.recoilPitch = 0;
      this.recoilYaw = 0;
      this.cameraShake = 0;
      this.lastRiteUsedWave = -1;
      this.modifiers = this._baseModifiers();
      this.modifiers.damageMul *= 1 + ordinance * .03;
      this.modifiers.corruptionResist += ward * .04;
      this.upgradeStacks = {};
    }

    update(dt) {
      if (this.dead) return;
      const game = this.game, input = game.input, settings = game.settings;
      this.invulnerable = Math.max(0, this.invulnerable - dt);
      this.slowTimer = Math.max(0, this.slowTimer - dt);
      if (this.slowTimer <= 0) this.slowAmount = 0;
      this.hookTimer = Math.max(0, this.hookTimer - dt);
      this.abilityActive = Math.max(0, this.abilityActive - dt);
      const abilityRate = this.modifiers.abilityRate * (game.currentModifier?.abilityRate ?? 1);
      this.abilityCooldown = Math.max(0, this.abilityCooldown - dt * abilityRate);

      const sensitivity = settings.sensitivity * .00185;
      const invert = settings.invertY ? -1 : 1;
      this.camera.yaw -= input.mouseDX * sensitivity;
      this.camera.pitch -= input.mouseDY * sensitivity * invert;
      this.camera.pitch = clamp(this.camera.pitch, -1.43, 1.43);

      const forwardInput = (input.keyAny('KeyW','KeyZ','ArrowUp') ? 1 : 0) - (input.keyAny('KeyS','ArrowDown') ? 1 : 0);
      const rightInput = (input.keyAny('KeyD','ArrowRight') ? 1 : 0) - (input.keyAny('KeyA','KeyQ','ArrowLeft') ? 1 : 0);
      const moving = forwardInput !== 0 || rightInput !== 0;
      const sprinting = input.keyAny('ShiftLeft','ShiftRight') && forwardInput > 0 && this.slowTimer <= 0;
      const baseSpeed = this.classData.speed * this.modifiers.speedMul * (sprinting ? 1.48 : 1);
      const slow = this.slowTimer > 0 ? (1 - this.slowAmount) : 1;
      const speed = baseSpeed * slow;

      const flatForward = _vA.set(Math.sin(this.camera.yaw),0,-Math.cos(this.camera.yaw));
      const flatRight = _vB.set(Math.cos(this.camera.yaw),0,Math.sin(this.camera.yaw));
      const desired = _vC.set(0,0,0).addScaled(flatForward,forwardInput).addScaled(flatRight,rightInput);
      if (desired.lengthSq() > 1) desired.normalizeXZ();
      desired.scale(speed);
      const acceleration = this.grounded ? 17 : 7;
      this.velocity.x = damp(this.velocity.x, desired.x, acceleration, dt);
      this.velocity.z = damp(this.velocity.z, desired.z, acceleration, dt);

      if (this.hookTimer > 0) {
        const pull = _vD.copy(this.hookSource).sub(this.position); pull.y = 0;
        if (pull.lengthSq() > .1) this.velocity.addScaled(pull.normalizeXZ(), 12 * dt);
      }
      this.velocity.addScaled(this.hitVelocity, dt);
      this.hitVelocity.scale(Math.exp(-8 * dt));

      if (input.consume('Space') && this.grounded) {
        this.velocity.y = 6.7;
        this.grounded = false;
        game.audio._tone?.({frequency:92,endFrequency:68,duration:.08,gain:.025,type:'sine'});
      }
      this.velocity.y -= 17.5 * dt;
      const wasGrounded = this.grounded;
      this.position.addScaled(this.velocity, dt);
      if (this.position.y <= 0) {
        if (!wasGrounded && this.velocity.y < -5) { this.landKick = Math.min(.12, -this.velocity.y * .008); this.shake(.08,.16); }
        this.position.y = 0; this.velocity.y = 0; this.grounded = true;
      } else this.grounded = false;
      game.arena.resolvePosition(this.position, this.radius);

      const horizontalSpeed = Math.hypot(this.velocity.x,this.velocity.z);
      if (this.grounded && moving) this.bobTime += dt * (sprinting ? 12.5 : 8.5) * clamp(horizontalSpeed / 4.5,.25,1.5);
      this.bobAmount = damp(this.bobAmount, this.grounded && moving && settings.headBob && !settings.reducedMotion ? (sprinting ? 1 : .68) : 0, 10, dt);
      this.landKick = damp(this.landKick,0,9,dt);
      this.recoilPitch = damp(this.recoilPitch,0,15,dt);
      this.recoilYaw = damp(this.recoilYaw,0,18,dt);
      this.cameraShakeTime = Math.max(0,this.cameraShakeTime-dt);
      this.cameraShake = damp(this.cameraShake,0,10,dt);
      const shakeScale = (settings.reducedFlashes ? .45 : 1)
        * clamp(Number(settings.shakeIntensity ?? 1), 0, 1)
        * (settings.reducedMotion ? .35 : 1);
      const randomShake = this.cameraShakeTime > 0 ? this.cameraShake * shakeScale : 0;
      const bobX = Math.sin(this.bobTime) * .035 * this.bobAmount;
      const bobY = Math.abs(Math.cos(this.bobTime)) * .048 * this.bobAmount;
      this.camera.position.set(this.position.x, this.position.y + this.eyeHeight + bobY - this.landKick, this.position.z);
      this.camera.shake.set(
        bobX + randRange(-randomShake,randomShake),
        randRange(-randomShake,randomShake),
        randRange(-randomShake*.4,randomShake*.4)
      );
      this.camera.pitch += this.recoilPitch * dt;
      this.camera.yaw += this.recoilYaw * dt;

      if (input.consume('KeyC')) this.useAbility();
      if (this.corruption > .72 && chance(dt * (this.corruption-.68)*.45)) game.spawnHallucination();
      if (!game.waveActive) this.corruption = Math.max(0,this.corruption-dt*.012);
    }

    useAbility() {
      if (this.abilityCooldown > 0 || this.dead || !this.game.waveActive) {
        this.game.audio.ui('error');
        return false;
      }
      this.game.audio.ability();
      if (this.classId === 'bulwark') {
        this.abilityActive = this.classData.abilityDuration;
        this.addArmor(28);
        this.game.ui.toast('ÉGIDE DÉPLOYÉE','Réduction massive des dégâts');
        this.game.spawnAbilityRing(this.position,0x4fd2dc,6);
      } else if (this.classId === 'executioner') {
        this.abilityActive = this.classData.abilityDuration;
        this.game.weapons.cancelReload();
        this.game.ui.toast('FRÉNÉSIE BALISTIQUE','Cadence, dégâts et rechargement amplifiés');
        this.game.spawnAbilityRing(this.position,0xe34b43,7);
      } else {
        this.abilityActive = this.classData.abilityDuration;
        const power = 155 + this.corruption * 220;
        this.game.applyRadialDamage(this.position,10,power,{source:'ability',stun:2.2,falloff:.48,ignoreCover:true});
        this.corruption = Math.max(0,this.corruption-.42);
        this.heal(18);
        this.game.spawnAbilityRing(this.position,0xc95891,10);
        this.game.ui.toast('NOVA D’EXORCISME',`${Math.round(power)} puissance rituelle`);
      }
      this.abilityCooldown = this.classData.abilityCooldown;
      return true;
    }

    damage(amount, sourcePosition = null, corruption = 0) {
      if (this.dead || this.invulnerable > 0) return 0;
      let damage = Math.max(0,amount);
      if (this.classId === 'bulwark' && this.health / this.maxHealth < .35) damage *= .82;
      if (this.classId === 'bulwark' && this.abilityActive > 0) damage *= .25;
      const original = damage;
      if (this.armor > 0) {
        const absorbed = Math.min(this.armor, damage * .72);
        this.armor -= absorbed;
        damage -= absorbed;
      }
      if (damage > 0) this.health -= damage;
      this.addCorruption(corruption);
      this.invulnerable = .09;
      this.lastDamageTime = this.game.time;
      this.killsSinceDamage = 0;
      this.shake(clamp(.08+original*.004,.1,.34), .19);
      this.game.audio.hurt(original);
      this.game.ui.damageFlash(original, sourcePosition);
      if (sourcePosition) {
        const knock = _vA.copy(this.position).sub(sourcePosition); knock.y=0;
        if (knock.lengthSq()>.01) this.hitVelocity.addScaled(knock.normalizeXZ(),Math.min(5,original*.09));
      }
      if (this.health <= 0) {
        if (this.modifiers.lastRite && this.lastRiteUsedWave !== this.game.wave) {
          this.lastRiteUsedWave = this.game.wave;
          this.health = 1;
          this.invulnerable = 2.2;
          this.game.ui.announce('GREFFE UNIQUE','DERNIER RITE','La mort a été différée.',2.2);
          this.game.spawnAbilityRing(this.position,0xf3d6b4,7);
        } else {
          this.health = 0;
          this.dead = true;
          this.game.onPlayerDeath();
        }
      }
      return original;
    }

    addCorruption(amount) {
      const resist = clamp(this.classData.corruptionResist + this.modifiers.corruptionResist,0,.82);
      this.corruption = clamp(this.corruption + amount * (1-resist) * (this.game.difficulty.corruption||1) * (this.game.currentModifier?.corruption||1),0,1);
    }
    heal(amount) { const before=this.health; this.health=clamp(this.health+amount,0,this.maxHealth); return this.health-before; }
    addArmor(amount) { const before=this.armor; this.armor=clamp(this.armor+amount,0,this.maxArmor); return this.armor-before; }
    slow(amount,duration) {
      if (this.slowTimer <= 0) this.slowAmount = 0;
      this.slowAmount=Math.max(this.slowAmount,amount);
      this.slowTimer=Math.max(this.slowTimer,duration);
    }
    hook(source,duration=.8) { this.hookSource.copy(source); this.hookTimer=Math.max(this.hookTimer,duration); this.slow(.35,duration); }
    shake(amount,duration=.12) { this.cameraShake=Math.max(this.cameraShake,amount); this.cameraShakeTime=Math.max(this.cameraShakeTime,duration); }
    addRecoil(pitch,yaw=0) { this.recoilPitch += pitch; this.recoilYaw += yaw; }

    damageMultiplier() {
      let value = this.classData.damage * this.modifiers.damageMul;
      if (this.classId==='executioner' && this.abilityActive>0) value*=1.32;
      if (this.health/this.maxHealth<.35) value*=1+this.modifiers.lowHealthDamage;
      return value;
    }
    fireRateMultiplier() { return this.modifiers.fireRateMul * (this.classId==='executioner'&&this.abilityActive>0?1.48:1); }
    reloadMultiplier() { return this.modifiers.reloadMul * (this.classId === 'executioner' && this.abilityActive > 0 ? .55 : 1); }
    speedMultiplier() { return this.modifiers.speedMul; }
    abilityProgress() { return this.abilityCooldown<=0?1:1-clamp(this.abilityCooldown/this.classData.abilityCooldown,0,1); }
  }

  function part(mesh, material, position, rotation, scale, tag = '', phase = 0) {
    return {
      mesh, material,
      basePosition:new Vec3(...position), position:new Vec3(...position),
      baseRotation:new Vec3(...rotation), rotation:new Vec3(...rotation),
      baseScale:new Vec3(...scale), scale:new Vec3(...scale), tag, phase,
      localMatrix:mat4(), worldMatrix:mat4()
    };
  }

  function enemyMaterials(config, elite = false, boss = false) {
    const baseColor = elite ? 0x704129 : config.color;
    return {
      flesh:new Material({color:baseColor,emissive:elite?0xd27735:config.emissive,pattern:config.pattern,metallic:.08,pulse:elite ? .5 : .15}),
      fleshDark:new Material({color:0x3e171b,emissive:elite?0x8d3d18:0x2d0008,pattern:2,metallic:.04}),
      iron:new Material({color:boss?0x2c2c30:0x3d4144,emissive:elite?0xb55b24:0x25030a,pattern:1,metallic:.9,pulse:elite ? .35 : 0}),
      ironLight:new Material({color:0x6a7275,emissive:elite?0xca7634:0x1b080b,pattern:1,metallic:.95}),
      bone:new Material({color:0xd0b8a8,emissive:0x1d0806,pattern:0,metallic:.1}),
      ritual:new Material({color:elite?0x753813:0x5c1019,emissive:elite?0xf2943e:0xd31f35,pattern:3,metallic:.4,pulse:1}),
      veil:new Material({color:0x5d3153,emissive:0xc84f98,pattern:4,metallic:0,alpha:.56,doubleSided:true,additive:true,depthWrite:false,pulse:1}),
      flash:new Material({color:0xffffff,emissive:0xffffff,pattern:0,metallic:.1,pulse:1.4})
    };
  }

  function highContrastEnemyMaterials(source,elite=false,boss=false){
    // Palette ciblée, stable et mise en cache : seuls les ennemis changent,
    // sans contour en double passe, lumière ni géométrie supplémentaires.
    const colors={
      flesh:elite?0xe8c38e:boss?0xd9cbdc:0xd9ddd2, fleshDark:0x9eb6b8,
      iron:0x9ebec9, ironLight:0xc0d5df, bone:0xf0d898,
      ritual:elite?0xf3bb65:boss?0xeda0b3:0xe4ad83, veil:0xb9cedd
    };
    const byMaterial=new Map();
    for(const [key,color] of Object.entries(colors)){
      byMaterial.set(source[key],source[key].clone({
        color,emissive:key==='ritual'?0x5c3c24:0x30444b,
        pattern:0,metallic:.18,pulse:0,alpha:key==='veil'?.92:1,
        additive:false,depthWrite:true
      }));
    }
    const head=source.bone.clone({color:0xf1d79e,emissive:0x605135,pattern:0,metallic:.08,pulse:0,alpha:1,additive:false,depthWrite:true});
    return {byMaterial,head,ritual:byMaterial.get(source.ritual)};
  }

  function buildEnemyVisual(enemy) {
    const mesh=enemy.game.renderer.meshes, mat=enemy.materials, p=[];
    switch(enemy.type){
      case 'sutured':
        p.push(part(mesh.cube,mat.flesh,[0,1.05,0],[0,0,0],[.78,1.05,.46],'torso'));
        p.push(part(mesh.sphere8,mat.flesh,[0,1.83,0],[0,0,0],[.62,.7,.58],'head'));
        p.push(part(mesh.cylinder6,mat.flesh,[-.55,1.08,0],[0,0,.08],[.28,.95,.28],'armL'));
        p.push(part(mesh.cylinder6,mat.flesh,[.55,1.08,0],[0,0,-.08],[.28,.95,.28],'armR',Math.PI));
        p.push(part(mesh.cylinder6,mat.flesh,[-.24,.42,0],[0,0,0],[.3,.86,.3],'legL'));
        p.push(part(mesh.cylinder6,mat.flesh,[.24,.42,0],[0,0,0],[.3,.86,.3],'legR',Math.PI));
        for(let s=-1;s<=1;s++) p.push(part(mesh.cube,mat.ironLight,[s*.18,1.2,.25],[0,0,s*.25],[.04,.32,.05],'stitch'));
        break;
      case 'hookbearer':
        p.push(part(mesh.cylinder8,mat.flesh,[0,1.28,0],[0,0,0],[.78,1.6,.58],'torso'));
        p.push(part(mesh.sphere8,mat.flesh,[0,2.18,0],[0,0,0],[.55,.65,.52],'head'));
        p.push(part(mesh.cube,mat.iron,[0,2.18,.08],[0,0,0],[.72,.78,.63],'cage'));
        p.push(part(mesh.cylinder6,mat.flesh,[-.57,1.25,0],[0,0,.14],[.22,1.4,.22],'armL'));
        p.push(part(mesh.cylinder6,mat.flesh,[.57,1.25,0],[0,0,-.14],[.22,1.4,.22],'armR',Math.PI));
        p.push(part(mesh.cone8,mat.iron,[-.7,.42,.02],[0,0,.25],[.35,1.25,.35],'hookL'));
        p.push(part(mesh.cone8,mat.iron,[.7,.42,.02],[0,0,-.25],[.35,1.25,.35],'hookR'));
        p.push(part(mesh.cylinder6,mat.flesh,[-.24,.45,0],[0,0,0],[.25,.95,.25],'legL'));
        p.push(part(mesh.cylinder6,mat.flesh,[.24,.45,0],[0,0,0],[.25,.95,.25],'legR',Math.PI));
        break;
      case 'cherub':
        p.push(part(mesh.sphere8,mat.flesh,[0,0,0],[0,0,0],[.7,.65,.62],'body'));
        p.push(part(mesh.sphere8,mat.flesh,[0,.48,.08],[0,0,0],[.52,.52,.5],'head'));
        p.push(part(mesh.prism,mat.fleshDark,[-.62,.08,0],[0,.2,.4],[.95,.65,.18],'wingL'));
        p.push(part(mesh.prism,mat.fleshDark,[.62,.08,0],[0,-.2,-.4],[.95,.65,.18],'wingR',Math.PI));
        p.push(part(mesh.cone6,mat.bone,[-.2,-.52,.04],[0,0,.1],[.18,.65,.18],'legL'));
        p.push(part(mesh.cone6,mat.bone,[.2,-.52,.04],[0,0,-.1],[.18,.65,.18],'legR'));
        p.push(part(mesh.cone6,mat.bone,[0,.48,-.4],[Math.PI/2,0,0],[.14,.55,.14],'spine'));
        break;
      case 'confessor':
        p.push(part(mesh.cone8,mat.iron,[0,.82,0],[0,0,Math.PI],[1.05,1.7,.8],'robe'));
        p.push(part(mesh.cylinder8,mat.iron,[0,1.72,0],[0,0,0],[.72,.85,.62],'torso'));
        p.push(part(mesh.sphere8,mat.flesh,[0,2.28,0],[0,0,0],[.5,.6,.46],'head'));
        p.push(part(mesh.cube,mat.ironLight,[0,2.28,.16],[0,0,0],[.62,.72,.36],'mask'));
        for(let s=-2;s<=2;s++) p.push(part(mesh.cylinder6,mat.ritual,[s*.11,2.28,.38],[Math.PI/2,0,0],[.035,.28,.035],'grille'));
        p.push(part(mesh.cone6,mat.bone,[-.68,1.78,0],[0,0,.8],[.26,.8,.26],'shoulderL'));
        p.push(part(mesh.cone6,mat.bone,[.68,1.78,0],[0,0,-.8],[.26,.8,.26],'shoulderR'));
        break;
      case 'grinder':
        p.push(part(mesh.cube,mat.iron,[0,1.45,0],[0,0,0],[1.65,1.65,1.2],'torso'));
        p.push(part(mesh.sphere8,mat.flesh,[0,2.45,.05],[0,0,0],[.72,.7,.66],'head'));
        p.push(part(mesh.cube,mat.ironLight,[0,2.42,.28],[0,0,0],[.86,.48,.58],'mask'));
        p.push(part(mesh.cylinder8,mat.iron,[-1.05,1.35,0],[0,0,.18],[.62,1.65,.62],'armL'));
        p.push(part(mesh.cylinder8,mat.iron,[1.05,1.35,0],[0,0,-.18],[.62,1.65,.62],'armR',Math.PI));
        p.push(part(mesh.cylinder8,mat.flesh,[-.48,.5,0],[0,0,0],[.55,1,.55],'legL'));
        p.push(part(mesh.cylinder8,mat.flesh,[.48,.5,0],[0,0,0],[.55,1,.55],'legR',Math.PI));
        p.push(part(mesh.torusLow,mat.ritual,[0,1.42,.72],[Math.PI/2,0,0],[1.45,1.45,1.45],'wheel'));
        for(let s=0;s<6;s++){const a=s/6*Math.PI*2;p.push(part(mesh.cone6,mat.bone,[Math.cos(a)*.72,1.42+Math.sin(a)*.72,.82],[0,0,-a+Math.PI/2],[.15,.62,.15],'wheelSpike',a));}
        break;
      case 'flayed':
        p.push(part(mesh.cylinder8,mat.flesh,[0,1.25,0],[0,0,0],[.96,1.5,.72],'torso'));
        p.push(part(mesh.sphere8,mat.flesh,[0,2.18,0],[0,0,0],[.58,.64,.54],'head'));
        p.push(part(mesh.cube,mat.iron,[0,1.42,.47],[0,0,0],[1.15,1.55,.28],'reliquary'));
        p.push(part(mesh.torusLow,mat.ritual,[0,1.46,.66],[Math.PI/2,0,0],[1.15,1.15,1.15],'core'));
        p.push(part(mesh.cylinder6,mat.flesh,[-.7,1.2,0],[0,0,.16],[.28,1.35,.28],'armL'));
        p.push(part(mesh.cylinder6,mat.flesh,[.7,1.2,0],[0,0,-.16],[.28,1.35,.28],'armR',Math.PI));
        p.push(part(mesh.prism,mat.bone,[-.82,.62,.12],[0,0,.26],[.24,1.35,.16],'bladeL'));
        p.push(part(mesh.prism,mat.bone,[.82,.62,.12],[0,0,-.26],[.24,1.35,.16],'bladeR'));
        p.push(part(mesh.cylinder6,mat.flesh,[-.3,.45,0],[0,0,0],[.34,.92,.34],'legL'));
        p.push(part(mesh.cylinder6,mat.flesh,[.3,.45,0],[0,0,0],[.34,.92,.34],'legR',Math.PI));
        break;
      case 'bell':
        p.push(part(mesh.cone8,mat.iron,[0,1.15,0],[0,0,Math.PI],[1.55,2.25,1.55],'bell'));
        p.push(part(mesh.torusLow,mat.ritual,[0,.12,0],[0,0,0],[2.3,2.3,2.3],'bellRim'));
        p.push(part(mesh.sphere8,mat.flesh,[0,2.32,0],[0,0,0],[.66,.74,.62],'head'));
        p.push(part(mesh.cylinder6,mat.bone,[0,.35,0],[0,0,0],[.32,.9,.32],'clapper'));
        for(let s=0;s<4;s++){const a=s/4*Math.PI*2;p.push(part(mesh.cone6,mat.bone,[Math.cos(a)*.7,2.45,Math.sin(a)*.7],[0,0,a],[.22,.9,.22],'crown',a));}
        break;
      case 'twin':
        p.push(part(mesh.cylinder8,mat.flesh,[0,1.12,0],[0,0,0],[.58,1.35,.46],'torso'));
        p.push(part(mesh.sphere8,mat.flesh,[0,1.92,0],[0,0,0],[.48,.55,.43],'head'));
        p.push(part(mesh.prism,mat.veil,[0,1.7,-.22],[0,0,Math.PI],[1.15,1.8,.16],'veil'));
        p.push(part(mesh.cylinder6,mat.flesh,[-.42,1.05,0],[0,0,.18],[.17,1.1,.17],'armL'));
        p.push(part(mesh.cylinder6,mat.flesh,[.42,1.05,0],[0,0,-.18],[.17,1.1,.17],'armR',Math.PI));
        p.push(part(mesh.prism,mat.ritual,[-.62,.72,.08],[0,0,.35],[.18,1.35,.13],'bladeL'));
        p.push(part(mesh.prism,mat.ritual,[.62,.72,.08],[0,0,-.35],[.18,1.35,.13],'bladeR'));
        p.push(part(mesh.cylinder6,mat.flesh,[-.2,.42,0],[0,0,0],[.21,.86,.21],'legL'));
        p.push(part(mesh.cylinder6,mat.flesh,[.2,.42,0],[0,0,0],[.21,.86,.21],'legR',Math.PI));
        break;
      case 'choir':
        p.push(part(mesh.sphere12,mat.veil,[0,0,0],[0,0,0],[1.45,1.7,1.35],'core'));
        for(let s=0;s<6;s++){const a=s/6*Math.PI*2;p.push(part(mesh.sphere8,s%2?mat.flesh:mat.bone,[Math.cos(a)*.78,Math.sin(a*2)*.35,Math.sin(a)*.78],[0,a,0],[.42,.5,.38],'choirHead',a));}
        p.push(part(mesh.torus,mat.ritual,[0,0,0],[0,0,0],[2.1,2.1,2.1],'halo'));
        break;
      case 'gatekeeper':
        p.push(part(mesh.cube,mat.iron,[0,2.05,0],[0,0,0],[2.35,2.6,1.55],'torso'));
        p.push(part(mesh.sphere12,mat.flesh,[0,3.62,.08],[0,0,0],[1.05,1.08,.92],'head'));
        p.push(part(mesh.cube,mat.ironLight,[0,3.58,.39],[0,0,0],[1.22,.72,.7],'mask'));
        p.push(part(mesh.cylinder8,mat.iron,[-1.65,1.95,0],[0,0,.15],[.82,2.7,.82],'armL'));
        p.push(part(mesh.cylinder8,mat.iron,[1.65,1.95,0],[0,0,-.15],[.82,2.7,.82],'armR',Math.PI));
        p.push(part(mesh.cylinder8,mat.iron,[-.7,.62,0],[0,0,0],[.78,1.25,.78],'legL'));
        p.push(part(mesh.cylinder8,mat.iron,[.7,.62,0],[0,0,0],[.78,1.25,.78],'legR',Math.PI));
        p.push(part(mesh.torus,mat.ritual,[0,2.08,.9],[Math.PI/2,0,0],[2.15,2.15,2.15],'core'));
        for(let s=0;s<9;s++){const a=(s/8-.5)*Math.PI*1.25;p.push(part(mesh.cone6,mat.bone,[Math.sin(a)*1.05,4.45-Math.abs(a)*.18,Math.cos(a)*.35],[0,0,-a],[.23,1.35,.23],'crown',a));}
        p.push(part(mesh.cube,mat.iron,[-1.62,3.02,0],[0,0,.38],[1.25,.52,1.5],'shoulderL'));
        p.push(part(mesh.cube,mat.iron,[1.62,3.02,0],[0,0,-.38],[1.25,.52,1.5],'shoulderR'));
        break;
      case 'archdeacon':
        p.push(part(mesh.sphere12,mat.veil,[0,.1,0],[0,0,0],[1.35,1.55,1.15],'core'));
        p.push(part(mesh.cylinder8,mat.flesh,[0,.55,0],[0,0,0],[.82,1.5,.66],'torso'));
        p.push(part(mesh.sphere8,mat.flesh,[0,1.55,.04],[0,0,0],[.7,.76,.62],'head'));
        p.push(part(mesh.cube,mat.ironLight,[0,1.52,.33],[0,0,0],[.88,.7,.42],'mask'));
        p.push(part(mesh.torus,mat.ritual,[0,.35,.78],[Math.PI/2,0,0],[1.85,1.85,1.85],'halo'));
        for(let s=0;s<8;s++){
          const a=s/8*Math.PI*2;
          p.push(part(mesh.cylinder6,s%2?mat.fleshDark:mat.ritual,[Math.cos(a)*1.12,.15+Math.sin(a*2)*.38,Math.sin(a)*.82],[a*.22,0,a],[.13,1.45,.13],'nerve',a));
        }
        p.push(part(mesh.cylinder6,mat.flesh,[-.72,.72,0],[0,0,.36],[.22,1.45,.22],'armL'));
        p.push(part(mesh.cylinder6,mat.flesh,[.72,.72,0],[0,0,-.36],[.22,1.45,.22],'armR',Math.PI));
        for(let s=0;s<7;s++){
          const a=(s/6-.5)*Math.PI*1.15;
          p.push(part(mesh.cone6,mat.bone,[Math.sin(a)*.78,2.35-Math.abs(a)*.1,Math.cos(a)*.24],[0,0,-a],[.16,.9,.16],'crown',a));
        }
        break;
    }
    return p;
  }

  class Enemy {
    constructor(game,type,position,options={}) {
      this.game=game;
      this.type=type;
      this.config=D.ENEMIES[type];
      this.position=position.clone();
      this.velocity=new Vec3();
      this.yaw=Math.random()*Math.PI*2;
      this.age=Math.random()*10;
      this.spawnTimer=options.instant?0:1.15;
      this.attackTimer=randRange(.2,1);
      this.abilityTimer=randRange(1.5,this.config.abilityCooldown||4);
      this.soundTimer=randRange(2,6);
      this.stunTimer=0;
      this.slowTimer=0;
      this.slowAmount=0;
      this.buffTimer=0;
      this.hitFlash=0;
      this.attackPulse=0;
      this.state='seek';
      this.stateTimer=0;
      this.chargeDirection=new Vec3();
      this.teleportAlpha=1;
      this.alive=true;
      this.elite=Boolean(options.elite);
      this.boss=Boolean(this.config.boss);
      this.objectiveMarked=Boolean(options.marked);
      this.summonedByBoss=Boolean(options.summonedByBoss);
      this.wave=game.wave;
      const scaleHealth=1+Math.max(0,game.wave-1)*.085+(this.boss?Math.max(0,game.wave-5)*.06:0);
      const eliteHealth=this.elite?(game.currentModifier?.eliteHealth||1)*1.45:1;
      this.maxHealth=Math.round(this.config.health*game.difficulty.enemyHealth*scaleHealth*eliteHealth);
      this.health=this.maxHealth;
      this.damage=this.config.damage*game.difficulty.enemyDamage*(1+Math.max(0,game.wave-1)*.025)*(game.currentModifier?.enemyDamage||1)*(this.elite?1.22:1);
      this.speed=this.config.speed*game.difficulty.speed*(game.currentModifier?.enemySpeed||1)*(this.elite?1.1:1);
      this.radius=this.config.radius*(this.elite?1.08:1);
      this.height=this.config.height*(this.elite?1.08:1);
      this.materials=enemyMaterials(this.config,this.elite,this.boss);
      this.contrastMaterials=null;
      this.parts=buildEnemyVisual(this);
      this.headParts=this.parts.filter(part=>part.tag==='head'||part.tag==='choirHead');
      this.bodyParts=this.parts.filter(part=>part.tag==='torso'||part.tag==='body'||part.tag==='core');
      this.rootMatrix=mat4();
      this.rootTransform=new Transform();
      this.localTransform=new Transform();
      this.worldMatrix=mat4();
      this.phase=0;
      this.lastHitZone='body';
      this.dropChance = this.elite ? .4 : .16;
      if(this.config.flying) this.position.y=randRange(3.2,5.2);
      this.bossPhase=1;
      this.summonTimer=8;
      this.burnTimer=0;
      this.burnDps=0;
      this.burnTick=.25;
      this.watchdogTimer=0;
      this.stuckTimer=0;
      this.watchdogPosition=this.position.clone();
    }

    update(dt) {
      if(!this.alive) return;
      this.age+=dt;
      this.attackTimer-=dt;
      this.abilityTimer-=dt;
      this.soundTimer-=dt;
      this.stunTimer=Math.max(0,this.stunTimer-dt);
      this.slowTimer=Math.max(0,this.slowTimer-dt);
      if(this.slowTimer<=0)this.slowAmount=0;
      this.buffTimer=Math.max(0,this.buffTimer-dt);
      this.hitFlash=Math.max(0,this.hitFlash-dt*6);
      this.attackPulse=Math.max(0,this.attackPulse-dt*3.5);
      if(this.burnTimer>0){
        this.burnTimer=Math.max(0,this.burnTimer-dt);
        this.burnTick-=dt;
        if(this.burnTick<=0){
          this.burnTick=.25;
          this.takeDamage(this.burnDps*.25,{zone:'body',headMultiplier:1,source:'purifier_burn',stun:.02});
          if(!this.alive)return;
          this.game.particles.burst(new Vec3(this.position.x,this.config.flying?this.position.y:this.height*.55,this.position.z),{count:3,color:0x70f5e8,speedMin:.1,speedMax:.8,sizeMin:.025,sizeMax:.065,lifeMin:.1,lifeMax:.28,gravity:-.2});
        }
      }
      if(this.spawnTimer>0){
        this.spawnTimer-=dt;
        if(chance(dt*7)) this.game.particles.spawn({position:new Vec3(this.position.x,randRange(.1,this.height),this.position.z),velocity:new Vec3(randRange(-.3,.3),randRange(.5,1.8),randRange(-.3,.3)),color:this.config.emissive,size:.12,life:.7,gravity:-.5});
        return;
      }
      if(this.stunTimer>0) return;
      const player=this.game.player;
      if(player.dead) return;
      const toPlayer=_vA.copy(player.position).sub(this.position);
      const distanceXZ=toPlayer.lengthXZ();
      const dir=distanceXZ>.001?toPlayer.clone().normalizeXZ():new Vec3(0,0,1);
      const slow=this.slowTimer>0?1-this.slowAmount:1;
      const buff=this.buffTimer>0?1.25:1;
      const moveSpeed=this.speed*slow*buff*(this.boss&&this.health/this.maxHealth<.33?1.28:1);

      if(this.soundTimer<=0 && distanceXZ<18){
        this.soundTimer=randRange(4,9);
        this.game.audio.enemy(this.type==='bell'?'bell':this.type==='hookbearer'?'hook':'growl',this.position,player.position,this.game.camera.yaw);
      }

      if(this.config.corruptionAura>0){
        const auraRange=this.boss?14:(this.type==='choir'?12:7);
        if(distanceXZ<auraRange) player.addCorruption(this.config.corruptionAura*dt*(1-distanceXZ/auraRange+.2));
      }

      if(this.type==='archdeacon') this._updateArchdeacon(dt,dir,distanceXZ,moveSpeed);
      else if(this.boss){ this._updateBoss(dt,dir,distanceXZ,moveSpeed); }
      else if(this.type==='cherub') this._updateCherub(dt,dir,distanceXZ,moveSpeed);
      else if(this.type==='confessor') this._updateRanged(dt,dir,distanceXZ,moveSpeed,'confessor');
      else if(this.type==='hookbearer') this._updateHookbearer(dt,dir,distanceXZ,moveSpeed);
      else if(this.type==='grinder') this._updateGrinder(dt,dir,distanceXZ,moveSpeed);
      else if(this.type==='flayed') this._updateFlayed(dt,dir,distanceXZ,moveSpeed);
      else if(this.type==='bell') this._updateBell(dt,dir,distanceXZ,moveSpeed);
      else if(this.type==='twin') this._updateTwin(dt,dir,distanceXZ,moveSpeed);
      else if(this.type==='choir') this._updateChoir(dt,dir,distanceXZ,moveSpeed);
      else this._updateMelee(dt,dir,distanceXZ,moveSpeed);

      if(!this.config.flying){
        this.position.addScaled(this.velocity,dt);
        this.game.arena.resolvePosition(this.position,this.radius);
      }
      this.velocity.x=damp(this.velocity.x,0,5,dt);
      this.velocity.z=damp(this.velocity.z,0,5,dt);
      const desiredYaw=Math.atan2(dir.x,dir.z);
      this.yaw+=deltaAngle(this.yaw,desiredYaw)*Math.min(1,dt*(this.state==='charge'?2:5));
    }

    _seek(dir,speed,weight=1){
      this.velocity.x=damp(this.velocity.x,dir.x*speed,5*weight,1/60);
      this.velocity.z=damp(this.velocity.z,dir.z*speed,5*weight,1/60);
    }
    _move(dir,speed,dt,rate=6){
      this.velocity.x=damp(this.velocity.x,dir.x*speed,rate,dt);
      this.velocity.z=damp(this.velocity.z,dir.z*speed,rate,dt);
    }
    _hasContactLine() {
      const player=this.game.player;
      const origin=new Vec3(this.position.x,this.position.y+Math.min(this.height*.55,1.4),this.position.z);
      const target=new Vec3(player.position.x,player.position.y+1.05,player.position.z);
      return !this.game.arena.lineBlocked(origin,target);
    }
    _melee(distanceXZ) {
      if(distanceXZ<=this.config.attackRange+this.game.player.radius && this.attackTimer<=0){
        if(!this._hasContactLine())return false;
        this.attackTimer=this.config.attackCooldown * (this.buffTimer > 0 ? .75 : 1);
        this.attackPulse=1;
        this.game.damagePlayer(this.damage,this.position,this.type === 'choir' ? .035 : .012);
        return true;
      }
      return false;
    }
    _updateMelee(dt,dir,distance,speed){
      this._move(dir,speed,dt);
      this._melee(distance);
    }
    _updateHookbearer(dt,dir,distance,speed){
      if(distance>5.5) this._move(dir,speed,dt); else this._move(_vB.set(-dir.z,0,dir.x),speed*.35,dt);
      if(this.abilityTimer<=0 && distance>3.5 && distance<this.config.abilityRange && !this.game.arena.lineBlocked(new Vec3(this.position.x,this.position.y+1.7,this.position.z),this.game.camera.position)){
        this.abilityTimer=this.config.abilityCooldown;
        this.game.spawnEnemyProjectile(this,'hook',this.game.camera.position,22,this.damage*.65);
        this.attackPulse=1;
      } else this._melee(distance);
    }
    _updateCherub(dt,dir,distance,speed){
      const targetY=this.game.player.position.y+3.4+Math.sin(this.age*1.4+this.phase)*1.0;
      this.position.y=damp(this.position.y,targetY,2.2,dt);
      const tangent=_vB.set(-dir.z,0,dir.x).scale(Math.sin(this.age*.8+this.position.x)*.75);
      const desired=_vC.copy(dir).scale(distance>9?1:distance<5?-1:.1).add(tangent).normalizeXZ();
      this.position.addScaled(desired,speed*dt);
      this.game.arena.resolvePosition(this.position,this.radius);
      if(this.attackTimer<=0 && distance<18){
        this.attackTimer=this.config.attackCooldown;
        this.game.spawnEnemyProjectile(this,'bone',this.game.camera.position,14,this.damage);
        this.attackPulse=1;
      }
    }
    _updateRanged(dt,dir,distance,speed,type){
      if(distance>15) this._move(dir,speed,dt);
      else if(distance<8) this._move(_vB.copy(dir).scale(-1),speed*.8,dt);
      else this._move(_vB.set(-dir.z,0,dir.x),speed*.35*Math.sin(this.age),dt);
      if(this.attackTimer<=0 && distance<this.config.attackRange && !this.game.arena.lineBlocked(new Vec3(this.position.x,this.position.y+1.6,this.position.z),this.game.camera.position)){
        this.attackTimer=this.config.attackCooldown * (this.buffTimer > 0 ? .72 : 1);
        this.game.spawnEnemyProjectile(this,type==='confessor'?'sentence':'bolt',this.game.camera.position,type==='confessor'?19:14,this.damage);
        this.attackPulse=1;
      }
    }
    _updateGrinder(dt,dir,distance,speed){
      if(this.state==='windup'){
        this.stateTimer-=dt; this.velocity.scale(.75);
        if(this.stateTimer<=0){this.state='charge';this.stateTimer=1.25;this.chargeDirection.copy(dir);this.game.audio.enemy('scream',this.position,this.game.player.position,this.game.camera.yaw);}
      }else if(this.state==='charge'){
        this.stateTimer-=dt;
        this._move(this.chargeDirection,speed*5.2,dt,18);
        if(distance<this.radius+this.game.player.radius+1 && this._hasContactLine()){this.game.damagePlayer(this.damage*1.35,this.position,.02);this.stateTimer=0;}
        if(this.stateTimer<=0){this.state='seek';this.abilityTimer=this.config.abilityCooldown;}
      }else{
        this._move(dir,speed,dt);
        if(this.abilityTimer<=0 && distance>5 && distance<this.config.abilityRange){this.state='windup';this.stateTimer=.85;this.attackPulse=1;}
        this._melee(distance);
      }
    }
    _updateFlayed(dt,dir,distance,speed){
      if(this.state==='lungeWindup'){
        this.stateTimer-=dt;this.velocity.scale(.62);this.attackPulse=1;
        if(this.stateTimer<=0){this.state='lunge';this.stateTimer=.58;this.chargeDirection.copy(dir);this.game.audio.enemy('scream',this.position,this.game.player.position,this.game.camera.yaw);}
      }else if(this.state==='lunge'){
        this.stateTimer-=dt;this._move(this.chargeDirection,speed*3.35,dt,18);
        if(distance<this.radius+this.game.player.radius+.8 && this._hasContactLine()){
          this.game.damagePlayer(this.damage*1.28,this.position,.028);
          this.game.player.slow(.35,1.1);
          this.stateTimer=0;
        }
        if(this.stateTimer<=0){this.state='seek';this.abilityTimer=this.config.abilityCooldown;}
      }else{
        const tangent=_vB.set(-dir.z,0,dir.x).scale(Math.sin(this.age*1.35)*.22);
        this._move(_vC.copy(dir).add(tangent).normalizeXZ(),speed,dt,7);
        if(this.abilityTimer<=0&&distance>3.8&&distance<this.config.abilityRange){this.state='lungeWindup';this.stateTimer=.48;}
        this._melee(distance);
      }
    }
    _updateBell(dt,dir,distance,speed){
      if(distance>13)this._move(dir,speed,dt); else if(distance<7)this._move(_vB.copy(dir).scale(-1),speed*.7,dt); else this._move(_vB.set(-dir.z,0,dir.x),speed*.18,dt);
      if(this.abilityTimer<=0){
        this.abilityTimer=this.config.abilityCooldown;
        this.attackPulse=1;
        this.game.audio.enemy('bell',this.position,this.game.player.position,this.game.camera.yaw);
        for(const enemy of this.game.enemies){if(enemy!==this && enemy.position.distanceToXZ(this.position)<this.config.abilityRange)enemy.buffTimer=Math.max(enemy.buffTimer,4.2);}
        if(distance<this.config.abilityRange)this.game.player.addCorruption(.065);
        this.game.spawnAbilityRing(this.position,0xd68d43,this.config.abilityRange);
      }
      this._melee(distance);
    }
    _updateTwin(dt,dir,distance,speed){
      if(this.state==='vanish'){
        this.stateTimer-=dt;this.teleportAlpha=clamp(this.stateTimer/.55,0,1);this.velocity.scale(.5);
        if(this.stateTimer<=0){
          const player=this.game.player, behind=new Vec3(-Math.sin(this.game.camera.yaw),0,Math.cos(this.game.camera.yaw));
          this.position.copy(player.position).addScaled(behind,randRange(2.3,3.6));this.game.arena.resolvePosition(this.position,this.radius);
          this.state='appear';this.stateTimer=.35;this.teleportAlpha=0;
        }
      }else if(this.state==='appear'){
        this.stateTimer-=dt;this.teleportAlpha=1-clamp(this.stateTimer/.35,0,1);
        if(this.stateTimer<=0){this.state='seek';this.abilityTimer=this.config.abilityCooldown;}
      }else{
        const tangent=_vB.set(-dir.z,0,dir.x).scale(Math.sin(this.age*2.1)*.55);
        this._move(_vC.copy(dir).add(tangent).normalizeXZ(),speed,dt,8);
        if(this.abilityTimer<=0 && distance>4 && distance<12){this.state='vanish';this.stateTimer=.55;this.attackPulse=1;}
        this._melee(distance);
      }
    }
    _updateChoir(dt,dir,distance,speed){
      this.position.y=damp(this.position.y,4+Math.sin(this.age*1.2)*.75,1.7,dt);
      const tangent=_vB.set(-dir.z,0,dir.x).scale(.8);
      const desired=_vC.copy(dir).scale(distance > 12 ? .65 : (distance < 7 ? -.5 : .05)).add(tangent).normalizeXZ();
      this.position.addScaled(desired,speed*dt);
      this.game.arena.resolvePosition(this.position,this.radius);
      if(this.attackTimer<=0 && distance<20){
        this.attackTimer=this.config.attackCooldown;
        this.game.spawnEnemyProjectile(this,'corruption',this.game.camera.position,11,this.damage);
        this.attackPulse=1;
      }
    }
    _updateBoss(dt,dir,distance,speed){
      const ratio=this.health/this.maxHealth;
      const phase=ratio>.66?1:ratio>.33?2:3;
      if(phase!==this.bossPhase){
        this.bossPhase=phase;
        this.game.ui.announce('PHASE DU GARDIEN',phase===2?'LES CHAÎNES S’ÉVEILLENT':'LA COURONNE SE BRISE',phase===2?'Le Nexus réclame des renforts.':'Le Gardien entre en frénésie.',2.5);
        this.game.spawnAbilityRing(this.position,0xf02f3a,12);
        this.game.audio.boss();
        if(phase===2){
          if(this.game.spawnBossAdd)this.game.spawnBossAdd('hookbearer',this,{elite:true});else this.game.spawnEnemy('hookbearer',null,{elite:true});
        }
        if(phase===3){
          if(this.game.spawnBossAdd){this.game.spawnBossAdd('twin',this);this.game.spawnBossAdd('twin',this);}
          else {this.game.spawnEnemy('twin');this.game.spawnEnemy('twin');}
        }
      }
      this.summonTimer-=dt;
      if(this.state==='slamWindup'){
        this.stateTimer-=dt;this.velocity.scale(.6);
        if(this.stateTimer<=0){
          // Référence conservée : Gardien standard, difficulté instable, vague 5 (facteur 1.1).
          // Les facteurs difficulté/vague/anomalie/élite sont déjà présents une seule fois dans damage.
          this.game.bossSlam(this.position,this.bossPhase,this.damage/(this.config.damage*1.1));
          this.state='seek';this.abilityTimer=5.8-this.bossPhase*.7;
        }
      }else if(this.state==='charge'){
        this.stateTimer-=dt;this._move(this.chargeDirection,speed*4.1,dt,18);
        if(distance<2.8 && this._hasContactLine()){this.game.damagePlayer(this.damage*1.35,this.position,.045);this.stateTimer=0;}
        if(this.stateTimer<=0){this.state='seek';this.abilityTimer=4.5;}
      }else{
        this._move(dir,speed,dt,7);
        this._melee(distance);
        if(this.abilityTimer<=0){
          if(distance>8 && chance(.42)){this.state='charge';this.stateTimer=1.4;this.chargeDirection.copy(dir);}
          else {this.state='slamWindup';this.stateTimer=.9;this.attackPulse=1;this.game.telegraphBossSlam?.(this);}
        }
      }
      if(this.bossPhase>=2 && this.summonTimer<=0){
        this.summonTimer=this.bossPhase===3?7:10;
        const count=this.bossPhase===3?3:2;
        for(let i=0;i<count;i++){
          const type=pick(this.bossPhase===3?['sutured','hookbearer','cherub','twin']:['sutured','hookbearer','cherub']);
          if(this.game.spawnBossAdd)this.game.spawnBossAdd(type,this);else this.game.spawnEnemy(type);
        }
      }
    }
    _updateArchdeacon(dt,dir,distance,speed){
      const ratio=this.health/this.maxHealth;
      const phase=ratio>.66?1:ratio>.33?2:3;
      if(phase!==this.bossPhase){
        this.bossPhase=phase;
        this.game.ui.announce('LITURGIE NERVEUSE',phase===2?'LE RÉSEAU SE DÉPLOIE':'L’ARCHIDIACRE SE DÉCHAÎNE',phase===2?'Des relais psychiques franchissent le voile.':'Les nerfs du Nexus ciblent toute l’arène.',2.7);
        this.game.spawnAbilityRing(this.position,0xdf55a7,13);
        this.game.audio.boss();
        if(phase===2){
          if(this.game.spawnBossAdd){this.game.spawnBossAdd('choir',this);this.game.spawnBossAdd('flayed',this,{elite:true});}
          else {this.game.spawnEnemy('choir');this.game.spawnEnemy('flayed',null,{elite:true});}
        }
        if(phase===3){
          if(this.game.spawnBossAdd){this.game.spawnBossAdd('twin',this);this.game.spawnBossAdd('confessor',this,{elite:true});}
          else {this.game.spawnEnemy('twin');this.game.spawnEnemy('confessor',null,{elite:true});}
        }
      }
      this.position.y=damp(this.position.y,4.8+Math.sin(this.age*1.15)*.65,2.1,dt);
      const tangent=_vB.set(-dir.z,0,dir.x).scale(phase===3?1.1:.75);
      const radial=distance>17?1:distance<10?-.8:.05;
      const desired=_vC.copy(dir).scale(radial).add(tangent).normalizeXZ();
      this.position.addScaled(desired,speed*dt*(phase===3?1.22:1));
      this.game.arena.resolvePosition(this.position,this.radius);

      if(this.attackTimer<=0&&distance<this.config.attackRange){
        this.attackTimer=this.config.attackCooldown*(phase === 3 ? .62 : phase === 2 ? .8 : 1);
        const target=this.game.camera.position.clone();
        this.game.spawnEnemyProjectile(this,'corruption',target,12+phase*1.5,this.damage);
        if(phase>=2){
          const side=new Vec3(Math.cos(this.game.camera.yaw),0,Math.sin(this.game.camera.yaw));
          this.game.spawnEnemyProjectile(this,'sentence',target.clone().addScaled(side,phase===3?1.35:.85),18,this.damage*.72);
          this.game.spawnEnemyProjectile(this,'sentence',target.clone().addScaled(side,phase===3?-1.35:-.85),18,this.damage*.72);
        }
        this.attackPulse=1;
      }

      if(this.abilityTimer<=0){
        this.abilityTimer=this.config.abilityCooldown-(phase-1)*.75;
        const strikes=phase+1;
        for(let i=0;i<strikes;i++){
          const a=Math.random()*Math.PI*2;
          const p=this.game.player.position.clone().add(new Vec3(Math.cos(a)*randRange(2.4,7),0,Math.sin(a)*randRange(2.4,7)));
          this.game.arena.resolvePosition(p,2.6);
          this.game.arena.scheduleChainStrike(p);
        }
        if(distance<18){
          this.game.player.addCorruption(.035*phase);
          this.game.player.slow(.16*phase,.8+phase*.3);
        }
        this.game.spawnAbilityRing(this.position,0xd9509b,9+phase*2,.8);
      }

      this.summonTimer-=dt;
      if(phase>=2&&this.summonTimer<=0){
        this.summonTimer=phase===3?8.5:12;
        const pool=phase===3?['sutured','cherub','flayed','twin']:['sutured','cherub','confessor'];
        for(let i=0;i<phase;i++){
          const type=pick(pool);
          if(this.game.spawnBossAdd)this.game.spawnBossAdd(type,this);else this.game.spawnEnemy(type);
        }
      }
    }

    takeDamage(amount,hit={}) {
      if(!this.alive || this.spawnTimer>.65) return {damage:0,killed:false};
      let damage=amount;
      if(this.config.frontalArmor&&hit.zone!=='head'&&hit.direction){
        const fx=Math.sin(this.yaw),fz=Math.cos(this.yaw);
        const frontal=-(hit.direction.x*fx+hit.direction.z*fz);
        if(frontal>.28)damage*=1-this.config.frontalArmor;
      }
      if(hit.zone==='head') damage*=hit.headMultiplier||1;
      this.health-=damage;
      this.hitFlash=1;
      this.lastHitZone=hit.zone||'body';
      if(hit.stun)this.stunTimer=Math.max(this.stunTimer,hit.stun);
      if(hit.slow){
        if(this.slowTimer<=0)this.slowAmount=0;
        this.slowAmount=Math.max(this.slowAmount,hit.slow);this.slowTimer=Math.max(this.slowTimer,hit.slowDuration||1);
      }
      if(hit.direction && !this.boss){this.velocity.addScaled(hit.direction,Math.min(3.5,damage*.012));}
      if(this.health<=0){this.health=0;this.alive=false;this.game.killEnemy(this,hit);return {damage,killed:true};}
      return {damage,killed:false};
    }

    ignite(dps=18,duration=2.5){
      this.burnDps=Math.max(this.burnDps,dps);
      this.burnTimer=Math.max(this.burnTimer,duration);
      this.burnTick=Math.min(this.burnTick,.08);
    }

    raycast(origin,direction,maxDistance=100) {
      let nearest=Infinity,zone=null;
      const flying=this.config.flying;
      const isArchdeacon=this.type==='archdeacon';
      const baseY=this.position.y;
      const scale=(this.elite?1.08:1)*(this.boss?1.06:1)*(this.type==='twin'?this.teleportAlpha:1);
      const cos=Math.cos(this.yaw),sin=Math.sin(this.yaw),time=this.game.time||0;
      const bodyCenter=_hitBody.set(this.position.x,baseY+(isArchdeacon ? .52 : (flying ? 0 : this.height*.48)),this.position.z);
      const bodyRadius=this.radius*(this.boss?1.35:1.12);
      let body=raySphere(origin,direction,bodyCenter,bodyRadius);
      if(isArchdeacon){
        // Le prélat suspendu n’a pas le torse massif du Gardien : sa sphère héritée
        // occultait la tête au-dessus des volumes réellement dessinés.
        body=Infinity;
        for(const part of this.bodyParts){
          const x=part.basePosition.x,y=part.basePosition.y,z=part.basePosition.z;
          bodyCenter.set(this.position.x+(x*cos+z*sin)*scale,baseY+y*scale,this.position.z+(-x*sin+z*cos)*scale);
          body=Math.min(body,rayEllipsoid(origin,direction,bodyCenter,part.baseScale,scale,this.yaw+part.baseRotation.y));
        }
      }
      if(body<nearest&&body<=maxDistance){nearest=body;zone='body';}
      // Même pose, échelle et dimensions que les pièces visibles ; aucun rayon global élargi.
      if(scale>0)for(const part of this.headParts){
        let x=part.basePosition.x,y=part.basePosition.y,z=part.basePosition.z;
        let yaw=this.yaw+part.baseRotation.y;
        if(part.tag==='choirHead'){
          const angle=part.phase+time*.55;
          x=Math.cos(angle)*.78;z=Math.sin(angle)*.78;y=Math.sin(angle*2+time)*.35;
          yaw=this.yaw-angle;
        }else yaw+=Math.sin(this.age*1.4+part.phase)*.12;
        _hitHead.set(this.position.x+(x*cos+z*sin)*scale,baseY+y*scale,this.position.z+(-x*sin+z*cos)*scale);
        const head=rayEllipsoid(origin,direction,_hitHead,part.baseScale,scale,yaw);
        const headPriority=isArchdeacon&&head<=maxDistance&&head<=body+.5;
        if((head<nearest&&head<=maxDistance)||headPriority){nearest=head;zone='head';}
      }
      return {distance:nearest,zone,hit:zone!==null};
    }

    draw(renderer,time) {
      const settings=this.game.settings||{};
      const contrast=settings.enemyContrast
        ? (this.contrastMaterials||(this.contrastMaterials=highContrastEnemyMaterials(this.materials,this.elite,this.boss)))
        : null;
      // Le hitmarker et le son restent disponibles ; l’option supprime le flash
      // blanc plein corps au lieu de le remplacer par un autre clignotement.
      const hitMaterial=this.hitFlash>.05&&!settings.reducedFlashes?this.materials.flash:null;
      const spawnT=1-clamp(this.spawnTimer/1.15,0,1);
      const rootY=this.config.flying?this.position.y:this.position.y-(1-spawnT)*this.height*.72;
      const scale=(this.elite?1.08:1)*(this.boss?1.06:1)*(this.type==='twin'?this.teleportAlpha:1);
      this.rootTransform.position.set(this.position.x,rootY,this.position.z);
      this.rootTransform.rotation.set(0,this.yaw,0);
      this.rootTransform.scale.set(scale,scale,scale);
      this.rootTransform.updateMatrix();
      const walk=Math.sin(this.age*(this.type==='grinder'?4:7)+this.position.x*.2);
      for(const p of this.parts){
        // Rebuild the pose from its authored proportions: drawing must not
        // accumulate breathing scale or depend on frame rate / paused frames.
        p.position.copy(p.basePosition);p.rotation.copy(p.baseRotation);p.scale.copy(p.baseScale);
        if(p.tag==='legL')p.rotation.x+=walk*.48;
        else if(p.tag==='legR')p.rotation.x-=walk*.48;
        else if(p.tag==='armL')p.rotation.x-=walk*.38+this.attackPulse*.65;
        else if(p.tag==='armR')p.rotation.x+=walk*.38+this.attackPulse*.65;
        else if(p.tag==='head')p.rotation.y+=Math.sin(this.age*1.4+p.phase)*.12;
        else if(p.tag==='wingL')p.rotation.z+=Math.sin(this.age*11)*.55;
        else if(p.tag==='wingR')p.rotation.z-=Math.sin(this.age*11)*.55;
        else if(p.tag==='wheel'||p.tag==='core')p.rotation.z+=time*(this.type==='gatekeeper'?1.2:2.4);
        else if(p.tag==='wheelSpike'){const a=p.phase+time*2.4;p.position.x=Math.cos(a)*.72;p.position.y=1.42+Math.sin(a)*.72;p.rotation.z=-a+Math.PI/2;}
        else if(p.tag==='bell')p.rotation.z+=Math.sin(this.age*4)*.06*this.attackPulse;
        else if(p.tag==='clapper')p.rotation.z+=Math.sin(this.age*5)*.35*this.attackPulse;
        else if(p.tag==='choirHead'){const a=p.phase+time*.55;p.position.x=Math.cos(a)*.78;p.position.z=Math.sin(a)*.78;p.position.y=Math.sin(a*2+time)*.35;p.rotation.y=-a;}
        else if(p.tag==='halo')p.rotation.y+=time*.9;
        else if(p.tag==='crown')p.rotation.y+=Math.sin(this.age*.8+p.phase)*.05;
        if(p.tag==='torso'||p.tag==='body'||p.tag==='core')p.scale.y*=1+Math.sin(this.age*2.2+p.phase)*.025;
        this.localTransform.position.copy(p.position);this.localTransform.rotation.copy(p.rotation);this.localTransform.scale.copy(p.scale);this.localTransform.updateMatrix();
        mat4Multiply(p.worldMatrix,this.rootTransform.matrix,this.localTransform.matrix);
        const baseMaterial=contrast
          ? (p.tag==='head'||p.tag==='choirHead'?contrast.head:contrast.byMaterial.get(p.material)||p.material)
          : p.material;
        renderer.draw(p.mesh,p.worldMatrix,hitMaterial||baseMaterial);
      }
      if(this.elite){
        const ring=new Transform(new Vec3(this.position.x,(this.config.flying?this.position.y:0)+.05,this.position.z),new Vec3(0,time*.8,0),new Vec3(this.radius*3.4,1,this.radius*3.4));
        ring.updateMatrix();renderer.draw(renderer.meshes.torusLow,ring.matrix,contrast?.ritual||this.materials.ritual);
      }
      if(this.objectiveMarked){
        const markerY=(this.config.flying?this.position.y:this.height)+.8+Math.sin(time*3+this.phase)*.12;
        const marker=new Transform(new Vec3(this.position.x,markerY,this.position.z),new Vec3(Math.PI/2,time*1.4,0),new Vec3(this.radius*2.5,this.radius*2.5,this.radius*2.5));
        marker.updateMatrix();renderer.draw(renderer.meshes.torusLow,marker.matrix,contrast?.ritual||this.materials.ritual);
      }
    }
  }

  class Projectile {
    constructor(game,options={}) {
      this.game=game;
      this.type=options.type||'bolt';
      this.owner=options.owner||null;
      this.position=options.position.clone();
      this.previous=this.position.clone();
      this.velocity=options.velocity.clone();
      this.damage=options.damage||10;
      this.radius=options.radius||.18;
      this.life=options.life||5;
      this.gravity=options.gravity||0;
      this.corruption=options.corruption||0;
      this.color=options.color||0xd33a44;
      this.alive=true;
      this.bounces=options.bounces||0;
      this.fuse=options.fuse??null;
      this.explosionRadius=options.explosionRadius||0;
      this.explosionDamage=options.explosionDamage||0;
      this.material=new Material({color:this.color,emissive:this.color,pattern:3,metallic:.1,pulse:1.2,alpha:.88,additive:true,depthWrite:false});
      this.transform=new Transform();
      this.chainMatrix=mat4();
      this.trailTimer=0;
    }
    update(dt){
      if(!this.alive)return;
      this.life-=dt;if(this.life<=0){this.die();return;}
      if(this.fuse!==null){this.fuse-=dt;if(this.fuse<=0){this.explode();return;}}
      this.previous.copy(this.position);
      this.velocity.y-=this.gravity*dt;
      this.position.addScaled(this.velocity,dt);
      this.trailTimer-=dt;
      if(this.trailTimer<=0){
        this.trailTimer=this.type === 'grenade' ? .055 : .025;
        this.game.particles.spawn({position:this.position,velocity:new Vec3(randRange(-.2,.2),randRange(-.1,.2),randRange(-.2,.2)),color:this.color,size:this.type === 'grenade' ? .11 : .08,life:.3,gravity:0,drag:2,alpha:.7});
      }
      if(this.type==='grenade'){
        if(this.position.y<=.12){this.position.y=.12;if(this.velocity.y<0){this.velocity.y=-this.velocity.y*.55;this.velocity.x*=.82;this.velocity.z*=.82;}}
        const travel=_vA.copy(this.position).sub(this.previous),distance=travel.length();
        if(distance>.0001){
          const direction=travel.scale(1/distance);
          const hit=this.game.arena.raycastWorld(this.previous,direction,distance+this.radius);
          if(hit.hit){
            this.position.copy(this.previous).addScaled(direction,Math.max(0,hit.distance-this.radius*.5));
            if(this.bounces>0){
              const normal=grenadeImpactNormal(hit.collider,this.position,_vB);
              const dot=this.velocity.dot(normal);
              this.velocity.addScaled(normal,-2*dot).scale(.62);
              this.bounces--;
            }else{
              this.velocity.set(0,0,0);
              this.fuse=Math.min(this.fuse??.3,.3);
            }
          }
        }
        return;
      }
      const travel=_vA.copy(this.position).sub(this.previous),distance=travel.length();
      if(distance>.0001){
        travel.scale(1/distance);
        const worldHit=this.game.arena.raycastWorld(this.previous,travel,distance+this.radius);
        if(worldHit.hit){this.impact(this.previous.clone().addScaled(travel,worldHit.distance));return;}
      }
      const player=this.game.player;
      const center=_vB.set(player.position.x,player.position.y+1.05,player.position.z);
      if(this.position.distanceTo(center)<this.radius+.55){
        if(this.type==='hook'){player.hook(this.owner?.position||this.previous,1.0);player.damage(this.damage,this.owner?.position,.025);}
        else player.damage(this.damage,this.owner?.position,this.corruption);
        this.impact(this.position);return;
      }
    }
    impact(position){
      this.game.particles.burst(position,{count:this.type==='hook'?12:7,color:this.color,speedMin:.4,speedMax:2.5,sizeMin:.04,sizeMax:.1,lifeMin:.15,lifeMax:.45,gravity:2});
      this.alive=false;
    }
    explode(){this.game.explode(this.position,this.explosionRadius,this.explosionDamage,{source:'grenade',playerOwned:true});this.alive=false;}
    die(){if(this.fuse!==null)this.explode();else this.alive=false;}
    draw(renderer,time){
      this.transform.position.copy(this.position);this.transform.rotation.set(time*4,time*2,0);
      const scale=this.type === 'grenade' ? .34 : (this.type === 'hook' ? .22 : .22);
      this.transform.scale.set(scale,scale,scale);this.transform.updateMatrix();
      renderer.draw(this.type==='grenade'?renderer.meshes.cylinder8:renderer.meshes.sphere8,this.transform.matrix,this.material);
      if(this.type==='hook'&&this.owner&&this.owner.alive){
        modelMatrixBetween(this.chainMatrix,new Vec3(this.owner.position.x,this.owner.position.y+1.2,this.owner.position.z),this.position,.026);
        renderer.draw(renderer.meshes.cylinder6,this.chainMatrix,this.owner.materials.ironLight);
      }
    }
  }

  class Pickup {
    constructor(game,type,position,amount=0){
      this.game=game;this.type=type;this.position=position.clone();this.position.y=.35;this.amount=amount;
      this.life=20;this.age=Math.random()*10;this.alive=true;
      const colors={health:0xd84949,armor:0x58aebe,ammo:0xd69a55,essence:0xb75a90};
      this.color=colors[type]||0xffffff;
      this.material=new Material({color:this.color,emissive:this.color,pattern:3,metallic:.3,pulse:1,alpha:.92,additive:true,depthWrite:false});
      this.transform=new Transform();this.ring=new Transform();
    }
    update(dt){
      this.life-=dt;this.age+=dt;if(this.life<=0){this.alive=false;return;}
      if(this.position.distanceToXZ(this.game.player.position)<1.25){
        const p=this.game.player;
        if(this.type==='health')p.heal(this.amount||24);
        else if(this.type==='armor')p.addArmor(this.amount||22);
        else if(this.type==='ammo')this.game.weapons.refillReserves(.24);
        else if(this.type==='essence')p.essence+=this.amount||35;
        this.game.audio.pickup();this.game.ui.toast('RÉCUPÉRATION',this.type==='health'?'Santé restaurée':this.type==='armor'?'Armure restaurée':this.type==='ammo'?'Munitions récupérées':'Essence collectée');
        this.game.particles.burst(this.position,{count:14,color:this.color,speedMin:.4,speedMax:2.2,gravity:-.5,sizeMin:.05,sizeMax:.12});
        this.alive=false;
      }
    }
    draw(renderer,time){
      const bob=Math.sin(this.age*2.8)*.14;
      this.transform.position.set(this.position.x,this.position.y+bob,this.position.z);this.transform.rotation.set(time, time*1.5,0);this.transform.scale.set(.38,.38,.38);this.transform.updateMatrix();
      renderer.draw(this.type==='ammo'?renderer.meshes.cube:renderer.meshes.sphere8,this.transform.matrix,this.material);
      this.ring.position.set(this.position.x,.045,this.position.z);this.ring.rotation.set(0,time,0);this.ring.scale.set(1.15,1.15,1.15);this.ring.updateMatrix();
      renderer.draw(renderer.meshes.torusLow,this.ring.matrix,this.material);
    }
  }

  function grenadeImpactNormal(collider,point,out){
    if(!collider?.min||!collider?.max)return out.set(0,0,-1);
    let best=Math.abs(point.x-collider.min.x);out.set(-1,0,0);
    let value=Math.abs(collider.max.x-point.x);if(value<best){best=value;out.set(1,0,0);}
    value=Math.abs(point.y-collider.min.y);if(value<best){best=value;out.set(0,-1,0);}
    value=Math.abs(collider.max.y-point.y);if(value<best){best=value;out.set(0,1,0);}
    value=Math.abs(point.z-collider.min.z);if(value<best){best=value;out.set(0,0,-1);}
    value=Math.abs(collider.max.z-point.z);if(value<best)out.set(0,0,1);
    return out;
  }

  // Un rayon ramené dans l’ellipsoïde local garde son paramètre de distance monde.
  function rayEllipsoid(origin,direction,center,dimensions,scale,yaw){
    const cos=Math.cos(yaw),sin=Math.sin(yaw);
    const rx=dimensions.x*scale*.5,ry=dimensions.y*scale*.5,rz=dimensions.z*scale*.5;
    const x=origin.x-center.x,y=origin.y-center.y,z=origin.z-center.z;
    const ox=(x*cos-z*sin)/rx,oy=y/ry,oz=(x*sin+z*cos)/rz;
    const dx=(direction.x*cos-direction.z*sin)/rx,dy=direction.y/ry,dz=(direction.x*sin+direction.z*cos)/rz;
    const a=dx*dx+dy*dy+dz*dz,b=ox*dx+oy*dy+oz*dz,c=ox*ox+oy*oy+oz*oz-1;
    const discriminant=b*b-a*c;
    if(discriminant<0||a<=0)return Infinity;
    const root=Math.sqrt(discriminant),near=(-b-root)/a,far=(-b+root)/a;
    return near>=0?near:far>=0?far:Infinity;
  }

  const _vA=new Vec3(),_vB=new Vec3(),_vC=new Vec3(),_vD=new Vec3();
  const _hitBody=new Vec3(),_hitHead=new Vec3();

  NT.Entities={Player,Enemy,Projectile,Pickup};
})();
