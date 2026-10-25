/* Node 逻辑测试：vm 载入数据层与战斗内核 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const files = [
  'js/rng.js',
  'js/data-core.js',
  'js/data-systems.js',
  'js/data-maps.js',
  'js/combat.js',
  'js/item-icons.js',
  'js/audio.js',
  'js/audio-bgm.js'
];

let code = '';
for (const f of files) code += fs.readFileSync(path.join(root, f), 'utf8') + '\n';

code += String.raw`
let __fail = 0, __pass = 0;
function ok(cond, msg) {
  if (cond) { __pass++; }
  else { __fail++; console.error('  ✗ ' + msg); }
}
function eq(a, b, msg) { ok(a === b, msg + ' (got ' + a + ', want ' + b + ')'); }
function approx(a, b, t, msg) { ok(Math.abs(a - b) <= (t || 0.01), msg + ' (got ' + a + ', want ' + b + ')'); }

console.log('—— 数据校验 ——');
eq(CHAPTERS.length, 16, '章节数');
eq(HERO_ORDER.length, 20, '角色数');
for (const id of HERO_ORDER) {
  const c = CHARS[id];
  ok(!!c, '角色存在 ' + id);
  ok(!!CLASSES[c.cls], '职业存在 ' + id + ' -> ' + c.cls);
  for (const s of STAT_ORDER) ok(typeof c.stats[s] === 'number' && typeof c.growth[s] === 'number', '成长完整 ' + id + '.' + s);
  for (const it of c.items) ok(!!WEAPONS[it.key] || !!ITEMS[it.key], '初始物品存在 ' + id + ':' + it.key);
  const cls = CLASSES[c.cls];
  for (const t of cls.weapons) ok(c.ranks[t], '武器等级 ' + id + ':' + t);
  ok(!!c.personal && !!c.personal.name && !!c.personal.desc, '个人技① 完整 ' + id);
  ok(!!c.personal2 && !!c.personal2.name && !!c.personal2.desc, '个人技② 完整 ' + id);
  ok(c.personal.name !== c.personal2.name, '两条个人技不同名 ' + id);
  for (const p of [c.personal, c.personal2]) {
    for (const k of Object.keys(p || {})) {
      if (k === 'name' || k === 'desc') continue;
      ok(typeof p[k] === 'number' || typeof p[k] === 'boolean', '个人技字段为数值 ' + id + '.' + k);
    }
  }
  for (const it of c.items) {
    const w = WEAPONS[it.key];
    if (w) ok(cls.weapons.includes(w.type), '初始武器职业可用 ' + id + ':' + it.key);
  }
}
for (const key in CLASSES) {
  const cls = CLASSES[key];
  ok(['foot','armor','horse','flying','beast','plant','amphibious'].includes(cls.moveType), '移动类型 ' + key);
  for (const t of cls.weapons) ok(!!WEAPON_TYPES[t], '武器类型存在 ' + key + ':' + t);
  if (cls.tier === 1) {
    ok(!!cls.promote && !!CLASSES[cls.promote], '一转职业存在 ' + key);
    if (cls.promote) ok(CLASSES[cls.promote].tier === 2, '转职阶级 ' + key);
  }
}
for (const id of Object.keys(WEAPONS)) {
  const w = WEAPONS[id];
  ok(!!WEAPON_TYPES[w.type], '武器类型 ' + id);
  ok(Array.isArray(w.rng) && w.rng[0] <= w.rng[1], '射程 ' + id);
  ok(w.uses > 0, '耐久 ' + id);
}
for (const sid of Object.keys(SUPPORTS)) {
  void sid;
}
for (const s of SUPPORTS) {
  ok(!!CHARS[s.a] && !!CHARS[s.b], '支援对象存在 ' + s.id);
  for (const r of ['C','B','A']) ok(Array.isArray(s.dialogues[r]) && s.dialogues[r].length >= 2, '支援对话 ' + s.id + ':' + r);
}

for (const ch of CHAPTERS) {
  ok(ch.map.length === 8, '章节 ' + ch.id + ' 行数');
  ch.map.forEach((row, y) => ok(row.length === 16, '章节 ' + ch.id + ' 第 ' + y + ' 行宽度=' + row.length));
  const mapNodes = [], mapVillages = [], mapChests = [], mapShrines = [], mapGates = [], mapEscapes = [];
  for (let y = 0; y < ch.map.length; y++) {
    for (let x = 0; x < ch.map[y].length; x++) {
      const s = ch.map[y][x];
      ok(!!TERRAIN[s], '章节 ' + ch.id + ' 地形字符 ' + s);
      if (s === 'L') mapNodes.push(x + ',' + y);
      if (s === 'v') mapVillages.push(x + ',' + y);
      if (s === 'C') mapChests.push(x + ',' + y);
      if (s === 'S') mapShrines.push(x + ',' + y);
      if (s === 'G') mapGates.push(x + ',' + y);
      if (s === 'E') mapEscapes.push(x + ',' + y);
    }
  }
  const nodeKeys = (ch.nodes || []).map(n => n.x + ',' + n.y);
  eq(mapNodes.sort().join('|'), nodeKeys.sort().join('|'), '章节 ' + ch.id + ' 阵眼与地图一致');
  eq(mapVillages.sort().join('|'), (ch.villages || []).map(n => n.x + ',' + n.y).sort().join('|'), '章节 ' + ch.id + ' 村庄与地图一致');
  eq(mapChests.sort().join('|'), (ch.chests || []).map(n => n.x + ',' + n.y).sort().join('|'), '章节 ' + ch.id + ' 古匣与地图一致');
  eq(mapShrines.sort().join('|'), (ch.shrines || []).map(n => n.x + ',' + n.y).sort().join('|'), '章节 ' + ch.id + ' 残祠与地图一致');
  if (ch.objective.type === 'seize') eq(mapGates.sort().join('|'), ch.objective.gate.join(','), '章节 ' + ch.id + ' 制压点');
  if (ch.objective.type === 'escape') eq(mapEscapes.sort().join('|'), (ch.escapes || []).map(n => n.join(',')).sort().join('|'), '章节 ' + ch.id + ' 退路');
  for (const n of ch.nodes || []) ok(!!NODE_INFO[n.type], '阵眼类型 ' + n.type);
  for (const nid of (ch.objective.nodes || [])) ok((ch.nodes || []).some(n => n.id === nid), '目标阵眼存在 ' + ch.id + ':' + nid);

  const deploySeen = new Set();
  for (const t of ch.deployTiles) {
    const k = t[0] + ',' + t[1];
    ok(!deploySeen.has(k), '部署点重复 ' + ch.id + ':' + k);
    deploySeen.add(k);
    const s = ch.map[t[1]] && ch.map[t[1]][t[0]];
    ok(s && TERRAIN[s] && !TERRAIN[s].blocked, '部署点可站立 ' + ch.id + ':' + k + '=' + s);
  }
  ok(ch.deployTiles.length >= ch.deployCount, '部署点足够 ' + ch.id);
  ok(ch.deployCount <= 8, '部署上限合理 ' + ch.id);

  const occupied = new Set();
  const allEnemies = [...ch.enemies];
  for (const rg of ch.reinforcements || []) for (const u of rg.units) allEnemies.push(u);
  for (const e of allEnemies) {
    const key = e.x + ',' + e.y;
    const s = ch.map[e.y] && ch.map[e.y][e.x];
    ok(!!s, '敌军坐标在图内 ' + ch.id + ':' + key);
    if (e.type) {
      const t = ENEMY_TYPES[e.type];
      ok(!!t, '敌军模板存在 ' + e.type);
      if (t) {
        const cost = Combat.terrainCost({ moveType: t.moveType }, TERRAIN[s]);
        ok(cost !== null, '敌军可站立 ' + ch.id + ':' + key + ' ' + e.type + ' on ' + s);
      }
    } else if (e.char) {
      ok(!!CHARS[e.char], '敌军角色存在 ' + e.char);
      ok(TERRAIN[s] && !TERRAIN[s].blocked, '角色敌军可站立 ' + ch.id + ':' + key);
    }
    if (!e.boss) {
      ok(!occupied.has(key), '敌军重叠 ' + ch.id + ':' + key);
      occupied.add(key);
    }
    ok(!deploySeen.has(key), '敌军与部署重叠 ' + ch.id + ':' + key);
  }
  const sideTypes = ['villages','shrines','chest','recruit','kill_boss','weaken'];
  ok(!ch.side || sideTypes.includes(ch.side.type), '支线类型 ' + ch.id);
  for (const sid of ['n1','n2']) {
    const spawn = (ch.reinforcements || []).some(r => r.units.some(u => u.x === 0));
    void spawn;
  }
}

console.log('—— 公式校验 ——');
function mkUnit(over) {
  return Object.assign({
    id: 'u1', name: '试', side: 'player', cls: 'swordsman', level: 10, exp: 0,
    stats: { hp: 30, str: 10, mag: 0, skl: 10, spd: 10, lck: 5, def: 5, res: 5 },
    growth: { hp: 50, str: 50, mag: 0, skl: 50, spd: 50, lck: 50, def: 50, res: 50 },
    items: [{ key: 'iron_sword', uses: 35 }], weaponIndex: 0,
    ranks: { sword: 'A', axe: 'A', bow: 'A', tome: 'A', lance: 'A' },
    x: 0, y: 0, move: 5, moveType: 'foot', tags: []
  }, over || {});
}
const ctx0 = { mods: () => ({}), tileAt: () => TERRAIN['.'] };
const a = mkUnit();
const b = mkUnit({ id: 'u2', name: '敌', side: 'enemy', x: 1, y: 0, facing: 3, items: [{ key: 'iron_sword', uses: 35 }] });
eq(Combat.attackSpeed(a), 7, '攻速');
eq(Combat.damage(a, b, ctx0), 10, '基础伤害');
eq(Combat.hitChance(a, b, ctx0), 93, '基础命中');
eq(Combat.critChance(a, b, ctx0), 0, '基础暴击');
ok(!Combat.doubles(a, b), '同速不追击');
b.stats.spd = 20;
b.items[0] = { key: 'iron_blade', uses: 30 };
const f = Combat.forecast(a, b, ctx0);
ok(f.triangle.state === 'good', '剑克重刃');
eq(f.triangle.hit, 15, '三角命中');
ok(Combat.doubles(b, a), '攻速差 4 追击');
ok(f.defender.double, '防守方追击显示');

const archer = mkUnit({ cls: 'archer', items: [{ key: 'iron_bow', uses: 30 }], ranks: { bow: 'A' }, x: 0, y: 0 });
const flyer = mkUnit({ side: 'enemy', tags: ['flying'], x: 2, y: 0 });
const baseDmg = Combat.damage(archer, flyer, ctx0);
const savedEff = WEAPONS.iron_bow.effective;
ok(Combat.isEffective(archer, flyer), '弓对飞行特效');
ok(baseDmg % 2 === 0, '特效伤害为偶数');

const armored = mkUnit({ side: 'enemy', tags: ['armor'], x: 2, y: 0, stats: { hp: 40, str: 5, mag: 0, skl: 5, spd: 4, lck: 0, def: 15, res: 2 } });
const talis = mkUnit({ cls: 'talisman', items: [{ key: 'spirit_talisman', uses: 25 }], ranks: { talisman: 'A' }, stats: { hp: 20, str: 2, mag: 12, skl: 8, spd: 6, lck: 4, def: 3, res: 8 } });
ok(Combat.isEffective(talis, armored), '灵符对披甲特效');

RNG.setSeed(12345);
const seqA = mkUnit({ stats: { hp: 50, str: 12, mag: 0, skl: 15, spd: 15, lck: 10, def: 8, res: 3 }, items: [{ key: 'iron_sword', uses: 35 }] });
const seqB = mkUnit({ id: 'u2', name: '敌', side: 'enemy', x: 1, y: 0, facing: 3, stats: { hp: 50, str: 8, mag: 0, skl: 5, spd: 5, lck: 0, def: 5, res: 2 }, items: [{ key: 'iron_blade', uses: 30 }] });
const ev = Combat.resolve(seqA, seqB, { mods: () => ({}), tileAt: () => TERRAIN['.'], rng: RNG });
ok(ev.length >= 2, '交战产生事件');
ok(ev.some(e => e.type === 'strike' && e.hit), '存在命中事件');
const dmgEv = ev.find(e => e.type === 'strike' && e.hit);
if (dmgEv) ok(dmgEv.dmg >= 1, '命中伤害为正');
eq(seqA.items[0].uses, 35 - ev.filter(e => e.type === 'strike' && e.attacker === 'u1').length, '攻方耐久消耗');
ok(seqB.items[0].uses < 30, '守方反击消耗耐久');

const breaker = mkUnit({ items: [{ key: 'iron_sword', uses: 1 }] });
const dummy = mkUnit({ id: 'u2', name: '木桩', side: 'enemy', x: 1, y: 0, facing: 3, items: [{ key: 'iron_blade', uses: 30 }], stats: { hp: 99, str: 0, mag: 0, skl: 0, spd: 0, lck: 0, def: 0, res: 0 } });
RNG.setSeed(99);
Combat.resolve(breaker, dummy, { mods: () => ({}), tileAt: () => TERRAIN['.'], rng: RNG });
ok(breaker.weaponBroken, '武器耐久归零');

const growthUnit = mkUnit({ level: 1, exp: 0, growth: { hp: 0, str: 100, mag: 0, skl: 100, spd: 0, lck: 0, def: 0, res: 0 } });
RNG.setSeed(7);
const ups = Combat.levelUp(growthUnit, 250);
eq(ups.length, 2, '升级次数');
for (const u of ups) {
  let n = 0; for (const k in u.gains) n += u.gains[k];
  ok(n >= 2, '每级至少两点成长');
}

const grid = [
  '.....',
  '..f..',
  '.....'
];
const walker = mkUnit({ move: 2, x: 0, y: 0 });
const blocker = { x: 1, y: 0, side: 'enemy', hp: 10 };
const reach = Combat.reachable(walker, grid, [walker, blocker], 0);
ok(!reach.has('1,0'), '敌军阻挡通行');
ok(reach.has('0,1'), '可移动到下方');
ok(reach.has('0,2'), '移动 2 格');
ok(!reach.has('2,0'), '不能穿过敌军');
const path = Combat.pathTo(reach, walker, 0, 2);
ok(path && path.length === 3, '路径长度');
const allyBlock = { x: 1, y: 0, side: 'player', hp: 10 };
const reach2 = Combat.reachable(walker, grid, [walker, allyBlock], 0);
ok(reach2.has('2,0'), '可穿过友军');
ok(reach2.get('1,0').occupied, '友军格不可停留');
ok(!reach2.get('1,0').endable, '友军格不可停留标记');

/* 攻击不消耗移动力：spent = 本回合已花掉的移动力，按剩余量收范围 */
const full3 = Combat.reachable(walker, grid, [walker], 0, 0);
const after1 = Combat.reachable(walker, grid, [walker], 0, 1);
const after2 = Combat.reachable(walker, grid, [walker], 0, 2);
const over = Combat.reachable(walker, grid, [walker], 0, 5);
ok(full3.has('2,0'), 'spent=0 满程可达 2 格');
ok(!after1.has('2,0') && after1.has('1,0'), 'spent=1 后最远 1 格');
ok(after2.has('0,0') && !after2.has('1,0'), 'spent=move 时只能原地');
ok(over.size === 1 && over.has('0,0'), 'spent 超额仍保留自身格');
ok(over.get('0,0').endable, '自身格可结束（原地行动）');

eq(Combat.supportRank(19), null, '支援 C 之前');
eq(Combat.supportRank(20), 'C', '支援 C');
eq(Combat.supportRank(50), 'B', '支援 B');
eq(Combat.supportRank(90), 'A', '支援 A');
eq(Combat.supportBonus(50).hit, 10, '支援命中加成');

console.log('—— H-P1 物品图标 ——');
/* 呈现层：只读 WEAPONS/ITEMS/SPELLS 数据表判类别，不算任何数值 */
for (const key of Object.keys(WEAPONS)) {
  const c = ItemIcons.categoryOf(key);
  ok(!!c && (c.kind === 'weapon' || c.kind === 'legendary'), '兵装类别 ' + key);
  ok(!!ItemIcons.svgFor(key), '兵装有图 ' + key);
  ok(!!ItemIcons.uriFor(key), '兵装 URI ' + key);
  ok(!!ItemIcons.WSHAPES[WEAPONS[key].type], '武器底形覆盖 ' + key + ' -> ' + WEAPONS[key].type);
}
for (const key of Object.keys(ITEMS)) {
  const c = ItemIcons.categoryOf(key);
  ok(!!c && ['mat', 'seal', 'potion'].includes(c.kind), '道具类别 ' + key + ' -> ' + (c && c.kind));
  ok(!!ItemIcons.svgFor(key), '道具有图 ' + key);
}
for (const key of Object.keys(SPELLS)) {
  const c = ItemIcons.categoryOf(key);
  ok(!!c && c.kind === 'spell', '法术类别 ' + key);
  ok(c.aoe === !!SPELLS[key].aoe, '法术范围标记 ' + key);
  ok(!!ItemIcons.svgFor(key), '法术有图 ' + key);
  const svg = decodeURIComponent(ItemIcons.uriFor(key));
  if (SPELLS[key].aoe) ok(svg.indexOf('stroke-dasharray') >= 0, '范围法术带范围框 ' + key);
  else ok(svg.indexOf('stroke-dasharray') < 0, '单体法术无范围框 ' + key);
}
ok(!ItemIcons.categoryOf('__nope__'), '未知 id 无类别');
eq(ItemIcons.iconHTML('__nope__'), '', '未知 id 渲染为空');
ok(!ItemIcons.uriFor('__nope__'), '未知 id 无 URI');
const ironUri = ItemIcons.uriFor('iron_sword');
ok(ironUri && ironUri.indexOf('data:image/svg+xml') === 0, 'data URI 协议');
const ironSvg = decodeURIComponent(ironUri);
ok(ironSvg.indexOf('viewBox="0 0 64 64"') >= 0, 'viewBox 64×64');
ok(ironSvg.indexOf('</svg>') >= 0, 'SVG 闭合');
ok(ironSvg.indexOf('{b}') < 0 && ironSvg.indexOf('{h}') < 0 && ironSvg.indexOf('{i}') < 0 && ironSvg.indexOf('{c}') < 0, '占位符全部替换');
for (const key of Object.keys(LEGENDARY_WEAPONS)) {
  eq(ItemIcons.categoryOf(key).kind, 'legendary', '传说标记 ' + key);
  const svg = decodeURIComponent(ItemIcons.uriFor(key));
  ok(svg.indexOf('#a02c2c') >= 0, '传说赤框 ' + key);
  ok(svg.indexOf('#f0c25a') >= 0, '传说外发光 ' + key);
}
const ih = ItemIcons.iconHTML('iron_sword', 'ii-22');
ok(ih.indexOf('class="ii ii-22"') >= 0, 'iconHTML class');
ok(ih.indexOf('width="40"') >= 0, 'iconHTML 默认尺寸 40');
ok(ItemIcons.iconHTML('iron_sword', 'ii-22', 22).indexOf('width="22"') >= 0, 'iconHTML 指定尺寸');
eq(ItemIcons.tierOfRank('D'), 'iron', 'D 阶铁');
eq(ItemIcons.tierOfRank('B'), 'steel', 'B 阶钢');
eq(ItemIcons.tierOfRank('S'), 'silver', 'S 阶银');
/* 铁/钢同形换材质色：同 type 不同 tier 去色后骨架一致 */
const stripColor = s => s.replace(/#[0-9a-fA-F]{6}/g, '#');
eq(stripColor(decodeURIComponent(ItemIcons.uriFor('iron_sword'))),
   stripColor(decodeURIComponent(ItemIcons.uriFor('silver_sword'))), '铁剑/银剑同形换色');
ok(ItemIcons.svgFor('mat_iron') && ItemIcons.svgFor('mat_steel') && ItemIcons.svgFor('mat_silver'), '材料三档有图');

console.log('—— 音频架构（无 DOM 回退） ——');
ok(typeof BGM === 'object' && typeof SFX === 'object', 'BGM/SFX 已加载');
ok(typeof BGM.play === 'function' && typeof BGM.duck === 'function' && typeof BGM.setMusicOn === 'function', 'BGM 接口齐全');
ok(typeof SFX.play === 'function', 'SFX 接口');
/* 无 DOM 环境：BGM 回退合成音乐、title 直接合成、音效池关闭 */
globalThis.__pm = [];
Audio.playMusic = (m) => { globalThis.__pm.push(m); };
BGM.play('camp');
eq(globalThis.__pm.length, 1, '无 DOM 时 BGM.play 回退合成');
BGM.play('title');
eq(globalThis.__pm.length, 2, 'title 无文件直接合成');
ok(SFX.play('hit_flesh') === false, '无 DOM 时音效池关闭');

console.log('—— 高低地形差（二期）——');
/* 数据层：height 为 8 行 × 16 位数字（0~2），不动地形字符 */
let heightChapters = 0;
for (const ch of CHAPTERS) {
  if (!ch.height) { ok(true, '章节 ' + ch.id + ' 无 height 层（按全 0 兼容）'); continue; }
  heightChapters++;
  eq(ch.height.length, 8, '章节 ' + ch.id + ' height 行数');
  ch.height.forEach((row, y) => {
    eq(row.length, 16, '章节 ' + ch.id + ' height 第 ' + y + ' 行宽度');
    ok(/^[0-2]+$/.test(row), '章节 ' + ch.id + ' height 第 ' + y + ' 行只含 0~2');
  });
  /* height 与 map 同尺寸：静态地形数据，两层的坐标语义一致 */
  ok(ch.height.length === ch.map.length, '章节 ' + ch.id + ' height 与 map 行数一致');
}
ok(heightChapters >= 2, '至少有 2 章带 height 示范层（got ' + heightChapters + '）');
/* 示范章的关键点位：1 章首领 (13,2) 海拔 2；3 章水鬼 (12,1) 海拔 2 */
const ch1 = CHAPTERS.find(c => c.id === 1);
const ch3 = CHAPTERS.find(c => c.id === 3);
eq(ch1.height[2][13], '2', '第 1 章首领所在格海拔 2');
eq(ch3.height[1][12], '2', '第 3 章水鬼所在格海拔 2');
eq(ch1.height[6][8], '0', '第 1 章阵眼在平地');
eq(ch3.height[3][8], '0', '第 3 章桥面在河谷（0）');
/* 公式：ctx 无 heightAt 时一切照旧（旧测试场/旧章节不受影响） */
const hctx = { mods: () => ({}), tileAt: () => TERRAIN['.'], heightAt: (x, y) => (x === 0 && y === 0 ? 2 : 0) };
eq(Combat.heightMod(hctx, 0, 0, 1, 0).hit, 15, '高 2 层打低命中 +15');
eq(Combat.heightMod(hctx, 1, 0, 0, 0).hit, -15, '低打高 2 层命中 -15');
eq(Combat.heightMod(ctx0, 0, 0, 1, 0).hit, 0, '无 heightAt 无修正');

console.log('—— 背侧判定（二期）——');
/* facing 上右下左；几何：攻方 (0,0) 在守方 (1,0) 正西 */
const mkFace = (f) => mkUnit({ id: 'u3', name: '敌', side: 'enemy', x: 1, y: 0, facing: f });
eq(Combat.facingOf(a), 0, '我军缺省朝北');
eq(Combat.facingOf(mkUnit({ side: 'enemy' })), 2, '敌军缺省朝南');
const bsF = Combat.backstabMod(a, mkFace(3));
ok(bsF.state === 'front' && bsF.hit === 0 && bsF.crit === 0, '守方面向攻方 = 正面无修正');
const bsB = Combat.backstabMod(a, mkFace(1));
ok(bsB.state === 'back' && bsB.hit === 15 && bsB.crit === 20, '守方背对攻方 = 背刺 +15/+20');
const bsS = Combat.backstabMod(a, mkFace(0));
ok(bsS.state === 'side' && bsS.hit === 5 && bsS.crit === 10, '守方垂直攻方 = 侧击 +5/+10');
eq(Combat.hitChance(a, mkFace(3), ctx0), 93, '正面命中基线 93');
eq(Combat.hitChance(a, mkFace(0), ctx0), 98, '侧击命中 +5');
eq(Combat.hitChance(a, mkFace(1), ctx0), 100, '背刺命中 +15（钳顶）');
eq(Combat.critChance(a, mkFace(3), ctx0), 0, '正面暴击基线 0');
eq(Combat.critChance(a, mkFace(0), ctx0), 10, '侧击暴击 +10');
eq(Combat.critChance(a, mkFace(1), ctx0), 20, '背刺暴击 +20');
eq(Combat.damage(a, mkFace(1), ctx0), Combat.damage(a, mkFace(3), ctx0), '背刺不改变伤害');
/* 法术刻意不吃背侧 */
const sp0 = SPELLS.fire || Object.values(SPELLS)[0];
const mage = mkUnit({ cls: 'talisman', stats: { hp: 30, str: 0, mag: 12, skl: 10, spd: 10, lck: 5, def: 5, res: 8 } });
eq(Combat.spellAttack(mage, mkFace(3), sp0, ctx0).hit, Combat.spellAttack(mage, mkFace(1), sp0, ctx0).hit, '法术命中不随朝向变化');
const fBack = Combat.forecast(a, mkFace(1), ctx0);
ok(fBack.backstab.state === 'back' && fBack.backstabCounter.state === 'side', '预测带背刺与反击背刺字段');

console.log('\n结果：' + __pass + ' 通过，' + __fail + ' 失败');
if (__fail) process.exitCode = 1;
`;

try {
  vm.runInNewContext(code, { console, Math, process }, { filename: 'logic-suite.js' });
} catch (e) {
  console.error(e);
  process.exit(1);
}

/* 静态断言：呈现层不碰战斗公式（红线） */
const iconSrc = fs.readFileSync(path.join(root, 'js/item-icons.js'), 'utf8');
if (iconSrc.indexOf('Combat.') >= 0) {
  console.error('✗ item-icons.js 出现 Combat. 调用（呈现层禁止算战斗公式）');
  process.exit(1);
}
console.log('✓ item-icons.js 无 Combat. 调用（呈现层纯洁）');

/* ---------- 高低地形差：静态断言 ---------- */
const renderSrc = fs.readFileSync(path.join(root, 'js/render.js'), 'utf8');
const combatSrc = fs.readFileSync(path.join(root, 'js/combat.js'), 'utf8');
const battleSrc = fs.readFileSync(path.join(root, 'js/battle.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8');
const mapsSrc = fs.readFileSync(path.join(root, 'js/data-maps.js'), 'utf8');
let hf = 0;
const hok = (c, m) => { if (c) console.log('  ✓ ' + m); else { hf++; console.error('  ✗ ' + m); } };
hok(renderSrc.indexOf('Combat.') < 0 || !/Combat\.(hitChance|damage|critChance|heightMod|canAttackRange|canCounter|dangerZone)/.test(renderSrc),
  'render.js 不算战斗公式（高低差渲染只读 height 网格）');
hok(combatSrc.indexOf('HEIGHT_HIT_HIGH') >= 0 && combatSrc.indexOf('heightMod') >= 0, 'combat.js 有高度修正函数');
hok(combatSrc.indexOf('HEIGHT_RANGE_BONUS') >= 0, 'combat.js 射程加成接常量');
hok(battleSrc.indexOf('heightGrid') >= 0 && battleSrc.indexOf('heightAt(x, y)') >= 0, 'battle.js 有 height 网格与访问器');
hok(battleSrc.indexOf('heightAt: (x, y) => this.heightAt(x, y)') >= 0, 'combatCtx 暴露 heightAt');
hok(uiSrc.indexOf('高地（命中 +15') >= 0, 'ui.js 预测有高地标签');
hok((mapsSrc.match(/height: \[/g) || []).length >= 2, 'data-maps.js 至少 2 章 height 层');
console.log(hf === 0 ? '✓ 高低地形差：静态断言通过' : '✗ 高低地形差静态断言有 ' + hf + ' 条失败');
if (hf) process.exitCode = 1;

/* ---------- 背侧判定：静态断言 ---------- */
let bf = 0;
const bok = (c, m) => { if (c) console.log('  ✓ ' + m); else { bf++; console.error('  ✗ ' + m); } };
bok(combatSrc.indexOf('BACKSTAB_HIT') >= 0 && combatSrc.indexOf('BACKSTAB_CRIT') >= 0, 'combat.js 背刺常量接 data-systems');
bok(combatSrc.indexOf('SIDE_HIT') >= 0 && combatSrc.indexOf('SIDE_CRIT') >= 0, 'combat.js 侧击常量');
bok(combatSrc.indexOf('backstabMod(attacker, defender)') >= 0, 'combat.js 有背侧修正函数');
bok(battleSrc.indexOf('facingFromDelta') >= 0 && battleSrc.indexOf('faceToward') >= 0, 'battle.js 移动/出手更新 facing');
bok(battleSrc.indexOf('facing: 0,') >= 0 && battleSrc.indexOf('facing: 2,') >= 0, 'battle.js 我军朝北/敌军朝南默认朝向');
bok(renderSrc.indexOf('facingOf(u)') >= 0, 'render.js 有朝向尖角标记');
bok(uiSrc.indexOf('背刺（命中 +15') >= 0 && uiSrc.indexOf('侧击（命中 +5') >= 0, 'ui.js 预测有背刺/侧击标签');
console.log(bf === 0 ? '✓ 背侧判定：静态断言通过' : '✗ 背侧判定静态断言有 ' + bf + ' 条失败');
if (bf) process.exitCode = 1;

/* ---------- 音频架构：静态断言 + fake DOM 行为测试 ---------- */
const audioSrc = fs.readFileSync(path.join(root, 'js/audio.js'), 'utf8');
const bgmSrc = fs.readFileSync(path.join(root, 'js/audio-bgm.js'), 'utf8');
const NEW_SFX = ['swing_light', 'swing_heavy', 'swing_sharp', 'hit_flesh', 'hit_armor', 'hit_wood', 'hit_crit',
  'cast_metal', 'cast_wood', 'cast_water', 'cast_fire', 'cast_earth',
  'burst_metal', 'burst_wood', 'burst_water', 'burst_fire', 'burst_earth',
  'death_hero', 'node_capture', 'ui_confirm', 'heal'];

/* ---------- 打击感加厚：静态断言 ---------- */
let kf = 0;
const kok = (c, m) => { if (c) console.log('  ✓ ' + m); else { kf++; console.error('  ✗ ' + m); } };
kok(audioSrc.indexOf('clang(base, vol, delay)') >= 0, 'audio.js 有金属撞击原语 clang');
kok(audioSrc.indexOf('growl(dur, f0, f1, vol, delay)') >= 0, 'audio.js 有嘶吼原语 growl');
kok(battleSrc.indexOf('this.hitSfxFor(') >= 0, 'battle.js 命中音分流（妖物/金属/木/肉身）');
kok(battleSrc.indexOf('this.deathSfxFor(') >= 0, 'battle.js 阵亡音分流（Boss/妖物/人类/我军）');
kok(battleSrc.indexOf('this.playStepSfx(') >= 0, 'battle.js 脚步音接线（移动类型分流）');
kok(battleSrc.indexOf("Audio.sfx('death_hero')") >= 0, 'battle.js 我军阵亡走 death_hero');
for (const n of ['hit_metal', 'foe_hit', 'foe_death', 'boss_death',
  'step_foot', 'step_armor', 'step_beast', 'step_fly', 'step_horse']) {
  kok(audioSrc.indexOf("case '" + n + "'") >= 0, 'audio.js 有音效 ' + n);
}
console.log(kf === 0 ? '✓ 打击感加厚：静态断言通过' : '✗ 打击感加厚静态断言有 ' + kf + ' 条失败');
if (kf) process.exitCode = 1;
let af = 0;
const ack = (c, m) => { if (c) console.log('  ✓ ' + m); else { af++; console.error('  ✗ ' + m); } };
for (const n of NEW_SFX) ack(audioSrc.indexOf("case '" + n + "'") >= 0, '音效 case ' + n);
ack(audioSrc.indexOf('SFX.play(name)') >= 0, 'sfx 文件优先钩子');
ack(audioSrc.indexOf('BGM._cur') >= 0, 'duck 路由文件音乐');
ack(audioSrc.indexOf('Combat.') < 0, 'audio.js 不碰公式');
ack(bgmSrc.indexOf('Combat.') < 0, 'audio-bgm.js 不碰公式');
const htmlSrc = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
ack(htmlSrc.indexOf('js/audio.js') >= 0 && htmlSrc.indexOf('js/audio-bgm.js') > htmlSrc.indexOf('js/audio.js'),
  'index.html 加载顺序 audio → audio-bgm');
for (const f of ['js/main.js', 'js/game.js', 'js/battle.js', 'js/camp.js']) {
  ack(fs.readFileSync(path.join(root, f), 'utf8').indexOf('Audio.playMusic') < 0, f + ' 音乐切换走 BGM.play');
}

(async () => {
  /* fake DOM：验证文件优先 / 缺失回退 / duck / SFX 池 / 开关 / stop */
  const mkEl = () => {
    const listeners = {};
    return {
      loop: false, preload: '', volume: 1, src: '', paused: true, readyState: 0, currentTime: 0,
      children: [], style: {}, __fail: false, played: 0,
      addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
      removeEventListener(t, fn) { const a = listeners[t] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); },
      appendChild(c) { this.children.push(c); },
      load() { if (this.__fail) { this.readyState = 0; this.emit('error'); } else { this.readyState = 4; this.emit('canplay'); } },
      emit(t) { (listeners[t] || []).slice().forEach(f => f({ type: t })); },
      play() { this.paused = false; this.played++; return { catch() {} }; },
      pause() { this.paused = true; }
    };
  };
  const created = [];
  let failNext = false;
  const fakeDoc = {
    createElement: (tag) => {
      const e = mkEl();
      if (tag === 'audio' && failNext) { e.__fail = true; failNext = false; }
      created.push(e);
      return e;
    }
  };
  const sb = { console, Math, setTimeout, clearTimeout, setInterval, clearInterval, document: fakeDoc };
  const c2 = vm.createContext(sb);
  vm.runInContext(audioSrc, c2);
  vm.runInContext(bgmSrc, c2);
  const run = (src) => vm.runInContext(src, c2);
  const get = (expr) => vm.runInContext(expr, c2);
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  /* 真实元素 = 带 source 子节点（BGM）或设了 src（SFX）；排除 _can() 的探测元素 */
  const realEls = () => created.filter(e => e.children.length || e.src);
  run('globalThis.__pm = []; Audio.playMusic = (m) => { globalThis.__pm.push(m); };');

  /* a. 文件就绪 → 文件模式播放 */
  run('BGM.play("camp")');
  ack(get('BGM._ok.bgm_camp') === true, 'camp 文件就绪标记');
  ack(get('BGM._cur && BGM._cur.track') === 'bgm_camp', 'camp 进入文件模式');
  const campEl = realEls()[0];
  ack(campEl.played === 1 && campEl.paused === false, 'camp 元素已播放');
  ack(campEl.loop === true && campEl.children.length === 2, 'loop + ogg/mp3 双 source');
  ack(get('__pm.length') === 0, '文件模式不回退合成');
  await wait(1000);   // 等 900ms 淡入跑完
  ack(Math.abs(campEl.volume - 0.55) < 0.05, '淡入到 0.55（got ' + campEl.volume.toFixed(2) + '）');

  /* b. duck：文件音乐瞬压再回 */
  run('Audio.duck(0.08)');
  await wait(150);
  ack(campEl.volume < 0.2, 'duck 压住音量（got ' + campEl.volume.toFixed(2) + '）');
  await wait(600);
  ack(Math.abs(campEl.volume - 0.55) < 0.05, 'duck 后恢复（got ' + campEl.volume.toFixed(2) + '）');

  /* c. 文件缺失 → 回退合成 */
  failNext = true;
  run('BGM.play("battle")');
  ack(get('BGM._ok.bgm_battle') === false, 'battle 缺文件标记');
  ack(get('__pm.length') === 1 && get('__pm[0]') === 'battle', 'battle 回退合成');
  ack(get('BGM._cur') === null, '回退后无文件播放');

  /* d. SFX 池：首次当次合成、之后文件接管；缺失记终身 */
  const before = realEls().length;
  ack(run('SFX.play("hit_flesh")') === false, 'SFX 首次调用返回 false（当次合成）');
  const sfxEl = realEls()[realEls().length - 1];
  ack(sfxEl.played === 1 && Math.abs(sfxEl.volume - 0.7) < 0.01, 'SFX 文件就绪即播');
  ack(get('SFX._ok.hit_flesh') === true, 'SFX 就绪标记');
  ack(run('SFX.play("hit_flesh")') === true, 'SFX 再次调用走文件');
  ack(realEls().length === before + 2, 'SFX 每次新建元素');
  failNext = true;
  ack(run('SFX.play("no_such_sfx")') === false, 'SFX 缺失返回 false');
  const n2 = realEls().length;
  ack(run('SFX.play("no_such_sfx")') === false && realEls().length === n2, 'SFX 缺失不再重复尝试');

  /* e. 开关与 stop（battle 回退后 _cur 已空，重新起播一首再测） */
  run('BGM.play("camp")');
  ack(campEl.paused === false, '重播 camp 恢复播放');
  run('BGM.setMusicOn(false)');
  await wait(400);
  ack(campEl.paused === true, '关音乐后元素暂停');
  run('BGM.setMusicOn(true)');
  ack(campEl.paused === false, '开音乐后元素恢复');
  run('BGM.stop()');
  ack(get('BGM._cur') === null, 'stop 清空当前');

  console.log(af === 0 ? '✓ 音频架构：静态 + fake DOM 行为均通过' : '✗ 音频架构有 ' + af + ' 条失败');
  if (af) process.exitCode = 1;
})().catch(e => { console.error('音频行为测试异常：', e); process.exit(1); });

/* ---------- 战略层（分兵）：行为测试 ----------
 * 纯逻辑模块，独立装进一个新 context：data-core 提供 CHARS/HERO_ORDER，
 * route.js 提供 isRouteChapter/label，strategy.js 是被测对象。 */
(() => {
  let sf = 0;
  const sok = (c, m) => { if (c) { /* 静默通过 */ } else { sf++; console.error('  ✗ ' + m); } };
  const ctx = vm.createContext({ console, Math });
  for (const f of ['js/data-core.js', 'js/systems/route.js', 'js/systems/strategy.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  }
  const S = vm.runInContext('Strategy', ctx);
  const CH = vm.runInContext('CHARS', ctx);

  /* 造一个「第 4 章末刚分完兵」的战役 */
  const mk = (chapter) => ({
    chapter,
    roster: vm.runInContext('HERO_ORDER', ctx).slice(0, 7).map(id => ({ id })),
    strategy: null
  });

  /* a. 默认分兵：随行不超过上限、云策必随行、留守非空 */
  const c1 = mk(4);
  const d1 = S.defaultDeploy(c1, S.CAP);
  const front1 = Object.keys(d1).filter(id => d1[id] === 'front');
  const rear1 = Object.keys(d1).filter(id => d1[id] === 'rear');
  sok(front1.length === S.CAP, 'defaultDeploy 随行数 = CAP（got ' + front1.length + '）');
  sok(rear1.length > 0, 'defaultDeploy 有人留守');
  sok(d1.yunce === 'front', 'defaultDeploy 云策必随行');
  sok(S.CAP < 7, 'CAP 小于七人队（分兵才有意义）');

  /* b. lock 之后在 5A~7B 区间生效，第 8 章汇合解锁 */
  const c2 = mk('5A');
  S.lock(c2, 'A', d1);
  sok(c2.strategy.front === 'A', 'lock 写入战线');
  sok(S.isActive(c2), '5A 分兵生效');
  const rearId = Object.keys(d1).find(id => d1[id] === 'rear');
  sok(S.canDeploy(c2, rearId) === false, '留守者 5A 不可出战');
  sok(S.canDeploy(c2, 'yunce') === true, '云策始终可出战');
  sok(S.absentIds(c2).length === rear1.length, 'absentIds 等于留守人数');
  c2.chapter = 8;
  sok(S.isActive(c2) === false, '第 8 章汇合后分兵失效');
  sok(S.canDeploy(c2, rearId) === true, '汇合后留守者归队');
  sok(S.absentIds(c2).length === 0, '汇合后缺席名单清空');
  S.unlock(c2);
  sok(c2.strategy.locked === false, 'unlock 解除锁定');

  /* c. B 线同样生效，且不串线 */
  const c3 = mk('6B');
  S.lock(c3, 'B', d1);
  sok(c3.strategy.front === 'B', 'B 线战线记录');
  sok(S.frontLabel('B').indexOf('守脉') >= 0, 'frontLabel 走 Route.label');
  sok(S.isActive(c3), '6B 分兵生效');

  /* d. normalize：未知成员被剔除、云策强制随行、旧档无 strategy 不炸 */
  const c4 = mk('5A');
  c4.strategy = { front: 'A', locked: true, deploy: { yunce: 'rear', notachar: 'rear', [rearId]: 'rear' } };
  const n4 = S.normalize(c4);
  sok(!('notachar' in n4.deploy), 'normalize 剔除名单外成员');
  sok(n4.deploy.yunce === 'front', 'normalize 强制云策随行');
  const c5 = mk(3);
  sok(S.normalize(c5).locked === false, '无 strategy 的旧档不锁');
  sok(S.isActive(c5) === false, '第 3 章不生效');

  /* e. 每章只能调整一次（lock 发生在第 4 章末，不算 6A 的调整） */
  const c6 = mk(4);
  S.lock(c6, 'A', d1);
  c6.chapter = '6A';
  sok(S.canAdjust(c6, '6A') === true, '本章尚未调整');
  S.markAdjusted(c6, '6A');
  sok(S.canAdjust(c6, '6A') === false, '本章已调整');
  sok(S.canAdjust(c6, '7A') === true, '下一章可再调整');

  /* f. 援军不受分兵限制 */
  const reserveId = Object.keys(CH).find(id => CH[id].reserve);
  if (reserveId) {
    c6.roster.push({ id: reserveId });
    sok(S.lineOf(c6, reserveId) === 'reserve', '援军归属 reserve');
    sok(S.canDeploy(c6, reserveId) === true, '援军随时可出战');
  }

  /* g. 摘要文案 */
  sok(S.summary(c2).active === false && S.summary(c2).text.indexOf('未分兵') >= 0, '解锁后摘要为未分兵');
  sok(S.summary(c3).active === true && S.summary(c3).text.indexOf('随行') >= 0, '生效中摘要含随行数');

  console.log(sf === 0 ? '✓ 战略层（分兵）：行为测试通过' : '✗ 战略层有 ' + sf + ' 条失败');
  if (sf) process.exitCode = 1;

  /* h. 接线：营地按战线筛人、战场再兜一次底、CSS 有分兵面板 */
  const campSrc2 = fs.readFileSync(path.join(root, 'js/camp.js'), 'utf8');
  const battleSrc2 = fs.readFileSync(path.join(root, 'js/battle.js'), 'utf8');
  const cssSrc = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
  const wire = [];
  const wok = (c, m) => { if (!c) { wire.push(m); console.error('  ✗ ' + m); } };
  wok(campSrc2.indexOf('Strategy.canDeploy') >= 0, 'camp.js 出征按战线筛人');
  wok(battleSrc2.indexOf('Strategy.canDeploy') >= 0, 'battle.js 出战名单兜底校验');
  wok(cssSrc.indexOf('.split-panel') >= 0 && cssSrc.indexOf('.split-card') >= 0, 'style.css 有分兵弹层样式');
  wok(cssSrc.indexOf('.deploy-card.rear') >= 0, 'style.css 有留守卡片样式');
  if (wire.length) process.exitCode = 1;
})();
