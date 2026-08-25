(function () {
  'use strict';

  const NT = window.NT = window.NT || {};
  const M = NT.Math;
  const E = NT.Engine;
  const D = NT.Data;
  const { Vec3, clamp, randRange, pick, rayAabb, resolveCircleAabb, mat4, mat4FromTransform, mat4Multiply, colorHex } = M;
  const { Transform, Material, modelMatrixBetween } = E;

  class Arena {
    constructor(game) {
      this.game = game;
      this.renderer = game.renderer;
      this.meshes = this.renderer.meshes;
      this.staticParts = [];
      this.dynamicParts = [];
      this.colliders = [];
      this.spawnPoints = [];
      this.stations = [];
      this.hazards = [];
      this.decals = [];
      this.bounds = { minX: -24.7, maxX: 24.7, minZ: -24.7, maxZ: 24.7 };
      this.gatePulse = 0;
      this.materials = this._createMaterials();
      this._build();
    }

    _createMaterials() {
      return {
        floor: new Material({ color:0x1a191b, emissive:0x050203, pattern:1, metallic:.8 }),
        floorAlt: new Material({ color:0x272225, emissive:0x090305, pattern:1, metallic:.7 }),
        wall: new Material({ color:0x242326, emissive:0x070203, pattern:1, metallic:.65 }),
        wallDark: new Material({ color:0x111113, emissive:0x030102, pattern:1, metallic:.82 }),
        steel: new Material({ color:D.COLORS.ironLight, emissive:0x090a0b, pattern:1, metallic:.95 }),
        rust: new Material({ color:0x4b302b, emissive:0x0d0403, pattern:1, metallic:.72 }),
        flesh: new Material({ color:D.COLORS.flesh, emissive:0x180005, pattern:2, metallic:.05 }),
        fleshDark: new Material({ color:0x41161d, emissive:0x1d0006, pattern:2, metallic:.05 }),
        bone: new Material({ color:D.COLORS.bone, emissive:0x130806, pattern:0, metallic:.12 }),
        ritual: new Material({ color:0x5c1017, emissive:D.COLORS.ritual, pattern:3, metallic:.4, pulse:.8 }),
        ritualBright: new Material({ color:0x7c1821, emissive:0xff2d36, pattern:3, metallic:.3, pulse:1.2 }),
        cyan: new Material({ color:0x214b4e, emissive:D.COLORS.cyan, pattern:3, metallic:.5, pulse:.85 }),
        amber: new Material({ color:0x4a3423, emissive:D.COLORS.amber, pattern:3, metallic:.6, pulse:.7 }),
        portal: new Material({ color:0x260b18, emissive:0xa3315a, pattern:4, metallic:0, alpha:.48, doubleSided:true, additive:true, depthWrite:false, pulse:1.1 }),
        glass: new Material({ color:0x536a71, emissive:0x102327, pattern:0, alpha:.23, doubleSided:true, depthWrite:false }),
        blood: new Material({ color:0x4c080d, emissive:0x070001, pattern:2, alpha:.62, doubleSided:true, depthWrite:false }),
        hazard: new Material({ color:0x5c0710, emissive:0xf02030, pattern:3, alpha:.52, doubleSided:true, additive:true, depthWrite:false, pulse:1.2 }),
        shock: new Material({ color:0x18454b, emissive:0x49e0e8, pattern:3, alpha:.62, doubleSided:true, additive:true, depthWrite:false, pulse:1.4 })
      };
    }

    _part(meshName, material, position, rotation, scale, collider = false, tag = '') {
      const transform = new Transform(
        new Vec3(position[0],position[1],position[2]),
        new Vec3(rotation?.[0]||0,rotation?.[1]||0,rotation?.[2]||0),
        new Vec3(scale[0],scale[1],scale[2])
      );
      transform.updateMatrix();
      const part = { mesh:this.meshes[meshName], material, transform, matrix:transform.matrix, tag };
      this.staticParts.push(part);
      if (collider) {
        this.colliders.push({
          min:new Vec3(position[0]-scale[0]*.5, position[1]-scale[1]*.5, position[2]-scale[2]*.5),
          max:new Vec3(position[0]+scale[0]*.5, position[1]+scale[1]*.5, position[2]+scale[2]*.5),
          tag
        });
      }
      return part;
    }

    _dynamic(meshName, material, position, rotation, scale, update, tag = '') {
      const transform = new Transform(new Vec3(...position), new Vec3(...rotation), new Vec3(...scale));
      const part = { mesh:this.meshes[meshName], material, transform, update, tag };
      this.dynamicParts.push(part);
      return part;
    }

    _chain(a, b, radius = .035, material = this.materials.steel, dynamic = false) {
      const matrix = modelMatrixBetween(mat4(), a, b, radius);
      const part = { mesh:this.meshes.cylinder6, material, matrix, tag:'chain' };
      if (dynamic) this.dynamicParts.push(part); else this.staticParts.push(part);
      return part;
    }

    _build() {
      const m = this.materials;
      // Sol principal et rainures.
      this._part('cube',m.floor,[0,-.35,0],[0,0,0],[52,.7,52],false,'floor');
      for (let x=-20;x<=20;x+=5) this._part('cube',m.floorAlt,[x,-.025,0],[0,0,0],[.10,.035,48],false,'groove');
      for (let z=-20;z<=20;z+=5) this._part('cube',m.floorAlt,[0,-.02,z],[0,0,0],[48,.04,.10],false,'groove');
      for (let k=-20;k<=20;k+=10) {
        this._part('cube',m.ritual,[k,.008,0],[0,0,0],[.045,.02,48],false,'sigil');
        this._part('cube',m.ritual,[0,.009,k],[0,0,0],[48,.02,.045],false,'sigil');
      }

      // Enceinte extérieure.
      this._part('cube',m.wall,[0,3,-25.5],[0,0,0],[52,7,1.4],true,'outer-wall');
      this._part('cube',m.wall,[0,3,25.5],[0,0,0],[52,7,1.4],true,'outer-wall');
      this._part('cube',m.wall,[-25.5,3,0],[0,0,0],[1.4,7,52],true,'outer-wall');
      this._part('cube',m.wall,[25.5,3,0],[0,0,0],[1.4,7,52],true,'outer-wall');
      for (let p=-20;p<=20;p+=8) {
        this._part('cube',m.wallDark,[p,3.6,-24.6],[0,0,0],[1.2,8.5,2.2],true,'buttress');
        this._part('cube',m.wallDark,[p,3.6,24.6],[0,0,0],[1.2,8.5,2.2],true,'buttress');
        this._part('cube',m.wallDark,[-24.6,3.6,p],[0,0,0],[2.2,8.5,1.2],true,'buttress');
        this._part('cube',m.wallDark,[24.6,3.6,p],[0,0,0],[2.2,8.5,1.2],true,'buttress');
      }

      // Autel et portail central.
      this._part('cylinder12',m.wallDark,[0,.3,-7],[0,0,0],[10,.6,10],true,'dais');
      this._part('cylinder12',m.rust,[0,.66,-7],[0,0,0],[7.7,.16,7.7],false,'dais-ring');
      for (let i=0;i<12;i++) {
        const angle=i/12*Math.PI*2, radius=4.25;
        this._part('cube',i%3===0?m.ritual:m.rust,[Math.cos(angle)*radius,.77,-7+Math.sin(angle)*radius],[0,-angle,0],[.18,.08,1.1],false,'rune');
      }
      this._part('cube',m.wallDark,[-4.9,3.2,-7],[0,0,0],[1.25,6.5,2.1],true,'gate-pillar');
      this._part('cube',m.wallDark,[4.9,3.2,-7],[0,0,0],[1.25,6.5,2.1],true,'gate-pillar');
      this._part('prism',m.bone,[-4.9,7,-7],[0,0,Math.PI],[1.9,2.2,2.4],false,'gate-spike');
      this._part('prism',m.bone,[4.9,7,-7],[0,0,Math.PI],[1.9,2.2,2.4],false,'gate-spike');
      this.gateRingA = this._dynamic('torus',m.rust,[0,3.8,-7],[Math.PI/2,0,0],[10.2,10.2,10.2],(part,time)=>{part.transform.rotation.z=time*.10;});
      this.gateRingB = this._dynamic('torusLow',m.ritual,[0,3.8,-6.92],[Math.PI/2,0,0],[7.9,7.9,7.9],(part,time)=>{part.transform.rotation.z=-time*.18;});
      this.gateRingC = this._dynamic('torusLow',m.ritualBright,[0,3.8,-6.84],[Math.PI/2,0,0],[5.8,5.8,5.8],(part,time)=>{part.transform.rotation.z=time*.27;});
      this.portalDisc = this._dynamic('cylinder12',m.portal,[0,3.8,-6.78],[Math.PI/2,0,0],[7.8,.035,7.8],(part,time)=>{
        part.transform.rotation.y=time*.2;
        const pulse=1+Math.sin(time*1.3)*.025+this.gatePulse*.08;
        part.transform.scale.set(7.8*pulse,.035,7.8*pulse);
      });

      // Pylônes rituels et couvertures.
      const pillarPositions = [[-13,-13],[13,-13],[-13,13],[13,13],[-17,0],[17,0],[0,16]];
      for (let index=0; index<pillarPositions.length; index++) {
        const [x,z]=pillarPositions[index];
        this._part('cylinder8',m.wallDark,[x,2,z],[0,index*.3,0],[2.2,4,2.2],true,'pillar');
        this._part('torusLow',index%2?m.ritual:m.rust,[x,3.4,z],[0,0,0],[2.6,2.6,2.6],false,'pillar-ring');
        for (let s=0;s<4;s++) {
          const a=s*Math.PI/2+.4;
          this._part('cone6',m.bone,[x+Math.cos(a)*1.15,4.3,z+Math.sin(a)*1.15],[Math.PI,0,-a],[.38,1.45,.38],false,'spike');
        }
      }
      const cover = [
        [-8,1,7,4,2,1.4],[8,1,7,4,2,1.4],[-8,1,-17,4,2,1.4],[8,1,-17,4,2,1.4],
        [-18,1,-8,1.4,2,4],[18,1,-8,1.4,2,4],[-18,1,9,1.4,2,4],[18,1,9,1.4,2,4],
        [-5,.8,17,3,1.6,2.1],[5,.8,17,3,1.6,2.1]
      ];
      cover.forEach((c,index)=>this._part('cube',index%3===0?m.fleshDark:m.rust,[c[0],c[1],c[2]],[0,index*.31,0],[c[3],c[4],c[5]],true,'cover'));

      // Cages et tables de dissection.
      for (const side of [-1,1]) {
        const x=side*20;
        this._part('cube',m.rust,[x,.25,17],[0,0,0],[5,.5,5],true,'cage-base');
        for (let k=-2;k<=2;k++) {
          this._part('cylinder6',m.steel,[x+k,2.5,14.6],[0,0,0],[.12,5,.12],true,'cage-bar');
          this._part('cylinder6',m.steel,[x+k,2.5,19.4],[0,0,0],[.12,5,.12],true,'cage-bar');
          this._part('cylinder6',m.steel,[x-2.4,2.5,17+k],[0,0,0],[.12,5,.12],true,'cage-bar');
          this._part('cylinder6',m.steel,[x+2.4,2.5,17+k],[0,0,0],[.12,5,.12],true,'cage-bar');
        }
        this._part('cube',m.rust,[x,1.1,-18],[0,0,0],[5.2,.5,2.1],true,'table');
        this._part('cube',m.flesh,[x,1.45,-18],[0,0,0],[4.3,.28,1.35],false,'body');
      }

      // Chaînes suspendues et crochets.
      const chainAnchors=[[-21,-16],[-16,-21],[-9,-21],[0,-21],[9,-21],[16,-21],[21,-16],[-21,-4],[21,-4],[-21,7],[21,7],[-12,21],[0,21],[12,21]];
      chainAnchors.forEach(([x,z],index)=>{
        const endY=randRange(1.8,4.5), sway=randRange(-.6,.6);
        const segments=5;
        let last=new Vec3(x,10,z);
        for(let s=1;s<=segments;s++){
          const t=s/segments;
          const next=new Vec3(x+Math.sin(t*Math.PI)*sway,10+(endY-10)*t,z+Math.cos(t*Math.PI)*sway*.35);
          this._chain(last,next,.035,m.steel);
          last=next;
        }
        this._part('cone8',m.rust,[last.x,last.y-.55,last.z],[0,0,index%2?-.35:.35],[.42,1.1,.42],false,'hook');
      });

      // Greffes organiques murales.
      const growths=[[-23.9,1.8,-13],[23.9,2.6,-17],[-23.9,3.2,5],[23.9,1.7,12],[-13,2,-23.9],[13,3,-23.9],[-8,2.5,23.9],[9,1.8,23.9]];
      growths.forEach((g,index)=>{
        this._part('sphere8',m.flesh,[g[0],g[1],g[2]],[0,index*.4,0],[1.5+Math.random(),2.5+Math.random()*1.5,1.2+Math.random()],false,'growth');
        for(let s=0;s<4;s++) this._part('cone6',m.bone,[g[0]+randRange(-.8,.8),g[1]+randRange(-.6,.9),g[2]+randRange(-.8,.8)],[randRange(-1,1),randRange(-1,1),randRange(-1,1)],[.18,randRange(.6,1.4),.18],false,'bone-spike');
      });

      this._buildStations();
      this._buildSpawns();
    }

    _buildStations() {
      const defs = [
        { id:'shock', type:'shock', position:new Vec3(0,0,2.2), material:this.materials.cyan, cost:D.STATIONS.shock.cost },
        { id:'ammo', type:'ammo', position:new Vec3(-9,0,2), material:this.materials.amber, cost:D.STATIONS.ammo.cost },
        { id:'med', type:'med', position:new Vec3(9,0,2), material:this.materials.ritual, cost:D.STATIONS.med.cost },
        { id:'armory-smg', type:'armory', weapon:'smg', position:new Vec3(-9,0,-11.5), material:this.materials.portal, cost:D.WEAPONS.smg.price, unlockWave:D.WEAPONS.smg.unlockWave },
        { id:'armory-nailgun', type:'armory', weapon:'nailgun', position:new Vec3(9,0,-11.5), material:this.materials.cyan, cost:D.WEAPONS.nailgun.price, unlockWave:D.WEAPONS.nailgun.unlockWave },
        { id:'armory-chainlance', type:'armory', weapon:'chainlance', position:new Vec3(-14.5,0,-4), material:this.materials.portal, cost:D.WEAPONS.chainlance.price, unlockWave:D.WEAPONS.chainlance.unlockWave },
        { id:'armory-exorcist', type:'armory', weapon:'exorcist', position:new Vec3(14.5,0,-4), material:this.materials.cyan, cost:D.WEAPONS.exorcist.price, unlockWave:D.WEAPONS.exorcist.unlockWave }
      ];
      defs.forEach((station,index)=>{
        station.cooldown=0;
        station.active=true;
        station.transform=new Transform(station.position.clone().add(new Vec3(0,.52,0)),new Vec3(0,index*.9,0),new Vec3(1.4,1.05,1.4));
        station.ringTransform=new Transform(station.position.clone().add(new Vec3(0,1.35,0)),new Vec3(0,0,0),new Vec3(1.75,1.75,1.75));
        this.stations.push(station);
        this._part('cylinder8',this.materials.wallDark,[station.position.x,.25,station.position.z],[0,0,0],[2.1,.5,2.1],true,'station');
      });
    }

    _buildSpawns() {
      const points = [
        [-22,-21],[-14,-22],[-5,-22],[5,-22],[14,-22],[22,-21],
        [-22,-12],[-22,-3],[-22,7],[-22,15],[-21,22],
        [22,-12],[22,-3],[22,7],[22,15],[21,22],
        [-14,22],[-5,22],[5,22],[14,22]
      ];
      points.forEach(([x,z],index)=>this.spawnPoints.push({ position:new Vec3(x,0,z), index, cooldown:0 }));
    }

    reset() {
      this.hazards.length=0;
      this.decals.length=0;
      this.stations.forEach(station=>{ station.cooldown=0; station.active=true; });
      this.gatePulse=0;
    }

    update(dt,time) {
      this.gatePulse=Math.max(0,this.gatePulse-dt*1.8);
      for(const part of this.dynamicParts){
        if(part.update) part.update(part,time,dt,this);
        if(part.transform) part.transform.updateMatrix();
      }
      for(const station of this.stations){
        station.cooldown=Math.max(0,station.cooldown-dt);
        station.transform.rotation.y+=dt*(station.type === 'armory' ? .55 : .28);
        station.transform.position.y=.55+Math.sin(time*1.8+station.position.x)*.05;
        station.transform.updateMatrix();
        station.ringTransform.rotation.y-=dt*.7;
        station.ringTransform.position.y=1.35+Math.sin(time*2.2+station.position.z)*.08;
        const s=1.75+Math.sin(time*2.4+station.position.x)*.08;
        station.ringTransform.scale.set(s,s,s);
        station.ringTransform.updateMatrix();
      }
      this._updateHazards(dt,time);
      for(const spawn of this.spawnPoints) spawn.cooldown=Math.max(0,spawn.cooldown-dt);
    }

    draw(time) {
      const r=this.renderer;
      for(const part of this.staticParts) r.draw(part.mesh,part.matrix,part.material);
      for(const part of this.dynamicParts) r.draw(part.mesh,part.matrix||part.transform.matrix,part.material);
      for(const station of this.stations){
        const unavailable=station.type==='armory' && (this.game.wave<station.unlockWave || this.game.player?.unlockedWeapons?.has(station.weapon));
        const material=unavailable?this.materials.wallDark:station.material;
        r.draw(this.meshes.cube,station.transform.matrix,material);
        r.draw(this.meshes.torusLow,station.ringTransform.matrix,material);
      }
      for(const decal of this.decals) r.draw(this.meshes.plane,decal.matrix,decal.material);
      this._drawHazards(time);
    }

    addBloodDecal(position,size=1,color=0x4c080d) {
      if(!this.game.settings.gore) return;
      const transform=new Transform(new Vec3(position.x,.012,position.z),new Vec3(0,Math.random()*Math.PI*2,0),new Vec3(size*randRange(.7,1.25),1,size*randRange(.55,1.15)));
      transform.updateMatrix();
      const material=this.materials.blood.clone({color:colorHex(color),alpha:randRange(.32,.6)});
      this.decals.push({matrix:transform.matrix,material});
      if(this.decals.length>55) this.decals.shift();
    }

    triggerGatePulse(amount=1){ this.gatePulse=Math.max(this.gatePulse,amount); }

    resolvePosition(position,radius=.42) {
      const oldX=position.x, oldZ=position.z;
      position.x=clamp(position.x,this.bounds.minX+radius,this.bounds.maxX-radius);
      position.z=clamp(position.z,this.bounds.minZ+radius,this.bounds.maxZ-radius);
      for(const collider of this.colliders){
        if(collider.tag==='dais') continue;
        resolveCircleAabb(position,radius,collider.min,collider.max);
      }
      return oldX!==position.x || oldZ!==position.z;
    }

    raycastWorld(origin,direction,maxDistance=100) {
      let nearest=Infinity, collider=null;
      for(const item of this.colliders){
        const distance=rayAabb(origin,direction,item.min,item.max);
        if(distance<nearest && distance<=maxDistance){nearest=distance;collider=item;}
      }
      return { distance:nearest, collider, hit:nearest!==Infinity };
    }

    lineBlocked(a,b) {
      const direction=new Vec3(b.x-a.x,b.y-a.y,b.z-a.z);
      const distance=direction.length();
      if(distance<.001) return false;
      direction.scale(1/distance);
      return this.raycastWorld(a,direction,distance-.2).hit;
    }

    getSpawnPoint(playerPosition,minDistance=12) {
      const candidates=this.spawnPoints.filter(spawn=>spawn.cooldown<=0 && spawn.position.distanceToXZ(playerPosition)>=minDistance);
      const pool=candidates.length?candidates:this.spawnPoints;
      let best=pick(pool);
      // Favoriser les points hors du regard direct du joueur.
      if(this.game.camera){
        const hidden=pool.filter(spawn=>{
          const to=new Vec3(spawn.position.x-playerPosition.x,0,spawn.position.z-playerPosition.z).normalizeXZ();
          return to.dot(this.game.camera.forward)<.15 || this.lineBlocked(new Vec3(playerPosition.x,1.5,playerPosition.z),new Vec3(spawn.position.x,1.2,spawn.position.z));
        });
        if(hidden.length) best=pick(hidden);
      }
      best.cooldown=2.5;
      return best.position.clone();
    }

    nearestStation(position,maxDistance=2.5) {
      let best=null, distance=maxDistance;
      for(const station of this.stations){
        if(station.type==='armory' && this.game.wave<station.unlockWave) continue;
        const d=station.position.distanceToXZ(position);
        if(d<distance){distance=d;best=station;}
      }
      return best;
    }

    activateStation(station) {
      const game=this.game, player=game.player;
      if(!station || station.cooldown>0) return false;
      if(station.type==='armory' && player.unlockedWeapons.has(station.weapon)) return false;
      if(player.essence<station.cost){ game.ui.toast('RESSOURCES INSUFFISANTES',`${station.cost} essence requise`,'error'); game.audio.ui('error'); return false; }
      player.essence-=station.cost;
      if(station.type==='shock'){
        station.cooldown=D.STATIONS.shock.cooldown;
        game.activateShockGrid(station.position);
      }else if(station.type==='ammo'){
        station.cooldown=D.STATIONS.ammo.cooldown;
        game.weapons.refillReserves(.55);
        game.ui.toast('RÉSERVES RÉAPPROVISIONNÉES','Munitions restaurées');
        game.audio.pickup();
      }else if(station.type==='med'){
        station.cooldown=D.STATIONS.med.cooldown;
        const rate=game.currentModifier?.healingRate??1;
        player.heal(55*rate);
        player.corruption=Math.max(0,player.corruption-.28*rate);
        game.ui.toast('PURIFICATION TERMINÉE','Santé et stabilité restaurées');
        game.audio.pickup();
      }else if(station.type==='armory'){
        player.unlockedWeapons.add(station.weapon);
        game.weapons.ensureWeapon(station.weapon);
        game.weapons.switchTo(station.weapon,true);
        game.ui.toast('ARME DÉVERROUILLÉE',D.WEAPONS[station.weapon].name);
        game.audio.wave();
      }
      game.stats.essenceSpent+=station.cost;
      return true;
    }

    stationPrompt(station) {
      if(!station) return null;
      if(station.type==='armory' && this.game.player.unlockedWeapons.has(station.weapon)) return { title:'ARME DÉJÀ ACQUISE', cost:'' };
      if(station.cooldown>0) return { title:'SYSTÈME EN RECHARGE', cost:`${station.cooldown.toFixed(1)} s` };
      if(station.type==='armory') return { title:`DÉVERROUILLER ${D.WEAPONS[station.weapon].name}`, cost:`◆ ${station.cost}` };
      const def=D.STATIONS[station.type];
      return { title:def.name, cost:`◆ ${station.cost}` };
    }

    scheduleChainStrike(position) {
      this.hazards.push({ type:'chain', position:position.clone(), timer:1.65, duration:2.2, impacted:false, radius:2.55, phase:Math.random()*Math.PI*2 });
    }

    _updateHazards(dt,time) {
      for(let i=this.hazards.length-1;i>=0;i--){
        const h=this.hazards[i];
        h.timer-=dt; h.duration-=dt;
        if(!h.impacted && h.timer<=0){
          h.impacted=true;
          this.game.onChainImpact(h.position,h.radius);
        }
        if(h.duration<=0) this.hazards.splice(i,1);
      }
    }

    _drawHazards(time) {
      const r=this.renderer;
      for(const h of this.hazards){
        const pulse=1+Math.sin(time*8+h.phase)*.11;
        const marker=new Transform(new Vec3(h.position.x,.025,h.position.z),new Vec3(0,time*.25,0),new Vec3(h.radius*2*pulse,1,h.radius*2*pulse));
        marker.updateMatrix();
        r.draw(this.meshes.plane,marker.matrix,h.impacted?this.materials.wallDark:this.materials.hazard);
        if(h.impacted){
          const start=new Vec3(h.position.x,11,h.position.z), end=new Vec3(h.position.x,.15,h.position.z);
          const chain=modelMatrixBetween(mat4(),start,end,.10);
          r.draw(this.meshes.cylinder6,chain,this.materials.ritualBright);
        }else{
          const indicator=new Transform(new Vec3(h.position.x,6.5,h.position.z),new Vec3(time*1.4,time*.9,0),new Vec3(.75,.75,.75));
          indicator.updateMatrix();
          r.draw(this.meshes.torusLow,indicator.matrix,this.materials.hazard);
        }
      }
    }
  }

  NT.Arena = Arena;
})();
