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
for (const f of ['js/rng.js', 'js/data-core.js', 'js/data-systems.js', 'js/combat.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
// 注意：脚本顶层 const 不挂到 context 对象，需用表达式从全局词法作用域取回
const { Combat, TERRAIN, WEAPONS, SUPPORT_RANKS, STAT_ORDER, STAT_CAPS, TRIANGLE,
        ELEMENTS, ELEMENT_COUNTERS, ELEMENT_MULTIPLIER, SPELLS, LEGENDARY_WEAPONS,
        SUMMON_TIERS, SUMMON_FIELD_CAP, SUMMON_WEAPONS, SUMMON_TIER_NAMES } =
  vm.runInContext('({ Combat, TERRAIN, WEAPONS, SUPPORT_RANKS, STAT_ORDER, STAT_CAPS, TRIANGLE, ELEMENTS, ELEMENT_COUNTERS, ELEMENT_MULTIPLIER, SPELLS, LEGENDARY_WEAPONS, SUMMON_TIERS, SUMMON_FIELD_CAP, SUMMON_WEAPONS, SUMMON_TIER_NAMES })', ctx);

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

console.log('\n== 13. 五行相克与进阶系统数据表 ==');
{
  // 13.1 相克矩阵：5×5 = 25 组合全覆盖
  const els = Object.keys(ELEMENTS);
  eq('五行共 5 系', els.length, 5);
  let strong = 0, weak = 0, neutral = 0;
  for (const atk of els) {
    for (const def of els) {
      const r = Combat.elementMul(atk, def);
      if (atk === def) { neutral++; eq('同系 ' + atk + '→' + def + ' 中性', r.state + '/' + r.mul, 'neutral/1'); }
      else if (ELEMENT_COUNTERS[atk] === def) { strong++; eq(atk + ' 克 ' + def + ' → strong/1.25', r.state + '/' + r.mul, 'strong/1.25'); }
      else if (ELEMENT_COUNTERS[def] === atk) { weak++; eq(atk + ' 被 ' + def + ' 克 → weak/0.8', r.state + '/' + r.mul, 'weak/0.8'); }
      else { neutral++; eq(atk + ' 与 ' + def + ' 互不相克 → 中性', r.state + '/' + r.mul, 'neutral/1'); }
    }
  }
  eq('相克组合共 5 对', strong, 5);
  eq('被克组合共 5 对', weak, 5);
  eq('中性组合共 15 个（同系 5 + 互不相克 10）', neutral, 15);
  // 相克链自洽：沿链走 5 步回到自身
  {
    let cur = els[0];
    for (let i = 0; i < 5; i++) cur = ELEMENT_COUNTERS[cur];
    eq('相克链 5 步闭环', cur, els[0]);
  }

  // 13.2 边界与文案
  eq('空攻击元素 → 中性', Combat.elementMul(null, 'fire').state, 'neutral');
  eq('空防御元素 → 中性', Combat.elementMul('fire', null).state, 'neutral');
  eq('未知攻击元素 → 中性', Combat.elementMul('nope', 'fire').state, 'neutral');
  eq('未知防御元素 → 中性', Combat.elementMul('fire', 'nope').state, 'neutral');
  eq('未知元素倍率 = 1', Combat.elementMul('nope', 'fire').mul, 1);
  eq('相克文案：金 克 木', Combat.elementMul('metal', 'wood').text, '金 克 木');
  eq('被克文案：木 被 金 克', Combat.elementMul('wood', 'metal').text, '金 克 木');

  // 13.3 SPELLS 完整性
  const { CHARS, ENEMY_TYPES, WEAPON_TYPES } = vm.runInContext('({ CHARS, ENEMY_TYPES, WEAPON_TYPES })', ctx);
  eq('法术共 15 条', Object.keys(SPELLS).length, 15);
  const perEl = {};
  for (const k in SPELLS) {
    const s = SPELLS[k];
    ok('法术 ' + k + ' 元素合法', !!ELEMENTS[s.element], s.element);
    ok('法术 ' + k + ' 射程合法', Array.isArray(s.rng) && s.rng.length === 2 && s.rng[0] >= 1 && s.rng[0] <= s.rng[1]);
    ok('法术 ' + k + ' 每章次数 > 0', s.uses > 0);
    ok('法术 ' + k + ' 有威力与命中', s.mt > 0 && s.hit > 0);
    ok('法术 ' + k + ' 有描述', !!s.desc);
    ok('法术 ' + k + ' key 自洽', s.key === k);
    for (const l of (s.learnBy || [])) ok('法术 ' + k + ' 习得角色存在', !!CHARS[l.char], l.char);
    for (const h of (s.holders || [])) ok('法术 ' + k + ' 持法敌军存在', !!ENEMY_TYPES[h], h);
    perEl[s.element] = (perEl[s.element] || 0) + 1;
  }
  eq('每系各 3 条', Object.keys(perEl).map(e => e + ':' + perEl[e]).sort().join(' '), 'earth:3 fire:3 metal:3 water:3 wood:3');
  eq('范围逐目标法术 5 条', Object.values(SPELLS).filter(s => s.aoe).length, 5);
  ok('全部 A 阶法术均为范围逐目标', Object.values(SPELLS).every(s => s.rank !== 'A' || !!s.aoe));
  ok('A 阶法术每系一条', Object.values(SPELLS).filter(s => s.rank === 'A').length === 5);

  // 13.4 LEGENDARY_WEAPONS 完整性
  eq('传说武器共 7 把', Object.keys(LEGENDARY_WEAPONS).length, 7);
  const bosses = Object.keys(ENEMY_TYPES).filter(k => ENEMY_TYPES[k].boss);
  const sources = [];
  for (const k in LEGENDARY_WEAPONS) {
    const w = LEGENDARY_WEAPONS[k];
    ok('传说 ' + k + ' key 自洽', w.key === k);
    ok('传说 ' + k + ' 类型合法', !!WEAPON_TYPES[w.type], w.type);
    ok('传说 ' + k + ' 阶位 S', w.rank === 'S');
    ok('传说 ' + k + ' 不可打造', w.forgeable === false);
    ok('传说 ' + k + ' 无购价', w.price === 0);
    ok('传说 ' + k + ' 来源是 Boss', ENEMY_TYPES[w.source] && ENEMY_TYPES[w.source].boss === true, w.source);
    ok('传说 ' + k + ' 重打保底', w.drop && w.drop.rematch === true);
    ok('传说 ' + k + ' 二周目保底', w.drop && w.drop.ngplus === true);
    ok('传说 ' + k + ' 多词条 ≥2', Array.isArray(w.traits) && w.traits.length >= 2);
    ok('传说 ' + k + ' 附带技能有名有述', !!(w.skill && w.skill.name && w.skill.desc));
    ok('传说 ' + k + ' 有描述', !!w.desc);
    ok('传说 ' + k + ' 射程合法', Array.isArray(w.rng) && w.rng.length === 2 && w.rng[0] >= 1 && w.rng[0] <= w.rng[1]);
    sources.push(w.source);
  }
  eq('传说武器来源互不重复', new Set(sources).size, 7);
  eq('已覆盖 8 个 Boss 中的 7 个', bosses.filter(b => sources.includes(b)).length, 7);

  // 13.5 SUMMON_TIERS 完整性
  eq('召唤共 3 阶', SUMMON_TIERS.length, 3);
  eq('场上召唤物上限 2', SUMMON_FIELD_CAP, 2);
  const tierNums = SUMMON_TIERS.map(t => t.tier);
  eq('阶位 1/2/3', tierNums.join(','), '1,2,3');
  eq('阶位名称 异兽/灵兽/神兽', SUMMON_TIERS.map(t => t.name).join('/'), '异兽/灵兽/神兽');
  for (const t of SUMMON_TIERS) {
    ok('阶 ' + t.tier + ' 有三态指令', t.orders.length === 3);
    ok('阶 ' + t.tier + ' 指令键正确', t.orders.map(o => o.key).join(',') === 'assault,guard,escort');
    ok('阶 ' + t.tier + ' 武器存在', !!WEAPONS[t.weapon] || !!SUMMON_WEAPONS[t.weapon], t.weapon);
    ok('阶 ' + t.tier + ' 模板 8 维齐全', ['hp','str','mag','skl','spd','lck','def','res'].every(k => typeof t.base[k] === 'number' && typeof t.growth[k] === 'number'));
    ok('阶 ' + t.tier + ' 移动力 > 0', t.move > 0);
    ok('阶 ' + t.tier + ' 有描述', !!t.desc);
    ok('阶 ' + t.tier + ' 阶名表一致', SUMMON_TIER_NAMES[t.tier] === t.name);
  }
  ok('阶位越高基础生命越高', SUMMON_TIERS[1].base.hp > SUMMON_TIERS[0].base.hp && SUMMON_TIERS[2].base.hp > SUMMON_TIERS[1].base.hp);
  ok('召唤新武器 2 把', Object.keys(SUMMON_WEAPONS).length === 2);
  for (const k in SUMMON_WEAPONS) ok('召唤武器 ' + k + ' 类型合法', !!WEAPON_TYPES[SUMMON_WEAPONS[k].type]);
}

console.log('\n== 14. 法术与召唤系统落地（P2） ==');
(async () => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/systems/spells.js'), 'utf8'), ctx, { filename: 'js/systems/spells.js' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/systems/summon.js'), 'utf8'), ctx, { filename: 'js/systems/summon.js' });
  const { Spells, Summon, Battle, RNG } = vm.runInContext('({ Spells, Summon, Battle, RNG })', ctx);

  const zeroCtx = {
    mods: () => Combat.zeroMods(),
    tileAt: () => ({ avoid: 0, def: 0, cost: 1 }),
    rng: RNG
  };

  // 14.1 Combat.spellAttack：mag+mt-res，乘相克倍率；命中/暴击钳制
  const caster = { id: 'c1', name: '玄漪', side: 'player', level: 16, charId: 'xuanyi',
    stats: { mag: 10, skl: 8, lck: 4, spd: 8, hp: 20 } };
  const mkFoe = (el) => ({ id: 'e1', name: '敌', side: 'enemy', x: 0, y: 0,
    stats: { res: 3, skl: 0, lck: 3, spd: 6, hp: 30 }, element: el });
  const metalEdge = SPELLS.metal_edge;   // mt5 hit90 crit0
  let f = Combat.spellAttack(caster, mkFoe(undefined), metalEdge, zeroCtx);
  eq('法术中性伤害 = mag+mt-res = 12', f.dmg, 12);
  eq('中性无相克文本', f.element.state, 'neutral');
  f = Combat.spellAttack(caster, mkFoe('wood'), metalEdge, zeroCtx);
  eq('金克木伤害 ×1.25 = 15', f.dmg, 15);
  eq('相克状态 strong', f.element.state, 'strong');
  f = Combat.spellAttack(caster, mkFoe('fire'), metalEdge, zeroCtx);
  eq('火克金伤害 ×0.8 = 10', f.dmg, 10);
  eq('被克状态 weak', f.element.state, 'weak');
  f = Combat.spellAttack(caster, mkFoe('metal'), metalEdge, zeroCtx);
  eq('同系中性 = 12', f.dmg, 12);
  eq('命中 = 90+16+2-(12+3) = 93', f.hit, 93);
  eq('暴击 = 0+4-3 = 1', f.crit, 1);
  const fatCaster = { stats: { mag: 10, skl: 60, lck: 40, spd: 8 } };
  f = Combat.spellAttack(fatCaster, mkFoe(undefined), metalEdge, zeroCtx);
  eq('命中钳制 100', f.hit, 100);
  eq('暴击钳制下限 0', Combat.spellAttack(fatCaster, { stats: { res: 0, lck: 60, spd: 2, hp: 10 } }, SPELLS.metal_break, zeroCtx).crit, 0);
  eq('伤害不为负（高抗目标）', Combat.spellAttack({ stats: { mag: 1, skl: 0, lck: 0, spd: 1 } }, { stats: { res: 99, lck: 0, spd: 1, hp: 10 } }, SPELLS.earth_rock, zeroCtx).dmg, 0);

  // 14.2 Spells 可用性：我方按 charId+level，敌方按 holders
  eq('玄漪 5 级会 5 门初阶', Spells.forUnit({ side: 'player', charId: 'xuanyi', level: 5 }).length, 5);
  eq('玄漪 10 级会 10 门', Spells.forUnit({ side: 'player', charId: 'xuanyi', level: 10 }).length, 10);
  eq('玄漪 16 级会全 15 门', Spells.forUnit({ side: 'player', charId: 'xuanyi', level: 16 }).length, 15);
  eq('赤桑 8 级会 3 门（流火 9 级未到）', Spells.forUnit({ side: 'player', charId: 'chisang', level: 8 }).length, 3);
  eq('鹿鸣 2 级还不会法术', Spells.forUnit({ side: 'player', charId: 'luming', level: 2 }).length, 0);
  eq('云策不能习得任何法术', Spells.forUnit({ side: 'player', charId: 'yunce', level: 20 }).length, 0);
  eq('竹妖持 2 门木法', Spells.forUnit({ side: 'enemy', rawType: 'bamboo' }).map(s => s.key).join(','), 'wood_vine,wood_final');
  eq('玄阙持 3 门高阶', Spells.forUnit({ side: 'enemy', rawType: 'xuanque' }).length, 3);
  eq('山贼不持法', Spells.forEnemyType('bandit').length, 0);

  // 14.3 次数：默认满、扣减、耗尽不可用
  const u1 = { side: 'player', charId: 'xuanyi', level: 16, spellUses: {} };
  eq('默认满次数 4', Spells.usesLeft(u1, 'metal_final'), 4);
  Spells.consume(u1, 'metal_final');
  eq('扣一次剩 3', Spells.usesLeft(u1, 'metal_final'), 3);
  ok('还有次数可用', Spells.canUse(u1, 'metal_final'));
  for (let i = 0; i < 3; i++) Spells.consume(u1, 'metal_final');
  ok('耗尽后不可用', !Spells.canUse(u1, 'metal_final'));
  eq('次数不会扣成负数', Spells.usesLeft(u1, 'metal_final'), 0);
  Spells.resetUses(u1);
  eq('resetUses 后恢复满次数', Spells.usesLeft(u1, 'metal_final'), 4);

  // 14.4 aoeTargets：曼哈顿半径、死活/逃脱/同侧过滤
  const B0 = { units: [
    { id: 'c', side: 'player', x: 1, y: 1, hp: 10 },
    { id: 't', side: 'enemy', x: 5, y: 5, hp: 10 },
    { id: 'x1', side: 'enemy', x: 6, y: 5, hp: 10 },
    { id: 'x2', side: 'enemy', x: 5, y: 6, hp: 10 },
    { id: 'far', side: 'enemy', x: 8, y: 8, hp: 10 },
    { id: 'dead', side: 'enemy', x: 4, y: 5, hp: 0 },
    { id: 'gone', side: 'enemy', x: 5, y: 4, hp: 10, escaped: true }
  ] };
  const aoe = Spells.aoeTargets(B0, { x: 5, y: 5 }, SPELLS.wood_final, 'player');
  eq('aoe 收 3 个敌方存活单位', aoe.length, 3);
  ok('aoe 含主目标', aoe.some(t => t.id === 't'));
  ok('aoe 排除死者', !aoe.some(t => t.id === 'dead'));
  ok('aoe 排除逃脱者', !aoe.some(t => t.id === 'gone'));
  ok('aoe 排除超距', !aoe.some(t => t.id === 'far'));
  ok('aoe 排除同侧', !aoe.some(t => t.id === 'c'));
  eq('单体法术无 aoe', Spells.aoeTargets(B0, { x: 5, y: 5 }, SPELLS.metal_edge, 'player').length, 0);

  // 14.5 applyEffect：定身/破甲/迷眼 + 过期回合
  const tgt = {};
  Spells.applyEffect(tgt, { root: 1, debuffDef: 2, debuffAvoid: 10, turns: 1 }, 5);
  eq('定身到第 6 阶段', tgt.statuses.root.until, 6);
  eq('破甲值 2', tgt.statuses.def.val, 2);
  eq('破甲到期 6', tgt.statuses.def.until, 6);
  eq('迷眼值 10', tgt.statuses.avoid.val, 10);
  eq('效果描述文本', Spells.effectText({ root: 1, debuffDef: 2 }), '定身·护甲 -2');
  eq('无效果返回空串', Spells.effectText(null), '');

  // 14.6 cast 全流程（假 host）：命中、波及、效果、死亡、次数、经验
  const logs = [];
  const host = {
    B: { units: [], stats: { damage: 0 }, phaseIndex: 5 },
    ctx: zeroCtx,
    log: (m) => logs.push(m),
    float: () => {}, sfx: () => {}, wait: () => Promise.resolve(),
    kill: (unit) => { unit.dead = true; },
    exp: (unit, n) => { unit.expGained = (unit.expGained || 0) + n; }
  };
  const wf = SPELLS.wood_final;   // mt11 aoe1 root，木
  const sc = { id: 'c1', name: '玄漪', side: 'player', level: 16, charId: 'xuanyi', x: 3, y: 3, hp: 20, spellUses: {},
    stats: { mag: 10, skl: 50, lck: 4, spd: 8 } };
  const e1 = { id: 'e1', name: '竹妖', side: 'enemy', x: 5, y: 5, hp: 10, stats: { res: 3, lck: 30, spd: 6, hp: 34 }, element: 'earth', statuses: {} };
  const e2 = { id: 'e2', name: '山贼', side: 'enemy', x: 6, y: 5, hp: 100, stats: { res: 3, lck: 30, spd: 6, hp: 21 }, statuses: {} };
  host.B.units = [sc, e1, e2];
  await Spells.cast(host, sc, e1, wf);
  eq('施法后扣 1 次', Spells.usesLeft(sc, 'wood_final'), 3);
  eq('主目标受 木克土 23 伤害致死', e1.hp, 0);
  ok('主目标死亡回调', e1.dead === true);
  eq('波及目标受 18 中性伤害', e2.hp, 82);
  ok('主目标被定身', e1.statuses.root && e1.statuses.root.until === 6);
  ok('波及目标也被定身', e2.statuses.root && e2.statuses.root.until === 6);
  eq('我方统计伤害累计 41', host.B.stats.damage, 41);
  eq('施法者获得 10 经验', sc.expGained, 10);
  ok('日志含咏唱', logs.some(m => m.indexOf('咏唱') >= 0));
  ok('日志含相克', logs.some(m => m.indexOf('木 克 土') >= 0));
  ok('日志含定身', logs.some(m => m.indexOf('定身') >= 0));

  // 敌方法术：不加我方统计、不给经验
  const logs2 = [];
  const host2 = {
    B: { units: [], stats: { damage: 0 }, phaseIndex: 2 },
    ctx: zeroCtx,
    log: (m) => logs2.push(m), float: () => {}, sfx: () => {}, wait: () => Promise.resolve(),
    kill: () => {}, exp: (unit, n) => { unit.expGained = (unit.expGained || 0) + n; }
  };
  const boss = { id: 'b1', name: '竹妖', side: 'enemy', rawType: 'bamboo', level: 8, x: 3, y: 3, hp: 34, spellUses: {},
    stats: { mag: 11, skl: 8, lck: 4, spd: 6 } };
  const victim = { id: 'p1', name: '云策', side: 'player', charId: 'yunce', x: 5, y: 3, hp: 23, stats: { res: 3, lck: 7, spd: 9, hp: 23 }, element: 'metal', statuses: {} };
  host2.B.units = [boss, victim];
  await Spells.cast(host2, boss, victim, SPELLS.wood_vine);
  ok('敌方命中并造成伤害', victim.hp < 23);
  eq('敌方施法不计我方伤害统计', host2.B.stats.damage, 0);
  eq('敌方不给经验', boss.expGained, undefined);
  ok('敌方缠魂藤附定身', victim.statuses.root && victim.statuses.root.until === 3);

  // 14.7 Summon：阶位查表、实例化、场上上限、指令态、拦截、随行
  eq('技能 2 阶最高召 2', Summon.maxTier(2), 2);
  eq('无技能数字回退 1 阶', Summon.maxTier(undefined), 1);
  eq('true 回退 1 阶', Summon.maxTier(true), 1);
  eq('超范围钳到 3 阶', Summon.maxTier(9), 3);
  eq('2 阶技能给出 2 个阶位', Summon.tiersFor(2).length, 2);
  eq('边界处向右找空格', Summon.freeAdjacent({ units: [] }, 0, 0, null).x, 1);

  const c5 = { id: 'c1', level: 5, x: 4, y: 4 };
  const w = Summon.spawn({ units: [] }, 7, c5, 1);
  eq('异兽按表取名山灵狼', w.name, '山灵狼');
  eq('异兽生命 20+1.8×4 = 27', w.stats.hp, 27);
  eq('异兽魔力下限 1', w.stats.mag, 1);
  eq('异兽武器狼爪', w.items[0].key, 'wolf_claw');
  eq('召唤物 id 取 uid', w.id, 'u7');
  eq('默认指令猛攻', w.summon.order, 'assault');
  eq('记录召唤者', w.summon.caster, 'c1');
  ok('召唤当回合不可再行动', w.acted === true);
  eq('生命等于满值', w.hp, w.stats.hp);
  const p = Summon.spawn({ units: [] }, 8, c5, 2);
  eq('灵兽取名云豹', p.name, '云豹');
  eq('灵兽生命 26+2.1×4 = 34', p.stats.hp, 34);
  eq('灵兽武器雷纹爪', p.items[0].key, 'leopard_claw');
  ok('雷纹爪已并入 WEAPONS', !!WEAPONS.leopard_claw);
  const bz = Summon.spawn({ units: [] }, 9, c5, 3);
  eq('神兽取名白泽', bz.name, '白泽');
  eq('神兽生命 34+2.6×4 = 44', bz.stats.hp, 44);
  eq('神兽武器通明角', bz.items[0].key, 'baize_horn');
  ok('通明角已并入 WEAPONS', !!WEAPONS.baize_horn);
  ok('阶位越界回退 1 阶', Summon.spawn({ units: [] }, 10, c5, 9).summon.tier === 1);

  const B1 = { units: [
    { id: 'a', summoned: true, hp: 10, escaped: false },
    { id: 'b', summoned: true, hp: 0, escaped: false },
    { id: 'c', summoned: true, hp: 10, escaped: true },
    { id: 'd', summoned: false, hp: 10, escaped: false }
  ] };
  eq('场上只算存活未逃脱的召唤物', Summon.fieldCount(B1), 1);
  ok('未达上限可召', Summon.canSpawn(B1));
  B1.units.push({ id: 'e', summoned: true, hp: 5, escaped: false });
  eq('达到 2 只上限', Summon.fieldCount(B1), 2);
  ok('达到上限不可召', !Summon.canSpawn(B1));

  const wolf = Summon.spawn({ units: [] }, 1, { id: 'c', level: 1 }, 1);
  eq('默认猛攻效果', JSON.stringify(Summon.orderEffect(wolf)), JSON.stringify({ dmg: 2, def: -2 }));
  ok('切到守御', Summon.setOrder(wolf, 'guard'));
  eq('守御效果', JSON.stringify(Summon.orderEffect(wolf)), JSON.stringify({ def: 3, avoid: 10, hold: true }));
  ok('非法指令被拒', !Summon.setOrder(wolf, 'fly'));
  eq('指令未被改动', Summon.orderOf(wolf), 'guard');
  const mm = Combat.zeroMods();
  Summon.applyOrderMods(wolf, mm);
  eq('守御护甲 +3', mm.def, 3);
  eq('守御回避 +10', mm.avoid, 10);

  const B2 = { units: [
    { id: 'p', side: 'player', x: 5, y: 5, hp: 20 },
    { id: 's1', side: 'player', summoned: true, hp: 20, x: 6, y: 5, summon: { tier: 1, order: 'escort', caster: 'p' } },
    { id: 's2', side: 'player', summoned: true, hp: 20, x: 4, y: 5, summon: { tier: 1, order: 'assault', caster: 'p' } }
  ] };
  eq('随行召唤替友军挡击', Summon.interceptTarget(B2, { side: 'enemy' }, B2.units[0]).id, 's1');
  Summon.setOrder(B2.units[1], 'assault');
  ok('无非随行相邻则不拦截', Summon.interceptTarget(B2, { side: 'enemy' }, B2.units[0]) === null);
  ok('我方互殴不触发拦截', Summon.interceptTarget(B2, { side: 'player' }, B2.units[0]) === null);
  B2.units[2].x = 8;
  ok('不相邻不拦截', Summon.interceptTarget(B2, { side: 'enemy' }, B2.units[0]) === null);

  const B3 = { units: [
    { id: 'c1', side: 'player', x: 5, y: 5, hp: 20 },
    { id: 's1', side: 'player', summoned: true, hp: 20, x: 5, y: 9, summon: { tier: 1, order: 'escort', caster: 'c1' } },
    { id: 's2', side: 'player', summoned: true, hp: 20, x: 5, y: 6, summon: { tier: 1, order: 'assault', caster: 'c1' } }
  ] };
  const fl = [];
  Summon.followCaster(B3, B3.units[0], (m) => fl.push(m), () => {});
  eq('随行召唤贴近到 (5,4)', B3.units[1].x + ',' + B3.units[1].y, '5,4');
  ok('非随行指令不跟随', B3.units[2].x === 5 && B3.units[2].y === 6);
  ok('有随行日志', fl.length === 1);
  B3.units[1].x = 6; B3.units[1].y = 5;
  eq('已相邻不重复移动', Summon.followCaster(B3, B3.units[0], () => {}, () => {}).length, 0);
  B3.units[1].x = 5; B3.units[1].y = 9;
  B3.units.push({ id: 'block', side: 'player', hp: 20, x: 5, y: 4 });
  Summon.followCaster(B3, B3.units[0], () => {}, () => {});
  eq('上方被占改去 (6,5)', B3.units[1].x + ',' + B3.units[1].y, '6,5');

  // 14.8 battle.modsFor 集成：状态与指令态进修正链
  const bt = Object.create(Battle);
  bt.B = { units: [], nodes: [], phaseIndex: 5, supports: {} };
  eq('定身使移动力 -99', bt.modsFor({ side: 'enemy', stats: {}, statuses: { root: { until: 6 } } }, null).move, -99);
  eq('过期定身不减速', bt.modsFor({ side: 'enemy', stats: {}, statuses: { root: { until: 4 } } }, null).move, 0);
  eq('迷眼回避 -10', bt.modsFor({ side: 'enemy', stats: {}, statuses: { avoid: { val: 10, until: 6 } } }, null).avoid, -10);
  eq('破甲护甲 -2', bt.modsFor({ side: 'enemy', stats: {}, statuses: { def: { val: 2, until: 6 } } }, null).def, -2);
  const ma = bt.modsFor({ side: 'player', summoned: true, summon: { tier: 1, order: 'assault', caster: 'c' }, stats: {} }, null);
  eq('猛攻伤害 +2', ma.dmg, 2);
  eq('猛攻护甲 -2', ma.def, -2);
  const mg = bt.modsFor({ side: 'player', summoned: true, summon: { tier: 3, order: 'guard', caster: 'c' }, stats: {} }, null);
  eq('神兽守御护甲 +5', mg.def, 5);
  eq('神兽守御回避 +15', mg.avoid, 15);

  // 15. 战役内容接线：入队点完整、对话存在、冰面几何
  {
    const { CHAPTERS, DIALOGUES, CHARS, TERRAIN } = vm.runInContext('({ CHAPTERS, DIALOGUES, CHARS, TERRAIN })', ctx);
    const STARTERS = ['yunce', 'yankui', 'luming'];   // game.js newCampaign 初始队
    const obtainable = new Set(STARTERS);
    const recruitSpots = [];
    CHAPTERS.forEach((ch, i) => {
      (ch.villages || []).forEach(v => {
        if (v.recruit) {
          obtainable.add(v.recruit);
          recruitSpots.push({ ch: i + 1, char: v.recruit, talk: v.talk, at: '村' });
        }
      });
      (ch.enemies || []).forEach(e => {
        if (e.char && e.recruitable) {
          obtainable.add(e.char);
          recruitSpots.push({ ch: i + 1, char: e.char, talk: e.talkKey, at: e.x + ',' + e.y });
        }
      });
    });
    const missing = Object.keys(CHARS).filter(k => !obtainable.has(k));
    eq('全部角色都有入队路径', missing.join(',') || '无', '无');
    eq('招募点共 7 处（2 村 + 5 图）', recruitSpots.length, 7);
    for (const s of recruitSpots) {
      ok('招募点 ' + s.char + '（第' + s.ch + '章）对话存在', !!s.talk && !!DIALOGUES[s.talk], s.talk);
      ok('招募点 ' + s.char + ' 是有效角色', !!CHARS[s.char]);
    }
    // 招募单位落点合法：可行走、不占部署格、不与其他单位/物件重叠
    CHAPTERS.forEach((ch, i) => {
      const deploy = new Set((ch.deployTiles || []).map(t => t[0] + ',' + t[1]));
      const taken = new Set();
      (ch.villages || []).forEach(v => taken.add(v.x + ',' + v.y));
      (ch.chests || []).forEach(v => taken.add(v.x + ',' + v.y));
      (ch.shrines || []).forEach(v => taken.add(v.x + ',' + v.y));
      (ch.enemies || []).forEach(e => {
        const k = e.x + ',' + e.y;
        ok('第' + (i + 1) + '章单位 (' + k + ') 不与其他物件重叠', !taken.has(k), k);
        taken.add(k);
        if (e.char && e.recruitable) {
          ok('第' + (i + 1) + '章招募单位 (' + k + ') 不在部署格', !deploy.has(k), k);
          const t = TERRAIN[ch.map[e.y][e.x]];
          ok('第' + (i + 1) + '章招募单位 (' + k + ') 地形可行走', !!t && !t.blocked, ch.map[e.y][e.x]);
        }
      });
    });
    // 持法 Boss 都在战役中出场
    const bossInCampaign = new Set();
    CHAPTERS.forEach(ch => (ch.enemies || []).forEach(e => { if (e.type) bossInCampaign.add(e.type); }));
    for (const k in SPELLS) {
      for (const h of (SPELLS[k].holders || [])) {
        ok('持法 Boss ' + h + ' 在战役出场（' + SPELLS[k].name + '）', bossInCampaign.has(h));
      }
    }
    // 第 5 章冰面：存在冰带，且从 (6,5) 向上进入会滑上阵眼 n1(6,2)
    const ch5 = CHAPTERS[4];
    const iceCount = ch5.map.join('').split('').filter(c => c === 'I').length;
    ok('第 5 章有冰面（6 格）', iceCount === 6, '实际 ' + iceCount);
    eq('冰带第 3 行', ch5.map[3], '....r.II.....r..');
    eq('冰带第 4 行', ch5.map[4], '..h...IIII......');
    ok('部署格无冰', (ch5.deployTiles || []).every(t => ch5.map[t[1]][t[0]] !== 'I'));
    const gridAt = (grid) => (x, y) => (grid[y] && grid[y][x] !== undefined ? TERRAIN[grid[y][x]] : null);
    const noOne = () => false;
    const r5 = Combat.slide(gridAt(ch5.map), noOne, 16, 8, 6, 5, 0, -1);
    eq('沿冰道向上滑上阵眼 n1 (6,2)', r5.x + ',' + r5.y, '6,2');
    eq('滑行经过 3 格', r5.path.length, 3);
    const r5b = Combat.slide(gridAt(ch5.map), noOne, 16, 8, 5, 4, 1, 0);
    eq('第 4 行横滑停在 (10,4)', r5b.x + ',' + r5b.y, '10,4');
    eq('横滑经过 5 格', r5b.path.length, 5);
    ok('第 5 章提示说明滑行', ch5.tips.indexOf('滑行') >= 0);
  }

  console.log('\n----------------------------------------');
  console.log('结果：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})();
