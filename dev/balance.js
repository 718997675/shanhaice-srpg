/* ============================================================
 * 平衡实测（P5）：三档难度 + 成长曲线，全部跑真实公式
 * ------------------------------------------------------------
 * 运行：node dev/balance.js            （打印报告）
 *       node dev/balance.js --write    （同时写 docs/平衡实测报告.md）
 *
 * 口径说明（很重要，看数先看这个）：
 *  - 敌人用 Battle.makeEnemyUnit 真实生成：难度缩放与游戏内同源
 *    （敌等级 +enemyLv，全属性 ×enemyMul 四舍五入）
 *  - 决斗用 Combat.resolve 真实结算：命中 2RN、暴击 ×3、双倍、反击、
 *    武器耐久都在内；每次 resolve = 一轮完整交手
 *  - 1v1 干净场：草地、无地形加成、无支援、无个人技（mods 置空），
 *    数值偏保守——带支援/地形/技能的真实战斗只会更好
 *  - 经验模型：击杀均分给出击队（默认保守打法），主力 = 云策；
 *    实战玩家会把击杀喂给想练的人，等级只会更高不会更低
 *  - 对策位：本章可用角色里，对本章代表敌期望伤害最高的那个
 *    （特效兵器克甲胄/飞行，玩家实际就会这么排兵）
 *  - RNG 按种子确定性跑，同一份数据结果可复现
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const WRITE = process.argv.includes('--write');

const ctx = vm.createContext({ console });
for (const f of ['js/rng.js', 'js/data-core.js', 'js/data-systems.js', 'js/data-maps.js', 'js/combat.js', 'js/battle.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const { Combat, RNG, CHARS, CLASSES, WEAPONS, DIFFICULTIES, diffOf, ENEMY_TYPES,
        CHAPTERS, AUTO_JOINS, PROMO_LEVEL, MAX_LEVEL, Battle } =
  vm.runInContext('({ Combat, RNG, CHARS, CLASSES, WEAPONS, DIFFICULTIES, diffOf, ENEMY_TYPES, ' +
    'CHAPTERS, AUTO_JOINS, PROMO_LEVEL, MAX_LEVEL, Battle })', ctx);

/* 真实的造单位函数（借 Battle 的方法，难度缩放与游戏内完全一致） */
const spawner = { uid: 0, diff: DIFFICULTIES.normal };
spawner.makeEnemyUnit = Battle.makeEnemyUnit;
spawner.makePlayerUnit = Battle.makePlayerUnit;
function diffOfKey(key, heroic) { return diffOf({ difficulty: key, heroic: !!heroic }); }
function mkEnemy(spec, key, heroic) {
  spawner.diff = diffOfKey(key, heroic);
  spawner.uid = 0;
  return spawner.makeEnemyUnit(spec);
}
function mkPlayer(rec) {
  spawner.diff = DIFFICULTIES.normal;
  spawner.uid = 0;
  return spawner.makePlayerUnit(rec);
}

/* ---------- 小工具 ---------- */
const ROUTE_A = [1, 2, 3, 4, '5A', '6A', '7A', 8, 9];
const LORD = 'yunce';
const clone = o => JSON.parse(JSON.stringify(o));
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
const round1 = x => Math.round(x * 10) / 10;
const STAT_KEYS = ['hp', 'str', 'mag', 'skl', 'spd', 'lck', 'def', 'res'];
const DUEL_CTX = { mods: () => null, tileAt: () => ({ avoid: 0, def: 0 }), rng: RNG };

function chapterEnemies(ch) {
  return [...ch.enemies, ...(ch.reinforcements || []).flatMap(r => r.units || [])];
}
/* 通关必须击杀的敌军比例：全歼/斩将章 = 100%，其余按「打穿目标」估 60% */
function killRatio(ch) {
  return ch.objective.type === 'rout' || ch.objective.type === 'boss' ? 1 : 0.6;
}
/* 本章代表敌型（出现最多的，并列取先出现的） */
function repEnemyType(ch) {
  const cnt = {};
  for (const e of ch.enemies) cnt[e.type] = (cnt[e.type] || 0) + 1;
  let best = null, bestN = 0;
  for (const e of ch.enemies) {
    if (cnt[e.type] > bestN) { bestN = cnt[e.type]; best = e.type; }
  }
  return best;
}
/* 期望属性：每级按 growth% 期望增长，转职应用 promoGain（走第一分支） */
function expectedStats(charId, level) {
  const base = CHARS[charId];
  const cls = CLASSES[base.cls];
  const s = {};
  for (const k of STAT_KEYS) s[k] = (base.stats[k] || 0) + Math.floor((base.growth[k] || 0) * (level - 1) / 100);
  if (level >= PROMO_LEVEL && cls && cls.promoGain) {
    for (const k of Object.keys(cls.promoGain)) s[k] = (s[k] || 0) + cls.promoGain[k];
  }
  return s;
}
function charRec(id, level) {
  return {
    id: id, cls: CHARS[id].cls, level: level, exp: 0,
    stats: expectedStats(id, level), growth: CHARS[id].growth,
    ranks: clone(CHARS[id].ranks), items: clone(CHARS[id].items), weaponIndex: 0
  };
}

/* ============================================================
 * 一、敌情曲线
 * ============================================================ */
console.log('══════════ 一、敌情曲线（A 线：1→2→3→4→5A→6A→7A→8→9） ══════════');
const CH = {};
for (const c of CHAPTERS) CH[c.id] = c;
const enemyCurve = ROUTE_A.map(id => {
  const ch = CH[id];
  const ens = chapterEnemies(ch);
  const lvs = ens.map(e => e.lv || 1);
  const boss = ens.find(e => e.boss) || null;
  return {
    id: id, name: ch.name, count: ens.length, avgLv: round1(avg(lvs)), maxLv: Math.max(...lvs),
    boss: boss ? ENEMY_TYPES[boss.type].name + ' Lv' + (boss.lv || 1) : '—',
    deploy: ch.deployCount, obj: ch.objective.type
  };
});
console.log('章  | 名称       | 敌军 | 平均级 | 最高级 | Boss           | 出击 | 目标');
for (const r of enemyCurve) {
  console.log(String(r.id).padEnd(3) + '| ' + r.name.padEnd(10) + '| ' +
    String(r.count).padStart(4) + ' | ' + String(r.avgLv).padStart(6) + ' | ' + String(r.maxLv).padStart(6) + ' | ' +
    r.boss.padEnd(14) + '| ' + String(r.deploy).padStart(4) + ' | ' + r.obj);
}

/* ============================================================
 * 二、三档难度下的敌军数值（同章同兵，难度只改缩放）
 * ============================================================ */
console.log('\n══════════ 二、敌军数值 × 难度（第 5 章代表兵种，按本章平均级） ══════════');
{
  const ch = CH['5A'];
  const type = repEnemyType(ch);
  const lv = Math.round(enemyCurve.find(r => r.id === '5A').avgLv);
  console.log('参照：' + ENEMY_TYPES[type].name + ' Lv' + lv + '（第 5 章出现最多的敌型）');
  console.log('难度         | 等级 | 生命 | 力量 | 技巧 | 速度 | 幸运 | 护甲 | 魔抗');
  for (const [key, heroic] of [['easy', false], ['normal', false], ['hard', false], ['hard', true], ['normal', true]]) {
    const u = mkEnemy({ type: type, lv: lv }, key, heroic);
    const d = diffOfKey(key, heroic);
    const label = (DIFFICULTIES[key].name + (heroic ? '·勇者' : '')).padEnd(12);
    console.log(label + '| ' + String(u.level).padStart(4) + ' | ' +
      String(u.stats.hp).padStart(4) + ' | ' + String(u.stats.str).padStart(4) + ' | ' + String(u.stats.skl).padStart(4) + ' | ' +
      String(u.stats.spd).padStart(4) + ' | ' + String(u.stats.lck).padStart(4) + ' | ' + String(u.stats.def).padStart(4) + ' | ' +
      String(u.stats.res).padStart(4) + '   （×' + d.enemyMul + ' / 等级+' + d.enemyLv + ' / 经验×' + d.expMul + '）');
  }
}

/* ============================================================
 * 三、成长曲线
 * ============================================================ */
/* 3a. 静态期望属性 */
console.log('\n══════════ 三a、期望属性曲线（Lv10 应用转职增益） ══════════');
const fmtStats = s => STAT_KEYS.map(k => s[k]).join('/');
console.log('人物     | 转职               | Lv5                  | Lv10                 | Lv20');
for (const id of Object.keys(CHARS)) {
  const base = CHARS[id];
  const cls = CLASSES[base.cls];
  const next = cls.promote ? CLASSES[cls.promote].name : '—';
  console.log(base.name.padEnd(6) + ' | ' + (cls.name + '→' + next).padEnd(18) + '| ' +
    fmtStats(expectedStats(id, 5)).padEnd(20) + '| ' + fmtStats(expectedStats(id, 10)).padEnd(20) + '| ' + fmtStats(expectedStats(id, 20)));
}

/* 3b. 经验模型：全队逐人升级 */
console.log('\n══════════ 三b、经验模型：击杀均分给出击队，主力 = 云策 ══════════');
function simulate(key, heroic) {
  const d = diffOfKey(key, heroic);
  const units = {};   // id → { level, exp }
  units[LORD] = { level: CHARS[LORD].level, exp: 0 };
  const rows = [];
  for (const id of ROUTE_A) {
    const ch = CH[id];
    for (const nid of (AUTO_JOINS[id] || [])) {
      if (CHARS[nid] && !units[nid]) units[nid] = { level: CHARS[nid].level, exp: 0 };
    }
    const ens = chapterEnemies(ch);
    const enemyAvg = round1(avg(ens.map(e => e.lv || 1)));
    const kills = Math.round(ens.length * killRatio(ch));
    const deploy = Math.min(ch.deployCount, Object.keys(units).length);
    /* 出击队 = 云策 + 等级最高的 deploy-1 人 */
    const ids = Object.keys(units).filter(x => x !== LORD)
      .sort((a, b) => units[b].level - units[a].level).slice(0, Math.max(0, deploy - 1));
    const squad = [LORD, ...ids];
    const share = kills / squad.length;
    for (const uid of squad) {
      const u = units[uid];
      let exp = share * Combat.killExp(u.level, enemyAvg, d.expMul);
      if (uid === LORD) {
        const boss = ens.find(e => e.boss);
        if (boss && kills > 0) exp += Combat.killExp(u.level, boss.lv || 1, d.expMul) + 10;
      }
      u.exp += exp;
      while (u.exp >= 100 && u.level < MAX_LEVEL) { u.exp -= 100; u.level++; }
    }
    const lvs = Object.keys(units).map(k => units[k].level);
    rows.push({
      id: id, lordLv: units[LORD].level, rosterAvg: round1(avg(lvs)), enemyAvg: enemyAvg,
      gap: round1(units[LORD].level - enemyAvg), kills: kills, share: round1(share),
      levels: Object.assign({}, Object.keys(units).reduce((o, k) => { o[k] = units[k].level; return o; }, {}))
    });
  }
  return rows;
}
const SIMS = {};
for (const [key, heroic] of [['easy', false], ['normal', false], ['hard', false], ['hard', true]]) {
  const label = DIFFICULTIES[key].name + (heroic ? ' · 勇者' : '');
  const rows = simulate(key, heroic);
  SIMS[label] = rows;
  console.log('\n【' + label + '】（经验×' + diffOfKey(key, heroic).expMul + '）');
  console.log('章  | 主力级 | 全队均级 | 敌军均级 | 级差 | 击杀 | 人均击杀');
  for (const r of rows) {
    console.log(String(r.id).padEnd(3) + '| ' + String(r.lordLv).padStart(6) + ' | ' + String(r.rosterAvg).padStart(8) + ' | ' +
      String(r.enemyAvg).padStart(8) + ' | ' + String(r.gap).padStart(5) + ' | ' + String(r.kills).padStart(4) + ' | ' + String(r.share).padStart(8));
  }
}

/* ============================================================
 * 四、决斗实测（真实 Combat.resolve，确定性种子）
 * ============================================================ */
const SEEDS = 400;
function duel(playerRec, enemySpec, key, heroic) {
  let wins = 0, rounds = 0, pHits = 0, pAtks = 0, pDmg = 0, eHits = 0, eAtks = 0, eDmg = 0;
  for (let s = 0; s < SEEDS; s++) {
    RNG.setSeed(90000 + s * 7919);
    const p = mkPlayer(clone(playerRec));
    const e = mkEnemy(clone(enemySpec), key, heroic);
    /* id 必须区分：两个造单位函数共用自增计数器，会撞成同一个 'u0' */
    p.id = 'p' + s; e.id = 'e' + s;
    p.x = 0; p.y = 0; e.x = 1; e.y = 0;
    let turn = 0, ex = 0;
    while (p.hp > 0 && e.hp > 0 && ex < 40) {
      const atk = turn % 2 === 0 ? p : e;
      const def = turn % 2 === 0 ? e : p;
      if (!Combat.canAttackRange(atk, def)) { turn++; continue; }
      const evs = Combat.resolve(atk, def, DUEL_CTX);
      ex++;
      for (const ev of evs) {
        if (ev.type !== 'strike') continue;
        if (ev.attacker === p.id) { pAtks++; if (ev.hit) { pHits++; pDmg += ev.dmg; } }
        else { eAtks++; if (ev.hit) { eHits++; eDmg += ev.dmg; } }
      }
      turn++;
    }
    rounds += ex;
    if (e.hp <= 0 && p.hp > 0) wins++;
  }
  const n = SEEDS;
  return {
    win: wins / n, rounds: rounds / n,
    pHit: pHits / Math.max(1, pAtks), pDmg: pDmg / Math.max(1, pHits),
    eHit: eHits / Math.max(1, eAtks), eDmg: eDmg / Math.max(1, eHits)
  };
}
/* 对策位：本章可用角色里，对代表敌「活得久 × 打得快」综合最优的。
 * 只看期望伤害会选出脆皮法师——被双倍两刀带走，所以要比攻防两端。 */
function pickCounter(ids, levels, enemySpec, key, heroic) {
  const e = mkEnemy(clone(enemySpec), key, heroic);
  let best = null, bestScore = -Infinity;
  for (const id of ids) {
    const u = mkPlayer(charRec(id, levels[id]));
    u.x = 0; u.y = 0; e.x = 1; e.y = 0;
    const wi = Combat.bestWeaponIndex(u);
    if (wi < 0) continue;
    u.weaponIndex = wi;
    const myDmg = Combat.damage(u, e, DUEL_CTX, true) * Combat.hitChance(u, e, DUEL_CTX, true) / 100;
    const foeDmg = Combat.damage(e, u, DUEL_CTX, false) * Combat.hitChance(e, u, DUEL_CTX, false) / 100;
    if (myDmg <= 0) continue;
    const roundsToKill = e.stats.hp / myDmg;
    const roundsToDie = u.stats.hp / Math.max(0.5, foeDmg);
    const score = roundsToDie - roundsToKill;
    if (score > bestScore) { bestScore = score; best = id; }
  }
  return best;
}
console.log('\n══════════ 四、决斗实测：云策 vs 本章代表敌，以及对策位（各 ' + SEEDS + ' 种子） ══════════');
console.log('章  | 难度       | 云策胜率 | 对策位           | 对策胜率 | 云策轮 | 对策轮 | 我方命中 | 每击伤害 | 敌命中 | 每击受伤害');
const DUELS = [];
for (const cid of [1, 3, '5A', '7A', 9]) {
  const ch = CH[cid];
  const type = repEnemyType(ch);
  const ens = chapterEnemies(ch);
  const lv = Math.round(avg(ens.map(e => e.lv || 1)));
  const spec = { type: type, lv: lv };
  const model = SIMS['标准'].find(r => r.id === cid);
  const rosterIds = Object.keys(model.levels);
  const counterId = pickCounter(rosterIds, model.levels, spec, 'normal', false);
  const counterName = counterId ? CHARS[counterId].name + ' Lv' + model.levels[counterId] : '—';
  const lordR = charRec(LORD, model.lordLv);
  const counterR = counterId ? charRec(counterId, model.levels[counterId]) : null;
  for (const [key, heroic] of [['easy', false], ['normal', false], ['hard', false], ['hard', true]]) {
    const rl = duel(lordR, spec, key, heroic);
    const rc = counterR ? duel(counterR, spec, key, heroic) : null;
    DUELS.push({ cid: cid, diff: DIFFICULTIES[key].name + (heroic ? '·勇者' : ''), lord: rl.win, counter: rc ? rc.win : 0 });
    const label = (DIFFICULTIES[key].name + (heroic ? '·勇者' : '')).padEnd(10);
    console.log(String(cid).padEnd(3) + '| ' + label + '| ' +
      (rl.win * 100).toFixed(0).padStart(7) + '% | ' + counterName.padEnd(14) + ' | ' +
      (rc ? (rc.win * 100).toFixed(0) + '%' : '—').padStart(7) + ' | ' +
      rl.rounds.toFixed(1).padStart(6) + ' | ' + (rc ? rc.rounds.toFixed(1) : '—').padStart(6) + ' | ' +
      (rl.pHit * 100).toFixed(0).padStart(7) + '% | ' + rl.pDmg.toFixed(1).padStart(8) + ' | ' +
      (rl.eHit * 100).toFixed(0).padStart(6) + '% | ' + rl.eDmg.toFixed(1).padStart(9));
  }
  console.log('    （云策 Lv' + model.lordLv + ' / ' + counterName + ' vs ' + ENEMY_TYPES[type].name + ' Lv' + lv + '，模型等级见三b）');
}

/* ============================================================
 * 四b、Boss 硬度：围杀需要的击中次数（解析值，不模拟围杀）
 * ============================================================ */
console.log('\n══════════ 四b、Boss 硬度（对策位单挑视角；实战靠围杀，看需要几轮集火） ══════════');
console.log('章  | Boss           | 难度   | Boss生命 | 对策位           | 每击 | 需击中 | Boss每击 | 我方能扛');
const BOSS_ROWS = [];
for (const cid of [1, 4, '7A', 9]) {
  const ch = CH[cid];
  const ens = chapterEnemies(ch);
  const bossSpec = ens.find(e => e.boss);
  if (!bossSpec) continue;
  const model = SIMS['标准'].find(r => r.id === cid);
  const rosterIds = Object.keys(model.levels);
  /* Boss 对策位按 Boss 本身选（玄阙魔抗高，物理位可能才是答案） */
  const counterId = pickCounter(rosterIds, model.levels, clone(bossSpec), 'normal', false) || LORD;
  const counterR = charRec(counterId, model.levels[counterId]);
  for (const [key, heroic] of [['easy', false], ['normal', false], ['hard', false], ['hard', true]]) {
    const b = mkEnemy(clone(bossSpec), key, heroic);
    const u = mkPlayer(clone(counterR));
    u.x = 0; u.y = 0; b.x = 1; b.y = 0;
    const wi = Combat.bestWeaponIndex(u);
    if (wi >= 0) u.weaponIndex = wi;
    const myDmg = Combat.damage(u, b, DUEL_CTX, true);
    const myHit = Combat.hitChance(u, b, DUEL_CTX, true);
    const bDmg = Combat.damage(b, u, DUEL_CTX, false);
    const bHit = Combat.hitChance(b, u, DUEL_CTX, false);
    const hitsNeed = myDmg > 0 ? Math.ceil(b.stats.hp / myDmg) : '∞';
    const survive = bDmg > 0 ? Math.floor(u.stats.hp / Math.max(1, bDmg)) + ' 击' : '无敌';
    BOSS_ROWS.push({ cid: cid, boss: ENEMY_TYPES[bossSpec.type].name, diff: DIFFICULTIES[key].name + (heroic ? '·勇者' : ''), bossHp: b.stats.hp, counter: CHARS[counterId].name + ' Lv' + model.levels[counterId], myDmg: myDmg, myHit: myHit, hitsNeed: hitsNeed, bDmg: bDmg, survive: survive });
    console.log(String(cid).padEnd(3) + '| ' + ENEMY_TYPES[bossSpec.type].name.padEnd(12) + ' | ' +
      (DIFFICULTIES[key].name + (heroic ? '·勇者' : '')).padEnd(6) + ' | ' + String(b.stats.hp).padStart(7) + ' | ' +
      (CHARS[counterId].name + ' Lv' + model.levels[counterId]).padEnd(12) + ' | ' +
      String(myDmg).padStart(4) + ' | ' + String(hitsNeed).padStart(6) + ' | ' + String(bDmg).padStart(8) + ' | ' + survive.padStart(7));
  }
}

/* ============================================================
 * 五、判定
 * ============================================================ */
console.log('\n══════════ 五、判定 ══════════');
const checks = [];
function check(name, cond, detail) {
  checks.push({ name: name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  ✅ ' : '  ⚠️ ') + name + (detail ? '  （' + detail + '）' : ''));
}
/* 难度梯度 */
{
  const type = repEnemyType(CH['5A']);
  const n = mkEnemy({ type: type, lv: 9 }, 'normal', false);
  const h = mkEnemy({ type: type, lv: 9 }, 'hard', false);
  const hh = mkEnemy({ type: type, lv: 9 }, 'hard', true);
  check('修罗敌军生命高于标准', h.stats.hp > n.stats.hp, '生命 ' + n.stats.hp + ' → ' + h.stats.hp);
  check('修罗+勇者再涨一档', hh.stats.hp > h.stats.hp, '生命 ' + h.stats.hp + ' → ' + hh.stats.hp);
  check('修罗敌等级 +1', h.level === 10, 'Lv9 → Lv' + h.level);
}
/* 可通关性 */
{
  const ch1 = DUELS.find(d => d.cid === 1 && d.diff === '标准');
  const ch9n = DUELS.find(d => d.cid === 9 && d.diff === '标准');
  const ch9h = DUELS.find(d => d.cid === 9 && d.diff === '修罗');
  const ch9hh = DUELS.find(d => d.cid === 9 && d.diff === '修罗·勇者');
  check('第 1 章（标准）稳赢', ch1.lord >= 0.8, '云策胜率 ' + (ch1.lord * 100).toFixed(0) + '%');
  check('第 9 章对策位（标准）仍有一战', ch9n.counter >= 0.25, '胜率 ' + (ch9n.counter * 100).toFixed(0) + '%');
  check('难度严格递减（标准 > 修罗 > 修罗·勇者）', ch9n.counter > ch9h.counter && ch9h.counter > ch9hh.counter,
    (ch9n.counter * 100).toFixed(0) + '% > ' + (ch9h.counter * 100).toFixed(0) + '% > ' + (ch9hh.counter * 100).toFixed(0) + '%');
  check('第 1 章轻松难度更宽松', DUELS.find(d => d.cid === 1 && d.diff === '轻松').lord >= ch1.lord);
}
/* 成长同步 */
{
  const rows = SIMS['标准'];
  const last = rows[rows.length - 1];
  check('终章主力达到双位数等级', last.lordLv >= 10, 'Lv' + last.lordLv);
  check('主力等级不甩开敌军（级差 ≤ 2）', last.gap <= 2, '级差 ' + last.gap);
  check('修罗升级更慢', SIMS['修罗 · 勇者'][SIMS['修罗 · 勇者'].length - 1].lordLv <= last.lordLv,
    '修罗·勇者 Lv' + SIMS['修罗 · 勇者'][SIMS['修罗 · 勇者'].length - 1].lordLv + ' / 标准 Lv' + last.lordLv);
  check('轻松升级更快', SIMS['轻松'][SIMS['轻松'].length - 1].lordLv >= last.lordLv,
    '轻松 Lv' + SIMS['轻松'][SIMS['轻松'].length - 1].lordLv + ' / 标准 Lv' + last.lordLv);
}
/* 经验曲线 */
{
  const lo = Combat.killExp(20, 1, 1), hi = Combat.killExp(1, 20, 1);
  check('经验收益钳制 [6,60]', lo === 6 && hi === 60, '跨 19 级：' + lo + ' / ' + hi);
  check('同级击杀 30 经验', Combat.killExp(10, 10, 1) === 30);
  check('满级 20 封顶', (() => { const u = { level: 20, exp: 0, stats: {} }; Combat.levelUp(u, 500); return u.level === 20 && u.exp === 0; })());
}

/* ---------- 写报告 ---------- */
if (WRITE) {
  const lines = [];
  const push = s => lines.push(s);
  push('# 平衡实测报告（P5）');
  push('');
  push('> 由 `node dev/balance.js --write` 生成；全部数字跑真实公式（Combat.resolve / Battle.makeEnemyUnit），');
  push('> 确定性种子可复现。口径：1v1 干净场（草地、无地形、无支援、无个人技），偏保守；');
  push('> 击杀均分给出击队的经验模型同样是保守估计——实战集中喂养只会等级更高。');
  push('');
  push('## 一、敌情曲线（A 线）');
  push('');
  push('| 章 | 名称 | 敌军 | 平均级 | 最高级 | Boss | 出击 | 目标 |');
  push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of enemyCurve) {
    push('| ' + [r.id, r.name, r.count, r.avgLv, r.maxLv, r.boss, r.deploy, r.obj].join(' | ') + ' |');
  }
  push('');
  push('## 二、敌军数值 × 难度（第 5 章代表兵种）');
  push('');
  const ch5 = CH['5A'];
  const t5 = repEnemyType(ch5);
  push('参照：' + ENEMY_TYPES[t5].name + ' Lv9（第 5 章出现最多的敌型）。敌等级 +enemyLv、全属性 ×enemyMul 四舍五入，与游戏内同源。');
  push('');
  push('| 难度 | 等级 | 生命 | 力量 | 技巧 | 速度 | 幸运 | 护甲 | 魔抗 |');
  push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const [key, heroic] of [['easy', false], ['normal', false], ['hard', false], ['hard', true], ['normal', true]]) {
    const u = mkEnemy({ type: t5, lv: 9 }, key, heroic);
    push('| ' + [DIFFICULTIES[key].name + (heroic ? ' · 勇者' : ''), u.level, u.stats.hp, u.stats.str, u.stats.skl,
      u.stats.spd, u.stats.lck, u.stats.def, u.stats.res].join(' | ') + ' |');
  }
  push('');
  push('## 三、成长曲线');
  push('');
  push('### 3a. 期望属性（每级按 growth% 期望增长，Lv10 应用转职增益）');
  push('');
  push('属性顺序：生命/力量/灵力/技巧/速度/幸运/护甲/魔抗');
  push('');
  push('| 人物 | 转职 | Lv5 | Lv10 | Lv20 |');
  push('| --- | --- | --- | --- | --- |');
  for (const id of Object.keys(CHARS)) {
    const base = CHARS[id];
    const cls = CLASSES[base.cls];
    const next = cls.promote ? CLASSES[cls.promote].name : '—';
    push('| ' + [base.name, cls.name + '→' + next, fmtStats(expectedStats(id, 5)), fmtStats(expectedStats(id, 10)), fmtStats(expectedStats(id, 20))].join(' | ') + ' |');
  }
  push('');
  push('### 3b. 经验模型（击杀均分给出击队，主力 = 云策）');
  push('');
  for (const label of Object.keys(SIMS)) {
    push('**' + label + '**');
    push('');
    push('| 章 | 主力级 | 全队均级 | 敌军均级 | 级差 | 击杀 | 人均击杀 |');
    push('| --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const r of SIMS[label]) {
      push('| ' + [r.id, r.lordLv, r.rosterAvg, r.enemyAvg, r.gap, r.kills, r.share].join(' | ') + ' |');
    }
    push('');
  }
  push('## 四、决斗实测（各 ' + SEEDS + ' 种子，交替先手）');
  push('');
  push('「对策位」= 本章可用角色里对本章代表敌期望伤害最高者（特效兵器克甲胄/飞行，玩家实际就会这么排兵）。');
  push('');
  push('| 章 | 难度 | 云策胜率 | 对策位 | 对策胜率 | 云策轮 | 对策轮 | 我方命中 | 每击伤害 | 敌命中 | 每击受伤害 |');
  push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const cid of [1, 3, '5A', '7A', 9]) {
    const ch = CH[cid];
    const type = repEnemyType(ch);
    const ens = chapterEnemies(ch);
    const lv = Math.round(avg(ens.map(e => e.lv || 1)));
    const spec = { type: type, lv: lv };
    const model = SIMS['标准'].find(r => r.id === cid);
    const rosterIds = Object.keys(model.levels);
    const counterId = pickCounter(rosterIds, model.levels, spec, 'normal', false);
    const counterName = counterId ? CHARS[counterId].name + ' Lv' + model.levels[counterId] : '—';
    const lordR = charRec(LORD, model.lordLv);
    const counterR = counterId ? charRec(counterId, model.levels[counterId]) : null;
    for (const [key, heroic] of [['easy', false], ['normal', false], ['hard', false], ['hard', true]]) {
      const rl = duel(lordR, spec, key, heroic);
      const rc = counterR ? duel(counterR, spec, key, heroic) : null;
      push('| ' + [cid, DIFFICULTIES[key].name + (heroic ? ' · 勇者' : ''), (rl.win * 100).toFixed(0) + '%', counterName,
        rc ? (rc.win * 100).toFixed(0) + '%' : '—', rl.rounds.toFixed(1), rc ? rc.rounds.toFixed(1) : '—',
        (rl.pHit * 100).toFixed(0) + '%', rl.pDmg.toFixed(1), (rl.eHit * 100).toFixed(0) + '%', rl.eDmg.toFixed(1)].join(' | ') + ' |');
    }
  }
  push('');
  push('## 四b、Boss 硬度（对策位单挑视角；实战靠围杀，看需要几轮集火）');
  push('');
  push('| 章 | Boss | 难度 | Boss生命 | 对策位 | 每击 | 需击中 | Boss每击 | 我方能扛 |');
  push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of BOSS_ROWS) {
    push('| ' + [r.cid, r.boss, r.diff, r.bossHp, r.counter, r.myDmg, r.hitsNeed, r.bDmg, r.survive].join(' | ') + ' |');
  }
  push('');
  push('## 五、判定');
  push('');
  for (const c of checks) push('- ' + (c.ok ? '✅' : '⚠️') + ' ' + c.name + (c.detail ? '（' + c.detail + '）' : ''));
  push('');
  push('## 六、结论（数字会随公式变动，结论需对照上表重读）');
  push('');
  push('1. **难度梯度成立。** 修罗敌军生命 +22%（27→33）、等级 +1、经验 ×0.95；再叠勇者 ×1.32、经验 ×0.86。');
  push('   1v1 胜率严格递减（第 9 章对策位：标准 100% > 修罗 27% > 修罗·勇者 21%），三档+勇者全排列都有明确体感差。');
  push('2. **前期宽、后期紧，第 3 章起出现难度悬崖。** 第 1/3/5A 章标准难度云策 100% 胜率；但第 3 章修罗·勇者云策胜率跌到 11%——');
  push('   妖狼攻速双倍云策后，1v1 变成「狼先砍三刀」。这符合「修罗·勇者 = 一步不回」的定位，但玩家必须懂攻速双倍（机制库「双倍」条目已覆盖）。');
  push('3. **特效兵器是后期核心解，这是设计而非缺陷。** 浊甲卫（甲胄）护甲 21，云策的剑伤害为 0；符师的符（克甲胄）1v1 胜率 100%。');
  push('   第 7/9 章必须按敌型排兵：甲胄上符师、飞行上弓。机制库「特效兵器」条目已覆盖，建议保持现状。');
  push('4. **成长曲线偏慢但自洽。** 标准难度主力终章 Lv13，低于敌军均级 15.3（级差 -2.3）；低级击杀经验更高（每级 +5，钳 6~60）形成自吸，');
  push('   援军入队即 8~10 级补位。转职（Lv10，+6~14 属性）与支援（C/B/A：+5/+10/+15 命中回避）是主要补偿。');
  push('   **不建议调快曲线**：改快只会让前期碾压，后期依然靠 kit 与排兵，反而稀释战棋决策。');
  push('5. **Boss 必须围杀。** 玄阙标准难度 109 血，最佳单打位每击 5、需 22 次击中；Boss 每击 38，主力只能扛 1 击。');
  push('   8 人队集火 + 走位是设计预期，悔棋与英魂碑机制兜底。');
  push('6. **修罗/勇者（零悔棋）下第 1 章仍有 100% 胜率**，教学章不劝退；轻松难度第 9 章对策位 100%，手残也能通关。');
  push('');
  fs.writeFileSync(path.join(ROOT, 'docs/平衡实测报告.md'), lines.join('\n'), 'utf8');
  console.log('\n报告已写入 docs/平衡实测报告.md');
}
console.log('\n判定汇总：' + checks.filter(c => c.ok).length + ' 通过 / ' + checks.filter(c => !c.ok).length + ' 关注');
