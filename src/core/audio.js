(function () {
  'use strict';

  const NT = window.NT = window.NT || {};
  const { clamp, randRange } = NT.Math;

  class AudioManager {
    constructor() {
      this.context = null;
      this.master = null;
      this.sfx = null;
      this.ambient = null;
      this.volume = .7;
      this.noiseBuffer = null;
      this.started = false;
      this.drones = [];
      this.heartbeatTimer = 0;
      this.listenerYaw = 0;
      this.unavailable = false;
      this.lastError = null;
      this.compressor = null;
    }
    init() {
      if (this.context) {
        if (this.context.state === 'closed') { this.unavailable = true; this.started = false; this.context = null; return false; }
        if (this.context.state === 'suspended') this._resumeSafely();
        return !this.unavailable;
      }
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass || this.unavailable) { this.unavailable = true; return false; }
      try {
        this.context = new AudioContextClass();
        this.master = this.context.createGain();
        this.sfx = this.context.createGain();
        this.ambient = this.context.createGain();
        this.master.gain.value = this.volume;
        this.sfx.gain.value = .9;
        this.ambient.gain.value = .28;
        this.sfx.connect(this.master);
        this.ambient.connect(this.master);
        // Compression douce du bus final : contenir les superpositions sans écraser les impacts.
        this.compressor = this.context.createDynamicsCompressor?.() || null;
        if (this.compressor) {
          this.compressor.threshold.value = -14;
          this.compressor.knee.value = 12;
          this.compressor.ratio.value = 4;
          this.compressor.attack.value = .006;
          this.compressor.release.value = .15;
          this.master.connect(this.compressor);
          this.compressor.connect(this.context.destination);
        } else this.master.connect(this.context.destination);
        this.noiseBuffer = this._createNoiseBuffer(2);
        this._startDrones();
        this.started = true;
        this.unavailable = false;
        if (this.context.state === 'suspended') this._resumeSafely();
        return true;
      } catch (error) {
        this.lastError = String(error.message || error);
        this.unavailable = true;
        this.started = false;
        try { this.context?.close?.()?.catch?.(() => {}); } catch { /* Le jeu reste jouable sans périphérique audio. */ }
        this.context = this.master = this.sfx = this.ambient = this.compressor = null;
        this.drones.length = 0;
        return false;
      }
    }
    _resumeSafely() {
      try {
        return Promise.resolve(this.context?.resume?.()).then(() => {
          this.unavailable = false;
          this.lastError = null;
          return true;
        }).catch(error => {
          this.unavailable = true;
          this.lastError = String(error.message || error);
          return false;
        });
      } catch (error) { this.unavailable = true; this.lastError = String(error.message || error); return Promise.resolve(false); }
    }
    suspend() {
      if (!this.context || this.context.state === 'closed') return Promise.resolve(false);
      try {
        return Promise.resolve(this.context.suspend?.()).then(() => true).catch(() => false);
      } catch { return Promise.resolve(false); }
    }
    setVolume(value) {
      this.volume = clamp(Number(value) || 0, 0, 1);
      if (this.master && this.context) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, .03);
    }
    _createNoiseBuffer(seconds) {
      const length = Math.floor(this.context.sampleRate * seconds);
      const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        last = last * .985 + white * .015;
        data[i] = white * .55 + last * .45;
      }
      return buffer;
    }
    _startDrones() {
      const now = this.context.currentTime;
      const frequencies = [41.2, 55, 82.4];
      frequencies.forEach((frequency, index) => {
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        const filter = this.context.createBiquadFilter();
        oscillator.type = index === 0 ? 'sawtooth' : 'sine';
        oscillator.frequency.value = frequency;
        oscillator.detune.value = index * 7 - 4;
        filter.type = 'lowpass';
        filter.frequency.value = 160 + index * 90;
        filter.Q.value = 2.2;
        gain.gain.value = index === 0 ? .075 : .035;
        oscillator.connect(filter); filter.connect(gain); gain.connect(this.ambient);
        oscillator.start(now);
        this.drones.push({ oscillator, gain, filter, base: frequency, index });
      });
      const noise = this.context.createBufferSource();
      const noiseGain = this.context.createGain();
      const noiseFilter = this.context.createBiquadFilter();
      noise.buffer = this.noiseBuffer;
      noise.loop = true;
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 210;
      noiseFilter.Q.value = .55;
      noiseGain.gain.value = .025;
      noise.connect(noiseFilter); noiseFilter.connect(noiseGain); noiseGain.connect(this.ambient);
      noise.start(now);
      this.ambientNoise = { noise, gain: noiseGain, filter: noiseFilter };
    }
    update(dt, corruption = 0, intensity = 0, boss = false) {
      if (!this.context || !this.started) return;
      const now = this.context.currentTime;
      this.drones.forEach(drone => {
        const wobble = Math.sin(now * (.12 + drone.index * .04)) * (2 + intensity * 5);
        drone.oscillator.frequency.setTargetAtTime(drone.base + wobble + corruption * 7, now, .15);
        drone.filter.frequency.setTargetAtTime(130 + intensity * 240 + corruption * 150 + drone.index * 70, now, .2);
        drone.gain.gain.setTargetAtTime((drone.index === 0 ? .06 : .028) * (1 + intensity * .5 + (boss ? .35 : 0)), now, .2);
      });
      if (this.ambientNoise) {
        this.ambientNoise.filter.frequency.setTargetAtTime(180 + corruption * 420 + intensity * 190, now, .2);
        this.ambientNoise.gain.gain.setTargetAtTime(.018 + corruption * .045 + intensity * .018, now, .2);
      }
      this.heartbeatTimer -= dt;
      if (corruption > .62 && this.heartbeatTimer <= 0) {
        this.heartbeatTimer = 1.1 - corruption * .55;
        this.heartbeat(corruption);
      }
    }
    _panNode(pan = 0) {
      if (this.context.createStereoPanner) {
        const node = this.context.createStereoPanner();
        node.pan.value = clamp(pan, -1, 1);
        return node;
      }
      return this.context.createGain();
    }
    _noise({ duration = .12, gain = .15, filter = 1000, q = .7, type = 'bandpass', pan = 0, attack = .002, destination = this.sfx } = {}) {
      if (!this.context) return;
      const now = this.context.currentTime;
      const source = this.context.createBufferSource();
      const biquad = this.context.createBiquadFilter();
      const envelope = this.context.createGain();
      const panner = this._panNode(pan);
      source.buffer = this.noiseBuffer;
      biquad.type = type; biquad.frequency.value = filter; biquad.Q.value = q;
      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime(gain, now + attack);
      envelope.gain.exponentialRampToValueAtTime(.0001, now + duration);
      source.connect(biquad); biquad.connect(envelope); envelope.connect(panner); panner.connect(destination);
      source.start(now, Math.random() * Math.max(.01, 2 - duration), duration + .02);
      source.stop(now + duration + .04);
    }
    _tone({ frequency = 220, endFrequency = null, duration = .14, gain = .1, type = 'sine', pan = 0, attack = .002, destination = this.sfx, detune = 0 } = {}) {
      if (!this.context) return;
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const envelope = this.context.createGain();
      const panner = this._panNode(pan);
      oscillator.type = type; oscillator.frequency.setValueAtTime(Math.max(20, frequency), now); oscillator.detune.value = detune;
      if (endFrequency !== null) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
      envelope.gain.setValueAtTime(.0001, now);
      envelope.gain.linearRampToValueAtTime(gain, now + attack);
      envelope.gain.exponentialRampToValueAtTime(.0001, now + duration);
      oscillator.connect(envelope); envelope.connect(panner); panner.connect(destination);
      oscillator.start(now); oscillator.stop(now + duration + .03);
    }
    spatialPan(sourcePosition, listenerPosition, listenerYaw) {
      if (!sourcePosition || !listenerPosition) return { pan: 0, attenuation: 1 };
      const dx = sourcePosition.x - listenerPosition.x;
      const dz = sourcePosition.z - listenerPosition.z;
      const distance = Math.hypot(dx, dz);
      const angle = Math.atan2(dx, -dz) - listenerYaw;
      return { pan: Math.sin(angle), attenuation: 1 / (1 + distance * .055) };
    }
    ui(kind = 'select') {
      this.init();
      if (!this.context) return;
      if (kind === 'confirm') { this._tone({ frequency: 170, endFrequency: 370, duration: .11, gain: .07, type: 'square' }); }
      else if (kind === 'error') { this._tone({ frequency: 120, endFrequency: 70, duration: .18, gain: .09, type: 'sawtooth' }); }
      else { this._tone({ frequency: 410, endFrequency: 330, duration: .055, gain: .035, type: 'square' }); }
    }
    gun(id, pan = 0) {
      this.init();
      if (!this.context) return;
      if (id === 'shotgun') {
        this._noise({ duration: .22, gain: .40, filter: 760, q: .4, type: 'lowpass', pan });
        this._tone({ frequency: 92, endFrequency: 41, duration: .24, gain: .27, type: 'square', pan });
        this._noise({ duration: .08, gain: .22, filter: 2200, q: 1.1, pan });
      } else if (id === 'nailgun') {
        this._noise({ duration: .09, gain: .20, filter: 1800, q: 2.2, pan });
        this._tone({ frequency: 260, endFrequency: 82, duration: .12, gain: .14, type: 'sawtooth', pan });
        setTimeout(() => this._tone({ frequency: 1150, endFrequency: 610, duration: .06, gain: .035, type: 'square', pan }), 18);
      } else if (id === 'smg') {
        this._noise({ duration: .065, gain: .15, filter: 1400, q: .55, pan });
        this._tone({ frequency: 135, endFrequency: 72, duration: .075, gain: .10, type: 'square', pan });
      } else if (id === 'chainlance') {
        this._noise({ duration: .18, gain: .28, filter: 880, q: .9, type: 'lowpass', pan });
        this._tone({ frequency: 180, endFrequency: 48, duration: .24, gain: .19, type: 'sawtooth', pan });
        setTimeout(() => this._noise({ duration:.12,gain:.10,filter:2900,q:3.5,pan }), 34);
      } else if (id === 'exorcist') {
        this._tone({ frequency: 510, endFrequency: 270, duration: .07, gain: .055, type: 'sawtooth', pan });
        this._noise({ duration:.055,gain:.065,filter:3300,q:4.2,pan });
      } else {
        this._noise({ duration: .105, gain: .24, filter: 1050, q: .65, pan });
        this._tone({ frequency: 116, endFrequency: 58, duration: .13, gain: .15, type: 'square', pan });
      }
    }
    melee() {
      this.init();
      this._noise({ duration:.12,gain:.12,filter:760,q:.8,type:'lowpass' });
      this._tone({ frequency:148,endFrequency:58,duration:.13,gain:.09,type:'triangle' });
    }
    dryFire() { this.init(); this._noise({ duration: .035, gain: .05, filter: 3100, q: 4 }); this._tone({ frequency: 680, endFrequency: 420, duration: .045, gain: .025, type: 'square' }); }
    reload(stage = 'start') {
      this.init();
      if (stage === 'end') { this._noise({ duration:.05,gain:.08,filter:2100,q:2.8 }); this._tone({frequency:260,endFrequency:180,duration:.06,gain:.04,type:'square'}); }
      else { this._noise({ duration:.08,gain:.07,filter:1100,q:1.8 }); this._tone({frequency:150,endFrequency:210,duration:.07,gain:.035,type:'triangle'}); }
    }
    hit(headshot = false) {
      this.init();
      this._tone({ frequency: headshot ? 1260 : 780, endFrequency: headshot ? 840 : 520, duration: .055, gain: headshot ? .075 : .045, type: 'sine' });
      if (headshot) this._noise({ duration:.045,gain:.045,filter:3500,q:4 });
    }
    hurt(amount = 10) {
      this.init();
      this._noise({ duration:.14,gain:clamp(.08+amount*.004,.08,.22),filter:420,q:.7,type:'lowpass' });
      this._tone({ frequency:76,endFrequency:42,duration:.18,gain:.12,type:'sawtooth' });
    }
    enemy(kind = 'growl', position, listener, yaw = 0) {
      this.init();
      const spatial = this.spatialPan(position, listener, yaw);
      const gain = spatial.attenuation;
      if (kind === 'scream') {
        this._noise({duration:.35,gain:.15*gain,filter:1400,q:3.5,pan:spatial.pan});
        this._tone({frequency:480,endFrequency:130,duration:.38,gain:.09*gain,type:'sawtooth',pan:spatial.pan});
      } else if (kind === 'bell') {
        this._tone({frequency:124,endFrequency:104,duration:1.2,gain:.16*gain,type:'sine',pan:spatial.pan});
        this._tone({frequency:248,endFrequency:210,duration:.9,gain:.055*gain,type:'sine',pan:spatial.pan});
      } else if (kind === 'hook') {
        this._noise({duration:.16,gain:.09*gain,filter:2500,q:1.4,pan:spatial.pan});
        this._tone({frequency:880,endFrequency:240,duration:.17,gain:.05*gain,type:'sawtooth',pan:spatial.pan});
      } else {
        this._noise({duration:.22,gain:.09*gain,filter:260,q:1.7,pan:spatial.pan,type:'lowpass'});
        this._tone({frequency:88+Math.random()*45,endFrequency:48,duration:.25,gain:.055*gain,type:'sawtooth',pan:spatial.pan});
      }
    }
    explosion(position, listener, yaw = 0, strength = 1) {
      this.init();
      const spatial = this.spatialPan(position, listener, yaw);
      const gain = spatial.attenuation * strength;
      this._noise({duration:.42,gain:.42*gain,filter:430,q:.45,type:'lowpass',pan:spatial.pan});
      this._tone({frequency:70,endFrequency:25,duration:.48,gain:.28*gain,type:'square',pan:spatial.pan});
    }
    pickup() { this.init(); this._tone({frequency:330,endFrequency:820,duration:.16,gain:.065,type:'sine'}); }
    wave() { this.init(); this._tone({frequency:92,endFrequency:184,duration:.65,gain:.14,type:'sawtooth'}); this._tone({frequency:138,endFrequency:276,duration:.72,gain:.07,type:'sine'}); }
    ability() { this.init(); this._noise({duration:.32,gain:.18,filter:980,q:1.4}); this._tone({frequency:64,endFrequency:350,duration:.35,gain:.17,type:'sawtooth'}); }
    shield() { this.init(); this._tone({frequency:165,endFrequency:540,duration:.28,gain:.12,type:'sine'}); this._noise({duration:.22,gain:.07,filter:1800,q:4}); }
    heartbeat(intensity = 1) {
      this._tone({frequency:64,endFrequency:42,duration:.16,gain:.10*intensity,type:'sine',destination:this.ambient});
      setTimeout(() => this._tone({frequency:58,endFrequency:38,duration:.13,gain:.07*intensity,type:'sine',destination:this.ambient}), 150);
    }
    boss() {
      this.init();
      this._tone({frequency:44,endFrequency:28,duration:1.6,gain:.25,type:'sawtooth'});
      this._noise({duration:1.25,gain:.18,filter:190,q:1.1,type:'lowpass'});
    }
  }

  NT.AudioManager = AudioManager;
})();
