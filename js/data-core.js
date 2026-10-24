/* ============================================================
 * 山海策 · 灵脉  —  数据层：基础规则 / 职业 / 武器 / 人物 / 敌人
 * 纯静态、无模块：所有脚本按顺序挂到 window。
 * ============================================================ */

const GAME_TITLE = '山海策';
const GAME_SUBTITLE = '灵 脉';
const SAVE_VERSION = 3;

const RANK_ORDER = { D: 0, C: 1, B: 2, A: 3, S: 4 };
const RANK_NAMES = ['D', 'C', 'B', 'A', 'S'];
const TRIANGLE = { sword: 'axe', axe: 'lance', lance: 'sword' };
const TRIANGLE_NAMES = { sword: '剑', axe: '重刃', lance: '枪' };

const WEAPON_TYPES = {
  sword: { name: '剑', icon: '剑' },
  axe: { name: '重刃', icon: '刃' },
  lance: { name: '枪', icon: '枪' },
  bow: { name: '弓', icon: '弓' },
  tome: { name: '咒', icon: '咒' },
  talisman: { name: '符', icon: '符' },
  dagger: { name: '匕', icon: '匕' },
  staff: { name: '杖', icon: '杖' },
  beast: { name: '爪', icon: '爪' }
};

const STAT_NAMES = {
  hp: '生命', str: '力量', mag: '灵力', skl: '技巧',
  spd: '速度', lck: '幸运', def: '护甲', res: '魔抗', mov: '移动'
};
const STAT_ORDER = ['hp', 'str', 'mag', 'skl', 'spd', 'lck', 'def', 'res'];

const STAT_CAPS = { hp: 60, str: 30, mag: 30, skl: 30, spd: 30, lck: 30, def: 30, res: 30, mov: 10 };

const DIFFICULTIES = {
  easy: {
    key: 'easy', name: '轻松', enemyMul: 0.9, enemyLv: -1, rewinds: 3, expMul: 1.1,
    desc: '敌军稍弱，每章可悔棋 3 次。适合初次接触战棋。'
  },
  normal: {
    key: 'normal', name: '标准', enemyMul: 1, enemyLv: 0, rewinds: 3, expMul: 1,
    desc: '原汁原味的山海行旅。每章可悔棋 3 次。'
  },
  hard: {
    key: 'hard', name: '修罗', enemyMul: 1.15, enemyLv: 1, rewinds: 0, expMul: 0.95,
    desc: '敌军更强，且无法悔棋。每一步都不可回头。'
  }
};

/* ---------------- 地形 ----------------
 * avoid：回避加成；def：物理减伤；heal：己方阶段开始回复比例；
 * cost：步行移动消耗；flyCost：飞行消耗；blocked：步行不可进入。
 */
const TERRAIN = {
  '.': { key: '.', name: '草地', cost: 1, flyCost: 1, avoid: 0, def: 0, color: '#cfc7ae' },
  f: { key: 'f', name: '疏林', cost: 2, flyCost: 1, avoid: 20, def: 1, color: '#9aa887' },
  h: { key: 'h', name: '丘壑', cost: 2, flyCost: 1, avoid: 15, def: 1, color: '#c2b189' },
  '~': { key: '~', name: '深水', cost: 99, flyCost: 1, avoid: 0, def: 0, blocked: true, water: true, color: '#9fb7b7' },
  '=': { key: '=', name: '木桥', cost: 1, flyCost: 1, avoid: 0, def: 0, color: '#bfa17a' },
  M: { key: 'M', name: '山岩', cost: 99, flyCost: 1, avoid: 30, def: 2, blocked: true, mountain: true, color: '#a49b8b' },
  r: { key: 'r', name: '残垣', cost: 2, flyCost: 1, avoid: 10, def: 1, color: '#b8ac97' },
  v: { key: 'v', name: '村庄', cost: 1, flyCost: 1, avoid: 10, def: 0, color: '#d8bf93' },
  F: { key: 'F', name: '营垒', cost: 1, flyCost: 1, avoid: 20, def: 2, heal: 0.1, color: '#cbbd9b' },
  G: { key: 'G', name: '渡口', cost: 1, flyCost: 1, avoid: 10, def: 0, color: '#c7b48d' },
  L: { key: 'L', name: '灵脉阵眼', cost: 1, flyCost: 1, avoid: 10, def: 0, color: '#b9c9bd' },
  C: { key: 'C', name: '古匣', cost: 1, flyCost: 1, avoid: 0, def: 0, color: '#cfa86a' },
  S: { key: 'S', name: '残祠', cost: 1, flyCost: 1, avoid: 10, def: 0, color: '#c3b8ce' },
  E: { key: 'E', name: '退路', cost: 1, flyCost: 1, avoid: 0, def: 0, color: '#a9c3cf' },
  I: { key: 'I', name: '冰面', cost: 1, flyCost: 1, avoid: 0, def: 0, slide: true, color: '#dff0f7' }
};

/* ---------------- 武器 ----------------
 * rng: [最小射程, 最大射程]；uses: 耐久；price: 购入价。
 * magic 决定使用 mag 还是 str；effective 列出生效目标标签。
 */
const WEAPONS = {
  qinglan: { key: 'qinglan', name: '青岚剑', type: 'sword', rank: 'C', mt: 8, hit: 95, crit: 10, wt: 4, rng: [1, 1], uses: 40, price: 1800, desc: '青岚宗守脉人的佩剑，剑脊有细如叶脉的纹。', unique: 'yunce' },
  iron_sword: { key: 'iron_sword', name: '铁剑', type: 'sword', rank: 'D', mt: 5, hit: 90, crit: 0, wt: 5, rng: [1, 1], uses: 35, price: 480, desc: '山道间最常见的制式长剑。' },
  steel_sword: { key: 'steel_sword', name: '钢剑', type: 'sword', rank: 'C', mt: 8, hit: 80, crit: 0, wt: 9, rng: [1, 1], uses: 25, price: 900, desc: '刃口厚重，出手稍慢。' },
  silver_sword: { key: 'silver_sword', name: '银剑', type: 'sword', rank: 'B', mt: 11, hit: 85, crit: 5, wt: 7, rng: [1, 1], uses: 20, price: 1800, desc: '以月银淬成，斩妖如裂帛。' },

  iron_blade: { key: 'iron_blade', name: '铁重刃', type: 'axe', rank: 'D', mt: 8, hit: 75, crit: 0, wt: 10, rng: [1, 1], uses: 30, price: 520, desc: '宽刃厚背，专破山石与甲胄。' },
  steel_blade: { key: 'steel_blade', name: '钢重刃', type: 'axe', rank: 'C', mt: 12, hit: 65, crit: 0, wt: 14, rng: [1, 1], uses: 20, price: 1000, desc: '势大力沉，一击可断石。' },
  silver_blade: { key: 'silver_blade', name: '银重刃', type: 'axe', rank: 'B', mt: 15, hit: 70, crit: 0, wt: 16, rng: [1, 1], uses: 15, price: 2000, desc: '银纹重刃，山岳卫的镇关之器。' },

  iron_lance: { key: 'iron_lance', name: '铁枪', type: 'lance', rank: 'D', mt: 7, hit: 80, crit: 0, wt: 8, rng: [1, 1], uses: 30, price: 500, desc: '轻骑惯用的长枪。' },
  steel_lance: { key: 'steel_lance', name: '钢枪', type: 'lance', rank: 'C', mt: 10, hit: 70, crit: 0, wt: 12, rng: [1, 1], uses: 20, price: 950, desc: '枪尖沉铁，破阵最宜。' },
  javelin: { key: 'javelin', name: '投枪', type: 'lance', rank: 'D', mt: 5, hit: 65, crit: 0, wt: 9, rng: [1, 2], uses: 20, price: 700, desc: '可掷出的短枪，射程更远。' },
  silver_lance: { key: 'silver_lance', name: '银枪', type: 'lance', rank: 'B', mt: 12, hit: 75, crit: 0, wt: 11, rng: [1, 1], uses: 18, price: 1900, desc: '枪身如游龙，是白鹭梦寐以求之物。' },

  iron_bow: { key: 'iron_bow', name: '铁弓', type: 'bow', rank: 'D', mt: 6, hit: 85, crit: 0, wt: 5, rng: [2, 2], uses: 30, price: 600, desc: '山林猎户的硬弓。', effective: ['flying'] },
  steel_bow: { key: 'steel_bow', name: '钢弓', type: 'bow', rank: 'C', mt: 9, hit: 75, crit: 0, wt: 8, rng: [2, 2], uses: 20, price: 1100, desc: '弦如铁线，开弓需臂力。', effective: ['flying'] },
  wind_bow: { key: 'wind_bow', name: '逐风弓', type: 'bow', rank: 'B', mt: 7, hit: 90, crit: 10, wt: 4, rng: [2, 2], uses: 25, price: 2200, desc: '轻若竹枝，专射云端妖魔。', effective: ['flying'] },

  ice_tome: { key: 'ice_tome', name: '冰咒', type: 'tome', rank: 'D', mt: 6, hit: 90, crit: 0, wt: 5, rng: [1, 2], uses: 25, price: 650, desc: '凝水成冰的入门咒诀。', magic: true },
  thunder_tome: { key: 'thunder_tome', name: '雷咒', type: 'tome', rank: 'C', mt: 9, hit: 80, crit: 5, wt: 8, rng: [1, 2], uses: 20, price: 1200, desc: '引下三寸雷火，灼尽邪祟。', magic: true },
  frost_tome: { key: 'frost_tome', name: '霜咒', type: 'tome', rank: 'B', mt: 12, hit: 85, crit: 5, wt: 7, rng: [1, 2], uses: 18, price: 2100, desc: '一页霜纹，可冻十里寒川。', magic: true },

  spirit_talisman: { key: 'spirit_talisman', name: '灵符', type: 'talisman', rank: 'D', mt: 6, hit: 85, crit: 0, wt: 4, rng: [1, 2], uses: 25, price: 620, desc: '朱砂符纸，专克石甲。', magic: true, effective: ['armor'] },
  greater_talisman: { key: 'greater_talisman', name: '大灵符', type: 'talisman', rank: 'C', mt: 9, hit: 80, crit: 0, wt: 7, rng: [1, 2], uses: 20, price: 1150, desc: '三重符阵叠成，雷火更盛。', magic: true, effective: ['armor'] },

  dagger: { key: 'dagger', name: '匕首', type: 'dagger', rank: 'D', mt: 4, hit: 95, crit: 10, wt: 3, rng: [1, 1], uses: 30, price: 450, desc: '短小无声，割甲如纸。', debuff: { def: 2, res: 2, turns: 1 } },
  shadow_dagger: { key: 'shadow_dagger', name: '影刃', type: 'dagger', rank: 'B', mt: 7, hit: 90, crit: 20, wt: 4, rng: [1, 1], uses: 20, price: 1700, desc: '刃上无光，出手时人已不见。', debuff: { def: 2, res: 2, turns: 1 } },

  heal_staff: { key: 'heal_staff', name: '治疗杖', type: 'staff', rank: 'D', mt: 0, hit: 100, crit: 0, wt: 3, rng: [1, 1], uses: 20, price: 600, desc: '引草木生气，愈合轻伤。', heal: 10, magic: true },
  greater_heal_staff: { key: 'greater_heal_staff', name: '灵愈杖', type: 'staff', rank: 'C', mt: 0, hit: 100, crit: 0, wt: 5, rng: [1, 1], uses: 15, price: 1200, desc: '以灵脉之水洗伤，续命于须臾。', heal: 20, magic: true },

  beast_claw: { key: 'beast_claw', name: '山灵爪', type: 'beast', rank: 'S', mt: 7, hit: 85, crit: 0, wt: 4, rng: [1, 1], uses: 99, price: 0, desc: '阿蛮与山灵共生的爪印。' },
  wolf_claw: { key: 'wolf_claw', name: '山灵牙', type: 'beast', rank: 'S', mt: 6, hit: 90, crit: 5, wt: 3, rng: [1, 1], uses: 99, price: 0, desc: '召唤而来的山灵，牙爪带风。' },

  /* 敌军武器（无耐久消耗） */
  bandit_axe: { key: 'bandit_axe', name: '山斧', type: 'axe', rank: 'D', mt: 7, hit: 80, crit: 0, wt: 7, rng: [1, 1], uses: 99, price: 0, desc: '劫道者的粗斧。' },
  heavy_axe: { key: 'heavy_axe', name: '重斧', type: 'axe', rank: 'C', mt: 11, hit: 65, crit: 0, wt: 12, rng: [1, 1], uses: 99, price: 0, desc: '双手才能抡起的巨斧。' },
  wolf_fang: { key: 'wolf_fang', name: '妖牙', type: 'beast', rank: 'D', mt: 6, hit: 90, crit: 5, wt: 3, rng: [1, 1], uses: 99, price: 0, desc: '浊气侵体后生出的獠牙。' },
  raven_beak: { key: 'raven_beak', name: '妖喙', type: 'beast', rank: 'D', mt: 6, hit: 85, crit: 5, wt: 2, rng: [1, 1], uses: 99, price: 0, desc: '妖鸟俯冲时的尖喙。' },
  dark_tome: { key: 'dark_tome', name: '浊咒', type: 'tome', rank: 'D', mt: 5, hit: 78, crit: 0, wt: 5, rng: [1, 2], uses: 99, price: 0, desc: '以浊潮为源的咒术。', magic: true },
  poison_dagger: { key: 'poison_dagger', name: '毒匕', type: 'dagger', rank: 'C', mt: 5, hit: 90, crit: 10, wt: 3, rng: [1, 1], uses: 99, price: 0, desc: '刃上淬着沼泽的毒。', debuff: { def: 2, res: 2, turns: 1 } },
  turbid_lance: { key: 'turbid_lance', name: '浊枪', type: 'lance', rank: 'C', mt: 9, hit: 75, crit: 0, wt: 10, rng: [1, 1], uses: 99, price: 0, desc: '枪尖凝着黑浊。' },
  boss_axe: { key: 'boss_axe', name: '山魈巨斧', type: 'axe', rank: 'B', mt: 9, hit: 70, crit: 5, wt: 14, rng: [1, 1], uses: 99, price: 0, desc: '山魈王以整块青石磨成的巨斧。' },
  boss_vine: { key: 'boss_vine', name: '妖枝', type: 'talisman', rank: 'C', mt: 9, hit: 85, crit: 0, wt: 5, rng: [1, 2], uses: 99, price: 0, desc: '竹妖抽出的带刺藤枝。', magic: true },
  boss_trident: { key: 'boss_trident', name: '水鬼叉', type: 'lance', rank: 'C', mt: 10, hit: 80, crit: 0, wt: 9, rng: [1, 2], uses: 99, price: 0, desc: '从沉船里捞出的三股叉。' },
  boss_saber: { key: 'boss_saber', name: '赤砂刀', type: 'sword', rank: 'B', mt: 13, hit: 80, crit: 5, wt: 9, rng: [1, 1], uses: 99, price: 0, desc: '赤砂将军的佩刀，刀身赤红。' },
  boss_claw: { key: 'boss_claw', name: '冰魈爪', type: 'beast', rank: 'B', mt: 12, hit: 85, crit: 5, wt: 6, rng: [1, 1], uses: 99, price: 0, desc: '凝着冰霜的巨爪。' },
  boss_jaw: { key: 'boss_jaw', name: '沼龙牙', type: 'beast', rank: 'B', mt: 13, hit: 80, crit: 5, wt: 9, rng: [1, 1], uses: 99, price: 0, desc: '沼泽深处咬碎过无数舟楫。' },
  boss_turbid: { key: 'boss_turbid', name: '浊将矛', type: 'lance', rank: 'A', mt: 15, hit: 80, crit: 5, wt: 12, rng: [1, 1], uses: 99, price: 0, desc: '浊潮凝成的长矛。' },
  boss_ritual: { key: 'boss_ritual', name: '引脉咒', type: 'tome', rank: 'A', mt: 14, hit: 85, crit: 5, wt: 8, rng: [1, 2], uses: 99, price: 0, desc: '国师玄阙抽取灵脉的禁咒。', magic: true },
  beast_ritual: { key: 'beast_ritual', name: '噬脉', type: 'tome', rank: 'S', mt: 18, hit: 85, crit: 10, wt: 10, rng: [1, 2], uses: 99, price: 0, desc: '噬脉兽吞噬灵脉后的吐息。', magic: true }
};

const ITEMS = {
  potion: { key: 'potion', name: '金创药', kind: 'heal', heal: 12, uses: 3, price: 120, desc: '草药捣成的伤药，回复 12 点生命。', icon: '药' },
  herb: { key: 'herb', name: '灵草', kind: 'heal', heal: 20, uses: 2, price: 220, desc: '带露的灵草，回复 20 点生命。', icon: '草' },
  elixir: { key: 'elixir', name: '回春丹', kind: 'heal', heal: 40, uses: 1, price: 360, desc: '一粒回春，回复 40 点生命。', icon: '丹' },
  seal: { key: 'seal', name: '脉印', kind: 'seal', uses: 1, price: 1400, desc: '以灵脉石磨成的印，十级后可转职。', icon: '印' }
};

/* ---------------- 职业 ---------------- */
const CLASSES = {
  swordsman: {
    name: '剑客', tier: 1, moveType: 'foot', move: 5, weapons: ['sword'],
    skill: { name: '剑术精通', desc: '装备剑时命中 +10。', hit: 10, weapon: 'sword' },
    promote: 'swordmaster', promoGain: { hp: 4, str: 2, skl: 3, spd: 3, def: 2, res: 1 },
    promoRanks: { sword: 1 }, desc: '以快制慢，剑走轻灵。'
  },
  swordmaster: {
    name: '剑圣', tier: 2, moveType: 'foot', move: 6, weapons: ['sword'],
    skill: { name: '剑心通明', desc: '装备剑时命中 +15、暴击 +5。', hit: 15, weapon: 'sword', crit: 5 },
    desc: '剑与心合，落叶可斩。'
  },
  axeman: {
    name: '重刃', tier: 1, moveType: 'armor', move: 4, weapons: ['axe'], tags: ['armor'],
    skill: { name: '坚壁', desc: '护甲 +2。', def: 2 },
    promote: 'mountainwarden', promoGain: { hp: 6, str: 3, skl: 2, spd: 1, def: 4, res: 2 },
    promoRanks: { axe: 1 }, desc: '一步一山，重刃无锋。'
  },
  mountainwarden: {
    name: '山岳卫', tier: 2, moveType: 'armor', move: 4, weapons: ['axe'], tags: ['armor'],
    skill: { name: '不动如山', desc: '护甲 +4，生命上限额外成长。', def: 4 },
    desc: '身受千刃，仍立于关口。'
  },
  physician: {
    name: '医师', tier: 1, moveType: 'foot', move: 5, weapons: ['staff'],
    skill: { name: '仁心', desc: '杖治疗量 +5。', healBonus: 5 },
    promote: 'sagephysician', promoGain: { hp: 3, mag: 3, skl: 2, spd: 2, def: 1, res: 3 },
    promoRanks: { staff: 1 }, desc: '一杖草木，生死之间。'
  },
  sagephysician: {
    name: '灵枢医仙', tier: 2, moveType: 'foot', move: 5, weapons: ['staff'],
    skill: { name: '回春妙手', desc: '杖治疗量 +8，邻近友军回避 +8。', healBonus: 8, adjacentAllyAvoid: 8 },
    desc: '针落灵枢，枯木回春。'
  },
  archer: {
    name: '弓手', tier: 1, moveType: 'foot', move: 5, weapons: ['bow'],
    skill: { name: '狙神', desc: '未移动时命中 +15。', hitIfNoMove: 15 },
    promote: 'windranger', promoGain: { hp: 3, str: 2, skl: 3, spd: 3, def: 1, res: 2 },
    promoRanks: { bow: 1 }, desc: '静如岩，发如风。'
  },
  windranger: {
    name: '逐风射手', tier: 2, moveType: 'foot', move: 6, weapons: ['bow'],
    skill: { name: '穿云', desc: '未移动时命中 +20、暴击 +10；对飞行伤害不减。', hitIfNoMove: 20, critIfNoMove: 10, hitVsFlying: 15 },
    desc: '箭出无回，云开见月。'
  },
  lancer: {
    name: '枪骑', tier: 1, moveType: 'horse', move: 7, weapons: ['lance'],
    skill: { name: '冲锋', desc: '移动 +1。', move: 1 },
    promote: 'dragonrider', promoGain: { hp: 4, str: 2, skl: 2, spd: 3, def: 2, res: 2 },
    promoRanks: { lance: 1 }, desc: '马蹄如鼓，一枪破阵。'
  },
  dragonrider: {
    name: '游龙骑将', tier: 2, moveType: 'horse', move: 8, weapons: ['lance'],
    skill: { name: '游龙', desc: '移动 +1，移动 4 格以上时命中 +10。', move: 1, hitIfMoved4: 10 },
    desc: '枪走游龙，来去如潮。'
  },
  mage: {
    name: '术士', tier: 1, moveType: 'foot', move: 5, weapons: ['tome'],
    skill: { name: '霜寒领域', desc: '两格内敌军命中 -10。', enemyAuraHit: 10 },
    promote: 'frostweaver', promoGain: { hp: 3, mag: 3, skl: 2, spd: 2, def: 1, res: 4 },
    promoRanks: { tome: 1 }, desc: '一纸咒文，寒暑倒转。'
  },
  frostweaver: {
    name: '冰璃咒师', tier: 2, moveType: 'foot', move: 6, weapons: ['tome'],
    skill: { name: '寒川', desc: '两格内敌军命中 -15，命中后使其移动 -1。', enemyAuraHit: 15, movePenaltyOnHit: 1 },
    desc: '挥手成冰，河川止流。'
  },
  rogue: {
    name: '刺客', tier: 1, moveType: 'foot', move: 6, weapons: ['dagger'],
    skill: { name: '致命', desc: '暴击 +10。', crit: 10 },
    promote: 'nightblade', promoGain: { hp: 3, str: 2, skl: 3, spd: 4, def: 1, res: 2 },
    promoRanks: { dagger: 1 }, desc: '影里来，影里去。'
  },
  nightblade: {
    name: '影刃', tier: 2, moveType: 'foot', move: 7, weapons: ['dagger'],
    skill: { name: '无光', desc: '暴击 +15，回避 +5。', crit: 15, avoidFlat: 5 },
    desc: '刃不见光，命不见影。'
  },
  talisman: {
    name: '符师', tier: 1, moveType: 'foot', move: 5, weapons: ['talisman'],
    skill: { name: '破甲', desc: '对披甲目标命中 +20。', hitVsArmor: 20 },
    promote: 'thundermaster', promoGain: { hp: 3, mag: 3, skl: 3, spd: 2, def: 1, res: 3 },
    promoRanks: { talisman: 1 }, desc: '朱砂落纸，雷火听令。'
  },
  thundermaster: {
    name: '雷符真人', tier: 2, moveType: 'foot', move: 6, weapons: ['talisman'],
    skill: { name: '五雷正法', desc: '对披甲目标命中 +20、暴击 +10。', hitVsArmor: 20, critVsArmor: 10 },
    desc: '五雷齐落，山石皆开。'
  },
  beastcaller: {
    name: '兽使', tier: 1, moveType: 'foot', move: 5, weapons: ['beast'],
    skill: { name: '兽群', desc: '每章一次，可召唤一只山灵狼。', summon: true },
    promote: 'beastking', promoGain: { hp: 5, str: 3, skl: 2, spd: 2, def: 3, res: 2 },
    promoRanks: { beast: 1 }, desc: '与兽同息，山林皆友。'
  },
  beastking: {
    name: '山灵御兽', tier: 2, moveType: 'foot', move: 6, weapons: ['beast'],
    skill: { name: '万兽来朝', desc: '每章一次召唤更强的山灵狼，自身护甲 +2。', summon: 2, def: 2 },
    desc: '一声长啸，群山回应。'
  },
  wingman: {
    name: '羽人', tier: 1, moveType: 'flying', move: 6, weapons: ['bow', 'lance'], tags: ['flying'],
    skill: { name: '天羽', desc: '移动 +1。', move: 1 },
    promote: 'skyranger', promoGain: { hp: 3, str: 2, skl: 3, spd: 3, def: 1, res: 2 },
    promoRanks: { bow: 1, lance: 1 }, desc: '羽落无声，越岭如风。'
  },
  skyranger: {
    name: '天羽游侠', tier: 2, moveType: 'flying', move: 7, weapons: ['bow', 'lance'], tags: ['flying'],
    skill: { name: '凌风', desc: '移动 +1，回避 +10，对飞行目标命中 +15。', move: 1, avoidFlat: 10, hitVsFlying: 15 },
    desc: '云上是她的归路。'
  }
};

const PROMO_LEVEL = 10;
const MAX_LEVEL = 20;

/* ---------------- 人物 ---------------- */
const CHARS = {
  yunce: {
    id: 'yunce', name: '云策', cls: 'swordsman', level: 4, exp: 0, portrait: 'yunce',
    stats: { hp: 23, str: 8, mag: 0, skl: 9, spd: 9, lck: 7, def: 6, res: 3 },
    growth: { hp: 62, str: 45, mag: 5, skl: 55, spd: 50, lck: 40, def: 35, res: 25 },
    ranks: { sword: 'C' }, personal: { name: '守脉人', desc: '相邻友军命中与回避 +5；站在阵眼上时伤害 +2。', adjacentAllyHit: 5, adjacentAllyAvoid: 5, selfDamageOnNode: 2 },
    items: [{ key: 'qinglan', uses: 40 }, { key: 'iron_sword', uses: 35 }, { key: 'potion', uses: 3 }],
    bio: '青岚宗最后的守脉人。剑不出鞘时像个沉默的书生，出鞘后山风都会让路。'
  },
  yankui: {
    id: 'yankui', name: '岩隈', cls: 'axeman', level: 3, exp: 0, portrait: 'yankui',
    stats: { hp: 27, str: 9, mag: 0, skl: 4, spd: 4, lck: 3, def: 11, res: 1 },
    growth: { hp: 75, str: 55, mag: 0, skl: 30, spd: 25, lck: 25, def: 45, res: 15 },
    ranks: { axe: 'C' }, personal: { name: '山岳之骨', desc: '生命低于一半时护甲 +3。', defIfWounded: 3 },
    items: [{ key: 'iron_blade', uses: 30 }, { key: 'potion', uses: 3 }],
    bio: '青岚宗守山弟子，话少，饭量大。他说石头不会骗人，人比石头难懂。'
  },
  luming: {
    id: 'luming', name: '鹿鸣', cls: 'physician', level: 2, exp: 0, portrait: 'luming',
    stats: { hp: 18, str: 2, mag: 6, skl: 6, spd: 7, lck: 8, def: 3, res: 7 },
    growth: { hp: 45, str: 15, mag: 55, skl: 45, spd: 45, lck: 50, def: 20, res: 45 },
    ranks: { staff: 'C' }, personal: { name: '药心', desc: '相邻友军回避 +5。', adjacentAllyAvoid: 5 },
    items: [{ key: 'heal_staff', uses: 20 }, { key: 'potion', uses: 3 }, { key: 'herb', uses: 2 }],
    bio: '背着比人还高的药篓，走到哪里都能认出能入药的草。怕血，却从不后退。'
  },
  qingluo: {
    id: 'qingluo', name: '青萝', cls: 'archer', level: 3, exp: 0, portrait: 'qingluo',
    stats: { hp: 19, str: 5, mag: 0, skl: 8, spd: 8, lck: 6, def: 4, res: 4 },
    growth: { hp: 50, str: 35, mag: 0, skl: 60, spd: 55, lck: 40, def: 25, res: 25 },
    ranks: { bow: 'D' }, personal: { name: '鹰眼', desc: '对飞行目标命中 +20；未移动时暴击 +10。', hitVsFlying: 20, critIfNoMove: 10 },
    items: [{ key: 'iron_bow', uses: 30 }, { key: 'potion', uses: 3 }],
    bio: '青岚山下的猎户之女。她说射箭和看人一样，急不得，看准了再松手。'
  },
  bailu: {
    id: 'bailu', name: '白鹭', cls: 'lancer', level: 5, exp: 0, portrait: 'bailu',
    stats: { hp: 24, str: 8, mag: 0, skl: 7, spd: 7, lck: 5, def: 7, res: 3 },
    growth: { hp: 55, str: 45, mag: 0, skl: 45, spd: 40, lck: 35, def: 35, res: 20 },
    ranks: { lance: 'C' }, personal: { name: '踏浪', desc: '本回合移动 4 格以上时命中 +10。', hitIfMoved4: 10 },
    items: [{ key: 'iron_lance', uses: 30 }, { key: 'javelin', uses: 20 }, { key: 'potion', uses: 3 }],
    bio: '游历四方的骑将，曾在断桥边救下整村人。笑起来很响，心事却从不外露。'
  },
  xuanyi: {
    id: 'xuanyi', name: '玄漪', cls: 'mage', level: 5, exp: 0, portrait: 'xuanyi',
    stats: { hp: 19, str: 1, mag: 10, skl: 8, spd: 8, lck: 4, def: 3, res: 8 },
    growth: { hp: 40, str: 10, mag: 60, skl: 50, spd: 45, lck: 30, def: 20, res: 50 },
    ranks: { tome: 'C' }, personal: { name: '霜心', desc: '命中后使目标下回合移动 -1。', movePenaltyOnHit: 1 },
    items: [{ key: 'ice_tome', uses: 25 }, { key: 'potion', uses: 3 }],
    bio: '断桥古渡的守渡人，性子冷，咒也冷。她记得每一个渡河人的名字。'
  },
  moya: {
    id: 'moya', name: '墨鸦', cls: 'rogue', level: 7, exp: 0, portrait: 'moya',
    stats: { hp: 22, str: 7, mag: 0, skl: 10, spd: 12, lck: 7, def: 5, res: 4 },
    growth: { hp: 45, str: 40, mag: 0, skl: 60, spd: 65, lck: 50, def: 25, res: 25 },
    ranks: { dagger: 'B' }, personal: { name: '无影', desc: '相邻无友军时回避 +15。', avoidIfLone: 15 },
    items: [{ key: 'shadow_dagger', uses: 20 }, { key: 'potion', uses: 3 }],
    bio: '赤砂关里谁的账都敢偷的人。没人知道他从哪来，包括他自己。'
  },
  chisang: {
    id: 'chisang', name: '赤桑', cls: 'talisman', level: 8, exp: 0, portrait: 'chisang',
    stats: { hp: 23, str: 2, mag: 11, skl: 10, spd: 7, lck: 5, def: 5, res: 8 },
    growth: { hp: 45, str: 10, mag: 55, skl: 55, spd: 40, lck: 30, def: 25, res: 45 },
    ranks: { talisman: 'C' }, personal: { name: '引雷', desc: '对披甲目标暴击 +10。', critVsArmor: 10 },
    items: [{ key: 'spirit_talisman', uses: 25 }, { key: 'potion', uses: 3 }],
    bio: '玄冰祭坛的守符人，画符时从不说话。他说雷落下来之前，天地会先安静一瞬。'
  },
  aman: {
    id: 'aman', name: '阿蛮', cls: 'beastcaller', level: 9, exp: 0, portrait: 'aman',
    stats: { hp: 30, str: 11, mag: 4, skl: 7, spd: 6, lck: 4, def: 9, res: 4 },
    growth: { hp: 70, str: 55, mag: 10, skl: 40, spd: 35, lck: 25, def: 40, res: 20 },
    ranks: { beast: 'S' }, personal: { name: '兽语', desc: '山灵狼存活时自身伤害 +2。', selfDamageIfSummon: 2 },
    items: [{ key: 'beast_claw', uses: 99 }, { key: 'herb', uses: 2 }],
    bio: '云梦泽长大的兽使，能和山灵说话。她不太会说人的客套话，但会分你半只烤鱼。'
  },
  yunling: {
    id: 'yunling', name: '云翎', cls: 'wingman', level: 10, exp: 0, portrait: 'yunling',
    stats: { hp: 24, str: 8, mag: 2, skl: 11, spd: 12, lck: 7, def: 5, res: 6 },
    growth: { hp: 50, str: 40, mag: 10, skl: 60, spd: 60, lck: 40, def: 25, res: 35 },
    ranks: { bow: 'C', lance: 'D' }, personal: { name: '御风', desc: '站在阵眼上时回避 +15。', avoidOnNode: 15 },
    items: [{ key: 'iron_bow', uses: 30 }, { key: 'iron_lance', uses: 30 }, { key: 'potion', uses: 3 }],
    bio: '天柱废墟的羽人游侠，翅羽在月光下是银色的。她答应过一个人，要替他把山外的天看完。'
  }
};

const HERO_ORDER = ['yunce', 'yankui', 'luming', 'qingluo', 'bailu', 'xuanyi', 'moya', 'chisang', 'aman', 'yunling'];
const INITIAL_ROSTER = ['yunce', 'yankui', 'luming'];

/* ---------------- 敌人模板 ----------------
 * base 为 1 级基准；growth 为每级增量；实际属性在生成时叠加等级与难度。
 */
const ENEMY_TYPES = {
  bandit: {
    name: '山贼', ai: 'aggressive', moveType: 'foot', move: 5, weapons: ['bandit_axe'], tags: ['human'],
    base: { hp: 21, str: 7, mag: 0, skl: 4, spd: 4, lck: 2, def: 5, res: 1 },
    growth: { hp: 1.5, str: 0.55, mag: 0, skl: 0.35, spd: 0.3, lck: 0.15, def: 0.35, res: 0.1 }
  },
  wolf: {
    name: '妖狼', ai: 'aggressive', moveType: 'beast', move: 6, weapons: ['wolf_fang'], tags: ['beast'],
    base: { hp: 17, str: 6, mag: 0, skl: 6, spd: 8, lck: 3, def: 3, res: 1 },
    growth: { hp: 1.3, str: 0.45, mag: 0, skl: 0.5, spd: 0.55, lck: 0.2, def: 0.25, res: 0.15 }
  },
  armor: {
    name: '岩魈', ai: 'guard', moveType: 'armor', move: 4, weapons: ['heavy_axe'], tags: ['armor', 'beast'],
    base: { hp: 29, str: 9, mag: 0, skl: 3, spd: 2, lck: 2, def: 12, res: 2 },
    growth: { hp: 2, str: 0.6, mag: 0, skl: 0.3, spd: 0.15, lck: 0.1, def: 0.6, res: 0.15 }
  },
  bird: {
    name: '妖鸟', ai: 'aggressive', moveType: 'flying', move: 6, weapons: ['raven_beak'], tags: ['flying', 'beast'],
    base: { hp: 16, str: 5, mag: 0, skl: 6, spd: 10, lck: 4, def: 3, res: 3 },
    growth: { hp: 1.1, str: 0.4, mag: 0, skl: 0.5, spd: 0.6, lck: 0.25, def: 0.2, res: 0.2 }
  },
  shaman: {
    name: '浊咒徒', ai: 'aggressive', moveType: 'foot', move: 5, weapons: ['dark_tome'], tags: ['human'],
    base: { hp: 18, str: 1, mag: 7, skl: 6, spd: 5, lck: 3, def: 3, res: 6 },
    growth: { hp: 1.2, str: 0.1, mag: 0.65, skl: 0.45, spd: 0.35, lck: 0.2, def: 0.2, res: 0.5 }
  },
  priest: {
    name: '巫祝', ai: 'healer', moveType: 'foot', move: 5, weapons: ['heal_staff'], tags: ['human'],
    base: { hp: 17, str: 1, mag: 6, skl: 5, spd: 5, lck: 4, def: 2, res: 7 },
    growth: { hp: 1.1, str: 0.1, mag: 0.5, skl: 0.35, spd: 0.3, lck: 0.3, def: 0.15, res: 0.5 }
  },
  rogue: {
    name: '影盗', ai: 'aggressive', moveType: 'foot', move: 6, weapons: ['poison_dagger'], tags: ['human'],
    base: { hp: 19, str: 6, mag: 0, skl: 9, spd: 10, lck: 6, def: 4, res: 3 },
    growth: { hp: 1.2, str: 0.45, mag: 0, skl: 0.55, spd: 0.6, lck: 0.35, def: 0.2, res: 0.2 }
  },
  elite: {
    name: '浊甲卫', ai: 'guard', moveType: 'armor', move: 4, weapons: ['turbid_lance'], tags: ['armor', 'human'],
    base: { hp: 30, str: 10, mag: 0, skl: 5, spd: 3, lck: 2, def: 14, res: 4 },
    growth: { hp: 2.1, str: 0.65, mag: 0, skl: 0.4, spd: 0.2, lck: 0.1, def: 0.65, res: 0.3 }
  },

  /* ---- 首领 ---- */
  shanxiao: {
    name: '山魈王', ai: 'guard', moveType: 'beast', move: 5, weapons: ['boss_axe'], tags: ['beast'], boss: true,
    base: { hp: 38, str: 12, mag: 0, skl: 7, spd: 5, lck: 3, def: 8, res: 3 },
    growth: { hp: 2.2, str: 0.7, mag: 0, skl: 0.45, spd: 0.3, lck: 0.2, def: 0.5, res: 0.2 }
  },
  bamboo: {
    name: '竹妖', ai: 'guard', moveType: 'plant', move: 4, weapons: ['boss_vine'], tags: ['plant'], boss: true,
    base: { hp: 34, str: 2, mag: 11, skl: 8, spd: 6, lck: 4, def: 6, res: 8 },
    growth: { hp: 2, str: 0.1, mag: 0.7, skl: 0.5, spd: 0.35, lck: 0.2, def: 0.4, res: 0.55 }
  },
  waterghost: {
    name: '水鬼', ai: 'aggressive', moveType: 'amphibious', move: 5, weapons: ['boss_trident'], tags: ['undead'], boss: true,
    base: { hp: 38, str: 11, mag: 2, skl: 8, spd: 7, lck: 3, def: 8, res: 6 },
    growth: { hp: 2.2, str: 0.6, mag: 0.2, skl: 0.5, spd: 0.4, lck: 0.15, def: 0.45, res: 0.4 }
  },
  chisha: {
    name: '赤砂将军', ai: 'guard', moveType: 'horse', move: 6, weapons: ['boss_saber'], tags: ['human'], boss: true,
    base: { hp: 42, str: 14, mag: 0, skl: 11, spd: 10, lck: 6, def: 10, res: 5 },
    growth: { hp: 2.2, str: 0.7, mag: 0, skl: 0.6, spd: 0.5, lck: 0.3, def: 0.5, res: 0.3 }
  },
  icexiao: {
    name: '冰魈', ai: 'guard', moveType: 'beast', move: 5, weapons: ['boss_claw'], tags: ['beast'], boss: true,
    base: { hp: 44, str: 13, mag: 6, skl: 9, spd: 8, lck: 4, def: 11, res: 8 },
    growth: { hp: 2.4, str: 0.7, mag: 0.35, skl: 0.5, spd: 0.4, lck: 0.2, def: 0.55, res: 0.45 }
  },
  swampdragon: {
    name: '沼龙', ai: 'aggressive', moveType: 'amphibious', move: 5, weapons: ['boss_jaw'], tags: ['beast'], boss: true,
    base: { hp: 50, str: 15, mag: 4, skl: 8, spd: 7, lck: 4, def: 12, res: 7 },
    growth: { hp: 2.6, str: 0.75, mag: 0.3, skl: 0.5, spd: 0.4, lck: 0.2, def: 0.6, res: 0.4 }
  },
  turbidgeneral: {
    name: '浊将', ai: 'guard', moveType: 'armor', move: 4, weapons: ['boss_turbid'], tags: ['armor', 'undead'], boss: true,
    base: { hp: 52, str: 16, mag: 5, skl: 10, spd: 5, lck: 4, def: 16, res: 10 },
    growth: { hp: 2.8, str: 0.8, mag: 0.35, skl: 0.55, spd: 0.3, lck: 0.2, def: 0.7, res: 0.5 }
  },
  xuanque: {
    name: '玄阙', ai: 'guard', moveType: 'foot', move: 5, weapons: ['boss_ritual'], tags: ['human'], boss: true, phases: 2,
    base: { hp: 58, str: 6, mag: 18, skl: 14, spd: 12, lck: 8, def: 12, res: 14 },
    growth: { hp: 3, str: 0.4, mag: 0.85, skl: 0.65, spd: 0.5, lck: 0.3, def: 0.5, res: 0.6 },
    phase2: {
      name: '噬脉兽', weapon: 'beast_ritual', moveType: 'beast', move: 6, tags: ['beast'],
      base: { hp: 72, str: 20, mag: 14, skl: 14, spd: 10, lck: 6, def: 18, res: 14 },
      growth: { hp: 3.2, str: 0.9, mag: 0.5, skl: 0.6, spd: 0.4, lck: 0.2, def: 0.6, res: 0.5 }
    }
  },

  /* 友方召唤物 */
  ally_wolf: {
    name: '山灵狼', ai: 'ally', moveType: 'beast', move: 6, weapons: ['wolf_claw'], tags: ['beast'], ally: true,
    base: { hp: 20, str: 8, mag: 0, skl: 8, spd: 10, lck: 5, def: 5, res: 3 },
    growth: { hp: 1.8, str: 0.6, mag: 0, skl: 0.55, spd: 0.6, lck: 0.3, def: 0.35, res: 0.25 }
  }
};

/* ---------------- 支援 ----------------
 * 每对 C/B/A 三段。相邻结束己方阶段积 4 点。
 */
const SUPPORT_RANKS = [
  { rank: 'C', need: 20, hit: 5, avoid: 5, crit: 3, dodge: 3 },
  { rank: 'B', need: 50, hit: 10, avoid: 10, crit: 5, dodge: 5 },
  { rank: 'A', need: 90, hit: 15, avoid: 15, crit: 8, dodge: 8 }
];
const SUPPORT_RANGE = 3;
const SUPPORT_POINTS_ADJACENT = 4;

const SUPPORTS = [
  {
    id: 'yunce_luming', a: 'yunce', b: 'luming', name: '山门药香',
    dialogues: {
      C: [
        { who: 'luming', text: '云策师兄，你的手又在抖了。伸手。' },
        { who: 'yunce', text: '只是握剑太久。' },
        { who: 'luming', text: '握剑太久的人，才更要记得怎么松开手。' }
      ],
      B: [
        { who: 'yunce', text: '药篓给我。你背了一路，肩膀都压弯了。' },
        { who: 'luming', text: '不行，里面的药不能乱晃。……不过，你可以牵着我走。' },
        { who: 'yunce', text: '好。前面有坡。' }
      ],
      A: [
        { who: 'luming', text: '师兄，如果灵脉真的断了，你会怎么办？' },
        { who: 'yunce', text: '那就把剑种下去，等它长成新的脉。' },
        { who: 'luming', text: '……那我在旁边种药。你长成什么，我都治得好。' }
      ]
    }
  },
  {
    id: 'yunce_yankui', a: 'yunce', b: 'yankui', name: '山与剑',
    dialogues: {
      C: [
        { who: 'yankui', text: '掌门说过，你下山以后会迷路。' },
        { who: 'yunce', text: '我认得星。' },
        { who: 'yankui', text: '雾里没星。跟着我。' }
      ],
      B: [
        { who: 'yankui', text: '你今天多看了西边七次。那里有浊气。' },
        { who: 'yunce', text: '瞒不过你。' },
        { who: 'yankui', text: '我是山。山不会替你走，但会一直在。' }
      ],
      A: [
        { who: 'yunce', text: '岩隈，若有一日我不在了——' },
        { who: 'yankui', text: '那我就把你背回去。山不埋没有名字的人。' },
        { who: 'yunce', text: '……嗯。那我得先给自己取个好名字。' }
      ]
    }
  },
  {
    id: 'qingluo_yunling', a: 'qingluo', b: 'yunling', name: '仰望的人',
    dialogues: {
      C: [
        { who: 'qingluo', text: '你飞在天上，能看见我射出去的箭吗？' },
        { who: 'yunling', text: '能。你射偏的那支，落在第三棵松后。' },
        { who: 'qingluo', text: '……下次我一定射中。' }
      ],
      B: [
        { who: 'yunling', text: '你的箭比风还快。可你从不抬头看天。' },
        { who: 'qingluo', text: '看天会分心。' },
        { who: 'yunling', text: '那我替你看。天上有鹰，也有我。' }
      ],
      A: [
        { who: 'qingluo', text: '云翎，等我练到能射落星辰，你还会飞那么远吗？' },
        { who: 'yunling', text: '星辰太远了。我只是想离你近一点。' },
        { who: 'qingluo', text: '……那你下来。我教你射箭。' }
      ]
    }
  },
  {
    id: 'xuanyi_chisang', a: 'xuanyi', b: 'chisang', name: '冰与雷',
    dialogues: {
      C: [
        { who: 'chisang', text: '你的冰咒少了一道收势。会伤到自己。' },
        { who: 'xuanyi', text: '守渡人的咒，只需要拦住人，不需要收势。' },
        { who: 'chisang', text: '那你先别把自己冻住。' }
      ],
      B: [
        { who: 'xuanyi', text: '你画符的时候，为什么要先闭眼？' },
        { who: 'chisang', text: '我在听雷的呼吸。你也该听听冰的。' },
        { who: 'xuanyi', text: '……冰没有呼吸。' },
        { who: 'chisang', text: '有。你说话时就有。' }
      ],
      A: [
        { who: 'chisang', text: '祭坛的寒，冻了我十二年。' },
        { who: 'xuanyi', text: '那你来古渡。渡口的火，很暖。' },
        { who: 'chisang', text: '……好。我带符来换船钱。' }
      ]
    }
  },
  {
    id: 'moya_aman', a: 'moya', b: 'aman', name: '偷与给',
    dialogues: {
      C: [
        { who: 'aman', text: '你刚才是不是摸了我的兽骨袋？' },
        { who: 'moya', text: '职业习惯。里面有三块骨、一把干果。' },
        { who: 'aman', text: '干果送你。袋子还我。' }
      ],
      B: [
        { who: 'moya', text: '你为什么把最后半块饼给那只狼？' },
        { who: 'aman', text: '它饿。它不懂什么叫最后半块。' },
        { who: 'moya', text: '……那我也不懂了。给你。' }
      ],
      A: [
        { who: 'aman', text: '你这次没偷东西。' },
        { who: 'moya', text: '偷了。偷了一点不想再偷的心思。' },
        { who: 'aman', text: '这不算偷。算换。' }
      ]
    }
  },
  {
    id: 'bailu_luming', a: 'bailu', b: 'luming', name: '马蹄与药',
    dialogues: {
      C: [
        { who: 'bailu', text: '医师，马也伤了，能不能看看？' },
        { who: 'luming', text: '我只会治人。' },
        { who: 'bailu', text: '它驮我走了千里，也算半个人吧。' }
      ],
      B: [
        { who: 'luming', text: '你的马叫踏雪？名字真好听。' },
        { who: 'bailu', text: '我家乡的名字。那里一年只看得到一场雪。' },
        { who: 'luming', text: '等灵脉通了，我陪你去看看。' }
      ],
      A: [
        { who: 'bailu', text: '医师，你给那么多人治过伤，自己疼了怎么办？' },
        { who: 'luming', text: '熬一锅药，分给路过的人。闻着药香就不疼了。' },
        { who: 'bailu', text: '那我把马蹄声放慢些。多闻一会儿。' }
      ]
    }
  }
];

const SUPPORT_PAIR_MAP = {};
for (const s of SUPPORTS) {
  SUPPORT_PAIR_MAP[s.a + '_' + s.b] = s;
  SUPPORT_PAIR_MAP[s.b + '_' + s.a] = s;
}
