/* ============================================================
 * 山海策 · 灵脉  —  大地图（舆图）
 * 十六个章节节点铺在一张宣纸舆图上：青岚山门下山 → 赤砂关隘分兵
 * → A 焚脉（追）/ B 守脉（守）各三章 → 天柱废墟汇合 → 下海四章
 * → 浊潮之眼终战。
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

/* 地名（舆图上的淡墨大字，纯装饰） */
const WM_REGIONS = [
  { x: 74, y: 556, text: '青 岚 州' },
  { x: 392, y: 58, text: '玄 冰 原' },
  { x: 386, y: 398, text: '云 梦 泽' },
  { x: 714, y: 152, text: '天 柱' },
  { x: 892, y: 300, text: '东 海' }
];

/* 海岸线：舆图上陆地与东海的分界，也是海面填色的左边界 */
const WM_COAST = 'M600 246 Q646 292 632 336 Q618 384 654 432 Q692 478 628 530 Q592 566 556 600';

/* 山群：每处 3~5 峰，簇状，比散点更像「一笔山」 */
const WM_HILLS = [
  { x: 36, y: 372, s: 1.15 }, { x: 78, y: 396, s: 0.85 }, { x: 116, y: 380, s: 0.62 },
  { x: 244, y: 128, s: 1.0 }, { x: 286, y: 150, s: 0.72 }, { x: 318, y: 134, s: 0.52 },
  { x: 596, y: 386, s: 0.92 }, { x: 634, y: 404, s: 0.68 }
];

/* 水纹：只落在海面上 */
const WM_WAVES = [
  { x: 700, y: 336, s: 1 }, { x: 762, y: 372, s: 0.85 }, { x: 716, y: 452, s: 0.9 },
  { x: 812, y: 470, s: 0.8 }, { x: 690, y: 570, s: 0.75 }, { x: 880, y: 560, s: 0.7 }
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

  /* 章节主题色（借战场调色板，让节点带一点地形色） */
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

  /* 一笔山：三峰，中间高两边低 */
  _mountain(x, y, s) {
    const k = s || 1;
    return '<g class="wm-hill">' +
      '<path d="M' + x + ' ' + y + ' L' + (x + 17 * k) + ' ' + (y - 27 * k) +
      ' L' + (x + 28 * k) + ' ' + (y - 7 * k) +
      ' L' + (x + 40 * k) + ' ' + (y - 21 * k) +
      ' L' + (x + 64 * k) + ' ' + y + ' Z"/>' +
      '<path d="M' + (x + 17 * k) + ' ' + (y - 27 * k) + ' L' + (x + 22 * k) + ' ' + (y - 12 * k) + '" class="wm-hill-ridge"/>' +
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

  /* ---------- 主体 ---------- */
  svg(campaign, pickId) {
    const c = campaign || {};
    const pick = pickId != null ? String(pickId) : this.pickDefault(c);
    const st = id => this.stateOf(c, id);

    /* 1. 底色：宣纸 + 东海 */
    let out = '<svg class="wm-svg" viewBox="0 0 ' + WM_W + ' ' + WM_H + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="舆图">';
    out += '<defs>' +
      '<linearGradient id="wmSea" x1="0" y1="0" x2="0.35" y2="1">' +
      '<stop offset="0" stop-color="#5f9389" stop-opacity=".05"/>' +
      '<stop offset="1" stop-color="#3f6f70" stop-opacity=".17"/>' +
      '</linearGradient>' +
      '<radialGradient id="wmEye" cx="0.5" cy="0.5" r="0.5">' +
      '<stop offset="0" stop-color="#7a5f9e" stop-opacity=".3"/>' +
      '<stop offset="1" stop-color="#7a5f9e" stop-opacity="0"/>' +
      '</radialGradient>' +
      '</defs>';

    /* 海：海岸线以东填一层极淡的青，海眼处一圈绛紫 */
    out += '<path class="wm-sea" d="' + WM_COAST + ' L1000 600 L1000 228 Z" fill="url(#wmSea)"/>';
    out += '<path class="wm-coast" d="' + WM_COAST + '"/>';
    out += '<circle cx="698" cy="500" r="104" fill="url(#wmEye)"/>';

    /* 2. 山群与水纹（手摆，避开节点） */
    for (const h of WM_HILLS) out += this._mountain(h.x, h.y, h.s);
    for (const w of WM_WAVES) out += this._wave(w.x, w.y, w.s);

    /* 4. 道路（先画线，节点压在上面） */
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
      const off = ((i % 3) - 1) * 9;
      const cx = mx + (-dy / len) * off, cy = my + (dx / len) * off;
      const cls = 'wm-road' + (done ? ' done' : '') + (dead ? ' dead' : '');
      out += '<path class="' + cls + '" d="M' + a.x + ' ' + a.y + ' Q' + cx + ' ' + cy + ' ' + b.x + ' ' + b.y + '"/>';
    });

    /* 5. 地名 */
    for (const r of WM_REGIONS) {
      out += '<text class="wm-region" x="' + r.x + '" y="' + r.y + '">' + r.text + '</text>';
    }

    /* 6. 章节节点
     * 十六个节点一次画全：还没走的路也在图上，只是灰着。
     * 路线定了以后，没选的那三章转成「未走之路」——舆图不替人把选择抹掉。 */
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
      out += '<circle class="wm-hit" cx="' + p.x + '" cy="' + p.y + '" r="26"/>';
      /* 当前章：外圈脉冲 */
      if (s === 'current') {
        out += '<circle class="wm-pulse" cx="' + p.x + '" cy="' + p.y + '" r="19"/>';
      }
      /* 主圆 + 地形色内芯 */
      out += '<circle class="wm-dot" cx="' + p.x + '" cy="' + p.y + '" r="13" style="--tint:' + tint + '"/>';
      out += '<text class="wm-no" x="' + p.x + '" y="' + (p.y + 4) + '">' + ch.no + '</text>';
      /* 分线小徽 A / B */
      if (line) {
        out += '<circle class="wm-line-badge" cx="' + (p.x + 14) + '" cy="' + (p.y - 14) + '" r="6.5"/>';
        out += '<text class="wm-line-text" x="' + (p.x + 14) + '" y="' + (p.y - 11.2) + '">' + line + '</text>';
      }
      /* 队伍旗：当前章插旗 */
      if (s === 'current') {
        out += '<g class="wm-flag"><path d="M' + (p.x - 2) + ' ' + (p.y - 16) + ' L' + (p.x - 2) + ' ' + (p.y - 40) + '" stroke-width="1.8"/>' +
          '<path d="M' + (p.x - 2) + ' ' + (p.y - 40) + ' L' + (p.x + 17) + ' ' + (p.y - 34) + ' L' + (p.x - 2) + ' ' + (p.y - 27) + ' Z"/></g>';
      }
      out += '<text class="wm-name" x="' + p.x + '" y="' + (p.y + 30) + '">' + UI.escape(ch.name) + '</text>';
      if (s === 'abandoned') {
        out += '<text class="wm-tag" x="' + p.x + '" y="' + (p.y + 43) + '">未 走</text>';
      }
      out += '</g>';
    }

    out += '</svg>';
    return out;
  }
};

if (typeof window !== 'undefined') window.WorldMap = WorldMap;
