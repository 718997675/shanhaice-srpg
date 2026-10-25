/* ============================================================
 * 山海策 · 灵脉  —  法术演出（二期任务 #8）
 * 十五条法术不是十五段手写动画，而是「五行形态 × 三阶强度」的组合：
 *   金 = 飞刃直取   木 = 藤蔓绕行   水 = 涟漪扩散
 *   火 = 火球抛射   土 = 地面崩裂   歌 = 音符飘渡
 * 每型一套 起手（法阵 + 元素点）→ 弹道（stream / 地面爆发）→ 命中（impact）。
 *
 * 阶数（C/B/A）只调三件事：粒子数、飞行时长、是否插立绘切入。
 * 调用点只有一处：Spells.cast。这里不碰任何战斗公式。
 * 红线：Juice 关闭（设置里关打击感）时整套静默，不留死等待。
 * ============================================================ */

/* 阶数 → 0/1/2 */
const SPELL_FX_RANK = { C: 0, B: 1, A: 2 };

/* 歌法术没有五行，用一套独立的柔色 */
const SPELL_FX_SONG = { color: '#e6cf8e', castSfx: 'heal', hitSfx: 'heal' };

const SpellFx = {
  /* 元素 → 起手/命中音效（audio.js 里已有 cast_* 与 burst_* 两族） */
  sfxOf(el) {
    if (el === 'none' || !el) return { cast: SPELL_FX_SONG.castSfx, hit: SPELL_FX_SONG.hitSfx };
    return { cast: 'cast_' + el, hit: 'burst_' + el };
  },

  colorOf(el) {
    if (el === 'none' || !el) return SPELL_FX_SONG.color;
    const e = (typeof ELEMENTS !== 'undefined') ? ELEMENTS[el] : null;
    return (e && e.color) || '#cbb7e0';
  },

  /* 弹道飞行时长（ms，未除以倍速） */
  flightMs(el, rank) {
    if (el === 'none') return 460;
    if (el === 'earth') return 220 + rank * 60;
    if (el === 'metal') return 190 + rank * 50;
    if (el === 'fire') return 250 + rank * 60;
    if (el === 'water') return 290 + rank * 60;
    return 330 + rank * 60;          // wood
  },

  /* ---------------- 起手：施法者脚下法阵 + 元素点 ---------------- */
  cast(J, el, x, y, rank, color) {
    /* 法阵：金/火顺时针，木逆时针（藤在拧），水不转（水面只扩） */
    const spin = el === 'wood' ? -1.6 : el === 'water' ? 0 : 1.1;
    J.ring({
      x, y, r0: 6, r1: 22 + rank * 8,
      dur: 300 + rank * 80,
      color, w: 2,
      ticks: el === 'water' ? 0 : 6 + rank * 3,
      spin
    });
    /* 阵眼：一小圈暖白先亮后灭。只有一圈环时法阵像「描边圆」，
     * 有了中心这一下才立得住。 */
    J.ring({ x, y, r0: 2, r1: 10 + rank * 3, dur: 170 + rank * 40, color: '#fff6dd', w: 2.2 });
    /* 元素点：土往下沉，其余往上浮 */
    const g = el === 'earth' ? 0.09 : -0.05;
    J.burst({
      x, y, n: 8 + rank * 6, speed: 1.15, spread: Math.PI * 2,
      g, life: 400 + rank * 60, size: 2.4, color, jitter: 7
    });
  },

  /* ---------------- 弹道：按形态分派 ----------------
   * bow 是中点法向偏移的像素量（Juice._streamPoint 内部按法向乘），
   * 直接给标量即可，不要再乘方向余弦。 */
  deliver(J, el, cx, cy, tx, ty, rank, color, host, target) {
    if (el === 'metal') {
      /* 飞刃：几条平行细流，A 阶三刃齐发 */
      const lanes = 1 + rank;
      for (let i = 0; i < lanes; i++) {
        const off = (i - (lanes - 1) / 2) * 16;
        J.stream({
          x1: cx, y1: cy + off, x2: tx, y2: ty + off,
          dur: 190 + rank * 45, color, size: 2.8, every: 11, bow: 0, jitter: 2
        });
      }
      return;
    }

    if (el === 'wood') {
      /* 藤蔓：一根主藤绕出去，一根细的朝反方向缠回来——
       * 单根弧线只是「弯的弹道」，两根反向才读得出「缠」。 */
      J.stream({ x1: cx, y1: cy, x2: tx, y2: ty, dur: 320 + rank * 55, color, size: 2.5, every: 22, bow: -58 - rank * 16, jitter: 4 });
      J.stream({
        x1: cx, y1: cy, x2: tx, y2: ty,
        dur: 360 + rank * 60, color, size: 1.6, every: 30,
        bow: 30 + rank * 10, jitter: 6
      });
      J.ring({ x: tx, y: ty, r0: 4, r1: 20 + rank * 7, dur: 300, color, w: 1.4, ticks: 8, spin: -1.2 });
      return;
    }

    if (el === 'water') {
      /* 水箭：从施法者脚下先荡开一圈涟漪，再一道弧线过去 */
      J.ring({ x: cx, y: cy, r0: 8, r1: 34 + rank * 10, dur: 380, color, w: 1.6 });
      const k = 60 + rank * 18;
      J.stream({ x1: cx, y1: cy, x2: tx, y2: ty, dur: 280 + rank * 55, color, size: 3.2, every: 18, bow: k, jitter: 3 });
      return;
    }

    if (el === 'fire') {
      /* 火球：粗流 + 抛射弧 + 施法者身上窜出的火星 */
      J.burst({ x: cx, y: cy, n: 6 + rank * 4, speed: 1.4, angle: -Math.PI / 2, spread: 1.1, g: -0.04, life: 460, size: 2.3, color, jitter: 8 });
      J.stream({ x1: cx, y1: cy, x2: tx, y2: ty, dur: 240 + rank * 55, color, size: 3.8, every: 9, bow: -34 - rank * 12, jitter: 3 });
      return;
    }

    if (el === 'earth') {
      /* 土：没有飞行物。地面直接崩开，碎石从下往上冲 */
      J.ring({ x: tx, y: ty, r0: 10, r1: 34 + rank * 15, dur: 260, color, w: 2.6 });
      J.burst({
        x: tx, y: ty + 10, n: 10 + rank * 7, speed: 3.4,
        angle: -Math.PI / 2, spread: 1.5, g: 0.16,
        life: 420 + rank * 80, size: 3, color, jitter: 10
      });
      if (J.shake) J.shake(0.1 + rank * 0.05);
      return;
    }

    /* 歌：三缕音符慢飘，弯向交替，没有冲击感 */
    for (let i = 0; i < 3; i++) {
      const k = (i % 2 ? 1 : -1) * (26 + i * 10);
      J.stream({
        x1: cx, y1: cy, x2: tx, y2: ty,
        dur: 420 + i * 60, color, size: 2.2, every: 34, bow: k, jitter: 6
      });
    }
  },

  /* ---------------- 命中：每个受影响单位各演一次 ----------------
   * 只画不响：命中音（hit / crit / 元素爆点）由 Spells.cast 按暴击与
   * 闪避分派，这里再播一次就会双声。 */
  impact(host, unit, spell) {
    if (!unit || !spell || typeof Juice === 'undefined') return;
    const J = Juice;
    if (!J._cfg().on || J._cfg().reduced) return;
    const el = spell.element || 'none';
    const rank = SPELL_FX_RANK[spell.rank] || 0;
    const color = this.colorOf(el);
    const x = J._px(unit.x), y = J._py(unit.y, unit.x);

    if (spell.heal) {
      /* 治疗：只起一圈暖环 + 上浮光点，不震屏 */
      J.ring({ x, y, r0: 8, r1: 30 + rank * 9, dur: 460, color: '#9fd39a', w: 1.6 });
      J.burst({ x, y, n: 8 + rank * 5, speed: 1, spread: Math.PI * 2, g: -0.05, life: 520, size: 2.2, color: '#9fd39a' });
      return;
    }

    if (el === 'none') {
      /* 歌：柔和扩散，无白闪无震屏 */
      J.ring({ x, y, r0: 10, r1: 32 + rank * 10, dur: 430, color, w: 1.6 });
      J.burst({ x, y, n: 6 + rank * 4, speed: 1.05, spread: Math.PI * 2, g: -0.04, life: 500, size: 2.2, color });
      return;
    }

    if (el === 'earth') {
      J.burst({ x, y, n: 12 + rank * 8, speed: 3.1, spread: Math.PI * 2, g: 0.15, life: 430, size: 3, color });
      J.ring({ x, y, r0: 2, r1: 16 + rank * 5, dur: 150, color: '#fff6dd', w: 2.4 });
      J.ring({ x, y, r0: 8, r1: 32 + rank * 10, dur: 340, color, w: 2.4 });
      if (J.shake) J.shake(0.14 + rank * 0.06);
      return;
    }

    if (el === 'fire') {
      J.burst({ x, y, n: 14 + rank * 9, speed: 3.4, spread: Math.PI * 2, g: 0.04, life: 420, size: 3.1, color });
      /* 余烬：慢、轻、往上飘，留得比火星久 */
      J.burst({ x, y, n: 6 + rank * 4, speed: 0.9, spread: Math.PI * 2, g: -0.06, life: 720, size: 2, color: '#e8b48a' });
      J.ring({ x, y, r0: 2, r1: 18 + rank * 5, dur: 140, color: '#fff6dd', w: 2.6 });
      J.ring({ x, y, r0: 8, r1: 34 + rank * 10, dur: 330, color, w: 2.2 });
      if (J.shake) J.shake(0.1 + rank * 0.05);
      return;
    }

    if (el === 'water') {
      J.burst({ x, y, n: 10 + rank * 7, speed: 2.6, spread: Math.PI * 2, g: 0.1, life: 430, size: 2.6, color });
      J.ring({ x, y, r0: 8, r1: 32 + rank * 10, dur: 400, color, w: 1.8 });
      /* 第二圈慢半拍，像水面回波 */
      J.ring({ x, y, r0: 4, r1: 26 + rank * 9, dur: 620, color, w: 1.1 });
      return;
    }

    if (el === 'wood') {
      /* 藤：向上抽长，g 为负 */
      J.burst({ x, y, n: 10 + rank * 7, speed: 2.2, angle: -Math.PI / 2, spread: 1.9, g: -0.03, life: 520, size: 2.5, color });
      J.ring({ x, y, r0: 6, r1: 32 + rank * 10, dur: 380, color, w: 1.7, ticks: 10, spin: -1.8 });
      return;
    }

    /* 金：尖锐直冲，落点干脆 */
    J.burst({ x, y, n: 12 + rank * 8, speed: 4, spread: Math.PI * 2, g: 0.05, life: 340, size: 2.6, color });
    J.ring({ x, y, r0: 6, r1: 32 + rank * 10, dur: 280, color, w: 2 });
  },

  /* ---------------- 主入口 ----------------
   * 起手 → 等一拍 → 弹道 → 等飞行 → 返回（命中由调用方逐目标调 impact）。
   * A 阶额外插一次立绘切入（复用必杀四段式的「静→蓄」与收势）。
   * 返回 true 表示演了；false 表示静默（Juice 关闭 / 无障碍）。
   *
   * 静默时**仍然播起手音**——关打击感关的是画面，不是声音；
   * 且立刻返回，不留任何 await，避免关闭演出后回合变慢。 */
  async play(host, caster, target, spell) {
    if (!caster || !target || !spell) return false;
    if (typeof Juice === 'undefined') return false;
    const J = Juice;
    const cfg = J._cfg();

    const el = spell.element || 'none';
    const rank = SPELL_FX_RANK[spell.rank] || 0;
    const color = this.colorOf(el);
    const sp = (host && host.B && host.B.speed) || 1;

    if (host && host.sfx) host.sfx(this.sfxOf(el).cast);

    if (!cfg.on || cfg.reduced) return false;

    const A = rank === 2;
    if (A) await J.critWindUp(caster, sp);

    const cx = J._px(caster.x), cy = J._py(caster.y, caster.x);
    const tx = J._px(target.x), ty = J._py(target.y, target.x);

    this.cast(J, el, cx, cy, rank, color);
    await host.wait(150 + rank * 70);

    this.deliver(J, el, cx, cy, tx, ty, rank, color, host, target);
    await host.wait(this.flightMs(el, rank));

    if (A) await J.critWindDown(sp);
    return true;
  }
};

if (typeof window !== 'undefined') window.SpellFx = SpellFx;
