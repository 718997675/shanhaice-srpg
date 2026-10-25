/* ============================================================
 * 程序图标库（P4.5）—— ui-icons.js
 *
 * 技能 / 状态 / 阵眼阶位原来都是纯文字，缺图标位。这里补一套
 * 内联 SVG 线性图标（24×24 viewBox，stroke=currentColor，
 * 不引外部文件、不走 PNG——纯静态红线里 SVG 是程序资产）。
 *
 * 两类用法：
 *   Icons.tag(标签文字)            单位卡的状态/词缀/指令态小签
 *   Icons.svg(Icons.skillKey(skill)) 营地技能行图标
 * 技能图标按**效果字段**解析而不是按技能名——以后加新技能
 * 自动有图标，不会漏。阶位徽章在 Canvas 上（render.js 画菱形
 * + 阶数点），不走 SVG。
 * ============================================================ */

const ICON_PATHS = {
  /* ---- 状态与词缀 ---- */
  root: '<path d="M9.5 8.5h-3a3 3 0 0 0 0 6h4"/><path d="M14.5 15.5h3a3 3 0 0 0 0-6h-4"/><path d="M9 11h6"/>',
  avoid: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/><path d="M4 20L20 4"/>',
  armor: '<path d="M12 3l7 2.5v5.5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V5.5z"/><path d="M9.5 9.5l2.5 2.5 2.5-2.5M12 12v3.5"/>',
  slow: '<path d="M6 3.5h12M6 20.5h12"/><path d="M7.5 3.5c0 3 2 4.5 4.5 4.5s4.5-1.5 4.5-4.5"/><path d="M16.5 20.5c0-3-2-4.5-4.5-4.5s-4.5 1.5-4.5 4.5"/>',
  shield: '<path d="M12 3l7 2.5v5.5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V5.5z"/><path d="M9 11.5l2.2 2.2L15.5 9.5"/>',
  shieldBroken: '<path d="M12 3l7 2.5v5.5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V5.5z"/><path d="M12 5.5v6M8.8 8l6.4 3M15.2 8l-6.4 3"/>',
  regen: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
  aura: '<circle cx="12" cy="12" r="3"/><path d="M12 4.5a7.5 7.5 0 0 1 0 15M12 4.5a7.5 7.5 0 0 0 0 15"/><path d="M5.5 7.5a9 9 0 0 0 0 9M18.5 7.5a9 9 0 0 1 0 9"/>',
  berserk: '<path d="M12 3.5c1.5 3 4.5 4 4.5 7.5a4.5 4.5 0 0 1-9 0c0-1.5.5-2.5.5-2.5S6 10 6 13.5a6 6 0 0 0 12 0c0-5-3.5-7-6-10z"/>',

  /* ---- 召唤三态指令 ---- */
  assault: '<path d="M5 5l4 4M5 11l4-4M11 5l-4 4"/><path d="M14.5 14.5L20 20M20 14.5L14.5 20"/><path d="M17 4l3 3-3 3"/>',
  guard: '<path d="M12 3l7 2.5v5.5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V5.5z"/><path d="M12 7.5v7M8.5 11h7"/>',
  escort: '<path d="M4 12h9"/><path d="M10 8.5L13.5 12 10 15.5"/><path d="M17 6.5v11M20 9.5v5"/>',

  /* ---- 单位卡其它标签 ---- */
  boss: '<path d="M4 17.5L5.5 8l4 3.5L12 6l2.5 5.5L18.5 8 20 17.5z"/><path d="M4 20.5h16"/>',
  talk: '<path d="M4 5.5h16v10H9l-5 4z"/><path d="M8.5 10.5h7"/>',
  flee: '<path d="M6 21V4"/><path d="M6 4.5c4-2.5 7 2 11 0v9c-4 2.5-7-2-11 0"/>',
  summon: '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="8" stroke-dasharray="2.5 3"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2"/>',

  /* ---- 技能（按效果字段解析） ---- */
  blade: '<path d="M14.5 3.5L20 9l-7.5 7.5-3.5.5.5-3.5z"/><path d="M4 20l4-4"/><path d="M12.5 5.5L18.5 11.5"/>',
  spark: '<path d="M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8z"/>',
  hit: '<circle cx="12" cy="12" r="8"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  feather: '<path d="M20 4C10 4 5.5 9 5.5 15.5c0 1.5.4 2.8.4 2.8L4 20"/><path d="M5.5 15.5C9 12 13 9.5 18 8"/><path d="M9.5 18.5h6"/>',
  wall: '<path d="M4 20.5h16"/><path d="M4 20.5V7l4-3.5 4 3.5 4-3.5 4 3.5v13.5"/><path d="M8 20.5v-5h8v5M12 7v4"/>',
  heal: '<path d="M4 11.5h16c0 4.5-3.5 8.5-8 8.5s-8-4-8-8.5z"/><path d="M8.5 8.5C8.5 5 12 4 12 4s3.5 1 3.5 4.5"/>',
  song: '<path d="M9 18V6.5l10-2v11"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
  move: '<path d="M4 8h11"/><path d="M12 5l3 3-3 3"/><path d="M4 13h7M4 18h7"/><path d="M17 13h3M17 18h3"/>',
  mag: '<path d="M12 3.5c-4.7 0-8.5 3.8-8.5 8.5s3.8 8.5 8.5 8.5c4.7 0 8.5-3.8 8.5-8.5"/><path d="M12 3.5c4.7 0 8.5 3.8 8.5 8.5"/><path d="M12 7.5c-2.5 0-4.5 2-4.5 4.5s2 4.5 4.5 4.5 4.5-2 4.5-4.5-2-4.5-4.5-4.5z"/>',
  skill: '<rect x="4.5" y="4.5" width="15" height="15" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1"/>'
};

/* 状态/词缀/指令态标签 → 图标键（单位卡用） */
const ICON_TAGS = {
  '定身': 'root', '迷眼': 'avoid', '破甲': 'armor', '移速下降': 'slow',
  '护盾': 'shield', '破盾': 'shieldBroken', '自愈': 'regen', '光环': 'aura', '狂暴': 'berserk',
  '猛攻': 'assault', '守御': 'guard', '随行': 'escort',
  '首领': 'boss', '可说得': 'talk', '已撤离': 'flee', '友军召唤': 'summon'
};

/* 技能图标解析：按效果字段，先命中先用（顺序即优先级）。
 * 新增技能只要用这些字段就自动有图标；全新字段回落「技」。 */
const SKILL_ICON_RULES = [
  [['summon', 'summonUses', 'summonUsesBonus', 'summonBuff', 'summonAuraHit', 'dmgPerSummon', 'selfDamageIfSummon'], 'summon'],
  [['healBonus'], 'heal'],
  [['songPower', 'songRange'], 'song'],
  [['dmg', 'critVsArmor', 'selfDamageOnNode'], 'blade'],
  [['crit', 'critIfNoMove'], 'spark'],
  [['hit', 'hitIfNoMove', 'hitIfMoved4', 'hitVsArmor', 'hitVsFlying', 'adjacentAllyHit', 'enemyAuraHit'], 'hit'],
  [['avoidFlat', 'avoidIfLone', 'avoidOnNode', 'adjacentAllyAvoid'], 'feather'],
  [['def', 'res', 'defIfWounded', 'hp'], 'wall'],
  [['move'], 'move'],
  [['mag'], 'mag'],
  [['movePenaltyOnHit'], 'slow']
];

const Icons = {
  has(key) { return !!ICON_PATHS[key]; },

  /* 内联 SVG（class 由调用方给，尺寸走 CSS .ic） */
  svg(key, cls) {
    const d = ICON_PATHS[key];
    if (!d) return '';
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      d + '</svg>';
  },

  /* 单位卡小签：图标 + 文字（无图标键时退化成纯文字签） */
  tag(text) {
    const t = String(text == null ? '' : text).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const key = ICON_TAGS[text];
    return '<span class="tagchip">' + this.svg(key) + '<i>' + t + '</i></span>';
  },

  /* 技能行图标：按效果字段解析 */
  skillKey(skill) {
    if (!skill) return 'skill';
    for (const [fields, key] of SKILL_ICON_RULES) {
      if (fields.some(f => skill[f] !== undefined && skill[f] !== false)) return key;
    }
    return 'skill';
  },

  skill(skill, cls) { return this.svg(this.skillKey(skill), cls); }
};

if (typeof window !== 'undefined') window.Icons = Icons;
