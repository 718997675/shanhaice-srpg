/* ============================================================
 * 山海策 · 灵脉  —  大地图（舆图）
 * 十六个章节节点铺在一张陈年绢帛舆图上：青岚山门下山 → 赤砂关隘分兵
 * → A 焚脉（追）/ B 守脉（守）各三章 → 天柱废墟汇合 → 下海四章
 * → 浊潮之眼终战。
 *
 * 视觉口径（二期）：玄墨底 + 鎏金线 + 朱砂印。
 * 不是「纸上的草图」，是「摊在暗室里的绢本图」——深底、描金、留大片暗，
 * 山是剪影不是三角，海是漩涡不是色块。
 *
 * 这里只管「画」与「章在什么状态」；点击、详情、出征入口在 camp.js。
 * 红线：不碰战斗公式，不改章节数据，不写存档。
 * ============================================================ */

/* 舆图坐标系：1000 × 600，等比缩放铺满画布 */
const WM_W = 1000;
const WM_H = 600;

/* 节点坐标：手摆。脊线自西南向东北爬，第 4 章分两路，第 8 章收束，
 * 之后沿东海海岸绕一圈，落到海眼（终章）。改坐标只动这张表。 */
const WM_NODES = {
  '1': { x: 88, y: 478 },
  '2': { x: 168, y: 408 },
  '3': { x: 136, y: 312 },
  '4': { x: 228, y: 236 },
  '5A': { x: 338, y: 138 },
  '6A': { x: 452, y: 98 },
  '7A': { x: 568, y: 146 },
  '5B': { x: 334, y: 300 },
  '6B': { x: 452, y: 338 },
  '7B': { x: 568, y: 302 },
  '8': { x: 692, y: 216 },
  '9': { x: 806, y: 322 },
  '10': { x: 886, y: 404 },
  '11': { x: 890, y: 502 },
  '12': { x: 800, y: 558 },
  '13': { x: 698, y: 500 }
};

/* 道路：[起点 id, 终点 id]。顺序即行军顺序。 */
const WM_EDGES = [
  ['1', '2'], ['2', '3'], ['3', '4'],
  ['4', '5A'], ['5A', '6A'], ['6A', '7A'],
  ['4', '5B'], ['5B', '6B'], ['6B', '7B'],
  ['7A', '8'], ['7B', '8'],
  ['8', '9'], ['9', '10'], ['10', '11'], ['11', '12'], ['12', '13']
];

/* 地名（淡金大字，纯装饰） */
const WM_REGIONS = [
  { x: 152, y: 568, text: '青 岚 州' },
  { x: 392, y: 52, text: '玄 冰 原' },
  { x: 384, y: 400, text: '云 梦 泽' },
  { x: 712, y: 150, text: '天 柱' },
  { x: 900, y: 288, text: '东 海' }
];

/* 海岸线：陆地与东海的分界，同时是海面填色与漩涡裁剪的边界 */
const WM_COAST = 'M600 246 Q646 292 632 336 Q618 384 654 432 Q692 478 628 530 Q592 566 556 600';
const WM_SEA = WM_COAST + ' L1000 600 L1000 236 Q884 212 762 234 Q664 252 600 246 Z';

/* 山峦剪影：{x, y} 是底边中点，s 是缩放。摆在外围与空白处，
 * 不压节点——节点周围 40px 内不放山。 */
const WM_RANGES = [
  { x: 58, y: 392, s: 1.25 },
  { x: 128, y: 352, s: 0.72 },
  { x: 268, y: 196, s: 1.0 },
  { x: 330, y: 212, s: 0.6 },
  { x: 402, y: 438, s: 0.82 },
  { x: 610, y: 372, s: 0.9 }
];

/* 远山：贴画面上沿的一道剪影，压得很淡，只负责把「天边还有山」说出来 */
const WM_FAR = [
  { x: 112, y: 112, s: 1.55 },
  { x: 252, y: 92, s: 1.05 }
];

/* 灵脉：九条地脉自海眼辐射出去，串起九处节点。
 * 极淡、极细——不是路，是「这块地还活着」的证据；浊潮正从海眼往外啃。
 * 只画九条，多一条就成蛛网了。 */
const WM_VEINS = ['1', '2', '3', '4', '5A', '6B', '7B', '8', '12'];

/* 水纹：只落在海面上（会被海面裁剪） */
const WM_WAVES = [
  { x: 706, y: 340, s: 0.9 }, { x: 766, y: 372, s: 0.7 }, { x: 724, y: 432, s: 0.8 },
  { x: 812, y: 452, s: 0.65 }, { x: 700, y: 570, s: 0.7 }, { x: 878, y: 556, s: 0.6 }
];

const WorldMap = {
  W: WM_W,
  H: WM_H,
  nodes: WM_NODES,
  edges: WM_EDGES,
  regions: WM_REGIONS,

  at(id) {
    return WM_NODES[String(id)] || null;
  },

  /* 章节状态：
   * current   本章（下一场要打的就是它）
   * cleared   已经走过
   * abandoned 没走的那条路（路线已定，且不属于所选线）
   * locked    还没到
   */
  stateOf(campaign, id) {
    const c = campaign || {};
    const key = String(id);
    if (String(c.chapter) === key) return 'current';
    const rec = c.records && c.records.chapters;
    if (rec && rec[key]) return 'cleared';
    if (typeof Route !== 'undefined' && Route.isRouteChapter(key) && c.route && key.charAt(1) !== c.route) {
      return 'abandoned';
    }
    return 'locked';
  },

  stateLabel(s) {
    if (s === 'current') return '当前';
    if (s === 'cleared') return '已过';
    if (s === 'abandoned') return '未走之路';
    return '未至';
  },

  /* 章节主题色（借战场调色板，让节点印面带一点地形色） */
  tintOf(chapter) {
    const p = (typeof Render !== 'undefined' && Render.PALETTES) ? Render.PALETTES[chapter.theme] : null;
    return (p && p.tint) || '#8fa18a';
  },

  /* 默认选中：当前章 → 已走过的最后一章 → 第一章 */
  pickDefault(campaign) {
    const c = campaign || {};
    if (c.chapter != null && this.at(c.chapter)) return String(c.chapter);
    const seq = (typeof Route !== 'undefined') ? Route.order(c.route) : [];
    for (let i = seq.length - 1; i >= 0; i--) {
      const id = seq[i] && seq[i].id;
      if (id != null && this.stateOf(c, id) === 'cleared') return String(id);
    }
    return '1';
  },

  /* ---------- 装饰件 ---------- */

  /* 一道山脊：主峰 + 四座副峰，右侧受光面压暗，峰线描一道淡金 */
  _range(x, y, s, far) {
    const k = s || 1;
    const p = (dx, dy) => (x + dx * k).toFixed(1) + ' ' + (y + dy * k).toFixed(1);
    const outline = 'M' + p(-72, 0) + ' L' + p(-52, -20) + ' L' + p(-38, -12) +
      ' L' + p(-14, -50) + ' L' + p(6, -22) + ' L' + p(24, -38) + ' L' + p(42, -12) +
      ' L' + p(58, -24) + ' L' + p(76, 0) + ' Z';
    const shade = 'M' + p(-14, -50) + ' L' + p(6, -22) + ' L' + p(24, -38) +
      ' L' + p(42, -12) + ' L' + p(58, -24) + ' L' + p(76, 0) + ' L' + p(-14, 0) + ' Z';
    const ridge = 'M' + p(-52, -20) + ' L' + p(-38, -12) + ' L' + p(-14, -50) +
      ' L' + p(6, -22) + ' L' + p(24, -38) + ' L' + p(42, -12) + ' L' + p(58, -24);
    if (far) {
      return '<g class="wm-range far"><path class="wm-range-body" d="' + outline + '"/></g>';
    }
    return '<g class="wm-range">' +
      '<path class="wm-range-body" d="' + outline + '"/>' +
      '<path class="wm-range-shade" d="' + shade + '"/>' +
      '<path class="wm-range-ridge" d="' + ridge + '"/>' +
      '</g>';
  },

  /* 水纹：一道三叠的弧 */
  _wave(x, y, s) {
    const k = s || 1;
    return '<path class="wm-wave" d="M' + x + ' ' + y +
      ' q ' + (11 * k) + ' ' + (-6 * k) + ' ' + (22 * k) + ' 0' +
      ' t ' + (22 * k) + ' 0' +
      ' t ' + (22 * k) + ' 0"/>';
  },

  /* 四角回纹：边框上的角饰 */
  _corners() {
    const c = (x, y, sx, sy) =>
      '<path class="wm-corner" d="M' + (x + 34 * sx) + ' ' + y +
      ' L' + (x + 8 * sx) + ' ' + y +
      ' L' + (x + 8 * sx) + ' ' + (y + 26 * sy) + '"/>' +
      '<path class="wm-corner thin" d="M' + (x + 26 * sx) + ' ' + (y + 6 * sy) +
      ' L' + (x + 15 * sx) + ' ' + (y + 6 * sy) +
      ' L' + (x + 15 * sx) + ' ' + (y + 17 * sy) + '"/>';
    return c(6, 6, 1, 1) + c(994, 6, -1, 1) + c(6, 594, 1, -1) + c(994, 594, -1, -1);
  },

  /* 一方朱印：竖排四字 */
  _seal(x, y, text) {
    const chars = String(text).split('');
    let t = '';
    chars.forEach((ch, i) => {
      t += '<text class="wm-seal-text" x="' + (x + 15) + '" y="' + (y + 19 + i * 16) + '">' + ch + '</text>';
    });
    return '<g class="wm-seal"><rect x="' + x + '" y="' + y + '" width="30" height="' +
      (chars.length * 16 + 12) + '" rx="2"/>' + t + '</g>';
  },

  /* ---------- 主体 ---------- */
  svg(campaign, pickId) {
    const c = campaign || {};
    const pick = pickId != null ? String(pickId) : this.pickDefault(c);
    const st = id => this.stateOf(c, id);

    let out = '<svg class="wm-svg" viewBox="0 0 ' + WM_W + ' ' + WM_H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="舆图">';

    /* ---- 0. 资源 ---- */
    out += '<defs>' +
      /* 绢底：中心微亮，四周沉下去 */
      '<radialGradient id="wmGround" cx="0.42" cy="0.4" r="0.78">' +
      '<stop offset="0" stop-color="#1d241d"/>' +
      '<stop offset="0.55" stop-color="#151b16"/>' +
      '<stop offset="1" stop-color="#0b0f0c"/>' +
      '</radialGradient>' +
      /* 海：深青，越往东南越沉 */
      '<linearGradient id="wmSeaG" x1="0.1" y1="0" x2="0.8" y2="1">' +
      '<stop offset="0" stop-color="#1d3a39" stop-opacity=".5"/>' +
      '<stop offset="0.5" stop-color="#16302f" stop-opacity=".74"/>' +
      '<stop offset="1" stop-color="#0a1617" stop-opacity=".9"/>' +
      '</linearGradient>' +
      /* 海眼：绛紫往下压 */
      '<radialGradient id="wmEye" cx="0.5" cy="0.5" r="0.5">' +
      '<stop offset="0" stop-color="#8a6bb8" stop-opacity=".5"/>' +
      '<stop offset="0.45" stop-color="#5c4380" stop-opacity=".26"/>' +
      '<stop offset="1" stop-color="#2a1f3c" stop-opacity="0"/>' +
      '</radialGradient>' +
      /* 山体：峰顶受光、山脚沉入底色 */
      '<linearGradient id="wmRidgeG" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#3c4a3e"/>' +
      '<stop offset="0.55" stop-color="#26312a"/>' +
      '<stop offset="1" stop-color="#141a16"/>' +
      '</linearGradient>' +
      /* 远山：山脚化进底色，不留一条硬地平线 */
      '<linearGradient id="wmFarG" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#2b382f" stop-opacity=".6"/>' +
      '<stop offset="0.62" stop-color="#222c26" stop-opacity=".28"/>' +
      '<stop offset="1" stop-color="#1a221d" stop-opacity="0"/>' +
      '</linearGradient>' +
      /* 当前章的鎏金光晕 */
      '<radialGradient id="wmGlowG" cx="0.5" cy="0.5" r="0.5">' +
      '<stop offset="0" stop-color="#f0d189" stop-opacity=".55"/>' +
      '<stop offset="0.4" stop-color="#d3ab5e" stop-opacity=".22"/>' +
      '<stop offset="1" stop-color="#d3ab5e" stop-opacity="0"/>' +
      '</radialGradient>' +
      /* 四周压暗 */
      '<radialGradient id="wmVig" cx="0.5" cy="0.48" r="0.72">' +
      '<stop offset="0.55" stop-color="#000" stop-opacity="0"/>' +
      '<stop offset="1" stop-color="#000" stop-opacity=".62"/>' +
      '</radialGradient>' +
      '<clipPath id="wmSeaClip"><path d="' + WM_SEA + '"/></clipPath>' +
      '</defs>';

    /* ---- 1. 绢底 ---- */
    out += '<rect width="' + WM_W + '" height="' + WM_H + '" fill="url(#wmGround)"/>';
    /* 陈年斑驳：几块极淡的赭黄渍 */
    out += '<g class="wm-stain">' +
      '<ellipse cx="190" cy="160" rx="120" ry="78" fill="#7a5f2e" opacity=".035"/>' +
      '<ellipse cx="520" cy="470" rx="150" ry="92" fill="#7a5f2e" opacity=".028"/>' +
      '<ellipse cx="830" cy="130" rx="110" ry="68" fill="#7a5f2e" opacity=".028"/>' +
      '</g>';

    /* ---- 2. 海 ---- */
    out += '<g clip-path="url(#wmSeaClip)">';
    out += '<path d="' + WM_SEA + '" fill="url(#wmSeaG)"/>';
    /* 海眼：同心漩涡 */
    for (let i = 0; i < 5; i++) {
      const r = 32 + i * 24;
      out += '<circle class="wm-ring" cx="698" cy="500" r="' + r + '" opacity="' + (0.2 - i * 0.032).toFixed(2) + '"/>';
    }
    out += '<circle cx="698" cy="500" r="112" fill="url(#wmEye)"/>';
    for (const w of WM_WAVES) out += this._wave(w.x, w.y, w.s);
    out += '</g>';
    /* 海岸：一道亮线 + 一道更淡的浪花线 */
    out += '<path class="wm-coast" d="' + WM_COAST + '"/>';
    out += '<path class="wm-coast foam" d="' + WM_COAST + '"/>';

    /* ---- 3. 山峦：先远后近，远山只留剪影 ---- */
    for (const r of WM_FAR) out += this._range(r.x, r.y, r.s, true);
    for (const r of WM_RANGES) out += this._range(r.x, r.y, r.s);

    /* ---- 3.5 灵脉：自海眼辐射，压在路下面 ---- */
    WM_VEINS.forEach((id, i) => {
      const t = this.at(id);
      if (!t) return;
      const sx = 698, sy = 500;
      const dx = t.x - sx, dy = t.y - sy;
      const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      /* 控制点沿法线偏 18%，每条偏的方向按序号交替，免得都往一侧弯 */
      const k = (i % 2 ? 1 : -1) * 0.18;
      const cx = (sx + t.x) / 2 + (-dy / len) * len * k;
      const cy = (sy + t.y) / 2 + (dx / len) * len * k;
      out += '<path class="wm-vein" d="M' + sx + ' ' + sy + ' Q' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ' ' + t.x + ' ' + t.y + '"/>';
    });

    /* ---- 4. 道路（先线后点，节点压在上面） ---- */
    WM_EDGES.forEach((e, i) => {
      const a = this.at(e[0]), b = this.at(e[1]);
      if (!a || !b) return;
      const sa = st(e[0]), sb = st(e[1]);
      const dead = sa === 'abandoned' || sb === 'abandoned';
      const done = (sa === 'cleared' && (sb === 'cleared' || sb === 'current')) ||
        (sb === 'cleared' && (sa === 'cleared' || sa === 'current'));
      /* 控制点垂直于连线偏一点，走成微微弯的山道 */
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const off = ((i % 3) - 1) * 10;
      const cx = mx + (-dy / len) * off, cy = my + (dx / len) * off;
      const d = 'M' + a.x + ' ' + a.y + ' Q' + cx + ' ' + cy + ' ' + b.x + ' ' + b.y;
      const cls = 'wm-road' + (done ? ' done' : '') + (dead ? ' dead' : '');
      /* 描边底只垫在「已走过」的金线下面：没走过的路不能画成黑管 */
      if (done) out += '<path class="wm-road-under" d="' + d + '"/>';
      out += '<path class="' + cls + '" d="' + d + '"/>';
    });

    /* ---- 5. 地名 ---- */
    for (const r of WM_REGIONS) {
      out += '<text class="wm-region" x="' + r.x + '" y="' + r.y + '">' + r.text + '</text>';
    }

    /* ---- 6. 章节节点 ----
     * 十六个节点一次画全：还没走的路也在图上，只是暗着。
     * 路线定了以后，没选的那三章转「未走之路」——舆图不替人把选择抹掉。 */
    const chOf = id => (typeof Route !== 'undefined') ? Route.byId(id) : null;
    const ids = (typeof CHAPTERS !== 'undefined')
      ? CHAPTERS.map(x => x.id)
      : Object.keys(WM_NODES);

    for (const rawId of ids) {
      const id = String(rawId);
      const p = this.at(id);
      const ch = chOf(rawId);
      if (!p || !ch) continue;
      const s = st(id);
      const tint = this.tintOf(ch);
      const isPick = id === pick;
      const line = (typeof Route !== 'undefined' && Route.isRouteChapter(id)) ? id.charAt(1) : '';

      out += '<g class="wm-node is-' + s + (isPick ? ' is-pick' : '') + '"' +
        ' data-act="mapPick" data-id="' + id + '" tabindex="0" role="button"' +
        ' aria-label="' + UI.escape(UI.chapterLabel(ch.no) + ' ' + ch.name + ' ' + this.stateLabel(s)) + '">' +
        '<title>' + UI.escape(UI.chapterLabel(ch.no) + ' · ' + ch.name) + '</title>';
      /* 命中区放大，手指好点 */
      out += '<circle class="wm-hit" cx="' + p.x + '" cy="' + p.y + '" r="28"/>';
      /* 当前章：光晕 + 脉冲 */
      if (s === 'current') {
        out += '<circle cx="' + p.x + '" cy="' + p.y + '" r="34" fill="url(#wmGlowG)"/>';
        out += '<circle class="wm-pulse" cx="' + p.x + '" cy="' + p.y + '" r="17"/>';
      }
      /* 印面：外圈 + 内芯（芯色取章节主题） */
      out += '<circle class="wm-ring-out" cx="' + p.x + '" cy="' + p.y + '" r="13"/>';
      out += '<circle class="wm-dot" cx="' + p.x + '" cy="' + p.y + '" r="9.5" style="--tint:' + tint + '"/>';
      out += '<text class="wm-no" x="' + p.x + '" y="' + (p.y + 3.6) + '">' + ch.no + '</text>';
      /* 分线小徽 A / B */
      if (line) {
        out += '<circle class="wm-line-badge" cx="' + (p.x + 15) + '" cy="' + (p.y - 15) + '" r="6.5"/>';
        out += '<text class="wm-line-text" x="' + (p.x + 15) + '" y="' + (p.y - 12.2) + '">' + line + '</text>';
      }
      /* 队伍旗：当前章插旗 */
      if (s === 'current') {
        out += '<g class="wm-flag"><path d="M' + (p.x - 1) + ' ' + (p.y - 15) + ' L' + (p.x - 1) + ' ' + (p.y - 42) + '" stroke-width="1.8"/>' +
          '<path d="M' + (p.x - 1) + ' ' + (p.y - 42) + ' L' + (p.x + 19) + ' ' + (p.y - 35) + ' L' + (p.x - 1) + ' ' + (p.y - 27) + ' Z"/></g>';
      }
      out += '<text class="wm-name" x="' + p.x + '" y="' + (p.y + 30) + '">' + UI.escape(ch.name) + '</text>';
      if (s === 'abandoned') {
        out += '<text class="wm-tag" x="' + p.x + '" y="' + (p.y + 43) + '">未 走</text>';
      }
      out += '</g>';
    }

    /* ---- 7. 绢纹 + 压暗 + 边框 ---- */
    out += '<rect width="' + WM_W + '" height="' + WM_H + '" fill="url(#wmVig)" pointer-events="none"/>';
    out += '<g class="wm-frame">' +
      '<rect x="5" y="5" width="990" height="590" rx="2"/>' +
      '<rect class="thin" x="12" y="12" width="976" height="576" rx="1"/>' +
      this._corners() +
      '</g>';
    out += this._seal(936, 26, '九脈山河');

    out += '</svg>';
    return out;
  }
};

if (typeof window !== 'undefined') window.WorldMap = WorldMap;
