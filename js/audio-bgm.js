/* ============================================================
 * 音频文件层（二期）—— js/audio-bgm.js
 *
 * 为什么用 <audio> 标签：file:// 下 <audio src="本地文件"> 可以可靠播放，
 * 而 WebAudio 的 fetch + decodeAudioData 会被 CORS 挡死。所以 BGM 与采样
 * 音效必须走元素；WebAudio 合成（js/audio.js）退居兜底与 UI 音。
 *
 * 两条池：
 *   BGM——场景音乐管理器（crossfade / duck / 开关），文件缺失自动回退程序音乐；
 *   SFX——采样音效池（文件优先，未就绪时当次回退合成，之后自动切文件）。
 *
 * 红线：只做播放，不算任何数值、不读战斗公式（呈现层）。
 * 加载顺序：js/audio.js → js/audio-bgm.js（本文件在运行时反调 Audio 兜底）。
 * ============================================================ */
const BGM = {
  DIR: 'assets/audio/bgm/',
  /* mode → 文件名（去掉扩展名）；title 等无文件模式直接走合成 */
  TRACKS: { camp: 'bgm_camp', battle: 'bgm_battle', boss: 'bgm_boss', story: 'bgm_story' },
  VOL: 0.55,
  _ok: {},        /* track → true 文件可用 / false 不可用（探测一次记终身） */
  _els: {},       /* track → <audio> */
  _cur: null,     /* 当前文件播放 { track, el } */
  _mode: '',
  _supported: null,
  _duckT: null, _duckFade: null,

  /* 能力探测：没有真 DOM audio 能力就整体关闭文件层（vm/测试环境） */
  _can() {
    if (this._supported !== null) return this._supported;
    this._supported = false;
    try {
      if (typeof document === 'undefined' || !document.createElement) return false;
      const probe = document.createElement('audio');
      if (!probe || typeof probe.play !== 'function' || typeof probe.addEventListener !== 'function') return false;
      this._supported = true;
    } catch (e) { this._supported = false; }
    return this._supported;
  },

  _el(track) {
    if (this._els[track]) return this._els[track];
    if (!this._can()) return null;
    try {
      const el = document.createElement('audio');
      el.loop = true;
      el.preload = 'auto';
      el.volume = 0;
      /* ogg 优先 mp3 兜底：浏览器自己挑能播的 */
      for (const ext of ['ogg', 'mp3']) {
        const s = document.createElement('source');
        s.src = this.DIR + track + '.' + ext;
        s.type = ext === 'ogg' ? 'audio/ogg' : 'audio/mpeg';
        el.appendChild(s);
      }
      el.addEventListener('error', () => { this._ok[track] = false; });
      this._els[track] = el;
      return el;
    } catch (e) { return null; }
  },

  play(mode) {
    if (typeof Audio === 'undefined') return;
    const track = this.TRACKS[mode];
    if (!track) { Audio.playMusic(mode); return; }   /* 无文件模式（title）直接合成 */
    if (this._mode === mode && (this._cur || Audio.mode === mode)) return;
    this.stop();
    this._mode = mode;
    if (!this._can() || this._ok[track] === false) { Audio.playMusic(mode); return; }
    const el = this._el(track);
    if (!el) { Audio.playMusic(mode); return; }
    if (this._ok[track] === true) { this._start(track, el); return; }
    /* 首次加载：等 canplay / error；1.2s 兜底按 readyState 裁决（file:// 怪癖） */
    let settled = false;
    const done = ok => {
      if (settled) return;
      settled = true;
      try { el.removeEventListener('canplay', onOk); el.removeEventListener('error', onErr); } catch (e) {}
      if (ok) this._start(track, el);
      else { this._ok[track] = false; if (this._mode === mode) Audio.playMusic(mode); }
    };
    const onOk = () => done(true);
    const onErr = () => done(false);
    try {
      el.addEventListener('canplay', onOk);
      el.addEventListener('error', onErr);
      el.load();
      setTimeout(() => { if (!settled) done(el.readyState >= 2); }, 1200);
    } catch (e) { done(false); }
  },

  _start(track, el) {
    this._ok[track] = true;
    this._cur = { track, el };
    this._fade(el, this._vol(), 900);
    try {
      const p = el.play();
      if (p && p.catch) p.catch(() => { this._ok[track] = false; this._fallback(track); });
    } catch (e) { this._ok[track] = false; }
  },

  _fallback(mode) {
    if (typeof Audio !== 'undefined' && Audio.playMusic) Audio.playMusic(mode);
  },

  _vol() {
    return (typeof Game !== 'undefined' && Game.settings && Game.settings.music === false) ? 0 : this.VOL;
  },

  /* 音量斜坡（局部定时器，互不踩） */
  _fade(el, to, ms, done) {
    if (!el) { if (done) done(); return null; }
    const from = typeof el.volume === 'number' ? el.volume : 0;
    const steps = Math.max(1, Math.round((ms || 0) / 50));
    let i = 0;
    const t = setInterval(() => {
      i++;
      try { el.volume = Math.max(0, Math.min(1, from + (to - from) * (i / steps))); } catch (e) {}
      if (i >= steps) { clearInterval(t); if (done) done(); }
    }, 50);
    return t;
  },

  stop() {
    const cur = this._cur;
    this._cur = null;
    this._mode = '';
    if (cur && cur.el) {
      const el = cur.el;
      this._fade(el, 0, 500, () => { try { el.pause(); } catch (e) {} });
    }
    if (typeof Audio !== 'undefined' && Audio.stopMusic) Audio.stopMusic();
  },

  /* 必杀「静默一拍」：文件音乐也压下去再回（juice.js 经 Audio.duck 转到这） */
  duck(sec) {
    const cur = this._cur;
    if (!cur || !cur.el) return;
    const el = cur.el;
    if (this._duckT) { clearTimeout(this._duckT); this._duckT = null; }
    if (this._duckFade) { clearInterval(this._duckFade); this._duckFade = null; }
    this._duckFade = this._fade(el, 0.02, 60);
    this._duckT = setTimeout(() => {
      this._duckFade = this._fade(el, this._vol(), 400);
    }, Math.max(80, (sec || 0.18) * 1000));
  },

  /* 设置开关：暂停/恢复 + 音量斜坡 */
  setMusicOn(on) {
    if (!this._cur || !this._cur.el) return;
    const el = this._cur.el;
    if (on === false) {
      this._fade(el, 0, 300, () => { try { el.pause(); } catch (e) {} });
    } else {
      try { const p = el.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
      this._fade(el, this._vol(), 300);
    }
  }
};

/* ---------------- 采样音效池（文件优先，合成兜底） ----------------
 * Audio.sfx(name) 先问这里；返回 true 表示已由文件接管。
 * 首次调用时文件可能还没加载完——当次返回 false 走合成，加载裁决落进
 * _ok，之后同名音效全部走文件。接口不变，日后整体换采样零成本。 */
const SFX = {
  DIR: 'assets/audio/sfx/',
  VOL: 0.7,
  _ok: {},
  _supported: null,

  _can() {
    if (this._supported !== null) return this._supported;
    this._supported = false;
    try {
      if (typeof document === 'undefined' || !document.createElement) return false;
      const probe = document.createElement('audio');
      if (!probe || typeof probe.play !== 'function' || typeof probe.addEventListener !== 'function') return false;
      this._supported = true;
    } catch (e) { this._supported = false; }
    return this._supported;
  },

  play(name) {
    if (!name || this._ok[name] === false || !this._can()) return false;
    let el;
    try {
      el = document.createElement('audio');
      el.preload = 'auto';
      el.src = this.DIR + name + '.wav';
    } catch (e) { return false; }
    if (this._ok[name] === true) { this._fire(el); return true; }
    let settled = false;
    const done = ok => {
      if (settled) return;
      settled = true;
      try { el.removeEventListener('canplay', onOk); el.removeEventListener('error', onErr); } catch (e) {}
      this._ok[name] = ok;
      if (ok) this._fire(el);
    };
    const onOk = () => done(true);
    const onErr = () => done(false);
    try {
      el.addEventListener('canplay', onOk);
      el.addEventListener('error', onErr);
      el.load();
      setTimeout(() => { if (!settled) done(el.readyState >= 2); }, 900);
    } catch (e) { done(false); }
    return false;
  },

  _fire(el) {
    try {
      el.volume = this.VOL;
      el.currentTime = 0;
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }
};

if (typeof window !== 'undefined') { window.BGM = BGM; window.SFX = SFX; }
