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
for (const f of ['js/rng.js', 'js/data-core.js', 'js/data-systems.js', 'js/combat.js', 'js/juice.js', 'js/relations.js', 'js/systems/legendary.js', 'js/systems/smith.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
// 注意：脚本顶层 const 不挂到 context 对象，需用表达式从全局词法作用域取回
const { Combat, TERRAIN, WEAPONS, SUPPORT_RANKS, STAT_ORDER, STAT_CAPS, TRIANGLE,
        ELEMENTS, ELEMENT_COUNTERS, ELEMENT_MULTIPLIER, SPELLS, LEGENDARY_WEAPONS,
        SUMMON_TIERS, SUMMON_FIELD_CAP, SUMMON_WEAPONS, SUMMON_TIER_NAMES,
        Legendary, Forge } =
  vm.runInContext('({ Combat, TERRAIN, WEAPONS, SUPPORT_RANKS, STAT_ORDER, STAT_CAPS, TRIANGLE, ELEMENTS, ELEMENT_COUNTERS, ELEMENT_MULTIPLIER, SPELLS, LEGENDARY_WEAPONS, SUMMON_TIERS, SUMMON_FIELD_CAP, SUMMON_WEAPONS, SUMMON_TIER_NAMES, Legendary, Forge })', ctx);
const { Relations, SUPPORTS, CHARS, CLASSES,
        SUPPORT_POINTS_ADJACENT, SUPPORT_RANGE } =
  vm.runInContext('({ Relations, SUPPORTS, CHARS, CLASSES, SUPPORT_POINTS_ADJACENT, SUPPORT_RANGE })', ctx);

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
  eq('法术共 18 条', Object.keys(SPELLS).length, 18);
  const perEl = {};
  for (const k in SPELLS) {
    const s = SPELLS[k];
    ok('法术 ' + k + ' 元素合法', s.song ? (s.element === 'none') : !!ELEMENTS[s.element], s.element);
    ok('法术 ' + k + ' 射程合法', Array.isArray(s.rng) && s.rng.length === 2 && s.rng[0] >= 1 && s.rng[0] <= s.rng[1]);
    ok('法术 ' + k + ' 每章次数 > 0', s.uses > 0);
    ok('法术 ' + k + ' 有威力与命中', s.song ? (s.hit > 0) : (s.mt > 0 && s.hit > 0));
    ok('法术 ' + k + ' 有描述', !!s.desc);
    ok('法术 ' + k + ' key 自洽', s.key === k);
    for (const l of (s.learnBy || [])) ok('法术 ' + k + ' 习得角色存在', !!CHARS[l.char], l.char);
    for (const h of (s.holders || [])) ok('法术 ' + k + ' 持法敌军存在', !!ENEMY_TYPES[h], h);
    perEl[s.element] = (perEl[s.element] || 0) + 1;
  }
  eq('五行系各 3 条 + 歌 3 条', Object.keys(perEl).map(e => e + ':' + perEl[e]).sort().join(' '), 'earth:3 fire:3 metal:3 none:3 water:3 wood:3');
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
    ok('传说 ' + k + ' 多词条 ≥3', Array.isArray(w.traits) && w.traits.length >= 3);
    ok('传说 ' + k + ' 附带技能有名有述', !!(w.skill && w.skill.name && w.skill.desc));
    ok('传说 ' + k + ' 有描述', !!w.desc);
    ok('传说 ' + k + ' 射程合法', Array.isArray(w.rng) && w.rng.length === 2 && w.rng[0] >= 1 && w.rng[0] <= w.rng[1]);
    /* 词条字段必须全部被 Combat.weaponMods 支持（不允许死数据） */
    for (const t of w.traits || []) {
      for (const f in t) {
        const mm = /^([a-zA-Z]+?)(?:Vs([A-Z][A-Za-z]*))?$/.exec(f);
        ok('传说 ' + k + ' 词条 ' + f + ' 字段可解析', !!mm && ['hit', 'crit', 'dmg', 'def', 'res', 'avoid', 'move'].includes(mm[1]), f);
      }
    }
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
    const { CHAPTERS, DIALOGUES, CHARS, TERRAIN, AUTO_JOINS } = vm.runInContext('({ CHAPTERS, DIALOGUES, CHARS, TERRAIN, AUTO_JOINS })', ctx);
    const STARTERS = ['yunce', 'yankui', 'luming'];   // game.js newCampaign 初始队
    const obtainable = new Set(STARTERS);
    const recruitSpots = [];
    CHAPTERS.forEach((ch, i) => {
      (ch.villages || []).forEach(v => {
        if (v.recruit) {
          obtainable.add(v.recruit);
          recruitSpots.push({ ch: ch.no, char: v.recruit, talk: v.talk, at: '村' });
        }
      });
      (ch.enemies || []).forEach(e => {
        if (e.char && e.recruitable) {
          obtainable.add(e.char);
          recruitSpots.push({ ch: ch.no, char: e.char, talk: e.talkKey, at: e.x + ',' + e.y });
        }
      });
    });
    // 章末保险网 autoJoins（data-maps.js）：P3.1 起键为 chapterId（数字或 '5A' 这类路线章）
    for (const chId in AUTO_JOINS) {
      ok('autoJoins 章 ' + chId + ' 存在', CHAPTERS.some(c => String(c.id) === chId));
      for (const id of AUTO_JOINS[chId]) {
        ok('autoJoins ' + id + ' 是有效角色', !!CHARS[id], id);
        obtainable.add(id);
      }
    }
    eq('姜姒两条线都能入队', ['6A', '5B'].every(k => (AUTO_JOINS[k] || []).includes('jiangsi')), true);
    eq('虞素秋两条线都能入队', ['6A', '6B'].every(k => (AUTO_JOINS[k] || []).includes('yusqiu')), true);
    const missing = Object.keys(CHARS).filter(k => !obtainable.has(k));
    eq('全部角色都有入队路径', missing.join(',') || '无', '无');
    eq('招募点共 8 处（2 村 + 6 图）', recruitSpots.length, 8);
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

  /* ---------------- 16. 传说武器与打造坊 ---------------- */
  {
    const { CHAPTERS, ENEMY_TYPES } = vm.runInContext('({ CHAPTERS, ENEMY_TYPES })', ctx);
    const fresh = () => ({ gold: 5000, seals: 5, convoy: [], legendary: {}, legendaryPity: {}, cycle: 1 });
    const never = () => 0.99;   // 必不掉的命运
    const lucky = () => 0;      // 必掉的命运
    const camp = fresh();
    /* --- 小概率掉落 --- */
    const miss1 = Legendary.onBossKilled(camp, 'shanxiao', never);
    eq('首战未掉动作 miss', miss1 && miss1.action, 'miss');
    eq('首战未掉概率 3%', miss1 && miss1.chance, 0.03);
    eq('缘值累计 1', camp.legendaryPity['shanxiao'], 1);
    ok('未掉不标记持有', !Legendary.isOwned(camp, 'lw_yunque'));
    const d2 = Legendary.dropChance(camp, 'shanxiao');
    eq('二次讨伐掉率 6%', d2.chance, 0.06);
    const miss2 = Legendary.onBossKilled(camp, 'shanxiao', never);
    eq('再未掉缘值 2', camp.legendaryPity['shanxiao'], 2);
    eq('miss 回报本次为第几次', miss2 && miss2.since, 2);
    const drop = Legendary.onBossKilled(camp, 'bamboo', lucky);
    eq('幸运一击掉落', drop && drop.action, 'drop');
    ok('掉落标记已持有', Legendary.isOwned(camp, 'lw_wanbi'));
    eq('掉落后缘清零', camp.legendaryPity['bamboo'], undefined);
    ok('roll 低于概率才掉', Legendary.onBossKilled(fresh(), 'waterghost', () => 0.5).action === 'miss');
    /* --- 硬保底：12 次必掉 --- */
    const camp2 = fresh();
    for (let i = 0; i < 11; i++) Legendary.onBossKilled(camp2, 'shanxiao', never);
    ok('11 次未掉不保底', !Legendary.isOwned(camp2, 'lw_yunque'));
    eq('第 12 次前缘值 11', camp2.legendaryPity['shanxiao'], 11);
    const pity12 = Legendary.onBossKilled(camp2, 'shanxiao', never);
    eq('第 12 次必掉', pity12 && pity12.action, 'drop');
    eq('必掉概率 100%', pity12 && pity12.chance, 1);
    eq('掉落后缘清零', camp2.legendaryPity['shanxiao'], undefined);
    /* --- 掉率封顶与二周目加成 --- */
    const camp3 = fresh();
    camp3.legendaryPity['shanxiao'] = 8;
    eq('掉率封顶 25%', Legendary.dropChance(camp3, 'shanxiao').chance, 0.25);
    camp3.legendaryPity['shanxiao'] = 0; camp3.cycle = 2;
    eq('二周目基础掉率 8%', Legendary.dropChance(camp3, 'shanxiao').chance, 0.08);
    camp3.legendaryPity['shanxiao'] = 8; camp3.cycle = 2;
    eq('二周目同样封顶 25%', Legendary.dropChance(camp3, 'shanxiao').chance, 0.25);
    ok('二周目标记', Legendary.dropChance(camp3, 'shanxiao').ngplus);
    /* --- 普通敌人不触发 --- */
    ok('普通敌不掉传说', Legendary.onBossKilled(fresh(), 'bandit') === null);
    ok('普通敌无掉率', Legendary.dropChance(fresh(), 'bandit') === null);
    ok('未知道具无图鉴提示', Legendary.hint('nope') === '');
    ok('提示含必掉说明', Legendary.hint('lw_yunque').indexOf('必掉') >= 0);
    ok('提示含极小概率说明', Legendary.hint('lw_yunque').indexOf('极小概率') >= 0);
    // 7 把传说各绑一个 Boss
    eq('传说武器 7 把', Object.keys(LEGENDARY_WEAPONS).length, 7);
    const sources = Object.keys(LEGENDARY_WEAPONS).map(k => LEGENDARY_WEAPONS[k].source);
    eq('首领互不重复', new Set(sources).size, 7);
    const bossInCampaign = new Set();
    CHAPTERS.forEach(ch => (ch.enemies || []).forEach(e => { if (e.type) bossInCampaign.add(e.type); }));
    for (const k in LEGENDARY_WEAPONS) {
      ok('传说 ' + k + ' 的首领在战役出场', bossInCampaign.has(LEGENDARY_WEAPONS[k].source));
    }
    /* --- 已持有：重打转化 --- */
    const campOwn = fresh();
    campOwn.legendary['lw_yunque'] = true;
    const rematch = Legendary.onBossKilled(campOwn, 'shanxiao');
    eq('重打动作 convert', rematch && rematch.action, 'convert');
    eq('一周目重打保底金', rematch && rematch.gold, 250);
    eq('一周目重打保底印', rematch && rematch.seals, 1);
    ok('一周目非二周目保底', !rematch.ngplus);
    campOwn.cycle = 2;
    const ng = Legendary.onBossKilled(campOwn, 'shanxiao');
    eq('二周目重打保底金', ng && ng.gold, 400);
    eq('二周目重打保底印', ng && ng.seals, 2);
    ok('二周目标记', ng && ng.ngplus);
    eq('持有计数', Legendary.ownedCount(campOwn), 1);
    /* --- 武器词条与技能真正参与公式 --- */
    const yq = WEAPONS['lw_yunque'];
    eq('云却常驻命中 +10', Combat.weaponMods(yq, {}).hit, 10);
    eq('云却常驻暴击 +5', Combat.weaponMods(yq, {}).crit, 5);
    eq('云却对非猛兽无断岳加成', Combat.weaponMods(yq, {}).dmg, 0);
    eq('云却断岳对猛兽伤害 +3', Combat.weaponMods(yq, { foeTags: ['beast'] }).dmg, 3);
    eq('云却对猛兽暴击 +20', Combat.weaponMods(yq, { foeTags: ['beast'] }).crit, 20);
    const dc = WEAPONS['lw_duanchao'];
    eq('断潮词条伤害 +2', Combat.weaponMods(dc, {}).dmg, 2);
    eq('断潮主动攻击再 +2', Combat.weaponMods(dc, { initiating: true }).dmg, 4);
    eq('断潮对非亡灵无加成', Combat.weaponMods(dc, {}).dmg, 2);
    eq('断潮对亡灵 +4', Combat.weaponMods(dc, { foeTags: ['undead'] }).dmg, 6);
    const wb = WEAPONS['lw_wanbi'];
    eq('万碧词条伤害 +2', Combat.weaponMods(wb, {}).dmg, 2);
    eq('万碧相邻友军再 +2', Combat.weaponMods(wb, { adjacentAlly: true }).dmg, 4);
    eq('万碧对草木 +4', Combat.weaponMods(wb, { foeTags: ['plant'] }).dmg, 6);
    eq('焚砂防御 +2', Combat.weaponMods(WEAPONS['lw_fensha'], {}).def, 2);
    eq('凝霜回避 +10', Combat.weaponMods(WEAPONS['lw_ningshuang'], {}).avoid, 10);
    const pz = WEAPONS['lw_pozhuo'];
    eq('破浊符对重甲伤害 +3', Combat.weaponMods(pz, { foeTags: ['armor'] }).dmg, 3);
    eq('破浊符对非甲无伤害加成', Combat.weaponMods(pz, {}).dmg, 0);
    eq('破浊符对重甲暴击 +10', Combat.weaponMods(pz, { foeTags: ['armor'] }).crit, 10);
    const lgb = Combat.weaponMods(WEAPONS['lw_longgu'], { foeTags: ['beast', 'flying'] });
    eq('龙骨弓对飞行猛兽伤害 +6', lgb.dmg, 6);
    eq('龙骨弓对飞行暴击 +15', lgb.crit, 15);
    eq('无武器无词条', Combat.weaponMods(null, {}).hit, 0);
    /* --- 词条可读文本（图鉴展示） --- */
    const t1 = Legendary.traitText(WEAPONS['lw_yunque']);
    eq('云却词条文本', t1.traits, '命中 +10 · 暴击 +5 · 对猛兽暴击 +15');
    eq('云却技能文本', t1.skill, '技能·断岳：对猛兽目标伤害 +3。');
    const t2 = Legendary.traitText(WEAPONS['lw_fensha']);
    eq('焚砂词条文本', t2.traits, '暴击 +10 · 命中 +5 · 护甲 +2');
    const t3 = Legendary.traitText(WEAPONS['lw_pozhuo']);
    eq('破浊符词条文本', t3.traits, '命中 +10 · 对重甲伤害 +3 · 对重甲暴击 +10');
    for (const k in LEGENDARY_WEAPONS) {
      const tt = Legendary.traitText(LEGENDARY_WEAPONS[k]);
      ok('传说 ' + k + ' 词条文本非空', !!tt.traits, tt.traits);
      ok('传说 ' + k + ' 技能文本非空', !!tt.skill, tt.skill);
    }
    eq('空武器无文本', Legendary.traitText(null).traits, '');
    /* --- modsFor 集成：装备传说兵器即获得加成 --- */
    const fake = Object.create(Battle);
    fake.B = { units: [], nodes: [], supports: {} };
    const ctx2 = { mods: (u, f, init) => Battle.modsFor.call(fake, u, f, init), tileAt: () => TERRAIN['.'], rng: RNG };
    const hero = give(mkUnit({ cls: 'zzz', x: 0, y: 0 }), 'lw_yunque');
    hero.ranks.sword = 'S';
    const beastFoe = mkUnit({ cls: 'zzz', side: 'enemy', x: 1, y: 0, tags: ['beast'] });
    const plainFoe = mkUnit({ cls: 'zzz', side: 'enemy', x: 1, y: 0 });
    eq('云却对人形伤害 = 力15+威15-防5', Combat.damage(hero, plainFoe, ctx2), 20);
    eq('云却对猛兽伤害含断岳 +3', Combat.damage(hero, beastFoe, ctx2), 23);
    eq('云却词条命中 +10', Combat.hitChance(hero, plainFoe, ctx2), 97);
    eq('云却词条暴击 +5', Combat.critChance(hero, plainFoe, ctx2), 15);
    const lancer = give(mkUnit({ cls: 'zzz', x: 0, y: 0 }), 'lw_duanchao');
    lancer.ranks.lance = 'S';
    eq('断潮非主动伤害 23', Combat.damage(lancer, plainFoe, ctx2, false), 23);
    eq('断潮主动伤害 25', Combat.damage(lancer, plainFoe, ctx2, true), 25);
    const fc = Combat.forecast(lancer, plainFoe, ctx2);
    eq('预测主动方含破浪 +2', fc.attacker.dmg, 25);
    /* --- 打造定价 --- */
    eq('D 阶打造费', Forge.cost('iron_sword').gold, 200);
    eq('C 阶打造费', Forge.cost('steel_sword').gold, 350);
    eq('B 阶打造费金', Forge.cost('silver_sword').gold, 600);
    eq('B 阶打造费印', Forge.cost('silver_sword').seals, 1);
    eq('S 阶定价 1600 金', Forge.cost('lw_yunque').gold, 1600);
    eq('S 阶定价 3 印', Forge.cost('lw_yunque').seals, 3);
    /* --- 打造校验 --- */
    ok('普通兵装可打造', Forge.canCraft('iron_sword'));
    ok('传说不可打造', !Forge.canCraft('lw_yunque'));
    ok('Boss 兵装不可打造', !Forge.canCraft('boss_turbid'));
    ok('未知道具不可打造', !Forge.canCraft('nope'));
    const f1 = Forge.craft(camp, 'iron_sword');
    ok('打造成功', f1.ok);
    ok('打造扣金', camp.gold === 5000 - 200, 'gold=' + camp.gold);
    ok('打造品进行囊', camp.convoy.length === 1 && camp.convoy[0].key === 'iron_sword' && camp.convoy[0].uses > 0);
    camp.gold = 10;
    eq('盘缠不足被拒', Forge.craft(camp, 'steel_sword').why, 'gold');
    camp.gold = 5000; camp.seals = 0;
    eq('脉印不足被拒', Forge.craft(camp, 'silver_sword').why, 'seals');
    camp.seals = 5; camp.convoy = [];
    eq('传说打造被拒', Forge.craft(camp, 'lw_yunque').why, 'legendary');
    camp.convoy = new Array(60).fill(0).map((_, i) => ({ key: 'potion', uses: 1 }));
    eq('行囊满被拒', Forge.craft(camp, 'iron_sword').why, 'convoy');
    // 所有可打造兵装的费用表完整（不含传说与 Boss 专属）
    let craftableCount = 0;
    for (const k in WEAPONS) {
      if (!Forge.canCraft(k)) continue;
      craftableCount++;
      const cost = Forge.cost(k);
      ok('可打造兵装 ' + k + ' 有定价', !!cost && cost.gold > 0);
      ok('可打造兵装 ' + k + ' 印数合法', cost.seals >= 0 && cost.seals <= 3);
    }
    ok('可打造兵装数量 > 10', craftableCount > 10, '实际 ' + craftableCount);
    ok('打造列表不含传说', !Forge.canCraft('lw_yunque'));
  }

  /* ---------------- 17. 姜姒/虞素秋：召唤师与歌者 ---------------- */
  {
    const { CHARS, CLASSES, SUPPORTS, SUPPORT_PAIR_MAP, AUTO_JOINS, WEAPON_TYPES, ITEMS, HERO_ORDER, RANK_ORDER, Spells, Summon } =
      vm.runInContext('({ CHARS, CLASSES, SUPPORTS, SUPPORT_PAIR_MAP, AUTO_JOINS, WEAPON_TYPES, ITEMS, HERO_ORDER, RANK_ORDER, Spells, Summon })', ctx);

    /* 17.1 人物数据完整性 */
    eq('人物共 14 名（12 主力 + 2 替补援军）', Object.keys(CHARS).length, 14);
    for (const id of ['jiangsi', 'yusqiu']) {
      const c = CHARS[id];
      ok(id + ' 职业存在', !!CLASSES[c.cls], c.cls);
      ok(id + ' 五行合法（none 或已定义）', c.element === 'none' || !!ELEMENTS[c.element], c.element);
      ok(id + ' 八维齐全', Object.keys(c.stats).length === 8 && Object.keys(c.growth).length === 8);
      ok(id + ' 有个人技', !!c.personal && !!c.personal.name);
      ok(id + ' 初始装备有效', (c.items || []).every(it => !!WEAPONS[it.key] || !!ITEMS[it.key]), JSON.stringify(c.items));
      ok(id + ' 装备可持（资质匹配）', (c.items || []).every(it => {
        const w = WEAPONS[it.key];
        if (!w) return true;
        const r = RANK_ORDER[c.ranks[w.type]] || 0;
        return r >= RANK_ORDER[w.rank];
      }));
      ok(id + ' HERO_ORDER 覆盖', HERO_ORDER.indexOf(id) >= 0);
    }
    eq('姜姒元素为土', CHARS.jiangsi.element, 'earth');
    eq('虞素秋无五行（音波不进相克）', CHARS.yusqiu.element, 'none');
    eq('虞素秋个人技含相邻回避', CHARS.yusqiu.personal.adjacentAllyAvoid, 5);
    eq('姜姒个人技为通兽语', CHARS.jiangsi.personal.name, '通兽语');

    /* 17.2 职业线与分支 */
    const sm = CLASSES.summoner, sc2 = CLASSES.spiritcaller, dt = CLASSES.divinetamer;
    eq('召唤师每章 2 次', sm.skill.summonUses, 2);
    eq('召唤师可召 1 阶', sm.skill.summon, 1);
    ok('召唤师双分支', Array.isArray(sm.promotes) && sm.promotes.length === 2);
    eq('分支一 通灵师', sc2.skill.summon, 2);
    eq('通灵师每章 2 次', sc2.skill.summonUses, 2);
    ok('通灵师有灵犀加持', !!sc2.skill.summonBuff && sc2.skill.summonBuff.hp === 6 && sc2.skill.summonBuff.dmg === 2);
    eq('分支二 神御师', dt.skill.summon, 3);
    eq('神御师每章 1 次', dt.skill.summonUses, 1);
    eq('神御光环 -5 命中', dt.skill.summonAuraHit, 5);
    ok('两个二阶分支均无再转职', !sc2.promote && !dt.promote);
    const ss = CLASSES.songstress, tl = CLASSES.tidelady, cs = CLASSES.celestialsage;
    ok('歌者双分支', Array.isArray(ss.promotes) && ss.promotes.length === 2);
    eq('潮音娘子歌增强', tl.skill.songPower, 1);
    eq('天籁巫歌射程 +1', cs.skill.songRange, 1);
    ok('天籁巫灵力 +2', cs.skill.mag === 2);
    ok('全部新职业武器类型合法', [sm, sc2, dt, ss, tl, cs].every(k => k.weapons.every(w => !!WEAPON_TYPES[w])));

    /* 17.3 谣系武器：有售价、不吃三角 */
    ok('谣武器类型存在', !!WEAPON_TYPES.voice);
    ok('谣不进武器三角', !TRIANGLE.voice);
    for (const k of ['bone_flute', 'tide_voice', 'moon_tide']) {
      const w = WEAPONS[k];
      ok('谣武器 ' + k + ' 类型为 voice', w.type === 'voice');
      ok('谣武器 ' + k + ' 有售价（可购/可打造）', w.price > 0);
    }
    ok('兽骨笛为姜姒专属', WEAPONS.bone_flute.unique === 'jiangsi');
    ok('潮声为虞素秋专属', WEAPONS.tide_voice.unique === 'yusqiu');

    /* 17.4 支援组 */
    ok('支援对 姜姒×云策 存在', !!SUPPORT_PAIR_MAP['jiangsi_yunce']);
    ok('支援对 虞素秋×玄漪 存在', !!SUPPORT_PAIR_MAP['yusqiu_xuanyi']);
    for (const id of ['jiangsi_yunce', 'yusqiu_xuanyi']) {
      const s = SUPPORT_PAIR_MAP[id];
      ok('支援 ' + id + ' 三角色对话齐全', !!s.dialogues.C && !!s.dialogues.B && !!s.dialogues.A);
    }

    /* 17.5 歌：可用性 / 不吃五行 / 效果 / cast 全流程 */
    const mkCaster = (cls, level) => ({ id: 'c', name: '测试', side: 'player', level: level || 1, charId: 'yusqiu',
      cls: cls, x: 2, y: 2, hp: 20, spellUses: {}, statuses: {},
      stats: { hp: 20, mag: 10, skl: 8, spd: 8, lck: 6, def: 3, res: 8 } });
    const yq = mkCaster('songstress', 1);
    const songs = Spells.forUnit(yq).map(s => s.key);
    eq('虞素秋入队即会三首歌', songs.slice().sort().join(','), 'song_ansoul,song_pozhen,song_suguang');
    eq('云策无歌', Spells.forUnit({ charId: 'yunce', level: 20, side: 'player' }).filter(s => s.song).length, 0);
    ok('歌不吃五行（倍率 1）', Combat.elementMul('none', 'fire').mul === 1 && Combat.elementMul('fire', 'none').mul === 1);
    eq('歌增强等级：歌者 0', Spells.songPowerOf(yq), 0);
    eq('歌增强等级：潮音娘子 1', Spells.songPowerOf(mkCaster('tidelady', 10)), 1);

    const mkHost = (rng) => {
      const logs = [];
      return {
        logs,
        B: { units: [], stats: { damage: 0 }, phaseIndex: 5 },
        ctx: { mods: () => Combat.zeroMods(), tileAt: () => ({ avoid: 0, def: 0, cost: 1 }), rng: rng || RNG },
        log: m => logs.push(m), float: () => {}, sfx: () => {}, wait: () => Promise.resolve(),
        kill: () => {}, exp: () => {}
      };
    };
    const mkFoe = (hp) => ({ id: 'e', name: '敌', side: 'enemy', x: 3, y: 2, hp: hp === undefined ? 40 : hp,
      stats: { res: 3, lck: 5, spd: 6, hp: 40 }, statuses: {} });

    // 安魂曲：命中 → 力量 -2，零伤害
    const h1 = mkHost({ hitRoll: () => 0, next: () => 0.99 });
    const f1 = mkFoe();
    h1.B.units = [yq, f1];
    const dealt1 = await Spells.cast(h1, yq, f1, SPELLS.song_ansoul);
    eq('安魂曲零伤害', dealt1, 0);
    eq('安魂曲不掉血', f1.hp, 40);
    ok('安魂曲附力量 -2', !!f1.statuses.atk && f1.statuses.atk.val === 2, JSON.stringify(f1.statuses));
    eq('安魂曲扣 1 次', Spells.usesLeft(yq, 'song_ansoul'), 4);

    // 破阵歌：未命中 → 无状态
    const h2 = mkHost({ hitRoll: () => 99, next: () => 0.99 });
    const f2 = mkFoe();
    h2.B.units = [yq, f2];
    await Spells.cast(h2, yq, f2, SPELLS.song_pozhen);
    ok('破阵歌未命中无状态', !f2.statuses.hit);

    // 溯光歌：治疗友军必中，不超上限
    const h3 = mkHost();
    const ally = { id: 'a', name: '友', side: 'player', x: 3, y: 2, hp: 30, stats: { hp: 40, res: 3, lck: 5, spd: 6 }, statuses: {} };
    h3.B.units = [yq, ally];
    await Spells.cast(h3, yq, ally, SPELLS.song_suguang);
    eq('溯光歌回 8 点', ally.hp, 38);
    ok('溯光歌附命中 +5', !!ally.statuses.hit && ally.statuses.hit.val === -5, JSON.stringify(ally.statuses));
    ally.hp = 34;
    await Spells.cast(h3, yq, ally, SPELLS.song_suguang);
    eq('溯光歌不超上限（40）', ally.hp, 40);
    // 潮音娘子增强：治疗 +2、效果 +1
    const tlC = mkCaster('tidelady', 10);
    const ally2 = { id: 'a2', name: '友2', side: 'player', x: 3, y: 2, hp: 20, stats: { hp: 40, res: 3, lck: 5, spd: 6 }, statuses: {} };
    const h4 = mkHost();
    h4.B.units = [tlC, ally2];
    await Spells.cast(h4, tlC, ally2, SPELLS.song_suguang);
    eq('潮音娘子治疗 10', ally2.hp, 30);
    ok('潮音娘子命中 +6', ally2.statuses.hit.val === -6, JSON.stringify(ally2.statuses));

    // aoe 目标收集：ally 歌只取友军
    const aoeSpell = { key: 'x', aoe: { radius: 1 }, ally: true };
    const near = h3.B.units.concat([mkFoe(), { id: 'a3', name: '友3', side: 'player', x: 3, y: 3, hp: 10 }]);
    const got = Spells.aoeTargets({ units: near }, { x: 3, y: 2 }, aoeSpell, 'player').map(u => u.id);
    ok('ally aoe 只收友军', got.indexOf('a3') >= 0 && got.indexOf('e') < 0, got.join(','));

    /* 17.6 召唤：每章次数 / 灵犀加持 / 神御数据 */
    const btl = Object.create(Battle);
    btl.B = { units: [], nodes: [], supports: {} };
    const jiangsiU = { id: 'p1', cls: 'summoner', level: 9 };
    eq('召唤师本章余 2 次', Battle.summonUsesLeft.call(btl, jiangsiU), 2);
    const amanU = { id: 'p2', cls: 'beastcaller', level: 9 };
    eq('兽使本章余 1 次', Battle.summonUsesLeft.call(btl, amanU), 1);
    jiangsiU.summonUsesLeft = 1;
    eq('消耗一次后余 1', Battle.summonUsesLeft.call(btl, jiangsiU), 1);
    jiangsiU.summonUsed = true;
    eq('标记用尽后余 0', Battle.summonUsesLeft.call(btl, jiangsiU), 0);
    // 通灵师召唤加持
    const pet = Summon.spawn(btl.B, 99, { id: 'c', level: 9, cls: 'spiritcaller' }, 2);
    const plain = Summon.spawn(btl.B, 98, { id: 'c', level: 9, cls: 'beastcaller' }, 2);
    ok('灵犀加持生命 +6', pet.stats.hp === plain.stats.hp + 6, pet.stats.hp + ' vs ' + plain.stats.hp);
    ok('灵犀记录在 summon.buff', !!pet.summon.buff && pet.summon.buff.dmg === 2);
    Summon.setOrder(pet, 'guard');   // 先切守御，排除默认猛攻 +3 的干扰
    const pm = Combat.zeroMods();
    Summon.applyOrderMods(pet, pm);
    eq('守御下灵犀伤害 +2', pm.dmg, 2);

    /* 17.7 新状态与通兽语光环进 modsFor */
    const fake = Object.create(Battle);
    const jsUnit = mkUnit({ id: 'js', cls: 'summoner', level: 9, x: 1, y: 1, charId: 'jiangsi',
      personal: { dmgPerSummon: 2 }, stats: { hp: 24, str: 4, mag: 9, skl: 8, spd: 6, lck: 6, def: 5, res: 9 } });
    const near_ally = mkUnit({ id: 'na', side: 'player', x: 2, y: 1 });
    const petOn = mkUnit({ id: 'pet', side: 'player', x: 5, y: 5, summoned: true, hp: 10 });
    fake.B = { units: [jsUnit, near_ally, petOn], nodes: [], supports: {}, phaseIndex: 3 };
    const mjs = Battle.modsFor.call(fake, jsUnit);
    eq('通兽语：1 只召唤兽自身伤害 +2', mjs.dmg, 2);
    const mna = Battle.modsFor.call(fake, near_ally);
    eq('通兽语：相邻友军同样 +2', mna.dmg, 2);
    petOn.hp = 0;
    eq('召唤兽倒下后光环消失', Battle.modsFor.call(fake, jsUnit).dmg, 0);
    // atk / hit 状态
    const stU = mkUnit({ x: 1, y: 1 });
    stU.statuses = { atk: { val: 3, until: 4 }, hit: { val: 10, until: 4 } };
    fake.B.units = [stU];
    const mst = Battle.modsFor.call(fake, stU);
    eq('力量状态 -3 进伤害修正', mst.dmg, -3);
    eq('命中状态 -10', mst.hit, -10);
    stU.statuses.atk.until = 2; stU.statuses.hit.until = 2;   // 已过期
    const mst2 = Battle.modsFor.call(fake, stU);
    eq('过期力量状态失效', mst2.dmg, 0);
    eq('过期命中状态失效', mst2.hit, 0);
  }

  /* ---------------- 18. 铁匠铺 · 武器强化 +3 ---------------- */
  {
    const { Smith, ITEMS } = vm.runInContext('({ Smith, ITEMS })', ctx);
    /* 18.1 强化数值公式（combat.weaponPlusMods） */
    eq('+0 无加成', JSON.stringify(Combat.weaponPlusMods(0)), JSON.stringify({ mt: 0, hit: 0, crit: 0 }));
    eq('+1 威力+1 命中+3', JSON.stringify(Combat.weaponPlusMods(1)), JSON.stringify({ mt: 1, hit: 3, crit: 0 }));
    eq('+2 威力+2 命中+6', JSON.stringify(Combat.weaponPlusMods(2)), JSON.stringify({ mt: 2, hit: 6, crit: 0 }));
    eq('+3 威力+3 命中+9 必杀+5', JSON.stringify(Combat.weaponPlusMods(3)), JSON.stringify({ mt: 3, hit: 9, crit: 5 }));
    eq('越界钳制在 +3', Combat.weaponPlusMods(9).mt, 3);
    eq('负值钳制在 +0', Combat.weaponPlusMods(-2).mt, 0);
    /* 18.2 强化资格 */
    const good = { key: 'iron_sword', uses: 20, plus: 0 };
    ok('普通兵装可强化', Smith.canStrengthen('iron_sword', good));
    ok('损坏兵装不可强化', !Smith.canStrengthen('iron_sword', { key: 'iron_sword', uses: 0 }));
    ok('传说不可强化', !Smith.canStrengthen('lw_yunque', { key: 'lw_yunque', uses: 30 }));
    ok('Boss 专属不可强化', !Smith.canStrengthen('boss_turbid', { key: 'boss_turbid', uses: 20 }));
    ok('次数道具不可强化', !Smith.canStrengthen('potion', { key: 'potion', uses: 3 }));
    ok('满级 +3 不可再强化', !Smith.canStrengthen('iron_sword', { key: 'iron_sword', uses: 20, plus: 3 }));
    eq('强化上限 3', Smith.cap(), 3);
    /* 18.3 费用表 */
    eq('+1 费铁髓×2+100', JSON.stringify(Smith.cost({ plus: 0 })), JSON.stringify({ mat: 'mat_iron', n: 2, gold: 100 }));
    eq('+2 费钢核×2+300', JSON.stringify(Smith.cost({ plus: 1 })), JSON.stringify({ mat: 'mat_steel', n: 2, gold: 300 }));
    eq('+3 费银晶×2+600', JSON.stringify(Smith.cost({ plus: 2 })), JSON.stringify({ mat: 'mat_silver', n: 2, gold: 600 }));
    eq('满级无费用', Smith.cost({ plus: 3 }), null);
    /* 18.4 材料数据 */
    for (const k of ['mat_iron', 'mat_steel', 'mat_silver']) {
      ok('材料 ' + k + ' 存在', !!ITEMS[k]);
      ok('材料 ' + k + ' 可堆叠', ITEMS[k] && ITEMS[k].stack === true);
      ok('材料 ' + k + ' 有售价', ITEMS[k] && ITEMS[k].price > 0);
    }
    /* 18.5 强化全流程：扣材料堆叠 + 扣金 + 升级 */
    const camp = { gold: 5000, convoy: [{ key: 'mat_iron', uses: 3 }] };
    const item = { key: 'iron_sword', uses: 20, plus: 0 };
    const r1 = Smith.strengthen(camp, item);
    ok('强化 +1 成功', r1.ok && r1.plus === 1);
    eq('强化扣金 100', camp.gold, 4900);
    eq('材料堆叠余 1', camp.convoy[0].uses, 1);
    eq('物品 plus = 1', item.plus, 1);
    camp.convoy = [{ key: 'mat_steel', uses: 2 }];
    camp.gold = 5000;
    const r2 = Smith.strengthen(camp, item);
    ok('强化 +2 成功', r2.ok && r2.plus === 2);
    eq('材料扣空后出行囊', camp.convoy.length, 0);
    eq('+2 扣金 300', camp.gold, 4700);
    eq('+2 效果文本', Smith.effectText(2), '+2：威力 +2 · 命中 +6');
    eq('+3 效果文本含必杀', Smith.effectText(3).indexOf('必杀 +5') >= 0, true);
    /* 18.6 各类拒绝 */
    const poor = { gold: 10, convoy: [{ key: 'mat_iron', uses: 5 }] };
    eq('盘缠不足被拒', Smith.strengthen(poor, { key: 'iron_sword', uses: 20 }).why, 'gold');
    const nomat = { gold: 5000, convoy: [] };
    eq('材料不足被拒', Smith.strengthen(nomat, { key: 'iron_sword', uses: 20 }).why, 'mat');
    eq('满级被拒', Smith.strengthen({ gold: 5000, convoy: [{ key: 'mat_silver', uses: 9 }] }, { key: 'iron_sword', uses: 20, plus: 3 }).why, 'cap');
    eq('损坏被拒', Smith.strengthen({ gold: 5000, convoy: [{ key: 'mat_iron', uses: 9 }] }, { key: 'iron_sword', uses: 0 }).why, 'broken');
    eq('传说被拒', Smith.strengthen({ gold: 5000, convoy: [{ key: 'mat_iron', uses: 9 }] }, { key: 'lw_yunque', uses: 30 }).why, 'bad');
    /* 18.7 强化接入战斗公式 */
    const fake2 = Object.create(Battle);
    fake2.B = { units: [], nodes: [], supports: {} };
    const ctx3 = { mods: (u, f, init) => Battle.modsFor.call(fake2, u, f, init), tileAt: () => TERRAIN['.'], rng: RNG };
    const hero = give(mkUnit({ cls: 'zzz', x: 0, y: 0 }), 'iron_sword');
    hero.ranks.sword = 'A';
    hero.items[0].plus = 3;
    const foe = mkUnit({ cls: 'zzz', side: 'enemy', x: 1, y: 0 });
    // 铁剑 mt 5 hit 90；+3 后 mt 8 hit 99、暴击 +5
    eq('+3 铁剑伤害 = 力10+威8-防5', Combat.damage(hero, foe, ctx3), 13);
    eq('+3 铁剑命中 = 90+9+20+2-25', Combat.hitChance(hero, foe, ctx3), 96);
    eq('+3 铁剑暴击 = 0+5+5-5', Combat.critChance(hero, foe, ctx3), 5);
    const fc3 = Combat.forecast(hero, foe, ctx3);
    eq('预测含强化威力', fc3.attacker.dmg, 13);
    hero.items[0].plus = 0;
    eq('+0 铁剑伤害回到 10', Combat.damage(hero, foe, ctx3), 10);
    /* 18.8 装备优选考虑强化 */
    const two = mkUnit({ cls: 'zzz', x: 0, y: 0 });
    two.items = [{ key: 'iron_sword', uses: 20 }, { key: 'iron_sword', uses: 20, plus: 3 }];
    two.ranks.sword = 'A';
    two.weaponIndex = -1;
    eq('优选强化后的同款', Combat.weaponOf(two).idx, 1);
  }

  /* ---------------- 19. 传送武器：渡厄杖 + 追影刃 ---------------- */
  {
    const { WEAPONS: W2 } = vm.runInContext('({ WEAPONS })', ctx);
    /* 19.1 数据 */
    const duo = W2['staff_duo'], zhui = W2['dagger_zhuiying'];
    ok('渡厄杖存在', !!duo);
    ok('渡厄杖是传送杖', !!duo && duo.warp === true && duo.type === 'staff');
    eq('渡厄杖射程 1-3', duo && duo.rng[1], 3);
    ok('渡厄杖有售价', !!duo && duo.price > 0);
    eq('渡厄杖第 3 章上架', duo && duo.shopGate && duo.shopGate.chapter, 3);
    ok('追影刃存在', !!zhui);
    ok('追影刃命中换位', !!zhui && zhui.swapOnHit === true && zhui.type === 'dagger');
    eq('追影刃射程 1-1', zhui && zhui.rng[1], 1);
    eq('追影刃第 4 章 + 墨鸦入队后上架', zhui && zhui.shopGate && zhui.shopGate.char, 'moya');
    eq('追影刃上架章节 = 4', zhui && zhui.shopGate && zhui.shopGate.chapter, 4);
    /* 19.2 传送落点纯函数 */
    const never = () => false;
    const blocker = set => (x, y) => set.has(x + ',' + y);
    eq('全空时落在离友军最近的邻位', JSON.stringify(Combat.warpDestination({ x: 5, y: 5 }, { x: 5, y: 7 }, never)), JSON.stringify({ x: 5, y: 6 }));
    eq('最近位被占 → 取次近（右先于左）', JSON.stringify(Combat.warpDestination({ x: 5, y: 5 }, { x: 5, y: 7 }, blocker(new Set(['5,6'])))), JSON.stringify({ x: 6, y: 5 }));
    eq('全被占 → null', Combat.warpDestination({ x: 5, y: 5 }, { x: 5, y: 7 }, blocker(new Set(['6,5', '4,5', '5,6', '5,4']))), null);
    eq('四邻等距 → 按 右/左/下/上 定序', JSON.stringify(Combat.warpDestination({ x: 5, y: 5 }, { x: 5, y: 5 }, never)), JSON.stringify({ x: 6, y: 5 }));
    /* 19.3 换位判定纯函数 */
    const mkEv = (a, d, hit) => ({ type: 'strike', attacker: a, defender: d, hit: !!hit });
    ok('攻击方命中过 → 换位', Combat.swapOnHitLanded([mkEv(1, 2, true)], 1, 2));
    ok('攻击方未中 → 不换位', !Combat.swapOnHitLanded([mkEv(1, 2, false)], 1, 2));
    ok('仅对方命中我 → 不换位', !Combat.swapOnHitLanded([mkEv(2, 1, true)], 1, 2));
    ok('空事件 → 不换位', !Combat.swapOnHitLanded([], 1, 2));
    /* 19.4 装备语义：渡厄杖走 staffOf（无攻击），追影刃走 weaponOf */
    const cleric = give(mkUnit(), 'staff_duo');
    ok('渡厄杖被 staffOf 识别', !!Combat.staffOf(cleric) && Combat.staffOf(cleric).w.warp === true);
    eq('渡厄杖不进武器优选', Combat.weaponOf(cleric), null);
    const rogue = give(mkUnit(), 'dagger_zhuiying');
    ok('追影刃被 weaponOf 识别', !!Combat.weaponOf(rogue) && Combat.weaponOf(rogue).w.swapOnHit === true);
    eq('追影刃不进 staffOf', Combat.staffOf(rogue), null);
    eq('追影刃命中 88', Combat.hitChance(rogue, mkUnit({ side: 'enemy', x: 1, y: 0 }), FLAT), 85);
    /* 19.5 商店闸门数据（weaponStock 在 camp.js，此处锁数据侧前提） */
    ok('渡厄杖闸门仅章节', duo.shopGate.char === undefined);
    ok('追影刃闸门含角色', typeof zhui.shopGate.char === 'string');
  }

  /* ---------------- 20. 敌方精英词缀（P1.3） ---------------- */
  {
    const { Battle: B2, CHAPTERS: CH2, ENEMY_TYPES: ET2, ELITE_AFFIXES: EA, RNG: RNG2 } =
      vm.runInContext('({ Battle, CHAPTERS, ENEMY_TYPES, ELITE_AFFIXES, RNG })', ctx);
    /* 20.1 词缀表 */
    eq('词缀池 4 种', Object.keys(EA).length, 4);
    for (const k of ['shield', 'regen', 'aura', 'berserk']) {
      ok('词缀 ' + k + ' 有名称与说明', !!EA[k] && !!EA[k].name && !!EA[k].desc);
    }
    /* 20.2 章节池：第 1 章教学不设，其余每章 1~2 个 */
    eq('第 1 章不设词缀', (CH2[0].affixPool || []).length, 0);
    CH2.slice(1).forEach(ch => {
      const pool = ch.affixPool || [];
      ok('第 ' + ch.id + ' 章池 1~2 个', pool.length >= 1 && pool.length <= 2, '实际 ' + pool.length);
      for (const k of pool) ok('第 ' + ch.id + ' 章词缀 ' + k + ' 合法', !!EA[k], k);
    });
    /* 20.3 Boss 词缀：1~2 个且合法 */
    for (const b of Object.keys(ET2).filter(k => ET2[k].boss)) {
      const af = ET2[b].affixes || [];
      ok('Boss ' + b + ' 带 1~2 个词缀', af.length >= 1 && af.length <= 2, '实际 ' + af.length);
      for (const k of af) ok('Boss ' + b + ' 词缀 ' + k + ' 合法', !!EA[k], k);
    }
    ok('浊甲卫 elite 类型存在', !!ET2['elite']);
    /* 20.4 护盾减伤：受伤 -30%（floor），破盾期还原 */
    const hero4 = give(mkUnit(), 'iron_sword');
    const foe4 = mkUnit({ side: 'enemy', x: 1, y: 0 });
    eq('无盾伤害 = 力10+威5-防5', Combat.damage(hero4, foe4, FLAT), 10);
    foe4.affixes = ['shield'];
    eq('护盾减伤 30%（10→7）', Combat.damage(hero4, foe4, FLAT), 7);
    ok('护盾生效判定', Combat.affixShieldActive(foe4, FLAT));
    const fcS = Combat.forecast(hero4, foe4, FLAT);
    eq('战斗预测同口径显示减伤', fcS.attacker.dmg, 7);
    foe4.shieldBreakUntil = 99;
    eq('破盾期伤害还原（phaseIndex 50）', Combat.damage(hero4, foe4, { mods: () => null, tileAt: () => TERRAIN['.'], phaseIndex: 50 }), 10);
    ok('破盾期判定为失效', !Combat.affixShieldActive(foe4, { phaseIndex: 50 }));
    eq('破盾过期后恢复（phaseIndex 99）', Combat.damage(hero4, foe4, { mods: () => null, tileAt: () => TERRAIN['.'], phaseIndex: 99 }), 7);
    /* 20.5 狂暴攻速：低于半血 +3，满血/恰半血不变 */
    const bk = give(mkUnit(), 'dagger');
    const baseSpd = Combat.attackSpeed(bk);
    bk.affixes = ['berserk'];
    bk.hp = bk.stats.hp;
    eq('满血不狂暴', Combat.attackSpeed(bk), baseSpd);
    bk.hp = Math.floor(bk.stats.hp / 2) - 1;
    eq('低于半血狂暴攻速 +3', Combat.attackSpeed(bk), baseSpd + 3);
    bk.hp = Math.floor(bk.stats.hp / 2);
    eq('恰半血不狂暴', Combat.attackSpeed(bk), baseSpd);
    /* 20.6 光环命中：aura 周围 2 格友军 +10 */
    const fakeA = Object.create(B2);
    fakeA.B = { units: [], nodes: [], supports: {} };
    const ctxA = { mods: (u, f, init) => B2.modsFor.call(fakeA, u, f, init), tileAt: () => TERRAIN['.'], rng: RNG2, phaseIndex: 0 };
    const auraU = mkUnit({ side: 'enemy', x: 5, y: 5, cls: 'zzz' });
    auraU.id = 'a1';
    auraU.affixes = ['aura'];
    const nearE = mkUnit({ side: 'enemy', x: 6, y: 5, cls: 'zzz' });
    nearE.id = 'a2';
    const farE = mkUnit({ side: 'enemy', x: 5, y: 8, cls: 'zzz' });
    farE.id = 'a3';
    fakeA.B.units = [auraU, nearE, farE];
    eq('光环内友军命中 +10', B2.modsFor.call(fakeA, nearE, null).hit, 10);
    eq('三格外无光环', B2.modsFor.call(fakeA, farE, null).hit, 0);
    eq('我军不吃敌方光环', B2.modsFor.call(fakeA, mkUnit({ side: 'player', x: 6, y: 5, cls: 'zzz' }), null).hit, 0);
    /* 20.7 词缀分配：浊甲卫轮流戴池，Boss 自带，说得单位不戴 */
    const fakeS = Object.create(B2);
    fakeS.diff = { enemyLv: 0, enemyMul: 1 };
    fakeS.uid = 500;
    fakeS.chapter = { affixPool: ['berserk', 'shield'] };
    fakeS.B = { units: [], flags: {} };
    const e1 = B2.makeEnemyUnit.call(fakeS, { type: 'elite', lv: 5, x: 0, y: 0 });
    B2.assignAffixes.call(fakeS, e1, { type: 'elite' });
    eq('第 1 个浊甲卫戴狂暴', e1.affixes[0], 'berserk');
    const e2 = B2.makeEnemyUnit.call(fakeS, { type: 'elite', lv: 5, x: 1, y: 0 });
    B2.assignAffixes.call(fakeS, e2, { type: 'elite' });
    eq('第 2 个浊甲卫戴护盾', e2.affixes[0], 'shield');
    const e3 = B2.makeEnemyUnit.call(fakeS, { type: 'elite', lv: 5, x: 2, y: 0 });
    B2.assignAffixes.call(fakeS, e3, { type: 'elite' });
    eq('第 3 个轮回复狂', e3.affixes[0], 'berserk');
    const bossU = B2.makeEnemyUnit.call(fakeS, { type: 'shanxiao', lv: 3, x: 3, y: 0, boss: true });
    eq('Boss 自带词缀（不占池）', bossU.affixes[0], 'berserk');
    const recU = B2.makeEnemyUnit.call(fakeS, { char: 'bailu', x: 4, y: 0 });
    B2.assignAffixes.call(fakeS, recU, { char: 'bailu' });
    eq('说得单位不戴词缀', recU.affixes.length, 0);
  }

  /* ---------------- 21. 双人连携 + 云策指挥技（P1.4） ---------------- */
  {
    const { Battle: B3, COMMAND_SKILLS: CS, CHAIN_RANGE: CR } =
      vm.runInContext('({ Battle, COMMAND_SKILLS, CHAIN_RANGE })', ctx);
    /* 21.1 数据 */
    eq('指挥技 3 种', Object.keys(CS).length, 3);
    for (const k of ['order', 'volley', 'hold']) ok('指挥技 ' + k + ' 有名称说明', !!CS[k] && !!CS[k].name && !!CS[k].desc);
    eq('连携距离 2', CR, 2);
    /* 21.2 连携候选：≤2 格 + 未行动 + 未连携过 + 射程覆盖 + 我军 */
    const fakeC = Object.create(B3);
    fakeC.B = { units: [], nodes: [], supports: {}, volleyTarget: null, holdUnits: [] };
    const A = give(mkUnit({ id: 'A', x: 5, y: 5 }), 'iron_sword');
    const tgt = mkUnit({ id: 'T', side: 'enemy', x: 6, y: 5 });
    const B1 = give(mkUnit({ id: 'B1', x: 6, y: 6 }), 'iron_sword');            // 合格候选
    const B2u = give(mkUnit({ id: 'B2', x: 6, y: 6 }), 'iron_sword'); B2u.acted = true;   // 已行动
    const B3u = give(mkUnit({ id: 'B3', x: 8, y: 8 }), 'iron_sword');            // 超出 2 格
    const B4 = give(mkUnit({ id: 'B4', x: 4, y: 6 }), 'iron_sword'); B4.chainUsed = true; // 本回合已连携
    const B5 = give(mkUnit({ id: 'B5', x: 6, y: 4 }), 'iron_sword'); B5.side = 'enemy';   // 敌军
    const B6 = mkUnit({ id: 'B6', x: 5, y: 6 });                                 // 无武器
    fakeC.B.units = [A, tgt, B1, B2u, B3u, B4, B5, B6];
    const cands = B3.chainAllies.call(fakeC, A, tgt);
    eq('连携候选仅剩 B1', cands.length === 1 && cands[0].id === 'B1', true);
    eq('敌军攻击不触发连携候选', B3.chainAllies.call(fakeC, B5, A).length, 0);
    /* 21.3 集火：本回合对指定敌人命中 +15 */
    const base = B3.modsFor.call(fakeC, A, tgt).hit;
    fakeC.B.volleyTarget = 'T';
    eq('集火命中 +15', B3.modsFor.call(fakeC, A, tgt).hit, base + 15);
    fakeC.B.volleyTarget = 'other';
    eq('集火只对指定敌人生效', B3.modsFor.call(fakeC, A, tgt).hit, base);
    fakeC.B.volleyTarget = null;
    /* 21.4 坚守：受伤 -20%（combat.damage 读 ctx.holdActive） */
    const heroH = give(mkUnit(), 'iron_sword');
    const foeH = mkUnit({ side: 'enemy', x: 1, y: 0 });
    const holdCtx = { mods: () => null, tileAt: () => TERRAIN['.'], phaseIndex: 1, holdActive: u => u === foeH };
    eq('坚守减伤 20%（10→8）', Combat.damage(heroH, foeH, holdCtx), 8);
    eq('未受保护不减免', Combat.damage(heroH, foeH, FLAT), 10);
    /* 21.5 指挥可用性：云策在阵 + 本章未用 + 我方阶段 */
    const fakeK = Object.create(B3);
    const yunce = mkUnit({ id: 'Y', charId: 'yunce', x: 3, y: 3 });
    const mate = mkUnit({ id: 'M', x: 4, y: 3 });
    fakeK.B = { units: [yunce, mate], phase: 'player', commandUsed: false, ending: false, busy: false, volleyTarget: null, holdUnits: [] };
    ok('云策在阵可指挥', B3.commandAvailable.call(fakeK));
    fakeK.B.commandUsed = true;
    ok('用过后不可再指挥', !B3.commandAvailable.call(fakeK));
    fakeK.B.commandUsed = false;
    fakeK.B.phase = 'enemy';
    ok('敌方阶段不可指挥', !B3.commandAvailable.call(fakeK));
    fakeK.B.phase = 'player';
    yunce.hp = 0;
    ok('云策阵亡不可指挥', !B3.commandAvailable.call(fakeK));
    yunce.hp = 30;
    /* 21.6 号令/坚守 效果 */
    mate.acted = true;
    const far = mkUnit({ id: 'F', x: 10, y: 3 });
    far.acted = true;
    fakeK.B.units = [yunce, mate, far];
    B3.applyOrderCommand.call(fakeK);
    ok('号令后 3 格内友军解除行动', mate.acted === false);
    ok('号令不动 3 格外', far.acted === true);
    ok('号令消耗指挥次数', fakeK.B.commandUsed === true);
    fakeK.B.commandUsed = false;
    B3.applyHoldCommand.call(fakeK);
    eq('坚守只护 3 格内', JSON.stringify(fakeK.B.holdUnits), JSON.stringify(['Y', 'M']));
    ok('坚守消耗指挥次数', fakeK.B.commandUsed === true);
  }

  console.log('\n== 23. 转职分支（P2.1） ==');
  {
    const { CLASSES, RANK_ORDER } = vm.runInContext('({ CLASSES, RANK_ORDER })', ctx);
    const { Battle } = vm.runInContext('({ Battle })', ctx);
    const bases = Object.keys(CLASSES).filter(k => CLASSES[k].tier === 1);
    eq('基础职业 12 个', bases.length, 12);
    const noBranch = bases.filter(k => !(Array.isArray(CLASSES[k].promotes) && CLASSES[k].promotes.length === 2));
    eq('每个基础职业都有 2 条转职线', noBranch.join(',') || '无', '无');
    const badTarget = [];
    const seen = new Set();
    const dup = [];
    for (const k of bases) {
      for (const t of CLASSES[k].promotes || []) {
        const c = CLASSES[t];
        if (!c || c.tier !== 2 || !c.name || !c.skill || !c.skill.name || !c.skill.desc) badTarget.push(k + '→' + t);
        if (seen.has(t)) dup.push(t);
        seen.add(t);
      }
      if (CLASSES[k].promote !== CLASSES[k].promotes[0]) badTarget.push(k + ' promote 与 promotes[0] 不一致');
    }
    eq('转职目标都是合法二阶职业', badTarget.join(',') || '无', '无');
    eq('二阶职业不重复挂两条线', dup.join(',') || '无', '无');
    eq('二阶职业总数 24', Object.keys(CLASSES).filter(k => CLASSES[k].tier === 2).length, 24);

    /* 新分支的职业技必须真进 modsFor */
    const fake = Object.create(Battle);
    const armorFoe = mkUnit({ id: 'fa', side: 'enemy', x: 1, y: 0, tags: ['human', 'armor'] });
    const flyFoe = mkUnit({ id: 'ff', side: 'enemy', x: 1, y: 0, tags: ['flying'] });
    const plainFoe = mkUnit({ id: 'fp', side: 'enemy', x: 1, y: 0 });
    const mk = (cls, extra) => mkUnit(Object.assign({ cls: cls }, extra || {}));
    const only = u => { fake.B = { units: [u], nodes: [], supports: {} }; return u; };

    const rift = only(mk('riftblade'));
    eq('裂阵剑士：对披甲命中 +15', Battle.modsFor.call(fake, rift, armorFoe).hit, 15);
    eq('裂阵剑士：威力 +2', Battle.modsFor.call(fake, rift, plainFoe).dmg, 2);

    const breaker = only(mk('mountainbreaker', { hp: 10 }));
    eq('裂山斧王：半血护甲 +3', Battle.modsFor.call(fake, breaker, plainFoe).def, 3);
    eq('裂山斧王：威力 +3', Battle.modsFor.call(fake, breaker, plainFoe).dmg, 3);

    const needler = mk('needler', { x: 3, y: 3 });
    const buddy = mk('zzz', { id: 'bud', x: 4, y: 3 });
    fake.B = { units: [needler, buddy], nodes: [], supports: {} };
    eq('金针医：相邻友军命中 +8', Battle.modsFor.call(fake, buddy, null).hit, 8);
    eq('金针医：自身治疗 +4', Battle.modsFor.call(fake, needler, null).healBonus, 4);

    const volley = only(mk('volleyarcher'));
    eq('连珠射手：暴击 +12', Battle.modsFor.call(fake, volley, plainFoe).crit, 12);
    eq('连珠射手：对飞行命中 +15', Battle.modsFor.call(fake, volley, flyFoe).hit, 15);

    const bulwark = mk('bulwark', { x: 2, y: 2 });
    fake.B = { units: [bulwark], nodes: [{ id: 'n', x: 2, y: 2, type: 'life', owner: 'player', active: true, tier: 1 }], supports: {} };
    eq('铁壁枪卫：护甲 +3', Battle.modsFor.call(fake, bulwark, null).def, 3);
    eq('铁壁枪卫：站阵眼回避 +10（+节点 10）', Battle.modsFor.call(fake, bulwark, null).avoid, 20);

    const pyro = only(mk('pyromancer'));
    eq('焚天术士：威力 +3', Battle.modsFor.call(fake, pyro, plainFoe).dmg, 3);
    eq('焚天术士：对披甲命中 +10', Battle.modsFor.call(fake, pyro, armorFoe).hit, 10);

    const face = only(mk('facestealer'));
    eq('千面刺客：孤身回避 10+10', Battle.modsFor.call(fake, face, null).avoid, 20);

    const ward = mk('wardmaster', { x: 3, y: 3 });
    const wardBuddy = mk('zzz', { id: 'wb', x: 3, y: 4 });
    fake.B = { units: [ward, wardBuddy], nodes: [], supports: {} };
    eq('镇煞符师：魔抗 +3', Battle.modsFor.call(fake, ward, null).res, 3);
    eq('镇煞符师：相邻友军回避 +8', Battle.modsFor.call(fake, wardBuddy, null).avoid, 8);

    const whisper = mk('beastwhisperer', { x: 3, y: 3 });
    const pet = { id: 'pet', side: 'player', summoned: true, hp: 10, x: 4, y: 3, stats: {}, statuses: {} };
    fake.B = { units: [whisper, pet], nodes: [], supports: {} };
    eq('兽语者：有召唤兽时威力 +1', Battle.modsFor.call(fake, whisper, plainFoe).dmg, 1);
    eq('兽语者：每章召唤 3 次', whisper.cls === 'beastwhisperer' ? CLASSES.beastwhisperer.skill.summonUses : 0, 3);

    const plume = mk('plumeguard', { x: 3, y: 3 });
    const plumeBuddy = mk('zzz', { id: 'pb', x: 4, y: 3 });
    fake.B = { units: [plume, plumeBuddy], nodes: [], supports: {} };
    eq('翎羽卫：自身回避 +10', Battle.modsFor.call(fake, plume, null).avoid, 10);
    eq('翎羽卫：相邻友军回避 +8', Battle.modsFor.call(fake, plumeBuddy, null).avoid, 8);
  }

  console.log('\n== 24. 武器进化树（P2.3） ==');
  {
    const { WEAPONS, ITEMS, WEAPON_EVOLUTIONS, RANK_ORDER, Smith } = vm.runInContext('({ WEAPONS, ITEMS, WEAPON_EVOLUTIONS, RANK_ORDER, Smith })', ctx);
    const keys = Object.keys(WEAPON_EVOLUTIONS);
    eq('进化树 13 条', keys.length, 13);
    const bad = [];
    const score = w => (w.mt || 0) * 5 + (w.hit || 0) + (w.heal || 0) * 2 + (w.crit || 0);
    for (const k of keys) {
      const spec = WEAPON_EVOLUTIONS[k], a = WEAPONS[k], b = WEAPONS[spec.to];
      if (!a) { bad.push(k + ' 不存在'); continue; }
      if (!b) { bad.push(k + '→' + spec.to + ' 不存在'); continue; }
      if (a.type !== b.type) bad.push(k + ' 类型不同');
      /* 阶级只降不升才算错（同阶换装允许，如骨笛→潮声这类专属线本就不进表） */
      if (RANK_ORDER[b.rank] < RANK_ORDER[a.rank]) bad.push(k + ' 阶级下降');
      if (score(b) <= score(a)) bad.push(k + ' 综合性能未提升');
      if ((b.price || 0) <= (a.price || 0)) bad.push(k + ' 价格未提升');
      if (!ITEMS[spec.mat] || ITEMS[spec.mat].kind !== 'mat') bad.push(k + ' 材料非法');
      if (!(spec.gold > 0 && spec.n > 0)) bad.push(k + ' 费用非法');
      if (spec.to === k) bad.push(k + ' 自环');
      if (WEAPON_EVOLUTIONS[spec.to] && WEAPON_EVOLUTIONS[spec.to].to === k) bad.push(k + ' 双环');
    }
    eq('进化树数据合法', bad.join(' | ') || '无', '无');
    ok('传说不在进化树', !keys.some(k => LEGENDARY_WEAPONS[k]));
    ok('Boss 专属不在进化树', !keys.some(k => (WEAPONS[k].price || 0) === 0));
    ok('角色专属不在进化树', !keys.some(k => WEAPONS[k].unique));

    /* 资格：完好可进化、损坏/传说/终点不可 */
    ok('完好兵装可进化', Smith.canEvolve('iron_sword', { key: 'iron_sword', uses: 10 }));
    ok('损坏不可进化', !Smith.canEvolve('iron_sword', { key: 'iron_sword', uses: 0 }));
    ok('传说不可进化', !Smith.canEvolve('lw_yunque', { key: 'lw_yunque', uses: 20 }));
    ok('终点兵装不可进化', !Smith.canEvolve('silver_sword', { key: 'silver_sword', uses: 20 }));

    /* 全流程：扣款扣料、换 key、耐久刷满、强化保留 */
    const camp = { gold: 5000, convoy: [{ key: 'mat_iron', uses: 3 }, { key: 'mat_steel', uses: 1 }] };
    const sword = { key: 'iron_sword', uses: 10, plus: 2 };
    const r = Smith.evolve(camp, sword);
    ok('进化成功', r.ok);
    eq('进化后是钢剑', sword.key, 'steel_sword');
    eq('耐久刷满', sword.uses, WEAPONS.steel_sword.uses);
    eq('强化等级保留', sword.plus, 2);
    eq('扣盘缠 400', camp.gold, 4600);
    eq('铁髓扣 2（剩 1）', Smith.matCount(camp, 'mat_iron'), 1);
    ok('进化结果带名称', r.name === WEAPONS.steel_sword.name && r.fromName === WEAPONS.iron_sword.name);

    /* 失败分支 */
    eq('盘缠不足', Smith.evolve({ gold: 10, convoy: [{ key: 'mat_iron', uses: 5 }] }, { key: 'iron_sword', uses: 10 }).why, 'gold');
    eq('材料不足', Smith.evolve({ gold: 5000, convoy: [] }, { key: 'iron_sword', uses: 10 }).why, 'mat');
    eq('损坏不可进化', Smith.evolve(camp, { key: 'steel_sword', uses: 0 }).why, 'broken');
    eq('无下一阶', Smith.evolve(camp, { key: 'silver_sword', uses: 20 }).why, 'bad');
    const txt = Smith.evolveText('iron_sword', 2);
    ok('预览含箭头', txt.indexOf('→') > 0, txt);
    ok('预览含保留强化', txt.indexOf('保留 +2') > 0, txt);
  }

  console.log('\n== 25. 支援 12 组 + 心结（P3.2） ==');
  {
    const { SUPPORTS, CHARS, HEART_KNOTS, KNOT_HIT_PENALTY, KNOT_FINAL_BONUS, KNOT_FINAL_NO } =
      vm.runInContext('({ SUPPORTS, CHARS, HEART_KNOTS, KNOT_HIT_PENALTY, KNOT_FINAL_BONUS, KNOT_FINAL_NO })', ctx);
    const { Battle } = vm.runInContext('({ Battle })', ctx);
    eq('支援组 12 组', SUPPORTS.length, 12);
    const ids = SUPPORTS.map(p => p.id);
    eq('支援 id 唯一', new Set(ids).size, ids.length);
    const bad = [];
    for (const p of SUPPORTS) {
      if (!CHARS[p.a] || !CHARS[p.b]) bad.push(p.id + ' 角色不存在');
      if (p.a === p.b) bad.push(p.id + ' 自连');
      if (!p.name) bad.push(p.id + ' 缺名');
      for (const r of ['C', 'B', 'A']) {
        const d = p.dialogues && p.dialogues[r];
        if (!Array.isArray(d) || d.length < 3) bad.push(p.id + ' 缺 ' + r + ' 对白');
        else if (d.some(l => !CHARS[l.who] && l.who !== '旁白')) bad.push(p.id + ' ' + r + ' 说话人非法');
      }
    }
    eq('支援数据完整', bad.join(' | ') || '无', '无');
    const pairs = SUPPORTS.map(p => [p.a, p.b].sort().join('|'));
    eq('支援配对不重复', new Set(pairs).size, pairs.length);

    /* 心结：两条线各挂一人，了断对象必须在同一支援组里 */
    for (const r of ['A', 'B']) {
      const k = HEART_KNOTS[r];
      ok('心结 ' + r + ' 存在', !!k);
      ok('心结 ' + r + ' 角色有效', !!(k && CHARS[k.char]));
      ok('心结 ' + r + ' 了断对象有效', !!(k && CHARS[k.partner]));
      const pair = SUPPORTS.find(p => p.id === (k && k.pairId));
      ok('心结 ' + r + ' 对应支援组存在',
        !!pair && [pair.a, pair.b].includes(k.char) && [pair.a, pair.b].includes(k.partner));
      ok('心结 ' + r + ' 有对白', Array.isArray(k.resolve) && k.resolve.length >= 3);
    }
    ok('两条线挂的是不同角色', HEART_KNOTS.A.char !== HEART_KNOTS.B.char);

    /* modsFor：未解 -5 / 解开 0 / 终章全解 +5+5 / 非终章不给 */
    const fake = Object.create(Battle);
    const hero = mkUnit({ charId: 'chisang', cls: 'zzz', x: 3, y: 3 });
    const foe = mkUnit({ id: 'e', side: 'enemy', x: 1, y: 0 });
    fake.B = { units: [hero], nodes: [], supports: {} };
    fake.chapter = { no: 5 };
    fake.campaign = { knots: { chisang: { resolved: false, route: 'A' } }, supports: {} };
    eq('未解心结命中 -5', Battle.modsFor.call(fake, hero, foe).hit, -KNOT_HIT_PENALTY);
    eq('knotState 未解', Battle.knotState.call(fake, 'chisang'), 'open');
    ok('未全解', !Battle.allKnotsCleared.call(fake));
    fake.campaign.knots.chisang.resolved = true;
    eq('解开后不再扣', Battle.modsFor.call(fake, hero, foe).hit, 0);
    eq('knotState 已解', Battle.knotState.call(fake, 'chisang'), 'cleared');
    ok('全解成立', Battle.allKnotsCleared.call(fake));
    fake.chapter = { no: KNOT_FINAL_NO };
    const fm = Battle.modsFor.call(fake, hero, foe);
    eq('终章全解命中 +5', fm.hit, KNOT_FINAL_BONUS.hit);
    eq('终章全解必杀 +5', fm.crit, KNOT_FINAL_BONUS.crit);
    fake.chapter = { no: 5 };
    eq('非终章不给加成', Battle.modsFor.call(fake, hero, foe).hit, 0);
    const other = mkUnit({ charId: 'luming', cls: 'zzz', x: 3, y: 4 });
    eq('无心结角色不扣命中', Battle.modsFor.call(fake, other, foe).hit, 0);
    eq('无心结 knotState 为 null', Battle.knotState.call(fake, 'luming'), null);
    const foeKnot = mkUnit({ id: 'e2', side: 'enemy', charId: 'chisang', x: 2, y: 0 });
    eq('敌方不吃心结', Battle.modsFor.call(fake, foeKnot, hero).hit, 0);
  }

  console.log('\n== 26. 个人技② + 技能继承 + 熟练度成长（P2.2） ==');
  {
    const { CHARS, CLASSES, INHERIT_CAP, RANK_UP_USES, RANK_ORDER, RANK_NAMES } =
      vm.runInContext('({ CHARS, CLASSES, INHERIT_CAP, RANK_UP_USES, RANK_ORDER, RANK_NAMES })', ctx);
    const { Battle } = vm.runInContext('({ Battle })', ctx);

    /* --- 26.1 个人技② 数据完整性 --- */
    const ids = Object.keys(CHARS);
    eq('角色 14 人（12 主力 + 2 替补援军）', ids.length, 14);
    const missing = ids.filter(id => !CHARS[id].personal2 || !CHARS[id].personal2.name || !CHARS[id].personal2.desc);
    eq('每人都有第二条个人技', missing.join(',') || '无', '无');
    const names2 = ids.map(id => CHARS[id].personal2.name);
    eq('个人技② 不重名', new Set(names2).size, names2.length);
    const dupWith1 = ids.filter(id => CHARS[id].personal && CHARS[id].personal2 &&
      CHARS[id].personal.name === CHARS[id].personal2.name);
    eq('个人技② 不与个人技① 同名', dupWith1.join(',') || '无', '无');

    /* 每个字段都必须真被引擎读（否则写了等于没写） */
    const READ_FIELDS = [
      'hit', 'crit', 'hitIfNoMove', 'critIfNoMove', 'hitVsFlying', 'hitVsArmor', 'critVsArmor',
      'hitIfMoved4', 'avoidFlat', 'avoidIfLone', 'avoidOnNode', 'defIfWounded', 'def', 'res',
      'healBonus', 'dmg', 'move', 'selfDamageOnNode', 'selfDamageIfSummon', 'dmgPerSummon',
      'adjacentAllyHit', 'adjacentAllyAvoid', 'enemyAuraHit', 'songRange', 'songPower',
      'summon', 'summonUses', 'summonUsesBonus', 'summonAuraHit', 'summonBuff', 'movePenaltyOnHit', 'weapon'
    ];
    ok('引擎字段清单规模合理', READ_FIELDS.length >= 30);
    const unknown = [];
    for (const id of ids) {
      for (const k of Object.keys(CHARS[id].personal2)) {
        if (k === 'name' || k === 'desc') continue;
        if (!READ_FIELDS.includes(k)) unknown.push(id + '.' + k);
      }
    }
    eq('个人技② 字段全部有引擎读取', unknown.join(',') || '无', '无');
    const noEffect = ids.filter(id => Object.keys(CHARS[id].personal2)
      .filter(k => k !== 'name' && k !== 'desc').length === 0);
    eq('个人技② 都有实际效果', noEffect.join(',') || '无', '无');

    /* --- 26.2 合并进 skillFieldsOf（两条个人技共存） --- */
    const mkChar = (id, over) => {
      const c = CHARS[id];
      return Object.assign({
        id: 'u_' + id, charId: id, name: c.name, side: 'player', cls: c.cls, level: c.level,
        stats: Object.assign({}, c.stats), growth: {}, ranks: Object.assign({}, c.ranks),
        items: [], weaponIndex: 0,
        personal: JSON.parse(JSON.stringify(c.personal || {})),
        personal2: JSON.parse(JSON.stringify(c.personal2 || {})),
        inherited: [], statuses: {}, tags: [], x: 0, y: 0
      }, over || {});
    };
    const yunce = mkChar('yunce');
    yunce.hp = yunce.stats.hp;
    const fy = Battle.skillFieldsOf(yunce);
    eq('个人技① 仍生效（相邻友军命中）', fy.adjacentAllyHit, 5);
    eq('个人技② 生效（魔抗 +2）', fy.res, 2);
    eq('个人技② 生效（残血护甲 +2）', fy.defIfWounded, 2);

    const merged = [];
    for (const id of ids) {
      const c = CHARS[id];
      const f = Battle.skillFieldsOf(mkChar(id));
      for (const k of Object.keys(c.personal2)) {
        if (k === 'name' || k === 'desc') continue;
        const v = c.personal2[k];
        if (typeof v === 'number') { if (!(f[k] >= v)) merged.push(id + '.' + k); }
        else if (f[k] === undefined) merged.push(id + '.' + k);
      }
    }
    eq('12 条个人技② 全部进 skillFieldsOf', merged.join(',') || '无', '无');
    ok('skillListOf 列出职业技+两条个人技', Battle.skillListOf(yunce).length >= 3);

    /* --- 26.3 同名字段取较大值，不叠乘、不压低 --- */
    const fake = Object.create(Battle);
    const foe = mkUnit({ id: 'e', side: 'enemy', x: 1, y: 0 });
    fake.B = { units: [yunce], nodes: [], supports: {}, phaseIndex: 0 };
    eq('个人技② 魔抗真进公式', Battle.modsFor.call(fake, yunce, foe).res, 2);
    const wounded = mkChar('yunce');
    wounded.hp = 1;
    fake.B.units = [wounded];
    eq('残血护甲真进公式', Battle.modsFor.call(fake, wounded, foe).def, 2);

    const clash = mkUnit({ cls: 'zzz', personal: { name: 'a', hit: 8 }, personal2: { name: 'b', hit: 5 } });
    eq('同名取较大值（个人技①更大）', Battle.skillFieldsOf(clash).hit, 8);
    const clash2 = mkUnit({ cls: 'zzz', personal: { name: 'a', hit: 3 }, personal2: { name: 'b', hit: 9 } });
    eq('同名取较大值（个人技②更大）', Battle.skillFieldsOf(clash2).hit, 9);
    const clash3 = mkUnit({ cls: 'zzz', personal: { name: 'a', def: 4 }, personal2: { name: 'b', def: 4 } });
    eq('同值不叠乘', Battle.skillFieldsOf(clash3).def, 4);
    eq('个人技② 的 name 不覆盖个人技①', Battle.skillFieldsOf(clash2).name, 'a');
    eq('继承技的 name 不入公式', Battle.skillFieldsOf(mkUnit({ cls: 'zzz', inherited: [{ name: '破阵', dmg: 2 }] })).name, undefined);

    /* 兽使：个人技② 只加召唤次数，不许把职业的 summon 阶位压低 */
    const aman = mkChar('aman');
    const fa = Battle.skillFieldsOf(aman);
    eq('兽使 summon 阶位不被覆盖', fa.summon, true);
    eq('唤兽：每章召唤 2 次', Battle.summonUsesLeft.call(fake, aman), 2);
    const beastking = mkChar('aman', { cls: 'beastking' });
    eq('山灵御兽：基础 1 次 + 唤兽 1 次', Battle.summonUsesLeft.call(fake, beastking), 2);

    /* --- 26.4 继承技进公式 --- */
    eq('继承上限 2 条', INHERIT_CAP, 2);
    const heir = mkUnit({ cls: 'zzz', inherited: [{ name: '破阵', dmg: 2 }] });
    fake.B.units = [heir];
    eq('继承技伤害 +2', Battle.modsFor.call(fake, heir, foe).dmg, 2);
    const heir2 = mkUnit({ cls: 'zzz', personal2: { name: 'p', dmg: 3 }, inherited: [{ name: '破阵', dmg: 2 }] });
    fake.B.units = [heir2];
    eq('继承技与个人技② 同名取大', Battle.modsFor.call(fake, heir2, foe).dmg, 3);
    const heir3 = mkUnit({ cls: 'zzz', inherited: [{ name: 'x', dmg: 2 }, { name: 'y', dmg: 5 }] });
    fake.B.units = [heir3];
    eq('两条继承技也不叠乘', Battle.modsFor.call(fake, heir3, foe).dmg, 5);
    ok('无继承技时字段为空', Battle.skillFieldsOf(mkUnit({ cls: 'zzz' })).dmg === undefined);

    /* --- 26.5 熟练度成长阈值与进位 --- */
    eq('升阶阈值 40 次', RANK_UP_USES, 40);
    eq('阶位 5 级', RANK_NAMES.length, 5);
    eq('阶位表 D→S', RANK_NAMES.join(''), 'DCBAS');
    const runRank = (ranks, pts, uses) => {
      const r = Object.assign({}, ranks), p = Object.assign({}, pts);
      return { ups: Battle.rankGrowth(r, p, uses), ranks: r, pts: p };
    };
    let t = runRank({ sword: 'D' }, {}, { sword: 39 });
    eq('39 次不升阶', t.ranks.sword, 'D');
    eq('39 次进度留存', t.pts.sword, 39);
    eq('39 次无升阶记录', t.ups.length, 0);
    t = runRank({ sword: 'D' }, {}, { sword: 40 });
    eq('40 次升 C', t.ranks.sword, 'C');
    eq('升阶后进度清零', t.pts.sword, 0);
    eq('升阶记录 1 条', t.ups.length, 1);
    eq('升阶记录 from', t.ups[0].from, 'D');
    eq('升阶记录 to', t.ups[0].to, 'C');
    t = runRank({ sword: 'D' }, { sword: 25 }, { sword: 20 });
    eq('跨章累加升阶', t.ranks.sword, 'C');
    eq('跨章累加余数 5', t.pts.sword, 5);
    t = runRank({ sword: 'D' }, {}, { sword: 130 });
    eq('单章最多升一阶', t.ranks.sword, 'C');
    eq('溢出的 90 次留作进度', t.pts.sword, 90);
    t = runRank({ sword: 'S' }, {}, { sword: 200 });
    eq('S 阶封顶', t.ranks.sword, 'S');
    eq('S 阶不再累计', t.pts.sword, 0);
    eq('S 阶无升阶记录', t.ups.length, 0);
    t = runRank({ sword: 'D', bow: 'C' }, {}, { sword: 40, bow: 40 });
    eq('多武器同时升阶', t.ups.length, 2);
    eq('多武器各自进位', t.ranks.bow, 'B');
    t = runRank({ sword: 'D' }, {}, {});
    eq('没出手不升阶', t.ranks.sword, 'D');
    ok('空参数不报错', Battle.rankGrowth(null, null, null).length === 0);

    /* --- 26.6 出手次数按耐久消耗折算 --- */
    const u2 = mkUnit({ itemsStart: [20, 5, 3], items: [
      { key: 'iron_sword', uses: 8 }, { key: 'potion', uses: 5 }, { key: 'iron_bow', uses: 1 }
    ] });
    const wu = Battle.weaponUsesOf(u2);
    eq('铁剑出手 12 次', wu.sword, 12);
    eq('弓出手 2 次', wu.bow, 2);
    ok('道具不计熟练', wu.potion === undefined);
    eq('无出手则无记录', Object.keys(Battle.weaponUsesOf(mkUnit())).length, 0);
  }

  console.log('\n== 27. 替补援军 + 遗言（P3.3） ==');
  {
    const { CHARS, CLASSES, WEAPONS, ITEMS, EPITAPHS, AUTO_JOINS, CHAPTERS, HERO_ORDER, STAT_ORDER } =
      vm.runInContext('({ CHARS, CLASSES, WEAPONS, ITEMS, EPITAPHS, AUTO_JOINS, CHAPTERS, HERO_ORDER, STAT_ORDER })', ctx);
    const ids = Object.keys(CHARS);
    const reserves = ids.filter(id => CHARS[id].reserve);
    eq('替补援军 2 人', reserves.length, 2);
    eq('替补援军是谢无衣与滕大戈', reserves.sort().join(','), 'tengdage,xiewuyi');
    ok('两人都进了 HERO_ORDER', reserves.every(id => HERO_ORDER.includes(id)));

    /* 职业与兵装 */
    eq('谢无衣是符师', CHARS.xiewuyi.cls, 'talisman');
    eq('滕大戈是重刃', CHARS.tengdage.cls, 'axeman');
    for (const id of reserves) {
      const c = CHARS[id], cls = CLASSES[c.cls];
      ok(id + ' 职业存在且为一转', !!cls && cls.tier === 1);
      ok(id + ' 有转职去向', !!cls.promote && !!CLASSES[cls.promote]);
      for (const t of cls.weapons) ok(id + ' 熟练度覆盖 ' + t, !!c.ranks[t]);
      for (const it of c.items) {
        const w = WEAPONS[it.key] || ITEMS[it.key];
        ok(id + ' 初始物品存在 ' + it.key, !!w);
        if (WEAPONS[it.key]) ok(id + ' 初始兵装职业可用 ' + it.key, cls.weapons.includes(WEAPONS[it.key].type));
      }
      for (const k of STAT_ORDER) ok(id + ' 属性完整 ' + k, typeof c.stats[k] === 'number' && typeof c.growth[k] === 'number');
      ok(id + ' 有两条个人技', !!(c.personal && c.personal.name) && !!(c.personal2 && c.personal2.name));
      ok(id + ' 两条个人技不同名', c.personal.name !== c.personal2.name);
      ok(id + ' 有生平', typeof c.bio === 'string' && c.bio.length > 8);
      ok(id + ' 基础等级不高于转职线', c.level < 10);
    }

    /* 遗言：14 人全覆盖、互不重复、非空 */
    const noEpitaph = ids.filter(id => !EPITAPHS[id] || !String(EPITAPHS[id]).trim());
    eq('每人都有遗言', noEpitaph.join(',') || '无', '无');
    const texts = ids.map(id => EPITAPHS[id]);
    eq('遗言互不重复', new Set(texts).size, texts.length);
    ok('遗言都不超过 40 字', texts.every(t => t.length <= 40));

    /* 入队：第 5 章末两条线都补人 */
    for (const chId of ['5A', '5B']) {
      ok('autoJoins 有 ' + chId, Array.isArray(AUTO_JOINS[chId]));
      for (const id of reserves) {
        ok('第 ' + chId + ' 章末补入 ' + id, (AUTO_JOINS[chId] || []).includes(id));
      }
      ok('第 ' + chId + ' 章存在', CHAPTERS.some(c => String(c.id) === chId));
    }
    const obtainable = new Set();
    for (const chId in AUTO_JOINS) for (const id of AUTO_JOINS[chId]) obtainable.add(id);
    eq('替补援军有入队路径', reserves.filter(id => !obtainable.has(id)).join(',') || '无', '无');

    /* 数值定位：谢无衣偏辅助（魔抗高于护甲），滕大戈偏半坦（护甲高、血厚） */
    ok('谢无衣魔抗 > 护甲', CHARS.xiewuyi.stats.res > CHARS.xiewuyi.stats.def);
    ok('滕大戈护甲 ≥ 10 且生命 ≥ 30', CHARS.tengdage.stats.def >= 10 && CHARS.tengdage.stats.hp >= 30);
    ok('滕大戈力量高于技巧', CHARS.tengdage.stats.str > CHARS.tengdage.stats.skl);
  }

  console.log('\n== 28. 多结局（P3.4） ==');
  {
    const { ENDINGS, ENDING_RULE, endingOf } = vm.runInContext('({ ENDINGS, ENDING_RULE, endingOf })', ctx);
    /* 三档数据完整性 */
    eq('结局三档', Object.keys(ENDINGS).length, 3);
    for (const k of ['good', 'mid', 'bad']) {
      const e = ENDINGS[k];
      ok('结局 ' + k + ' 存在', !!e);
      eq('结局 ' + k + ' 的 key 自洽', e.key, k);
      ok('结局 ' + k + ' 有名字', typeof e.name === 'string' && e.name.length >= 2);
      ok('结局 ' + k + ' 有小标题', typeof e.kicker === 'string' && e.kicker.length >= 2);
      ok('结局 ' + k + ' 有 3~5 段', Array.isArray(e.lines) && e.lines.length >= 3 && e.lines.length <= 5);
      ok('结局 ' + k + ' 每段不少于 20 字', e.lines.every(t => typeof t === 'string' && t.length >= 20));
    }
    const names = ['good', 'mid', 'bad'].map(k => ENDINGS[k].name);
    eq('三档结局不重名', new Set(names).size, 3);
    eq('好结局叫灵脉重燃', ENDINGS.good.name, '灵脉重燃');
    eq('中结局叫山河如旧', ENDINGS.mid.name, '山河如旧');
    eq('差结局叫永夜', ENDINGS.bad.name, '永夜');

    /* 判定：三要素全满 → 好 */
    const full = endingOf({ alive: 12, rankA: 5, nodesHeld: 3, nodesTotal: 3 });
    eq('人够 + 羁绊够 + 阵眼全控 → 好', full.key, 'good');
    ok('好结局带回指标', full.metrics.allNodes === true && full.metrics.alive === 12);
    /* 任一条不满足 → 退中 */
    eq('阵眼未全控 → 中', endingOf({ alive: 12, rankA: 5, nodesHeld: 2, nodesTotal: 3 }).key, 'mid');
    eq('人不够 → 中', endingOf({ alive: 7, rankA: 5, nodesHeld: 3, nodesTotal: 3 }).key, 'mid');
    eq('羁绊不够 → 中', endingOf({ alive: 12, rankA: 2, nodesHeld: 3, nodesTotal: 3 }).key, 'mid');
    /* 中结局的两条独立通道 */
    eq('存活达标即中', endingOf({ alive: 5, rankA: 0, nodesHeld: 0, nodesTotal: 3 }).key, 'mid');
    eq('A 级达标即中', endingOf({ alive: 4, rankA: 1, nodesHeld: 0, nodesTotal: 3 }).key, 'mid');
    /* 差 */
    eq('人少且无 A 级 → 差', endingOf({ alive: 4, rankA: 0, nodesHeld: 0, nodesTotal: 3 }).key, 'bad');
    eq('全员阵亡 → 差', endingOf({ alive: 0, rankA: 0, nodesHeld: 0, nodesTotal: 0 }).key, 'bad');
    eq('空参数不报错 → 差', endingOf().key, 'bad');
    eq('undefined 指标不报错 → 差', endingOf({}).key, 'bad');
    /* 边界与钳制 */
    eq('存活刚好 8 → 可判好', endingOf({ alive: 8, rankA: 3, nodesHeld: 3, nodesTotal: 3 }).key, 'good');
    eq('A 级刚好 3 → 可判好', endingOf({ alive: 8, rankA: 3, nodesHeld: 3, nodesTotal: 3 }).key, 'good');
    eq('存活 7 不判好', endingOf({ alive: 7, rankA: 3, nodesHeld: 3, nodesTotal: 3 }).key, 'mid');
    eq('负数被钳成 0', endingOf({ alive: -5, rankA: -1, nodesHeld: -2, nodesTotal: -3 }).metrics.alive, 0);
    eq('无阵眼时不满足全控', endingOf({ alive: 12, rankA: 5, nodesHeld: 0, nodesTotal: 0 }).key, 'mid');
    ok('阈值常量可读', ENDING_RULE.good.alive > 0 && ENDING_RULE.mid.alive > 0);
    ok('阈值递减', ENDING_RULE.good.alive > ENDING_RULE.mid.alive && ENDING_RULE.good.rankA > ENDING_RULE.mid.rankA);
    /* 返回的 lines 是副本，改它不污染数据表 */
    const one = endingOf({ alive: 12, rankA: 5, nodesHeld: 3, nodesTotal: 3 });
    one.lines.push('污染');
    eq('lines 是副本', ENDINGS.good.lines.length, 5);
  }

  console.log('\n== 29. 勇者模式（P3.4） ==');
  {
    const { DIFFICULTIES, HEROIC, diffOf } = vm.runInContext('({ DIFFICULTIES, HEROIC, diffOf })', ctx);
    /* 开关常量 */
    eq('勇者敌军加成 1.15', HEROIC.enemyMul, 1.15);
    eq('勇者悔棋 0 次', HEROIC.rewinds, 0);
    eq('勇者经验 0.9', HEROIC.expMul, 0.9);
    /* 关掉时与难度表完全一致 */
    for (const k of ['easy', 'normal', 'hard']) {
      const d = diffOf({ difficulty: k });
      eq(k + ' 关勇者时敌军倍率不变', d.enemyMul, DIFFICULTIES[k].enemyMul);
      eq(k + ' 关勇者时悔棋不变', d.rewinds, DIFFICULTIES[k].rewinds);
      ok(k + ' 关勇者时无 heroic 标记', !d.heroic);
    }
    eq('缺省难度回落标准', diffOf({}).key, 'normal');
    eq('空参数回落标准', diffOf().key, 'normal');
    eq('难度非法时回落标准', diffOf({ difficulty: 'zzz' }).key, 'normal');
    /* 开启后叠加 */
    const hn = diffOf({ difficulty: 'normal', heroic: true });
    eq('标准 + 勇者：敌军 ×1.15', hn.enemyMul, 1.15);
    eq('标准 + 勇者：悔棋 0', hn.rewinds, 0);
    eq('标准 + 勇者：经验 ×0.9', hn.expMul, 0.9);
    eq('标准 + 勇者：名字带后缀', hn.name, '标准 · 勇者');
    ok('标准 + 勇者：带 heroic 标记', hn.heroic === true);
    eq('标准 + 勇者：难度键不变', hn.key, 'normal');
    eq('标准 + 勇者：敌等级不变', hn.enemyLv, 0);
    const hh = diffOf({ difficulty: 'hard', heroic: true });
    eq('修罗 + 勇者：敌军 ×1.32', hh.enemyMul, 1.32);
    eq('修罗 + 勇者：悔棋仍 0', hh.rewinds, 0);
    eq('修罗 + 勇者：经验 ×0.86', hh.expMul, 0.86);
    const he = diffOf({ difficulty: 'easy', heroic: true });
    eq('轻松 + 勇者：敌军 ×1.03', he.enemyMul, 1.03);
    eq('轻松 + 勇者：悔棋 0', he.rewinds, 0);
    /* 不污染原表 */
    eq('原表 standard 未被改写', DIFFICULTIES.normal.enemyMul, 1);
    eq('原表 normal 悔棋仍是 3', DIFFICULTIES.normal.rewinds, 3);
    ok('原表对象未被替换', DIFFICULTIES.normal.heroic === undefined);
    /* 叠加顺序无关：先算再取与取后再算一致 */
    eq('勇者倍率与难度倍率可交换', Math.round(1.15 * 1.15 * 100) / 100, hh.enemyMul);
  }

  console.log('\n== 30. 山海图鉴（P3.4） ==');
  {
    const { CODEX, CODEX_KINDS, ENEMY_TYPES, ELITE_AFFIXES, CHAPTERS } =
      vm.runInContext('({ CODEX, CODEX_KINDS, ENEMY_TYPES, ELITE_AFFIXES, CHAPTERS })', ctx);
    ok('图鉴条目不少于 25 条', CODEX.length >= 25);
    eq('图鉴分类 5 类', Object.keys(CODEX_KINDS).length, 5);
    const keys = CODEX.map(e => e.key);
    eq('图鉴 key 唯一', new Set(keys).size, keys.length);
    const badKind = CODEX.filter(e => !CODEX_KINDS[e.kind]).map(e => e.key);
    eq('分类都合法', badKind.join(',') || '无', '无');
    const badText = CODEX.filter(e => !e.name || !e.lore || !e.tip ||
      e.name.length < 2 || e.lore.length < 12 || e.tip.length < 6).map(e => e.key);
    eq('每条都有名字/小传/弱点', badText.join(',') || '无', '无');

    /* 分类计数 */
    const count = k => CODEX.filter(e => e.kind === k).length;
    eq('妖兽 8 条', count('beast'), 8);
    eq('灵兽 3 条', count('spirit'), 3);
    eq('精英词缀 4 条', count('elite'), 4);
    eq('首领 12 条', count('boss'), 12);
    eq('遗迹 2 条', count('ruin'), 2);

    /* 键与真实数据对齐 */
    const beastKeys = CODEX.filter(e => e.kind === 'beast').map(e => e.key);
    const missingBeast = beastKeys.filter(k => !ENEMY_TYPES[k]);
    eq('妖兽键都在 ENEMY_TYPES', missingBeast.join(',') || '无', '无');
    const beastIsBoss = beastKeys.filter(k => ENEMY_TYPES[k].boss);
    eq('妖兽里没有 Boss', beastIsBoss.join(',') || '无', '无');
    const bossKeys = CODEX.filter(e => e.kind === 'boss').map(e => e.key);
    const notBoss = bossKeys.filter(k => !ENEMY_TYPES[k] || !ENEMY_TYPES[k].boss);
    eq('首领键都是 Boss 敌型', notBoss.join(',') || '无', '无');
    const allBosses = Object.keys(ENEMY_TYPES).filter(k => ENEMY_TYPES[k].boss);
    eq('所有 Boss 都有图鉴条目', allBosses.filter(k => !bossKeys.includes(k)).join(',') || '无', '无');
    const spiritKeys = CODEX.filter(e => e.kind === 'spirit').map(e => e.key);
    eq('灵兽键都是召唤兽', spiritKeys.filter(k => !ENEMY_TYPES[k] || !k.startsWith('ally_')).join(',') || '无', '无');
    const affixKeys = CODEX.filter(e => e.kind === 'elite').map(e => e.key.replace(/^affix_/, ''));
    eq('精英键都对应真实词缀', affixKeys.filter(k => !ELITE_AFFIXES[k]).join(',') || '无', '无');
    eq('四个词缀全覆盖', Object.keys(ELITE_AFFIXES).filter(k => !affixKeys.includes(k)).join(',') || '无', '无');
    const ruinKeys = CODEX.filter(e => e.kind === 'ruin');
    const badRuin = ruinKeys.filter(e => !CHAPTERS.some(c => String(c.id) === String(e.chapter)));
    eq('遗迹绑定有效章节', badRuin.map(e => e.key).join(',') || '无', '无');
    ok('遗迹都带 chapter 字段', ruinKeys.every(e => e.chapter !== undefined));
    /* 名字不重复（同名词缀与敌型允许同名，但 key 已唯一） */
    const names = CODEX.map(e => e.name);
    ok('图鉴名字基本不重复', new Set(names).size >= names.length - 1);
    /* 分类顺序常量齐全 */
    for (const k of ['beast', 'spirit', 'elite', 'boss', 'ruin']) ok('分类名存在 ' + k, !!CODEX_KINDS[k]);
  }

  console.log('\n== 31. 三幕剧情（P3.5） ==');
  {
    const { CHAPTERS, DIALOGUES, CHARS, DIALOGUE_NPCS } =
      vm.runInContext('({ CHAPTERS, DIALOGUES, CHARS, DIALOGUE_NPCS })', ctx);

    /* 说话人白名单：CHARS 里的人名 + 剧情 NPC 名单 */
    const names = new Set(Object.values(CHARS).map(c => c.name));
    ok('剧情 NPC 名单存在', Array.isArray(DIALOGUE_NPCS) && DIALOGUE_NPCS.length > 0);
    eq('NPC 名单不含角色人名（避免歧义）',
      (DIALOGUE_NPCS || []).filter(n => names.has(n)).join(',') || '无', '无');
    eq('NPC 名单无重复', new Set(DIALOGUE_NPCS || []).size, (DIALOGUE_NPCS || []).length);
    const legal = n => names.has(n) || (DIALOGUE_NPCS || []).includes(n);

    const bad = [];
    let lines = 0, chars = 0;
    for (const ch of CHAPTERS) {
      const pre = 'ch' + ch.id;
      const intro = DIALOGUES[pre + '_intro'];
      const outro = DIALOGUES[pre + '_outro'];
      if (!Array.isArray(intro)) bad.push(pre + ' 缺第一幕');
      if (!Array.isArray(outro)) bad.push(pre + ' 缺第三幕');

      /* 第二幕：章数据里的 mids 指向真实对白，每章恰好一段 */
      const mids = ch.mids;
      if (!Array.isArray(mids) || !mids.length) bad.push(pre + ' 缺 mids');
      else {
        if (mids.length !== 1) bad.push(pre + ' 第二幕不止一段');
        for (const m of mids) {
          if (!DIALOGUES[m.key]) bad.push(pre + ' 幕间键不存在 ' + m.key);
          if (!(m.turn >= 2)) bad.push(pre + ' 幕间回合过早 ' + m.turn);
          if (ch.turnLimit && m.turn > ch.turnLimit) bad.push(pre + ' 幕间回合超出上限');
        }
      }

      const blocks = [intro].concat((mids || []).map(m => DIALOGUES[m.key]), [outro]);
      const seen = new Set();
      let sum = 0;
      for (const b of blocks) {
        if (!Array.isArray(b)) continue;
        if (b.length < 6 || b.length > 12) bad.push(pre + ' 幕长 ' + b.length + ' 句');
        for (const l of b) {
          if (!l || typeof l.text !== 'string' || !l.text.trim()) { bad.push(pre + ' 空台词'); continue; }
          if (seen.has(l.text)) bad.push(pre + ' 章内重复台词');
          seen.add(l.text);
          sum += l.text.length; lines++; chars += l.text.length;
          if (!legal(l.who)) bad.push(pre + ' 说话人非法 ' + l.who);
          if (l.text.length > 60) bad.push(pre + ' 台词过长 ' + l.text.length);
        }
        /* 每一幕都要有戏，不能全是旁白 */
        if (b.every(l => l.who === '旁白')) bad.push(pre + ' 有一幕全是旁白');
      }
      if (sum < 500) bad.push(pre + ' 三幕正文偏少 ' + sum + ' 字');
    }
    eq('三幕结构完整', bad.join(' | ') || '无', '无');
    ok('三幕总句数 ≥ 300', lines >= 300, String(lines));
    ok('三幕总字数 ≥ 7000', chars >= 7000, String(chars));

    /* 幕间键唯一，且不与首尾幕撞名 */
    const midKeys = CHAPTERS.flatMap(c => (c.mids || []).map(m => m.key));
    eq('12 章各有幕间', midKeys.length, CHAPTERS.length);
    eq('幕间键唯一', new Set(midKeys).size, midKeys.length);
    eq('幕间键不与首尾幕撞名',
      midKeys.filter(k => /_(intro|outro)$/.test(k)).join(',') || '无', '无');
    eq('幕间键全部有对白', midKeys.filter(k => !DIALOGUES[k]).join(',') || '无', '无');

    /* 章节 intro/outro 字段与 DIALOGUES 键对得上（engine 读的是章节字段） */
    const mapBad = [];
    for (const ch of CHAPTERS) {
      if (!DIALOGUES[ch.intro]) mapBad.push('ch' + ch.id + ' intro 键无效');
      if (!DIALOGUES[ch.outro]) mapBad.push('ch' + ch.id + ' outro 键无效');
    }
    eq('章节首尾幕键有效', mapBad.join(',') || '无', '无');

    /* 分歧点与终局特殊对白仍在 */
    for (const k of ['ch4_route', 'talk_moya', 'boss_phase2', 'weakened']) {
      ok('特殊对白存在 ' + k, Array.isArray(DIALOGUES[k]) && DIALOGUES[k].length >= 1);
    }

    /* 三幕之外的所有对白条目也要说话人合法（防止改稿时漏改） */
    const strayBad = [];
    for (const k of Object.keys(DIALOGUES)) {
      for (const l of DIALOGUES[k] || []) {
        if (!l || !legal(l.who)) strayBad.push(k + ':' + (l && l.who));
      }
    }
    eq('全部对白说话人合法', strayBad.join(',') || '无', '无');
  }

  console.log('\n== 32. 对白演出指令（P4） ==');
  {
    const { DIALOGUES, DIALOGUE_FX, DIALOGUE_SFX } =
      vm.runInContext('({ DIALOGUES, DIALOGUE_FX, DIALOGUE_SFX })', ctx);

    ok('演出指令表存在', Array.isArray(DIALOGUE_FX) && DIALOGUE_FX.length >= 4);
    eq('四种动效齐全',
      ['shake', 'flash', 'dim', 'lit'].filter(k => DIALOGUE_FX.includes(k)).length, 4);
    eq('动效无重复', new Set(DIALOGUE_FX).size, DIALOGUE_FX.length);
    eq('音效表无重复', new Set(DIALOGUE_SFX).size, DIALOGUE_SFX.length);

    /* 音效键必须在 audio.js 里有对应 case，否则点了没声音且不报错 */
    const audioSrc = fs.readFileSync(path.join(ROOT, 'js/audio.js'), 'utf8');
    const missingSfx = DIALOGUE_SFX.filter(n => audioSrc.indexOf("case '" + n + "':") < 0);
    eq('音效键都在 audio.js 里', missingSfx.join(',') || '无', '无');

    /* 逐行校验 */
    const badFx = [], badSfx = [], badWait = [];
    let fxCount = 0, sfxCount = 0, waitCount = 0;
    const fxKinds = new Set();
    for (const key of Object.keys(DIALOGUES)) {
      for (const l of DIALOGUES[key] || []) {
        if (!l) continue;
        if (l.fx !== undefined) {
          if (!DIALOGUE_FX.includes(l.fx)) badFx.push(key + ':' + l.fx);
          else { fxCount++; fxKinds.add(l.fx); }
        }
        if (l.sfx !== undefined) {
          if (!DIALOGUE_SFX.includes(l.sfx)) badSfx.push(key + ':' + l.sfx);
          else sfxCount++;
        }
        if (l.wait !== undefined) {
          if (typeof l.wait !== 'number' || !(l.wait >= 0 && l.wait <= 2000)) badWait.push(key + ':' + l.wait);
          else waitCount++;
        }
      }
    }
    eq('fx 取值合法', badFx.join(',') || '无', '无');
    eq('sfx 取值合法', badSfx.join(',') || '无', '无');
    eq('wait 在 0~2000 毫秒内', badWait.join(',') || '无', '无');

    /* 覆盖率：演出是点缀不是标配，但关键戏眼要有 */
    ok('动效至少 15 处', fxCount >= 15, String(fxCount));
    ok('音效至少 8 处', sfxCount >= 8, String(sfxCount));
    ok('停顿至少 2 处', waitCount >= 2, String(waitCount));
    eq('四类动效都用到了', fxKinds.size, 4);

    /* 演出指令不污染文本：带 fx 的行仍要有 who/text（第 31 节也查，这里再守一次） */
    const dirty = [];
    for (const key of Object.keys(DIALOGUES)) {
      for (const l of DIALOGUES[key] || []) {
        if (l && (l.fx || l.sfx || l.wait !== undefined) && (!l.who || !l.text)) dirty.push(key);
      }
    }
    eq('演出行仍有说话人与文本', dirty.join(',') || '无', '无');
  }

  console.log('\n== 33. 新手引导（P4） ==');
  {
    const { HINTS, HINT_TURNS } = vm.runInContext('({ HINTS, HINT_TURNS })', ctx);
    const keys = Object.keys(HINTS || {});
    ok('引导表存在', keys.length >= 5, String(keys.length));
    eq('引导键无重复', new Set(keys).size, keys.length);

    const badText = [];
    for (const k of keys) {
      const t = HINTS[k];
      if (typeof t !== 'string' || !t.trim()) { badText.push(k + ' 空'); continue; }
      if (t.length < 20) badText.push(k + ' 太短 ' + t.length);
      if (t.length > 60) badText.push(k + ' 太长 ' + t.length);
      if (t.indexOf('\n') >= 0) badText.push(k + ' 有换行');
    }
    eq('引导文案长度合规（20~60 字、单行）', badText.join(',') || '无', '无');
    eq('引导文案不重复', new Set(keys.map(k => HINTS[k])).size, keys.length);

    /* 点播表：值必须是真提示，键必须是合理的回合数，且每条提示都要有回合 */
    const turns = Object.keys(HINT_TURNS || {}).map(Number);
    ok('点播表存在', turns.length >= 5, String(turns.length));
    eq('点播回合都是 1~10 的整数',
      turns.filter(n => !(Number.isInteger(n) && n >= 1 && n <= 10)).join(',') || '无', '无');
    const ghostHint = turns.filter(n => !HINTS[HINT_TURNS[n]]);
    eq('点播的提示都存在', ghostHint.join(',') || '无', '无');
    const unscheduled = keys.filter(k => !Object.values(HINT_TURNS).includes(k));
    eq('每条提示都有回合点播', unscheduled.join(',') || '无', '无');
    eq('第 1 回合不弹引导（让位给章节目标）', HINT_TURNS[1], undefined);

    /* 引导只讲操作，不讲世界观——出现叙事词就是写错了 */
    const storyWords = ['师父', '玄阙', '灵脉', '浊潮', '山海策'];
    const leaky = keys.filter(k => storyWords.some(w => HINTS[k].indexOf(w) >= 0));
    eq('引导文案不掺剧情', leaky.join(',') || '无', '无');
  }

  console.log('\n== 34. 立绘资源接入（P4.3） ==');
  {
    const { CHARS } = vm.runInContext('({ CHARS })', ctx);
    const dir = path.join(ROOT, 'assets/portraits');
    const has = f => fs.existsSync(path.join(dir, f));
    const sizeOf = f => fs.statSync(path.join(dir, f)).size;

    eq('14 名角色都有立绘',
      Object.keys(CHARS).filter(id => !has(id + '.jpg')).join(',') || '无', '无');
    eq('角色都有 hurt 表情',
      Object.keys(CHARS).filter(id => !has(id + '_hurt.jpg')).join(',') || '无', '无');

    /* 对白里会出现的 Boss（UI.charOf 的 specials 映射目标）必须有立绘，否则台词没脸 */
    const bossIds = ['xuanque', 'shanxiao', 'chisha', 'bamboo', 'waterghost', 'icexiao', 'swampdragon', 'turbidgeneral'];
    eq('对白 Boss 都有立绘', bossIds.filter(id => !has(id + '.jpg')).join(',') || '无', '无');

    /* 体积红线：单张超 1.5M 说明有人把 art-source 原图直接拷进来了 */
    const pngs = fs.readdirSync(dir).filter(f => f.endsWith('.jpg'));
    const heavy = pngs.filter(f => sizeOf(f) > 1.5 * 1024 * 1024);
    eq('没有未压缩的原图混进 assets', heavy.join(',') || '无', '无');
    ok('立绘数量 ≥ 55', pngs.length >= 55, String(pngs.length));
    /* 扩展名必须与实际编码一致：JPEG 内容不许挂 .png 后缀 */
    const wrongExt = pngs.filter(f => f.endsWith('.png'));
    eq('立绘没有 .png 后缀的 JPEG', wrongExt.join(',') || '无', '无');

    const portTotal = pngs.reduce((a, f) => a + sizeOf(f), 0);
    ok('立绘目录总量 < 8M', portTotal < 8 * 1024 * 1024,
      (portTotal / 1024 / 1024).toFixed(2) + 'M');

    /* 全身与图标目录：资源就位即可，接线在 P4 剩余项里做 */
    const fullDir = path.join(dir, 'full');
    const fulls = fs.existsSync(fullDir) ? fs.readdirSync(fullDir).filter(f => f.endsWith('.jpg')) : [];
    ok('全身立绘已就位（≥15 张）', fulls.length >= 15, String(fulls.length));

    const iconDir = path.join(ROOT, 'assets/icons/units');
    const icons = fs.existsSync(iconDir) ? fs.readdirSync(iconDir).filter(f => f.endsWith('.png')) : [];
    ok('我方图标已就位（14 张）', icons.length >= 14, String(icons.length));

    /* 美术侧拼音与游戏 id 的别名必须真的落到文件上（曾漏过 yusuqiu → yusqiu） */
    const aliases = { yankui: 'yanwei', moya: 'moyan', yusqiu: 'yusuqiu' };
    const aliasBad = Object.keys(aliases).filter(id => !has(id + '.jpg'));
    eq('别名角色都有立绘', aliasBad.join(',') || '无', '无');
  }

  /* ============================================================
   * 35. 机制说明库与常量对齐（P4.6）
   * 图鉴的教训：文案照设计文档写、没查常量，三条数值全错。
   * 本节把 MECHANICS 里每个关键数字逐个绑到常量/源码上——
   * 改文案数字或改常量，这里必须同步，否则红。
   * ============================================================ */
  console.log('\n== 35. 机制说明库与常量对齐（P4.6） ==');
  {
    const K = vm.runInContext('({ MECHANICS, MECHANICS_GROUPS, DIFFICULTIES, HEROIC, ELITE_AFFIXES, ' +
      'AFFIX_SHIELD_MUL, AFFIX_REGEN_RATE, AFFIX_AURA_HIT, AFFIX_BERSERK_SPD, COMMAND_VOLLEY_HIT, COMMAND_HOLD_MUL, ' +
      'CHAIN_RANGE, SUMMON_FIELD_CAP, RANK_UP_USES, INHERIT_CAP, KNOT_HIT_PENALTY, KNOT_FINAL_BONUS, ENDING_RULE, ' +
      'SUPPORT_RANKS, SUPPORT_RANGE, SUPPORT_POINTS_ADJACENT, LEGENDARY_DROP, NODE_TIER_MAX, NODE_TIER_HOLD, ' +
      'TERRAIN, CODEX, CODEX_KINDS, PROMO_LEVEL, SAVE_VERSION, SUMMON_TIERS, ELEMENT_MULTIPLIER, ' +
      'nodeEffectText })', ctx);
    const combatSrc = fs.readFileSync(path.join(ROOT, 'js/combat.js'), 'utf8');
    const norm = s => String(s).replace(/[−–—]/g, '-');   // 正文用 U+2212，统一成半角再比对
    const body = id => {
      const m = K.MECHANICS.find(e => e.id === id);
      return m ? norm(m.body) : '';
    };
    /* 正文必须包含某常量算出的字符串 */
    const must = (id, s) => ok('「' + id + '」含 「' + s + '」', body(id).indexOf(norm(s)) >= 0, body(id));
    /* 源码里必须有某字面量（combat.js 里没有常量的那几个） */
    const srcHas = (label, s) => ok('combat.js 源码含 ' + s, combatSrc.indexOf(s) >= 0);

    /* ---- 结构 ---- */
    eq('四组齐全', Object.keys(K.MECHANICS_GROUPS).join(','), 'field,combat,growth,campaign');
    ok('条目 ≥ 28', K.MECHANICS.length >= 28, String(K.MECHANICS.length));
    eq('id 无重复', K.MECHANICS.length === new Set(K.MECHANICS.map(m => m.id)).size, true);
    ok('每条都有标题和正文', K.MECHANICS.every(m => m.title && m.body && m.body.length >= 30));
    ok('每条都归入已知组', K.MECHANICS.every(m => K.MECHANICS_GROUPS[m.group]));
    eq('条目 id 唯一且非空', K.MECHANICS.filter(m => !m.id).length, 0);

    /* ---- 战场 ---- */
    must('terrain', '回避 +' + K.TERRAIN.f.avoid);              // 疏林 +20
    must('terrain', '回避 +' + K.TERRAIN.f.avoid + ' / +' + K.TERRAIN.h.avoid + ' / +' + K.TERRAIN.r.avoid);  // 疏林/丘壑/残垣 +20/+15/+10
    must('terrain', '护甲 +' + K.TERRAIN.f.def);                // +1
    must('nodes', '命中 +15');                                   // nodeEffectText('attack',1)
    must('nodes', '暴击 +5');
    must('nodes', '回复 8 点生命');                              // life 8
    must('nodes', '移动 +1');                                    // flow 1
    must('nodes', '护甲与魔抗 +3');                              // guard 3
    eq('阵眼效果文案与函数一致', K.nodeEffectText('attack', 1).indexOf('命中 +15') >= 0, true);
    must('node_tier', '每满 ' + K.NODE_TIER_HOLD + ' 个己方阶段');
    must('node_tier', '最高 ' + K.NODE_TIER_MAX + ' 阶');
    must('ice', '二次确认');

    /* ---- 战斗 ---- */
    srcHas('追击阈值', '>= this.attackSpeed(defender) + 4');
    srcHas('暴击倍率', '(crit ? 3 : 1)');
    srcHas('特效倍率', 'raw *= 2');
    srcHas('三角命中', 'hit: 15');
    srcHas('三角威力', 'dmg: 2');
    must('hit', '2RN');
    must('triangle', '命中 +15、威力 +2');
    must('double', '高 4 点以上');
    must('crit', '暴击伤害 ×3');
    must('effective', '伤害 ×2');
    must('support', '+' + K.SUPPORT_POINTS_ADJACENT + ' 点');
    must('support', '90 封顶');
    must('support', 'C 需 ' + K.SUPPORT_RANKS[0].need + ' 点');
    must('support', 'B 需 ' + K.SUPPORT_RANKS[1].need + ' 点');
    must('support', 'A 需 ' + K.SUPPORT_RANKS[2].need + ' 点');
    must('support', '+' + K.SUPPORT_RANKS[0].hit + ' / +' + K.SUPPORT_RANKS[1].hit + ' / +' + K.SUPPORT_RANKS[2].hit);
    must('support', '+' + K.SUPPORT_RANKS[0].crit + ' / +' + K.SUPPORT_RANKS[1].crit + ' / +' + K.SUPPORT_RANKS[2].crit);
    must('support', '相距 ' + K.SUPPORT_RANGE + ' 格内');
    must('spells', '×' + K.ELEMENT_MULTIPLIER.strong);
    must('spells', '×' + K.ELEMENT_MULTIPLIER.weak);
    must('affixes', '-' + Math.round((1 - K.AFFIX_SHIELD_MUL) * 100) + '%');
    must('affixes', Math.round(K.AFFIX_REGEN_RATE * 100) + '%');
    must('affixes', '命中 +' + K.AFFIX_AURA_HIT);
    must('affixes', '攻速 +' + K.AFFIX_BERSERK_SPD);
    must('command', '命中 +' + K.COMMAND_VOLLEY_HIT);
    must('command', '-' + Math.round((1 - K.COMMAND_HOLD_MUL) * 100) + '%');
    must('command', K.CHAIN_RANGE + ' 格内');

    /* ---- 成长 ---- */
    must('promote', '等级 ' + K.PROMO_LEVEL);
    must('inherit', '最多保留 ' + K.INHERIT_CAP + ' 条');
    must('rank', '累计 ' + K.RANK_UP_USES + ' 次');
    const plus1 = Combat.weaponPlusMods(1), plus3 = Combat.weaponPlusMods(3);
    must('weapons', '威力 +' + plus1.mt + '、命中 +' + plus1.hit);
    must('weapons', '必杀 +' + plus3.crit);
    must('weapons', '基础 ' + Math.round(K.LEGENDARY_DROP.base * 100) + '%');
    must('weapons', '+' + Math.round(K.LEGENDARY_DROP.ramp * 100) + '%');
    must('weapons', '封顶 ' + Math.round(K.LEGENDARY_DROP.cap * 100) + '%');
    must('weapons', K.LEGENDARY_DROP.hardPity + ' 次');
    must('weapons', '+' + Math.round(K.LEGENDARY_DROP.ngplus * 100) + '%');
    must('summon', '最多 ' + K.SUMMON_FIELD_CAP + ' 只');
    const t1 = K.SUMMON_TIERS[0].orders;
    must('summon', '伤害 +' + t1[0].effect.dmg + '、护甲 -' + Math.abs(t1[0].effect.def));
    must('summon', '护甲 +' + t1[1].effect.def + '、回避 +' + t1[1].effect.avoid);
    must('heroic', '×' + K.HEROIC.enemyMul);
    must('heroic', '×' + K.HEROIC.expMul);
    must('heroic', '×' + (K.HEROIC.enemyMul * K.DIFFICULTIES.hard.enemyMul).toFixed(2).replace(/0$/, ''));

    /* ---- 战役 ---- */
    must('difficulty', '敌军 ×' + K.DIFFICULTIES.easy.enemyMul.toFixed(2));
    must('difficulty', '敌等级 -' + Math.abs(K.DIFFICULTIES.easy.enemyLv));
    must('difficulty', '经验 ×' + K.DIFFICULTIES.easy.expMul.toFixed(2));
    must('difficulty', '敌军 ×' + K.DIFFICULTIES.hard.enemyMul.toFixed(2));
    must('difficulty', '敌等级 +' + K.DIFFICULTIES.hard.enemyLv);
    must('difficulty', '经验 ×' + K.DIFFICULTIES.hard.expMul.toFixed(2));
    must('difficulty', '每章悔棋 ' + K.DIFFICULTIES.normal.rewinds + ' 次');
    must('knots', '命中 -' + K.KNOT_HIT_PENALTY);
    must('knots', '命中 +' + K.KNOT_FINAL_BONUS.hit + '、必杀 +' + K.KNOT_FINAL_BONUS.crit);
    must('endings', '存活 ≥' + K.ENDING_RULE.good.alive);
    must('endings', 'A 级 ≥' + K.ENDING_RULE.good.rankA);
    must('endings', '存活 ≥' + K.ENDING_RULE.mid.alive);
    must('endings', 'A 级 ≥' + K.ENDING_RULE.mid.rankA);
    must('rewind', '悔棋 ' + K.DIFFICULTIES.normal.rewinds + ' 次');
    must('codex', K.CODEX.length + ' 条');
    /* 五类数量（分类名去空格后比对：CODEX_KINDS 是「妖 兽」式展示名；词缀类正文写全称） */
    for (const kind of Object.keys(K.CODEX_KINDS)) {
      const label = kind === 'elite' ? '精英词缀' : K.CODEX_KINDS[kind].replace(/\s/g, '');
      must('codex', label + ' ' + K.CODEX.filter(e => e.kind === kind).length);
    }
    must('save', 'v' + K.SAVE_VERSION);
  }

  /* ============================================================
   * 36. 人物关系图（P4.7）
   * 关系网是纯展示层：等级必须走 Combat.supportRank，
   * 页面每个数字必须来自 SUPPORT_RANKS / SUPPORT_POINTS_ADJACENT /
   * SUPPORT_RANGE，布局必须确定性可复现。
   * ============================================================ */
  console.log('\n== 36. 人物关系图（P4.7） ==');
  {
    /* ---- 1) SUPPORTS 数据完整性 ---- */
    eq('支援组数', SUPPORTS.length, 12);
    eq('组 id 唯一', new Set(SUPPORTS.map(p => p.id)).size, SUPPORTS.length);
    ok('两端都是已定义角色', SUPPORTS.every(p => CHARS[p.a] && CHARS[p.b]));
    ok('三段对白齐全', SUPPORTS.every(p =>
      p.dialogues && ['C', 'B', 'A'].every(r => p.dialogues[r] && p.dialogues[r].length)));
    ok('对白说话人限定在组内两人', SUPPORTS.every(p =>
      ['C', 'B', 'A'].every(r => p.dialogues[r].every(l => l.who === p.a || l.who === p.b))));

    /* ---- 2) 节点集合：进网的 + 独行的 ---- */
    const net = Relations.netIds(), lone = Relations.loneIds();
    eq('关系网人数', net.length, 12);
    ok('进网角色都已定义', net.every(id => CHARS[id]));
    eq('独行者恰为谢无衣/滕大戈', lone.slice().sort().join(','), 'tengdage,xiewuyi');
    ok('独行者也已定义', lone.every(id => CHARS[id]));
    eq('云策的羁绊组数', Relations.pairsOf('yunce').length, 5);

    /* ---- 3) 布局确定性 + 不重叠 + 不出界 ---- */
    const lay1 = Relations.layout();
    Relations._lay = null;
    const lay2 = Relations.layout();
    eq('两次布局坐标一致', JSON.stringify(lay1), JSON.stringify(lay2));
    const R = Relations.R, W = Relations.W, H = Relations.H;
    ok('全部节点在画布内', net.every(id => {
      const p = lay1[id];
      return p.x >= R && p.x <= W - R && p.y >= R && p.y <= H - R;
    }));
    let minD = Infinity;
    for (let i = 0; i < net.length; i++) for (let j = i + 1; j < net.length; j++) {
      const a = lay1[net[i]], b = lay1[net[j]];
      minD = Math.min(minD, Math.hypot(a.x - b.x, a.y - b.y));
    }
    ok('两两不重叠（圆心距 ≥ 2R+14）', minD >= R * 2 + 14, '最小 ' + minD.toFixed(1));
    /* 12 条支援线零交叉（共享端点的相邻组不算） */
    const pt = id => ({ x: lay1[id].x, y: lay1[id].y });
    const side = (o, p, q) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
    const segCross = (a, b, c, d) => {
      const d1 = side(a, b, c), d2 = side(a, b, d), d3 = side(c, d, a), d4 = side(c, d, b);
      return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
    };
    let crossings = 0;
    for (let i = 0; i < SUPPORTS.length; i++) for (let j = i + 1; j < SUPPORTS.length; j++) {
      const p = SUPPORTS[i], q = SUPPORTS[j];
      if (p.a === q.a || p.a === q.b || p.b === q.a || p.b === q.b) continue;
      if (segCross(pt(p.a), pt(p.b), pt(q.a), pt(q.b))) crossings++;
    }
    eq('支援线零交叉', crossings, 0);

    /* ---- 4) 等级映射与 Combat.supportRank 同源 ---- */
    const fake = {
      roster: [{ id: 'yunce' }, { id: 'luming' }, { id: 'yankui' }, { id: 'bailu' }],
      fallen: ['moya'],
      supports: { yunce_luming: 25, yunce_yankui: 60, bailu_luming: 95 }
    };
    const pair = id => SUPPORTS.find(p => p.id === id);
    for (const pts of [0, 19, 20, 49, 50, 89, 90, 300]) {
      const c = { roster: fake.roster, fallen: [], supports: { yunce_luming: pts } };
      const e = Relations.edgeInfo(c, pair('yunce_luming'));
      eq(pts + ' 点等级与公式一致', e.rank, Combat.supportRank(pts));
    }
    eq('25 点 → C 级样式', Relations.edgeInfo(fake, pair('yunce_luming')).key, 'C');
    eq('60 点 → B 级样式', Relations.edgeInfo(fake, pair('yunce_yankui')).key, 'B');
    eq('95 点 → A 级样式', Relations.edgeInfo(fake, pair('bailu_luming')).key, 'A');
    eq('0 点 → 同行未达 C', Relations.edgeInfo(fake, pair('yunce_bailu')).key, 'none');
    eq('有人未入队 → 虚线', Relations.edgeInfo(fake, pair('xuanyi_chisang')).key, 'lock');
    eq('云策最高羁绊 B', Relations.bestRankOf(fake, 'yunce'), 'B');
    eq('白鹭最高羁绊 A', Relations.bestRankOf(fake, 'bailu'), 'A');

    /* ---- 5) SVG 结构 ---- */
    Relations.sel = null;
    const html = Relations.html(fake);
    eq('节点数', (html.match(/rel-n n-/g) || []).length, 12);
    eq('连线命中区', (html.match(/rel-hit/g) || []).length, 12);
    eq('可见连线', (html.match(/<line class="rel-e e-/g) || []).length, 12);
    eq('头像裁剪', (html.match(/id="relclip-/g) || []).length, 12);
    ok('每条边可点', SUPPORTS.every(p => html.indexOf('data-act="relPair" data-pair="' + p.id + '"') >= 0));
    ok('每个节点可点', net.every(id => html.indexOf('data-act="relChar" data-id="' + id + '"') >= 0));
    ok('头像三级降级链齐全', net.every(id =>
      html.indexOf('assets/portraits/' + id + '.jpg') >= 0 &&
      html.indexOf("this.setAttribute('href','assets/portraits/" + id + ".svg')") >= 0 &&
      html.indexOf('>' + CHARS[id].name.charAt(0) + '</text>') >= 0));
    ok('背景点击清空', html.indexOf('data-act="relClear"') >= 0);
    ok('殁者有标记', html.indexOf('n-fallen') >= 0 && html.indexOf('已殁') >= 0);
    ok('未入队有标记', html.indexOf('未入队') >= 0);
    ok('独行者在页脚', html.indexOf('独行：') >= 0 && html.indexOf(CHARS.xiewuyi.name) >= 0);
    /* 边标签：无等级不显示，有等级才显示 */
    ok('未达 C 的边不显示标签', html.indexOf('逃将') < 0);
    ok('C 级边显示标签', html.indexOf('山门药香') >= 0);

    /* ---- 6) 选中态 ---- */
    Relations.selectChar('yunce');
    const h2 = Relations.html(fake);
    const deg = Relations.pairsOf('yunce').length;
    eq('选中人物点亮节点', (h2.match(/rel-n n-\w+ lit/g) || []).length, deg + 1);
    eq('选中人物其余变暗', (h2.match(/rel-n n-\w+ dim/g) || []).length, 12 - deg - 1);
    eq('选中人物点亮连线', (h2.match(/rel-e e-\w+ lit/g) || []).length, deg);
    eq('选中人物其余连线变暗', (h2.match(/rel-e e-\w+ dim/g) || []).length, 12 - deg);
    ok('选中节点带光环', h2.indexOf('n-sel') >= 0);
    ok('侧栏列出全部羁绊行', (h2.match(/rel-prow/g) || []).length === deg);
    Relations.selectChar('yunce');
    eq('再点一次取消选中', Relations.sel, null);
    Relations.selectPair('bailu_luming');
    const h3 = Relations.html(fake);
    eq('选中连线只点亮一条', (h3.match(/rel-e e-\w+ lit/g) || []).length, 1);
    eq('选中连线只点亮两端', (h3.match(/rel-n n-\w+ lit/g) || []).length, 2);
    ok('满级文案', h3.indexOf('已达最高羁绊') >= 0);
    Relations.clear();
    eq('clear 清空选中', Relations.sel, null);

    /* ---- 7) 页面数字全部来自常量 ---- */
    const sideHtml = Relations.overviewPanel(fake);
    const needs = SUPPORT_RANKS.map(r => r.rank + ' ' + r.need).join(' · ');
    const hits = SUPPORT_RANKS.map(r => r.rank + ' +' + r.hit + ' 命中/回避').join(' · ');
    const crits = SUPPORT_RANKS.map(r => r.rank + ' +' + r.crit).join(' / ');
    ok('页面积攒规则用常量', sideHtml.indexOf('+' + SUPPORT_POINTS_ADJACENT + '</b> 点（' + SUPPORT_RANGE + ' 格内有效）') >= 0);
    ok('等级门槛用常量', sideHtml.indexOf(needs) >= 0);
    ok('命中回避加成用常量', sideHtml.indexOf(hits) >= 0);
    ok('必杀暴避加成用常量', sideHtml.indexOf(crits) >= 0);
    ok('总览统计', sideHtml.indexOf('已缔结 <b>A 1 · B 1 · C 1</b>') >= 0 &&
      sideHtml.indexOf('同行未达 C <b>1</b> · 未同行 <b>8</b>') >= 0);
    ok('图例五种线型', sideHtml.indexOf('未同行（有人未入队）') >= 0 && sideHtml.indexOf('同行 · 未达 C') >= 0);
  }

  /* ============================================================
   * 37. 平衡不变量（P5）
   * dev/balance.js 实测报告的数值锁：经验曲线、难度缩放、
   * 敌情曲线单调性、特效兵器与双倍——调公式前先过这里。
   * ============================================================ */
  console.log('\n== 37. 平衡不变量（P5） ==');
  {
    /* 真实的造兵函数（第 11 节已加载 battle.js，这里直接借方法） */
    const { Battle: BattleV, ENEMY_TYPES: ETYPES, DIFFICULTIES: DIFFS, diffOf: diffOfV, AUTO_JOINS: AJOINS, CHAPTERS: CHLIST, MAX_LEVEL: MAXLV } =
      vm.runInContext('({ Battle, ENEMY_TYPES, DIFFICULTIES, diffOf, AUTO_JOINS, CHAPTERS, MAX_LEVEL })', ctx);
    const spawner = { uid: 0, diff: DIFFS.normal };
    spawner.makeEnemyUnit = BattleV.makeEnemyUnit;
    const mkEnemy = (spec, key, heroic) => {
      spawner.diff = diffOfV({ difficulty: key, heroic: !!heroic });
      spawner.uid = 0;
      return spawner.makeEnemyUnit(spec);
    };

    /* ---- 经验曲线 ---- */
    eq('同级击杀 30 经验', Combat.killExp(10, 10, 1), 30);
    eq('敌每高 1 级 +5 经验', Combat.killExp(10, 12, 1), 40);
    eq('收益下限钳 6', Combat.killExp(20, 1, 1), 6);
    eq('收益上限钳 60', Combat.killExp(1, 20, 1), 60);
    eq('难度经验倍率生效（0.86）', Combat.killExp(10, 10, 0.86), 26);
    eq('每级 100 经验', (() => {
      const u = { level: 1, exp: 0, stats: { hp: 20 }, growth: { hp: 50 } };
      Combat.levelUp(u, 100);
      return u.level;
    })(), 2);
    ok('满级 20 封顶且经验清零', (() => {
      const u = { level: MAXLV, exp: 0, stats: { hp: 20 }, growth: { hp: 50 } };
      Combat.levelUp(u, 500);
      return u.level === MAXLV && u.exp === 0;
    })());
    ok('升级保底涨 2 点属性', (() => {
      const u = { level: 1, exp: 0, stats: { hp: 20, str: 5, mag: 0, skl: 5, spd: 5, lck: 5, def: 5, res: 5 }, growth: { hp: 50, str: 10 } };
      for (let i = 0; i < 10; i++) {
        const before = STAT_ORDER.reduce((s, k) => s + (u.stats[k] || 0), 0);
        Combat.levelUp(u, 100);
        if (STAT_ORDER.reduce((s, k) => s + (u.stats[k] || 0), 0) - before < 2) return false;
      }
      return true;
    })());
    ok('成长不越过属性上限帽', (() => {
      const u = { level: 1, exp: 0, stats: { hp: 20, str: 5, mag: 0, skl: 5, spd: 5, lck: 5, def: 5, res: 5 }, growth: { hp: 90, str: 90, mag: 90, skl: 90, spd: 90, lck: 90, def: 90, res: 90 } };
      for (let i = 0; i < 200; i++) Combat.levelUp(u, 100);
      return STAT_ORDER.every(k => u.stats[k] <= STAT_CAPS[k]);
    })());

    /* ---- 难度缩放（同章同兵，只改缩放） ---- */
    const spec = { type: 'bandit', lv: 9 };
    const eE = mkEnemy(spec, 'easy', false), eN = mkEnemy(spec, 'normal', false);
    const eH = mkEnemy(spec, 'hard', false), eHH = mkEnemy(spec, 'hard', true), eNH = mkEnemy(spec, 'normal', true);
    eq('轻松：等级 -1', eE.level, 8);
    eq('标准：等级不变', eN.level, 9);
    eq('修罗：等级 +1', eH.level, 10);
    eq('轻松：属性 ×0.9', eE.stats.hp, Math.max(1, Math.round((ETYPES.bandit.base.hp + ETYPES.bandit.growth.hp * (eE.level - 1)) * 0.9)));
    eq('修罗：属性 ×1.15', eH.stats.hp, Math.max(1, Math.round((ETYPES.bandit.base.hp + ETYPES.bandit.growth.hp * (eH.level - 1)) * 1.15)));
    ok('难度生命值严格递增', eE.stats.hp < eN.stats.hp && eN.stats.hp < eH.stats.hp && eH.stats.hp < eHH.stats.hp,
      eE.stats.hp + ' < ' + eN.stats.hp + ' < ' + eH.stats.hp + ' < ' + eHH.stats.hp);
    eq('标准+勇者：属性 ×1.15（等级不变）', eNH.stats.hp,
      Math.max(1, Math.round((ETYPES.bandit.base.hp + ETYPES.bandit.growth.hp * (eNH.level - 1)) * 1.15)));
    eq('修罗+勇者 = ×1.32', eHH.stats.hp, Math.max(1, Math.round((ETYPES.bandit.base.hp + ETYPES.bandit.growth.hp * (eHH.level - 1)) * 1.32)));

    /* ---- 敌情曲线沿 A 线单调不降 ---- */
    const ROUTE_A = [1, 2, 3, 4, '5A', '6A', '7A', 8, 9];
    const byId = {};
    for (const c of CHLIST) byId[c.id] = c;
    let mono = true, prev = 0;
    for (const id of ROUTE_A) {
      const ch = byId[id];
      const lvs = [...ch.enemies, ...(ch.reinforcements || []).flatMap(r => r.units || [])].map(e => e.lv || 1);
      const a = lvs.reduce((x, y) => x + y, 0) / lvs.length;
      if (a < prev - 0.001) mono = false;
      prev = a;
    }
    ok('敌情曲线沿 A 线单调不降', mono);
    ok('援军补位都是已定义角色', Object.keys(AJOINS).every(id => byId[id]) &&
      Object.values(AJOINS).flat().every(cid => CHARS[cid]));
    /* ---- 特效兵器与双倍（后期排兵的核心机制） ---- */
    ok('符对甲胄特效（后期核心解）', (() => {
      const u = mkUnit({ cls: 'talisman', ranks: { talisman: 'A' }, stats: { hp: 30, str: 5, mag: 15, skl: 10, spd: 8, lck: 5, def: 5, res: 5 } });
      give(u, 'greater_talisman');
      const d = mkUnit({ side: 'enemy', tags: ['armor'], stats: { hp: 50, str: 10, mag: 0, skl: 5, spd: 5, lck: 5, def: 10, res: 7 } });
      d.x = 1;
      const w = Combat.weaponOf(u);
      if (!w || !w.w.effective || w.w.effective.indexOf('armor') < 0) return false;
      const raw = 15 + (w.w.mt || 0) - 7;   // 灵力 + 威力 - 敌魔抗
      return Combat.isEffective(u, d) && Combat.damage(u, d, FLAT, true) === raw * 2;
    })());
    ok('双倍阈值 = 攻速领先 4', (() => {
      const a = mkUnit({ stats: { hp: 30, str: 10, mag: 0, skl: 5, spd: 14, lck: 5, def: 5, res: 5 } });
      const b = mkUnit({ side: 'enemy', stats: { hp: 30, str: 10, mag: 0, skl: 5, spd: 10, lck: 5, def: 5, res: 5 } });
      give(a, 'iron_sword'); give(b, 'iron_sword');
      return Combat.doubles(a, b) === true && Combat.doubles(b, a) === false;
    })());
  }

  console.log('\n== 38. 打击感 Juice（二期 G：纯呈现，不碰公式） ==');
  {
    const J = vm.runInContext('Juice', ctx);
    ok('Juice 已加载', !!J && typeof J.update === 'function' && typeof J.hit === 'function');
    const juiceSrc = fs.readFileSync(path.join(ROOT, 'js/juice.js'), 'utf8');
    ok('Juice 源码不出现 Combat.（不碰公式）', juiceSrc.indexOf('Combat.') < 0);

    /* 运行时桩：设置 / 触酸 / 飘字 / 战场。
     * 注意：第 11 节已载入 battle.js——Battle 是 const 词法声明，不能
     * var 重声明，只能改它的 .B；Render 是第 11 节打桩对象，直接扩充。 */
    vm.runInContext(`
      globalThis.Game = { settings: { juice: true, reducedMotion: false, haptics: true }, __vib: [] };
      globalThis.navigator = { vibrate: function (p) { Game.__vib.push(p); } };
    `, ctx);
    const G = vm.runInContext('Game', ctx);
    const R = vm.runInContext('Render', ctx);
    R.ox = 0; R.oy = 0; R.tile = 50; R.floats = [];
    R.floatText = function (t) { this.floats.push({ t: t }); };
    vm.runInContext('Battle', ctx).B = { units: [{ id: 'a1', x: 0, y: 0 }, { id: 'd1', x: 2, y: 0 }] };
    ctx.setTimeout = setTimeout;
    ctx.clearTimeout = clearTimeout;

    /* ---- 冻结语义：顿帧期时钟停走、update 返回 0，帧数到点恢复 ---- */
    J.clearAll();
    J.update(16);
    const c0 = J.now();
    J.freeze(4 / 60);
    eq('顿帧期 update 返回 0', J.update(16), 0);
    eq('顿帧期时钟停走', J.now(), c0);
    eq('顿帧第 2 帧仍冻结', J.update(16), 0);
    for (let i = 0; i < 5; i++) J.update(16);
    ok('帧数到点时钟恢复', J.now() > c0);

    /* ---- 倍速：顿帧减半 ---- */
    J.clearAll();
    J.freeze(4 / 60 / 2);
    ok('倍速顿帧减半', J.hitstop > 0 && J.hitstop <= 4 / 60 / 2 + 1e-9);

    /* ---- 轻击三件套 ---- */
    J.clearAll();
    J.hit({ x: 1, y: 1, dir: 1, speed: 1, unitId: 'd1' });
    eq('轻击顿帧 4 帧', Math.round(J.hitstop * 60), 4);
    ok('轻击闪白 ≈.18', Math.abs(J.flash - 0.18) < 1e-9);
    ok('轻击震屏 ≈.12', Math.abs(J.trauma - 0.12) < 1e-9);
    eq('轻击粒子 12', J.particles.length, 12);
    ok('轻击击退已上单位', !!J.knock['d1']);
    eq('轻击触觉 [10]', JSON.stringify(G.__vib[G.__vib.length - 1]), '[10]');

    /* ---- 必杀档 ---- */
    J.clearAll();
    vm.runInContext('Render.floats.length = 0', ctx);
    J.hit({ crit: true, x: 1, y: 1, dir: 1, speed: 1, unitId: 'd1' });
    eq('必杀顿帧 8 帧', Math.round(J.hitstop * 60), 8);
    ok('必杀闪白 .70', Math.abs(J.flash - 0.7) < 1e-9);
    eq('必杀粒子 26', J.particles.length, 26);
    eq('必杀慢放 0.35', J.timeScale, 0.35);
    eq('会心大字进飘字队', vm.runInContext('Render.floats.length', ctx), 1);

    /* ---- 击杀档 ---- */
    J.clearAll();
    J.hit({ kill: true, x: 1, y: 1, dir: 1, speed: 1, unitId: 'd1' });
    eq('击杀顿帧 12 帧', Math.round(J.hitstop * 60), 12);
    ok('击杀暗角脉冲', J.vignette > 0.5);
    ok('击杀倒地已登记', !!J.falls['d1']);
    eq('击杀慢放 0.25', J.timeScale, 0.25);

    /* ---- ×2 倍速下必杀顿帧 4 帧 ---- */
    J.clearAll();
    J.hit({ crit: true, x: 1, y: 1, dir: 1, speed: 2, unitId: 'd1' });
    eq('×2 必杀顿帧 4 帧', Math.round(J.hitstop * 60), 4);

    /* ---- hitFromEv：从战场取坐标/方向，miss 不触发 ---- */
    J.clearAll();
    J.hitFromEv({ hit: true, crit: false, lethal: false, attacker: 'a1', defender: 'd1' }, 1);
    ok('hitFromEv 上击退 + 出粒子', !!J.knock['d1'] && J.particles.length === 12);
    ok('攻击在左 → 受击方负向击退', J.knock['d1'].x < 0);
    J.clearAll();
    J.hitFromEv({ hit: false, attacker: 'a1', defender: 'd1' }, 1);
    eq('miss 不触发打击感', J.particles.length, 0);

    /* ---- reduced：只留 2 帧顿帧 ---- */
    J.clearAll();
    G.settings.reducedMotion = true;
    J.hit({ crit: true, kill: true, x: 1, y: 1, dir: 1, speed: 1, unitId: 'd1' });
    eq('reduced 顿帧 2 帧', Math.round(J.hitstop * 60), 2);
    eq('reduced 无粒子', J.particles.length, 0);
    eq('reduced 无闪白', J.flash, 0);
    eq('reduced 无震屏', J.trauma, 0);
    eq('reduced 无击退', Object.keys(J.knock).length, 0);
    G.settings.reducedMotion = false;

    /* ---- 总开关：关设置后完全静默 ---- */
    J.clearAll();
    G.settings.juice = false;
    J.hit({ x: 1, y: 1, dir: 1, speed: 1, unitId: 'd1' });
    eq('关设置后 hit 静默', J.hitstop + J.flash + J.trauma + J.particles.length, 0);
    G.settings.juice = true;

    /* ---- 粒子积分与消亡 ---- */
    J.clearAll();
    J.sparksPX(100, 100, 1, 8, 'hit');
    const life0 = J.particles[0].life, px0 = J.particles[0].x;
    J.update(16);
    ok('粒子随时间积分', J.particles[0].life < life0 && J.particles[0].x !== px0);
    J.clearAll();
    J.sparksPX(100, 100, 1, 4, 'hit');
    for (let i = 0; i < 60; i++) J.update(50);
    eq('粒子寿命耗尽被回收', J.particles.length, 0);

    /* ---- 击退回弹 / 倒地进度 ---- */
    J.clearAll();
    J.knockBack('d1', 20, 1);
    const kx0 = J.knock['d1'].x;
    for (let i = 0; i < 40; i++) J.update(16);
    ok('击退弹簧回弹', !J.knock['d1'] || J.knock['d1'].x < kx0);
    J.clearAll();
    J.fall('d1');
    eq('倒地初始进度 0', J.fallP('d1'), 0);
    for (let i = 0; i < 5; i++) J.update(50);   // update 单帧钳 50ms，5 帧 = 250ms
    ok('倒地进度过半', J.fallP('d1') > 0.4 && J.fallP('d1') < 0.6);
    for (let i = 0; i < 4; i++) J.update(50);   // 累计 450ms > 420ms 时长
    eq('倒地进度封顶 1', J.fallP('d1'), 1);

    /* ---- clearAll：点击跳过的安全保障 ---- */
    J.clearAll();
    J.hit({ crit: true, kill: true, x: 1, y: 1, dir: 1, speed: 1, unitId: 'd1' });
    J.clearAll();
    eq('clearAll 清顿帧', J.hitstop, 0);
    eq('clearAll 清慢放', J.timeScale, 1);
    eq('clearAll 清闪白', J.flash, 0);
    eq('clearAll 清粒子', J.particles.length, 0);
    eq('clearAll 清击退与倒地', Object.keys(J.knock).length + Object.keys(J.falls).length, 0);

    /* ---- 必杀四段式（静→蓄→余；真实 setTimeout） ---- */
    J.clearAll();
    await J.critWindUp(mkUnit({ id: 'u1' }), 1);
    ok('预兆推镜已挂', J._zoomTo > 1);
    ok('立绘切入已挂（缺图静默不炸）', !!J.cutIn && J.cutIn.side === 'R');
    eq('蓄力慢放 0.35', J.timeScale, 0.35);
    await J.critWindDown(1);
    eq('收势后立绘撤下', J.cutIn, null);
    eq('收势后推镜回正', J._zoomTo, 1);
    G.settings.reducedMotion = true;
    J.clearAll();
    await J.critWindUp(mkUnit({ id: 'u1' }), 1);
    ok('reduced 必杀只留顿帧', J.hitstop > 0 && J.cutIn === null);
    G.settings.reducedMotion = false;
    J.clearAll();

    /* ---- 死亡定格（微改动 2） ---- */
    const ms = J.deathCardFor(mkUnit({ id: 'p1', name: '鹿鸣', charId: 'luming', side: 'player' }), 1);
    ok('死亡定格时长在 0.8~1.5s', ms >= 800 && ms <= 1500, 'ms=' + ms);
    ok('定格卡带名字与遗言', !!J.deathCard && J.deathCard.name === '鹿鸣' && J.deathCard.line.length > 0);
    eq('遗言取 EPITAPHS（英魂碑同源）', J.deathCard.line, vm.runInContext('EPITAPHS', ctx).luming);
    ok('定格期间世界冻结', J.hitstop >= ms / 1000 - 1e-9);
    eq('倍速定格 600ms', J.deathCardFor(mkUnit({ id: 'p2', name: '岩隈', charId: 'yankui' }), 2), 600);
    J.clearAll();
    G.settings.juice = false;
    eq('关设置不演定格', J.deathCardFor(mkUnit({ id: 'p3', name: '云策', charId: 'yunce' }), 1), 0);
    G.settings.juice = true;
    J.clearAll();
    J.deathCardFor(mkUnit({ id: 'p4', name: '玄漪', charId: 'xuanyi' }), 1);
    J.deathCard.t0 -= J.deathCard.dur + 10;
    J.update(16);
    eq('真实时间到点撤卡', J.deathCard, null);
    J.deathCardFor(mkUnit({ id: 'p5', name: '赤桑', charId: 'chisang' }), 1);
    J.clearAll();
    eq('clearAll 清定格卡', J.deathCard, null);
  }

  console.log('\n----------------------------------------');
  console.log('结果：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})();
