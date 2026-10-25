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

  /* 必杀「静默一拍」（二期 G）：文件音乐转 BGM.duck，合成音乐压 musicGain */
  duck(sec) {
    if (typeof BGM !== 'undefined' && BGM._cur) { BGM.duck(sec); return; }
    if (!this.ctx || !this.musicGain) return;
    const t = this.ctx.currentTime;
    try {
      this.musicGain.gain.cancelScheduledValues(t);
      this.musicGain.gain.setTargetAtTime(0, t, 0.02);
    } catch (e) { /* 静默 */ }
    setTimeout(() => {
      if (!this.ctx || !this.musicGain) return;
      try {
        this.musicGain.gain.setTargetAtTime(this.musicOn ? 0.18 : 0, this.ctx.currentTime, 0.06);
      } catch (e) { /* 静默 */ }
    }, Math.max(60, (sec || 0.15) * 1000));
  },

  /* 扫频噪声（挥击/施法等「运动感」音效的基底）：带通/低通 + 频率斜坡 + 包络 */
  sweep(dur, vol, f0, f1, delay, type, q) {
    if (!this.ctx) return;
    try {
      const t0 = this.ctx.currentTime + (delay || 0);
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = type || 'bandpass';
      f.Q.value = q || 1;
      f.frequency.setValueAtTime(Math.max(40, f0), t0);
      f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + Math.min(0.015, dur * 0.25));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(this.sfxGain);
      src.start(t0);
      src.stop(t0 + dur + 0.03);
    } catch (e) { /* 静默 */ }
  },

  /* 金属撞击（打击感核心）：三层叠加——
   * ① 瞬态：高通白噪声 8ms，**直角 attack**（指数斜坡是「软」的根因）
   * ② 非谐共振峰：base×[1, 2.37, 4.11]（间距不和的整数比才有金属味），
   *    triangle/sine，快速衰减 50/25/15ms
   * ③ body：base×0.28→0.16 低频下滑 140ms，给「打在实处」的分量 */
  clang(base, vol, delay) {
    if (!this.ctx) return;
    try {
      const t0 = this.ctx.currentTime + (delay || 0);
      const V = Math.max(0.0002, vol || 0.12);
      /* ① 瞬态噪声 */
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * 0.008));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 2200;
      const g0 = this.ctx.createGain();
      g0.gain.setValueAtTime(V, t0);
      g0.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.01);
      src.connect(hp); hp.connect(g0); g0.connect(this.sfxGain);
      src.start(t0);
      /* ② 非谐共振峰 */
      const ratios = [1, 2.37, 4.11];
      for (let i = 0; i < ratios.length; i++) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = i === 0 ? 'triangle' : 'sine';
        o.frequency.value = base * ratios[i];
        const dec = 0.05 / (i + 1);
        g.gain.setValueAtTime(V * (0.9 / (i + 1.2)), t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dec);
        o.connect(g); g.connect(this.sfxGain);
        o.start(t0); o.stop(t0 + dec + 0.03);
      }
      /* ③ 低频 body */
      const bo = this.ctx.createOscillator();
      const bg = this.ctx.createGain();
      bo.type = 'sine';
      bo.frequency.setValueAtTime(base * 0.28, t0);
      bo.frequency.exponentialRampToValueAtTime(Math.max(30, base * 0.16), t0 + 0.12);
      bg.gain.setValueAtTime(V * 0.9, t0);
      bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.14);
      bo.connect(bg); bg.connect(this.sfxGain);
      bo.start(t0); bo.stop(t0 + 0.17);
    } catch (e) { /* 静默 */ }
  },

  /* 妖物嘶吼：锯齿波下滑（声带感）+ 带通噪声 + 颤音抖动 */
  growl(dur, f0, f1, vol, delay) {
    if (!this.ctx) return;
    try {
      const t0 = this.ctx.currentTime + (delay || 0);
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(Math.max(30, f0), t0);
      /* 颤音：每 60ms 抖一下，破掉「合成器平滑感」 */
      const steps = Math.max(2, Math.round(dur / 0.06));
      for (let i = 1; i <= steps; i++) {
        const jitter = 1 + (i % 2 ? 0.06 : -0.06) * (0.5 + Math.random() * 0.5);
        o.frequency.exponentialRampToValueAtTime(
          Math.max(30, f0 * Math.pow(f1 / f0, i / steps) * jitter), t0 + dur * i / steps);
      }
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 420;
      bp.Q.value = 1.6;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol || 0.09), t0 + Math.min(0.05, dur * 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(bp); bp.connect(g); g.connect(this.sfxGain);
      o.start(t0); o.stop(t0 + dur + 0.03);
      /* 呼气噪声垫底 */
      this.noise(dur * 0.9, (vol || 0.09) * 0.5, 300, delay);
    } catch (e) { /* 静默 */ }
  },

  sfx(name) {
    if (!this.sfxOn || !this.ensure()) return;
    /* 文件优先（二期）：assets/audio/sfx/<name>.wav 就绪过就交给 <audio> 池 */
    if (typeof SFX !== 'undefined' && SFX.play(name)) return;
    switch (name) {
      case 'tap': this.tone(660, 0.06, { type: 'triangle', vol: 0.05 }); break;
      case 'select': this.tone(520, 0.1, { type: 'triangle', vol: 0.06 }); this.tone(780, 0.12, { type: 'sine', vol: 0.04, delay: 0.04 }); break;
      case 'cancel': this.tone(380, 0.1, { type: 'sine', vol: 0.05, slide: 0.8 }); break;
      case 'move': this.noise(0.09, 0.06, 1200); this.tone(240, 0.12, { type: 'triangle', vol: 0.04 }); break;
      /* 命中：肉身——金属 clang 主打（冷兵器刀刀见金）+ crunch + 身体闷响 */
      case 'hit': this.clang(1700, 0.1); this.sweep(0.08, 0.12, 1000, 350, 0, 'bandpass', 1.4); this.tone(95, 0.12, { type: 'triangle', vol: 0.08, slide: 0.55 }); break;
      case 'hit_flesh': this.clang(1650, 0.1); this.clang(2400, 0.05, 0.008); this.sweep(0.08, 0.12, 950, 300, 0, 'bandpass', 1.4); this.tone(100, 0.12, { type: 'triangle', vol: 0.08, slide: 0.55 }); break;
      /* 命中：金属（披甲/对金铁）——非谐共振峰 clang 主打，钝且脆 */
      case 'hit_metal': case 'hit_armor': this.clang(2100, 0.13); this.clang(3100, 0.06, 0.012); this.noise(0.05, 0.08, 2600, 0); break;
      /* 命中：木器——方波 click + 木腔共鸣 */
      case 'hit_wood': this.clang(420, 0.1); this.tone(320, 0.07, { type: 'square', vol: 0.07, slide: 0.7 }); this.tone(780, 0.05, { type: 'triangle', vol: 0.05, slide: 0.8 }); break;
      /* 挥击（起手，与命中分离才有「先挥后中」的节奏） */
      case 'swing_light': this.sweep(0.16, 0.1, 2600, 700, 0, 'bandpass', 1.2); break;
      case 'swing_heavy': this.sweep(0.3, 0.14, 900, 180, 0, 'lowpass', 0.8); this.tone(60, 0.22, { type: 'sine', vol: 0.05, slide: 0.7 }); break;
      case 'swing_sharp': this.sweep(0.1, 0.09, 4200, 1500, 0, 'bandpass', 2); this.tone(2400, 0.06, { type: 'sine', vol: 0.03, slide: 1.4 }); break;
      /* 必杀：先静音一拍，再 clang 双拍（第二拍更轻更慢）——「铛！铛！」 */
      case 'crit': case 'hit_crit': this.duck(0.16); this.clang(1900, 0.17, 0.02); this.clang(2600, 0.09, 0.1); this.tone(60, 0.34, { type: 'sine', vol: 0.2, slide: 0.4, delay: 0.02 }); this.sweep(0.22, 0.12, 2600, 500, 0.02, 'bandpass', 1.2); break;
      /* 五行法术：吟唱（起手上升）与爆发（命中释放）各一套 */
      case 'cast_metal': [1320, 1760, 2093].forEach((f, i) => this.tone(f, 0.5, { type: 'sine', vol: 0.035, delay: i * 0.07, slide: 1.15 })); this.sweep(0.7, 0.05, 3000, 6000, 0, 'bandpass', 4); break;
      case 'cast_wood': [392, 494, 587].forEach((f, i) => this.tone(f, 0.55, { type: 'triangle', vol: 0.04, delay: i * 0.08 })); this.sweep(0.6, 0.045, 500, 900, 0, 'bandpass', 1.5); break;
      case 'cast_water': [587, 698, 880].forEach((f, i) => this.tone(f, 0.5, { type: 'sine', vol: 0.04, delay: i * 0.06, slide: 1.3 })); this.sweep(0.7, 0.05, 900, 2600, 0, 'bandpass', 2); break;
      case 'cast_fire': this.sweep(0.8, 0.07, 300, 1800, 0, 'lowpass', 0.8); this.tone(110, 0.6, { type: 'sawtooth', vol: 0.04, slide: 1.6 }); break;
      case 'cast_earth': this.tone(70, 0.7, { type: 'sine', vol: 0.07, slide: 0.85 }); this.sweep(0.8, 0.05, 180, 90, 0, 'lowpass', 1); break;
      case 'burst_metal': this.tone(180, 0.35, { type: 'square', vol: 0.09, slide: 0.5 }); this.sweep(0.3, 0.13, 5000, 1200, 0, 'bandpass', 1.5); this.tone(90, 0.3, { type: 'sine', vol: 0.12, slide: 0.4 }); break;
      case 'burst_wood': this.sweep(0.35, 0.12, 1400, 300, 0, 'bandpass', 1.2); this.tone(160, 0.25, { type: 'triangle', vol: 0.09, slide: 0.6 }); break;
      case 'burst_water': this.sweep(0.4, 0.12, 2400, 400, 0, 'bandpass', 1); this.tone(520, 0.2, { type: 'sine', vol: 0.06, slide: 0.5 }); break;
      case 'burst_fire': this.sweep(0.45, 0.13, 1600, 200, 0, 'lowpass', 0.9); this.tone(80, 0.4, { type: 'sawtooth', vol: 0.1, slide: 0.45 }); break;
      case 'burst_earth': this.tone(55, 0.45, { type: 'sine', vol: 0.16, slide: 0.4 }); this.sweep(0.4, 0.12, 400, 120, 0, 'lowpass', 1); this.tone(140, 0.2, { type: 'square', vol: 0.05, slide: 0.6 }); break;
      /* 阵亡：我军——披甲倒地闷响 + 远钟（与死亡定格同帧，分量压过倒地声） */
      case 'death_hero': this.clang(680, 0.12); this.tone(150, 0.3, { type: 'sine', vol: 0.1, slide: 0.5 }); this.noise(0.35, 0.09, 240); this.tone(174, 0.9, { type: 'sine', vol: 0.07, slide: 0.55, delay: 0.04 }); this.tone(87, 0.9, { type: 'sine', vol: 0.05, delay: 0.1, slide: 0.6 }); break;
      /* 阵亡：敌军人类——倒地（钝响 + 身体落地） */
      case 'death': this.clang(300, 0.1); this.noise(0.28, 0.08, 200); this.tone(95, 0.25, { type: 'sine', vol: 0.09, slide: 0.5 }); break;
      /* 阵亡：妖物——嘶吼长下滑 + 倒地 */
      case 'foe_death': this.growl(0.7, 240, 60, 0.11); this.clang(200, 0.09, 0.55); this.noise(0.3, 0.07, 160, 0.55); break;
      /* 阵亡：Boss——金属闷响 + 长嘶吼 + 低频轰鸣 */
      case 'boss_death': this.clang(1400, 0.15); this.growl(0.9, 200, 50, 0.12, 0.12); this.tone(48, 1.1, { type: 'sine', vol: 0.14, slide: 0.5, delay: 0.1 }); this.noise(0.5, 0.08, 180, 0.1); break;
      /* 妖物受击：短嘶吼 + 钝击（金属目标不吃这套，走 hit_metal） */
      case 'foe_hit': this.growl(0.26, 300, 120, 0.1); this.clang(220, 0.09); break;
      /* 脚步（按移动类型分流）：步兵 / 甲胄 / 兽足 / 飞行 / 马蹄 */
      case 'step_foot': this.noise(0.05, 0.05, 900); this.tone(170, 0.07, { type: 'triangle', vol: 0.045, slide: 0.7 }); break;
      case 'step_armor': this.clang(1100, 0.05); this.noise(0.05, 0.04, 1400); break;
      case 'step_beast': this.noise(0.06, 0.05, 380); this.tone(95, 0.09, { type: 'triangle', vol: 0.06, slide: 0.6 }); break;
      case 'step_fly': this.sweep(0.22, 0.05, 500, 1300, 0, 'bandpass', 1.2); break;
      case 'step_horse': this.noise(0.04, 0.05, 700); this.tone(130, 0.06, { type: 'triangle', vol: 0.05, slide: 0.7 }); this.noise(0.04, 0.045, 700, 0.13); this.tone(120, 0.06, { type: 'triangle', vol: 0.045, slide: 0.7, delay: 0.13 }); break;
      /* 占领阵眼：玉磬 + 能量锁定 */
      case 'node_capture': [392, 587, 784, 1175].forEach((f, i) => this.tone(f, 0.5, { type: 'sine', vol: 0.045, delay: i * 0.07 })); break;
      case 'ui_confirm': this.tone(720, 0.05, { type: 'triangle', vol: 0.045 }); this.tone(1080, 0.06, { type: 'triangle', vol: 0.03, delay: 0.03 }); break;
      case 'miss': this.noise(0.1, 0.05, 2400); this.tone(880, 0.08, { type: 'sine', vol: 0.03, slide: 1.3 }); break;
      case 'heal': [523, 659, 784].forEach((f, i) => this.tone(f, 0.35, { type: 'sine', vol: 0.045, delay: i * 0.06 })); break;
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
