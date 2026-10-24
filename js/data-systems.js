/* ============================================================
 * 山海策 · 灵脉  —  数据层：进阶系统表
 * 五行法术 / 传说武器 / 召唤三阶。纯静态数据，无逻辑。
 * 公式一律进 combat.js（相克乘法 elementMul），演出与流程进
 * js/systems/*.js（ spells.js / summon.js 后续落地）。
 * 加载顺序：data-core → data-systems → data-maps → combat。
 * ============================================================ */

/* ---------------- 五行 ----------------
 * 相克：金克木、木克土、土克水、水克火、火克金。
 * 同系中性；互不相克为中性。倍率表 ELEMENT_MULTIPLIER。
 */
const ELEMENTS = {
  metal:  { key: 'metal',  name: '金', color: '#d8c690', note: '金曰肃杀，主锋锐' },
  wood:   { key: 'wood',   name: '木', color: '#8fbf7a', note: '木曰曲直，主生发' },
  water:  { key: 'water',  name: '水', color: '#7ab0c9', note: '水曰润下，主寒凝' },
  fire:   { key: 'fire',   name: '火', color: '#c97b5a', note: '火曰炎上，主焚灼' },
  earth:  { key: 'earth',  name: '土', color: '#b09a6a', note: '土爰稼穑，主厚重' }
};

/* key 克 value */
const ELEMENT_COUNTERS = {
  metal: 'wood',
  wood: 'earth',
  earth: 'water',
  water: 'fire',
  fire: 'metal'
};

const ELEMENT_MULTIPLIER = { strong: 1.25, weak: 0.8, neutral: 1 };

/* ---------------- 五行法术 ----------------
 * mt：威力（按 mag 结算，magic 语义）；hit：命中；crit：暴击；
 * rng：[最小, 最大] 射程；uses：每章可用次数；wt：重量；
 * aoe：null 单体 / { radius: n } 以目标格为圆心逐目标结算；
 * effect：附加效果（迟滞 root / 护甲 debuffDef / 回避 debuffAvoid，turns 持续回合）；
 * holders：可持此法的敌军键（Boss 持法）；learnBy：我方习得路径。
 * rank 与武器熟练度共用 D~S 阶梯。
 */
const SPELLS = {
  /* —— 金 —— */
  metal_edge: {
    key: 'metal_edge', name: '锐金诀', element: 'metal', rank: 'C',
    mt: 5, hit: 90, crit: 0, rng: [1, 2], uses: 8, wt: 3,
    learnBy: [{ char: 'xuanyi', level: 5 }, { char: 'chisang', level: 7 }],
    desc: '指尖凝一线金气，裂革如撕纸。'
  },
  metal_break: {
    key: 'metal_break', name: '金锋破', element: 'metal', rank: 'B',
    mt: 8, hit: 85, crit: 5, rng: [1, 2], uses: 6, wt: 4,
    learnBy: [{ char: 'xuanyi', level: 10 }],
    desc: '金气成锋，专破护身法罩。'
  },
  metal_final: {
    key: 'metal_final', name: '万刃归宗', element: 'metal', rank: 'A',
    mt: 12, hit: 80, crit: 5, rng: [1, 2], uses: 4, wt: 6, aoe: { radius: 1 },
    learnBy: [{ char: 'xuanyi', level: 16 }],
    holders: ['xuanque'],
    desc: '百十道金刃悬于敌阵之上，齐落时无一物可避。'
  },

  /* —— 木 —— */
  wood_vine: {
    key: 'wood_vine', name: '缠魂藤', element: 'wood', rank: 'C',
    mt: 4, hit: 85, crit: 0, rng: [1, 2], uses: 8, wt: 3,
    effect: { root: 1 },
    learnBy: [{ char: 'luming', level: 5 }, { char: 'xuanyi', level: 5 }],
    holders: ['bamboo'],
    desc: '青藤自地下钻出，缠住脚踝便不肯松。'
  },
  wood_lure: {
    key: 'wood_lure', name: '青萝引', element: 'wood', rank: 'B',
    mt: 7, hit: 90, crit: 0, rng: [1, 2], uses: 6, wt: 4,
    effect: { debuffAvoid: 10, turns: 1 },
    learnBy: [{ char: 'luming', level: 9 }, { char: 'xuanyi', level: 10 }],
    desc: '萝花一引，敌方眼目被绿意所迷。'
  },
  wood_final: {
    key: 'wood_final', name: '千藤锁岳', element: 'wood', rank: 'A',
    mt: 11, hit: 85, crit: 0, rng: [1, 2], uses: 4, wt: 6, aoe: { radius: 1 },
    effect: { root: 1 },
    learnBy: [{ char: 'xuanyi', level: 16 }],
    holders: ['bamboo'],
    desc: '方圆一步内藤蔓破土，捆得群敌寸步难行。'
  },

  /* —— 水 —— */
  water_ripple: {
    key: 'water_ripple', name: '寒漪咒', element: 'water', rank: 'C',
    mt: 5, hit: 90, crit: 0, rng: [1, 2], uses: 8, wt: 3,
    learnBy: [{ char: 'xuanyi', level: 5 }, { char: 'chisang', level: 7 }],
    holders: ['waterghost'],
    desc: '一泓寒水兜心浇下，冷到骨缝里。'
  },
  water_frost: {
    key: 'water_frost', name: '霜封咒', element: 'water', rank: 'B',
    mt: 8, hit: 85, crit: 0, rng: [1, 2], uses: 6, wt: 4,
    effect: { root: 1 },
    learnBy: [{ char: 'xuanyi', level: 10 }],
    holders: ['waterghost', 'icexiao'],
    desc: '霜花顺着靴爬上膝，再迈不动半步。'
  },
  water_final: {
    key: 'water_final', name: '霜封十里', element: 'water', rank: 'A',
    mt: 12, hit: 80, crit: 0, rng: [1, 2], uses: 4, wt: 6, aoe: { radius: 1 },
    effect: { root: 1 },
    learnBy: [{ char: 'xuanyi', level: 16 }],
    holders: ['xuanque'],
    desc: '寒川倒卷，所覆之处尽成冰原。'
  },

  /* —— 火 —— */
  fire_ember: {
    key: 'fire_ember', name: '烈烬咒', element: 'fire', rank: 'C',
    mt: 6, hit: 85, crit: 5, rng: [1, 2], uses: 8, wt: 3,
    learnBy: [{ char: 'chisang', level: 5 }, { char: 'xuanyi', level: 5 }],
    holders: ['chisha'],
    desc: '一点火星落在衣甲上，越扑越旺。'
  },
  fire_flow: {
    key: 'fire_flow', name: '流火咒', element: 'fire', rank: 'B',
    mt: 9, hit: 80, crit: 5, rng: [1, 2], uses: 6, wt: 4,
    learnBy: [{ char: 'chisang', level: 9 }, { char: 'xuanyi', level: 10 }],
    holders: ['chisha'],
    desc: '火线贴地而走，专往人腿边钻。'
  },
  fire_final: {
    key: 'fire_final', name: '焚脉火龙', element: 'fire', rank: 'A',
    mt: 13, hit: 75, crit: 10, rng: [1, 2], uses: 4, wt: 6, aoe: { radius: 1 },
    learnBy: [{ char: 'xuanyi', level: 16 }],
    holders: ['xuanque'],
    desc: '火龙循灵脉而奔，过处草木成灰。'
  },

  /* —— 土 —— */
  earth_rock: {
    key: 'earth_rock', name: '磐山咒', element: 'earth', rank: 'C',
    mt: 5, hit: 90, crit: 0, rng: [1, 2], uses: 8, wt: 3,
    effect: { debuffDef: 2, turns: 1 },
    learnBy: [{ char: 'xuanyi', level: 5 }],
    holders: ['turbidgeneral'],
    desc: '敌甲上凭空多压一层山岩。'
  },
  earth_sink: {
    key: 'earth_sink', name: '地陷咒', element: 'earth', rank: 'B',
    mt: 8, hit: 85, crit: 0, rng: [1, 2], uses: 6, wt: 4,
    effect: { debuffAvoid: 10, turns: 1 },
    learnBy: [{ char: 'xuanyi', level: 10 }],
    holders: ['swampdragon'],
    desc: '脚下地面一软，站都站不稳。'
  },
  earth_final: {
    key: 'earth_final', name: '后土厚德', element: 'earth', rank: 'A',
    mt: 11, hit: 85, crit: 0, rng: [1, 2], uses: 4, wt: 6, aoe: { radius: 1 },
    effect: { debuffDef: 3, turns: 1 },
    learnBy: [{ char: 'xuanyi', level: 16 }],
    holders: ['turbidgeneral'],
    desc: '群山之重加于敌身，连呼吸都费力。'
  },

  /* —— 谣（歌者 · 虞素秋）——
   * song: 纯效果法术，不造成伤害；ally: 以友军为目标；
   * heal: 治疗量。歌不吃五行、不进武器三角。 */
  song_ansoul: {
    key: 'song_ansoul', name: '安魂曲', element: 'none', rank: 'C',
    mt: 0, hit: 90, crit: 0, rng: [1, 2], uses: 5, wt: 3, song: true,
    effect: { debuffAtk: 2, turns: 1 },
    learnBy: [{ char: 'yusqiu', level: 1 }],
    desc: '低吟入耳，敌兵的手就再也抬不起来。'
  },
  song_pozhen: {
    key: 'song_pozhen', name: '破阵歌', element: 'none', rank: 'C',
    mt: 0, hit: 85, crit: 0, rng: [1, 2], uses: 5, wt: 3, song: true,
    effect: { debuffHit: 10, turns: 1 },
    learnBy: [{ char: 'yusqiu', level: 1 }],
    desc: '一曲破阵，敌军眼里只剩虚影。'
  },
  song_suguang: {
    key: 'song_suguang', name: '溯光歌', element: 'none', rank: 'C',
    mt: 0, hit: 100, crit: 0, rng: [1, 2], uses: 4, wt: 3, song: true, ally: true, heal: 8,
    effect: { buffHit: 5, turns: 1 },
    learnBy: [{ char: 'yusqiu', level: 1 }],
    desc: '逆流而上的光，落在伤口上，也落进眼睛里。'
  }
};

/* ---------------- 传说武器 ----------------
 * 特定 Boss 极小概率掉落（掉率与保底见 systems/legendary.js 的 LEGENDARY_DROP），
 * 不可打造（forgeable: false），购入价恒 0。
 * traits：多词条，字段与 mods 同构（hit/crit/dmg/def/res/avoid/move，
 *   可带 Vs+目标标签 后缀，如 critVsBeast 对猛兽暴击 +N）；
 * skill：附带技能——数值字段（dmgVsBeast/dmgIfAdjacentAlly/dmgIfInitiating）
 *   进 modsOf 修正链；命中后字段（debuffDefOnHit/movePenaltyOnCrit/cleanseOnHit）
 *   由 battle.js 在 strike 事件落地。
 * source：掉落 Boss 的 ENEMY_TYPES 键名。
 */
const LEGENDARY_WEAPONS = {
  lw_yunque: {
    key: 'lw_yunque', name: '云却', type: 'sword', rank: 'S',
    mt: 15, hit: 90, crit: 10, wt: 6, rng: [1, 1], uses: 30, price: 0,
    forgeable: false, source: 'shanxiao',
    traits: [{ hit: 10 }, { crit: 5 }, { critVsBeast: 15 }],
    skill: { name: '断岳', desc: '对猛兽目标伤害 +3。', dmgVsBeast: 3 },
    desc: '山魈王枕下压了百年的剑，剑身薄如云片，出鞘有风声。'
  },
  lw_wanbi: {
    key: 'lw_wanbi', name: '万碧同春', type: 'tome', rank: 'S',
    mt: 13, hit: 85, crit: 5, wt: 5, rng: [1, 2], uses: 26, price: 0,
    magic: true, forgeable: false, source: 'bamboo',
    traits: [{ hit: 10 }, { dmg: 2 }, { dmgVsPlant: 4 }],
    skill: { name: '同春', desc: '对战时若相邻有友军，伤害 +2。', dmgIfAdjacentAlly: 2 },
    desc: '竹妖一生只开一次花，花落在咒页上，便成了这册子。'
  },
  lw_duanchao: {
    key: 'lw_duanchao', name: '断潮', type: 'lance', rank: 'S',
    mt: 16, hit: 80, crit: 5, wt: 9, rng: [1, 1], uses: 28, price: 0,
    forgeable: false, source: 'waterghost',
    traits: [{ crit: 10 }, { dmg: 2 }, { dmgVsUndead: 4 }],
    skill: { name: '破浪', desc: '主动攻击时伤害 +2。', dmgIfInitiating: 2 },
    desc: '水鬼的三股叉，叉尖能钉住奔涌的潮头。'
  },
  lw_fensha: {
    key: 'lw_fensha', name: '焚砂', type: 'axe', rank: 'S',
    mt: 19, hit: 70, crit: 0, wt: 15, rng: [1, 1], uses: 24, price: 0,
    forgeable: false, source: 'chisha',
    traits: [{ crit: 10 }, { hit: 5 }, { def: 2 }],
    skill: { name: '裂砂', desc: '命中后使目标护甲 -2，持续 1 回合。', debuffDefOnHit: { def: 2, turns: 1 } },
    desc: '赤砂将军的军刀，刀纹里沉着大漠的落日。'
  },
  lw_ningshuang: {
    key: 'lw_ningshuang', name: '凝霜', type: 'dagger', rank: 'S',
    mt: 11, hit: 90, crit: 20, wt: 3, rng: [1, 1], uses: 30, price: 0,
    forgeable: false, source: 'icexiao',
    traits: [{ crit: 10 }, { avoid: 10 }, { dmgVsUndead: 3 }],
    skill: { name: '霜吻', desc: '暴击时追加目标下回合移动 -1。', movePenaltyOnCrit: 1 },
    desc: '冰魈爪尖凝了千年的那一点霜，薄得看不见。'
  },
  lw_longgu: {
    key: 'lw_longgu', name: '龙骨弓', type: 'bow', rank: 'S',
    mt: 12, hit: 85, crit: 10, wt: 5, rng: [2, 2], uses: 28, price: 0,
    effective: ['flying'], forgeable: false, source: 'swampdragon',
    traits: [{ hit: 10 }, { crit: 5 }, { critVsFlying: 10 }],
    skill: { name: '穿沼', desc: '对猛兽与飞行目标伤害 +3。', dmgVsBeast: 3, dmgVsFlying: 3 },
    desc: '沼龙的肋骨弯成，弦响时沼泽会起雾。'
  },
  lw_pozhuo: {
    key: 'lw_pozhuo', name: '破浊符', type: 'talisman', rank: 'S',
    mt: 12, hit: 90, crit: 5, wt: 4, rng: [1, 2], uses: 26, price: 0,
    magic: true, effective: ['armor'], forgeable: false, source: 'turbidgeneral',
    traits: [{ hit: 10 }, { dmgVsArmor: 3 }, { critVsArmor: 10 }],
    skill: { name: '净脉', desc: '命中后清除目标身上一个增益状态。', cleanseOnHit: 1 },
    desc: '浊将贴身收着的黄符，朱砂画到第三笔时断了，断处最克浊。'
  }
};

/* ---------------- 召唤三阶 ----------------
 * tier：1 异兽 / 2 灵兽 / 3 神兽；角色 skill.summon 的数字即最高可召阶。
 * SUMMON_FIELD_CAP：场上同时存在的召唤物上限（含所有角色召唤的）。
 * SUMMON_USES_PER_CHAPTER：每个召唤技能每章可用次数。
 * orders：三态指令，战斗内可随时切换（不消耗行动）：
 *   assault 猛攻：伤害 +2、护甲 -2，主动逼近最近敌军；
 *   guard   守御：护甲 +3、回避 +10，原地不动，敌人进入邻接待命；
 *   escort  随行：跟随召唤者移动，替相邻友军承受第一次攻击。
 * 单位模板 base/growth 与 ENEMY_TYPES 同构；tier 1 数值与
 * ENEMY_TYPES.ally_wolf 一致（systems/summon.js 落地后由本表统一驱动）。
 */
const SUMMON_FIELD_CAP = 2;
const SUMMON_USES_PER_CHAPTER = 1;

const SUMMON_TIERS = [
  {
    tier: 1, key: 'beast', name: '异兽', unitType: 'ally_wolf',
    moveType: 'beast', move: 6, tags: ['beast'], weapon: 'wolf_claw',
    base: { hp: 20, str: 8, mag: 0, skl: 8, spd: 10, lck: 5, def: 5, res: 3 },
    growth: { hp: 1.8, str: 0.6, mag: 0, skl: 0.55, spd: 0.6, lck: 0.3, def: 0.35, res: 0.25 },
    orders: [
      { key: 'assault', name: '猛攻', effect: { dmg: 2, def: -2 } },
      { key: 'guard', name: '守御', effect: { def: 3, avoid: 10, hold: true } },
      { key: 'escort', name: '随行', effect: { follow: true, intercept: true } }
    ],
    desc: '山灵化狼，牙爪带风，是最容易请来的帮手。'
  },
  {
    tier: 2, key: 'spirit', name: '灵兽', unitType: 'ally_leopard',
    moveType: 'beast', move: 7, tags: ['beast'], weapon: 'leopard_claw',
    base: { hp: 26, str: 11, mag: 0, skl: 11, spd: 13, lck: 6, def: 6, res: 5 },
    growth: { hp: 2.1, str: 0.7, mag: 0, skl: 0.65, spd: 0.75, lck: 0.35, def: 0.4, res: 0.3 },
    orders: [
      { key: 'assault', name: '猛攻', effect: { dmg: 3, def: -2 } },
      { key: 'guard', name: '守御', effect: { def: 4, avoid: 10, hold: true } },
      { key: 'escort', name: '随行', effect: { follow: true, intercept: true } }
    ],
    desc: '云间豹，踏雷而来，一去十里。'
  },
  {
    tier: 3, key: 'deity', name: '神兽', unitType: 'ally_baize',
    moveType: 'flying', move: 7, tags: ['beast', 'flying'], weapon: 'baize_horn',
    base: { hp: 34, str: 13, mag: 8, skl: 13, spd: 12, lck: 10, def: 9, res: 10 },
    growth: { hp: 2.6, str: 0.8, mag: 0.5, skl: 0.7, spd: 0.6, lck: 0.5, def: 0.5, res: 0.55 },
    orders: [
      { key: 'assault', name: '猛攻', effect: { dmg: 4, def: -2 } },
      { key: 'guard', name: '守御', effect: { def: 5, avoid: 15, hold: true } },
      { key: 'escort', name: '随行', effect: { follow: true, intercept: true } }
    ],
    desc: '白泽现世，知鬼神之情状，晓万物之变化。'
  }
];

/* 三阶召唤新增武器（供 systems/summon.js 实例化时挂载） */
const SUMMON_WEAPONS = {
  leopard_claw: { key: 'leopard_claw', name: '雷纹爪', type: 'beast', rank: 'S', mt: 10, hit: 90, crit: 10, wt: 4, rng: [1, 1], uses: 99, price: 0, desc: '云豹爪尖带着细碎的雷。' },
  baize_horn: { key: 'baize_horn', name: '通明角', type: 'beast', rank: 'S', mt: 12, hit: 90, crit: 5, wt: 5, rng: [1, 1], uses: 99, price: 0, magic: true, desc: '白泽独角，照见隐形的浊气。' }
};

/* 并入主武器表：Combat.weaponOf 只查 WEAPONS */
Object.assign(WEAPONS, SUMMON_WEAPONS);
/* 传说兵器同样并入：掉落进行囊 / 装备 / 打造坊过滤都走 WEAPONS
 * （price 为 0，市集 weaponStock 的 price>0 过滤会自动排除） */
Object.assign(WEAPONS, LEGENDARY_WEAPONS);

/* 召唤阶位描述（UI 展示用） */
const SUMMON_TIER_NAMES = { 1: '异兽', 2: '灵兽', 3: '神兽' };

/* ---------------- 敌方精英词缀（每章 1~2 个，与 Boss 共享池） ----------------
 * shield  护盾：受伤 -30%；我方站在己方阵眼上攻击可破盾（破盾持续 1 回合）
 * regen   自愈：每回合开始回复 10% 最大生命
 * aura    光环：周围 2 格友军命中 +10
 * berserk 狂暴：生命低于 50% 时攻速 +3
 * 数值常量集中在此，公式侧（combat.js）与编排侧（battle.js）共用。 */
const ELITE_AFFIXES = {
  shield: { key: 'shield', name: '护盾', desc: '受伤 -30%；我方站在己方阵眼上攻击可破盾（破盾持续 1 回合）' },
  regen: { key: 'regen', name: '自愈', desc: '每回合开始回复 10% 最大生命' },
  aura: { key: 'aura', name: '光环', desc: '周围 2 格友军命中 +10' },
  berserk: { key: 'berserk', name: '狂暴', desc: '生命低于 50% 时攻速 +3' }
};
const AFFIX_SHIELD_MUL = 0.7;      // 护盾减伤
const AFFIX_REGEN_RATE = 0.1;      // 自愈比例
const AFFIX_AURA_HIT = 10;         // 光环命中
const AFFIX_BERSERK_SPD = 3;       // 狂暴攻速
