/* ============================================================
 * 山海策 · 灵脉  —  战役层：8 章地图 / 事件 / 剧情
 * 地图宽 16、高 8。字符含义见 data-core.js 的 TERRAIN。
 * ============================================================ */

/* 章末自动入队（保险网）：地图招募点之外的补充，键为章 id。
 * P3.1 起第 4 章末分 A/B 线：5A/6A/7A = 焚脉（追），5B/6B/7B = 守脉（守），第 8 章汇合。 */
const AUTO_JOINS = {
  1: ['qingluo'], 2: ['bailu'], 3: ['xuanyi'],
  '5A': ['chisang'], '6A': ['jiangsi', 'yusqiu'], '7A': ['aman', 'yunling'],
  '5B': ['jiangsi'], '6B': ['aman', 'yusqiu'], '7B': ['chisang', 'yunling']
};

const CHAPTERS = [
  {
    id: 1, no: 1, name: '青岚山门', theme: 'mountain',
    /* 本章精英词缀池（1~2 个；浊甲卫按出现顺序轮流佩戴，Boss 词缀见 ENEMY_TYPES） */
    affixPool: [],   // 教学章不设词缀
    intro: 'ch1_intro', outro: 'ch1_outro',
    objective: { type: 'rout', text: '歼灭所有敌军' },
    deployCount: 3,
    deployTiles: [[0, 6], [0, 7], [1, 6], [1, 7], [2, 6], [3, 6]],
    map: [
      'MM.f......MM..h.',
      'M...ff.......M..',
      '....f.....h.....',
      '..f..........v..',
      '......h....f....',
      '.f.........f....',
      '........LL......',
      '..v...h...f.....'
    ],
    // 阵眼升阶配置（P1.1）：tier 为初始阶数（省略 = 1 阶）。
    // 占领后驻守 2 个己方阶段 +1 阶，效果按阶倍增，最高 3 阶；被夺则清零。
    nodes: [
      { id: 'n1', x: 8, y: 6, type: 'attack', tier: 1 },
      { id: 'n2', x: 9, y: 6, type: 'life', tier: 1 }
    ],
    villages: [
      { x: 13, y: 3, name: '青岚村', recruit: 'qingluo', talk: 'join_qingluo' },
      { x: 2, y: 7, name: '山脚村', gold: 200, item: 'potion' }
    ],
    chests: [], shrines: [],
    enemies: [
      { type: 'bandit', lv: 2, x: 12, y: 4 },
      { type: 'bandit', lv: 1, x: 10, y: 3 },
      { type: 'wolf', lv: 1, x: 7, y: 4 },
      { type: 'bandit', lv: 2, x: 14, y: 5 },
      { type: 'shanxiao', lv: 3, x: 13, y: 2, boss: true }
    ],
    reinforcements: [
      { turn: 5, units: [{ type: 'bandit', lv: 2, x: 6, y: 0 }, { type: 'bandit', lv: 2, x: 9, y: 0 }] }
    ],
    side: { type: 'villages', text: '访问两处村庄', gold: 300, items: ['elixir'] },
    rewards: { gold: 500, items: ['potion', 'mat_iron', 'mat_iron'] },
    tips: '青萝在东北的青岚村。阵眼结束行动即可占领；占领后驻守两个己方阶段可升华升阶，脉流效果翻倍。'
  },
  {
    id: 2, no: 2, name: '雾隐竹海', theme: 'bamboo',
    /* 本章精英词缀池（1~2 个；浊甲卫按出现顺序轮流佩戴，Boss 词缀见 ENEMY_TYPES） */
    affixPool: ['berserk'],
    intro: 'ch2_intro', outro: 'ch2_outro',
    objective: { type: 'defend', turns: 6, text: '守住竹海六回合' },
    deployCount: 5,
    deployTiles: [[0, 5], [0, 6], [0, 7], [1, 5], [1, 6], [1, 7]],
    map: [
      '~~~~~~..~~~~~~~~',
      '~~~~...~~...~~~~',
      '..fS....h.......',
      '.f...........S..',
      '......f.........',
      '.h....f.....f...',
      '....S....F......',
      '..v...L..L......'
    ],
    nodes: [
      { id: 'n1', x: 6, y: 7, type: 'life' },
      { id: 'n2', x: 9, y: 7, type: 'life' }
    ],
    villages: [
      { x: 2, y: 7, name: '雾竹村', item: 'elixir' }
    ],
    chests: [],
    shrines: [
      { x: 3, y: 2, name: '听风祠', heal: 10 },
      { x: 13, y: 3, name: '望海祠', gold: 120 },
      { x: 4, y: 6, name: '守竹祠', heal: 10 }
    ],
    enemies: [
      { type: 'wolf', lv: 5, x: 5, y: 2 },
      { type: 'wolf', lv: 5, x: 9, y: 3 },
      { type: 'shaman', lv: 5, x: 4, y: 1 },
      { type: 'bandit', lv: 4, x: 2, y: 4 },
      { type: 'priest', lv: 4, x: 11, y: 2 },
      { type: 'wolf', lv: 6, x: 11, y: 4 },
      { char: 'bailu', x: 13, y: 4, ai: 'idle', recruitable: true, talkKey: 'join_bailu' },
      { type: 'bamboo', lv: 7, x: 10, y: 1, boss: true }
    ],
    reinforcements: [
      { turn: 3, units: [{ type: 'wolf', lv: 5, x: 6, y: 0 }, { type: 'wolf', lv: 5, x: 7, y: 0 }] }
    ],
    side: { type: 'shrines', text: '访问三处残祠', gold: 300, items: ['elixir'] },
    rewards: { gold: 700, items: ['potion', 'mat_iron', 'mat_iron'] },
    tips: '守住六回合即可。生脉阵眼会在己方阶段开始时治疗周围友军。东岸有位追车队的骑将，让云策相邻后使用「说得」。'
  },
  {
    id: 3, no: 3, name: '断桥古渡', theme: 'river',
    /* 本章精英词缀池（1~2 个；浊甲卫按出现顺序轮流佩戴，Boss 词缀见 ENEMY_TYPES） */
    affixPool: ['shield'],
    intro: 'ch3_intro', outro: 'ch3_outro',
    objective: { type: 'seize', text: '占领对岸渡口', gate: [13, 0] },
    deployCount: 5,
    deployTiles: [[0, 5], [0, 6], [1, 5], [1, 6], [1, 7], [2, 6]],
    map: [
      '........~~...G..',
      '..f.....~~......',
      '........~~..r...',
      '........==......',
      '........~~...v..',
      '..h.....~~...r..',
      '........==......',
      'C.v...LL~~..f..C'
    ],
    nodes: [
      { id: 'n1', x: 6, y: 7, type: 'flow' },
      { id: 'n2', x: 7, y: 7, type: 'flow' }
    ],
    villages: [
      { x: 2, y: 7, name: '渡口旧村', gold: 150 },
      { x: 13, y: 4, name: '望归村', item: 'potion' }
    ],
    chests: [
      { x: 0, y: 7, name: '沉船古匣', item: 'silver_lance' },
      { x: 15, y: 7, name: '渡口秘匣', item: 'staff_duo' }
    ],
    shrines: [],
    enemies: [
      { type: 'wolf', lv: 5, x: 4, y: 2 },
      { type: 'shaman', lv: 6, x: 6, y: 4 },
      { type: 'rogue', lv: 7, x: 12, y: 5 },
      { type: 'bandit', lv: 6, x: 10, y: 2 },
      { type: 'priest', lv: 5, x: 11, y: 3 },
      { type: 'wolf', lv: 6, x: 14, y: 6 },
      { char: 'xuanyi', x: 13, y: 1, ai: 'idle', recruitable: true, talkKey: 'join_xuanyi' },
      { type: 'waterghost', lv: 9, x: 12, y: 1, boss: true }
    ],
    reinforcements: [
      { turn: 4, units: [{ type: 'bandit', lv: 6, x: 14, y: 2 }, { type: 'bandit', lv: 6, x: 15, y: 5 }] }
    ],
    side: { type: 'chest', text: '开启沉船古匣', gold: 200, items: ['elixir'] },
    rewards: { gold: 800, items: ['potion', 'mat_iron', 'mat_steel'] },
    tips: '水鬼能踏水而行。两座木桥是攻守要点，行脉可让友军走得更远。对岸渡口的守卫玄漪，让云策相邻后「说得」即可同行。'
  },
  {
    id: 4, no: 4, name: '赤砂关隘', theme: 'fortress',
    /* 本章精英词缀池（1~2 个；浊甲卫按出现顺序轮流佩戴，Boss 词缀见 ENEMY_TYPES） */
    affixPool: ['berserk', 'shield'],
    intro: 'ch4_intro', outro: 'ch4_outro',
    objective: { type: 'siege', turns: 5, text: '守关五回合，并斩杀赤砂将军' },
    deployCount: 6,
    deployTiles: [[0, 6], [0, 7], [1, 6], [1, 7], [3, 6], [3, 7]],
    map: [
      'M....F....F....M',
      'M..............M',
      '....r......r....',
      '..f....GG....f..',
      '......F.........',
      '...h.......h....',
      '....L.....L.....',
      '..v...........v.'
    ],
    nodes: [
      { id: 'n1', x: 4, y: 6, type: 'guard' },
      { id: 'n2', x: 10, y: 6, type: 'guard' }
    ],
    villages: [
      { x: 2, y: 7, name: '关下村', item: 'herb' },
      { x: 14, y: 7, name: '赤砂驿', gold: 200 }
    ],
    chests: [], shrines: [],
    enemies: [
      { type: 'elite', lv: 7, x: 7, y: 2 },
      { type: 'bandit', lv: 7, x: 5, y: 3 },
      { type: 'rogue', lv: 7, x: 12, y: 3 },
      { type: 'shaman', lv: 7, x: 9, y: 4 },
      { type: 'priest', lv: 7, x: 9, y: 1 },
      { char: 'moya', x: 13, y: 4, ai: 'idle', recruitable: true, talkKey: 'talk_moya' },
      { type: 'chisha', lv: 10, x: 7, y: 1, boss: true }
    ],
    reinforcements: [
      { turn: 3, units: [{ type: 'bandit', lv: 7, x: 7, y: 0 }, { type: 'bandit', lv: 7, x: 8, y: 0 }, { type: 'elite', lv: 8, x: 11, y: 0 }] }
    ],
    side: { type: 'recruit', text: '说得墨鸦', char: 'moya', gold: 300, items: ['shadow_dagger'] },
    rewards: { gold: 900, items: ['potion', 'mat_steel', 'mat_steel'] },
    tips: '让云策与墨鸦相邻，使用「说得」。守住五回合后，还要取下赤砂将军首级。'
  },
  {
    id: '5A', no: 5, route: 'A', name: '玄冰祭坛', theme: 'ice',
    /* 本章精英词缀池（1~2 个；浊甲卫按出现顺序轮流佩戴，Boss 词缀见 ENEMY_TYPES） */
    affixPool: ['aura'],
    intro: 'ch5A_intro', outro: 'ch5A_outro',
    objective: { type: 'nodes_hold', turns: 2, nodes: ['n1', 'n2'], text: '净化两处浊脉，并守持两个己方阶段' },
    deployCount: 6,
    deployTiles: [[0, 5], [0, 6], [0, 7], [1, 4], [1, 5], [1, 6], [2, 6], [3, 7]],
    map: [
      'MM..M......M..MM',
      'M.....h..h.....M',
      '..f...L...L....f',
      '....r.II.....r..',
      '..h...IIII......',
      '.....f....f.....',
      '....f..L..f.....',
      '..v.............'
    ],
    nodes: [
      { id: 'n1', x: 6, y: 2, type: 'attack', owner: 'enemy' },
      { id: 'n2', x: 10, y: 2, type: 'life', owner: 'enemy' },
      { id: 'n3', x: 7, y: 6, type: 'guard' }
    ],
    villages: [
      { x: 2, y: 7, name: '祭坛下村', item: 'elixir' }
    ],
    chests: [], shrines: [],
    enemies: [
      { type: 'wolf', lv: 9, x: 4, y: 3 },
      { type: 'wolf', lv: 9, x: 11, y: 3 },
      { type: 'shaman', lv: 8, x: 10, y: 3 },
      { type: 'elite', lv: 10, x: 9, y: 4 },
      { type: 'priest', lv: 8, x: 8, y: 2 },
      { type: 'bandit', lv: 9, x: 6, y: 5 },
      { type: 'shaman', lv: 9, x: 7, y: 4 },
      { char: 'chisang', x: 3, y: 5, ai: 'idle', recruitable: true, talkKey: 'join_chisang' },
      { type: 'icexiao', lv: 12, x: 8, y: 1, boss: true }
    ],
    reinforcements: [
      { turn: 3, units: [{ type: 'wolf', lv: 9, x: 1, y: 3 }, { type: 'wolf', lv: 9, x: 14, y: 3 }] }
    ],
    side: { type: 'kill_boss', text: '击杀冰魈', gold: 400, items: ['seal'] },
    rewards: { gold: 1000, items: ['potion', 'mat_steel', 'mat_steel'] },
    tips: '两处浊脉初始属于敌方。站上阵眼结束行动即可抢占；全部占据后还要守住两个己方阶段。乌冰踏上去会滑行——沿进入方向一路滑到阻挡前，想停在半路就别从冰上进。守坛人赤桑可用「说得」招募，冰魈会咏唱霜系咒法。'
  },
  {
    id: '6A', no: 6, route: 'A', name: '血槲林', theme: 'bamboo',
    /* 本章精英词缀池（1~2 个；浊甲卫按出现顺序轮流佩戴，Boss 词缀见 ENEMY_TYPES） */
    affixPool: ['berserk'],
    intro: 'ch6A_intro', outro: 'ch6A_outro',
    objective: { type: 'escape', text: '护送全员向东突围，一个也别落在林魈主的领地里' },
    deployCount: 6,
    deployTiles: [[0, 5], [0, 6], [0, 7], [1, 5], [1, 6], [1, 7], [2, 6]],
    map: [
      'MMMM........MMMM',
      'M..f...r.....f.M',
      '...ffS....r..ff.',
      '..f...MM.....f..',
      '.h....M..M...h..',
      '..f......r...f.E',
      '....L......L.C.E',
      '..v...........E.'
    ],
    escapes: [[14, 7], [15, 5], [15, 6]],
    nodes: [
      { id: 'n1', x: 4, y: 6, type: 'flow' },
      { id: 'n2', x: 11, y: 6, type: 'flow' }
    ],
    villages: [
      { x: 2, y: 7, name: '血槲村', item: 'elixir' }
    ],
    chests: [
      { x: 13, y: 6, name: '林下秘匣', item: 'herb' }
    ],
    shrines: [
      { x: 5, y: 2, name: '朽根祠', heal: 10 }
    ],
    enemies: [
      { type: 'wolf', lv: 11, x: 8, y: 2 },
      { type: 'wolf', lv: 11, x: 12, y: 4 },
      { type: 'shaman', lv: 11, x: 10, y: 1 },
      { type: 'elite', lv: 12, x: 7, y: 4 },
      { type: 'rogue', lv: 11, x: 13, y: 2 },
      { type: 'bird', lv: 11, x: 9, y: 5 },
      { type: 'bandit', lv: 11, x: 5, y: 1 },
      { type: 'forestmaster', lv: 13, x: 11, y: 3, boss: true }
    ],
    reinforcements: [
      { turn: 3, units: [{ type: 'wolf', lv: 11, x: 5, y: 0 }, { type: 'wolf', lv: 11, x: 10, y: 0 }] },
      { turn: 5, units: [{ type: 'elite', lv: 12, x: 6, y: 0 }] }
    ],
    side: { type: 'kill_boss', text: '斩杀林魈主', gold: 400, items: ['seal'] },
    rewards: { gold: 1100, items: ['potion', 'mat_steel', 'mat_steel'] },
    tips: '血槲林没有回头路：所有存活友军抵达东岸三个突围口才算脱身。林魈主半血后会狂暴（攻速 +3），别在林地深处和它缠斗；疏林慢行，走行脉阵眼能抢出一步。'
  },
  {
    id: '7A', no: 7, route: 'A', name: '渡厄桥', theme: 'river',
    /* 本章精英词缀池（1~2 个；浊甲卫按出现顺序轮流佩戴，Boss 词缀见 ENEMY_TYPES） */
    affixPool: ['shield'],
    intro: 'ch7A_intro', outro: 'ch7A_outro',
    objective: { type: 'rout', text: '夺取渡厄桥东岸，全歼守军，夺回灵脉核心' },
    deployCount: 7,
    deployTiles: [[0, 6], [0, 7], [1, 6], [1, 7], [2, 6], [2, 7], [3, 7]],
    map: [
      'M...~~~~..r....M',
      'M.f.~~~~...f...M',
      '..S.~~~~...f....',
      '..h.====...h....',
      '....====........',
      '..f..~~~~.....f.',
      '...L.~~~~...L...',
      '..v..~~~~.G...C.'
    ],
    nodes: [
      { id: 'n1', x: 3, y: 6, type: 'guard' },
      { id: 'n2', x: 12, y: 6, type: 'attack' }
    ],
    villages: [
      { x: 2, y: 7, name: '桥头村', gold: 200 }
    ],
    chests: [
      { x: 14, y: 7, name: '桥腹秘匣', item: 'elixir' }
    ],
    shrines: [
      { x: 2, y: 2, name: '望津祠', heal: 10 }
    ],
    enemies: [
      { type: 'elite', lv: 13, x: 11, y: 3 },
      { type: 'shaman', lv: 13, x: 12, y: 1 },
      { type: 'rogue', lv: 13, x: 10, y: 5 },
      { type: 'priest', lv: 12, x: 13, y: 4 },
      { type: 'wolf', lv: 12, x: 14, y: 6 },
      { type: 'bandit', lv: 12, x: 9, y: 7 },
      { type: 'bird', lv: 12, x: 13, y: 0 },
      { char: 'yunling', x: 14, y: 4, ai: 'idle', recruitable: true, talkKey: 'join_yunling' },
      { type: 'bridgewraith', lv: 14, x: 7, y: 3, boss: true }
    ],
    reinforcements: [
      { turn: 3, units: [{ type: 'elite', lv: 13, x: 12, y: 0 }, { type: 'wolf', lv: 12, x: 10, y: 1 }] }
    ],
    side: { type: 'kill_boss', text: '斩杀桥魅', gold: 500, items: ['seal'] },
    rewards: { gold: 1200, items: ['elixir', 'mat_silver', 'mat_steel'] },
    tips: '渡厄桥是过河的独道，桥魅守在桥心，未破盾前受伤 -30%——抢占西岸护脉阵眼再动手。东岸羽人云翎可用「说得」招募；追了一路，被俘守脉人的营地就在桥那头的火光里。'
  },
  {
    id: '5B', no: 5, route: 'B', name: '断魂谷', theme: 'mountain',
    /* 本章精英词缀池（1~2 个；浊甲卫按出现顺序轮流佩戴，Boss 词缀见 ENEMY_TYPES） */
    affixPool: ['regen'],
    intro: 'ch5B_intro', outro: 'ch5B_outro',
    objective: { type: 'defend', turns: 8, text: '封住谷口，守持八个回合' },
    deployCount: 6,
    deployTiles: [[0, 5], [0, 6], [0, 7], [1, 5], [1, 6], [1, 7], [2, 5], [2, 7]],
    map: [
      'M..............M',
      'M..f...rS...f..M',
      '.....f.....f....',
      '..h.....MM...h..',
      '.......f..f.....',
      '...L......L.....',
      '..v..........v..',
      '.............G..'
    ],
    nodes: [
      { id: 'n1', x: 3, y: 5, type: 'life' },
      { id: 'n2', x: 10, y: 5, type: 'life' }
    ],
    villages: [
      { x: 2, y: 6, name: '谷口村', item: 'herb' },
      { x: 13, y: 6, name: '山腰村', gold: 150 }
    ],
    chests: [],
    shrines: [
      { x: 8, y: 1, name: '断魂祠', heal: 10 }
    ],
    enemies: [
      { type: 'elite', lv: 11, x: 11, y: 2 },
      { type: 'wolf', lv: 11, x: 13, y: 3 },
      { type: 'shaman', lv: 11, x: 9, y: 1 },
      { type: 'bandit', lv: 11, x: 12, y: 4 },
      { type: 'rogue', lv: 11, x: 14, y: 2 },
      { type: 'priest', lv: 11, x: 7, y: 0 },
      { type: 'armor', lv: 12, x: 11, y: 3 },
      { type: 'valleydragon', lv: 12, x: 13, y: 5, boss: true }
    ],
    reinforcements: [
      { turn: 2, units: [{ type: 'wolf', lv: 11, x: 13, y: 0 }] },
      { turn: 4, units: [{ type: 'bandit', lv: 11, x: 8, y: 0 }, { type: 'elite', lv: 11, x: 14, y: 1 }] },
      { turn: 6, units: [{ type: 'shaman', lv: 12, x: 10, y: 0 }] }
    ],
    side: { type: 'villages', text: '访问两处村落', gold: 300, items: ['herb'] },
    rewards: { gold: 1050, items: ['potion', 'mat_steel', 'mat_steel'] },
    tips: '谷螭带自愈（每回合开始回 10% 生命），拖得越久越难杀，但别因此追进深处——守住谷口等它来。两处生脉阵眼能持续照看伤员；姜姒在第 5 章结束后入队。'
  },
  {
    id: '6B', no: 6, route: 'B', name: '云梦泽', theme: 'swamp',
    /* 本章精英词缀池（1~2 个；浊甲卫按出现顺序轮流佩戴，Boss 词缀见 ENEMY_TYPES） */
    affixPool: ['regen', 'shield'],
    intro: 'ch6B_intro', outro: 'ch6B_outro',
    objective: { type: 'escape', text: '所有存活友军抵达东岸' },
    deployCount: 7,
    deployTiles: [[0, 6], [0, 7], [1, 6], [1, 7], [2, 6], [2, 7], [3, 6]],
    fog: true, vision: 4,
    map: [
      '~~~..~~~...~~~..',
      '~~..f..~~..f...E',
      '..f............E',
      '.....~~....f...E',
      '..h.....~~....C.',
      '....L....L......',
      '............v...',
      '....f..~~...f...'
    ],
    nodes: [
      { id: 'n1', x: 4, y: 5, type: 'flow' },
      { id: 'n2', x: 9, y: 5, type: 'flow' }
    ],
    escapes: [[15, 1], [15, 2], [15, 3]],
    villages: [
      { x: 12, y: 6, name: '泽畔村', recruit: 'aman', talk: 'join_aman' }
    ],
    chests: [
      { x: 14, y: 4, name: '泽底秘匣', item: 'staff_duo' }
    ], shrines: [],
    enemies: [
      { type: 'wolf', lv: 10, x: 7, y: 3 },
      { type: 'shaman', lv: 10, x: 10, y: 2 },
      { type: 'rogue', lv: 9, x: 14, y: 5 },
      { type: 'elite', lv: 11, x: 9, y: 6 },
      { type: 'priest', lv: 10, x: 11, y: 2 },
      { type: 'wolf', lv: 11, x: 6, y: 5 },
      { type: 'bird', lv: 10, x: 10, y: 1 },
      { type: 'swampdragon', lv: 13, x: 12, y: 3, boss: true }
    ],
    reinforcements: [
      { turn: 4, units: [{ type: 'wolf', lv: 10, x: 0, y: 5 }, { type: 'wolf', lv: 10, x: 15, y: 5 }] }
    ],
    side: { type: 'recruit', text: '在泽畔村找到阿蛮', char: 'aman', gold: 300, items: ['herb'] },
    rewards: { gold: 1100, items: ['elixir', 'mat_steel', 'mat_silver'] },
    tips: '雾中视野有限，危险范围无法查看。所有存活友军抵达东岸才能脱身，别把伤员落在最后。沼龙会潜入毒沼，只有站在阵眼附近才逼得出来。'
  },
  {
    id: '7B', no: 7, route: 'B', name: '沧浪津', theme: 'river',
    /* 本章精英词缀池（1~2 个；浊甲卫按出现顺序轮流佩戴，Boss 词缀见 ENEMY_TYPES） */
    affixPool: ['aura', 'berserk'],
    intro: 'ch7B_intro', outro: 'ch7B_outro',
    objective: { type: 'rout', text: '抢滩登陆，全歼津口守军，别让浊潮抢登岸' },
    deployCount: 7,
    deployTiles: [[0, 6], [0, 7], [1, 6], [1, 7], [2, 6], [2, 7], [3, 7]],
    map: [
      'M...Sr.......~~M',
      'M..f....f....~~~',
      '......f......~~~',
      '..h.......h.C.~~',
      '....f....f....~~',
      '.........L.....~',
      '..v...L.......G~',
      '......G........~'
    ],
    nodes: [
      { id: 'n1', x: 9, y: 5, type: 'attack' },
      { id: 'n2', x: 6, y: 6, type: 'flow' }
    ],
    villages: [
      { x: 2, y: 6, name: '渡口村', item: 'potion' }
    ],
    chests: [
      { x: 12, y: 3, name: '津渡秘匣', item: 'elixir' }
    ],
    shrines: [
      { x: 4, y: 0, name: '望潮祠', heal: 10 }
    ],
    enemies: [
      { type: 'elite', lv: 13, x: 11, y: 2 },
      { type: 'rogue', lv: 13, x: 9, y: 3 },
      { type: 'shaman', lv: 13, x: 12, y: 1 },
      { type: 'wolf', lv: 12, x: 10, y: 4 },
      { type: 'bird', lv: 13, x: 12, y: 0 },
      { type: 'priest', lv: 12, x: 8, y: 5 },
      { type: 'bandit', lv: 12, x: 13, y: 4 },
      { type: 'armor', lv: 13, x: 11, y: 6 },
      { char: 'yunling', x: 13, y: 6, ai: 'idle', recruitable: true, talkKey: 'join_yunling' },
      { type: 'tidewyrm', lv: 14, x: 14, y: 5, boss: true }
    ],
    reinforcements: [
      { turn: 3, units: [{ type: 'wolf', lv: 12, x: 5, y: 0 }, { type: 'bandit', lv: 12, x: 9, y: 0 }] }
    ],
    side: { type: 'kill_boss', text: '斩杀浪蛟', gold: 500, items: ['seal'] },
    rewards: { gold: 1200, items: ['elixir', 'mat_silver', 'mat_steel'] },
    tips: '浪蛟半血狂暴（攻速 +3），还会从海上包抄滩头，别把伤员留在最后。东南渡口的羽人云翎，让云策相邻后「说得」可同行；守住之后，下一程就是两支队伍汇合的天柱废墟。'
  },
  {
    id: 8, no: 8, name: '天柱废墟', theme: 'ruins',
    /* 本章精英词缀池（1~2 个；浊甲卫按出现顺序轮流佩戴，Boss 词缀见 ENEMY_TYPES） */
    affixPool: ['aura', 'berserk'],
    intro: 'ch8_intro', outro: 'ch8_outro',
    objective: { type: 'nodes_hold', turns: 3, nodes: ['n1', 'n2', 'n3'], text: '同时占据三处阵眼，守持三个己方阶段' },
    deployCount: 8,
    deployTiles: [[6, 7], [7, 7], [8, 7], [9, 7], [5, 7], [10, 7], [5, 6], [10, 6], [6, 6], [9, 6]],
    map: [
      'M....r....r....M',
      'M..............M',
      '..r...h..h...r..',
      '...L........L...',
      '......r..r......',
      '.......L........',
      '..v...f..f...v..',
      '....f......f....'
    ],
    nodes: [
      { id: 'n1', x: 3, y: 3, type: 'attack' },
      { id: 'n2', x: 12, y: 3, type: 'guard' },
      { id: 'n3', x: 7, y: 5, type: 'life' }
    ],
    villages: [
      { x: 2, y: 6, name: '柱下村', item: 'elixir' },
      { x: 13, y: 6, name: '断碑村', gold: 250 }
    ],
    chests: [], shrines: [],
    enemies: [
      { type: 'elite', lv: 12, x: 5, y: 2 },
      { type: 'elite', lv: 12, x: 10, y: 2 },
      { type: 'shaman', lv: 12, x: 4, y: 4 },
      { type: 'rogue', lv: 12, x: 12, y: 4 },
      { type: 'bird', lv: 12, x: 9, y: 3 },
      { type: 'priest', lv: 11, x: 8, y: 2 },
      { type: 'wolf', lv: 12, x: 3, y: 5 },
      { type: 'elite', lv: 13, x: 7, y: 4 },
      { type: 'turbidgeneral', lv: 15, x: 7, y: 1, boss: true }
    ],
    reinforcements: [
      { turn: 3, units: [{ type: 'wolf', lv: 12, x: 1, y: 1 }, { type: 'wolf', lv: 12, x: 14, y: 1 }] },
      { turn: 5, units: [{ type: 'elite', lv: 13, x: 1, y: 3 }, { type: 'elite', lv: 13, x: 14, y: 3 }] }
    ],
    side: { type: 'kill_boss', text: '斩杀浊将', gold: 500, items: ['seal'] },
    rewards: { gold: 1300, items: ['potion', 'mat_silver', 'mat_silver'] },
    tips: '三处阵眼相距很远。分兵占领，并守住三个连续的己方阶段。浊将可选，但战利丰厚。'
  },
  {
    id: 9, no: 9, name: '浊潮之眼', theme: 'void',
    /* 本章精英词缀池（1~2 个；浊甲卫按出现顺序轮流佩戴，Boss 词缀见 ENEMY_TYPES） */
    affixPool: ['shield', 'regen'],
    intro: 'ch9_intro', outro: 'ch9_outro',
    objective: { type: 'boss', text: '击败玄阙（二阶段）' },
    deployCount: 8,
    deployTiles: [[5, 7], [6, 7], [8, 7], [9, 7], [10, 7], [11, 7], [6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [5, 6]],
    map: [
      'M...r......r...M',
      'M..............M',
      '..r..........r..',
      '..L..........L..',
      '......h..h......',
      '..r..........r..',
      '.......L........',
      '..v...f..f....v.'
    ],
    nodes: [
      { id: 'n1', x: 2, y: 3, type: 'attack' },
      { id: 'n2', x: 13, y: 3, type: 'guard' },
      { id: 'n3', x: 7, y: 6, type: 'life' }
    ],
    villages: [
      { x: 2, y: 7, name: '最后的人家', item: 'elixir' },
      { x: 14, y: 7, name: '望乡台', gold: 300 }
    ],
    chests: [], shrines: [],
    enemies: [
      { type: 'elite', lv: 15, x: 5, y: 3 },
      { type: 'elite', lv: 15, x: 9, y: 3 },
      { type: 'shaman', lv: 15, x: 4, y: 4 },
      { type: 'priest', lv: 14, x: 10, y: 4 },
      { type: 'bird', lv: 15, x: 13, y: 2 },
      { type: 'rogue', lv: 15, x: 12, y: 7 },
      { type: 'wolf', lv: 15, x: 3, y: 6 },
      { type: 'xuanque', lv: 18, x: 7, y: 4, boss: true }
    ],
    reinforcements: [
      { turn: 3, units: [{ type: 'elite', lv: 15, x: 1, y: 2 }, { type: 'elite', lv: 15, x: 14, y: 2 }] },
      { turn: 5, units: [{ type: 'wolf', lv: 16, x: 1, y: 5 }, { type: 'wolf', lv: 16, x: 14, y: 5 }] }
    ],
    side: { type: 'weaken', text: '守持三处阵眼三个己方阶段，削弱噬脉兽', gold: 600, items: ['seal'] },
    rewards: { gold: 2000, items: ['elixir', 'mat_silver', 'mat_silver'] },
    tips: '玄阙倒下后会化作噬脉兽。占据全部阵眼并守持三个己方阶段，可永久削弱它。'
  }
];

/* ============================================================
 * 剧情：旁白用 who='旁白'；人物立绘按 who 自动匹配。
 * ============================================================ */
const DIALOGUES = {
  ch1_intro: [
    { who: '旁白', text: '山海界有九条灵脉。脉行于地，气升为云，养活了山门、村庄与万千生灵。' },
    { who: '旁白', text: '二十年前，国师玄阙在浊潮之眼立坛，说要「续脉救世」。从那以后，灵脉一条接一条地枯了。' },
    { who: '岩隈', text: '山门昨夜起火。师父把半卷《山海策》塞给我，让我带你走。' },
    { who: '云策', text: '他自己呢？' },
    { who: '岩隈', text: '他说守脉人不能都死在一处。' },
    { who: '鹿鸣', text: '师兄，山脚的村子也被山贼围了。那些山贼在挖灵脉的石头。' },
    { who: '云策', text: '那就先去山脚。剑还在，路就还在。' }
  ],
  ch1_outro: [
    { who: '山魈王', text: '山……要醒了……国师说……把脉挖出来……就能活……' },
    { who: '云策', text: '挖断灵脉，山才会死。谁告诉你的？' },
    { who: '山魈王', text: '金印……赤砂……浊潮……' },
    { who: '鹿鸣', text: '它怀里有一枚赤砂金印，刻着玄阙的名字。' },
    { who: '岩隈', text: '山魈王原本是守山的灵兽。浊气把它变成了这样。' },
    { who: '云策', text: '沿着灵脉往东，下一站是竹海。走得动吗？' },
    { who: '鹿鸣', text: '走得动。药篓也走得动。' }
  ],
  join_qingluo: [
    { who: '青萝', text: '你们是青岚宗的人？我等了三天。' },
    { who: '云策', text: '等我们做什么？' },
    { who: '青萝', text: '山贼说要把村里的灵脉挖开换粮。我爹不肯，被他们带走了。' },
    { who: '鹿鸣', text: '你的手很稳。' },
    { who: '青萝', text: '射箭练的。我射得不差，只是箭不够。' },
    { who: '云策', text: '跟我们一起走。箭管够，路也长。' }
  ],
  ch2_intro: [
    { who: '旁白', text: '雾隐竹海。雾气终年不散，竹节里却传出细碎的哭声。' },
    { who: '鹿鸣', text: '村里人说，竹妖以前是守林的精怪。最近总有人往竹林深处倒黑色的水。' },
    { who: '云策', text: '那水里有浊气。竹海是青岚灵脉的一条支脉。' },
    { who: '岩隈', text: '山道被浊浪堵了。至少得守六回合，让村民先撤。' },
    { who: '云策', text: '守。把阵眼也拿下，脉气能护住林子。' }
  ],
  ch2_outro: [
    { who: '白鹭', text: '好险。我原以为只有我一个人在东岸守。' },
    { who: '云策', text: '你是？' },
    { who: '白鹭', text: '白鹭，游方的骑将。追一支运浊晶的车队追到这儿，车没了，马还在。' },
    { who: '鹿鸣', text: '你的马腿上中了箭。别动。' },
    { who: '白鹭', text: '……多谢。你们的灵脉阵眼还能这样用？' },
    { who: '云策', text: '阵眼本来就是护山护人的。有人把它当成了抽水的井。' },
    { who: '白鹭', text: '那算我一个。我跑得快，正好替你们探路。' }
  ],
  join_bailu: [
    { who: '白鹭', text: '这匹马叫踏雪，跑起来比风还快。你们可别掉队。' },
    { who: '鹿鸣', text: '跑太快，药会洒。' },
    { who: '白鹭', text: '那我跑慢点。药比军令难伺候。' }
  ],
  ch3_intro: [
    { who: '旁白', text: '断桥古渡。河面漂着浊色的泡沫，两座木桥是过河唯一的去路。' },
    { who: '玄漪', text: '渡口封了。过河可以，先把名字留下。' },
    { who: '云策', text: '青岚宗，云策。借渡。' },
    { who: '玄漪', text: '玄漪。我守了十二年渡口，从没听过青岚宗。' },
    { who: '白鹭', text: '姑娘，下游的水鬼快把桥板啃断了。再争，大家一起掉下去。' },
    { who: '玄漪', text: '……桥断之前，先杀水鬼。你们的剑最好快一点。' }
  ],
  ch3_outro: [
    { who: '玄漪', text: '水鬼身上也有那枚金印。看来有人在我渡口底下养了东西。' },
    { who: '云策', text: '浊潮之眼。这卷《山海策》上的矿脉图，最后全都指向那里。' },
    { who: '玄漪', text: '渡口的名字册上，最近多了三十六个人。全是逆着河水上去的。' },
    { who: '白鹭', text: '三十六个人，至少要有一座熔炉、一条粮道。他们不是散兵。' },
    { who: '玄漪', text: '我随你们走。渡口没人守，总比守错人强。' }
  ],
  join_xuanyi: [
    { who: '玄漪', text: '我的冰咒遇水更利。过沼泽时，别离我太远。' },
    { who: '青萝', text: '你说话真冷。' },
    { who: '玄漪', text: '渡口风大，说暖话会被吹走的。' }
  ],
  ch4_intro: [
    { who: '旁白', text: '赤砂关，西去浊潮之眼的最后一道官关。关上悬着一面黑底金纹的旗。' },
    { who: '赤砂将军', text: '国师有令：凡携《山海策》者，格杀。云策，你师父当年也是这么不识时务。' },
    { who: '云策', text: '我师父在哪？' },
    { who: '赤砂将军', text: '在脉眼里。他的骨头，大概已经变成新的脉了。' },
    { who: '岩隈', text: '……云策。' },
    { who: '云策', text: '守关五回合。等国师的人露头，再取他的首级。' }
  ],
  ch4_outro: [
    { who: '旁白', text: '赤砂将军的刀断了。关上那面黑旗被山风扯成两半。' },
    { who: '赤砂将军', text: '你们以为……杀了我，就能拦住国师？他要的不是一座关……是整条浊潮……' },
    { who: '云策', text: '他说我师父在脉眼里。' },
    { who: '玄漪', text: '活人塞进脉眼，确实能让脉气暂时回流。但经脉的人，不可能活过一夜。' },
    { who: '鹿鸣', text: '所以师父不是为了续脉死的。他是被人拿去堵脉了。' },
    { who: '旁白', text: '关下的风忽然很静。远处，一道赤红的浊潮正沿着地平线缓慢升起。' }
  ],
  talk_moya: [
    { who: '墨鸦', text: '别拔刀。你们要找的东西，我偷到了。' },
    { who: '云策', text: '我为什么要信你？' },
    { who: '墨鸦', text: '因为我也被国师的人追了三年。他们拿走了我村子所有人的名字。' },
    { who: '云策', text: '名字？' },
    { who: '墨鸦', text: '国师用名字点脉。名字被点走的人，就再也回不了家。' },
    { who: '云策', text: '那就跟我们一起走。你的账，我们替你算。' },
    { who: '墨鸦', text: '……先说好，我可不做白工。打赢了，分我一成。' }
  ],
  join_moya: [
    { who: '墨鸦', text: '你们的粮袋位置我记住了。放心，现在只偷敌人的。' },
    { who: '阿蛮', text: '他摸我兽骨袋。' },
    { who: '墨鸦', text: '那是打招呼。' }
  ],
  ch5A_intro: [
    { who: '旁白', text: '玄冰祭坛。两处阵眼被黑冰封住，脉气像被倒着抽上了一根看不见的管子。' },
    { who: '赤桑', text: '别碰冰。冰里有脉。' },
    { who: '云策', text: '你是守坛人？' },
    { who: '赤桑', text: '赤桑。我守了十二年。每一年，坛里的冰就厚一层。' },
    { who: '鹿鸣', text: '这不是病，是阵。有人在用阵眼把灵脉往别处引。' },
    { who: '赤桑', text: '若要断阵，就得把两处阵眼重新印上活人的脉。你们敢吗？' },
    { who: '云策', text: '我们来，就是为这个。斥候说，押送被俘守脉人的车队过了北边的祭坛——顺手，把这坛也收了。' }
  ],
  ch5A_outro: [
    { who: '赤桑', text: '阵断了。冰下……有师父留的符。' },
    { who: '云策', text: '你师父也是守坛人？' },
    { who: '赤桑', text: '嗯。他被国师借去「点脉」，再没回来。' },
    { who: '旁白', text: '黑冰裂开，一道金印虚影浮在上空。虚影里传来一个温和得近乎慈悲的声音。' },
    { who: '玄阙', text: '云岚子的徒弟。你师父曾求我停下，可这片山海的脉，早就该换一条活路了。' },
    { who: '云策', text: '用活人的命换路，不叫活路。' },
    { who: '玄阙', text: '那就来浊潮之眼，让我看看你的路能走多远。' }
  ],
  join_chisang: [
    { who: '赤桑', text: '雷符画在冰上，会炸得不太准。离我两步远。' },
    { who: '岩隈', text: '两步够你雷到我？' },
    { who: '赤桑', text: '……三步也行。' }
  ],
  ch4_route: [
    { who: '旁白', text: '军帐。灯芯结了第三次灯花时，两份情报几乎同时送到。' },
    { who: '岩隈', text: '西边斥候确认：玄阙亲自押着一队被俘的守脉人，往浊潮之眼去了。活着过路的，一个没有。' },
    { who: '白鹭', text: '东边断魂谷的猎户来报：地脉裂了，黑水一夜漫过三道山梁。半个青岚州，眼看要成泽国。' },
    { who: '墨鸦', text: '小守脉人，国师这是算准了你只有一队人。' },
    { who: '云策', text: '……追，那些被俘的人或许还活着。守，断魂谷的村子今夜就要沉。' },
    { who: '鹿鸣', text: '师兄，你从来没自己做过这么大的决定。' },
    { who: '云策', text: '师父教的都是「怎么守」。这一次，我自己选。' },
    { who: '旁白', text: '两条路，只能走一条。另一条，交给留下的那一半人心结。' }
  ],
  ch6A_intro: [
    { who: '旁白', text: '血槲林。叶子是暗红色的，踩上去像踩着一层没干透的血。' },
    { who: '墨鸦', text: '车辙印进林子就没了。他们抹了痕迹，但抹不掉血气。' },
    { who: '鹿鸣', text: '树上有新的勒痕——人被拖着走过。不会超过一天。' },
    { who: '白鹭', text: '林魈主把这片林子当猎场。它喜欢追着受伤的跑。' },
    { who: '云策', text: '那就别让它称心。向东突围，跟上车队，一个也别落在林子里。' }
  ],
  ch6A_outro: [
    { who: '旁白', text: '林魈主倒在自行裂开的血槲木丛里，整片林子的红，仿佛瞬间褪了一层。' },
    { who: '青萝', text: '地上有守脉人的脉佩……碎了的。' },
    { who: '鹿鸣', text: '车队昨晚过的林。他们带着俘虏，走不快。' },
    { who: '云策', text: '追。前面是渡厄桥——情报说，桥那头就是他们的营地。' },
    { who: '旁白', text: '东边的天际线上，有一线火光，像谁把渡厄桥点着了。' }
  ],
  ch7A_intro: [
    { who: '旁白', text: '渡厄桥。二十丈长的木桥横在浊流之上，桥那头的营地烧得正旺。' },
    { who: '玄漪', text: '水底下有东西。不是鱼——是桥魅，溺死的守桥人化的。' },
    { who: '云策', text: '过桥就一条道。' },
    { who: '白鹭', text: '桥魅守着桥心，脉气连着两岸的阵眼。先把阵眼夺下来，它就少了半条命。' },
    { who: '云策', text: '过桥。救人，夺核心。' }
  ],
  ch7A_outro: [
    { who: '旁白', text: '桥魅散了，化作一滩黑水退回浊流。营地里的火，也烧到了尽头。' },
    { who: '鹿鸣', text: '……找到了。最后一个。' },
    { who: '旁白', text: '那是个很年轻的守脉人，手里还攥着半块脉佩。脉佩上刻着云岚子的名字——是师父那一辈的人。' },
    { who: '云策', text: '……追上了。' },
    { who: '岩隈', text: '云策。人死不能复脉，但你把他带回来了。这就够了。' },
    { who: '旁白', text: '云策在尸身旁站了很久。风从桥洞穿过，发出像哭又像叹的声音。' }
  ],
  ch5B_intro: [
    { who: '旁白', text: '断魂谷。两山夹着一线谷口，地脉从这里穿过，养活着下游半个青岚州。' },
    { who: '玄漪', text: '裂缝在谷底。我封了十二年的渡口，第一次见水是往上翻的。' },
    { who: '岩隈', text: '猎户说，谷里的浊物想从这儿把整条脉顶出来。顶出来，下游就全是泽国。' },
    { who: '赤桑', text: '封脉要人守着。脉不是墙，守得住一时，守不了一世。' },
    { who: '云策', text: '那就守到能守的最后一刻。八回合，等下游的村民撤完。' },
    { who: '旁白', text: '这一章没有追兵，只有慢下来的灾。守，是另一种打仗。' }
  ],
  ch5B_outro: [
    { who: '旁白', text: '第八回合的号角响过，谷口的浊水终于开始回落。' },
    { who: '鹿鸣', text: '下游的烟火撤完了。我数过，三村十一户，一个不少。' },
    { who: '玄漪', text: '脉暂时按回去了。但裂缝还在，它还会再来。' },
    { who: '云策', text: '那就等我们再回来。先把眼前的人带出这片泽。' },
    { who: '旁白', text: '谁也没有提西边的追兵。有些话，说出口就是结。' }
  ],
  ch6B_intro: [
    { who: '旁白', text: '云梦泽。雾从水里长出来，遮住了来路，也遮住了追兵。' },
    { who: '鹿鸣', text: '前面是东岸。过了泽，就能绕到天柱废墟。' },
    { who: '白鹭', text: '泽里还有阿蛮留下的路标。她是这一带的兽使，认得每一道暗流。' },
    { who: '云策', text: '先找阿蛮，再往东走。所有人一起走，一个也别留在雾里。' }
  ],
  ch6B_outro: [
    { who: '阿蛮', text: '……雾散了。你们走得很慢。' },
    { who: '鹿鸣', text: '有人受了伤。' },
    { who: '阿蛮', text: '我看到了。山灵说，浊潮已经抢到了沧浪津，想从那儿登岸。' },
    { who: '玄漪', text: '津口一丢，东岸就全是滩头上的活靶。' },
    { who: '云策', text: '去沧浪津。在它们登岸之前，把它们摁回浪里。' }
  ],
  ch7B_intro: [
    { who: '旁白', text: '沧浪津。潮声比战鼓还急，黑压压的浊物已经挤下了滩头。' },
    { who: '阿蛮', text: '山灵在发抖。浪里有大家伙——不是鱼，是蛟。' },
    { who: '玄漪', text: '潮位还在涨。等它涨到滩头第二道沙梁，就再也拦不住了。' },
    { who: '云策', text: '那就现在登。抢下津口，全歼守军，别让浊潮踩实这片滩。' }
  ],
  ch7B_outro: [
    { who: '旁白', text: '浪蛟的尸体在滩头上搁浅，黑血退进潮里，潮水第一次退了青色。' },
    { who: '白鹭', text: '津口拿下了。西边……追兵现在到哪儿了？' },
    { who: '墨鸦', text: '不知道。但我闻得出来，这一仗打完，两边都带着一身没说的话。' },
    { who: '云策', text: '去天柱废墟。两条路的人，该在那儿见一见了。' },
    { who: '旁白', text: '海平线上，天柱的残影依稀可辨——像一根插在浊潮里的定海针。' }
  ],
  join_aman: [
    { who: '阿蛮', text: '这是我的山灵。它叫白牙，不咬朋友。' },
    { who: '墨鸦', text: '看着挺咬人的。' },
    { who: '阿蛮', text: '所以我说了，不咬朋友。' }
  ],
  ch8_intro: [
    { who: '旁白', text: '天柱废墟。传说中山海界第一根灵脉从这里升起，如今只剩三处阵眼泛着微光。' },
    { who: '旁白', text: '废墟下，两支队伍终于汇合。A 线的人带着西疆的火与血，B 线的人带着东岸的潮与泪。' },
    { who: '云翎', text: '下面的人，退后三步。' },
    { who: '云策', text: '羽人？你也是守脉的？' },
    { who: '云翎', text: '我守的是天上的路。浊潮已经漫上来了，三处阵眼必须同时亮起。' },
    { who: '赤桑', text: '同时亮三处，还要守住三个回合。就凭我们？' },
    { who: '云翎', text: '凭你们，也凭我。我的弓射得到东边那处阵眼。' },
    { who: '云策', text: '那就分兵。三处阵眼，一处都不能灭。' }
  ],
  ch8_outro: [
    { who: '旁白', text: '三处阵眼同时亮起的一瞬，天柱上的裂纹像被水填满，缓慢地合拢。' },
    { who: '云翎', text: '天柱稳住了。浊潮之眼的门，也开了。' },
    { who: '云策', text: '你不必跟去。羽人守天，已经做得够多。' },
    { who: '云翎', text: '我答应过一个人，要带他看遍山外的天。他还在东边等我。' },
    { who: '云策', text: '那就一起。把天留到回程再看。' }
  ],
  join_yunling: [
    { who: '云翎', text: '我会飞，但飞不过浊潮。到了那儿，把我当普通弓箭手用。' },
    { who: '青萝', text: '那你飞低一点，我射得准。' },
    { who: '云翎', text: '好。给你留一支最直的箭。' }
  ],
  ch9_intro: [
    { who: '旁白', text: '浊潮之眼，原是九脉交汇的海眼。如今海水是黑的，天也是黑的。' },
    { who: '玄阙', text: '云策。你一路走来，看过多少荒村？灵脉按旧路走，西边十年大旱，东边十年洪涝。' },
    { who: '云策', text: '所以你改了脉路。' },
    { who: '玄阙', text: '我把脉接进活人的身体，让每一条脉都听人调遣。你要的，不也是一个能救人的天下？' },
    { who: '云策', text: '你救的是「天下」二字。我要救的，是山脚村里那个等我带药回去的孩子。' },
    { who: '玄阙', text: '……那就让这座海眼看看，谁的脉更硬。' },
    { who: '鹿鸣', text: '师兄。我们都在。' },
    { who: '云策', text: '结阵。先拿阵眼，再斩玄阙。' }
  ],
  ch9_outro: [
    { who: '旁白', text: '噬脉兽倒下时，海眼里积了二十年的浊潮像退潮一样散去。' },
    { who: '玄阙', text: '……原来脉不是河。河可以改道，脉只能活。' },
    { who: '云策', text: '你到最后一刻才明白。' },
    { who: '玄阙', text: '不。我很早就明白。只是我不敢回头，怕回头看见那些我拿去做「活路」的人。' },
    { who: '旁白', text: '海眼重归湛蓝。九条灵脉在山海间重新亮起，像一张被慢慢抚平的地图。' },
    { who: '鹿鸣', text: '师兄，脉通了。山脚的村子，今年应该能种上稻子。' },
    { who: '云策', text: '嗯。回去以后，先给师父立一块碑。' },
    { who: '云翎', text: '碑上写什么？' },
    { who: '云策', text: '「脉在人在」。' },
    { who: '旁白', text: '——《山海策·灵脉》终。' }
  ],
  boss_phase2: [
    { who: '玄阙', text: '这副人身……终究托不住整座海眼。' },
    { who: '旁白', text: '国师的血肉裂开，露出底下盘踞二十年的巨兽。噬脉兽睁开眼，海眼开始逆流。' },
    { who: '云策', text: '阵眼还亮着。把它压回去！' }
  ],
  weakened: [
    { who: '旁白', text: '三处阵眼的脉光同时刺入噬脉兽体内。它的鳞甲寸寸剥落，气息肉眼可见地弱了下去。' }
  ]
};

const NODE_INFO = {
  attack: { name: '攻脉', desc: '三格内友军命中 +15、暴击 +5。' },
  life: { name: '生脉', desc: '己方阶段开始时，三格内友军回复 8 点生命。' },
  flow: { name: '行脉', desc: '三格内友军移动 +1。' },
  guard: { name: '护脉', desc: '两格内友军护甲与魔抗 +3。' }
};

/* ============================================================
 * 阵眼升阶（P1.1）
 * 占领后驻守：每满 2 个己方阶段 +1 阶（最高 3 阶），
 * 所有脉流效果按阶倍增；被敌方夺取则阶数清零。
 * ============================================================ */
const NODE_TIER_MAX = 3;
const NODE_TIER_HOLD = 2;

function nodeEffectText(type, tier) {
  const t = tier || 1;
  switch (type) {
    case 'attack': return '三格内友军命中 +' + 15 * t + '、暴击 +' + 5 * t;
    case 'life':   return '己方阶段开始，三格内友军回复 ' + 8 * t + ' 生命';
    case 'flow':   return '三格内友军移动 +' + t;
    case 'guard':  return '两格内友军护甲魔抗 +' + 3 * t;
    default:       return '结束行动后占领';
  }
}

/* 驻守推进（纯函数，供测试）：held=true 表示本阶段有己方单位停在节点上。
 * 返回升到的阶数（0 = 未升阶）。 */
function nodeGarrisonTick(node, held) {
  if (!node || node.owner === 'none' || !held) { node.hold = 0; return 0; }
  node.hold += 1;
  if (node.hold >= NODE_TIER_HOLD) {
    node.hold = 0;
    if (node.tier < NODE_TIER_MAX) { node.tier += 1; return node.tier; }
  }
  return 0;
}

const TERRAIN_HINTS = {
  f: '疏林：回避 +20，护甲 +1，移动消耗 2',
  h: '丘壑：回避 +15，护甲 +1，移动消耗 2',
  '~': '深水：步行不可通行',
  M: '山岩：步行不可通行，飞行可越',
  r: '残垣：回避 +10，护甲 +1，移动消耗 2',
  v: '村庄：结束行动后可访问',
  F: '营垒：回避 +20，护甲 +2，己方阶段回复生命',
  G: '渡口：制压目标',
  L: '灵脉阵眼：结束行动后占领',
  C: '古匣：结束行动后可开启',
  S: '残祠：结束行动后可参拜',
  E: '退路：所有存活友军抵达即撤离',
  I: '冰面：进入后沿原方向滑行，遇阻挡或非冰面停止',
  '.': '草地：无地形加成'
};
