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

/* ---------------- 云策指挥技（每章 1 次，HUD「令」入口） ----------------
 * order  号令：3 格内友军本回合可再行动一次（含已行动者）
 * volley 集火：指定 5 格内敌人，友军本回合对其命中 +15
 * hold   坚守：3 格内友军本回合受到攻击伤害 -20%
 * 云策阵亡/离队时不可用。数值常量集中于此。 */
const COMMAND_SKILLS = {
  order: { key: 'order', name: '号令', desc: '3 格内友军本回合可再行动一次（含已行动者）' },
  volley: { key: 'volley', name: '集火', desc: '指定 5 格内敌人，友军本回合对其命中 +15' },
  hold: { key: 'hold', name: '坚守', desc: '3 格内友军本回合受到攻击伤害 -20%' }
};
const COMMAND_VOLLEY_HIT = 15;   // 集火命中加成
const COMMAND_HOLD_MUL = 0.8;    // 坚守减伤
const CHAIN_RANGE = 2;           // 连携：与攻击者相距 ≤2 格

/* ---------------- 武器进化树（P2.3） ----------------
 * 同型兵装逐级进化：铁 → 钢 → 银/名器。规则在 systems/smith.js：
 *   进化后保留强化等级（+N 随兵装走）、耐久刷满、装备位不变；
 *   消耗盘缠 + 材料（铁髓/钢核）；传说、Boss 专属与角色专属（unique）不进表，
 *   天然不可进化。 */
const WEAPON_EVOLUTIONS = {
  iron_sword: { to: 'steel_sword', gold: 400, mat: 'mat_iron', n: 2 },
  steel_sword: { to: 'silver_sword', gold: 900, mat: 'mat_steel', n: 2 },
  iron_blade: { to: 'steel_blade', gold: 450, mat: 'mat_iron', n: 2 },
  steel_blade: { to: 'silver_blade', gold: 950, mat: 'mat_steel', n: 2 },
  iron_lance: { to: 'steel_lance', gold: 420, mat: 'mat_iron', n: 2 },
  steel_lance: { to: 'silver_lance', gold: 900, mat: 'mat_steel', n: 2 },
  iron_bow: { to: 'steel_bow', gold: 500, mat: 'mat_iron', n: 2 },
  steel_bow: { to: 'wind_bow', gold: 1000, mat: 'mat_steel', n: 2 },
  ice_tome: { to: 'thunder_tome', gold: 550, mat: 'mat_iron', n: 2 },
  thunder_tome: { to: 'frost_tome', gold: 1000, mat: 'mat_steel', n: 2 },
  spirit_talisman: { to: 'greater_talisman', gold: 520, mat: 'mat_iron', n: 2 },
  dagger: { to: 'shadow_dagger', gold: 800, mat: 'mat_steel', n: 2 },
  heal_staff: { to: 'greater_heal_staff', gold: 550, mat: 'mat_iron', n: 2 }
};

if (typeof window !== 'undefined') window.WEAPON_EVOLUTIONS = WEAPON_EVOLUTIONS;

/* ---------------- 心结（P3.2，升级方案 §4.2） ----------------
 * 第 4 章末「追与守」二选一后，被放弃的那条路会落在某个人心里：
 *   走 A（追·焚脉）→ 赤桑背着断魂谷的空谷；走 B（守·守脉）→ 墨鸦又放走玄阙一次。
 * 未解：该角色命中 -5（battle.js modsFor 统一出口）；终章前与支援 A 级挚友「了断」；
 * 全部解开 → 终章全队 +5 命中 +5 必杀。数值常量集中于此。 */
const HEART_KNOTS = {
  A: {
    char: 'chisang', partner: 'xuanyi', pairId: 'xuanyi_chisang',
    name: '空谷', desc: '你选了追。断魂谷的人等到最后一夜，没等到援兵。',
    hint: '与玄漪的羁绊达到 A 级后，可在营地「支援」页了断。',
    resolve: [
      { who: 'chisang', text: '……我一直在想谷里那些人。他们会不会以为，是我们不肯来。' },
      { who: 'xuanyi', text: '他们不会。守脉人走哪条路，他们比谁都清楚。' },
      { who: 'chisang', text: '可我清楚——我选了追，就等于替他们选了死。' },
      { who: 'xuanyi', text: '赤桑。你把这条命背着走了三章。放下吧，剩下的路我陪你走。' },
      { who: 'chisang', text: '……好。谷里的人，等我打完这一仗，回去给他们立碑。' }
    ]
  },
  B: {
    char: 'moya', partner: 'yunce', pairId: 'yunce_moya',
    name: '旧影', desc: '你选了守。玄阙又一次从眼前走掉，而这次是墨鸦让开的。',
    hint: '与云策的羁绊达到 A 级后，可在营地「支援」页了断。',
    resolve: [
      { who: 'moya', text: '第二次了。第一次他杀我全营，我跑了；这次我自己让开的路。' },
      { who: 'yunce', text: '你让开，是为了谷里那几万人。' },
      { who: 'moya', text: '道理我懂。可我一闭眼，就看见他背着手走远的样子。' },
      { who: 'yunce', text: '那就睁着眼。前面还有一段路，他跑不掉。' },
      { who: 'moya', text: '……你这个人，说话真难听。行，我跟你走到最后。' }
    ]
  }
};
const KNOT_HIT_PENALTY = 5;              // 未解心结：命中 -5
const KNOT_FINAL_BONUS = { hit: 5, crit: 5 };  // 全解：终章全队 +5 命中 +5 必杀
const KNOT_FINAL_NO = 9;                 // 终章章号

if (typeof window !== 'undefined') window.HEART_KNOTS = HEART_KNOTS;

/* ---------------- 技能继承与熟练度成长（P2.2） ----------------
 * 技能继承：转职时把原职业技能写入 rec.inherited（上限 INHERIT_CAP 条，先进先出），
 *   与职业技/个人技一起进 battle.skillFieldsOf；同名字段取较大值，不叠乘。
 * 熟练度成长：每章按「用该武器出手次数」累计，满 RANK_UP_USES 升一阶（D→C→B→A→S）。 */
const INHERIT_CAP = 2;                   // 每人最多带 2 条继承技（先进先出）
const RANK_UP_USES = 40;                 // 累计出手 40 次升一阶（跨章累加，升阶后清零）

if (typeof window !== 'undefined') {
  window.INHERIT_CAP = INHERIT_CAP;
  window.RANK_UP_USES = RANK_UP_USES;
}

/* ---------------- 多结局（P3.4） ----------------
 * 只做尾声差异，不做流程分支。判定三要素：存活人数、A 级支援组数、终章三阵眼是否全控。
 * endingOf 是纯函数，供 game.onChapterClear 与测试共用。 */
const ENDINGS = {
  good: {
    key: 'good', name: '灵脉重燃', kicker: '尾 声 · 上',
    lines: [
      '九条主脉在同一夜里亮起。先是天柱废墟下那一条，然后断魂谷、赤砂关、云梦泽——像有人从地底把灯一盏一盏点过来。',
      '玄阙没有留下尸体。他把自己拆成了九份，补回了他亲手抽走的地方。你师父到最后也没学会说软话，他只会做题。',
      '浊潮退去之后，滩上很静。虞素秋说那是海在唱，不是你听错。',
      '守脉人还剩几个？你回头数了数身后的人，数到一半就停了。活着的人不用数。',
      '后来山门重开。新来的孩子在石碑前问：守脉人守的是什么？你想了很久，说：守的是「还有人愿意接着守」这件事。'
    ]
  },
  mid: {
    key: 'mid', name: '山河如旧', kicker: '尾 声 · 中',
    lines: [
      '浊潮退了，但退得不干净。有些地方的土还是灰的，草长到一半就停住。',
      '换心没有成，也没有全败。主脉续上七条，剩下两条细得像线，风大一点就晃。',
      '你们把阵眼留在原地，派人守着。守到什么时候，没人说，也不敢说。',
      '山门还是那座山门，人少了一半。饭桌坐得松，谁都不提空着的位子。',
      '有人问你赢了吗。你说：活着回来了。这已经是很久没人做到的事。'
    ]
  },
  bad: {
    key: 'bad', name: '永夜', kicker: '尾 声 · 下',
    lines: [
      '主脉断在第八条。第九条在你们赶到之前就凉了。',
      '玄阙死在噬脉兽嘴里，噬脉兽死在你剑下。谁都没赢。',
      '浊潮不退了。它慢慢往上漫，漫过断桥，漫过赤砂关，漫到青岚山门的石阶第三级。',
      '你把还能走的人带下山。回头看，山在雾里，看不清了。守脉人的最后一课，是学会承认：有些东西守不住。',
      '但你还是把灯留下了。灯在，就还有人认得回来的路。'
    ]
  }
};

/* 判定阈值：好结局要求「人留住、羁绊够、阵眼全控」三条同时成立 */
const ENDING_RULE = { good: { alive: 8, rankA: 3, allNodes: true }, mid: { alive: 5, rankA: 1 } };

function endingOf(metrics) {
  const m = metrics || {};
  const alive = Math.max(0, Math.floor(m.alive || 0));
  const rankA = Math.max(0, Math.floor(m.rankA || 0));
  const held = Math.max(0, Math.floor(m.nodesHeld || 0));
  const total = Math.max(0, Math.floor(m.nodesTotal || 0));
  const allNodes = total > 0 && held >= total;
  const g = ENDING_RULE.good, mid = ENDING_RULE.mid;
  let key = 'bad';
  if (alive >= g.alive && rankA >= g.rankA && (!g.allNodes || allNodes)) key = 'good';
  else if (alive >= mid.alive || rankA >= mid.rankA) key = 'mid';
  const e = ENDINGS[key];
  return {
    key, name: e.name, kicker: e.kicker, lines: e.lines.slice(),
    metrics: { alive, rankA, nodesHeld: held, nodesTotal: total, allNodes }
  };
}

if (typeof window !== 'undefined') {
  window.ENDINGS = ENDINGS;
  window.endingOf = endingOf;
}

/* ---------------- 山海图鉴（P3.4） ----------------
 * 每条对应真实数据：kind 'beast' 键为 ENEMY_TYPES 键；'spirit' 为召唤兽；
 * 'elite' 为词缀（affix_*）；'boss' 为 ENEMY_TYPES 里的 Boss；
 * 'ruin' 绑定章节 id，通关该章解锁。
 * 解锁状态存 campaign.codex[key] = true，未解锁时只显示「未识」。 */
const CODEX_KINDS = { beast: '妖 兽', spirit: '灵 兽', elite: '精 英', boss: '首 领', ruin: '遗 迹' };

const CODEX = [
  /* —— 妖兽 8 —— */
  { key: 'bandit', kind: 'beast', name: '山贼', lore: '乱世里落草的人。多数不是天生要抢，只是没别的活法。', tip: '护甲薄，弓与咒都吃得下。' },
  { key: 'wolf', kind: 'beast', name: '妖狼', lore: '浊化最浅的妖兽，成群时才敢扑人。落单的狼会先看你有没有同伴。', tip: '单体脆弱，先杀领头的。' },
  { key: 'armor', kind: 'beast', name: '岩魈', lore: '身上结了一层石壳，走起路来像有石头在滚。壳下其实是软的。', tip: '怕破甲兵装，火能烧裂石壳。' },
  { key: 'bird', kind: 'beast', name: '妖鸟', lore: '翅膀上沾着浊潮的灰。飞得高，落得也快。', tip: '弓与羽人对空有加成。' },
  { key: 'shaman', kind: 'beast', name: '浊咒徒', lore: '拿命换咒的人。他们真心相信浊潮是新的天。', tip: '魔抗低，近身即溃。' },
  { key: 'priest', kind: 'beast', name: '巫祝', lore: '给浊潮唱赞歌的老妇。她的歌确实能让伤者站起来——这才是最难办的。', tip: '先杀她，别让她唱完第二轮。' },
  { key: 'rogue', kind: 'beast', name: '影盗', lore: '赤砂关里谁的账都敢偷的人，与墨鸦同出一门。', tip: '孤身时回避极高，围住再打。' },
  { key: 'elite', kind: 'beast', name: '浊甲卫', lore: '披着浊潮凝成的甲，甲上还长着词缀。像一件会走路的伤。', tip: '站在己方阵眼上攻击可以破盾。' },
  /* —— 灵兽 3 —— */
  { key: 'ally_wolf', kind: 'spirit', name: '山灵狼', lore: '阿蛮召来的第一只兽。它记得她的味道，不记得别人的。', tip: '猛攻：伤害 +2、护甲 -2；守御：护甲 +3、回避 +10。' },
  { key: 'ally_leopard', kind: 'spirit', name: '云豹', lore: '云梦泽的独行客。被召来时先嗅一下空气，再决定站哪一边。', tip: '随行指令下会替相邻友军挡下第一次攻击。' },
  { key: 'ally_baize', kind: 'spirit', name: '白泽', lore: '传说里认得天下所有妖怪的兽。它认得，但它不说。', tip: '神兽三阶，猛攻伤害 +4；飞行单位，可越地形。' },
  /* —— 精英词缀 4 —— */
  { key: 'affix_shield', kind: 'elite', name: '护盾', lore: '浊潮凝的壳。壳在，里面的东西就不算真的受伤。', tip: '受伤 -30%；站在己方阵眼上攻击可破盾。' },
  { key: 'affix_regen', kind: 'elite', name: '自愈', lore: '伤口会自己长回去。浊潮最不讲道理的地方就在这。', tip: '每回合开始回复 10% 最大生命，别拖。' },
  { key: 'affix_aura', kind: 'elite', name: '光环', lore: '它站着，周围的同类就都看得更准。', tip: '周围 2 格友军命中 +10，先杀带光环的那只。' },
  { key: 'affix_berserk', kind: 'elite', name: '狂暴', lore: '半血之后才是它真正的样子。', tip: '半血后攻速 +3，会被追击——别留残血单位在它面前。' },
  /* —— 首领 12 —— */
  { key: 'shanxiao', kind: 'boss', name: '山魈王', lore: '青岚山的旧主。它守的不是山门，是山门后面那些还没跑掉的人。', tip: '二阶段会召来群魈，先清小怪再压血。' },
  { key: 'bamboo', kind: 'boss', name: '竹妖', lore: '雾隐竹海里长了一千年的东西。它记得每一个砍过竹子的人。', tip: '木属性，火咒有克制。' },
  { key: 'waterghost', kind: 'boss', name: '水鬼', lore: '断桥下拖着人脚踝的手。它自己也不知道为什么要拖。', tip: '水属性，站在岸上打，别下水。' },
  { key: 'chisha', kind: 'boss', name: '赤砂将军', lore: '赤砂关最后一任守将。城破那夜他没走，就成了现在这样。', tip: '火属性，重甲，破甲兵装优先。' },
  { key: 'icexiao', kind: 'boss', name: '冰魈', lore: '玄冰祭坛的看门人。它把每个闯进来的人都冻在墙上，排得很整齐。', tip: '冰面会滑行，注意落点。' },
  { key: 'swampdragon', kind: 'boss', name: '沼龙', lore: '云梦泽底下翻身的东西。它一翻身，半个泽的水就浑了。', tip: '土属性，远程消耗优于贴身。' },
  { key: 'turbidgeneral', kind: 'boss', name: '浊将', lore: '被浊潮吃空了的将军。甲还在，人在里面已经没有了。', tip: '带词缀，破盾后再打本体。' },
  { key: 'xuanque', kind: 'boss', name: '玄阙', lore: '上一代最强的守脉人，云策的授业恩师。他不是在杀人，他是在做算术。', tip: '二阶段换心，先断他的阵眼供给。' },
  { key: 'forestmaster', kind: 'boss', name: '林魈主', lore: '血槲林里所有槲树的意志。树不会追人，但树会等人。', tip: '木属性，火咒连烧两回合。' },
  { key: 'bridgewraith', kind: 'boss', name: '桥魅', lore: '渡厄桥的怨。过桥的人越多，它就越记得自己没过去。', tip: '水属性，别让它在水格上回复。' },
  { key: 'valleydragon', kind: 'boss', name: '谷螭', lore: '断魂谷里的无角小龙。它不咬人，它只把谷口堵上。', tip: '土属性，堵路时优先清两侧。' },
  { key: 'tidewyrm', kind: 'boss', name: '浪蛟', lore: '沧浪津的浪是它翻的。它一停，津口就静得吓人。', tip: '水属性，站在高处打有命中加成。' },
  /* —— 遗迹 2 —— */
  { key: 'ruin_5A', kind: 'ruin', name: '玄冰祭坛', chapter: '5A', lore: '祭坛底下压着一条主脉的脉眼。冰不是天冷结的，是脉在喘。', tip: '冰面滑行会改变站位，进图先看地形。' },
  { key: 'ruin_8', kind: 'ruin', name: '天柱废墟', chapter: '8', lore: '补天遗族最后立起的一根柱子。它断了，但断口还朝着天。', tip: '三处阵眼要同时守住三个己方阶段。' }
];

function codexEntry(key) {
  return CODEX.find(e => e.key === key) || null;
}

/* ============================================================
 * 新手引导（P4）：一次性提示，key 记进 campaign.hintsSeen。
 * 文案要短（一条 toast，五秒读完），说「怎么做」不说「是什么」；
 * 别写成教程——玩家是在打仗，不是在上课。
 * ============================================================ */
const HINTS = {
  move: '点自己的单位，再点高亮格移动。移动后还能攻击，或点「结束行动」。',
  node: '阵眼：结束行动时停在阵眼上即可占领；驻守两个己方阶段会升阶，脉流效果翻倍。',
  rewind: '打错了按「悔棋」退回上一个己方阶段，每章次数有限——不用靠读档硬撑。',
  talk: '可招募的人（青萝、白鹭这类）让云策站到旁边，用「说得」劝过来。',
  chain: '两人相邻时可发动连携：一人攻击，另一人补一刀。每单位每回合一次。'
};

/* 点播表：第几个我方回合弹哪一条。第 1 回合让位给章节目标提示，从第 2 回合起各一条。 */
const HINT_TURNS = { 2: 'move', 3: 'node', 4: 'rewind', 5: 'talk', 6: 'chain' };

/* ============================================================
 * 机制说明库（P4.6）：营地「机制」页签，四组约 30 条。
 * 铁律：**文案里的每个数字都必须与常量一致**——图鉴那次照着设计
 * 文档写、没查常量，三条数值全错。formulas 第 35 节把本文的
 * 关键数字逐个绑到常量/源码上，改文案先过那节测试。
 * ============================================================ */
const MECHANICS_GROUPS = { field: '战场', combat: '战斗', growth: '成长', campaign: '战役' };

const MECHANICS = [
  /* ---- 战场 ---- */
  { id: 'terrain', group: 'field', title: '地形与移动',
    body: '草地、木桥、渡口、古匣等消耗 1 点行动力；疏林、丘壑、残垣消耗 2 点，分别提供回避 +20 / +15 / +10 与护甲 +1。深水与山岩步行不可通行，飞行单位可以越过。站在有加成的格子上作战，回避与护甲按所在地形结算。' },
  { id: 'ice', group: 'field', title: '冰面滑行',
    body: '踏入冰面会沿进入方向一路滑到底，遇到障碍、其它单位或非冰面才停。滑行不预览路径，落点需要二次确认。用得好一个回合穿越整条冰带，用不好会滑进包围圈。' },
  { id: 'nodes', group: 'field', title: '阵眼四脉',
    body: '攻脉：三格内友军命中 +15、暴击 +5。生脉：每个己方阶段开始时，三格内友军回复 8 点生命。行脉：三格内友军移动 +1。护脉：两格内友军护甲与魔抗 +3。我方站在自家阵眼上命中带盾敌军，可以破盾。' },
  { id: 'node_tier', group: 'field', title: '阵眼占领与升阶',
    body: '结束行动时停在阵眼上即占领，下个己方阶段起脉流生效。连续驻守：每满 2 个己方阶段升 1 阶，最高 3 阶，效果按阶倍增；被敌军夺取则阶数清零。' },
  { id: 'fog', group: 'field', title: '危险范围与雾战',
    body: '顶栏可随时切换全军危险范围（敌军一回合内可达的格子），进攻前先看红色区。雾战章节里，敌军只有进入视野后才可见——探路要留后手。' },
  { id: 'facilities', group: 'field', title: '战场设施',
    body: '村庄：访问得盘缠与道具，有的村子里藏着愿意同行的人。古匣：开匣得兵装道具。残祠：参拜回复生命。渡口：突围类目标的制压点，云策踏上即完成。访问类行动都会消耗本次行动。' },
  { id: 'talk', group: 'field', title: '说得',
    body: '名字泛金、带「!」标记的敌军可以「说得」。我方角色相邻后使用说得，播完对白即加入我方（不占登场位），并消耗本次行动。把敌人变成同伴，是填平人员缺口的另一条路。' },

  /* ---- 战斗 ---- */
  { id: 'hit', group: 'combat', title: '命中（2RN）',
    body: '命中率 = 武器命中 + 技巧×2 + 幸运÷2 + 各类加成，减去对方的（速度×2 + 幸运 + 地形回避）。判定取两次随机的均值（2RN），所以面板显示 90% 的命中，实际比 90% 更稳；反之低命中也比看起来更糟。' },
  { id: 'triangle', group: 'combat', title: '武器三角',
    body: '剑克重刃、重刃克枪、枪克剑：占优时命中 +15、威力 +2，被克时全部反向。弓、咒、符、匕、杖、爪、谣不参与三角。' },
  { id: 'double', group: 'combat', title: '攻击速度与追击',
    body: '主动攻击时攻速比对方高 4 点以上，会追加一次追击。反击不触发追击。速度是双方都值钱的属性，差 4 点就是一次白打。' },
  { id: 'crit', group: 'combat', title: '必杀',
    body: '必杀率 = 武器必杀 + 技巧÷2 + 各类加成 − 对方幸运，单次随机判定，暴击伤害 ×3。幸运同时压低被必杀率，是最便宜的防御属性。' },
  { id: 'effective', group: 'combat', title: '特效',
    body: '弓对飞行、符对重甲，伤害 ×2。目标的标签（猛兽 / 飞行 / 重甲 / 草木 / 亡灵）在单位卡和横版演出的弱点条上都能看到，背包里常备一把对空的弓不亏。' },
  { id: 'support', group: 'combat', title: '羁绊支援',
    body: '两人在我方阶段结束时**相邻**，羁绊 +4 点（90 封顶）。C 需 20 点、B 需 50 点、A 需 90 点；作战时相距 3 格内即按等级提供命中 / 回避 +5 / +10 / +15，必杀 / 被必杀 +3 / +5 / +8。12 组支援各有专属对白，A 级还能了断心结。' },
  { id: 'spells', group: 'combat', title: '五行法术',
    body: '金 → 木 → 土 → 水 → 火 → 金：法术克敌属性时伤害 ×1.25，被克 ×0.8。法术按次数使用、每章重置；范围法术逐目标结算命中与暴击。按角色等级与职业习得，部分首领也会持法。' },
  { id: 'affixes', group: 'combat', title: '精英词缀',
    body: '护盾：受伤 −30%，我方站在己方阵眼上攻击可破盾（破盾持续约一回合）。自愈：每回合开始回复 10% 生命。光环：周围两格友军命中 +10。狂暴：生命低于一半时攻速 +3。词缀在单位卡与横版弱点条上标注。' },
  { id: 'command', group: 'combat', title: '指挥技与连携',
    body: '云策的指挥技每章各一次：号令（3 格内友军本回合可再行动，含已行动者）、集火（指定目标，友军本回合对其命中 +15）、坚守（3 格内友军受伤 −20%）。连携：攻击命中后，2 格内尚未行动的友军可追加一次攻击，无反击、无经验。' },

  /* ---- 成长 ---- */
  { id: 'promote', group: 'growth', title: '转职',
    body: '等级 10 可转职，消耗脉印、两条路线二选一：12 个基础职业全部双线，加成与职业技能不同。转职不降级，晚转不如早转——但继承位只有两个，想清楚再按。' },
  { id: 'inherit', group: 'growth', title: '技能继承',
    body: '转职时原职业的一项技能会被写进继承栏：最多保留 2 条，超出按先进先出淘汰；与现有技能同名时取较高值。个人技不占继承位。' },
  { id: 'rank', group: 'growth', title: '武器熟练度',
    body: '每类武器按出手次数成长：累计 40 次升一阶（C → B → A → S），跨章节累加，每章每类最多升一阶，S 封顶。阶位不够时，进阶兵装会装备不上——转职前先看看熟练度。' },
  { id: 'weapons', group: 'growth', title: '兵装三层',
    body: '强化 +3：每级威力 +1、命中 +3，+3 额外必杀 +5，消耗材料与盘缠。进化：铁 → 钢 → 银 / 名器，保留强化等级、耐久刷满、装备位不变。传说 7 把：Boss 战掉落，基础 3%，每次未掉 +3%（封顶 25%），累计 12 次未掉必掉，二周目起每周目 +5%；不可打造，多词条加技能。' },
  { id: 'summon', group: 'growth', title: '召唤',
    body: '场上同时最多 2 只召唤兽，每个召唤技能每章次数有限。三态指令随时切换（不消耗行动）：猛攻（伤害 +2、护甲 −2，主动逼近最近敌军）、守御（护甲 +3、回避 +10，原地待命）、随行（跟随召唤者，替相邻友军挡下第一次攻击）。' },
  { id: 'death', group: 'growth', title: '永久死亡与传承',
    body: '经典永久死亡：云策阵亡即章节失败，其它人倒下后不再归来。阵亡者会把一条个人技（或继承技）传给羁绊最高的存活者；传说兵装需类型相符、熟练度足够才随传承，否则封存进行囊。营地「英魂」页签记下每个人的殁章、遗言与传承去向。' },
  { id: 'heroic', group: 'growth', title: '勇者模式',
    body: '与难度正交的独立挑战：敌军 ×1.15、经验 ×0.9、悔棋 0 次、不显示战斗预测，通关授「勇者」徽。与修罗叠加约 ×1.32——那是另一个游戏，想清楚再开。' },

  /* ---- 战役 ---- */
  { id: 'difficulty', group: 'campaign', title: '三档难度',
    body: '轻松：敌军 ×0.90、敌等级 −1、经验 ×1.10、每章悔棋 3 次。标准：敌军 ×1.00、经验 ×1.00、每章悔棋 3 次。修罗：敌军 ×1.15、敌等级 +1、经验 ×0.95、不能悔棋。' },
  { id: 'route', group: 'campaign', title: 'A/B 路线',
    body: '第 4 章末「追与守」二选一，选定后不可更改：A 焚脉·追、B 守脉·守，各 3 章，第 8 章天柱废墟汇合。两条线的地图、同伴与剧情都不同，被放弃的那条会化成心结。' },
  { id: 'knots', group: 'campaign', title: '心结',
    body: '没选的那条路会化成对应同伴的心结：命中 −5。在营地把对应支援练到 A 级即可了断；全部解开后，终章全队命中 +5、必杀 +5。' },
  { id: 'endings', group: 'campaign', title: '多结局',
    body: '终章按存活人数、A 级羁绊数与阵眼控制判定三档尾声：灵脉重燃（存活 ≥8、A 级 ≥3、三阵眼全控）、山河如旧（存活 ≥5 或 A 级 ≥1）、永夜（其余）。行录记录已达成的结局。' },
  { id: 'rewind', group: 'campaign', title: '悔棋与续战',
    body: '每章可悔棋 3 次（修罗 0 次），逐次回到上一个我方阶段开始，随机数状态完整恢复。切后台、关闭页面会自动写入续战存档，回来选「继续旅程」即可接续。' },
  { id: 'codex', group: 'campaign', title: '山海图鉴',
    body: '29 条分五类：妖兽 8、灵兽 3、精英词缀 4、首领 12、遗迹 2。击破敌人解锁敌型与词缀条目，通关对应章节解锁遗迹条目；每条含异闻小传与实战弱点。' },
  { id: 'save', group: 'campaign', title: '存档与周目',
    body: '战役进度、续战存档与设置分三个本地键存放（v4），版本不兼容的旧档会引导开新旅程。二周目保留周目数（传说掉率 +5%/周目），缘值与持有重新计数。' }
];

function mechanicsByGroup(group) {
  return MECHANICS.filter(m => m.group === group);
}

if (typeof window !== 'undefined') {
  window.CODEX = CODEX;
  window.CODEX_KINDS = CODEX_KINDS;
  window.HINTS = HINTS;
  window.MECHANICS = MECHANICS;
  window.MECHANICS_GROUPS = MECHANICS_GROUPS;
}
