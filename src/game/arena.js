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
      this.currentSectorId = 'sanctum';
      this.sector = null;
      this.objectiveZone = null;
      this.gatePulse = 0;
      this.materials = this._createMaterials();
      this.storyArtifactTransform = new Transform();
      this.setSector('sanctum');
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
        shock: new Material({ color:0x18454b, emissive:0x49e0e8, pattern:3, alpha:.62, doubleSided:true, additive:true, depthWrite:false, pulse:1.4 }),
        objectiveRitual: new Material({ color:0x5c0710, emissive:0xff3945, pattern:3, alpha:.34, doubleSided:true, additive:true, depthWrite:false, pulse:1.1 }),
        objectiveAmber: new Material({ color:0x5a3b1c, emissive:0xf1a24f, pattern:3, alpha:.34, doubleSided:true, additive:true, depthWrite:false, pulse:1.05 }),
        objectiveCyan: new Material({ color:0x15494d, emissive:0x60f3ee, pattern:3, alpha:.36, doubleSided:true, additive:true, depthWrite:false, pulse:1.15 }),
        storyArchive: new Material({ color:0x8cd3c6, emissive:0x29534f, pattern:1, metallic:.6 }),
        storyCollected: new Material({ color:0x36524f, emissive:0x091917, pattern:1, metallic:.6 }),
        storyWitness: new Material({ color:0xdfbe8c, emissive:0x755127, pattern:2, metallic:.15 })
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

    setSector(id = 'sanctum') {
      const sector = D.SECTORS?.[id] || D.SECTORS?.sanctum;
      if (!sector) throw new Error('Aucun secteur Nexus disponible.');

      // Tous les objets de scène propres au plan sont abandonnés ensemble. Les
      // meshes et matériaux GPU restent partagés par le renderer.
      this.staticParts.length = 0;
      this.dynamicParts.length = 0;
      this.colliders.length = 0;
      this.spawnPoints.length = 0;
      this.stations.length = 0;
      this.hazards.length = 0;
      this.decals.length = 0;
      this.objectiveZone = null;
      this.gateRingA = this.gateRingB = this.gateRingC = this.portalDisc = null;
      this.currentSectorId = sector.id;
      this.sector = sector;
      this.bounds = { ...sector.bounds };
      this.gatePulse = 0;
      this._buildSector(sector);

      if (this.game.player?.position) {
        this.repositionSafely(this.game.player, sector.startPosition, this.game.player.radius || .42);
      }
      return sector;
    }

    _buildSector(sector) {
      this._buildSectorFloor(sector);
      this._buildSectorBoundary(sector);

      for (const item of sector.geometry || []) {
        const [mesh,material,x,y,z,sx,sy,sz,collider=false,tag='sector'] = item;
        this._part(mesh,this.materials[material] || this.materials.rust,[x,y,z],[0,0,0],[sx,sy,sz],collider,tag);
      }

      this._buildSectorGate(sector.gate);
      for (const [x,z,ring='rust'] of sector.pillars || []) this._buildSectorPillar(x,z,ring);
      for (const [x,y,z,sx,sy,sz,material='rust'] of sector.cover || []) {
        this._part('cube',this.materials[material] || this.materials.rust,[x,y,z],[0,0,0],[sx,sy,sz],true,'cover');
      }

      // Les chaînes reprennent les silhouettes de spawn périphériques : leur
      // densité et leur position suivent donc réellement chaque plan.
      (sector.spawns || []).slice(0,14).forEach(([x,z],index)=>{
        const endY=2.1+(index%5)*.48;
        const sway=((index%3)-1)*.42;
        let last=new Vec3(x,10,z);
        for(let step=1;step<=4;step++){
          const t=step/4;
          const next=new Vec3(x+Math.sin(t*Math.PI)*sway,10+(endY-10)*t,z+Math.cos(t*Math.PI)*sway*.3);
          this._chain(last,next,.035,this.materials.steel);
          last=next;
        }
        this._part('cone8',this.materials.rust,[last.x,last.y-.5,last.z],[0,0,index%2?-.35:.35],[.38,1,.38],false,'hook');
      });

      this._buildSectorStations(sector.stations || []);
      this._buildSectorSpawns(sector.spawns || []);
    }

    _buildSectorFloor(sector) {
      const floor=sector.floor;
      const m=this.materials;
      this._part('cube',m.floor,[0,-.35,0],[0,0,0],[floor.width,.7,floor.depth],false,'floor');
      const xLimit=Math.floor((floor.width-4)*.5);
      const zLimit=Math.floor((floor.depth-4)*.5);
      for(let x=-xLimit;x<=xLimit;x+=floor.grooveStep) {
        this._part('cube',m.floorAlt,[x,-.025,0],[0,0,0],[.1,.035,floor.depth-4],false,'groove');
      }
      for(let z=-zLimit;z<=zLimit;z+=floor.grooveStep) {
        this._part('cube',m.floorAlt,[0,-.02,z],[0,0,0],[floor.width-4,.04,.1],false,'groove');
      }
      for(let x=-xLimit;x<=xLimit;x+=floor.sigilStep) {
        this._part('cube',m.ritual,[x,.008,0],[0,0,0],[.045,.02,floor.depth-4],false,'sigil');
      }
      for(let z=-zLimit;z<=zLimit;z+=floor.sigilStep) {
        this._part('cube',m.ritual,[0,.009,z],[0,0,0],[floor.width-4,.02,.045],false,'sigil');
      }
    }

    _buildSectorBoundary(sector) {
      const b=sector.bounds,m=this.materials;
      const width=b.maxX-b.minX+2.6;
      const depth=b.maxZ-b.minZ+2.6;
      const centerX=(b.minX+b.maxX)*.5;
      const centerZ=(b.minZ+b.maxZ)*.5;
      this._part('cube',m.wall,[centerX,3,b.minZ-.8],[0,0,0],[width,7,1.4],true,'outer-wall');
      this._part('cube',m.wall,[centerX,3,b.maxZ+.8],[0,0,0],[width,7,1.4],true,'outer-wall');
      this._part('cube',m.wall,[b.minX-.8,3,centerZ],[0,0,0],[1.4,7,depth],true,'outer-wall');
      this._part('cube',m.wall,[b.maxX+.8,3,centerZ],[0,0,0],[1.4,7,depth],true,'outer-wall');
      for(let x=Math.ceil((b.minX+4)/8)*8;x<=b.maxX-4;x+=8){
        this._part('cube',m.wallDark,[x,3.6,b.minZ+.1],[0,0,0],[1.2,8.5,2.2],true,'buttress');
        this._part('cube',m.wallDark,[x,3.6,b.maxZ-.1],[0,0,0],[1.2,8.5,2.2],true,'buttress');
      }
      for(let z=Math.ceil((b.minZ+4)/8)*8;z<=b.maxZ-4;z+=8){
        this._part('cube',m.wallDark,[b.minX+.1,3.6,z],[0,0,0],[2.2,8.5,1.2],true,'buttress');
        this._part('cube',m.wallDark,[b.maxX-.1,3.6,z],[0,0,0],[2.2,8.5,1.2],true,'buttress');
      }
    }

    _buildSectorGate(gate) {
      if(!gate) return;
      const [x,y,z]=gate.position;
      this.gateRingA=this._dynamic('torus',this.materials.rust,[x,y,z],[Math.PI/2,0,0],[gate.outer,gate.outer,gate.outer],(part,time)=>{part.transform.rotation.z=time*.10;});
      this.gateRingB=this._dynamic('torusLow',this.materials.ritual,[x,y,z+.08],[Math.PI/2,0,0],[gate.middle,gate.middle,gate.middle],(part,time)=>{part.transform.rotation.z=-time*.18;});
      this.gateRingC=this._dynamic('torusLow',this.materials.ritualBright,[x,y,z+.16],[Math.PI/2,0,0],[gate.inner,gate.inner,gate.inner],(part,time)=>{part.transform.rotation.z=time*.27;});
      this.portalDisc=this._dynamic('cylinder12',this.materials.portal,[x,y,z+.22],[Math.PI/2,0,0],[gate.disc,.035,gate.disc],(part,time)=>{
        part.transform.rotation.y=time*.2;
        const pulse=1+Math.sin(time*1.3)*.025+this.gatePulse*.08;
        part.transform.scale.set(gate.disc*pulse,.035,gate.disc*pulse);
      });
    }

    _buildSectorPillar(x,z,ringMaterial) {
      const m=this.materials;
      this._part('cylinder8',m.wallDark,[x,2,z],[0,0,0],[2.2,4,2.2],true,'pillar');
      this._part('torusLow',m[ringMaterial] || m.rust,[x,3.4,z],[0,0,0],[2.6,2.6,2.6],false,'pillar-ring');
      for(let spike=0;spike<4;spike++){
        const angle=spike*Math.PI/2+.4;
        this._part('cone6',m.bone,[x+Math.cos(angle)*1.15,4.3,z+Math.sin(angle)*1.15],[Math.PI,0,-angle],[.38,1.45,.38],false,'spike');
      }
    }

    _buildSectorStations(defs) {
      defs.forEach((row,index)=>{
        const [id,type,x,z,materialName,weapon] = row;
        const station={
          id,type,weapon,
          position:new Vec3(x,0,z),
          material:this.materials[materialName] || this.materials.ritual,
          cost:type==='armory'?D.WEAPONS[weapon].price:D.STATIONS[type].cost,
          unlockWave:type==='armory'?D.WEAPONS[weapon].unlockWave:1,
          cooldown:0,active:true
        };
        station.transform=new Transform(station.position.clone().add(new Vec3(0,.52,0)),new Vec3(0,index*.9,0),new Vec3(1.4,1.05,1.4));
        station.ringTransform=new Transform(station.position.clone().add(new Vec3(0,1.35,0)),new Vec3(0,0,0),new Vec3(1.75,1.75,1.75));
        this.stations.push(station);
        this._part('cylinder8',this.materials.wallDark,[x,.25,z],[0,0,0],[2.1,.5,2.1],true,'station');
      });
    }

    _buildSectorSpawns(points) {
      points.forEach(([x,z],index)=>this.spawnPoints.push({position:new Vec3(x,0,z),index,cooldown:0}));
    }

    _buildLegacySanctum() {
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

    getStartPosition() {
      const source=this.sector?.startPosition || [0,0,0];
      return new Vec3(source[0],source[1] || 0,source[2]);
    }

    setObjectiveZone(config = null) {
      if(!config){
        this.objectiveZone=null;
        return null;
      }
      const type=config.type==='extraction'?'extraction':'hold';
      const source=config.position || this.sector?.objectiveAnchors?.[type] || this.sector?.startPosition || [0,0,0];
      const position=source instanceof Vec3
        ? source.clone()
        : Array.isArray(source)
          ? new Vec3(source[0],source[1] || 0,source[2])
          : new Vec3(source.x || 0,source.y || 0,source.z || 0);
      const accent=['ritual','amber','cyan'].includes(config.accent)
        ? config.accent
        : this.sector?.objectiveAccent || (type==='extraction'?'cyan':'ritual');
      this.objectiveZone={
        ...config,
        type,
        position,
        accent,
        radius:clamp(Number(config.radius) || (type==='extraction'?4.5:5),1.5,12)
      };
      return this.objectiveZone;
    }

    _positionClear(position,radius) {
      if(position.x<this.bounds.minX+radius || position.x>this.bounds.maxX-radius ||
        position.z<this.bounds.minZ+radius || position.z>this.bounds.maxZ-radius) return false;
      for(const collider of this.colliders){
        if(collider.tag==='dais') continue;
        const closestX=clamp(position.x,collider.min.x,collider.max.x);
        const closestZ=clamp(position.z,collider.min.z,collider.max.z);
        const dx=position.x-closestX,dz=position.z-closestZ;
        if(dx*dx+dz*dz<radius*radius) return false;
      }
      return true;
    }

    findSafePosition(preferred = null,radius = .42) {
      const source=preferred || this.sector?.startPosition || [0,0,0];
      const origin=source instanceof Vec3
        ? source.clone()
        : Array.isArray(source)
          ? new Vec3(source[0],source[1] || 0,source[2])
          : new Vec3(source.x || 0,source.y || 0,source.z || 0);
      if(this._positionClear(origin,radius)) return origin;
      for(let distance=1.5;distance<=16;distance+=1.5){
        for(let step=0;step<16;step++){
          const angle=step/16*Math.PI*2;
          const candidate=new Vec3(origin.x+Math.cos(angle)*distance,origin.y,origin.z+Math.sin(angle)*distance);
          if(this._positionClear(candidate,radius)) return candidate;
        }
      }
      const fallback=this.getStartPosition();
      this.resolvePosition(fallback,radius);
      return fallback;
    }

    repositionSafely(target,preferred = null,radius = .42) {
      const position=target?.position || target;
      if(!position) return null;
      const safe=this.findSafePosition(preferred || position,radius);
      if(typeof position.set==='function') position.set(safe.x,safe.y,safe.z);
      else { position.x=safe.x; position.y=safe.y; position.z=safe.z; }
      return safe;
    }

    reset() {
      this.hazards.length=0;
      this.decals.length=0;
      this.setObjectiveZone(null);
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
      this._drawObjectiveZone(time);
      this._drawStoryObjects(time);
      this._drawHazards(time);
    }

    _drawStoryObjects(time) {
      if (this.game.modeId !== 'story') return;
      for (const archive of this.game.storyArchives || []) this._drawStoryArtifact(archive.position,archive.collected,false,time);
      const objective = this.game.waveObjective;
      if (objective?.type === 'transport' && !objective.carrying) {
        this._drawStoryArtifact(objective.phase === 'cleanup' ? objective.deliveryPosition : objective.pickupPosition,objective.phase === 'cleanup',true,time);
      }
    }

    _drawStoryArtifact(position,collected,witness,time) {
      if (!position) return;
      // Trois pièces originales, un transform réutilisé, aucune émission
      // d’effets par image. Une archive lue garde un repère physique assombri.
      const transform = this.storyArtifactTransform, renderer = this.renderer;
      const material = collected ? this.materials.storyCollected : witness ? this.materials.storyWitness : this.materials.storyArchive;
      const angle = this.game.settings?.reducedMotion ? 0 : time*.18;
      transform.position.set(position.x,position.y+.12,position.z);
      transform.rotation.set(0,0,0); transform.scale.set(.85,.24,.85); transform.updateMatrix();
      renderer.draw(this.meshes.cube,transform.matrix,this.materials.steel);
      transform.position.y = position.y+.88;
      transform.rotation.set(0,angle,0); transform.scale.set(witness?.58:.48,witness?.88:.72,.28); transform.updateMatrix();
      renderer.draw(this.meshes.cube,transform.matrix,material);
      transform.position.y = position.y+1.52;
      transform.scale.set(.2,.2,.2); transform.updateMatrix();
      renderer.draw(witness?this.meshes.sphere8:this.meshes.cube,transform.matrix,material);
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

    _stationHasBenefit(station) {
      const game=this.game,player=game.player;
      if(station.type==='ammo'){
        return [...player.unlockedWeapons].some(id=>{
          const state=game.weapons.states[id];
          const capacity=Math.round(D.WEAPONS[id].reserve*game.weapons.metaReserveMul);
          return !state || state.reserve<capacity;
        });
      }
      if(station.type==='med')return (game.currentModifier?.healingRate??1)>0 && (player.health<player.maxHealth || player.corruption>0);
      return true;
    }

    activateStation(station) {
      const game=this.game, player=game.player;
      if(!station || station.cooldown>0) return false;
      if(station.type==='armory' && player.unlockedWeapons.has(station.weapon)) return false;
      if(!this._stationHasBenefit(station)){
        game.ui.toast(this.stationPrompt(station).title,'Aucune essence dépensée.');
        game.audio.ui('error');
        return false;
      }
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
      if(!this._stationHasBenefit(station))return { title:station.type==='ammo'?'RÉSERVES DÉJÀ PLEINES':'ÉTAT VITAL STABLE', cost:'' };
      if(station.type==='armory') return { title:`DÉVERROUILLER ${D.WEAPONS[station.weapon].name}`, cost:`◆ ${station.cost}` };
      const def=D.STATIONS[station.type];
      return { title:def.name, cost:`◆ ${station.cost}` };
    }

    _drawObjectiveZone(time) {
      const zone=this.objectiveZone;
      if(!zone) return;
      const r=this.renderer;
      const material={
        ritual:this.materials.objectiveRitual,
        amber:this.materials.objectiveAmber,
        cyan:this.materials.objectiveCyan
      }[zone.accent] || this.materials.objectiveRitual;
      const pulse=1+Math.sin(time*3.6)*.055;
      const ground=new Transform(
        new Vec3(zone.position.x,.026,zone.position.z),
        new Vec3(0,time*(zone.type==='extraction'?.22:-.16),0),
        new Vec3(zone.radius*2*pulse,1,zone.radius*2*pulse)
      );
      ground.updateMatrix();
      r.draw(this.meshes.plane,ground.matrix,material);

      const outer=new Transform(
        new Vec3(zone.position.x,.075,zone.position.z),
        new Vec3(0,time*(zone.type==='extraction'?.7:.35),0),
        new Vec3(zone.radius*2.05,zone.radius*2.05,zone.radius*2.05)
      );
      outer.updateMatrix();
      r.draw(this.meshes.torusLow,outer.matrix,material);

      if(zone.type==='hold'){
        for(let index=0;index<4;index++){
          const angle=time*.16+index*Math.PI/2;
          const marker=new Transform(
            new Vec3(zone.position.x+Math.cos(angle)*zone.radius*.84,.8,zone.position.z+Math.sin(angle)*zone.radius*.84),
            new Vec3(0,-angle,0),
            new Vec3(.16,1.6+Math.sin(time*2+index)*.18,.16)
          );
          marker.updateMatrix();
          r.draw(this.meshes.cylinder6,marker.matrix,material);
        }
      }else{
        const beam=new Transform(
          new Vec3(zone.position.x,2.1,zone.position.z),
          new Vec3(0,time*.24,0),
          new Vec3(zone.radius*.72,4.2,zone.radius*.72)
        );
        beam.updateMatrix();
        r.draw(this.meshes.cylinder12,beam.matrix,material);
        const crown=new Transform(
          new Vec3(zone.position.x,4.25,zone.position.z),
          new Vec3(0,-time*.9,0),
          new Vec3(zone.radius*1.25,zone.radius*1.25,zone.radius*1.25)
        );
        crown.updateMatrix();
        r.draw(this.meshes.torusLow,crown.matrix,material);
      }
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
