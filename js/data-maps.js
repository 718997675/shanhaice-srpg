/* ============================================================
 * 山海策 · 灵脉  —  战役层：8 章地图 / 事件 / 剧情
 * 地图宽 16、高 8。字符含义见 data-core.js 的 TERRAIN。
 * ============================================================ */

const CHAPTERS = [
  {
    id: 1, name: '青岚山门', theme: 'mountain',
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
    nodes: [
      { id: 'n1', x: 8, y: 6, type: 'attack' },
      { id: 'n2', x: 9, y: 6, type: 'life' }
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
    rewards: { gold: 500, items: ['potion'] },
    tips: '青萝在东北的青岚村。阵眼结束行动即可占领。'
  },
  {
    id: 2, name: '雾隐竹海', theme: 'bamboo',
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
      { type: 'bamboo', lv: 7, x: 10, y: 1, boss: true }
    ],
    reinforcements: [
      { turn: 3, units: [{ type: 'wolf', lv: 5, x: 6, y: 0 }, { type: 'wolf', lv: 5, x: 7, y: 0 }] }
    ],
    side: { type: 'shrines', text: '访问三处残祠', gold: 300, items: ['elixir'] },
    rewards: { gold: 700, items: ['potion'] },
    tips: '守住六回合即可。生脉阵眼会在己方阶段开始时治疗周围友军。'
  },
  {
    id: 3, name: '断桥古渡', theme: 'river',
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
      'C.v...LL~~..f...'
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
      { x: 0, y: 7, name: '沉船古匣', item: 'silver_lance' }
    ],
    shrines: [],
    enemies: [
      { type: 'wolf', lv: 5, x: 4, y: 2 },
      { type: 'shaman', lv: 6, x: 6, y: 4 },
      { type: 'rogue', lv: 7, x: 12, y: 5 },
      { type: 'bandit', lv: 6, x: 10, y: 2 },
      { type: 'priest', lv: 5, x: 11, y: 3 },
      { type: 'wolf', lv: 6, x: 14, y: 6 },
      { type: 'waterghost', lv: 9, x: 12, y: 1, boss: true }
    ],
    reinforcements: [
      { turn: 4, units: [{ type: 'bandit', lv: 6, x: 14, y: 2 }, { type: 'bandit', lv: 6, x: 15, y: 5 }] }
    ],
    side: { type: 'chest', text: '开启沉船古匣', gold: 200, items: ['elixir'] },
    rewards: { gold: 800, items: ['potion'] },
    tips: '水鬼能踏水而行。两座木桥是攻守要点，行脉可让友军走得更远。'
  },
  {
    id: 4, name: '赤砂关隘', theme: 'fortress',
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
    rewards: { gold: 900, items: ['potion'] },
    tips: '让云策与墨鸦相邻，使用「说得」。守住五回合后，还要取下赤砂将军首级。'
  },
  {
    id: 5, name: '玄冰祭坛', theme: 'ice',
    intro: 'ch5_intro', outro: 'ch5_outro',
    objective: { type: 'nodes_hold', turns: 2, nodes: ['n1', 'n2'], text: '净化两处浊脉，并守持两个己方阶段' },
    deployCount: 6,
    deployTiles: [[0, 5], [0, 6], [0, 7], [1, 4], [1, 5], [1, 6], [2, 6], [3, 7]],
    map: [
      'MM..M......M..MM',
      'M.....h..h.....M',
      '..f...L...L....f',
      '....r........r..',
      '..h.............',
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
      { type: 'bandit', lv: 9, x: 6, y: 3 },
      { type: 'shaman', lv: 9, x: 7, y: 4 },
      { type: 'icexiao', lv: 12, x: 8, y: 1, boss: true }
    ],
    reinforcements: [
      { turn: 3, units: [{ type: 'wolf', lv: 9, x: 1, y: 3 }, { type: 'wolf', lv: 9, x: 14, y: 3 }] }
    ],
    side: { type: 'kill_boss', text: '击杀冰魈', gold: 400, items: ['seal'] },
    rewards: { gold: 1000, items: ['potion'] },
    tips: '两处浊脉初始属于敌方。站上阵眼结束行动即可抢占；全部占据后还要守住两个己方阶段。'
  },
  {
    id: 6, name: '云梦泽', theme: 'swamp',
    intro: 'ch6_intro', outro: 'ch6_outro',
    objective: { type: 'escape', text: '所有存活友军抵达东岸' },
    deployCount: 7,
    deployTiles: [[0, 6], [0, 7], [1, 6], [1, 7], [2, 6], [2, 7], [3, 6]],
    fog: true, vision: 4,
    map: [
      '~~~..~~~...~~~..',
      '~~..f..~~..f...E',
      '..f............E',
      '.....~~....f...E',
      '..h.....~~......',
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
    chests: [], shrines: [],
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
    rewards: { gold: 1100, items: ['elixir'] },
    tips: '雾中视野有限，危险范围无法查看。所有存活友军抵达东岸才能脱身，别把伤员落在最后。'
  },
  {
    id: 7, name: '天柱废墟', theme: 'ruins',
    intro: 'ch7_intro', outro: 'ch7_outro',
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
    rewards: { gold: 1300, items: ['potion'] },
    tips: '三处阵眼相距很远。分兵占领，并守住三个连续的己方阶段。浊将可选，但战利丰厚。'
  },
  {
    id: 8, name: '浊潮之眼', theme: 'void',
    intro: 'ch8_intro', outro: 'ch8_outro',
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
    rewards: { gold: 2000, items: ['elixir'] },
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
  ch5_intro: [
    { who: '旁白', text: '玄冰祭坛。两处阵眼被黑冰封住，脉气像被倒着抽上了一根看不见的管子。' },
    { who: '赤桑', text: '别碰冰。冰里有脉。' },
    { who: '云策', text: '你是守坛人？' },
    { who: '赤桑', text: '赤桑。我守了十二年。每一年，坛里的冰就厚一层。' },
    { who: '鹿鸣', text: '这不是病，是阵。有人在用阵眼把灵脉往别处引。' },
    { who: '赤桑', text: '若要断阵，就得把两处阵眼重新印上活人的脉。你们敢吗？' },
    { who: '云策', text: '我们来，就是为这个。' }
  ],
  ch5_outro: [
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
  ch6_intro: [
    { who: '旁白', text: '云梦泽。雾从水里长出来，遮住了来路，也遮住了追兵。' },
    { who: '鹿鸣', text: '前面是东岸。过了泽，就能绕到天柱废墟。' },
    { who: '墨鸦', text: '后面那位「浊将」不打算让我们过。' },
    { who: '白鹭', text: '泽里还有阿蛮留下的路标。她是这一带的兽使，认得每一道暗流。' },
    { who: '云策', text: '先找阿蛮，再往东走。所有人一起走，一个也别留在雾里。' }
  ],
  ch6_outro: [
    { who: '阿蛮', text: '……雾散了。你们走得很慢。' },
    { who: '鹿鸣', text: '有人受了伤。' },
    { who: '阿蛮', text: '我看到了。山灵说，东边的大地裂开了一条黑缝。' },
    { who: '玄漪', text: '浊潮之眼在呼吸。我们不能再等。' },
    { who: '云策', text: '那就去天柱。最后一截灵脉，能把浊潮按回去。' }
  ],
  join_aman: [
    { who: '阿蛮', text: '这是我的山灵。它叫白牙，不咬朋友。' },
    { who: '墨鸦', text: '看着挺咬人的。' },
    { who: '阿蛮', text: '所以我说了，不咬朋友。' }
  ],
  ch7_intro: [
    { who: '旁白', text: '天柱废墟。传说中山海界第一根灵脉从这里升起，如今只剩三处阵眼泛着微光。' },
    { who: '云翎', text: '下面的人，退后三步。' },
    { who: '云策', text: '羽人？你也是守脉的？' },
    { who: '云翎', text: '我守的是天上的路。浊潮已经漫上来了，三处阵眼必须同时亮起。' },
    { who: '赤桑', text: '同时亮三处，还要守住三个回合。就凭我们？' },
    { who: '云翎', text: '凭你们，也凭我。我的弓射得到东边那处阵眼。' },
    { who: '云策', text: '那就分兵。三处阵眼，一处都不能灭。' }
  ],
  ch7_outro: [
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
  ch8_intro: [
    { who: '旁白', text: '浊潮之眼，原是九脉交汇的海眼。如今海水是黑的，天也是黑的。' },
    { who: '玄阙', text: '云策。你一路走来，看过多少荒村？灵脉按旧路走，西边十年大旱，东边十年洪涝。' },
    { who: '云策', text: '所以你改了脉路。' },
    { who: '玄阙', text: '我把脉接进活人的身体，让每一条脉都听人调遣。你要的，不也是一个能救人的天下？' },
    { who: '云策', text: '你救的是「天下」二字。我要救的，是山脚村里那个等我带药回去的孩子。' },
    { who: '玄阙', text: '……那就让这座海眼看看，谁的脉更硬。' },
    { who: '鹿鸣', text: '师兄。我们都在。' },
    { who: '云策', text: '结阵。先拿阵眼，再斩玄阙。' }
  ],
  ch8_outro: [
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
  '.': '草地：无地形加成'
};
