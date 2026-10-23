/* ============================================================
 * 音频层：WebAudio 合成的古琴/鼓点与氛围，无外部音频文件。
 * 必须在一次用户手势之后初始化；失败时静默降级。
 * ============================================================ */
const Audio = {
  ctx: null,
  master: null,
  musicGain: null,
  sfxGain: null,
  musicTimer: null,
  drone: null,
  mode: '',
  musicOn: true,
  sfxOn: true,
  failed: false,

  ensure() {
    if (this.failed) return false;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) { this.failed = true; return false; }
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicOn ? 0.18 : 0;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxOn ? 0.5 : 0;
      this.sfxGain.connect(this.master);
      return true;
    } catch (e) {
      this.failed = true;
      return false;
    }
  },

  setMusic(on) {
    this.musicOn = !!on;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.musicOn ? 0.18 : 0, this.ctx.currentTime, 0.15);
    }
    if (!on) this.stopMusic();
    else if (this.mode) {
      const m = this.mode;
      this.mode = '';
      this.playMusic(m);
    }
  },

  setSfx(on) {
    this.sfxOn = !!on;
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.sfxOn ? 0.5 : 0, this.ctx.currentTime, 0.08);
    }
  },

  tone(freq, dur, opts) {
    if (!this.ctx) return;
    const o = opts || {};
    const t0 = this.ctx.currentTime + (o.delay || 0);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * o.slide), t0 + dur);
    const vol = Math.max(0.0001, o.vol || 0.08);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = osc;
    if (o.filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = o.filter;
      f.frequency.value = o.filterFreq || 900;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(o.music ? this.musicGain : this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  },

  noise(dur, vol, filterFreq, delay) {
    if (!this.ctx) return;
    try {
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = filterFreq || 800;
      const g = this.ctx.createGain();
      g.gain.value = vol || 0.1;
      src.connect(f); f.connect(g); g.connect(this.sfxGain);
      src.start(this.ctx.currentTime + (delay || 0));
    } catch (e) { /* 静默 */ }
  },

  sfx(name) {
    if (!this.sfxOn || !this.ensure()) return;
    switch (name) {
      case 'tap': this.tone(660, 0.06, { type: 'triangle', vol: 0.05 }); break;
      case 'select': this.tone(520, 0.1, { type: 'triangle', vol: 0.06 }); this.tone(780, 0.12, { type: 'sine', vol: 0.04, delay: 0.04 }); break;
      case 'cancel': this.tone(380, 0.1, { type: 'sine', vol: 0.05, slide: 0.8 }); break;
      case 'move': this.noise(0.09, 0.06, 1200); this.tone(240, 0.12, { type: 'triangle', vol: 0.04 }); break;
      case 'hit': this.noise(0.12, 0.15, 520); this.tone(150, 0.15, { type: 'sawtooth', vol: 0.06, slide: 0.6 }); break;
      case 'crit': this.noise(0.2, 0.22, 380); this.tone(100, 0.28, { type: 'sawtooth', vol: 0.1, slide: 0.5 }); break;
      case 'miss': this.noise(0.1, 0.05, 2400); this.tone(880, 0.08, { type: 'sine', vol: 0.03, slide: 1.3 }); break;
      case 'heal': [523, 659, 784].forEach((f, i) => this.tone(f, 0.35, { type: 'sine', vol: 0.045, delay: i * 0.06 })); break;
      case 'death': this.tone(220, 0.5, { type: 'triangle', vol: 0.08, slide: 0.5 }); this.noise(0.3, 0.07, 300); break;
      case 'levelup': [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.4, { type: 'triangle', vol: 0.05, delay: i * 0.08 })); break;
      case 'node': [392, 587, 880].forEach((f, i) => this.tone(f, 0.5, { type: 'sine', vol: 0.05, delay: i * 0.1 })); break;
      case 'gold': this.tone(880, 0.1, { type: 'triangle', vol: 0.05 }); this.tone(1320, 0.18, { type: 'triangle', vol: 0.04, delay: 0.07 }); break;
      case 'open': this.tone(300, 0.16, { type: 'triangle', vol: 0.05 }); this.tone(450, 0.2, { type: 'triangle', vol: 0.04, delay: 0.08 }); break;
      case 'victory': [262, 330, 392, 523, 659].forEach((f, i) => this.tone(f, 0.7, { type: 'triangle', vol: 0.055, delay: i * 0.12 })); break;
      case 'defeat': [330, 294, 247, 196].forEach((f, i) => this.tone(f, 0.8, { type: 'sine', vol: 0.06, delay: i * 0.16 })); break;
      case 'promote': [392, 494, 587, 784, 988].forEach((f, i) => this.tone(f, 0.5, { type: 'triangle', vol: 0.05, delay: i * 0.09 })); break;
      case 'phase': this.tone(196, 0.5, { type: 'sine', vol: 0.05 }); this.noise(0.25, 0.04, 500); break;
      default: this.tone(600, 0.05, { type: 'triangle', vol: 0.04 });
    }
  },

  playMusic(mode) {
    if (!this.ensure()) return;
    if (!this.musicOn) { this.mode = mode; return; }
    if (this.mode === mode && this.musicTimer) return;
    this.stopMusic();
    this.mode = mode;
    const scales = {
      title: [196, 220, 262, 294, 330, 392, 440],
      camp: [220, 262, 294, 330, 392, 440, 523],
      battle: [147, 175, 196, 220, 262, 294, 349],
      boss: [131, 147, 175, 196, 220, 262, 294]
    };
    const scale = scales[mode] || scales.camp;
    const slow = mode === 'title' ? 2200 : mode === 'battle' || mode === 'boss' ? 1500 : 1900;
    if (mode === 'battle' || mode === 'boss') {
      // 低频脉动
      const drone = this.ctx.createOscillator();
      const dg = this.ctx.createGain();
      drone.type = 'sine';
      drone.frequency.value = mode === 'boss' ? 55 : 65;
      dg.gain.value = 0.035;
      drone.connect(dg); dg.connect(this.musicGain);
      drone.start();
      this.drone = { osc: drone, gain: dg };
    }
    let step = 0;
    const tick = () => {
      if (!this.ctx || !this.musicOn) return;
      const n = scale[(step * 3 + (step % 2)) % scale.length];
      const octave = step % 5 === 0 ? 2 : 1;
      this.tone(n * octave, mode === 'battle' ? 1.1 : 1.8, { type: 'triangle', vol: 0.035, music: true, filter: 'lowpass', filterFreq: 1400 });
      if (step % 4 === 2) this.tone(scale[0] / 2, 2.4, { type: 'sine', vol: 0.03, music: true });
      if (mode === 'battle' && step % 2 === 0) this.tone(72, 0.16, { type: 'sine', vol: 0.05, music: true });
      step++;
    };
    tick();
    this.musicTimer = setInterval(tick, slow);
  },

  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
    if (this.drone) {
      try {
        this.drone.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
        const osc = this.drone.osc;
        setTimeout(() => { try { osc.stop(); } catch (e) {} }, 400);
      } catch (e) {}
      this.drone = null;
    }
    this.mode = '';
  }
};

if (typeof window !== 'undefined') window.Audio = Audio;
