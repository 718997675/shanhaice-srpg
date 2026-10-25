/* ============================================================
 * 打击感层（二期 G）—— js/juice.js
 *
 * 顿帧 / 闪白 / 抖动 / 击退 / 挤压 / 粒子 / 必杀四段式 / 击杀慢动作。
 * **只做呈现，不算公式**：本模块不读也不写任何战斗数值，输入全部来自
 * battle.performCombat 的结算事件（ev.crit / ev.lethal / ev.dmg）。
 *
 * 时钟模型：Juice 维护一条虚拟时钟（clock）。update(rawDt) 在顿帧期
 * 返回 0 且时钟停走——渲染层所有 performance.now() 计时（飘字/斩击/
 * 震屏/冲斩/横版演出）都改读 Juice.now()，"世界冻结"一处改动全局生效；
 * 逻辑定时器（setTimeout）不受影响——先算后回放，最安全。
 *
 * 接入：
 *   main.js 主循环  Juice.update(dt)              // rAF 时间戳
 *   battle.js       Juice.hitFromEv(ev, speed)    // 命中瞬间
 *                   Juice.critWindUp/critWindDown // 必杀静→蓄→余
 *   render.js       this.time = Juice.now()       // 冻结时钟
 *                   Juice.drawFx(ctx, geo)        // 粒子/冲击帧/闪白/暗角/立绘
 *   BattleView      now() 改读 Juice.now()
 * 设置（Game.settings）：juice 总开关 / reducedMotion 减少动态效果 /
 *   haptics 触感；倍速时顿帧与慢动作按比例缩短。
 * ============================================================ */
const Juice = {
  /* ---------------- 状态 ---------------- */
  hitstop: 0,          // 秒；>0 全冻结（虚拟时钟停走）
  timeScale: 1,        // 慢动作倍率（击杀 0.25 / 必杀蓄力 0.35）
  _slowEnd: 0,         // 真实时间 ms，慢动作结束线
  trauma: 0,           // 抖动能量 0~1（衰减 ~2.2/s）
  flash: 0,            // 闪白强度 0~1（衰减 ~5/s）
  flashColor: '#fff',
  vignette: 0,         // 暗角脉冲 0~1（击杀）
  zoom: 1,             // 棋盘推镜（必杀预兆）
  _zoomTo: 1,
  impact: 0,           // 冲击帧剩余（帧）
  particles: [],
  knock: Object.create(null),   // unitId -> {x 击退px, squash 挤压}
  falls: Object.create(null),   // unitId -> {t0 虚拟时钟ms} 倒地
  cutIn: null,         // {img, t0, dur, side, out} 必杀立绘切入
  deathCard: null,     // {name, line, t0(真实ms), dur} 死亡定格
  clock: 0,            // 虚拟时钟 ms

  /* 死亡定格时长（ms，×1）；倍速按比例缩，钳在 500~1500 */
  DEATH_CARD_MS: 1200,

  /* 调参表（二期计划 G.8）：轻击 / 必杀 / 击杀 */
  TUNING: {
    hit:  { stop: 4 / 60, flash: 0.18, trauma: 0.12, knock: 10, sparks: 12, vib: [10] },
    crit: { stop: 8 / 60, flash: 0.70, trauma: 0.60, knock: 26, sparks: 26, vib: [0, 28, 18, 55], slow: [0.35, 0.18] },
    kill: { stop: 12 / 60, flash: 0.80, trauma: 0.75, knock: 34, sparks: 34, vib: [0, 18, 18, 18, 18, 90], slow: [0.25, 0.40] }
  },

  /* ---------------- 设置（懒读 Game.settings，始终最新） ---------------- */
  _cfg() {
    const s = (typeof Game !== 'undefined' && Game.settings) ? Game.settings : null;
    return {
      on: !s || s.juice !== false,
      reduced: !!(s && s.reducedMotion),
      haptics: !s || s.haptics !== false
    };
  },

  now() { return this.clock; },

  /* 真实时钟（死亡定格的黑屏淡入淡出用——世界冻结但卡片要会演完） */
  _realNow() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); },

  /* ---------------- 主循环入口（main.js 每帧调用） ---------------- */
  update(rawDtMs) {
    const dt = Math.min(Math.max(rawDtMs || 0, 0), 50);
    /* 死亡定格到点撤卡（真实时间） */
    if (this.deathCard && this._realNow() - this.deathCard.t0 >= this.deathCard.dur) this.deathCard = null;
    if (this.hitstop > 0) {
      this.hitstop -= dt / 1000;
      if (this.hitstop < 0) this.hitstop = 0;
      this._decay(dt, 0);          // 冻结：时钟不走，衰减照走
      return 0;
    }
    if (this.timeScale !== 1 && this._slowEnd && typeof performance !== 'undefined' &&
        performance.now() >= this._slowEnd) this.timeScale = 1;
    const scaled = dt * this.timeScale;
    this.clock += scaled;
    this._decay(dt, scaled);
    return scaled;
  },

  _decay(rawDt, scaled) {
    const r = rawDt / 1000;
    this.trauma = Math.max(0, this.trauma - r * 2.2);
    this.flash = Math.max(0, this.flash - r * 5);
    this.vignette = Math.max(0, this.vignette - r * 1.6);
    if (this.impact > 0 && scaled > 0) this.impact -= 1;
    if (this.zoom !== this._zoomTo) {
      this.zoom += (this._zoomTo - this.zoom) * Math.min(1, (scaled / 16) * 0.14);
      if (Math.abs(this._zoomTo - this.zoom) < 0.001) this.zoom = this._zoomTo;
    }
    const f = scaled / 16;
    if (f > 0) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= scaled;
        if (p.life <= 0) { this.particles.splice(i, 1); continue; }
        p.x += p.vx * f; p.y += p.vy * f;
        p.vy += p.g * f;
        p.vx *= 0.98; p.vy *= 0.98;
      }
      for (const id in this.knock) {
        const k = this.knock[id];
        k.x += -k.x * Math.min(1, f * 0.18);
        k.squash *= Math.pow(0.86, f);
        if (Math.abs(k.x) < 0.3 && k.squash < 0.01) delete this.knock[id];
      }
    }
  },

  /* ---------------- 原语 ---------------- */
  freeze(sec) { this.hitstop = Math.max(this.hitstop, sec); },

  slow(scale, sec) {
    this.timeScale = scale;
    this._slowEnd = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + sec * 1000;
  },

  shake(t) { this.trauma = Math.min(1, this.trauma + t); },

  white(v, c) { this.flash = Math.min(1, this.flash + v); this.flashColor = c || '#fff'; },

  zoomTo(z) { this._zoomTo = z; },

  vibrate(pattern) {
    const cfg = this._cfg();
    if (!cfg.haptics || cfg.reduced) return;
    try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* 静默 */ }
  },

  /* 震屏偏移（trauma²，render.draw 用） */
  shakeOffset(max) {
    if (this.trauma <= 0) return { x: 0, y: 0 };
    const s = this.trauma * this.trauma;
    const m = max || 12;
    return { x: (Math.random() * 2 - 1) * m * s, y: (Math.random() * 2 - 1) * m * s };
  },

  /* 格坐标 → 像素（Render 未初始化时按 50px 格兜底，vm 测试可用） */
  _px(tx) {
    const R = (typeof Render !== 'undefined') ? Render : null;
    return R && R.ox != null ? R.ox + tx * R.tile + R.tile / 2 : tx * 50;
  },
  _py(ty) {
    const R = (typeof Render !== 'undefined') ? Render : null;
    return R && R.oy != null ? R.oy + ty * R.tile + R.tile / 2 : ty * 50;
  },

  /* 粒子（像素空间；dir=攻击方相对受击方的方向，火花逆向喷） */
  sparksPX(px, py, dir, n, tier) {
    const radial = tier !== 'hit';
    for (let i = 0; i < n; i++) {
      const a = radial ? Math.random() * Math.PI * 2
        : (Math.random() - 0.5) * 1.5 + ((dir || 1) > 0 ? Math.PI : 0);
      const sp = radial ? 2.4 + Math.random() * 3.6 : 1.8 + Math.random() * 2.8;
      this.particles.push({
        x: px, y: py,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (radial ? 0 : 0.6),
        g: radial ? 0.07 : 0.13,
        life: 320 + Math.random() * 220, max: 540,
        size: tier === 'kill' ? 2.6 : tier === 'crit' ? 2.2 : 1.7,
        color: tier === 'crit' ? '#ffd98a' : tier === 'kill' ? '#e08a7a' : '#f0e2c4'
      });
    }
    if (this.particles.length > 240) this.particles.splice(0, this.particles.length - 240);
  },

  knockBack(unitId, px, dir) {
    if (!unitId) return;
    const prev = this.knock[unitId];
    this.knock[unitId] = {
      x: (prev ? prev.x : 0) + px * (dir || 1),
      squash: 1
    };
  },

  fall(unitId) {
    if (!unitId || this.falls[unitId]) return;
    this.falls[unitId] = { t0: this.clock };
  },

  /* 倒地进度 0~1（渲染用） */
  fallP(unitId) {
    const f = this.falls[unitId];
    if (!f) return 0;
    return Math.max(0, Math.min(1, (this.clock - f.t0) / 420));
  },

  /* ---------------- 命中瞬间（顿帧三件套 + 粒子 + 击退 + 触觉） ----------------
   * opts: {crit, kill, x, y(格), dir, speed, unitId} */
  hit(o) {
    o = o || {};
    const cfg = this._cfg();
    if (!cfg.on) return;
    const sp = Math.max(0.5, o.speed || 1);
    const tier = o.kill ? 'kill' : o.crit ? 'crit' : 'hit';
    const T = this.TUNING[tier];
    if (cfg.reduced) { this.freeze(2 / 60 / sp); return; }   // 无障碍：只留 2 帧顿帧
    this.freeze(T.stop / sp);
    this.white(T.flash, tier === 'hit' ? '#ffffff' : '#fff6d5');
    this.shake(T.trauma);
    this.impact = 2;
    if (o.unitId) this.knockBack(o.unitId, T.knock, o.dir);
    if (o.kill) {
      if (o.unitId) this.fall(o.unitId);
      this.vignette = 0.8;
    }
    this.sparksPX(this._px(o.x), this._py(o.y), o.dir, T.sparks, tier);
    if (T.slow) this.slow(T.slow[0], T.slow[1] / sp);
    this.vibrate(T.vib);
    if (o.crit && typeof Render !== 'undefined' && Render.floatText) {
      Render.floatText('会心', o.x, o.y - 0.7, '#ffd34d', 22, true);
    }
  },

  /* 从结算事件取场面信息（单位/坐标/方向）再走 hit()。
   * battle.performCombat（棋盘路）与 BattleView.strike（横版路）调用。 */
  hitFromEv(ev, speed) {
    if (!ev || !ev.hit) return;
    const B = (typeof Battle !== 'undefined' && Battle.B) ? Battle.B : null;
    let fx = 0, fy = 0, ax = 0, id = null;
    if (B && B.units) {
      const foe = B.units.find(u => u.id === ev.defender);
      const atk = B.units.find(u => u.id === ev.attacker);
      if (foe) { fx = foe.x; fy = foe.y; id = foe.id; }
      if (atk) { ax = atk.x; }
    }
    const dir = ax === fx ? 1 : (ax > fx ? 1 : -1);
    this.hit({ crit: !!ev.crit, kill: !!ev.lethal, x: fx, y: fy, dir, speed, unitId: id });
  },

  /* 必杀四段式之「静→蓄」：静音一拍 + 推镜 + 立绘切入 + 慢放。
   * 冲斩之前 await；命中后 critWindDown 收势。 */
  async critWindUp(unit, speed) {
    const cfg = this._cfg();
    if (!cfg.on) return;
    const sp = Math.max(0.5, speed || 1);
    if (cfg.reduced) { this.freeze(2 / 60 / sp); return; }
    if (typeof Audio !== 'undefined' && Audio.duck) Audio.duck(0.18);
    this.zoomTo(1.045);
    await this._sleep(110 / sp);
    this.cutIn = {
      img: this._portrait(unit),
      t0: this.clock, dur: 240 / sp,
      side: unit && unit.side === 'enemy' ? 'L' : 'R', out: false
    };
    this.slow(0.35, 0.22 / sp);
    await this._sleep(130 / sp);
  },

  /* 必杀四段式之「余」：推镜回正 + 立绘滑出 */
  async critWindDown(speed) {
    const cfg = this._cfg();
    if (!cfg.on || cfg.reduced) { this.cutIn = null; this.zoomTo(1); return; }
    const sp = Math.max(0.5, speed || 1);
    this.zoomTo(1);
    if (this.cutIn) {
      this.cutIn.out = true;
      this.cutIn.t0 = this.clock;
      this.cutIn.dur = 170 / sp;
    }
    await this._sleep(150 / sp);
    this.cutIn = null;
  },

  _portrait(unit) {
    if (!unit || typeof BattleView === 'undefined' || !BattleView.portraitOf) return null;
    const path = BattleView.portraitOf(unit);
    if (!path || !BattleView.img) return null;
    const im = BattleView.img(path);
    return im && im._ok ? im : null;
  },

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

  /* 死亡定格（二期 G 微改动 2）：黑屏 + 名字 + 一行动机文案。
   * 返回定格毫秒数（0 = 没演），调用方 await 等量的 wait。
   * 遗言取 EPITAPHS（英魂碑同源），没有就落通用句。 */
  deathCardFor(unit, speed) {
    const cfg = this._cfg();
    if (!cfg.on || !unit) return 0;
    const sp = Math.max(0.5, speed || 1);
    const dur = Math.round(Math.min(1500, Math.max(500, this.DEATH_CARD_MS / sp)));
    const ep = (typeof EPITAPHS !== 'undefined' && unit.charId) ? EPITAPHS[unit.charId] : null;
    this.deathCard = {
      name: unit.name || '？',
      line: ep || '这一脉，就此断了。',
      t0: this._realNow(), dur: dur
    };
    this.freeze(dur / 1000);
    this.vignette = 0.9;
    if (!cfg.reduced) this.shake(0.5);
    return dur;
  },

  /* 点击跳过 / 战斗结束：必须清零 hitstop/timeScale/flash，否则卡半帧 */
  clearAll() {
    this.hitstop = 0;
    this.timeScale = 1;
    this._slowEnd = 0;
    this.trauma = 0;
    this.flash = 0;
    this.vignette = 0;
    this.impact = 0;
    this.zoom = 1;
    this._zoomTo = 1;
    this.particles.length = 0;
    this.knock = Object.create(null);
    this.falls = Object.create(null);
    this.cutIn = null;
    this.deathCard = null;
  },
  reset() { this.clearAll(); },

  /* ---------------- 画布层特效 ----------------
   * geo: {ox, oy, tile, W, H, boardW, boardH}（render.drawFx 末尾调用） */
  drawFx(ctx, geo) {
    if (!ctx || !geo) return;
    if (this.particles.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this.particles) {
        const a = Math.max(0, p.life / p.max);
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    /* 冲击帧：2 帧白底 + 粗黑斜切 */
    if (this.impact > 0) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#fff';
      ctx.fillRect(geo.ox, geo.oy, geo.boardW, geo.boardH);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#141814';
      ctx.lineWidth = Math.max(6, geo.tile * 0.22);
      ctx.beginPath();
      ctx.moveTo(geo.ox - 20, geo.oy + geo.boardH * 0.72);
      ctx.lineTo(geo.ox + geo.boardW + 20, geo.oy + geo.boardH * 0.18);
      ctx.stroke();
      ctx.restore();
    }
    /* 闪白 */
    if (this.flash > 0.01) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.9, this.flash);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(geo.ox, geo.oy, geo.boardW, geo.boardH);
      ctx.restore();
    }
    /* 暗角脉冲（击杀） */
    if (this.vignette > 0.01) {
      const cx = geo.ox + geo.boardW / 2, cy = geo.oy + geo.boardH / 2;
      const R = Math.max(geo.boardW, geo.boardH) * 0.62;
      const g = ctx.createRadialGradient(cx, cy, R * 0.45, cx, cy, R);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,' + (0.55 * this.vignette).toFixed(3) + ')');
      ctx.save();
      ctx.fillStyle = g;
      ctx.fillRect(geo.ox, geo.oy, geo.boardW, geo.boardH);
      ctx.restore();
    }
    this._drawCutIn(ctx, geo);
    this._drawDeathCard(ctx, geo);
  },

  /* 死亡定格卡：黑屏 + 名字 + 遗言。用真实时钟演淡入淡出，
   * 并重置变换（否则会跟着震屏/推镜晃）。 */
  _drawDeathCard(ctx, geo) {
    const dc = this.deathCard;
    if (!dc) return;
    const e = (this._realNow() - dc.t0) / Math.max(1, dc.dur);
    const a = e < 0.12 ? e / 0.12 : (e > 0.85 ? Math.max(0, (1 - e) / 0.15) : 1);
    if (a <= 0.01) return;
    const dpr = geo.dpr || 1;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(5,8,6,.86)';
    ctx.fillRect(0, 0, geo.W, geo.H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const cx = geo.W / 2, cy = geo.H / 2;
    ctx.font = '700 26px "Noto Serif SC", "Songti SC", serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(8,10,8,.9)';
    ctx.strokeText(dc.name, cx, cy - 14);
    ctx.fillStyle = '#e7d5b0';
    ctx.fillText(dc.name, cx, cy - 14);
    if (dc.line) {
      ctx.font = '400 14px "Noto Serif SC", "Songti SC", serif';
      ctx.strokeText(dc.line, cx, cy + 20);
      ctx.fillStyle = '#cfc8b2';
      ctx.fillText(dc.line, cx, cy + 20);
    }
    ctx.restore();
  },

  /* 必杀立绘切入（四段式的「蓄」）：侧滑 + 斜切底板，缺图静默跳过 */
  _drawCutIn(ctx, geo) {
    const c = this.cutIn;
    if (!c || !c.img) return;
    const p = Math.max(0, Math.min(1, (this.clock - c.t0) / Math.max(1, c.dur)));
    const e = 1 - Math.pow(1 - p, 3);
    const slide = c.out ? e : 1 - e;
    const fromRight = c.side === 'R';
    const w = Math.min(geo.W * 0.30, geo.H * 0.72);
    const h = w * 1.25;
    const x = fromRight ? geo.W - w * slide * 1.15 - 8 : -w + w * slide * 1.15 + 8;
    const y = (geo.H - h) / 2;
    ctx.save();
    ctx.globalAlpha = c.out ? Math.max(0, 1 - e) : 0.92;
    ctx.translate(x + w / 2, y + h / 2);
    ctx.transform(1, 0, -0.12, 1, 0, 0);
    ctx.fillStyle = 'rgba(10,14,11,.55)';
    ctx.fillRect(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12);
    try { ctx.drawImage(c.img, -w / 2, -h / 2, w, h); } catch (err) { /* 静默 */ }
    ctx.restore();
  }
};

if (typeof window !== 'undefined') window.Juice = Juice;
