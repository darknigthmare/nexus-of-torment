(function () {
  'use strict';

  const NT = window.NT = window.NT || {};
  const D = NT.Data;
  const { clamp } = NT.Math;

  class UIManager {
    constructor(game) {
      this.game=game;
      this.$=id=>document.getElementById(id);
      this.mainMenu=this.$('main-menu');
      this.hud=this.$('hud');
      this.upgradeScreen=this.$('upgrade-screen');
      this.pauseScreen=this.$('pause-screen');
      this.gameoverScreen=this.$('gameover-screen');
      this.codexScreen=this.$('codex-screen');
      this.settingsScreen=this.$('settings-screen');
      this.creditsScreen=this.$('credits-screen');
      this.damageFlashEl=this.$('damage-flash');
      this.corruptionOverlay=this.$('corruption-overlay');
      this.announcementEl=this.$('announcement');
      this.hitmarkerEl=this.$('hitmarker');
      this.damageDirection=this.$('damage-direction');
      this.interactionPrompt=this.$('interaction-prompt');
      this.upgradeCards=this.$('upgrade-cards');
      this.upgradeTimerEl=this.$('upgrade-timer');
      this.selectedClass='bulwark';
      this.selectedDifficulty='unstable';
      this.damageFlashValue=0;
      this.hitmarkerValue=0;
      this.damageDirectionValue=0;
      this.announcementTimer=0;
      this.subtitleTimer=0;
      this.upgradeTimer=0;
      this.upgradeOptions=[];
      this.upgradeCallback=null;
      this.currentCodexTab='bestiary';
      this.lastWeaponSlots='';
      this._bind();
      this.applySettingsToControls();
      this.refreshMetaCurrency();
      this.renderCodex('bestiary');
    }

    _bind(){
      this.$('start-button').addEventListener('click',()=>{
        this.game.audio.init();this.game.audio.ui('confirm');
        this.selectedDifficulty=this.$('difficulty').value;
        this.game.startRun(this.selectedClass,this.selectedDifficulty);
      });
      for(const button of document.querySelectorAll('.class-card')){
        button.addEventListener('click',()=>{
          this.selectedClass=button.dataset.class;
          document.querySelectorAll('.class-card').forEach(card=>{
            const selected=card===button;card.classList.toggle('selected',selected);card.setAttribute('aria-checked',selected?'true':'false');
          });
          this.game.audio.ui('select');
        });
      }
      this.$('difficulty').addEventListener('change',event=>{this.selectedDifficulty=event.target.value;this.game.audio.ui('select');});
      this.$('codex-button').addEventListener('click',()=>this.openCodex());
      this.$('settings-button').addEventListener('click',()=>this.openSettings());
      this.$('credits-button').addEventListener('click',()=>this.openModal(this.creditsScreen));
      document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>this.closeModal(this.$(button.dataset.close))));
      document.querySelectorAll('.tab').forEach(button=>button.addEventListener('click',()=>{
        document.querySelectorAll('.tab').forEach(tab=>tab.classList.toggle('active',tab===button));
        this.currentCodexTab=button.dataset.tab;this.renderCodex(this.currentCodexTab);this.game.audio.ui('select');
      }));
      this.$('resume-button').addEventListener('click',()=>this.game.resume());
      this.$('pause-settings-button').addEventListener('click',()=>this.openSettings(true));
      this.$('restart-button').addEventListener('click',()=>this.game.restartRun());
      this.$('quit-button').addEventListener('click',()=>this.game.quitToMenu());
      this.$('gameover-restart').addEventListener('click',()=>this.game.restartRun());
      this.$('gameover-menu').addEventListener('click',()=>this.game.quitToMenu());
      this._bindSettings();
      window.addEventListener('keydown',event=>{
        if(!this.upgradeScreen.classList.contains('hidden')){
          const index=event.code==='Digit1'?0:event.code==='Digit2'?1:event.code==='Digit3'?2:-1;
          if(index>=0)this.selectUpgrade(index);
        }
      });
    }

    _bindSettings(){
      const ranges=[
        ['sensitivity','sensitivity',value=>Number(value),value=>value.toFixed(2)],
        ['volume','volume',value=>Number(value),value=>`${Math.round(value*100)}%`],
        ['fov','fov',value=>Number(value),value=>`${Math.round(value)}°`]
      ];
      ranges.forEach(([id,key,parse,format])=>{
        const input=this.$(id),label=this.$(`${id}-value`);
        input.addEventListener('input',()=>{
          this.game.settings[key]=parse(input.value);label.textContent=format(this.game.settings[key]);this.game.applySettings();this.game.saveSettings();
        });
      });
      this.$('render-scale').addEventListener('change',event=>{this.game.settings.renderScale=Number(event.target.value);this.game.applySettings();this.game.saveSettings();});
      for(const [id,key] of [['head-bob','headBob'],['reduced-flashes','reducedFlashes'],['gore','gore'],['invert-y','invertY']]){
        this.$(id).addEventListener('change',event=>{this.game.settings[key]=event.target.checked;this.game.applySettings();this.game.saveSettings();});
      }
      this.$('reset-settings').addEventListener('click',()=>{this.game.resetSettings();this.applySettingsToControls();this.game.audio.ui('confirm');});
    }

    applySettingsToControls(){
      const s=this.game.settings;
      this.$('sensitivity').value=s.sensitivity;this.$('sensitivity-value').textContent=s.sensitivity.toFixed(2);
      this.$('volume').value=s.volume;this.$('volume-value').textContent=`${Math.round(s.volume*100)}%`;
      this.$('fov').value=s.fov;this.$('fov-value').textContent=`${Math.round(s.fov)}°`;
      this.$('render-scale').value=String(s.renderScale);
      this.$('head-bob').checked=s.headBob;this.$('reduced-flashes').checked=s.reducedFlashes;this.$('gore').checked=s.gore;this.$('invert-y').checked=s.invertY;
    }

    showMainMenu(){
      this.mainMenu.classList.remove('hidden');this.hud.classList.add('hidden');this.upgradeScreen.classList.add('hidden');this.pauseScreen.classList.add('hidden');this.gameoverScreen.classList.add('hidden');
      this.refreshMetaCurrency();
    }
    enterGame(){
      this.mainMenu.classList.add('hidden');this.codexScreen.classList.add('hidden');this.settingsScreen.classList.add('hidden');this.creditsScreen.classList.add('hidden');this.pauseScreen.classList.add('hidden');this.gameoverScreen.classList.add('hidden');this.upgradeScreen.classList.add('hidden');this.hud.classList.remove('hidden');
    }
    showPause(){this.pauseScreen.classList.remove('hidden');this.hud.classList.add('hidden');}
    hidePause(){this.pauseScreen.classList.add('hidden');this.hud.classList.remove('hidden');}
    showGameOver(results){
      this.hud.classList.add('hidden');this.pauseScreen.classList.add('hidden');this.upgradeScreen.classList.add('hidden');this.gameoverScreen.classList.remove('hidden');
      this.$('result-wave').textContent=results.wave;this.$('result-kills').textContent=results.kills;this.$('result-score').textContent=Math.round(results.score).toLocaleString('fr-FR');this.$('result-shards').textContent=`◆ ${results.shards}`;
    }

    openModal(element){element.classList.remove('hidden');this.game.audio.init();this.game.audio.ui('select');}
    closeModal(element){element.classList.add('hidden');this.game.audio.ui('select');if(this.game.state==='paused')this.pauseScreen.classList.remove('hidden');}
    openSettings(fromPause=false){if(fromPause)this.pauseScreen.classList.add('hidden');this.applySettingsToControls();this.openModal(this.settingsScreen);}
    openCodex(){this.renderCodex(this.currentCodexTab);this.openModal(this.codexScreen);}

    update(dt){
      this.damageFlashValue=Math.max(0,this.damageFlashValue-dt*3.8);
      this.damageFlashEl.style.opacity=String(clamp(this.damageFlashValue,0,.82));
      this.hitmarkerValue=Math.max(0,this.hitmarkerValue-dt*7.5);this.hitmarkerEl.style.opacity=String(this.hitmarkerValue);
      this.damageDirectionValue=Math.max(0,this.damageDirectionValue-dt*2.7);this.damageDirection.style.opacity=String(this.damageDirectionValue);
      this.announcementTimer=Math.max(0,this.announcementTimer-dt);if(this.announcementTimer<=0)this.announcementEl.classList.add('hidden');
      this.subtitleTimer=Math.max(0,this.subtitleTimer-dt);if(this.subtitleTimer<=0)this.$('subtitle').classList.add('hidden');
      if(!this.upgradeScreen.classList.contains('hidden')){
        this.upgradeTimer=Math.max(0,this.upgradeTimer-dt);this.upgradeTimerEl.textContent=Math.ceil(this.upgradeTimer);
        if(this.upgradeTimer<=0&&this.upgradeCallback)this.selectUpgrade(0);
      }
      if(this.game.state==='playing')this.updateHUD();
    }

    updateHUD(){
      const game=this.game,p=game.player,w=game.weapons.hud();
      this.$('wave-number').textContent=game.wave;
      this.$('wave-modifier').textContent=game.currentModifier?.name||'STANDARD';
      this.$('objective').textContent=game.objectiveText;
      this.$('enemy-count').textContent=game.enemies.filter(e=>e.alive).length+game.spawnsRemaining;
      this.$('essence-value').textContent=Math.floor(p.essence);
      this.$('score-value').textContent=String(Math.floor(game.score)).padStart(6,'0');
      this.$('health-text').textContent=Math.ceil(p.health);this.$('health-bar').style.width=`${clamp(p.health/p.maxHealth*100,0,100)}%`;
      this.$('armor-text').textContent=Math.ceil(p.armor);this.$('armor-bar').style.width=`${clamp(p.armor/p.maxArmor*100,0,100)}%`;
      this.$('corruption-text').textContent=`${Math.round(p.corruption*100)}%`;this.$('corruption-bar').style.width=`${p.corruption*100}%`;
      this.corruptionOverlay.style.opacity=String(clamp((p.corruption-.35)*.75,0,.46));
      this.$('ability-name').textContent=p.classData.abilityName.toUpperCase();this.$('ability-fill').style.width=`${p.abilityProgress()*100}%`;this.$('ability-widget').classList.toggle('ready',p.abilityCooldown<=0);
      this.$('weapon-name').textContent=w.name;this.$('weapon-state').textContent=w.subtitle;this.$('ammo-mag').textContent=w.mag;this.$('ammo-reserve').textContent=w.reserve;this.$('grenade-count').textContent=p.grenades;
      this.$('reload-prompt').classList.toggle('hidden',!w.reloading);
      if(w.reloading)this.$('reload-prompt').textContent=`RECHARGEMENT ${Math.round(w.reloadProgress*100)} %`;
      const spread=7+(game.weapons.current().spread*220)+(Math.hypot(p.velocity.x,p.velocity.z)>1?3:0)+game.weapons.weaponKick*24;
      this.$('crosshair').style.setProperty('--spread',`${spread}px`);
      this._updateWeaponSlots();
      const boss=game.enemies.find(enemy=>enemy.alive&&enemy.boss);
      const bossWrap=this.$('boss-wrap');
      if(boss){bossWrap.classList.remove('hidden');this.$('boss-name').textContent=boss.config.name.toUpperCase();this.$('boss-bar-fill').style.width=`${boss.health/boss.maxHealth*100}%`;}
      else bossWrap.classList.add('hidden');
      const streak=game.killStreak>=3?Math.min(8,1+Math.floor(game.killStreak/3)):1;
      const streakEl=this.$('streak');streakEl.classList.toggle('hidden',streak<=1);if(streak>1)streakEl.querySelector('strong').textContent=streak;
      const station=game.arena.nearestStation(p.position);
      const prompt=game.arena.stationPrompt(station);
      this.setInteraction(prompt);
    }

    _updateWeaponSlots(){
      const game=this.game;
      const signature=Object.values(D.WEAPONS).map(w=>`${w.id}:${game.player.unlockedWeapons.has(w.id)?1:0}:${game.weapons.currentId===w.id?1:0}`).join('|');
      if(signature===this.lastWeaponSlots)return;this.lastWeaponSlots=signature;
      const root=this.$('weapon-slots');root.innerHTML='';
      Object.values(D.WEAPONS).sort((a,b)=>a.slot-b.slot).forEach(weapon=>{
        const div=document.createElement('div');div.className='weapon-slot';div.textContent=weapon.slot;
        if(game.weapons.currentId===weapon.id)div.classList.add('active');if(!game.player.unlockedWeapons.has(weapon.id))div.classList.add('locked');root.appendChild(div);
      });
    }

    setInteraction(prompt){
      if(!prompt){this.interactionPrompt.classList.add('hidden');return;}
      this.interactionPrompt.classList.remove('hidden');this.$('interaction-title').textContent=prompt.title;this.$('interaction-cost').textContent=prompt.cost||'';
    }
    hitmarker(headshot=false,killed=false){
      this.hitmarkerValue = killed ? .34 : .22;this.hitmarkerEl.classList.toggle('headshot',headshot);this.hitmarkerEl.style.transform=`rotate(45deg) scale(${killed?1.35:1})`;
    }
    damageFlash(amount,source){
      this.damageFlashValue=Math.max(this.damageFlashValue,clamp(amount/55,.18,.75));
      if(source){
        const dx=source.x-this.game.player.position.x,dz=source.z-this.game.player.position.z;
        const angle=Math.atan2(dx,-dz)-this.game.camera.yaw;
        this.damageDirection.style.transform=`translate(-50%,-50%) rotate(${angle}rad)`;this.damageDirectionValue=.85;
      }
    }
    announce(kicker,title,subtitle='',duration=2.4){
      this.$('announcement-kicker').textContent=kicker;this.$('announcement-title').textContent=title;this.$('announcement-subtitle').textContent=subtitle;this.announcementEl.classList.remove('hidden');this.announcementTimer=duration;
    }
    subtitle(text,duration=3){const el=this.$('subtitle');el.textContent=text;el.classList.remove('hidden');this.subtitleTimer=duration;}
    toast(title,detail='',type='normal'){
      const root=this.$('toast-stack'),node=document.createElement('div');node.className='toast';if(type==='error')node.style.borderRightColor='#ff5252';node.innerHTML=`<b>${escapeHtml(title)}</b><span>${escapeHtml(detail)}</span>`;root.appendChild(node);
      setTimeout(()=>{node.style.opacity='0';node.style.transform='translateX(18px)';node.style.transition='.25s';},2600);
      setTimeout(()=>node.remove(),3000);
    }

    showUpgrades(options,duration,callback){
      this.upgradeOptions=options;this.upgradeCallback=callback;this.upgradeTimer=duration;this.upgradeTimerEl.textContent=Math.ceil(duration);this.upgradeCards.innerHTML='';
      options.forEach((upgrade,index)=>{
        const stack=this.game.player.upgradeStacks[upgrade.id]||0;
        const button=document.createElement('button');button.className='upgrade-card';button.dataset.key=String(index+1);
        button.innerHTML=`<div class="upgrade-rarity">${escapeHtml(upgrade.rarity)}</div><div class="upgrade-icon">${escapeHtml(upgrade.icon)}</div><h3>${escapeHtml(upgrade.name)}</h3><p>${escapeHtml(upgrade.description)}</p><div class="upgrade-stack">RANG ${stack} / ${upgrade.max}</div>`;
        button.addEventListener('click',()=>this.selectUpgrade(index));this.upgradeCards.appendChild(button);
      });
      this.upgradeScreen.classList.remove('hidden');this.hud.classList.add('hidden');
    }
    selectUpgrade(index){
      if(!this.upgradeCallback||!this.upgradeOptions[index])return;
      const callback=this.upgradeCallback,upgrade=this.upgradeOptions[index];this.upgradeCallback=null;this.upgradeScreen.classList.add('hidden');this.hud.classList.remove('hidden');this.game.audio.ui('confirm');callback(upgrade);
    }

    refreshMetaCurrency(){this.$('meta-shards').textContent=`◆ ${this.game.save.data.shards||0}`;}

    renderCodex(tab){
      const root=this.$('codex-content'),save=this.game.save.data;
      if(tab==='bestiary'){
        root.innerHTML='<div class="codex-grid">'+Object.values(D.ENEMIES).map(enemy=>{
          const kills=save.codex?.enemyKills?.[enemy.id]||0,locked=kills===0&&!enemy.boss;
          return `<article class="codex-card ${locked?'locked':''}"><div class="codex-icon">${locked?'?':escapeHtml(enemy.icon)}</div><h3>${locked?'SIGNATURE NON IDENTIFIÉE':escapeHtml(enemy.name)}</h3><p>${locked?'Éliminez cette caste pour ouvrir son dossier.':escapeHtml(enemy.description)}</p><footer>${locked?'DONNÉES VERROUILLÉES':`${kills} élimination${kills>1?'s':''} · ${escapeHtml(enemy.role)}`}</footer></article>`;
        }).join('')+'</div>';
      }else if(tab==='arsenal'){
        root.innerHTML='<div class="codex-grid">'+Object.values(D.WEAPONS).map(w=>`<article class="codex-card"><div class="codex-icon">${escapeHtml(w.icon)}</div><h3>${escapeHtml(w.name)}</h3><p>${escapeHtml(w.subtitle)}. ${w.damage} dégâts de base, chargeur de ${w.magazine}, portée effective ${w.falloffEnd} m.${w.mechanic?` ${escapeHtml(w.mechanic)}`:''}</p><footer>DÉVERROUILLAGE : VAGUE ${w.unlockWave}</footer></article>`).join('')+'</div>';
      }else if(tab==='meta'){
        root.innerHTML=`<div class="eyebrow">FRAGMENTS DISPONIBLES : ◆ ${save.shards||0}</div><div class="meta-grid">`+Object.values(D.META_UPGRADES).map(meta=>{
          const level=save.meta?.[meta.id]||0,cost=meta.baseCost*(level+1),maxed=level>=meta.max;
          return `<article class="meta-card"><div class="codex-icon">${escapeHtml(meta.icon)}</div><h3>${escapeHtml(meta.name)} ${level}/${meta.max}</h3><p>${escapeHtml(meta.description)}</p><button class="secondary-button meta-buy" data-meta="${meta.id}" ${maxed?'disabled':''}>${maxed?'MAXIMUM':`GREFFER · ◆ ${cost}`}</button></article>`;
        }).join('')+'</div>';
        root.querySelectorAll('.meta-buy').forEach(button=>button.addEventListener('click',()=>this.buyMeta(button.dataset.meta)));
      }else{
        const r=save.records||{};
        root.innerHTML=`<div class="record-grid"><div class="record"><span>Meilleure vague</span><strong>${r.bestWave||0}</strong></div><div class="record"><span>Score record</span><strong>${Math.round(r.bestScore||0).toLocaleString('fr-FR')}</strong></div><div class="record"><span>Éliminations</span><strong>${r.lifetimeKills||0}</strong></div><div class="record"><span>Boss abattus</span><strong>${r.bossKills||0}</strong></div><div class="record"><span>Tirs à la tête</span><strong>${r.headshots||0}</strong></div><div class="record"><span>Dégâts infligés</span><strong>${Math.round(r.damage||0).toLocaleString('fr-FR')}</strong></div><div class="record"><span>Parties</span><strong>${r.runs||0}</strong></div><div class="record"><span>Temps au Nexus</span><strong>${formatTime(r.playTime||0)}</strong></div></div>`;
      }
    }

    buyMeta(id){
      const meta=D.META_UPGRADES[id],save=this.game.save.data,level=save.meta[id]||0;if(level>=meta.max)return;
      const cost=meta.baseCost*(level+1);if((save.shards||0)<cost){this.game.audio.ui('error');this.toast('FRAGMENTS INSUFFISANTS',`◆ ${cost} requis`,'error');return;}
      save.shards-=cost;save.meta[id]=level+1;this.game.save.save();this.refreshMetaCurrency();this.renderCodex('meta');this.game.audio.ui('confirm');
    }
  }

  function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}
  function formatTime(seconds){const h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60);return h?`${h} h ${m} min`:`${m} min`;}

  NT.UIManager=UIManager;
})();
