/* ============================================================
 * 山海策 · 灵脉  —  数据层：基础规则 / 职业 / 武器 / 人物 / 敌人
 * 纯静态、无模块：所有脚本按顺序挂到 window。
 * ============================================================ */

const GAME_TITLE = '山海策';
const GAME_SUBTITLE = '灵 脉';
const SAVE_VERSION = 5;   // v5：下海四章（9~12）+ 终章后移为 13；旧档 chapter:9 按是否通关迁移

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
  beast: { name: '爪', icon: '爪' },
  voice: { name: '谣', icon: '谣' },
  chain: { name: '链', icon: '链' }
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

/* ---------------- 勇者模式（P3.4） ----------------
 * 与难度正交的独立开关：悔棋 0 次、无战斗提示、敌军再 ×1.15、经验 ×0.9、通关授徽。
 * 不改难度表本身，用 diffOf 在取用时叠加，避免「勇者 + 修罗」两套组合写死。 */
const HEROIC = { enemyMul: 1.15, expMul: 0.9, rewinds: 0 };

function diffOf(campaign) {
  const base = DIFFICULTIES[(campaign && campaign.difficulty) || 'normal'] || DIFFICULTIES.normal;
  if (!campaign || !campaign.heroic) return base;
  return {
    key: base.key, name: base.name + ' · 勇者', desc: base.desc,
    enemyMul: Math.round((base.enemyMul || 1) * HEROIC.enemyMul * 100) / 100,
    enemyLv: base.enemyLv, rewinds: HEROIC.rewinds,
    expMul: Math.round((base.expMul || 1) * HEROIC.expMul * 100) / 100,
    heroic: true
  };
}

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
  /* 传送武器：渡厄杖（把友军唤回身侧，一次性行动，不可对敌方使用）；
   * 追影刃（命中后与目标交换位置，对 Boss 无效）。耐久 + 商店限量限强。 */
  staff_duo: { key: 'staff_duo', name: '渡厄杖', type: 'staff', rank: 'C', mt: 0, hit: 100, crit: 0, wt: 5, rng: [1, 3], uses: 15, price: 900, desc: '引渡厄之脉，把命悬一线的友军唤回身侧。', warp: true, magic: true, shopGate: { chapter: 3 } },
  dagger_zhuiying: { key: 'dagger_zhuiying', name: '追影刃', type: 'dagger', rank: 'B', mt: 7, hit: 88, crit: 15, wt: 4, rng: [1, 1], uses: 25, price: 1400, desc: '出手无影，命中之际已与敌易位。', swapOnHit: true, shopGate: { chapter: 4, char: 'moya' } },

  beast_claw: { key: 'beast_claw', name: '山灵爪', type: 'beast', rank: 'S', mt: 7, hit: 85, crit: 0, wt: 4, rng: [1, 1], uses: 99, price: 0, desc: '阿蛮与山灵共生的爪印。' },
  wolf_claw: { key: 'wolf_claw', name: '山灵牙', type: 'beast', rank: 'S', mt: 6, hit: 90, crit: 5, wt: 3, rng: [1, 1], uses: 99, price: 0, desc: '召唤而来的山灵，牙爪带风。' },

  /* 谣（音波）：不吃武器三角、无五行属性 */
  bone_flute: { key: 'bone_flute', name: '兽骨笛', type: 'voice', rank: 'C', mt: 4, hit: 85, crit: 0, wt: 3, rng: [1, 1], uses: 30, price: 480, desc: '巫咸氏传下的骨笛，吹响时百兽侧耳。', unique: 'jiangsi' },
  tide_voice: { key: 'tide_voice', name: '潮声', type: 'voice', rank: 'C', mt: 6, hit: 80, crit: 0, wt: 4, rng: [1, 2], uses: 25, price: 900, desc: '鲛人织绦时的低吟，声浪可及两丈。', unique: 'yusqiu' },
  moon_tide: { key: 'moon_tide', name: '月汐谣', type: 'voice', rank: 'B', mt: 9, hit: 85, crit: 5, wt: 5, rng: [1, 2], uses: 20, price: 1900, desc: '月下潮音成谣，闻者心神动摇。' },

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
  beast_ritual: { key: 'beast_ritual', name: '噬脉', type: 'tome', rank: 'S', mt: 18, hit: 85, crit: 10, wt: 10, rng: [1, 2], uses: 99, price: 0, desc: '噬脉兽吞噬灵脉后的吐息。', magic: true },
  boss_relic: { key: 'boss_relic', name: '断脉剑', type: 'sword', rank: 'S', mt: 17, hit: 85, crit: 10, wt: 10, rng: [1, 1], uses: 99, price: 0, desc: '守脉人遗骸握着的那把剑。剑上还刻着「守」字，只是被磨平了一半。' },

  /* ---- 二期扩容「下海」：链（新类型）+ 五条新职业线的武器 ---- */
  /* 链：1~2 射程、命中偏低、重量中等，不参与武器三角 */
  iron_chain: { key: 'iron_chain', name: '铁链', type: 'chain', rank: 'D', mt: 6, hit: 78, crit: 0, wt: 7, rng: [1, 2], uses: 30, price: 520, desc: '锁船的旧铁链，末端坠着一枚铁环。' },
  steel_chain: { key: 'steel_chain', name: '钢链', type: 'chain', rank: 'C', mt: 9, hit: 74, crit: 0, wt: 9, rng: [1, 2], uses: 22, price: 980, desc: '环环相扣，甩出去能带倒一匹马。' },
  silver_chain: { key: 'silver_chain', name: '银链', type: 'chain', rank: 'B', mt: 12, hit: 80, crit: 5, wt: 8, rng: [1, 2], uses: 18, price: 1900, desc: '以银晶掺铁锻成，锁妖不锁人。' },
  /* 杖（潮）：治疗线，越往深越能隔着水汽够到人 */
  tide_staff: { key: 'tide_staff', name: '潮音杖', type: 'staff', rank: 'C', mt: 0, hit: 100, crit: 0, wt: 4, rng: [1, 1], uses: 18, price: 1150, desc: '杖头是一只螺，凑近了能听见潮。', heal: 16, magic: true },
  canglang_staff: { key: 'canglang_staff', name: '沧浪杖', type: 'staff', rank: 'B', mt: 0, hit: 100, crit: 0, wt: 6, rng: [1, 2], uses: 15, price: 2400, desc: '杖身缠着活水，隔着两格也能渡气。', heal: 26, magic: true },
  /* 剑（潮刃）：轻、快、吃水势 */
  tide_blade: { key: 'tide_blade', name: '潮刃', type: 'sword', rank: 'C', mt: 9, hit: 85, crit: 5, wt: 6, rng: [1, 1], uses: 25, price: 1000, desc: '刃口开成浪形，收刀时带一道水痕。' },
  duanlang_blade: { key: 'duanlang_blade', name: '断浪', type: 'sword', rank: 'B', mt: 12, hit: 80, crit: 10, wt: 8, rng: [1, 1], uses: 20, price: 2100, desc: '鲛人匠人锻的，据说斩断过一道涌。' },
  /* 弓（弩）：射程长，但对空以外的手感略钝 */
  iron_crossbow: { key: 'iron_crossbow', name: '连弩', type: 'bow', rank: 'C', mt: 7, hit: 90, crit: 0, wt: 6, rng: [2, 2], uses: 25, price: 1050, desc: '机簧一响，三矢连着出。', effective: ['flying'] },
  steel_crossbow: { key: 'steel_crossbow', name: '机弩', type: 'bow', rank: 'B', mt: 10, hit: 85, crit: 5, wt: 8, rng: [2, 3], uses: 18, price: 2300, desc: '公输家的老图纸，弩臂能折成两截。', effective: ['flying'] },
  /* 符（幡）：招魂引路，专克披甲 */
  soul_banner: { key: 'soul_banner', name: '招魂幡', type: 'talisman', rank: 'C', mt: 8, hit: 82, crit: 0, wt: 5, rng: [1, 2], uses: 22, price: 1100, desc: '白幡上写满没刻完的名字。', magic: true, effective: ['armor'] },
  yinhun_banner: { key: 'yinhun_banner', name: '引魂幡', type: 'talisman', rank: 'B', mt: 11, hit: 85, crit: 5, wt: 7, rng: [1, 2], uses: 18, price: 2200, desc: '幡一动，海底的灯就亮一盏。', magic: true, effective: ['armor'] },
  /* 专属兵装（unique：不可购买，随角色入队） */
  tingchao: { key: 'tingchao', name: '听潮', type: 'staff', rank: 'C', mt: 0, hit: 100, crit: 0, wt: 3, rng: [1, 2], uses: 30, price: 2000, desc: '阿汐的螺杖，贴着耳朵能听见将死的人报名字。', heal: 20, magic: true, unique: 'axi' },
  liechao: { key: 'liechao', name: '裂潮刃', type: 'sword', rank: 'C', mt: 11, hit: 90, crit: 10, wt: 5, rng: [1, 1], uses: 35, price: 2200, desc: '敖绡的佩刃，刃背有鲛人族的浪纹。', unique: 'aoxiao' },
  lianji: { key: 'lianji', name: '连机弩', type: 'bow', rank: 'C', mt: 9, hit: 90, crit: 5, wt: 5, rng: [2, 2], uses: 30, price: 2100, desc: '公输卯亲手做的第一具弩，扳机上刻着「卯」。', effective: ['flying'], unique: 'gongshumao' },
  wuzibei: { key: 'wuzibei', name: '无字碑', type: 'talisman', rank: 'C', mt: 10, hit: 85, crit: 0, wt: 6, rng: [1, 2], uses: 30, price: 2100, desc: '一块磨薄的碑石，正面无字，背面全是名字。', magic: true, effective: ['armor'], unique: 'taowujiu' },
  fuchao_suo: { key: 'fuchao_suo', name: '缚潮索', type: 'chain', rank: 'C', mt: 10, hit: 85, crit: 5, wt: 6, rng: [1, 2], uses: 35, price: 2200, desc: '沈砚的旧链，链节上还留着玄阙军的番号。', unique: 'shenyan' },
  shuangyu: { key: 'shuangyu', name: '霜羽', type: 'bow', rank: 'C', mt: 8, hit: 95, crit: 10, wt: 3, rng: [2, 3], uses: 28, price: 2100, desc: '以羽人换下的飞羽为弦，射出去不带声音。', effective: ['flying'], unique: 'shuangxu' }
};

const ITEMS = {
  potion: { key: 'potion', name: '金创药', kind: 'heal', heal: 12, uses: 3, price: 120, desc: '草药捣成的伤药，回复 12 点生命。', icon: '药' },
  herb: { key: 'herb', name: '灵草', kind: 'heal', heal: 20, uses: 2, price: 220, desc: '带露的灵草，回复 20 点生命。', icon: '草' },
  elixir: { key: 'elixir', name: '回春丹', kind: 'heal', heal: 40, uses: 1, price: 360, desc: '一粒回春，回复 40 点生命。', icon: '丹' },
  seal: { key: 'seal', name: '脉印', kind: 'seal', uses: 1, price: 1400, desc: '以灵脉石磨成的印，十级后可转职。', icon: '印' },
  /* 强化材料（stack 可堆叠；铁匠铺强化 +3 消耗，见 systems/smith.js） */
  mat_iron: { key: 'mat_iron', name: '铁髓', kind: 'mat', uses: 1, price: 60, stack: true, desc: '最常见的铁料，强化 +1 的底子。', icon: '铁' },
  mat_steel: { key: 'mat_steel', name: '钢核', kind: 'mat', uses: 1, price: 150, stack: true, desc: '百炼钢的芯，强化 +2 少不得它。', icon: '钢' },
  mat_silver: { key: 'mat_silver', name: '银晶', kind: 'mat', uses: 1, price: 300, stack: true, desc: '银脉里结出的晶，强化 +3 压轴用。', icon: '银' }
};

/* ---------------- 职业 ---------------- */
const CLASSES = {
  swordsman: {
    name: '剑客', tier: 1, moveType: 'foot', move: 5, weapons: ['sword'],
    skill: { name: '剑术精通', desc: '装备剑时命中 +10。', hit: 10, weapon: 'sword' },
    promote: 'swordmaster', promotes: ['swordmaster', 'riftblade'],
    promoGain: { hp: 4, str: 2, skl: 3, spd: 3, def: 2, res: 1 },
    promoRanks: { sword: 1 }, desc: '以快制慢，剑走轻灵。'
  },
  swordmaster: {
    name: '剑圣', tier: 2, moveType: 'foot', move: 6, weapons: ['sword'],
    skill: { name: '剑心通明', desc: '装备剑时命中 +15、暴击 +5。', hit: 15, weapon: 'sword', crit: 5 },
    desc: '剑与心合，落叶可斩。'
  },
  /* 剑客第二线：重击破阵 */
  riftblade: {
    name: '裂阵剑士', tier: 2, moveType: 'foot', move: 5, weapons: ['sword'],
    skill: { name: '破阵', desc: '威力 +2；对披甲目标命中 +15。', dmg: 2, hitVsArmor: 15 },
    desc: '不求快，只求一剑劈开阵脚。'
  },
  axeman: {
    name: '重刃', tier: 1, moveType: 'armor', move: 4, weapons: ['axe'], tags: ['armor'],
    skill: { name: '坚壁', desc: '护甲 +2。', def: 2 },
    promote: 'mountainwarden', promotes: ['mountainwarden', 'mountainbreaker'],
    promoGain: { hp: 6, str: 3, skl: 2, spd: 1, def: 4, res: 2 },
    promoRanks: { axe: 1 }, desc: '一步一山，重刃无锋。'
  },
  mountainwarden: {
    name: '山岳卫', tier: 2, moveType: 'armor', move: 4, weapons: ['axe'], tags: ['armor'],
    skill: { name: '不动如山', desc: '护甲 +4，生命上限额外成长。', def: 4 },
    desc: '身受千刃，仍立于关口。'
  },
  /* 重刃第二线：攻势 */
  mountainbreaker: {
    name: '裂山斧王', tier: 2, moveType: 'armor', move: 4, weapons: ['axe'], tags: ['armor'],
    skill: { name: '裂山', desc: '威力 +3；生命低于一半时护甲 +3。', dmg: 3, defIfWounded: 3 },
    desc: '一斧下去，山也要让路。'
  },
  physician: {
    name: '医师', tier: 1, moveType: 'foot', move: 5, weapons: ['staff'],
    skill: { name: '仁心', desc: '杖治疗量 +5。', healBonus: 5 },
    promote: 'sagephysician', promotes: ['sagephysician', 'needler'],
    promoGain: { hp: 3, mag: 3, skl: 2, spd: 2, def: 1, res: 3 },
    promoRanks: { staff: 1 }, desc: '一杖草木，生死之间。'
  },
  sagephysician: {
    name: '灵枢医仙', tier: 2, moveType: 'foot', move: 5, weapons: ['staff'],
    skill: { name: '回春妙手', desc: '杖治疗量 +8，邻近友军回避 +8。', healBonus: 8, adjacentAllyAvoid: 8 },
    desc: '针落灵枢，枯木回春。'
  },
  /* 医师第二线：针法与助攻 */
  needler: {
    name: '金针医', tier: 2, moveType: 'foot', move: 5, weapons: ['staff'],
    skill: { name: '针脉', desc: '杖治疗量 +4；相邻友军命中 +8。', healBonus: 4, adjacentAllyHit: 8 },
    desc: '针比刀快，救人也比杀人难。'
  },
  archer: {
    name: '弓手', tier: 1, moveType: 'foot', move: 5, weapons: ['bow'],
    skill: { name: '狙神', desc: '未移动时命中 +15。', hitIfNoMove: 15 },
    promote: 'windranger', promotes: ['windranger', 'volleyarcher'],
    promoGain: { hp: 3, str: 2, skl: 3, spd: 3, def: 1, res: 2 },
    promoRanks: { bow: 1 }, desc: '静如岩，发如风。'
  },
  windranger: {
    name: '逐风射手', tier: 2, moveType: 'foot', move: 6, weapons: ['bow'],
    skill: { name: '穿云', desc: '未移动时命中 +20、暴击 +10；对飞行伤害不减。', hitIfNoMove: 20, critIfNoMove: 10, hitVsFlying: 15 },
    desc: '箭出无回，云开见月。'
  },
  /* 弓手第二线：连珠快射 */
  volleyarcher: {
    name: '连珠射手', tier: 2, moveType: 'foot', move: 5, weapons: ['bow'],
    skill: { name: '连珠', desc: '暴击 +12；对飞行目标命中 +15。', crit: 12, hitVsFlying: 15 },
    desc: '一箭未尽，第二箭已在弦上。'
  },
  lancer: {
    name: '枪骑', tier: 1, moveType: 'horse', move: 7, weapons: ['lance'],
    skill: { name: '冲锋', desc: '移动 +1。', move: 1 },
    promote: 'dragonrider', promotes: ['dragonrider', 'bulwark'],
    promoGain: { hp: 4, str: 2, skl: 2, spd: 3, def: 2, res: 2 },
    promoRanks: { lance: 1 }, desc: '马蹄如鼓，一枪破阵。'
  },
  dragonrider: {
    name: '游龙骑将', tier: 2, moveType: 'horse', move: 8, weapons: ['lance'],
    skill: { name: '游龙', desc: '移动 +1，移动 4 格以上时命中 +10。', move: 1, hitIfMoved4: 10 },
    desc: '枪走游龙，来去如潮。'
  },
  /* 枪骑第二线：守口铁壁 */
  bulwark: {
    name: '铁壁枪卫', tier: 2, moveType: 'horse', move: 6, weapons: ['lance'],
    skill: { name: '铁壁', desc: '护甲 +3；站在阵眼上时回避 +10。', def: 3, avoidOnNode: 10 },
    desc: '枪不为攻，为的是把路堵死。'
  },
  mage: {
    name: '术士', tier: 1, moveType: 'foot', move: 5, weapons: ['tome'],
    skill: { name: '霜寒领域', desc: '两格内敌军命中 -10。', enemyAuraHit: 10 },
    promote: 'frostweaver', promotes: ['frostweaver', 'pyromancer'],
    promoGain: { hp: 3, mag: 3, skl: 2, spd: 2, def: 1, res: 4 },
    promoRanks: { tome: 1 }, desc: '一纸咒文，寒暑倒转。'
  },
  frostweaver: {
    name: '冰璃咒师', tier: 2, moveType: 'foot', move: 6, weapons: ['tome'],
    skill: { name: '寒川', desc: '两格内敌军命中 -15，命中后使其移动 -1。', enemyAuraHit: 15, movePenaltyOnHit: 1 },
    desc: '挥手成冰，河川止流。'
  },
  /* 术士第二线：焚天重术 */
  pyromancer: {
    name: '焚天术士', tier: 2, moveType: 'foot', move: 5, weapons: ['tome'],
    skill: { name: '焚天', desc: '威力 +3；对披甲目标命中 +10。', dmg: 3, hitVsArmor: 10 },
    desc: '符纸未落，风已烫手。'
  },
  rogue: {
    name: '刺客', tier: 1, moveType: 'foot', move: 6, weapons: ['dagger'],
    skill: { name: '致命', desc: '暴击 +10。', crit: 10 },
    promote: 'nightblade', promotes: ['nightblade', 'facestealer'],
    promoGain: { hp: 3, str: 2, skl: 3, spd: 4, def: 1, res: 2 },
    promoRanks: { dagger: 1 }, desc: '影里来，影里去。'
  },
  nightblade: {
    name: '影刃', tier: 2, moveType: 'foot', move: 7, weapons: ['dagger'],
    skill: { name: '无光', desc: '暴击 +15，回避 +5。', crit: 15, avoidFlat: 5 },
    desc: '刃不见光，命不见影。'
  },
  /* 刺客第二线：独行游斗 */
  facestealer: {
    name: '千面刺客', tier: 2, moveType: 'foot', move: 7, weapons: ['dagger'],
    skill: { name: '千面', desc: '回避 +10；周围无友军时再 +10。', avoidFlat: 10, avoidIfLone: 10 },
    desc: '见过她脸的人，都以为是另一个人。'
  },
  talisman: {
    name: '符师', tier: 1, moveType: 'foot', move: 5, weapons: ['talisman'],
    skill: { name: '破甲', desc: '对披甲目标命中 +20。', hitVsArmor: 20 },
    promote: 'thundermaster', promotes: ['thundermaster', 'wardmaster'],
    promoGain: { hp: 3, mag: 3, skl: 3, spd: 2, def: 1, res: 3 },
    promoRanks: { talisman: 1 }, desc: '朱砂落纸，雷火听令。'
  },
  thundermaster: {
    name: '雷符真人', tier: 2, moveType: 'foot', move: 6, weapons: ['talisman'],
    skill: { name: '五雷正法', desc: '对披甲目标命中 +20、暴击 +10。', hitVsArmor: 20, critVsArmor: 10 },
    desc: '五雷齐落，山石皆开。'
  },
  /* 符师第二线：护符镇场 */
  wardmaster: {
    name: '镇煞符师', tier: 2, moveType: 'foot', move: 5, weapons: ['talisman'],
    skill: { name: '镇煞', desc: '魔抗 +3；相邻友军回避 +8。', res: 3, adjacentAllyAvoid: 8 },
    desc: '符不杀生，只把邪祟按在原地。'
  },
  beastcaller: {
    name: '兽使', tier: 1, moveType: 'foot', move: 5, weapons: ['beast'],
    skill: { name: '兽群', desc: '每章一次，可召唤一只山灵狼。', summon: true },
    promote: 'beastking', promotes: ['beastking', 'beastwhisperer'],
    promoGain: { hp: 5, str: 3, skl: 2, spd: 2, def: 3, res: 2 },
    promoRanks: { beast: 1 }, desc: '与兽同息，山林皆友。'
  },
  beastking: {
    name: '山灵御兽', tier: 2, moveType: 'foot', move: 6, weapons: ['beast'],
    skill: { name: '万兽来朝', desc: '每章一次召唤更强的山灵狼，自身护甲 +2。', summon: 2, def: 2 },
    desc: '一声长啸，群山回应。'
  },
  /* 兽使第二线：群兽共鸣 */
  beastwhisperer: {
    name: '兽语者', tier: 2, moveType: 'foot', move: 5, weapons: ['beast'],
    skill: { name: '兽语', desc: '每章三次召唤；场上每有一只召唤兽，自身伤害 +1。', summon: 1, summonUses: 3, dmgPerSummon: 1 },
    desc: '她说话时，兽会停下来听。'
  },
  wingman: {
    name: '羽人', tier: 1, moveType: 'flying', move: 6, weapons: ['bow', 'lance'], tags: ['flying'],
    skill: { name: '天羽', desc: '移动 +1。', move: 1 },
    promote: 'skyranger', promotes: ['skyranger', 'plumeguard'],
    promoGain: { hp: 3, str: 2, skl: 3, spd: 3, def: 1, res: 2 },
    promoRanks: { bow: 1, lance: 1 }, desc: '羽落无声，越岭如风。'
  },
  skyranger: {
    name: '天羽游侠', tier: 2, moveType: 'flying', move: 7, weapons: ['bow', 'lance'], tags: ['flying'],
    skill: { name: '凌风', desc: '移动 +1，回避 +10，对飞行目标命中 +15。', move: 1, avoidFlat: 10, hitVsFlying: 15 },
    desc: '云上是她的归路。'
  },
  /* 羽人第二线：翎羽掩护 */
  plumeguard: {
    name: '翎羽卫', tier: 2, moveType: 'flying', move: 6, weapons: ['bow', 'lance'], tags: ['flying'],
    skill: { name: '翎羽', desc: '回避 +10；相邻友军回避 +8。', avoidFlat: 10, adjacentAllyAvoid: 8 },
    desc: '她落下时，身后的人都还站着。'
  },
  /* 召唤师线（姜姒）：武器兽骨笛只是触媒，输出靠召唤兽 */
  summoner: {
    name: '召唤师', tier: 1, moveType: 'foot', move: 5, weapons: ['voice'],
    skill: { name: '驭兽', desc: '每章两次，召唤异兽助战。', summon: 1, summonUses: 2 },
    promote: 'spiritcaller', promotes: ['spiritcaller', 'divinetamer'],
    promoGain: { hp: 4, mag: 2, skl: 2, spd: 2, def: 2, res: 3 },
    promoRanks: { voice: 1 }, desc: '骨笛声起，山野回应。'
  },
  spiritcaller: {
    name: '通灵师', tier: 2, moveType: 'foot', move: 5, weapons: ['voice'],
    skill: { name: '灵犀', desc: '每章两次召唤灵兽；所召灵兽生命 +6、伤害 +2。', summon: 2, summonUses: 2, summonBuff: { hp: 6, dmg: 2 } },
    desc: '与灵兽共息，笛声即是契约。'
  },
  divinetamer: {
    name: '神御师', tier: 2, moveType: 'foot', move: 6, weapons: ['voice'],
    skill: { name: '神御', desc: '每章一次召唤神兽；神兽登场时周围敌军命中 -5。', summon: 3, summonUses: 1, summonAuraHit: 5 },
    desc: '上古神兽的名字，只敢低声念。'
  },
  /* 歌者线（虞素秋）：音波远程软控辅助 */
  songstress: {
    name: '歌者', tier: 1, moveType: 'foot', move: 5, weapons: ['voice'],
    skill: { name: '浅吟', desc: '咏唱歌谣时命中 +10。', hit: 10 },
    promote: 'tidelady', promotes: ['tidelady', 'celestialsage'],
    promoGain: { hp: 3, mag: 3, skl: 2, spd: 2, def: 1, res: 4 },
    promoRanks: { voice: 1 }, desc: '歌不是唱给人听的，是唱给潮听的。'
  },
  tidelady: {
    name: '潮音娘子', tier: 2, moveType: 'foot', move: 6, weapons: ['voice'],
    skill: { name: '踏潮', desc: '歌的效果增强一级；回避 +5。', songPower: 1, avoidFlat: 5 },
    desc: '立于潮头而歌，浪花替她披上绡纱。'
  },
  celestialsage: {
    name: '天籁巫', tier: 2, moveType: 'foot', move: 5, weapons: ['voice'],
    skill: { name: '天籁', desc: '歌的射程 +1；灵力 +2。', songRange: 1, mag: 2 },
    desc: '天籁入耳，三伏天也会落雪。'
  },

  /* ---------------- 二期扩容：下海五线（tier1 + 双转职） ---------------- */
  tidecaller: {
    name: '潮汐使', tier: 1, moveType: 'foot', move: 5, weapons: ['staff'],
    skill: { name: '听潮', desc: '杖的治疗量 +2；站在阵眼上回避 +10。', healBonus: 2, avoidOnNode: 10 },
    promote: 'tidewarden', promotes: ['tidewarden', 'abysssinger'],
    promoGain: { hp: 3, mag: 3, skl: 2, spd: 2, def: 1, res: 4 },
    promoRanks: { staff: 1 }, desc: '潮水会把名字带回来，只要你听得够久。'
  },
  tidewarden: {
    name: '沧浪使', tier: 2, moveType: 'foot', move: 6, weapons: ['staff'],
    skill: { name: '潮护', desc: '治疗量 +3；相邻友军回避 +5。', healBonus: 3, adjacentAllyAvoid: 5 },
    desc: '她把潮气铺在同伴脚下，替他们挡下第一击。'
  },
  abysssinger: {
    name: '深渊咏者', tier: 2, moveType: 'foot', move: 5, weapons: ['staff'],
    skill: { name: '渊咏', desc: '威力 +3；魔抗 +2。', dmg: 3, res: 2 },
    desc: '向海眼唱一支挽歌，浊潮也会退半步。'
  },

  waveblade: {
    name: '潮刃客', tier: 1, moveType: 'foot', move: 6, weapons: ['sword'],
    skill: { name: '断浪', desc: '装备剑时命中 +10；移动 4 格以上再 +10。', hit: 10, weapon: 'sword', hitIfMoved4: 10 },
    promote: 'tidecutter', promotes: ['tidecutter', 'riptide'],
    promoGain: { hp: 4, str: 2, skl: 3, spd: 3, def: 1, res: 1 },
    promoRanks: { sword: 1 }, desc: '借浪势出刀，刀比人先到。'
  },
  tidecutter: {
    name: '斩潮者', tier: 2, moveType: 'foot', move: 6, weapons: ['sword'],
    skill: { name: '裂浪', desc: '威力 +3；对披甲目标暴击 +12。', dmg: 3, critVsArmor: 12 },
    desc: '一刀落下，浪从中间分开。'
  },
  riptide: {
    name: '裂潮使', tier: 2, moveType: 'foot', move: 7, weapons: ['sword'],
    skill: { name: '逐潮', desc: '回避 +10；原地不动时命中 +15。', avoidFlat: 10, hitIfNoMove: 15 },
    desc: '顺着退潮追出去，追到海底也不停。'
  },

  artificer: {
    name: '机关师', tier: 1, moveType: 'foot', move: 5, weapons: ['bow'],
    skill: { name: '机巧', desc: '对飞行目标命中 +20；威力 +1。', hitVsFlying: 20, dmg: 1 },
    promote: 'puppeteer', promotes: ['puppeteer', 'machinist'],
    promoGain: { hp: 4, str: 1, skl: 4, spd: 2, def: 2, res: 1 },
    promoRanks: { bow: 1 }, desc: '手比嘴快，图纸比命长。'
  },
  puppeteer: {
    name: '傀儡宗', tier: 2, moveType: 'foot', move: 5, weapons: ['bow'],
    skill: { name: '牵丝', desc: '可召唤傀儡；场上每只召唤物使自身伤害 +2。', summon: 1, dmgPerSummon: 2 },
    desc: '丝线一抖，沉船里的木人自己站起来。'
  },
  machinist: {
    name: '巧械师', tier: 2, moveType: 'foot', move: 6, weapons: ['bow'],
    skill: { name: '连环机', desc: '命中 +15；未移动时暴击 +10。', hit: 15, critIfNoMove: 10 },
    desc: '一具弩拆成七件，七件能拼成三具。'
  },

  gravekeeper: {
    name: '守墓人', tier: 1, moveType: 'foot', move: 5, weapons: ['talisman'],
    skill: { name: '守夜', desc: '魔抗 +3；生命低于一半时护甲 +2。', res: 3, defIfWounded: 2 },
    promote: 'soulguide', promotes: ['soulguide', 'seaburier'],
    promoGain: { hp: 3, mag: 2, skl: 3, spd: 2, def: 1, res: 4 },
    promoRanks: { talisman: 1 }, desc: '给死人刻碑的人，最知道活人该往哪走。'
  },
  soulguide: {
    name: '引魂使', tier: 2, moveType: 'foot', move: 6, weapons: ['talisman'],
    skill: { name: '引魂', desc: '治疗量 +4；站在阵眼上回避 +15。', healBonus: 4, avoidOnNode: 15 },
    desc: '幡往哪边指，魂就往哪边去。'
  },
  seaburier: {
    name: '葬海人', tier: 2, moveType: 'foot', move: 5, weapons: ['talisman'],
    skill: { name: '葬海', desc: '威力 +3；对披甲目标命中 +10。', dmg: 3, hitVsArmor: 10 },
    desc: '海不收的尸首，他一具一具送下去。'
  },

  chainwarden: {
    name: '锁链卫', tier: 1, moveType: 'foot', move: 5, weapons: ['chain'],
    skill: { name: '缚索', desc: '装备链时命中 +10；相邻友军回避 +3。', hit: 10, weapon: 'chain', adjacentAllyAvoid: 3 },
    promote: 'tidebinder', promotes: ['tidebinder', 'chainbreaker'],
    promoGain: { hp: 5, str: 2, skl: 2, spd: 2, def: 3, res: 1 },
    promoRanks: { chain: 1 }, desc: '一条链子拴住过逃兵、牲口和潮。'
  },
  tidebinder: {
    name: '缚潮者', tier: 2, moveType: 'foot', move: 5, weapons: ['chain'],
    skill: { name: '潮缚', desc: '回避 +5；对披甲目标命中 +15。', avoidFlat: 5, hitVsArmor: 15 },
    desc: '潮也是可以拴住的，只要链够长。'
  },
  chainbreaker: {
    name: '断链客', tier: 2, moveType: 'foot', move: 6, weapons: ['chain'],
    skill: { name: '断链', desc: '威力 +4；生命低于一半时护甲 +2。', dmg: 4, defIfWounded: 2 },
    desc: '他把自己从队伍里断出来，也把命断在别人前面。'
  }
};

const PROMO_LEVEL = 10;
const MAX_LEVEL = 20;

/* ---------------- 人物 ---------------- */
const CHARS = {
  yunce: {
    id: 'yunce', name: '云策', cls: 'swordsman', level: 4, exp: 0, portrait: 'yunce', element: 'metal',
    stats: { hp: 23, str: 8, mag: 0, skl: 9, spd: 9, lck: 7, def: 6, res: 3 },
    growth: { hp: 62, str: 45, mag: 5, skl: 55, spd: 50, lck: 40, def: 35, res: 25 },
    ranks: { sword: 'C' }, personal: { name: '守脉人', desc: '相邻友军命中与回避 +5；站在阵眼上时伤害 +2。', adjacentAllyHit: 5, adjacentAllyAvoid: 5, selfDamageOnNode: 2 },
    personal2: { name: '承脉', desc: '魔抗 +2；生命低于一半时护甲 +2。', res: 2, defIfWounded: 2 },
    items: [{ key: 'qinglan', uses: 40 }, { key: 'iron_sword', uses: 35 }, { key: 'potion', uses: 3 }],
    bio: '青岚宗最后的守脉人。剑不出鞘时像个沉默的书生，出鞘后山风都会让路。'
  },
  yankui: {
    id: 'yankui', name: '岩隈', cls: 'axeman', level: 3, exp: 0, portrait: 'yankui', element: 'earth',
    stats: { hp: 27, str: 9, mag: 0, skl: 4, spd: 4, lck: 3, def: 11, res: 1 },
    growth: { hp: 75, str: 55, mag: 0, skl: 30, spd: 25, lck: 25, def: 45, res: 15 },
    ranks: { axe: 'C' }, personal: { name: '山岳之骨', desc: '生命低于一半时护甲 +3。', defIfWounded: 3 },
    personal2: { name: '负山', desc: '本回合移动 4 格以上时命中 +10。', hitIfMoved4: 10 },
    items: [{ key: 'iron_blade', uses: 30 }, { key: 'potion', uses: 3 }],
    bio: '青岚宗守山弟子，话少，饭量大。他说石头不会骗人，人比石头难懂。'
  },
  luming: {
    id: 'luming', name: '鹿鸣', cls: 'physician', level: 2, exp: 0, portrait: 'luming', element: 'wood',
    stats: { hp: 18, str: 2, mag: 6, skl: 6, spd: 7, lck: 8, def: 3, res: 7 },
    growth: { hp: 45, str: 15, mag: 55, skl: 45, spd: 45, lck: 50, def: 20, res: 45 },
    ranks: { staff: 'C' }, personal: { name: '药心', desc: '相邻友军回避 +5。', adjacentAllyAvoid: 5 },
    personal2: { name: '药囊', desc: '相邻友军命中 +5。', adjacentAllyHit: 5 },
    items: [{ key: 'heal_staff', uses: 20 }, { key: 'potion', uses: 3 }, { key: 'herb', uses: 2 }],
    bio: '背着比人还高的药篓，走到哪里都能认出能入药的草。怕血，却从不后退。'
  },
  qingluo: {
    id: 'qingluo', name: '青萝', cls: 'archer', level: 3, exp: 0, portrait: 'qingluo', element: 'wood',
    stats: { hp: 19, str: 5, mag: 0, skl: 8, spd: 8, lck: 6, def: 4, res: 4 },
    growth: { hp: 50, str: 35, mag: 0, skl: 60, spd: 55, lck: 40, def: 25, res: 25 },
    ranks: { bow: 'D' }, personal: { name: '鹰眼', desc: '对飞行目标命中 +20；未移动时暴击 +10。', hitVsFlying: 20, critIfNoMove: 10 },
    personal2: { name: '采药人', desc: '回避 +5。', avoidFlat: 5 },
    items: [{ key: 'iron_bow', uses: 30 }, { key: 'potion', uses: 3 }],
    bio: '青岚山下的猎户之女。她说射箭和看人一样，急不得，看准了再松手。'
  },
  bailu: {
    id: 'bailu', name: '白鹭', cls: 'lancer', level: 5, exp: 0, portrait: 'bailu', element: 'metal',
    stats: { hp: 24, str: 8, mag: 0, skl: 7, spd: 7, lck: 5, def: 7, res: 3 },
    growth: { hp: 55, str: 45, mag: 0, skl: 45, spd: 40, lck: 35, def: 35, res: 20 },
    ranks: { lance: 'C' }, personal: { name: '踏浪', desc: '本回合移动 4 格以上时命中 +10。', hitIfMoved4: 10 },
    personal2: { name: '逃将', desc: '相邻无友军时回避 +10。', avoidIfLone: 10 },
    items: [{ key: 'iron_lance', uses: 30 }, { key: 'javelin', uses: 20 }, { key: 'potion', uses: 3 }],
    bio: '游历四方的骑将，曾在断桥边救下整村人。笑起来很响，心事却从不外露。'
  },
  xuanyi: {
    id: 'xuanyi', name: '玄漪', cls: 'mage', level: 5, exp: 0, portrait: 'xuanyi', element: 'water',
    stats: { hp: 19, str: 1, mag: 10, skl: 8, spd: 8, lck: 4, def: 3, res: 8 },
    growth: { hp: 40, str: 10, mag: 60, skl: 50, spd: 45, lck: 30, def: 20, res: 50 },
    ranks: { tome: 'C' }, personal: { name: '霜心', desc: '命中后使目标下回合移动 -1。', movePenaltyOnHit: 1 },
    personal2: { name: '寒川', desc: '两格内敌军命中 -8。', enemyAuraHit: 8 },
    items: [{ key: 'ice_tome', uses: 25 }, { key: 'potion', uses: 3 }],
    bio: '断桥古渡的守渡人，性子冷，咒也冷。她记得每一个渡河人的名字。'
  },
  moya: {
    id: 'moya', name: '墨鸦', cls: 'rogue', level: 7, exp: 0, portrait: 'moya', element: 'metal',
    stats: { hp: 22, str: 7, mag: 0, skl: 10, spd: 12, lck: 7, def: 5, res: 4 },
    growth: { hp: 45, str: 40, mag: 0, skl: 60, spd: 65, lck: 50, def: 25, res: 25 },
    ranks: { dagger: 'B' }, personal: { name: '无影', desc: '相邻无友军时回避 +15。', avoidIfLone: 15 },
    personal2: { name: '旧主', desc: '对披甲目标暴击 +10。', critVsArmor: 10 },
    items: [{ key: 'shadow_dagger', uses: 20 }, { key: 'potion', uses: 3 }],
    bio: '赤砂关里谁的账都敢偷的人。没人知道他从哪来，包括他自己。'
  },
  chisang: {
    id: 'chisang', name: '赤桑', cls: 'talisman', level: 8, exp: 0, portrait: 'chisang', element: 'fire',
    stats: { hp: 23, str: 2, mag: 11, skl: 10, spd: 7, lck: 5, def: 5, res: 8 },
    growth: { hp: 45, str: 10, mag: 55, skl: 55, spd: 40, lck: 30, def: 25, res: 45 },
    ranks: { talisman: 'C' }, personal: { name: '引雷', desc: '对披甲目标暴击 +10。', critVsArmor: 10 },
    personal2: { name: '守坛人', desc: '站在阵眼上时伤害 +2。', selfDamageOnNode: 2 },
    items: [{ key: 'spirit_talisman', uses: 25 }, { key: 'potion', uses: 3 }],
    bio: '玄冰祭坛的守符人，画符时从不说话。他说雷落下来之前，天地会先安静一瞬。'
  },
  aman: {
    id: 'aman', name: '阿蛮', cls: 'beastcaller', level: 9, exp: 0, portrait: 'aman', element: 'earth',
    stats: { hp: 30, str: 11, mag: 4, skl: 7, spd: 6, lck: 4, def: 9, res: 4 },
    growth: { hp: 70, str: 55, mag: 10, skl: 40, spd: 35, lck: 25, def: 40, res: 20 },
    ranks: { beast: 'S' }, personal: { name: '兽语', desc: '山灵狼存活时自身伤害 +2。', selfDamageIfSummon: 2 },
    personal2: { name: '唤兽', desc: '每章可多召唤 1 次。', summonUsesBonus: 1 },
    items: [{ key: 'beast_claw', uses: 99 }, { key: 'herb', uses: 2 }],
    bio: '云梦泽长大的兽使，能和山灵说话。她不太会说人的客套话，但会分你半只烤鱼。'
  },
  yunling: {
    id: 'yunling', name: '云翎', cls: 'wingman', level: 10, exp: 0, portrait: 'yunling', element: 'metal',
    stats: { hp: 24, str: 8, mag: 2, skl: 11, spd: 12, lck: 7, def: 5, res: 6 },
    growth: { hp: 50, str: 40, mag: 10, skl: 60, spd: 60, lck: 40, def: 25, res: 35 },
    ranks: { bow: 'C', lance: 'D' }, personal: { name: '御风', desc: '站在阵眼上时回避 +15。', avoidOnNode: 15 },
    personal2: { name: '天羽', desc: '对飞行目标命中 +15。', hitVsFlying: 15 },
    items: [{ key: 'iron_bow', uses: 30 }, { key: 'iron_lance', uses: 30 }, { key: 'potion', uses: 3 }],
    bio: '天柱废墟的羽人游侠，翅羽在月光下是银色的。她答应过一个人，要替他把山外的天看完。'
  },
  jiangsi: {
    id: 'jiangsi', name: '姜姒', cls: 'summoner', level: 9, exp: 0, portrait: 'jiangsi', element: 'earth',
    stats: { hp: 24, str: 4, mag: 9, skl: 8, spd: 6, lck: 6, def: 5, res: 9 },
    growth: { hp: 55, str: 25, mag: 50, skl: 45, spd: 35, lck: 40, def: 30, res: 50 },
    ranks: { voice: 'C' }, personal: { name: '通兽语', desc: '己方每有 1 只召唤兽在场，自身与相邻友军伤害 +2。', dmgPerSummon: 2 },
    personal2: { name: '遗音', desc: '命中 +5。', hit: 5 },
    items: [{ key: 'bone_flute', uses: 30 }, { key: 'potion', uses: 3 }],
    bio: '巫咸氏最后的祭裔，笛声一起，山野百兽都认得她。她说兽比人守信，所以宁愿和兽说话。'
  },
  yusqiu: {
    id: 'yusqiu', name: '虞素秋', cls: 'songstress', level: 8, exp: 0, portrait: 'yusqiu', element: 'none',
    stats: { hp: 20, str: 2, mag: 10, skl: 9, spd: 8, lck: 7, def: 3, res: 8 },
    growth: { hp: 45, str: 15, mag: 55, skl: 50, spd: 45, lck: 45, def: 20, res: 50 },
    ranks: { voice: 'C' }, personal: { name: '鲛绡', desc: '相邻友军回避 +5；歌类法术命中 +5。', adjacentAllyAvoid: 5, hit: 5 },
    personal2: { name: '潮生', desc: '歌的射程 +1。', songRange: 1 },
    items: [{ key: 'tide_voice', uses: 25 }, { key: 'potion', uses: 3 }],
    bio: '溯游而上的鲛人歌者，尾鳍在月下是淡水色的。她的歌能安魂，也能让千军静默一瞬。'
  },
  /* ---------------- 替补援军（P3.3）：第 5 章后固定入队 ----------------
   * reserve: true → 入队时等级对齐队伍平均（game.alignLevel）。 */
  xiewuyi: {
    id: 'xiewuyi', name: '谢无衣', cls: 'talisman', level: 6, exp: 0, portrait: 'xiewuyi', element: 'fire',
    reserve: true,
    stats: { hp: 21, str: 2, mag: 9, skl: 9, spd: 7, lck: 6, def: 4, res: 9 },
    growth: { hp: 45, str: 10, mag: 50, skl: 50, spd: 40, lck: 40, def: 25, res: 50 },
    ranks: { talisman: 'C' }, personal: { name: '符胆', desc: '魔抗 +2；相邻友军命中 +5。', res: 2, adjacentAllyHit: 5 },
    personal2: { name: '朱笔', desc: '对披甲目标暴击 +12。', critVsArmor: 12 },
    items: [{ key: 'greater_talisman', uses: 20 }, { key: 'potion', uses: 3 }],
    bio: '游方画符的术士，符纸永远比盘缠多。他说符是写给天看的信，写歪了就没人收。'
  },
  tengdage: {
    id: 'tengdage', name: '滕大戈', cls: 'axeman', level: 6, exp: 0, portrait: 'tengdage', element: 'earth',
    reserve: true,
    stats: { hp: 32, str: 11, mag: 0, skl: 6, spd: 4, lck: 4, def: 12, res: 3 },
    growth: { hp: 80, str: 55, mag: 0, skl: 35, spd: 25, lck: 25, def: 50, res: 20 },
    ranks: { axe: 'B' }, personal: { name: '断锋', desc: '对披甲目标命中 +15。', hitVsArmor: 15 },
    personal2: { name: '老骨', desc: '护甲 +3；魔抗 +1。', def: 3, res: 1 },
    items: [{ key: 'steel_blade', uses: 20 }, { key: 'potion', uses: 3 }],
    bio: '退役的刀客，刀上豁口比年纪多。他不爱说话，只在夜里擦刀，擦到天亮。'
  },

  /* ---------------- 二期扩容「下海」：六名新同伴 ---------------- */
  axi: {
    id: 'axi', name: '阿汐', cls: 'tidecaller', level: 10, exp: 0, portrait: 'axi', element: 'water',
    stats: { hp: 24, str: 3, mag: 12, skl: 11, spd: 9, lck: 8, def: 4, res: 11 },
    growth: { hp: 45, str: 10, mag: 55, skl: 45, spd: 40, lck: 40, def: 20, res: 55 },
    ranks: { staff: 'C' },
    personal: { name: '潮听', desc: '相邻友军命中 +5；杖的治疗量 +1。', adjacentAllyHit: 5, healBonus: 1 },
    personal2: { name: '潮退', desc: '回避 +8。', avoidFlat: 8 },
    items: [{ key: 'tingchao', uses: 30 }, { key: 'potion', uses: 3 }],
    bio: '海边渔村的女儿，能把耳朵贴在船板上听出潮里有没有人。她说海眼在数人，数到谁，谁就回不来。'
  },
  aoxiao: {
    id: 'aoxiao', name: '敖绡', cls: 'waveblade', level: 11, exp: 0, portrait: 'aoxiao', element: 'water',
    stats: { hp: 29, str: 11, mag: 0, skl: 11, spd: 11, lck: 6, def: 7, res: 5 },
    growth: { hp: 55, str: 50, mag: 0, skl: 55, spd: 50, lck: 30, def: 35, res: 25 },
    ranks: { sword: 'C' },
    personal: { name: '鲛刃', desc: '水气缠刃，命中 +12。', hit: 12 },
    personal2: { name: '逆鳞', desc: '生命低于一半时护甲 +3。', defIfWounded: 3 },
    items: [{ key: 'liechao', uses: 35 }, { key: 'potion', uses: 3 }],
    bio: '鲛人族的年轻武将，鳞片在淡水里会发白。她来岸上不是为守脉，是为族里讨一个「为什么被抽」的说法。'
  },
  gongshumao: {
    id: 'gongshumao', name: '公输卯', cls: 'artificer', level: 10, exp: 0, portrait: 'gongshumao', element: 'metal',
    stats: { hp: 25, str: 7, mag: 0, skl: 13, spd: 9, lck: 7, def: 6, res: 4 },
    growth: { hp: 50, str: 35, mag: 0, skl: 60, spd: 45, lck: 40, def: 35, res: 20 },
    ranks: { bow: 'C' },
    personal: { name: '机枢', desc: '对飞行目标命中 +10。', hitVsFlying: 10 },
    personal2: { name: '巧手', desc: '未移动时命中 +10。', hitIfNoMove: 10 },
    items: [{ key: 'lianji', uses: 30 }, { key: 'potion', uses: 3 }],
    bio: '沉城里最后一个会修机关的人。他祖父给国师造过抽脉的机架，他要把那东西拆回来。'
  },
  taowujiu: {
    id: 'taowujiu', name: '陶无咎', cls: 'gravekeeper', level: 11, exp: 0, portrait: 'taowujiu', element: 'earth',
    stats: { hp: 27, str: 5, mag: 10, skl: 9, spd: 7, lck: 6, def: 7, res: 10 },
    growth: { hp: 50, str: 15, mag: 45, skl: 45, spd: 35, lck: 35, def: 35, res: 50 },
    ranks: { talisman: 'C' },
    personal: { name: '守夜', desc: '魔抗 +2；站在阵眼上回避 +10。', res: 2, avoidOnNode: 10 },
    personal2: { name: '刻碑', desc: '对披甲目标暴击 +12。', critVsArmor: 12 },
    items: [{ key: 'wuzibei', uses: 30 }, { key: 'potion', uses: 3 }],
    bio: '在沉城给死人刻了三十年碑。碑上没名字的，他就在心里记一个，记到现在记满了。'
  },
  shenyan: {
    id: 'shenyan', name: '沈砚', cls: 'chainwarden', level: 12, exp: 0, portrait: 'shenyan', element: 'metal',
    stats: { hp: 31, str: 10, mag: 0, skl: 10, spd: 8, lck: 5, def: 10, res: 4 },
    growth: { hp: 60, str: 45, mag: 0, skl: 45, spd: 35, lck: 25, def: 45, res: 20 },
    ranks: { chain: 'C' },
    personal: { name: '旧部', desc: '命中 +5；相邻友军命中 +3。', hit: 5, adjacentAllyHit: 3 },
    personal2: { name: '锁喉', desc: '暴击 +10。', crit: 10 },
    items: [{ key: 'fuchao_suo', uses: 35 }, { key: 'potion', uses: 3 }],
    bio: '玄阙军里押送守脉人的老兵。链子上的番号他没刮掉，说留着好认——认自己，也认那些被他押走的人。'
  },
  shuangxu: {
    id: 'shuangxu', name: '霜序', cls: 'archer', level: 12, exp: 0, portrait: 'shuangxu', element: 'none',
    stats: { hp: 24, str: 8, mag: 0, skl: 12, spd: 11, lck: 8, def: 5, res: 5 },
    growth: { hp: 45, str: 40, mag: 0, skl: 60, spd: 55, lck: 45, def: 25, res: 25 },
    ranks: { bow: 'C' },
    personal: { name: '羽落', desc: '对飞行目标命中 +15。', hitVsFlying: 15 },
    personal2: { name: '寒翎', desc: '暴击 +8。', crit: 8 },
    items: [{ key: 'shuangyu', uses: 28 }, { key: 'potion', uses: 3 }],
    bio: '羽人的斥候，替云翎守海面。他不怎么落地，说脚一沾土就会想起自己没救下的人。'
  }
};

/* ---------------- 遗言（P3.3 英魂碑） ----------------
 * 阵亡后写在碑上的一句话，不参与任何数值。 */
const EPITAPHS = {
  yunce: '守脉人守的从来不是脉。这句话我到最后才听懂。',
  yankui: '这次……身后有人。够了。',
  luming: '下一个，一定要救回来。',
  qingluo: '箭囊空了。山还在。',
  bailu: '这回没逃。',
  xuanyi: '渡口的名字，我记到最后了。',
  moya: '这次我选你。',
  chisang: '活下去才是赎罪——我算是……明白了。',
  aman: '我属于选我那一边的人。',
  yunling: '族是血，队是选。我选你们。',
  jiangsi: '约不是束缚，是我记得你。',
  yusqiu: '让消失的东西……有声音。',
  xiewuyi: '符画完了。剩下的路，你们走。',
  tengdage: '刀钝了，人没退。',
  axi: '潮里没有我的名字……那我就不用怕被数到。',
  aoxiao: '族里问起来，就说我先上岸了。',
  gongshumao: '机架拆完了。剩下的……你们自己造。',
  taowujiu: '碑上终于有一个活人的名字了。',
  shenyan: '番号刮掉了。这回没人认得我。',
  shuangxu: '替我看着海面。别让它上来。'
};

if (typeof window !== 'undefined') window.EPITAPHS = EPITAPHS;

const HERO_ORDER = ['yunce', 'yankui', 'luming', 'qingluo', 'bailu', 'xuanyi', 'moya', 'chisang', 'aman', 'yunling', 'jiangsi', 'yusqiu', 'xiewuyi', 'tengdage', 'axi', 'aoxiao', 'gongshumao', 'taowujiu', 'shenyan', 'shuangxu'];
const INITIAL_ROSTER = ['yunce', 'yankui', 'luming'];

/* ---------------- 敌人模板 ----------------
 * base 为 1 级基准；growth 为每级增量；实际属性在生成时叠加等级与难度。
 */
const ENEMY_TYPES = {
  bandit: {
    name: '山贼', ai: 'aggressive', moveType: 'foot', move: 5, weapons: ['bandit_axe'], tags: ['human'],
    drop: { key: 'iron_sword', chance: 0.15 },
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
    drop: { key: 'iron_blade', chance: 0.12 },
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
    drop: { key: 'ice_tome', chance: 0.15 },
    base: { hp: 18, str: 1, mag: 7, skl: 6, spd: 5, lck: 3, def: 3, res: 6 },
    growth: { hp: 1.2, str: 0.1, mag: 0.65, skl: 0.45, spd: 0.35, lck: 0.2, def: 0.2, res: 0.5 }
  },
  priest: {
    name: '巫祝', ai: 'healer', moveType: 'foot', move: 5, weapons: ['heal_staff'], tags: ['human'],
    drop: { key: 'potion', chance: 0.20 },
    base: { hp: 17, str: 1, mag: 6, skl: 5, spd: 5, lck: 4, def: 2, res: 7 },
    growth: { hp: 1.1, str: 0.1, mag: 0.5, skl: 0.35, spd: 0.3, lck: 0.3, def: 0.15, res: 0.5 }
  },
  rogue: {
    name: '影盗', ai: 'aggressive', moveType: 'foot', move: 6, weapons: ['poison_dagger'], tags: ['human'],
    drop: { key: 'dagger', chance: 0.15 },
    base: { hp: 19, str: 6, mag: 0, skl: 9, spd: 10, lck: 6, def: 4, res: 3 },
    growth: { hp: 1.2, str: 0.45, mag: 0, skl: 0.55, spd: 0.6, lck: 0.35, def: 0.2, res: 0.2 }
  },
  elite: {
    name: '浊甲卫', ai: 'guard', moveType: 'armor', move: 4, weapons: ['turbid_lance'], tags: ['armor', 'human'],
    drop: { key: 'steel_lance', chance: 0.10 },
    base: { hp: 30, str: 10, mag: 0, skl: 5, spd: 3, lck: 2, def: 14, res: 4 },
    growth: { hp: 2.1, str: 0.65, mag: 0, skl: 0.4, spd: 0.2, lck: 0.1, def: 0.65, res: 0.3 }
  },

  /* ---- 首领 ---- */
  shanxiao: {
    /* 精英词缀（与每章精英共享池，见 data-systems.js ELITE_AFFIXES） */
    affixes: ['berserk'],
    name: '山魈王', ai: 'guard', moveType: 'beast', move: 5, weapons: ['boss_axe'], tags: ['beast'], boss: true, element: 'metal',
    base: { hp: 38, str: 12, mag: 0, skl: 7, spd: 5, lck: 3, def: 8, res: 3 },
    growth: { hp: 2.2, str: 0.7, mag: 0, skl: 0.45, spd: 0.3, lck: 0.2, def: 0.5, res: 0.2 }
  },
  bamboo: {
    /* 精英词缀（与每章精英共享池，见 data-systems.js ELITE_AFFIXES） */
    affixes: ['regen'],
    name: '竹妖', ai: 'guard', moveType: 'plant', move: 4, weapons: ['boss_vine'], tags: ['plant'], boss: true, element: 'wood',
    base: { hp: 34, str: 2, mag: 11, skl: 8, spd: 6, lck: 4, def: 6, res: 8 },
    growth: { hp: 2, str: 0.1, mag: 0.7, skl: 0.5, spd: 0.35, lck: 0.2, def: 0.4, res: 0.55 }
  },
  waterghost: {
    /* 精英词缀（与每章精英共享池，见 data-systems.js ELITE_AFFIXES） */
    affixes: ['shield'],
    name: '水鬼', ai: 'aggressive', moveType: 'amphibious', move: 5, weapons: ['boss_trident'], tags: ['undead'], boss: true, element: 'water',
    base: { hp: 38, str: 11, mag: 2, skl: 8, spd: 7, lck: 3, def: 8, res: 6 },
    growth: { hp: 2.2, str: 0.6, mag: 0.2, skl: 0.5, spd: 0.4, lck: 0.15, def: 0.45, res: 0.4 }
  },
  chisha: {
    /* 精英词缀（与每章精英共享池，见 data-systems.js ELITE_AFFIXES） */
    affixes: ['berserk'],
    name: '赤砂将军', ai: 'guard', moveType: 'horse', move: 6, weapons: ['boss_saber'], tags: ['human'], boss: true, element: 'fire',
    base: { hp: 42, str: 14, mag: 0, skl: 11, spd: 10, lck: 6, def: 10, res: 5 },
    growth: { hp: 2.2, str: 0.7, mag: 0, skl: 0.6, spd: 0.5, lck: 0.3, def: 0.5, res: 0.3 }
  },
  icexiao: {
    /* 精英词缀（与每章精英共享池，见 data-systems.js ELITE_AFFIXES） */
    affixes: ['shield'],
    name: '冰魈', ai: 'guard', moveType: 'beast', move: 5, weapons: ['boss_claw'], tags: ['beast'], boss: true, element: 'water',
    base: { hp: 44, str: 13, mag: 6, skl: 9, spd: 8, lck: 4, def: 11, res: 8 },
    growth: { hp: 2.4, str: 0.7, mag: 0.35, skl: 0.5, spd: 0.4, lck: 0.2, def: 0.55, res: 0.45 }
  },
  swampdragon: {
    /* 精英词缀（与每章精英共享池，见 data-systems.js ELITE_AFFIXES） */
    affixes: ['regen'],
    name: '沼龙', ai: 'aggressive', moveType: 'amphibious', move: 5, weapons: ['boss_jaw'], tags: ['beast'], boss: true, element: 'earth',
    base: { hp: 50, str: 15, mag: 4, skl: 8, spd: 7, lck: 4, def: 12, res: 7 },
    growth: { hp: 2.6, str: 0.75, mag: 0.3, skl: 0.5, spd: 0.4, lck: 0.2, def: 0.6, res: 0.4 }
  },
  turbidgeneral: {
    /* 精英词缀（与每章精英共享池，见 data-systems.js ELITE_AFFIXES） */
    affixes: ['aura'],
    name: '浊将', ai: 'guard', moveType: 'armor', move: 4, weapons: ['boss_turbid'], tags: ['armor', 'undead'], boss: true, element: 'earth',
    base: { hp: 52, str: 16, mag: 5, skl: 10, spd: 5, lck: 4, def: 16, res: 10 },
    growth: { hp: 2.8, str: 0.8, mag: 0.35, skl: 0.55, spd: 0.3, lck: 0.2, def: 0.7, res: 0.5 }
  },
  xuanque: {
    /* 精英词缀（与每章精英共享池，见 data-systems.js ELITE_AFFIXES） */
    affixes: ['regen'],
    name: '玄阙', ai: 'guard', moveType: 'foot', move: 5, weapons: ['boss_ritual'], tags: ['human'], boss: true, phases: 2, element: 'metal',
    base: { hp: 58, str: 6, mag: 18, skl: 14, spd: 12, lck: 8, def: 12, res: 14 },
    growth: { hp: 3, str: 0.4, mag: 0.85, skl: 0.65, spd: 0.5, lck: 0.3, def: 0.5, res: 0.6 },
    phase2: {
      name: '噬脉兽', weapon: 'beast_ritual', moveType: 'beast', move: 6, tags: ['beast'],
      base: { hp: 72, str: 20, mag: 14, skl: 14, spd: 10, lck: 6, def: 18, res: 14 },
      growth: { hp: 3.2, str: 0.9, mag: 0.5, skl: 0.6, spd: 0.4, lck: 0.2, def: 0.6, res: 0.5 }
    }
  },

  /* ---- A/B 路线 Boss（P3.1 分歧线；属性介于第 4 章与汇合章之间） ---- */
  forestmaster: {
    /* 精英词缀（与每章精英共享池，见 data-systems.js ELITE_AFFIXES） */
    affixes: ['berserk'],
    name: '林魈主', ai: 'guard', moveType: 'plant', move: 4, weapons: ['boss_claw'], tags: ['plant'], boss: true, element: 'wood',
    base: { hp: 46, str: 13, mag: 8, skl: 10, spd: 7, lck: 4, def: 10, res: 8 },
    growth: { hp: 2.5, str: 0.7, mag: 0.45, skl: 0.55, spd: 0.35, lck: 0.2, def: 0.5, res: 0.45 }
  },
  bridgewraith: {
    affixes: ['shield'],
    name: '桥魅', ai: 'aggressive', moveType: 'amphibious', move: 5, weapons: ['boss_trident'], tags: ['undead'], boss: true, element: 'water',
    base: { hp: 48, str: 14, mag: 4, skl: 11, spd: 9, lck: 5, def: 11, res: 7 },
    growth: { hp: 2.6, str: 0.72, mag: 0.25, skl: 0.58, spd: 0.42, lck: 0.22, def: 0.55, res: 0.4 }
  },
  valleydragon: {
    affixes: ['regen'],
    name: '谷螭', ai: 'guard', moveType: 'amphibious', move: 5, weapons: ['boss_jaw'], tags: ['beast'], boss: true, element: 'earth',
    base: { hp: 47, str: 14, mag: 3, skl: 9, spd: 6, lck: 4, def: 12, res: 6 },
    growth: { hp: 2.6, str: 0.72, mag: 0.2, skl: 0.5, spd: 0.32, lck: 0.2, def: 0.6, res: 0.35 }
  },
  tidewyrm: {
    affixes: ['berserk'],
    name: '浪蛟', ai: 'aggressive', moveType: 'amphibious', move: 6, weapons: ['boss_trident'], tags: ['beast'], boss: true, element: 'water',
    base: { hp: 50, str: 15, mag: 4, skl: 10, spd: 8, lck: 5, def: 11, res: 7 },
    growth: { hp: 2.7, str: 0.75, mag: 0.25, skl: 0.55, spd: 0.4, lck: 0.22, def: 0.55, res: 0.4 }
  },

  /* ---- 下海 Boss（第 12 章无字碑）---- */
  relickeeper: {
    affixes: ['shield'],
    name: '守脉人遗骸', ai: 'guard', moveType: 'foot', move: 5, weapons: ['boss_relic'], tags: ['undead', 'armor'], boss: true, phases: 2, element: 'metal',
    base: { hp: 62, str: 18, mag: 8, skl: 13, spd: 8, lck: 5, def: 17, res: 12 },
    growth: { hp: 3, str: 0.85, mag: 0.4, skl: 0.6, spd: 0.35, lck: 0.2, def: 0.7, res: 0.5 },
    /* 二阶段：碑石崩开，只剩「守」的那一半还在动 */
    phase2: {
      name: '无字之骸', weapon: 'boss_relic', moveType: 'armor', move: 4, tags: ['undead', 'armor'], dialogue: 'boss_phase2_relic',
      base: { hp: 74, str: 21, mag: 10, skl: 13, spd: 7, lck: 4, def: 21, res: 14 },
      growth: { hp: 3.2, str: 0.9, mag: 0.45, skl: 0.6, spd: 0.3, lck: 0.2, def: 0.8, res: 0.55 }
    }
  },

  /* 友方召唤物 */
  ally_wolf: {
    name: '山灵狼', ai: 'ally', moveType: 'beast', move: 6, weapons: ['wolf_claw'], tags: ['beast'], ally: true,
    base: { hp: 20, str: 8, mag: 0, skl: 8, spd: 10, lck: 5, def: 5, res: 3 },
    growth: { hp: 1.8, str: 0.6, mag: 0, skl: 0.55, spd: 0.6, lck: 0.3, def: 0.35, res: 0.25 }
  },
  ally_leopard: {
    name: '云豹', ai: 'ally', moveType: 'beast', move: 7, weapons: ['leopard_claw'], tags: ['beast'], ally: true,
    base: { hp: 26, str: 11, mag: 0, skl: 11, spd: 13, lck: 6, def: 6, res: 5 },
    growth: { hp: 2.1, str: 0.7, mag: 0, skl: 0.65, spd: 0.75, lck: 0.35, def: 0.4, res: 0.3 }
  },
  ally_baize: {
    name: '白泽', ai: 'ally', moveType: 'flying', move: 7, weapons: ['baize_horn'], tags: ['beast', 'flying'], ally: true,
    base: { hp: 34, str: 13, mag: 8, skl: 13, spd: 12, lck: 10, def: 9, res: 10 },
    growth: { hp: 2.6, str: 0.8, mag: 0.5, skl: 0.7, spd: 0.6, lck: 0.5, def: 0.5, res: 0.55 }
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
  },
  {
    id: 'jiangsi_yunce', a: 'jiangsi', b: 'yunce', name: '笛与剑',
    dialogues: {
      C: [
        { who: 'jiangsi', text: '守脉人，你的剑在哭。它跟着你，很累了。' },
        { who: 'yunce', text: '剑不会哭。' },
        { who: 'jiangsi', text: '会。我听得见。今晚我吹笛给它听，你别握那么紧。' }
      ],
      B: [
        { who: 'yunce', text: '姜姒，你召唤的东西……认得路吗？' },
        { who: 'jiangsi', text: '认得。兽比人认路，也认人。它说你心里有一条河，还没结冰。' },
        { who: 'yunce', text: '……那是因为还没到冬天。' }
      ],
      A: [
        { who: 'jiangsi', text: '守脉人，如果有一天笛声停了，你会记得我吗？' },
        { who: 'yunce', text: '笛声不会停。' },
        { who: 'jiangsi', text: '那你可要听一辈子了。' },
        { who: 'yunce', text: '好。' }
      ]
    }
  },
  {
    id: 'yusqiu_xuanyi', a: 'yusqiu', b: 'xuanyi', name: '潮与冰',
    dialogues: {
      C: [
        { who: 'yusqiu', text: '你的渡口结冰了。这么冷的水，你怎么待了这么多年？' },
        { who: 'xuanyi', text: '习惯了。' },
        { who: 'yusqiu', text: '习惯是最冷的咒。我唱一首歌，替你暖一暖？' }
      ],
      B: [
        { who: 'xuanyi', text: '素秋，你的歌……能让死人安息吗？' },
        { who: 'yusqiu', text: '不能。我只能让活人别哭。你想念的那个名字，叫什么？' },
        { who: 'xuanyi', text: '……下一个渡河人，我会告诉你。' }
      ],
      A: [
        { who: 'yusqiu', text: '玄漪，如果灵脉通了，冰化了，你的渡口怎么办？' },
        { who: 'xuanyi', text: '那就造船。' },
        { who: 'yusqiu', text: '我游了这么远，等的就是这句话。' }
      ]
    }
  },
  /* P3.2 新增四组：把心结的「了断」对象接进支援网 */
  {
    id: 'yunce_moya', a: 'yunce', b: 'moya', name: '旧影',
    dialogues: {
      C: [
        { who: 'moya', text: '别谢我。我这人做好事会折寿。' },
        { who: 'yunce', text: '那你还做。' },
        { who: 'moya', text: '……我旧主欠的账，我替他还一点，不行吗？' }
      ],
      B: [
        { who: 'yunce', text: '墨鸦，你恨他吗？' },
        { who: 'moya', text: '恨。可我更恨自己——跟了他十年，才知道他要拿活人换脉。' },
        { who: 'yunce', text: '知道得晚，好过一直不知道。' },
        { who: 'moya', text: '……你这话，怎么比刀还钝。' }
      ],
      A: [
        { who: 'moya', text: '云策。若有一天我挡不住他，你别管我，往前走。' },
        { who: 'yunce', text: '我不往前走。' },
        { who: 'moya', text: '为什么？' },
        { who: 'yunce', text: '我背得动一个人，就背得动两个人。' }
      ]
    }
  },
  {
    id: 'yunce_bailu', a: 'yunce', b: 'bailu', name: '逃将',
    dialogues: {
      C: [
        { who: 'bailu', text: '守脉人，你打算怎么赢？靠那半卷残策？' },
        { who: 'yunce', text: '靠你们。' },
        { who: 'bailu', text: '……啧。这话我不会记着的。' }
      ],
      B: [
        { who: 'bailu', text: '我逃过一次。整营的人替我死。你知道那种感觉吗？' },
        { who: 'yunce', text: '不知道。但我知道背着它走路，会很沉。' },
        { who: 'bailu', text: '那你帮我背一半？' },
        { who: 'yunce', text: '好。' }
      ],
      A: [
        { who: 'bailu', text: '云策，我不逃了。' },
        { who: 'yunce', text: '嗯。' },
        { who: 'bailu', text: '你就这反应？我好不容易说的！' },
        { who: 'yunce', text: '我怕说多了，你又要反悔。' }
      ]
    }
  },
  {
    id: 'yankui_aman', a: 'yankui', b: 'aman', name: '山与兽',
    dialogues: {
      C: [
        { who: 'aman', text: '大个子，你走路像山在挪。兽都躲着你。' },
        { who: 'yankui', text: '我数过了。三十七步，一只也没跑。' },
        { who: 'aman', text: '……它们是不敢跑。' }
      ],
      B: [
        { who: 'aman', text: '你为什么总在数东西？' },
        { who: 'yankui', text: '数清了，就不会少。' },
        { who: 'aman', text: '人会少的。你数不过来。' },
        { who: 'yankui', text: '那我一个一个记。' }
      ],
      A: [
        { who: 'yankui', text: '阿蛮。你的兽，认我吗？' },
        { who: 'aman', text: '它们说，你身上有山的味道，没有人的味道。' },
        { who: 'yankui', text: '……那算是认了。' },
        { who: 'aman', text: '算。山不会走，它们喜欢不会走的东西。' }
      ]
    }
  },
  {
    id: 'qingluo_xuanyi', a: 'qingluo', b: 'xuanyi', name: '草与冰',
    dialogues: {
      C: [
        { who: 'qingluo', text: '渡口这么冷，怎么一株草都不长？' },
        { who: 'xuanyi', text: '长过。冻死了。' },
        { who: 'qingluo', text: '那我种耐寒的。' }
      ],
      B: [
        { who: 'xuanyi', text: '你种的草，又被冰压了。' },
        { who: 'qingluo', text: '那就再种。草这东西，你越踩它越往缝里长。' },
        { who: 'xuanyi', text: '……人也是。' }
      ],
      A: [
        { who: 'qingluo', text: '玄漪，冰化的时候，你想先看见什么？' },
        { who: 'xuanyi', text: '绿色。' },
        { who: 'qingluo', text: '那我提前给你种满。' }
      ]
    }
  },
  /* 二期「下海」五组：把六名新人接进支援网，谢无衣与滕大戈仍保持独行 */
  {
    id: 'axi_yusqiu', a: 'axi', b: 'yusqiu', name: '潮声与歌',
    dialogues: {
      C: [
        { who: 'yusqiu', text: '你在听什么？' },
        { who: 'axi', text: '潮。你呢？' },
        { who: 'yusqiu', text: '我在唱潮。我们听的可能是同一样东西。' }
      ],
      B: [
        { who: 'axi', text: '你的歌里有一句，是我娘常哼的。' },
        { who: 'yusqiu', text: '那句是我在沧浪津学的。教我的人不肯说名字。' },
        { who: 'axi', text: '……她左手小指，是不是少了一节？' },
        { who: 'yusqiu', text: '是。' }
      ],
      A: [
        { who: 'yusqiu', text: '阿汐，我把那首歌教给你吧。' },
        { who: 'axi', text: '教了，我就得自己唱了。' },
        { who: 'yusqiu', text: '对。听见的人要接着唱，海才不会把它忘掉。' },
        { who: 'axi', text: '……那你先唱第一句。' }
      ]
    }
  },
  {
    id: 'aoxiao_shenyan', a: 'aoxiao', b: 'shenyan', name: '旧敌',
    dialogues: {
      C: [
        { who: 'shenyan', text: '你这把刀，杀过鲛人。' },
        { who: 'aoxiao', text: '你这链子，锁过鲛人。' },
        { who: 'shenyan', text: '……那我们扯平了。' }
      ],
      B: [
        { who: 'aoxiao', text: '你为什么把番号牌留着？' },
        { who: 'shenyan', text: '摘下来，我就不知道自己是谁了。' },
        { who: 'aoxiao', text: '那你现在知道了吗？' },
        { who: 'shenyan', text: '知道一点。还不够。' }
      ],
      A: [
        { who: 'shenyan', text: '敖绡。当年在下游拦你的那队人，是我带的。' },
        { who: 'aoxiao', text: '我知道。你腰上那道疤是我留的。' },
        { who: 'shenyan', text: '那你为什么不杀我。' },
        { who: 'aoxiao', text: '因为你后来把链子扔了。扔链子的人，我不想杀。' }
      ]
    }
  },
  {
    id: 'gongshumao_bailu', a: 'gongshumao', b: 'bailu', name: '蹄铁',
    dialogues: {
      C: [
        { who: 'bailu', text: '你会打蹄铁吗？' },
        { who: 'gongshumao', text: '会。但我不给马打。' },
        { who: 'bailu', text: '为什么？' },
        { who: 'gongshumao', text: '打过一次，那匹马后来死了。我记着。' }
      ],
      B: [
        { who: 'bailu', text: '它叫踏雪。前蹄有点跛。' },
        { who: 'gongshumao', text: '我看了。不是蹄子的事，是掌骨。' },
        { who: 'bailu', text: '能治？' },
        { who: 'gongshumao', text: '能。三天，别让它跑。' }
      ],
      A: [
        { who: 'bailu', text: '卯师傅，蹄铁打好了？' },
        { who: 'gongshumao', text: '打好了。我多打了一副，备用。' },
        { who: 'bailu', text: '……你不是说不给马打蹄铁吗。' },
        { who: 'gongshumao', text: '它不是马。它是踏雪。' }
      ]
    }
  },
  {
    id: 'taowujiu_jiangsi', a: 'taowujiu', b: 'jiangsi', name: '名与笛',
    dialogues: {
      C: [
        { who: 'jiangsi', text: '你身上有碑的味道。' },
        { who: 'taowujiu', text: '石粉。刻了三十年，洗不掉。' },
        { who: 'jiangsi', text: '不是石粉。是名字的味道。' }
      ],
      B: [
        { who: 'taowujiu', text: '你召来的东西，会说自己叫什么吗？' },
        { who: 'jiangsi', text: '不会。它们只记得自己怎么死的。' },
        { who: 'taowujiu', text: '……那正好。我这儿缺名字。' },
        { who: 'jiangsi', text: '你要给它们刻碑？' }
      ],
      A: [
        { who: 'jiangsi', text: '陶无咎，我召来的兽里有三只，是被人抽干脉死的。' },
        { who: 'taowujiu', text: '名字呢？' },
        { who: 'jiangsi', text: '它们不说。' },
        { who: 'taowujiu', text: '那你替它们说。我刻。' }
      ]
    }
  },
  {
    id: 'shuangxu_qingluo', a: 'shuangxu', b: 'qingluo', name: '两把弓',
    dialogues: {
      C: [
        { who: 'shuangxu', text: '你射箭的时候不抬头。' },
        { who: 'qingluo', text: '抬头会慢半拍。' },
        { who: 'shuangxu', text: '我在天上看得见。你差的那半拍，我替你补。' }
      ],
      B: [
        { who: 'qingluo', text: '羽人是不是都不落地？' },
        { who: 'shuangxu', text: '落地要收翅。收翅的时候最容易被射。' },
        { who: 'qingluo', text: '那我不射你。' },
        { who: 'shuangxu', text: '……这话别对别的弓手说。' }
      ],
      A: [
        { who: 'shuangxu', text: '青萝，你练到第几层了？' },
        { who: 'qingluo', text: '能射落三百步外的灯。' },
        { who: 'shuangxu', text: '我能射落云里的鹰。' },
        { who: 'qingluo', text: '那我们比一场。输的人替对方背箭袋。' }
      ]
    }
  }
];

const SUPPORT_PAIR_MAP = {};
for (const s of SUPPORTS) {
  SUPPORT_PAIR_MAP[s.a + '_' + s.b] = s;
  SUPPORT_PAIR_MAP[s.b + '_' + s.a] = s;
}
