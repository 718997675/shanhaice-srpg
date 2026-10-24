/* ============================================================
 * 数值回归测试：直接以 Node 加载战斗内核，锁定公式行为。
 * 运行：node tests/formulas.test.js
 * 任何公式改动先跑这里——红了说明改坏了旧行为。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ctx = vm.createContext({ console });
for (const f of ['js/rng.js', 'js/data-core.js', 'js/combat.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
// 注意：脚本顶层 const 不挂到 context 对象，需用表达式从全局词法作用域取回
const { Combat, TERRAIN, WEAPONS, SUPPORT_RANKS, STAT_ORDER, STAT_CAPS, TRIANGLE } =
  vm.runInContext('({ Combat, TERRAIN, WEAPONS, SUPPORT_RANKS, STAT_ORDER, STAT_CAPS, TRIANGLE })', ctx);

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  → ' + detail : '')); }
}
function eq(name, actual, expect) {
  ok(name, actual === expect, '期望 ' + expect + '，实际 ' + actual);
}

/* ---------- 测试道具 ---------- */
function mkUnit(o) {
  const base = {
    id: 't', name: '试', side: 'player', cls: 'swordmaster', level: 1, exp: 0,
    hp: 30,
    stats: { hp: 30, str: 10, mag: 0, skl: 10, spd: 10, lck: 5, def: 5, res: 5 },
    growth: {}, ranks: { sword: 'A', axe: 'A', lance: 'A', bow: 'A', dagger: 'A', tome: 'A', staff: 'A' },
    items: [], weaponIndex: 0, statuses: {}, tags: ['human'], x: 0, y: 0
  };
  const u = Object.assign(base, o || {});
  u.stats = Object.assign({}, base.stats, (o && o.stats) || {});
  return u;
}
function give(u, key, uses) { u.items.push({ key: key, uses: uses === undefined ? 20 : uses }); u.weaponIndex = 0; return u; }
const FLAT = { mods: () => null, tileAt: () => TERRAIN['.'] };   // 无任何加成的干净场地

console.log('\n== 1. 命中公式 ==');
{
  const a = give(mkUnit(), 'iron_sword');
  const d = mkUnit({ side: 'enemy', x: 1, y: 0 });
  // 命中 = 武器命中 + 技巧×2 + floor(幸运/2) - (敌攻速×2 + 敌幸运 + 地形回避)
  //      = 90 + 20 + 2 - (20 + 5) = 87
  eq('铁剑对无武器目标命中 = 87', Combat.hitChance(a, d, FLAT), 87);
}
{
  const a = give(mkUnit(), 'iron_sword');
  const d = give(mkUnit({ side: 'enemy', x: 1, y: 0 }), 'iron_blade');
  // 剑克重刃：+15 → 102，再受敌攻速/幸运 → 102 - 25 = 77
  eq('武器三角命中 +15，且命中上限钳制在 100', Combat.hitChance(a, d, FLAT), 100);
  const t = Combat.triangle(a, d);
  eq('三角状态为 good', t.state, 'good');
  eq('三角命中修正 +15', t.hit, 15);
}
{
  const a = give(mkUnit(), 'iron_blade');
  const d = give(mkUnit({ side: 'enemy', x: 1, y: 0 }), 'iron_sword');
  eq('被克（重刃←剑）命中 -15（敌持剑攻速7，回避19）', Combat.hitChance(a, d, FLAT), 63);
  eq('三角伤害修正 -2', Combat.triangle(a, d).dmg, -2);
}

console.log('\n== 2. 伤害公式 ==');
{
  const a = give(mkUnit(), 'iron_sword');       // mt 5
  const d = mkUnit({ side: 'enemy', stats: { def: 5 }, x: 1, y: 0 });
  // 力 10 + 威力 5 - 敌防 5 = 10
  eq('基础伤害 = 10', Combat.damage(a, d, FLAT), 10);
}
{
  const a = give(mkUnit(), 'iron_sword');
  const d = give(mkUnit({ side: 'enemy', stats: { def: 5 }, x: 1, y: 0 }), 'iron_blade');
  // 三角 +2 → 12
  eq('有利三角伤害 +2 = 12', Combat.damage(a, d, FLAT), 12);
}
{
  const a = give(mkUnit(), 'iron_sword');
  const d = give(mkUnit({ side: 'enemy', stats: { def: 20 }, x: 1, y: 0 }), 'iron_blade');
  eq('伤害不会低于 0', Combat.damage(a, d, FLAT), 0);
}
{
  const a = give(mkUnit({ stats: { mag: 12 } }), 'ice_tome');   // 魔法判定力/灵
  const d = mkUnit({ side: 'enemy', stats: { res: 4, def: 30 }, x: 1, y: 0 });
  // 灵 12 + 威力 6 - 敌魔抗 4 = 14（不吃敌物防）
  eq('法术按魔抗结算 = 14', Combat.damage(a, d, FLAT), 14);
}

console.log('\n== 3. 特效倍率 ==');
{
  const w = WEAPONS.iron_sword;
  const a = give(mkUnit(), 'iron_sword');
  a.items[0] = { key: 'iron_sword', uses: 20 };
  WEAPONS.iron_sword.effective = ['测试tag'];
  const d = mkUnit({ side: 'enemy', stats: { def: 5 }, tags: ['测试tag'], x: 1, y: 0 });
  eq('特效伤害 ×2 = 20', Combat.damage(a, d, FLAT), 20);
  ok('isEffective 识别标签', Combat.isEffective(a, d) === true);
  delete WEAPONS.iron_sword.effective;
}

console.log('\n== 4. 攻速与追击 ==');
{
  const fast = give(mkUnit({ stats: { spd: 12 } }), 'iron_sword');
  const slow = give(mkUnit({ side: 'enemy', stats: { spd: 7 }, x: 1, y: 0 }), 'iron_sword');
  eq('攻速差 ≥4 触发追击', Combat.doubles(fast, slow), true);
  eq('攻速差 <4 不追击', Combat.doubles(slow, fast), false);
  const diff3 = give(mkUnit({ side: 'enemy', stats: { spd: 9 }, x: 1, y: 0 }), 'iron_sword');
  eq('攻速差 3 不追击', Combat.doubles(fast, diff3), false);
}
{
  // 武器重量惩罚：重量 8、力量 5 → 攻速 -3
  const heavy = give(mkUnit({ stats: { spd: 12, str: 5 } }), 'iron_sword');
  WEAPONS.iron_sword.wt = 8;
  eq('武器重量扣攻速（力5减免1，重8扣7）', Combat.attackSpeed(heavy), 5);
  WEAPONS.iron_sword.wt = 5;
}

console.log('\n== 5. 暴击 ==');
{
  const a = give(mkUnit({ stats: { skl: 20 } }), 'iron_sword');   // crit 0 + 10 = 10 - 敌幸运 5 = 5
  const d = mkUnit({ side: 'enemy', x: 1, y: 0 });
  eq('暴击率 = 5', Combat.critChance(a, d, FLAT), 5);
}

console.log('\n== 6. 完整交战：暴击 ×3 与 2RN 命中 ==');
{
  // 假随机：必定命中、必定暴击
  const rigged = { hitRoll: () => 1, next: () => 0 };
  const a = give(mkUnit({ stats: { str: 10, skl: 20 } }), 'iron_sword');
  const d = mkUnit({ side: 'enemy', stats: { def: 5 }, hp: 40, x: 1, y: 0 });
  const ctx2 = { mods: () => null, tileAt: () => TERRAIN['.'], rng: rigged };
  const fc = Combat.forecast(a, d, ctx2);
  eq('预告伤害 = 10', fc.attacker.dmg, 10);
  const evs = Combat.resolve(a, d, ctx2);
  const hit = evs.filter(e => e.type === 'strike');
  ok('必定命中', hit.length > 0 && hit[0].hit === true);
  ok('必定暴击', hit[0].crit === true);
  eq('暴击伤害 = 30', hit[0].dmg, 30);
  eq('命中判定用 2RN（roll=1 < 命中率）', hit[0].rolled, 1);
}
{
  // 必定失手
  const rigged = { hitRoll: () => 99.9, next: () => 0 };
  const a = give(mkUnit(), 'iron_sword');
  const d = mkUnit({ side: 'enemy', hp: 40, x: 1, y: 0 });
  const evs = Combat.resolve(a, d, { mods: () => null, tileAt: () => TERRAIN['.'], rng: rigged });
  const s = evs.find(e => e.type === 'strike');
  ok('高骰不命中', s && s.hit === false && s.dmg === 0);
  eq('失手不扣血', d.hp, 40);
}

console.log('\n== 7. 治疗 ==');
{
  const healer = give(mkUnit({ stats: { mag: 6 } }), 'heal_staff');
  const staff = Combat.staffOf(healer);
  eq('治疗量 = 杖 10 + 灵/2 = 13', Combat.healAmount(healer, staff, FLAT), 13);
}

console.log('\n== 8. 经验与支援 ==');
{
  eq('击杀经验（同级）= 30', Combat.killExp(5, 5), 30);
  eq('击杀经验（低打高 +5/级）= 35', Combat.killExp(5, 6), 35);
  eq('击杀经验下限 6', Combat.killExp(20, 1), 6);
  eq('击杀经验上限 60', Combat.killExp(1, 20), 60);
  eq('支援 90 点 = A', Combat.supportRank(90), 'A');
  eq('支援 89 点 = B', Combat.supportRank(89), 'B');
  eq('支援 19 点 = 无', Combat.supportRank(19), null);
  const bonus = Combat.supportBonus(95);
  eq('A 级命中加成', bonus.hit, SUPPORT_RANKS[2].hit);
}

console.log('\n== 9. 寻路与地形 ==');
{
  const grid = ['................', '................', '................', '................',
                '................', '................', '................', '................',
                '................', '................', '................', '................'];
  const u = mkUnit({ move: 4, x: 6, y: 4 });
  const r = Combat.reachable(u, grid, [], 0);
  eq('移动力 4 的可达格数 = 41（菱形 1+4+8+12+16）', r.size, 41);
  const blocked = ['~~~~~~~~~~~~~~~~', '~~~~~~~~~~~~~~~~', '~~~~~~~~~~~~~~~~', '~~~~~~~~~~~~~~~~',
                   '~~~~~~~~~~~~~~~~', '~~~~~~~~~~~~~~~~', '~~~~~~~~~~~~~~~~', '................'];
  const r2 = Combat.reachable(u, blocked, [], 0);
  eq('深水阻挡步行', r2.size, 1);
  const flyer = mkUnit({ move: 4, moveType: 'flying' });
  const r3 = Combat.reachable(flyer, blocked, [], 0);
  ok('飞行可越深水', r3.size > 1);
}

console.log('\n== 10. 成长与升级 ==');
{
  const u = mkUnit({ level: 1, exp: 0 });
  u.growth = { hp: 0, str: 0, mag: 0, skl: 0, spd: 0, lck: 0, def: 0, res: 0 };
  const lv = Combat.levelUp(u, 100);
  eq('100 经验升 1 级', u.level, 2);
  eq('升级事件 1 条', lv.length, 1);
  eq('成长保底 2 项', Object.keys(lv[0].gains).length >= 2, true);
}

console.log('\n== 11. 阵眼升阶（P1.1） ==');
{
  // 载入数据层与流程层；UI/Audio/Render 打桩（仅在流程层方法被调用时触达）
  ctx.UI = { log() {}, toast() {}, dialogue() {}, hideActionBar() {}, hideUnitCard() {}, updateBattle() {}, phaseBanner() {}, actionBar() {}, unitCard() {} };
  ctx.Audio = { sfx() {} };
  ctx.Render = { floatText() {} };
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/data-maps.js'), 'utf8'), ctx, { filename: 'js/data-maps.js' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/battle.js'), 'utf8'), ctx, { filename: 'js/battle.js' });
  const { nodeGarrisonTick, nodeEffectText, NODE_TIER_MAX, NODE_TIER_HOLD, Battle, NODE_INFO, CHAPTERS } =
    vm.runInContext('({ nodeGarrisonTick, nodeEffectText, NODE_TIER_MAX, NODE_TIER_HOLD, Battle, NODE_INFO, CHAPTERS })', ctx);

  // 11.1 驻守推进（纯函数）
  const n = { owner: 'player', tier: 1, hold: 0 };
  eq('第 1 阶段驻守不升阶', nodeGarrisonTick(n, true), 0);
  eq('驻守累计 1', n.hold, 1);
  eq('第 2 阶段驻守升到 2 阶', nodeGarrisonTick(n, true), 2);
  eq('升阶后累计清零', n.hold, 0);
  eq('第 3 阶段驻守不升阶', nodeGarrisonTick(n, true), 0);
  eq('第 4 阶段驻守升到 3 阶（满阶）', nodeGarrisonTick(n, true), 3);
  eq('满阶后再驻守不升', nodeGarrisonTick(n, true), 0);
  eq('阶数封顶 = NODE_TIER_MAX', n.tier, NODE_TIER_MAX);
  eq('NODE_TIER_HOLD = 2', NODE_TIER_HOLD, 2);
  const away = { owner: 'player', tier: 2, hold: 1 };
  eq('单位离开节点不升阶', nodeGarrisonTick(away, false), 0);
  eq('离开后累计清零', away.hold, 0);
  const neutral = { owner: 'none', tier: 1, hold: 5 };
  eq('无主节点不推进', nodeGarrisonTick(neutral, true), 0);
  eq('无主节点累计清零', neutral.hold, 0);

  // 11.2 效果文本随阶缩放
  ok('攻脉 2 阶文本含 +30', nodeEffectText('attack', 2).indexOf('+30') >= 0);
  ok('攻脉 2 阶文本含暴击 +10', nodeEffectText('attack', 2).indexOf('+10') >= 0);
  ok('生脉 3 阶文本含 24', nodeEffectText('life', 3).indexOf('24') >= 0);
  ok('护脉 1 阶文本含 +3', nodeEffectText('guard', 1).indexOf('+3') >= 0);
  ok('行脉 2 阶文本含移动 +2', nodeEffectText('flow', 2).indexOf('+2') >= 0);

  // 11.3 modsFor 按阶倍增（不装备武器，排除职业技能干扰）
  const fake = Object.create(Battle);
  const u = mkUnit({ x: 1, y: 1 });
  fake.B = { units: [u], nodes: [], supports: {} };
  const mkNode = (type, tier, x, y) =>
    ({ id: 'n', x: x, y: y, type: type, owner: 'player', active: true, tier: tier, startPhase: 0, hold: 0 });
  fake.B.nodes = [mkNode('attack', 1, 1, 1)];
  const m1 = Battle.modsFor.call(fake, u);
  eq('攻脉 1 阶命中 +15', m1.hit, 15);
  eq('攻脉 1 阶暴击 +5', m1.crit, 5);
  eq('站立节点 1 阶回避 +10', m1.avoid, 10);
  fake.B.nodes = [mkNode('attack', 2, 1, 1)];
  const m2 = Battle.modsFor.call(fake, u);
  eq('攻脉 2 阶命中 +30', m2.hit, 30);
  eq('攻脉 2 阶暴击 +10', m2.crit, 10);
  eq('站立节点 2 阶回避 +20', m2.avoid, 20);
  fake.B.nodes = [mkNode('guard', 2, 1, 1)];
  const mg = Battle.modsFor.call(fake, u);
  eq('护脉 2 阶护甲 +6', mg.def, 6);
  eq('护脉 2 阶魔抗 +6', mg.res, 6);
  fake.B.nodes = [mkNode('flow', 2, 1, 1)];
  eq('行脉 2 阶移动 +2', Battle.modsFor.call(fake, u).move, 2);
  const far = mkUnit({ x: 8, y: 8 });
  fake.B.nodes = [mkNode('attack', 3, 1, 1)];
  eq('三格外无攻脉加成', Battle.modsFor.call(fake, far).hit, 0);
  fake.B.nodes = [mkNode('attack', 3, 1, 1, )];
  fake.B.nodes[0].active = false;
  eq('未激活节点无加成', Battle.modsFor.call(fake, u).hit, 0);

  // 11.4 易主清零与驻守累计
  const cap = Object.create(Battle);
  cap.B = {
    phaseIndex: 3, units: [],
    nodes: [{ id: 'n', x: 2, y: 2, type: 'attack', owner: 'enemy', active: true, tier: 3, hold: 1, startPhase: 0 }]
  };
  ok('占领敌方节点成功', Battle.captureNode.call(cap, mkUnit({ x: 2, y: 2 })) === true);
  eq('易主后阶数清零', cap.B.nodes[0].tier, 1);
  eq('易主后驻守累计清零', cap.B.nodes[0].hold, 0);
  eq('占领后 startPhase 延后 2', cap.B.nodes[0].startPhase, 5);

  const tk = Object.create(Battle);
  tk.B = { units: [mkUnit({ x: 5, y: 5 })], nodes: [
    { id: 'a', x: 5, y: 5, type: 'attack', owner: 'player', active: true, tier: 1, hold: 0, startPhase: 0 },
    { id: 'b', x: 7, y: 7, type: 'life', owner: 'player', active: true, tier: 1, hold: 0, startPhase: 0 }
  ] };
  Battle.tickNodeGarrison.call(tk, 'player');
  eq('有单位驻守的节点累计 1', tk.B.nodes[0].hold, 1);
  eq('无单位驻守的节点累计 0', tk.B.nodes[1].hold, 0);
  Battle.tickNodeGarrison.call(tk, 'player');
  eq('连续驻守 2 阶段后升 2 阶', tk.B.nodes[0].tier, 2);
  eq('升阶后累计清零', tk.B.nodes[0].hold, 0);

  // 11.5 第 1 章配置与提示
  const ch1 = CHAPTERS[0];
  ok('第 1 章节点显式配置 tier', ch1.nodes.every(nn => nn.tier === 1));
  ok('第 1 章提示说明升华', ch1.tips.indexOf('升华') >= 0);
}

console.log('\n== 12. 冰面滑行与地形动态层（P1.2） ==');
{
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/systems/terrain.js'), 'utf8'), ctx, { filename: 'js/systems/terrain.js' });
  const { TerrainFX, Battle } = vm.runInContext('({ TerrainFX, Battle })', ctx);

  // 12.1 Combat.slide：冰道 + 障碍
  const ICE_ROW = ['................', '................', '..IIIIIIIIIMII..',
                   '................', '..I.............', '..I.............',
                   '..I.............', '................'];
  const gridAt = (grid) => (x, y) => (grid[y] && grid[y][x] !== undefined ? TERRAIN[grid[y][x]] : null);
  const noOne = () => false;
  const W = 16, H = 8;

  // 从 (2,2) 向右进入冰道：滑到山岩 M(11,2) 前停下 → (10,2)
  let r = Combat.slide(gridAt(ICE_ROW), noOne, W, H, 2, 2, 1, 0);
  eq('冰道右滑遇山岩停在 (10,2)', r.x + ',' + r.y, '10,2');
  eq('滑行经过 8 格（2→10）', r.path.length, 8);
  eq('滑行路径末格即终点', r.path[r.path.length - 1].x + ',' + r.path[r.path.length - 1].y, '10,2');

  // 山岩占据时：前方有人 → 停在前一格
  const banditAt = (x, y) => (px, py) => px === x && py === y;
  r = Combat.slide(gridAt(ICE_ROW), banditAt(6, 2), W, H, 2, 2, 1, 0);
  eq('冰道右滑遇人停在 (5,2)', r.x + ',' + r.y, '5,2');

  // 滑出地图右边缘 → 停在最后一格冰（13,2 是冰，14 是草地会再进一步）
  const OPEN_ICE = ['................', '................', '..IIIIIIIIIIII..',
                    '................', '................', '................',
                    '................', '................'];
  r = Combat.slide(gridAt(OPEN_ICE), noOne, W, H, 2, 2, 1, 0);
  eq('冰道接草地：滑上草地即停 (14,2)', r.x + ',' + r.y, '14,2');
  const EDGE_ICE = ['................', '................', '..IIIIIIIIIIIIII',
                    '................', '................', '................',
                    '................', '................'];
  r = Combat.slide(gridAt(EDGE_ICE), noOne, W, H, 2, 2, 1, 0);
  eq('冰道到图边：停在 (15,2)', r.x + ',' + r.y, '15,2');

  // 纵向冰道：从 (2,4) 向下滑，冰到 row6，下一格草地 → 停 (2,7)
  r = Combat.slide(gridAt(ICE_ROW), noOne, W, H, 2, 4, 0, 1);
  eq('竖道下滑到图底草地 (2,7)', r.x + ',' + r.y, '2,7');

  // 入口即非冰面不应被调用；防呆：单步也不死循环
  r = Combat.slide(gridAt(ICE_ROW), noOne, W, H, 0, 0, 1, 0);
  eq('非冰面单步即停 (1,0)', r.x + ',' + r.y, '1,0');

  // 12.2 TerrainFX 动态层
  const B = { grid: ICE_ROW.slice(), units: [], overlays: {}, turn: 3 };
  ok('铺冰成功', TerrainFX.set(B, 5, 5, 'I', 3) === true);
  eq('覆盖层优先于静态地图', TerrainFX.tileChar(B, 5, 5), 'I');
  eq('静态地图格不受影响', TerrainFX.tileChar(B, 5, 4), ICE_ROW[4][5]);
  ok('越界铺设被拒', TerrainFX.set(B, 99, 0, 'I', 3) === false);
  eq('过期时间 = 当前回合 + 持续 - 1', B.overlays['5,5'].until, 5);
  TerrainFX.expire(B);
  eq('未到期不清理', TerrainFX.tileChar(B, 5, 5), 'I');
  B.turn = 5;
  const gone = TerrainFX.expire(B);
  eq('到期清理 1 层', gone.length, 1);
  eq('清理后恢复静态地形', TerrainFX.tileChar(B, 5, 5), '.');
  TerrainFX.set(B, 1, 1, 'M');           // 永久层
  eq('永久层 until = Infinity', B.overlays['1,1'].until, Infinity);
  TerrainFX.clear(B);
  eq('clear 清空全部', Object.keys(B.overlays).length, 0);

  // 12.3 slideDestination：路径终点在冰面才滑
  const pathOnIce = [{ x: 1, y: 6 }, { x: 1, y: 5 }, { x: 1, y: 4 }, { x: 1, y: 3 }, { x: 1, y: 2 }, { x: 2, y: 2 }];
  const sd = TerrainFX.slideDestination(B, pathOnIce);
  ok('冰面终点触发滑行', sd !== null);
  eq('滑到山岩前 (10,2)', sd.x + ',' + sd.y, '10,2');
  eq('动画路径含原路径 + 滑行段', sd.path.length, pathOnIce.length - 1 + 8);
  eq('动画路径终点一致', sd.path[sd.path.length - 1].x + ',' + sd.path[sd.path.length - 1].y, '10,2');
  const pathOnGrass = [{ x: 3, y: 6 }, { x: 4, y: 6 }];   // (4,6) 是草地
  ok('草地终点不滑行', TerrainFX.slideDestination(B, pathOnGrass) === null);
  ok('一步路径不滑行', TerrainFX.slideDestination(B, [{ x: 1, y: 1 }]) === null);
  // 覆盖层造的冰同样触发滑行
  TerrainFX.set(B, 4, 6, 'I');
  const pathOverlay = [{ x: 3, y: 6 }, { x: 4, y: 6 }];
  const sd2 = TerrainFX.slideDestination(B, pathOverlay);
  ok('覆盖层冰面也触发滑行', sd2 !== null);
  eq('覆盖层上滑行落上草地 (5,6)', sd2.x + ',' + sd2.y, '5,6');

  // 12.4 battle.tileAt 读覆盖层
  const bt = Object.create(Battle);
  bt.B = { grid: ICE_ROW.slice(), overlays: { '7,1': { char: 'I', until: 9 } }, turn: 3 };
  eq('tileAt 命中覆盖层', bt.tileAt(7, 1).name, '冰面');
  eq('tileAt 未命中回退静态', bt.tileAt(7, 0).name, '草地');
  eq('tileChar 返回覆盖字符', bt.tileChar(7, 1), 'I');

  // 12.5 resolvedGrid：寻路用的解析网格（覆盖层生效）
  const rg = TerrainFX.resolvedGrid(bt.B);
  eq('解析网格行数不变', rg.length, 8);
  eq('解析网格该格变为冰', rg[1][7], 'I');
  eq('解析网格其他格原样', rg[0][7], '.');
  const B2 = { grid: ICE_ROW.slice(), overlays: {}, turn: 1 };
  eq('无覆盖层时解析网格等于原图', TerrainFX.resolvedGrid(B2).join(''), ICE_ROW.join(''));
}

console.log('\n----------------------------------------');
console.log('结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
