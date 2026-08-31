(function () {
  'use strict';

  const NT = window.NT = window.NT || {};
  const M = NT.Math;
  const E = NT.Engine;
  const D = NT.Data;
  const { Vec3, clamp, damp, lerp, randRange, chance, mat4, mat4Multiply, mat4FromTransform, cameraBasis } = M;
  const { Transform, Material } = E;
  const { Projectile } = NT.Entities;

  function visualPart(mesh, material, position, rotation, scale, tag='') {
    return {
      mesh, material,
      position:new Vec3(...position), rotation:new Vec3(...rotation), scale:new Vec3(...scale),
      local:new Transform(), world:mat4(), tag
    };
  }

  class WeaponSystem {
    constructor(game) {
      this.game=game;
      this.player=game.player;
      this.states={};
      this.currentId='rifle';
      this.cooldown=0;
      this.reloading=false;
      this.reloadTimer=0;
      this.reloadDuration=0;
      this.fireHeldLast=false;
      this.ads=0;
      this.weaponKick=0;
      this.weaponKickSide=0;
      this.swayX=0;
      this.swayY=0;
      this.switchTimer=0;
      this.muzzleFlash=0;
      this.meleeCooldown=0;
      this.meleeTimer=0;
      this.muzzlePosition=new Vec3();
      this.aimForward=new Vec3();
      this.aimRight=new Vec3();
      this.aimUp=new Vec3();
      this.rootMatrix=mat4();
      this.tempTransform=new Transform();
      this.materials=this._createMaterials();
      this.visuals=this._createVisuals();
      this.metaReserveMul=1;
      this.shotsFired=0;
      this.shotsHit=0;
    }

    _createMaterials(){
      return {
        steel:new Material({color:0x434b50,emissive:0x08090a,pattern:1,metallic:.95}),
        dark:new Material({color:0x17191b,emissive:0x030303,pattern:1,metallic:.88}),
        brown:new Material({color:0x4d332b,emissive:0x090302,pattern:1,metallic:.42}),
        red:new Material({color:0x5a1018,emissive:0xd32936,pattern:3,metallic:.55,pulse:.65}),
        cyan:new Material({color:0x17464a,emissive:0x58dae2,pattern:3,metallic:.55,pulse:1}),
        violet:new Material({color:0x4a2344,emissive:0xb84b91,pattern:3,metallic:.4,pulse:.85}),
        amber:new Material({color:0x4e321f,emissive:0xe59645,pattern:3,metallic:.6,pulse:.8}),
        flesh:new Material({color:0x72504a,emissive:0x090303,pattern:2,metallic:.05}),
        glove:new Material({color:0x222326,emissive:0x020202,pattern:1,metallic:.35}),
        muzzle:new Material({color:0xffa84d,emissive:0xff8d2d,pattern:3,metallic:0,alpha:.86,additive:true,depthWrite:false,pulse:1.4})
      };
    }

    _createVisuals(){
      const mesh=this.game.renderer.meshes,m=this.materials;
      const visuals={};
      visuals.rifle={
        muzzle:new Vec3(0,.01,-.84),
        parts:[
          visualPart(mesh.cube,m.steel,[0,0,-.18],[0,0,0],[.24,.20,.62],'body'),
          visualPart(mesh.cube,m.dark,[0,-.02,.23],[0,0,0],[.21,.18,.34],'stock'),
          visualPart(mesh.cylinder8,m.dark,[0,.005,-.59],[Math.PI/2,0,0],[.075,.50,.075],'barrel'),
          visualPart(mesh.cylinder8,m.red,[0,.005,-.87],[Math.PI/2,0,0],[.095,.16,.095],'muzzle'),
          visualPart(mesh.cube,m.dark,[.02,-.19,-.05],[-.15,0,.08],[.11,.31,.14],'grip'),
          visualPart(mesh.cube,m.red,[0,.15,-.12],[0,0,0],[.08,.08,.32],'rail'),
          visualPart(mesh.cube,m.dark,[0,.22,-.18],[0,0,0],[.09,.11,.12],'sight'),
          visualPart(mesh.cube,m.steel,[.18,-.05,-.18],[0,0,0],[.08,.10,.27],'mag')
        ]
      };
      visuals.shotgun={
        muzzle:new Vec3(0,.03,-1.02),
        parts:[
          visualPart(mesh.cube,m.brown,[0,0,-.05],[0,0,0],[.26,.22,.72],'body'),
          visualPart(mesh.cube,m.brown,[0,-.01,.38],[0,0,0],[.23,.21,.42],'stock'),
          visualPart(mesh.cylinder8,m.steel,[-.065,.04,-.66],[Math.PI/2,0,0],[.072,.76,.072],'barrel'),
          visualPart(mesh.cylinder8,m.steel,[.065,.04,-.66],[Math.PI/2,0,0],[.072,.76,.072],'barrel'),
          visualPart(mesh.cube,m.dark,[0,-.11,-.46],[0,0,0],[.27,.16,.38],'pump'),
          visualPart(mesh.cube,m.amber,[0,.17,-.20],[0,0,0],[.06,.07,.28],'sight'),
          visualPart(mesh.cube,m.dark,[0,-.21,.02],[-.12,0,0],[.11,.30,.14],'grip')
        ]
      };
      visuals.smg={
        muzzle:new Vec3(0,.02,-.68),
        parts:[
          visualPart(mesh.cube,m.dark,[0,0,-.10],[0,0,0],[.28,.24,.46],'body'),
          visualPart(mesh.cube,m.steel,[0,.02,-.41],[0,0,0],[.19,.17,.36],'shroud'),
          visualPart(mesh.cylinder8,m.violet,[0,.02,-.68],[Math.PI/2,0,0],[.09,.22,.09],'muzzle'),
          visualPart(mesh.cube,m.dark,[0,-.20,-.02],[-.18,0,0],[.12,.33,.15],'grip'),
          visualPart(mesh.cube,m.violet,[.15,-.08,-.05],[0,0,-.08],[.10,.34,.16],'mag'),
          visualPart(mesh.cube,m.steel,[0,.16,-.08],[0,0,0],[.10,.08,.28],'rail'),
          visualPart(mesh.cube,m.dark,[0,.21,-.16],[0,0,0],[.09,.10,.10],'sight')
        ]
      };
      visuals.nailgun={
        muzzle:new Vec3(0,.04,-.96),
        parts:[
          visualPart(mesh.cube,m.steel,[0,0,-.18],[0,0,0],[.34,.28,.64],'body'),
          visualPart(mesh.cylinder8,m.cyan,[0,.04,-.64],[Math.PI/2,0,0],[.11,.66,.11],'barrel'),
          visualPart(mesh.cylinder8,m.dark,[0,.04,-.98],[Math.PI/2,0,0],[.15,.18,.15],'muzzle'),
          visualPart(mesh.torusLow,m.cyan,[0,.04,-.83],[Math.PI/2,0,0],[.42,.42,.42],'coil'),
          visualPart(mesh.cube,m.dark,[0,-.22,-.03],[-.16,0,0],[.13,.36,.17],'grip'),
          visualPart(mesh.cube,m.cyan,[.20,-.05,-.15],[0,0,0],[.12,.18,.38],'cell'),
          visualPart(mesh.cube,m.dark,[0,.20,-.12],[0,0,0],[.12,.11,.30],'sight'),
          visualPart(mesh.cone6,m.steel,[-.23,.08,-.46],[0,0,.65],[.08,.36,.08],'spike'),
          visualPart(mesh.cone6,m.steel,[.23,.08,-.46],[0,0,-.65],[.08,.36,.08],'spike')
        ]
      };
      visuals.chainlance={
        muzzle:new Vec3(0,.04,-1.08),
        parts:[
          visualPart(mesh.cube,m.dark,[0,0,-.12],[0,0,0],[.33,.27,.68],'body'),
          visualPart(mesh.cylinder8,m.steel,[0,.04,-.72],[Math.PI/2,0,0],[.12,.78,.12],'barrel'),
          visualPart(mesh.cone8,m.steel,[0,.04,-1.12],[Math.PI/2,0,0],[.14,.42,.14],'harpoon'),
          visualPart(mesh.torusLow,m.violet,[0,.04,-.48],[Math.PI/2,0,0],[.58,.58,.58],'chainDrum'),
          visualPart(mesh.cylinder6,m.steel,[.22,.03,-.49],[0,0,0],[.055,.42,.055],'chainPin'),
          visualPart(mesh.cylinder6,m.steel,[-.22,.03,-.49],[0,0,0],[.055,.42,.055],'chainPin'),
          visualPart(mesh.cube,m.dark,[0,-.23,-.03],[-.16,0,0],[.14,.38,.18],'grip'),
          visualPart(mesh.cube,m.violet,[.22,-.07,-.12],[0,0,0],[.12,.20,.42],'cell'),
          visualPart(mesh.cube,m.steel,[0,.21,-.16],[0,0,0],[.12,.10,.32],'sight')
        ]
      };
      visuals.exorcist={
        muzzle:new Vec3(0,.04,-.91),
        parts:[
          visualPart(mesh.cube,m.steel,[0,0,-.12],[0,0,0],[.30,.25,.58],'body'),
          visualPart(mesh.cylinder8,m.cyan,[0,.04,-.58],[Math.PI/2,0,0],[.13,.58,.13],'barrel'),
          visualPart(mesh.cylinder8,m.dark,[0,.04,-.91],[Math.PI/2,0,0],[.18,.20,.18],'muzzle'),
          visualPart(mesh.torusLow,m.cyan,[0,.04,-.69],[Math.PI/2,0,0],[.46,.46,.46],'coil'),
          visualPart(mesh.sphere8,m.cyan,[.20,-.05,-.08],[0,0,0],[.17,.34,.17],'vial'),
          visualPart(mesh.sphere8,m.cyan,[-.20,-.05,-.08],[0,0,0],[.17,.34,.17],'vial'),
          visualPart(mesh.cube,m.dark,[0,-.22,.02],[-.17,0,0],[.13,.36,.17],'grip'),
          visualPart(mesh.cube,m.cyan,[0,.18,-.12],[0,0,0],[.08,.08,.30],'rail'),
          visualPart(mesh.cube,m.dark,[0,.23,-.18],[0,0,0],[.09,.10,.10],'sight')
        ]
      };
      const arms=[
        visualPart(mesh.cylinder8,m.flesh,[-.27,-.31,.08],[Math.PI/2+.35,0,-.18],[.18,.52,.18],'armL'),
        visualPart(mesh.cylinder8,m.glove,[-.15,-.18,-.12],[Math.PI/2+.2,0,-.14],[.19,.29,.19],'handL'),
        visualPart(mesh.cylinder8,m.flesh,[.30,-.29,-.02],[Math.PI/2+.28,0,.21],[.18,.56,.18],'armR'),
        visualPart(mesh.cylinder8,m.glove,[.15,-.17,-.26],[Math.PI/2+.14,0,.13],[.19,.30,.19],'handR')
      ];
      for(const visual of Object.values(visuals)) visual.parts=visual.parts.concat(arms.map(a=>visualPart(a.mesh,a.material,[a.position.x,a.position.y,a.position.z],[a.rotation.x,a.rotation.y,a.rotation.z],[a.scale.x,a.scale.y,a.scale.z],a.tag)));
      return visuals;
    }

    reset(metaLevels={}){
      this.states={};
      this.metaReserveMul=1+(metaLevels.munitions||0)*.06;
      this.currentId='rifle';
      this.cooldown=0;this.reloading=false;this.reloadTimer=0;this.ads=0;this.weaponKick=0;this.switchTimer=0;this.muzzleFlash=0;this.meleeCooldown=0;this.meleeTimer=0;
      this.ensureWeapon('rifle');this.ensureWeapon('shotgun');
      this.shotsFired=0;this.shotsHit=0;
    }

    ensureWeapon(id){
      if(this.states[id])return this.states[id];
      const config=D.WEAPONS[id];
      const state={id,mag:this.magazineSize(id),reserve:Math.round(config.reserve*this.metaReserveMul),maxReserve:Math.round(config.reserve*this.metaReserveMul)};
      this.states[id]=state;return state;
    }
    magazineSize(id){return Math.max(1,Math.round(D.WEAPONS[id].magazine*this.player.modifiers.magazineMul));}
    current(){return D.WEAPONS[this.currentId];}
    state(){return this.states[this.currentId];}

    switchTo(id,force=false){
      if(!D.WEAPONS[id]||!this.player.unlockedWeapons.has(id))return false;
      if(id===this.currentId&&!force)return false;
      this.cancelReload();this.currentId=id;this.ensureWeapon(id);this.switchTimer=.42;this.weaponKick=.2;this.game.audio.ui('select');
      return true;
    }
    cycle(direction){
      const ids=Object.values(D.WEAPONS).sort((a,b)=>a.slot-b.slot).filter(w=>this.player.unlockedWeapons.has(w.id)).map(w=>w.id);
      const index=ids.indexOf(this.currentId);if(index<0)return;
      this.switchTo(ids[(index+direction+ids.length)%ids.length]);
    }
    cancelReload(){this.reloading=false;this.reloadTimer=0;}

    update(dt){
      const input=this.game.input;
      this.cooldown=Math.max(0,this.cooldown-dt);
      this.meleeCooldown=Math.max(0,this.meleeCooldown-dt);
      this.meleeTimer=Math.max(0,this.meleeTimer-dt);
      this.muzzleFlash=Math.max(0,this.muzzleFlash-dt*9);
      this.switchTimer=Math.max(0,this.switchTimer-dt);
      this.weaponKick=damp(this.weaponKick,0,14,dt);
      this.weaponKickSide=damp(this.weaponKickSide,0,16,dt);
      this.swayX=damp(this.swayX,clamp(-input.mouseDX*.00045,-.055,.055),12,dt);
      this.swayY=damp(this.swayY,clamp(input.mouseDY*.00045,-.045,.045),12,dt);
      this.ads=damp(this.ads,input.mouse(2)?1:0,10,dt);

      if(input.consume('Digit1'))this.switchTo('rifle');
      if(input.consume('Digit2'))this.switchTo('shotgun');
      if(input.consume('Digit3'))this.switchTo('smg');
      if(input.consume('Digit4'))this.switchTo('nailgun');
      if(input.consume('Digit5'))this.switchTo('chainlance');
      if(input.consume('Digit6'))this.switchTo('exorcist');
      if(input.wheel!==0)this.cycle(input.wheel>0?1:-1);
      if(input.consume('KeyR'))this.startReload();
      if(input.consume('KeyG'))this.throwGrenade();
      if(input.consume('KeyV'))this.melee();

      if(this.reloading){
        this.reloadTimer-=dt;
        if(this.reloadTimer<=0)this.finishReload();
        return;
      }
      if(this.switchTimer>0)return;
      const config=this.current();
      const wantsFire=config.automatic?input.mouse(0):input.consumeMouse(0);
      const combatReady=typeof input.combatReady==='function'?input.combatReady():input.pointerLocked;
      if(wantsFire&&this.game.state==='playing'&&combatReady)this.fire();
    }

    startReload(){
      const state=this.state(),config=this.current(),maxMag=this.magazineSize(this.currentId);
      if(this.reloading||state.mag>=maxMag||state.reserve<=0)return false;
      this.reloading=true;this.reloadDuration=Math.max(.35,config.reload*this.player.reloadMultiplier());this.reloadTimer=this.reloadDuration;
      this.game.audio.reload('start');return true;
    }
    finishReload(){
      const state=this.state(),maxMag=this.magazineSize(this.currentId),needed=maxMag-state.mag,amount=Math.min(needed,state.reserve);
      state.mag+=amount;state.reserve-=amount;this.reloading=false;this.reloadTimer=0;this.game.audio.reload('end');
    }
    refillReserves(fraction=1){
      for(const id of this.player.unlockedWeapons){
        const state=this.ensureWeapon(id),config=D.WEAPONS[id];
        state.maxReserve=Math.round(config.reserve*this.metaReserveMul);
        state.reserve=Math.min(state.maxReserve,state.reserve+Math.ceil(state.maxReserve*fraction));
      }
    }
    resizeMagazines(refill=false){
      for(const state of Object.values(this.states)){
        const size=this.magazineSize(state.id);if(refill)state.mag=size;else state.mag=Math.min(state.mag,size);
      }
    }

    fire(){
      const config=this.current(),state=this.state();
      if(this.cooldown>0||this.reloading||this.switchTimer>0)return false;
      if(state.mag<=0){this.game.audio.dryFire();this.cooldown=.16;this.startReload();return false;}
      state.mag--;this.cooldown=1/(config.fireRate*this.player.fireRateMultiplier());
      this.muzzleFlash=1;this.weaponKick=Math.min(.42,this.weaponKick+config.kick);this.weaponKickSide+=randRange(-config.kick*.14,config.kick*.14);
      this.player.addRecoil(config.recoil*this.player.modifiers.recoilMul,randRange(-config.recoil*.28,config.recoil*.28)*this.player.modifiers.recoilMul);
      this.player.shake(config.id === 'shotgun' ? .16 : .055, config.id === 'shotgun' ? .16 : .09);
      this.game.audio.gun(config.id);
      this.shotsFired++;this.game.stats.shots++;

      cameraBasis(this.game.camera.yaw,this.game.camera.pitch,this.aimForward,this.aimRight,this.aimUp);
      const origin=this.game.camera.position.clone();
      const moving=Math.hypot(this.player.velocity.x,this.player.velocity.z)>1.2;
      const spread=(config.spread+(moving?config.movingSpread:0))*this.player.modifiers.spreadMul*lerp(1,.42,this.ads);
      let shotHit=false,totalDamage=0,firstImpact=null;
      const pellets=config.pellets||1;
      for(let pellet=0;pellet<pellets;pellet++){
        const angle=Math.random()*Math.PI*2,radius=Math.sqrt(Math.random())*spread;
        const direction=new Vec3().copy(this.aimForward).addScaled(this.aimRight,Math.cos(angle)*radius).addScaled(this.aimUp,Math.sin(angle)*radius).normalize();
        const result=this._trace(origin,direction,config);
        if(result.hit){shotHit=true;totalDamage+=result.damage;if(!firstImpact)firstImpact=result.position;}
        else if(!firstImpact&&result.position)firstImpact=result.position;
      }
      if(shotHit){this.shotsHit++;this.game.stats.hits++;}
      if(totalDamage>0&&this.player.modifiers.lifesteal>0)this.player.heal(Math.min(12,totalDamage*this.player.modifiers.lifesteal));
      const muzzle=this.getMuzzleWorldPosition();
      const tracerColor=config.tracerColor??(config.id==='shotgun'?0xffb05d:0xff6a55);
      const tracerWidth=config.id === 'nailgun' ? .085 : config.id === 'chainlance' ? .095 : config.id === 'exorcist' ? .052 : .035;
      if(firstImpact)this.game.spawnTracer(muzzle,firstImpact,tracerColor,tracerWidth);
      this.game.particles.burst(muzzle,{count:config.id==='shotgun'?12:config.id==='chainlance'?10:5,color:tracerColor,speedMin:.5,speedMax:2.8,sizeMin:.035,sizeMax:.10,lifeMin:.08,lifeMax:.20,gravity:0,directional:.8,direction:this.aimForward});
      if(state.mag<=0&&state.reserve>0)setTimeout(()=>{if(this.game.state==='playing'&&this.state()===state)this.startReload();},120);
      return true;
    }

    _trace(origin,direction,config){
      const world=this.game.arena.raycastWorld(origin,direction,config.range);
      const maxDistance=world.hit?Math.min(config.range,world.distance):config.range;
      const hits=[];
      for(const enemy of this.game.enemies){
        if(!enemy.alive||enemy.spawnTimer>.65)continue;
        const hit=enemy.raycast(origin,direction,maxDistance);
        if(hit.hit)hits.push({enemy,distance:hit.distance,zone:hit.zone});
      }
      hits.sort((a,b)=>a.distance-b.distance);
      const maxTargets=1+config.penetration+this.player.modifiers.penetration;
      let damageDone=0,hitAny=false,lastPosition=null;
      for(let index=0;index<Math.min(maxTargets,hits.length);index++){
        const hit=hits[index],distance=hit.distance;
        const falloff = distance <= config.falloffStart ? 1 : (distance >= config.falloffEnd ? .55 : lerp(1, .55, (distance - config.falloffStart) / (config.falloffEnd - config.falloffStart)));
        const headMultiplier=hit.zone==='head'?config.headMultiplier*this.player.modifiers.headMul:1;
        let damage=config.damage*this.player.damageMultiplier()*falloff*Math.pow(.78,index);
        if(config.special==='purifier'){
          damage*=1+this.player.corruption*.62;
          if(hit.enemy.type==='choir'||hit.enemy.type==='archdeacon'||hit.enemy.config.flying)damage*=1.24;
        }
        const hitPosition=origin.clone().addScaled(direction,distance);
        const result=hit.enemy.takeDamage(damage,{zone:hit.zone,headMultiplier,direction,weapon:config.id,source:'weapon',stun:config.special === 'chain_pull' ? .32 : config.special === 'purifier' ? .05 : 0,slow:config.special === 'chain_pull' ? .42 : 0,slowDuration:config.special === 'chain_pull' ? 1.65 : 0});
        if(config.special==='chain_pull'){
          this.game.spawnArc(origin,hitPosition,config.tracerColor);
          if(!hit.enemy.boss&&hit.enemy.alive){
            const pull=origin.clone().sub(hit.enemy.position);pull.y=0;
            if(pull.lengthSq()>.01){hit.enemy.position.addScaled(pull.normalizeXZ(),Math.min(2.8,.65+distance*.055));this.game.arena.resolvePosition(hit.enemy.position,hit.enemy.radius);}
          }
        }else if(config.special==='purifier'&&hit.enemy.alive){
          hit.enemy.ignite(16+this.player.corruption*24,2.25);
        }
        damageDone+=result.damage;hitAny=true;lastPosition=hitPosition;
        this.game.stats.damage+=result.damage;
        this.game.ui.hitmarker(hit.zone==='head',result.killed);
        this.game.audio.hit(hit.zone==='head');
        const bloodDirection=direction.clone().scale(.8);
        this.game.particles.burst(hitPosition,{count:hit.zone==='head'?14:8,color:hit.enemy.elite?0xc36c32:0xb92f36,speedMin:.4,speedMax:3.3,sizeMin:.04,sizeMax:.13,lifeMin:.16,lifeMax:.62,gravity:5,direction:bloodDirection,directional:1.5,floorBounce:.12});
        if(chance(this.player.modifiers.chainChance))this._chainArc(hit.enemy,result.damage*this.player.modifiers.chainDamage);
        if(hit.zone === 'head') this.game.stats.headshots++;
      }
      if(!hitAny){
        const position=origin.clone().addScaled(direction,maxDistance);
        if(world.hit){
          this.game.particles.burst(position,{count:5,color:0xd5a167,speedMin:.2,speedMax:2.3,sizeMin:.025,sizeMax:.07,lifeMin:.1,lifeMax:.38,gravity:4,direction:direction.clone().scale(-1),directional:.8});
        }
        return {hit:false,damage:0,position};
      }
      return {hit:true,damage:damageDone,position:lastPosition};
    }

    melee(){
      const input=this.game.input,combatReady=typeof input.combatReady==='function'?input.combatReady():input.pointerLocked;
      if(this.meleeCooldown>0||this.switchTimer>0||this.game.state!=='playing'||!combatReady)return false;
      this.cancelReload();
      this.meleeCooldown=.62;
      this.meleeTimer=.34;
      this.weaponKick=Math.max(this.weaponKick,.28);
      this.player.shake(.11,.14);
      this.game.audio.melee?.();
      cameraBasis(this.game.camera.yaw,this.game.camera.pitch,this.aimForward,this.aimRight,this.aimUp);
      const origin=this.game.camera.position.clone();
      let target=null,best=2.65;
      for(const enemy of this.game.enemies){
        if(!enemy.alive||enemy.spawnTimer>.65)continue;
        const center=new Vec3(enemy.position.x,enemy.config.flying?enemy.position.y:enemy.height*.52,enemy.position.z);
        const to=center.clone().sub(origin),distance=to.length();
        if(distance>best||distance<.001)continue;
        const facing=to.clone().scale(1/distance);
        if(facing.dot(this.aimForward)<.58)continue;
        if(this.game.arena.lineBlocked(origin,center))continue;
        target={enemy,center,direction:facing};best=distance;
      }
      if(!target){
        const end=origin.clone().addScaled(this.aimForward,2.4);
        this.game.spawnTracer(origin.clone().addScaled(this.aimRight,.22),end,0xbec4c6,.025);
        return true;
      }
      const base=78*(this.player.classId==='executioner'?1.22:1)*this.player.damageMultiplier();
      const result=target.enemy.takeDamage(base,{zone:'body',headMultiplier:1,direction:target.direction,weapon:'melee',source:'melee',stun:.62,slow:.3,slowDuration:.9});
      this.game.stats.damage+=result.damage;
      this.game.ui.hitmarker(false,result.killed);
      this.game.audio.hit(false);
      this.game.spawnArc(origin.clone().addScaled(this.aimRight,.18),target.center,0xc9a27c);
      this.game.particles.burst(target.center,{count:12,color:0xb83239,speedMin:.5,speedMax:3.2,sizeMin:.04,sizeMax:.13,lifeMin:.15,lifeMax:.48,gravity:5,direction:target.direction,directional:1.2});
      return true;
    }

    _chainArc(source,damage){
      let nearest=null,dist=5.8;
      for(const enemy of this.game.enemies){
        if(enemy===source||!enemy.alive)continue;
        const d=enemy.position.distanceTo(source.position);if(d<dist){dist=d;nearest=enemy;}
      }
      if(nearest){
        nearest.takeDamage(damage,{zone:'body',headMultiplier:1,stun:.18,source:'chain'});
        this.game.spawnArc(source.position,nearest.position,0x69e3e8);
      }
    }

    throwGrenade(){
      if(this.player.grenades<=0||this.reloading||this.switchTimer>0){this.game.audio.ui('error');return false;}
      cameraBasis(this.game.camera.yaw,this.game.camera.pitch,this.aimForward,this.aimRight,this.aimUp);
      this.player.grenades--;
      const position=this.game.camera.position.clone().addScaled(this.aimForward,.55).addScaled(this.aimRight,.15);
      const velocity=this.aimForward.clone().scale(12.5).add(new Vec3(0,3.3,0)).addScaled(this.player.velocity,.35);
      this.game.projectiles.push(new Projectile(this.game,{type:'grenade',position,velocity,damage:0,radius:.16,life:5,gravity:12,bounces:3,fuse:2.25,explosionRadius:6.4,explosionDamage:175,color:0xd88b43}));
      this.game.audio.ui('confirm');this.player.shake(.07,.08);return true;
    }

    getMuzzleWorldPosition(){
      cameraBasis(this.game.camera.yaw,this.game.camera.pitch,this.aimForward,this.aimRight,this.aimUp);
      const local=this.visuals[this.currentId].muzzle;
      return this.game.camera.position.clone().addScaled(this.aimRight,local.x+.31*(1-this.ads)).addScaled(this.aimUp,local.y-.25*(1-this.ads)).addScaled(this.aimForward,-local.z+.12);
    }

    _buildViewRoot(){
      cameraBasis(this.game.camera.yaw,this.game.camera.pitch,this.aimForward,this.aimRight,this.aimUp);
      const bob=Math.sin(this.player.bobTime)*.012*this.player.bobAmount;
      const bobY=Math.abs(Math.cos(this.player.bobTime))*.016*this.player.bobAmount;
      const hide=this.switchTimer>0?Math.sin(clamp(this.switchTimer/.42,0,1)*Math.PI)*.32:0;
      const reload=this.reloading?Math.sin((1-this.reloadTimer/this.reloadDuration)*Math.PI):0;
      const melee=this.meleeTimer>0?Math.sin((1-this.meleeTimer/.34)*Math.PI):0;
      const rightOffset=lerp(.32,.035,this.ads)+this.swayX+this.weaponKickSide-melee*.34;
      const upOffset=lerp(-.27,-.16,this.ads)-this.swayY-bobY-hide-reload*.15+melee*.12;
      const forwardOffset=.50-this.weaponKick*.45+bob+melee*.28;
      const origin=this.game.camera.position.clone().addScaled(this.aimRight,rightOffset).addScaled(this.aimUp,upOffset).addScaled(this.aimForward,forwardOffset);
      const r=this.aimRight,u=this.aimUp,f=this.aimForward;
      this.rootMatrix[0]=r.x;this.rootMatrix[1]=r.y;this.rootMatrix[2]=r.z;this.rootMatrix[3]=0;
      this.rootMatrix[4]=u.x;this.rootMatrix[5]=u.y;this.rootMatrix[6]=u.z;this.rootMatrix[7]=0;
      this.rootMatrix[8]=-f.x;this.rootMatrix[9]=-f.y;this.rootMatrix[10]=-f.z;this.rootMatrix[11]=0;
      this.rootMatrix[12]=origin.x;this.rootMatrix[13]=origin.y;this.rootMatrix[14]=origin.z;this.rootMatrix[15]=1;
      if(reload>0||hide>0||melee>0){
        const local=new Transform(new Vec3(),new Vec3(reload*.42+melee*.22,melee*.58,reload*.48+hide*.35-melee*.35),new Vec3(1,1,1));local.updateMatrix();
        mat4Multiply(this.rootMatrix,this.rootMatrix,local.matrix);
      }
    }

    drawViewmodel(renderer,time){
      this._buildViewRoot();
      const visual=this.visuals[this.currentId];
      for(const part of visual.parts){
        part.local.position.copy(part.position);part.local.rotation.copy(part.rotation);part.local.scale.copy(part.scale);
        if(part.tag==='pump'&&this.weaponKick>.02)part.local.position.z+=this.weaponKick*.7;
        if(part.tag==='coil')part.local.rotation.z+=time*2.5;
        if(part.tag==='chainDrum')part.local.rotation.z+=time*(this.muzzleFlash>0?8:1.4);
        if(part.tag==='vial')part.local.scale.y*=1+Math.sin(time*4+part.position.x*7)*.06;
        if(part.tag==='mag'&&this.reloading)part.local.position.y-=Math.sin((1-this.reloadTimer/this.reloadDuration)*Math.PI)*.25;
        part.local.updateMatrix();mat4Multiply(part.world,this.rootMatrix,part.local.matrix);renderer.draw(part.mesh,part.world,part.material);
      }
      if(this.muzzleFlash>0){
        const local=visual.muzzle;
        this.tempTransform.position.copy(local);this.tempTransform.rotation.set(Math.PI/2,0,time*8);const s=.22+this.muzzleFlash*.18;this.tempTransform.scale.set(s,s*1.6,s);this.tempTransform.updateMatrix();
        mat4Multiply(this.tempTransform.matrix,this.rootMatrix,this.tempTransform.matrix);renderer.draw(renderer.meshes.cone8,this.tempTransform.matrix,this.materials.muzzle);
      }
    }

    hud(){
      const config=this.current(),state=this.state();
      return {id:config.id,name:config.name,subtitle:config.subtitle,mag:state?.mag||0,reserve:state?.reserve||0,reloading:this.reloading,reloadProgress:this.reloading?1-this.reloadTimer/this.reloadDuration:0};
    }
  }

  const _tmpForward=new Vec3(),_tmpRight=new Vec3(),_tmpUp=new Vec3();
  NT.WeaponSystem=WeaponSystem;
})();
