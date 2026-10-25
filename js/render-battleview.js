/* ============================================================
 * 横版战斗演出（P4.4）—— render-battleview.js
 *
 * 攻击时把棋盘切到横版画面：两侧全身立绘对峙 + 底部克制/弱点条，
 * 播完回到棋盘。**只做演出，不算公式**——命中/伤害/必杀全部由
 * battle.performCombat 以 Combat.resolve 的事件喂进来（ev.triangle /
 * ev.effective / ev.dmg / ev.hpAfter 都是结算结果，这里只显示）。
 *
 * 接入方式（battle.js performCombat）：
 *   const useView = BattleView.usable(atk, def);
 *   if (useView) BattleView.begin(atk, def, ctx);
 *   ... if (useView) await BattleView.strike(ev, B.speed);
 *        else await Render.lunge(...);
 *   ... if (useView) BattleView.end();
 *
 * 立绘链：全身（portraits/full/）→ 胸像（portraits/）→ 剪影图标
 * （icons/units/）→ 程序剪影（色圆 + 首字）。任何一级缺失都静默
 * 降级，不炸演出。vm 测试桩里 Image 永不触发 onload，自动走剪影。
 * ============================================================ */

/* 全身立绘清单（assets/portraits/full/ 实际文件，formulas/smoke 断言同步）。
 * 横版对峙优先用全身；玄阙是唯一有全身的 Boss。 */
const BV_FULL_IDS = ['yunce', 'yankui', 'luming', 'qingluo', 'bailu', 'xuanyi', 'moya',
  'chisang', 'aman', 'yunling', 'jiangsi', 'yusqiu', 'xiewuyi', 'tengdage', 'xuanque'];

/* 胸像清单：14 角色 + 8 Boss + 噬脉兽（assets/portraits/*.jpg） */
const BV_BUST_IDS = BV_FULL_IDS.filter(id => id !== 'xuanque')
  .concat(['shanxiao', 'bamboo', 'waterghost', 'chisha', 'icexiao', 'swampdragon',
    'turbidgeneral', 'xuanque', 'xuanque_beast']);

/* 敌方杂兵变体图标（绘图提示词库 §三：5 族 × 2 变体，透明剪影 PNG）。
 * bandit / rogue / bird 暂无对应变体美术，保持色圆 + 首字，等美术补族。 */
const BV_VARIANT_ICON = {
  wolf: 'yaoshou_v1',     // 妖兽·狼型
  armor: 'zhubing_v1',    // 浊兵·刀兵
  elite: 'zhubing_v2',    // 浊兵·盾兵
  shaman: 'zhutu_v1',     // 咒徒·瘦高
  priest: 'zhutu_v2'      // 咒徒·佝偻
};

/* 召唤图标（绘图提示词库 §四）：ally_wolf→疾影狼、ally_baize→白泽；
 * ally_leopard（云间豹）无对应美术，保持剪影。 */
const BV_SUMMON_ICON = { ally_wolf: 'jiyinglang', ally_baize: 'baize' };

/* 标签中文名（与 legendary.js traitText 的 Vs 后缀同表） */
const BV_TAG_NAMES = { beast: '猛兽', flying: '飞行', armor: '重甲', plant: '草木', undead: '亡灵', human: '人' };

/* 节奏（毫秒；受 B.speed 除）：进场 / 收幕 / 单次交锋 */
const BV_IN_MS = 240;
const BV_OUT_MS = 200;
const BV_STRIKE_MS = 540;
const BV_CRIT_MS = 660;
/* 单次交锋时间线：突进 30% → 命中判定/特效 40% → 回身 30% */
const BV_DASH = 0.30;
const BV_HOLD = 0.40;

const BattleView = {
  scene: null,
  imgs: Object.create(null),   // path -> Image（跨次交战缓存）
  dead: Object.create(null),   // 加载失败路径，不再重试

  /* 演出开关：设置里可关（Game.settings.battleShow，缺省开） */
  enabled() {
    if (typeof Game === 'undefined' || !Game.settings) return true;
    return Game.settings.battleShow !== false;
  },

  active() { return !!this.scene && !this.scene.closing; },
  fading() { return !!this.scene && !!this.scene.closing; },

  now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  },

  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  ease(t) { return 1 - Math.pow(1 - t, 3); },

  /* ---------------- 立绘 / 图标解析 ---------------- */

  /* 单位胸像/全身路径；没有对应美术返回 null */
  portraitOf(unit) {
    const id = unit.charId || unit.rawType || null;
    if (!id) return null;
    if (BV_FULL_IDS.indexOf(id) >= 0) return 'assets/portraits/full/' + id + '.jpg';
    if (BV_BUST_IDS.indexOf(id) >= 0) return 'assets/portraits/' + id + '.jpg';
    return null;
  },

  /* 单位剪影图标（透明 PNG）；没有返回 null，调用方画程序剪影 */
  iconOf(unit) {
    if (unit.charId) return 'assets/icons/units/' + unit.charId + '.png';
    const rt = unit.rawType;
    if (!rt) return null;
    const et = (typeof ENEMY_TYPES !== 'undefined') ? ENEMY_TYPES[rt] : null;
    if (et && et.boss) return 'assets/icons/units/boss/' + rt + '.png';
    if (BV_VARIANT_ICON[rt]) return 'assets/icons/units/variant/' + BV_VARIANT_ICON[rt] + '.png';
    if (BV_SUMMON_ICON[rt]) return 'assets/icons/units/summon/' + BV_SUMMON_ICON[rt] + '.png';
    return null;
  },

  /* 表情变体：Boss 半血换 rage 胸像；其余靠受击染色（full/ 无 hurt 变体） */
  rageOf(unit) {
    if (!unit.rawType || unit.charId) return null;
    const et = (typeof ENEMY_TYPES !== 'undefined') ? ENEMY_TYPES[unit.rawType] : null;
    if (!et || !et.boss) return null;
    return 'assets/portraits/' + unit.rawType + '_rage.jpg';
  },

  /* 图片加载（缓存 + 失败拉黑）。返回 Image 或 null；只有 _ok 才画。 */
  img(path) {
    if (!path) return null;
    if (this.imgs[path]) return this.imgs[path];
    if (this.dead[path]) return null;
    let im = null;
    try { im = new Image(); } catch (e) { this.dead[path] = 1; return null; }
    im.onload = () => { im._ok = true; };
    im.onerror = () => { this.dead[path] = 1; };
    try { im.src = path; } catch (e) { this.dead[path] = 1; return null; }
    this.imgs[path] = im;
    return im;
  },

  /* ---------------- 演出生命周期 ---------------- */

  /* 两侧 fighter 快照：立绘路径、兵器、词缀、标签都在开演时定好 */
  fighter(unit) {
    const w = (typeof Combat !== 'undefined' ? (Combat.weaponOf(unit) || Combat.staffOf(unit)) : null) || {};
    const et = (typeof ENEMY_TYPES !== 'undefined' && unit.rawType) ? ENEMY_TYPES[unit.rawType] : null;
    const f = {
      unit: unit,
      name: unit.name || '？',
      side: unit.side,
      hp: unit.hp || 0,
      hpShow: unit.hp || 0,
      maxHp: (unit.stats && unit.stats.hp) || 1,
      boss: !!unit.boss,
      lv: unit.level || 1,
      weapon: w.w || null,
      affixes: (unit.affixes || []).slice(),
      element: unit.element || (et ? et.element : null) || null,
      tags: et ? (et.tags || []).slice() : (unit.tags || []).slice(),
      down: false,
      img: this.portraitOf(unit),
      rage: this.rageOf(unit),
      icon: this.iconOf(unit)
    };
    return f;
  },

  /* 至少一侧有美术才开演；双方都只有程序剪影时留在棋盘（色圆更清楚） */
  usable(attacker, defender) {
    if (!attacker || !defender) return false;
    const a = this.fighter(attacker), d = this.fighter(defender);
    return !!(a.img || a.icon || d.img || d.icon);
  },

  begin(attacker, defender, ctx) {
    if (!attacker || !defender) return;
    const s = {
      atk: this.fighter(attacker),
      def: this.fighter(defender),
      ctx: ctx || null,
      t0: this.now(),
      closing: false, t1: 0,
      fx: null, bar: null, shake: 0
    };
    this.scene = s;
    this.img(s.atk.img); this.img(s.atk.icon); this.img(s.atk.rage);
    this.img(s.def.img); this.img(s.def.icon); this.img(s.def.rage);
  },

  /* 单次交锋：ev 是 Combat.resolve 的 strike 事件。返回承诺，
   * 演完（或演到一半被 end）即 resolve，不阻塞 battle 流程。 */
  async strike(ev, speed) {
    const s = this.scene;
    if (!s || !ev) return;
    const sp = this.clamp(speed || 1, 0.5, 4);
    const dur = Math.round((ev.crit ? BV_CRIT_MS : BV_STRIKE_MS) / sp);
    s.fx = { ev: ev, t0: this.now(), dur: dur, fromHp: undefined };
    s.bar = this.barOf(s, ev);
    if (ev.hit) s.shake = ev.crit ? 9 : 5;
    /* 受击方数据立即跟进结算结果（begin 时的快照会过期）；
     * hpShow 是纯显示值，由 draw 逐帧缓动，演出血条排出的感觉。 */
    const struck = ev.defender === s.atk.unit.id ? s.atk : s.def;
    if (struck && ev.hpAfter !== undefined) {
      s.fx.fromHp = struck.hpShow;
      struck.hp = ev.hpAfter;
      struck.down = ev.hpAfter <= 0;
    }
    await new Promise(r => setTimeout(r, dur + 30));
    if (s.fx && s.fx.ev === ev) s.fx = null;
  },

  /* 收幕：淡出 200ms 后清场；期间新 begin 会整体换场（不被旧定时器清掉） */
  end() {
    const s = this.scene;
    if (!s || s.closing) return;
    s.closing = true;
    s.t1 = this.now();
    setTimeout(() => { if (this.scene === s) this.scene = null; }, BV_OUT_MS + 80);
  },

  /* 战斗结束/切场时无条件清场（防止淡出跨到营地） */
  reset() { this.scene = null; },

  /* ---------------- 底部克制/弱点条 ----------------
   * 数据全部来自 ev（结算结果）与单位快照，不重算公式。
   * 三角加成数字调 Combat.triangle 现算——与公式同源，不会漂。 */
  barOf(s, ev) {
    const tri = ev.triangle === 'good' ? '克制' : ev.triangle === 'bad' ? '被克' : '互角';
    let mod = '';
    if (typeof Combat !== 'undefined' && ev.triangle !== 'none') {
      const fresh = Combat.triangle(s.atk.unit, s.def.unit);
      if (fresh && fresh.state === ev.triangle) {
        const h = fresh.hit >= 0 ? '+' : '', d = fresh.dmg >= 0 ? '+' : '';
        mod = '命中' + h + fresh.hit + ' 威力' + d + fresh.dmg;
      }
    }
    const affixes = s.def.affixes.map(k => {
      const a = (typeof ELITE_AFFIXES !== 'undefined') ? ELITE_AFFIXES[k] : null;
      return a ? a.name : k;
    });
    const element = (s.def.element && typeof ELEMENTS !== 'undefined' && ELEMENTS[s.def.element])
      ? ELEMENTS[s.def.element].name : null;
    const tags = s.def.tags.map(t => BV_TAG_NAMES[t]).filter(Boolean);
    return {
      tri: tri, mod: mod,
      effective: !!ev.effective,
      affixes: affixes, element: element, tags: tags
    };
  },

  /* ---------------- 绘制 ---------------- */

  draw(ctx) {
    const s = this.scene;
    if (!s || !ctx) return;
    const W = Render.W, H = Render.H;
    const now = this.now();

    const inP = this.ease(this.clamp((now - s.t0) / BV_IN_MS, 0, 1));
    let outP = 1;
    if (s.closing) outP = 1 - this.ease(this.clamp((now - s.t1) / BV_OUT_MS, 0, 1));
    const alpha = inP * outP;
    if (alpha <= 0.02) return;

    /* 交锋时间线 */
    const fx = s.fx;
    let striker = null, struck = null, dash = 0, hitP = 0, missP = 0;
    if (fx) {
      const p = this.clamp((now - fx.t0) / fx.dur, 0, 1);
      striker = fx.ev.attacker === s.atk.unit.id ? s.atk : s.def;
      struck = fx.ev.defender === s.atk.unit.id ? s.atk : s.def;
      if (p < BV_DASH) dash = this.ease(p / BV_DASH);
      else if (p < BV_DASH + BV_HOLD) {
        const q = (p - BV_DASH) / BV_HOLD;
        if (fx.ev.hit) hitP = q; else missP = q;
      } else {
        dash = 1 - this.ease((p - BV_DASH - BV_HOLD) / (1 - BV_DASH - BV_HOLD));
      }
    }
    /* HP 显示值缓动归目标（突进段先按住，刀落再排血） */
    const draining = !fx || (now - fx.t0) / fx.dur > BV_DASH;
    for (const f of [s.atk, s.def]) {
      if (draining && f.hpShow !== f.hp) {
        f.hpShow += (f.hp - f.hpShow) * 0.18;
        if (Math.abs(f.hp - f.hpShow) < 0.4) f.hpShow = f.hp;
      }
      f.hurt = f.hp / f.maxHp < 0.35;
    }

    /* 版面：卡片 + 中央交锋区 + 底部条 */
    const cardH = Math.max(180, Math.min(H * 0.56, 430));
    const cardW = Math.min(W * 0.30, cardH * 0.74);
    const gap = Math.max(56, W * 0.12);
    const top = Math.max(14, H * 0.10);
    const barH = Math.max(52, H * 0.11);
    const barY = H - barH - Math.max(10, H * 0.03);
    const leftX = W / 2 - gap / 2 - cardW;
    const rightX = W / 2 + gap / 2;
    const slide = (1 - inP) * W * 0.22;

    ctx.save();
    ctx.globalAlpha = alpha;

    /* 背板：压暗全场 + 中央舞台光 */
    ctx.fillStyle = 'rgba(7,10,8,.88)';
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, top + cardH * 0.45, 10, W / 2, top + cardH * 0.45, Math.max(W, H) * 0.5);
    glow.addColorStop(0, 'rgba(58,78,64,.34)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    /* 微震（命中段） */
    if (hitP > 0 && s.shake) {
      const k = (1 - hitP) * s.shake;
      ctx.translate((Math.random() - 0.5) * k * 2, (Math.random() - 0.5) * k * 2);
    }

    /* 两侧立牌 */
    const dashL = striker === s.atk ? dash : 0;
    const dashR = striker === s.def ? dash : 0;
    const tiltR = struck === s.def ? Math.sin(missP * Math.PI) * 0.07 : 0;
    const tiltL = struck === s.atk ? Math.sin(missP * Math.PI) * 0.07 : 0;
    this.drawFighter(ctx, s.atk, leftX - slide - dashL * cardW * 0.16, top, cardW, cardH, false, tiltL);
    this.drawFighter(ctx, s.def, rightX + slide + dashR * cardW * 0.16, top, cardW, cardH, true, tiltR);

    /* 中央交锋特效 */
    const cx = W / 2, cy = top + cardH * 0.42;
    if (fx && hitP > 0) this.drawImpact(ctx, cx, cy, fx.ev, hitP, struck === s.def);
    else if (fx && missP > 0) this.drawMiss(ctx, cx, cy, missP);

    /* 底部克制/弱点条 */
    if (s.bar) this.drawBar(ctx, s, barY, W, barH);

    ctx.restore();
  },

  /* 单侧立牌：框 + 立绘/图标/剪影 + 铭牌 + 血条 */
  drawFighter(ctx, f, x, y, w, h, mirror, tilt) {
    const now = this.now();
    const side = f.side === 'player';
    ctx.save();
    if (tilt) {
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate(tilt);
      ctx.translate(-(x + w / 2), -(y + h / 2));
    }

    /* 立牌框：玄墨底 + 鎏金边 + 四角云饰 */
    const bg = ctx.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, side ? 'rgba(24,34,30,.96)' : 'rgba(38,24,22,.96)');
    bg.addColorStop(1, 'rgba(14,17,15,.96)');
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = side ? 'rgba(127,181,154,.55)' : 'rgba(196,96,74,.55)';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(x + 0.7, y + 0.7, w - 1.4, h - 1.4);
    ctx.strokeStyle = 'rgba(211,171,110,.8)';
    ctx.lineWidth = 1;
    const c = Math.min(14, w * 0.09);
    const corners = [[x + 4, y + 4, 1, 1], [x + w - 4, y + 4, -1, 1], [x + 4, y + h - 4, 1, -1], [x + w - 4, y + h - 4, -1, -1]];
    for (const [cx2, cy2, sx, sy] of corners) {
      ctx.beginPath();
      ctx.arc(cx2 + sx * c, cy2 + sy * c, c, sx * sy > 0 ? Math.PI : 0, sx * sy > 0 ? Math.PI * 1.5 : Math.PI * 0.5, sy < 0);
      ctx.stroke();
    }

    /* 立绘区（留出牌头） */
    const inner = { x: x + 5, y: y + 5, w: w - 10, h: h - 10 };
    ctx.save();
    ctx.beginPath();
    ctx.rect(inner.x, inner.y, inner.w, inner.h);
    ctx.clip();
    let drawn = false;
    /* 表情：Boss 半血换 rage；低血染红 */
    const lowHp = f.hp / f.maxHp < 0.5;
    let path = f.img;
    if (lowHp && f.rage) path = f.rage;
    const im = this.img(path);
    if (im && im._ok && im.naturalWidth) {
      ctx.save();
      if (mirror) {
        ctx.translate(inner.x + inner.w, inner.y);
        ctx.scale(-1, 1);
        ctx.drawImage(im, 0, 0, inner.w, inner.h);
      } else {
        ctx.drawImage(im, inner.x, inner.y, inner.w, inner.h);
      }
      ctx.restore();
      drawn = true;
    } else {
      const ic = this.img(f.icon);
      if (ic && ic._ok && ic.naturalWidth) {
        const ih = inner.h * 0.8;
        const iw = ih * (ic.naturalWidth / ic.naturalHeight);
        ctx.drawImage(ic, inner.x + (inner.w - iw) / 2, inner.y + (inner.h - ih) / 2, iw, ih);
        drawn = true;
      }
    }
    if (!drawn) this.drawSilhouette(ctx, f, inner);
    /* 低血染红（程序剪影不染，它本来就是暗的） */
    if (drawn && f.hurt) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(150,36,24,.34)';
      ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
      ctx.globalCompositeOperation = 'source-over';
    }
    /* 倒地：压暗 + 斜纹 */
    if (f.down) {
      ctx.fillStyle = 'rgba(8,10,9,.55)';
      ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
    }
    ctx.restore();

    /* 牌头：Boss 煞气描边 */
    if (f.boss) {
      ctx.strokeStyle = 'rgba(205,170,95,' + (0.45 + 0.2 * Math.sin(now / 380)).toFixed(2) + ')';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(x + 3.5, y + 3.5, w - 7, h - 7);
    }

    /* 铭牌：名 + 阶职 + 血条 */
    const plateH = 30;
    const py = y + h + 6;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 15px "Noto Serif SC", "Songti SC", serif';
    ctx.fillStyle = f.boss ? '#f0d79b' : (side ? '#dce8dd' : '#f2d8cc');
    ctx.strokeStyle = 'rgba(8,10,8,.8)';
    ctx.lineWidth = 3;
    const label = f.name + (f.boss ? '' : ' · Lv.' + f.lv);
    ctx.strokeText(label, x + w / 2, py + 8);
    ctx.fillText(label, x + w / 2, py + 8);
    /* 血条 */
    const bw = w * 0.82, bh = 6;
    const bx = x + (w - bw) / 2, by = py + 20;
    const ratio = this.clamp(f.hpShow / f.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(10,13,11,.85)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    const hpColor = ratio > 0.5 ? '#7fb08a' : ratio > 0.25 ? '#d8b45f' : '#c05a4a';
    ctx.fillStyle = hpColor;
    ctx.fillRect(bx, by, bw * ratio, bh);
    ctx.font = '10px "Noto Serif SC", serif';
    ctx.fillStyle = 'rgba(226,220,198,.85)';
    ctx.fillText(Math.ceil(f.hpShow) + ' / ' + f.maxHp, x + w / 2, by + bh + 8);
    ctx.restore();
  },

  /* 程序剪影：色圆 + 首字 + 兵种记号（无美术时的兜底） */
  drawSilhouette(ctx, f, inner) {
    const cx = inner.x + inner.w / 2, cy = inner.y + inner.h * 0.44;
    const r = Math.min(inner.w, inner.h) * 0.26;
    const side = f.side === 'player';
    ctx.save();
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.15, cx, cy, r);
    g.addColorStop(0, side ? '#6e9487' : '#ab6658');
    g.addColorStop(1, side ? '#3f6259' : '#854036');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(238,228,205,.7)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#f3e9d2';
    ctx.font = '600 ' + Math.round(r) + 'px "Songti SC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(f.name.charAt(0), cx, cy + 1);
    if (f.weapon) {
      const wt = (typeof WEAPON_TYPES !== 'undefined') ? WEAPON_TYPES[f.weapon.type] : null;
      if (wt && wt.icon) {
        ctx.font = Math.round(r * 0.4) + 'px "Songti SC", serif';
        ctx.fillStyle = 'rgba(238,228,205,.9)';
        ctx.fillText(wt.icon, cx + r * 0.78, cy - r * 0.72);
      }
    }
    ctx.restore();
  },

  /* 命中特效：斩弧 + 伤害浮字 + 必杀铭 */
  drawImpact(ctx, cx, cy, ev, p, rightSide) {
    const crit = !!ev.crit;
    const gold = crit ? '#f1cd7a' : '#f0b8a7';
    ctx.save();
    /* 斩弧：两道交叉的刀光，随 p 展开 */
    const reach = 26 + 34 * this.ease(p);
    const dir = rightSide ? -1 : 1;
    ctx.strokeStyle = crit ? 'rgba(244,215,154,.95)' : 'rgba(240,232,212,.9)';
    ctx.lineWidth = crit ? 4 : 2.6;
    ctx.lineCap = 'round';
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + dir * reach * 0.4, cy - sgn * reach * 0.5);
      ctx.quadraticCurveTo(cx - dir * reach * 0.2, cy, cx + dir * reach * 0.4, cy + sgn * reach * 0.5);
      ctx.stroke();
    }
    /* 命中点星芒 */
    if (p < 0.5) {
      const k = 1 - p / 0.5;
      ctx.strokeStyle = 'rgba(255,244,214,' + (0.8 * k).toFixed(2) + ')';
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + p;
        const r0 = 8, r1 = 8 + 22 * (1 - k);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.stroke();
      }
    }
    /* 伤害浮字：上浮 + 弹出 */
    const rise = 46 * this.ease(p);
    const pop = p < 0.18 ? 1 + (0.18 - p) * 2.2 : 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + Math.round((crit ? 30 : 23) * pop) + 'px "Noto Serif SC", "Songti SC", serif';
    ctx.strokeStyle = 'rgba(10,12,10,.85)';
    ctx.lineWidth = 4;
    const dmgText = (crit ? '必杀 ' : '') + '-' + ev.dmg;
    ctx.strokeText(dmgText, cx, cy - rise);
    ctx.fillStyle = gold;
    ctx.fillText(dmgText, cx, cy - rise);
    if (ev.effective && p < 0.8) {
      ctx.font = '600 13px "Noto Serif SC", serif';
      ctx.fillStyle = '#f0c25a';
      ctx.fillText('特效', cx, cy - rise - 24);
    }
    ctx.restore();
  },

  /* 闪避特效：身位错影 + 文字 */
  drawMiss(ctx, cx, cy, p) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 20px "Noto Serif SC", "Songti SC", serif';
    ctx.globalAlpha = 1 - p * 0.6;
    ctx.strokeStyle = 'rgba(10,12,10,.8)';
    ctx.lineWidth = 4;
    ctx.strokeText('闪避', cx, cy - 30 * this.ease(p));
    ctx.fillStyle = '#dfe6d7';
    ctx.fillText('闪避', cx, cy - 30 * this.ease(p));
    ctx.restore();
  },

  /* 底部条：攻方兵器 — 三角/特效/词缀/标签 — 守方兵器 */
  drawBar(ctx, s, y, W, h) {
    const bar = s.bar;
    ctx.save();
    ctx.fillStyle = 'rgba(16,21,18,.92)';
    ctx.fillRect(0, y, W, h);
    ctx.strokeStyle = 'rgba(211,171,110,.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
    ctx.stroke();
    ctx.textBaseline = 'middle';

    const chip = (f, role, x, align) => {
      const side = f.side === 'player';
      const color = side ? '#9ec9b4' : '#e0a898';
      const wname = f.weapon ? f.weapon.name : '赤手';
      const wtype = f.weapon && WEAPON_TYPES[f.weapon.type] ? WEAPON_TYPES[f.weapon.type].name : '';
      ctx.textAlign = align;
      ctx.font = '600 12px "Noto Serif SC", serif';
      ctx.fillStyle = color;
      ctx.fillText(role + ' ' + f.name, x, y + h * 0.30);
      ctx.font = '12px "Noto Serif SC", serif';
      ctx.fillStyle = 'rgba(230,222,198,.92)';
      ctx.fillText(wname + (wtype ? '（' + wtype + '）' : ''), x, y + h * 0.66);
    };
    chip(s.atk, '攻', Math.max(18, W * 0.06), 'left');
    chip(s.def, '守', W - Math.max(18, W * 0.06), 'right');

    /* 中段：克制结论 + 特效 + 守方词缀/属性/标签 */
    const midX = W / 2;
    ctx.textAlign = 'center';
    const triColor = bar.tri === '克制' ? '#8fd0a8' : bar.tri === '被克' ? '#e08e80' : '#cfc6ae';
    ctx.font = '700 15px "Noto Serif SC", "Songti SC", serif';
    ctx.fillStyle = triColor;
    const triLine = bar.tri + (bar.mod ? '　' + bar.mod : '');
    ctx.fillText(triLine, midX, y + h * 0.28);

    /* 徽章行：特效 / 词缀 / 属性 / 标签 */
    const badges = [];
    if (bar.effective) badges.push({ t: '特效 ×2', c: '#f0c25a' });
    for (const a of bar.affixes) badges.push({ t: a, c: '#c9b3e0' });
    if (bar.element) badges.push({ t: '属' + bar.element, c: '#9ec5e0' });
    for (const t of bar.tags) badges.push({ t: t, c: 'rgba(226,220,198,.75)' });
    let bx = midX;
    ctx.font = '11px "Noto Serif SC", serif';
    const widths = badges.map(b => ctx.measureText(b.t).width + 14);
    const total = widths.reduce((a, b2) => a + b2, 0) + (badges.length - 1) * 6;
    bx = midX - total / 2;
    for (let i = 0; i < badges.length; i++) {
      const b = badges[i], bw2 = widths[i];
      ctx.fillStyle = 'rgba(60,52,36,.5)';
      ctx.fillRect(bx, y + h * 0.52, bw2, 16);
      ctx.strokeStyle = b.c;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, y + h * 0.52 + 0.5, bw2 - 1, 15);
      ctx.fillStyle = b.c;
      ctx.textAlign = 'center';
      ctx.fillText(b.t, bx + bw2 / 2, y + h * 0.52 + 8.5);
      bx += bw2 + 6;
    }
    ctx.restore();
  }
};

if (typeof window !== 'undefined') window.BattleView = BattleView;
