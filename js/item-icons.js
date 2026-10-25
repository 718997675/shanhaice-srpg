/* ============================================================
 * 物品图标库（二期 H）—— js/item-icons.js
 *
 * 全部 SVG 程序图（data URI，无外部请求、file:// 可跑）：
 * 10 类武器底形 × 铁/钢/银三档材质色 + 五行灵术符号（单/范围）+
 * 药水 3 瓶型 + 材料 4 枚。**只做呈现**：只读 WEAPONS/ITEMS/SPELLS
 * 数据表判类别，不算任何数值。
 *
 * 规范（二期计划 H.3）：左上光源、墨线、圆角方底框、剪影优先、
 * 稀有度走底框描边（普通墨/精良青/稀有金/传说赤）、类别形状编码
 * （形状优先于颜色）。缺图回退类别占位——永远不回退成纯文字。
 *
 * 入口：ItemIcons.iconHTML(id, cls, size) → <img>（未知 id 返回 ''）
 *       ItemIcons.uriFor(id) → data URI（camp 的 onerror 回退链用）
 * ============================================================ */
const ItemIcons = {
  INK: '#2b2b2b',
  PAPER: '#d9d2ba',

  /* 材质三档（铁哑光深灰 / 钢冷亮中灰 / 银浅亮冷调） */
  TIERS: {
    iron:   { body: '#6f6f68', hi: '#93938a', frame: '#5a5648' },
    steel:  { body: '#8b919a', hi: '#b6bcc3', frame: '#2e7d7a' },
    silver: { body: '#c6c2b2', hi: '#eae6d6', frame: '#c9a227' }
  },
  RANK_TIER: { D: 'iron', C: 'iron', B: 'steel', A: 'silver', S: 'silver' },

  /* 五行色（与 ELEMENTS 表同族） */
  ELEMENTS: {
    metal: '#b7ab8a', wood: '#5f7d4f', water: '#5a7d8c',
    fire: '#a0522d', earth: '#8a6f4d', none: '#7d7a70'
  },

  /* ---------------- 类别解析 ---------------- */
  tierOfRank(rank) { return this.RANK_TIER[rank] || 'iron'; },

  categoryOf(id) {
    if (!id) return null;
    const W = (typeof WEAPONS !== 'undefined') ? WEAPONS[id] : null;
    if (W) {
      const leg = (typeof LEGENDARY_WEAPONS !== 'undefined') && LEGENDARY_WEAPONS[id];
      return { kind: leg ? 'legendary' : 'weapon', cat: W.type, tier: this.tierOfRank(W.rank) };
    }
    const I = (typeof ITEMS !== 'undefined') ? ITEMS[id] : null;
    if (I) {
      if (I.kind === 'mat') return { kind: 'mat', cat: id, tier: id.indexOf('silver') >= 0 ? 'silver' : (id.indexOf('steel') >= 0 ? 'steel' : 'iron') };
      if (I.kind === 'seal') return { kind: 'seal', cat: 'seal' };
      /* 疗伤系：回 12/20 圆瓶（红），回 40 方瓶（蓝·增益感） */
      return { kind: 'potion', cat: (I.heal || 0) >= 40 ? 'elixir' : 'flask' };
    }
    const S = (typeof SPELLS !== 'undefined') ? SPELLS[id] : null;
    if (S) return { kind: 'spell', cat: S.element || 'none', aoe: !!S.aoe };
    return null;
  },

  /* ---------------- 底框（稀有度描边） ---------------- */
  _frame(color) {
    return '<rect x="3" y="3" width="58" height="58" rx="11" fill="' + this.PAPER + '" stroke="' +
      color + '" stroke-width="3"/>' +
      '<path d="M9 9 l4 -2 M55 9 l-4 -2 M9 55 l4 2 M55 55 l-4 2" stroke="' + color + '" stroke-width="1.4" opacity=".55"/>';
  },

  /* ---------------- 武器底形（10 类） ----------------
   * {b}=本体 {h}=高光 {i}=墨线。统一 45° 斜置（刃朝右上）。 */
  WSHAPES: {
    sword: '<g transform="rotate(28 32 32)">' +
      '<path d="M32 6 L36.5 13 L36.5 38 L32 42 L27.5 38 L27.5 13 Z" fill="{b}" stroke="{i}" stroke-width="2"/>' +
      '<path d="M32 8 L32 40" stroke="{h}" stroke-width="1.6" opacity=".7"/>' +
      '<rect x="21" y="38" width="22" height="5" rx="1.5" fill="{b}" stroke="{i}" stroke-width="2"/>' +
      '<rect x="29.5" y="43" width="5" height="12" fill="{h}" stroke="{i}" stroke-width="2"/>' +
      '<circle cx="32" cy="57.5" r="3.2" fill="{b}" stroke="{i}" stroke-width="2"/></g>',
    axe: '<g transform="rotate(28 32 32)">' +
      '<rect x="30" y="10" width="4" height="46" rx="2" fill="{h}" stroke="{i}" stroke-width="2"/>' +
      '<path d="M33 15 Q51 17 53 31 Q44 26 33 30 Z" fill="{b}" stroke="{i}" stroke-width="2"/>' +
      '<path d="M35 20 Q46 22 48 30 Q41 27 35 29 Z" fill="{h}" opacity=".55"/>' +
      '<circle cx="32" cy="58" r="3" fill="{b}" stroke="{i}" stroke-width="2"/></g>',
    lance: '<g transform="rotate(28 32 32)">' +
      '<path d="M15 53 L43 21" stroke="{h}" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M43 21 L56 9 L51 27 Z" fill="{b}" stroke="{i}" stroke-width="2"/>' +
      '<path d="M43 21 L51 27" stroke="{i}" stroke-width="1.4"/>' +
      '<circle cx="14" cy="54" r="2.6" fill="{b}" stroke="{i}" stroke-width="1.8"/></g>',
    bow: '<g transform="rotate(28 32 32)">' +
      '<path d="M20 8 Q50 32 20 56" fill="none" stroke="{b}" stroke-width="4.5" stroke-linecap="round"/>' +
      '<path d="M20 8 L20 56" stroke="{i}" stroke-width="1.6"/>' +
      '<path d="M20 32 L38 32" stroke="{h}" stroke-width="1.8" stroke-dasharray="3 3"/></g>',
    dagger: '<g transform="rotate(28 32 32)">' +
      '<path d="M32 16 L36 22 L36 38 L32 41 L28 38 L28 22 Z" fill="{b}" stroke="{i}" stroke-width="2"/>' +
      '<rect x="23.5" y="38" width="17" height="4.5" rx="1.5" fill="{b}" stroke="{i}" stroke-width="2"/>' +
      '<rect x="29.5" y="42" width="5" height="9" fill="{h}" stroke="{i}" stroke-width="2"/>' +
      '<circle cx="32" cy="53.5" r="2.8" fill="{b}" stroke="{i}" stroke-width="2"/></g>',
    talisman: '<g transform="rotate(28 32 32)">' +
      '<rect x="24" y="6" width="16" height="52" rx="3" fill="#cbb489" stroke="{i}" stroke-width="2"/>' +
      '<path d="M28 15 q4 -4 8 0 q4 4 8 0" stroke="#a02c2c" stroke-width="2" fill="none"/>' +
      '<path d="M28 25 h12 M28 31 h12 M28 37 h7" stroke="#a02c2c" stroke-width="2"/>' +
      '<circle cx="32" cy="47" r="4.5" stroke="#a02c2c" fill="none" stroke-width="2"/></g>',
    staff: '<g transform="rotate(28 32 32)">' +
      '<path d="M32 14 L32 57" stroke="{h}" stroke-width="4.5" stroke-linecap="round"/>' +
      '<circle cx="32" cy="12" r="7.5" fill="none" stroke="{b}" stroke-width="3.5"/>' +
      '<circle cx="32" cy="12" r="2.6" fill="{b}"/>' +
      '<path d="M27 57 h10" stroke="{i}" stroke-width="2"/></g>',
    beast: '<g transform="rotate(28 32 32)">' +
      '<path d="M17 53 q-3 -17 5 -27" fill="none" stroke="{b}" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M32 53 q-3 -21 0 -31" fill="none" stroke="{b}" stroke-width="4" stroke-linecap="round"/>' +
      '<path d="M47 53 q3 -17 -5 -27" fill="none" stroke="{b}" stroke-width="4" stroke-linecap="round"/>' +
      '<rect x="15" y="51" width="34" height="7" rx="3.5" fill="{h}" stroke="{i}" stroke-width="2"/></g>',
    voice: '<g transform="rotate(28 32 32)">' +
      '<rect x="9" y="27" width="46" height="10" rx="5" fill="{b}" stroke="{i}" stroke-width="2"/>' +
      '<path d="M19 27 L19 37 M29 27 L29 37 M39 27 L39 37" stroke="{i}" stroke-width="1.6"/>' +
      '<circle cx="48" cy="32" r="1.8" fill="{i}"/>' +
      '<path d="M9 32 q-4 0 -4 3" fill="none" stroke="{i}" stroke-width="1.6"/></g>',
    tome: '<g transform="rotate(28 32 32)">' +
      '<path d="M11 17 q10 -6 21 0 q10 -6 21 0 L53 47 q-10 -6 -21 0 q-11 -6 -21 0 Z" fill="{b}" stroke="{i}" stroke-width="2"/>' +
      '<path d="M32 17 L32 47" stroke="{i}" stroke-width="2"/>' +
      '<path d="M17 25 h9 M38 25 h9 M17 33 h9 M38 33 h9" stroke="{i}" stroke-width="1.4"/></g>',
    /* 链：短柄 + 三节锁环 + 尖坠，沿斜向串起 */
    chain: '<g transform="rotate(28 32 32)">' +
      '<path d="M14 56 L21 47" stroke="{i}" stroke-width="7.5" stroke-linecap="round"/>' +
      '<path d="M14 56 L21 47" stroke="{b}" stroke-width="5" stroke-linecap="round"/>' +
      '<ellipse cx="25" cy="43" rx="6.6" ry="4.2" transform="rotate(-51 25 43)" fill="none" stroke="{b}" stroke-width="2.6"/>' +
      '<ellipse cx="32" cy="34" rx="6.6" ry="4.2" transform="rotate(-51 32 34)" fill="none" stroke="{h}" stroke-width="2.6"/>' +
      '<ellipse cx="39" cy="25" rx="6.6" ry="4.2" transform="rotate(-51 39 25)" fill="none" stroke="{b}" stroke-width="2.6"/>' +
      '<path d="M43 21 L54 8 L49 23 Z" fill="{b}" stroke="{i}" stroke-width="1.8"/></g>'
  },

  /* ---------------- 五行符号 ---------------- */
  ESYMBOLS: {
    metal: '<path d="M32 9 L36.5 27.5 L55 32 L36.5 36.5 L32 55 L27.5 36.5 L9 32 L27.5 27.5 Z" fill="{c}" stroke="{i}" stroke-width="1.6"/>',
    wood: '<path d="M32 54 q-15 -4 -12 -19 q3 -16 19 -14 q13 2 11 15" fill="none" stroke="{c}" stroke-width="3.4" stroke-linecap="round"/>' +
      '<ellipse cx="45" cy="22" rx="6.5" ry="4" fill="{c}" transform="rotate(-24 45 22)" stroke="{i}" stroke-width="1.2"/>',
    water: '<path d="M32 9 Q47 31 47 41 a15 15 0 1 1 -30 0 Q17 31 32 9 Z" fill="{c}" stroke="{i}" stroke-width="1.8"/>' +
      '<path d="M26 42 a6 6 0 0 0 5 6" fill="none" stroke="#e8f0f2" stroke-width="2" opacity=".8"/>',
    fire: '<path d="M32 7 q11 15 8 26 q-2 11 -9 13 q-11 -2 -11 -15 q0 -9 7 -15 q3 9 7 9 q0 -9 -2 -18 Z" fill="{c}" stroke="{i}" stroke-width="1.8"/>' +
      '<path d="M32 26 q5 8 4 14 q-1 5 -4 6" fill="none" stroke="#f0d9a8" stroke-width="2" opacity=".85"/>',
    earth: '<path d="M15 45 L23 19 L39 15 L51 31 L43 50 L22 48 Z" fill="{c}" stroke="{i}" stroke-width="2"/>' +
      '<path d="M23 19 L31 36 M39 15 L36 36 M31 36 L51 31 M31 36 L22 48" stroke="{i}" stroke-width="1.4" opacity=".7"/>',
    none: '<path d="M25 46 V26 l15 -4 v20" fill="none" stroke="{c}" stroke-width="3" stroke-linecap="round"/>' +
      '<ellipse cx="21" cy="47" rx="5" ry="4" fill="{c}" stroke="{i}" stroke-width="1.4"/>' +
      '<ellipse cx="36" cy="43" rx="5" ry="4" fill="{c}" stroke="{i}" stroke-width="1.4"/>'
  },

  /* 药瓶三型（液色区分类别：红疗伤 / 绿灵草 / 蓝增益） */
  BOTTLES: {
    flask: '<rect x="27" y="10" width="10" height="7" rx="2" fill="{h}" stroke="{i}" stroke-width="1.8"/>' +
      '<path d="M27 17 q11 11 11 21 a11 11 0 1 1 -22 0 q0 -10 11 -21 Z" fill="#b0523c" stroke="{i}" stroke-width="2"/>' +
      '<path d="M31 22 q6 7 6 12" fill="none" stroke="#d98a72" stroke-width="2" opacity=".8"/>',
    herb: '<rect x="27" y="10" width="10" height="7" rx="2" fill="{h}" stroke="{i}" stroke-width="1.8"/>' +
      '<path d="M27 17 q11 11 11 21 a11 11 0 1 1 -22 0 q0 -10 11 -21 Z" fill="#4f7d4a" stroke="{i}" stroke-width="2"/>' +
      '<path d="M31 22 q6 7 6 12" fill="none" stroke="#8ab583" stroke-width="2" opacity=".8"/>',
    elixir: '<rect x="26" y="9" width="12" height="7" rx="2" fill="{h}" stroke="{i}" stroke-width="1.8"/>' +
      '<path d="M26 16 L24 22 v22 a8 8 0 0 0 16 0 V22 L38 16 Z" fill="#4a6a8c" stroke="{i}" stroke-width="2"/>' +
      '<circle cx="32" cy="33" r="5" fill="#d9c26a" stroke="{i}" stroke-width="1.6"/>'
  },

  /* 材料四枚（矿物块 ×3 色 + 玉质脉印） */
  MATS: {
    mat_iron: '<path d="M13 41 L22 18 L40 15 L53 32 L43 51 L21 49 Z" fill="#5f5f59" stroke="{i}" stroke-width="2"/>' +
      '<path d="M22 18 L30 36 M40 15 L34 36 M30 36 L53 32 M30 36 L21 49" stroke="#84847c" stroke-width="1.6"/>',
    mat_steel: '<path d="M32 12 L47 22 L43 46 L21 46 L17 22 Z" fill="#7d838c" stroke="{i}" stroke-width="2"/>' +
      '<path d="M32 12 L32 46 M17 22 L43 46 M47 22 L21 46" stroke="#aab1b8" stroke-width="1.4" opacity=".8"/>' +
      '<circle cx="32" cy="30" r="4" fill="#cfd6dc"/>',
    mat_silver: '<path d="M32 9 L45 26 L38 53 L26 53 L19 26 Z" fill="#cfc9b8" stroke="{i}" stroke-width="2"/>' +
      '<path d="M32 9 L26 53 M19 26 L45 26" stroke="#efe9d8" stroke-width="1.6"/>' +
      '<path d="M32 20 L38 53" stroke="#efe9d8" stroke-width="1.2" opacity=".7"/>',
    seal: '<rect x="18" y="20" width="28" height="30" rx="4" fill="#7d9b8a" stroke="{i}" stroke-width="2"/>' +
      '<rect x="26" y="10" width="12" height="10" rx="2" fill="#6b8878" stroke="{i}" stroke-width="2"/>' +
      '<path d="M26 30 h12 M26 37 h12 M32 26 v18" stroke="#3f5a4c" stroke-width="2.4"/>'
  },

  /* ---------------- SVG 组装 ---------------- */
  _fill(shape, map) {
    return shape.replace(/\{(\w+)\}/g, (m, k) => (map[k] !== undefined ? map[k] : m));
  },

  _inner(c) {
    if (c.kind === 'weapon' || c.kind === 'legendary') {
      const shape = this.WSHAPES[c.cat];
      if (!shape) return null;
      const t = this.TIERS[c.kind === 'legendary' ? 'silver' : (c.tier || 'iron')];
      let s = this._fill(shape, { b: t.body, h: t.hi, i: this.INK });
      if (c.kind === 'legendary') {
        /* 传说：外发光 + 粒子点，列表里一眼跳出来 */
        s = '<circle cx="32" cy="32" r="26" fill="#f0c25a" opacity=".18"/>' +
          '<circle cx="32" cy="32" r="22" fill="none" stroke="#f0c25a" stroke-width="1.4" opacity=".7"/>' + s;
      }
      return s;
    }
    if (c.kind === 'spell') {
      const sym = this.ESYMBOLS[c.cat] || this.ESYMBOLS.none;
      let s = this._fill(sym, { c: this.ELEMENTS[c.cat] || this.ELEMENTS.none, i: this.INK });
      if (c.aoe) {
        /* 范围：符号 + 范围框缩略（十字 5），单体无框 */
        s = '<path d="M32 8 v48 M8 32 h48" stroke="' + (this.ELEMENTS[c.cat] || this.ELEMENTS.none) +
          '" stroke-width="2" stroke-dasharray="4 4" opacity=".65"/>' + s;
      }
      return s;
    }
    if (c.kind === 'potion' || c.kind === 'mat' || c.kind === 'seal') {
      const table = c.kind === 'potion' ? this.BOTTLES : this.MATS;
      const shape = table[c.cat];
      if (!shape) return null;
      const t = this.TIERS[c.tier || 'iron'];
      return this._fill(shape, { b: t.body, h: t.hi, i: this.INK });
    }
    return null;
  },

  svgFor(id) {
    const c = this.categoryOf(id);
    if (!c) return null;
    const inner = this._inner(c);
    if (!inner) return null;
    let frameColor = this.INK;
    if (c.kind === 'legendary') frameColor = '#a02c2c';
    else if (c.kind === 'weapon') frameColor = this.TIERS[c.tier || 'iron'].frame;
    else if (c.kind === 'spell') frameColor = this.ELEMENTS[c.cat] || this.INK;
    else if (c.kind === 'mat') frameColor = this.TIERS[c.tier || 'iron'].frame;
    else if (c.kind === 'seal') frameColor = '#c9a227';
    else frameColor = '#2e7d7a';   // 药水：精良青
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">' +
      this._frame(frameColor) + inner + '</svg>';
  },

  uriFor(id) {
    const svg = this.svgFor(id);
    if (!svg) return null;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  },

  /* 统一渲染入口：未知 id 返回 ''（调用方落文字，不炸） */
  iconHTML(id, cls, size) {
    const uri = this.uriFor(id);
    if (!uri) return '';
    const s = size || 40;
    return '<img class="ii ' + (cls || '') + '" src="' + uri + '" alt="" width="' + s +
      '" height="' + s + '" draggable="false">';
  },

  /* 材料行内联小图标（强化/进化弹窗用） */
  matIconHTML(key, size) { return this.iconHTML(key, 'ii-mat', size || 18); }
};

if (typeof window !== 'undefined') window.ItemIcons = ItemIcons;
