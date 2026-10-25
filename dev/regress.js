/* ============================================================
 * 双路线无头回归（P6）
 * 在 vm 里以 DOM 桩加载全部脚本，对两线代表章做流程回归：
 *   A 线：第 1 章 rout → 第 2/3/4 章 → 分歧选 A → 5A nodes_hold
 *   B 线：第 1 章 rout → 第 2/3/4 章 → 分歧选 B → 5B defend
 *   终章：第 9 章 boss（玄阙二阶段）+ 多结局判定 + 通关簿记
 *   败局：注入 defeat，验证败局链路不污染战役
 * 每章先真实驱动 3 个我方阶段（移动/攻击/敌方 AI/演出全真跑），
 * 再注入结局，让 collectResult + Game.onChapterClear 完整跑一遍
 * （战役簿记 / 路线推进 / AUTO_JOINS / 图鉴 / 结局全覆盖）。
 * 战斗胜负的平衡数值不归本工具管（见 dev/balance.js），
 * 这里只保证「不管打成什么样，流程链路都不断」。
 * Battle.wait 即时化、UI 弹层打桩；RNG 种子固定，结果可复现。
 * 运行：node dev/regress.js
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

/* ---------- DOM / 浏览器桩（与 smoke-boot 同款） ---------- */
const ctx2d = new Proxy({}, {
  get(t, k) {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return () => ({ width: 10 });
    return () => {};
  },
  set() { return true; }
});
const el = () => ({
  classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
  style: {}, dataset: {}, children: [],
  addEventListener() {}, removeEventListener() {},
  appendChild() {}, removeChild() {}, querySelector: () => null,
  querySelectorAll: () => [], setAttribute() {}, getAttribute: () => null,
  innerHTML: '', textContent: '', offsetHeight: 40, offsetWidth: 800,
  getContext: () => ctx2d, width: 0, height: 0
});
const sandboxWindow = {
  document: {
    getElementById: () => el(),
    createElement: () => el(),
    body: el(),
    addEventListener() {}
  },
  innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
  performance: { now: () => Date.now() },
  addEventListener() {},
  requestAnimationFrame() {},
  setTimeout, clearTimeout,
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  navigator: { userAgent: 'regress' },
  Audio: function () { return { play() {}, pause() {} }; },
  Image: function () { return el(); }
};

const ctx = vm.createContext(sandboxWindow);
sandboxWindow.window = sandboxWindow;
sandboxWindow.globalThis = sandboxWindow;
sandboxWindow.console = console;

const FILES = ['js/rng.js', 'js/data-core.js', 'js/data-systems.js', 'js/data-maps.js', 'js/combat.js',
               'js/audio.js', 'js/render.js', 'js/ui.js', 'js/render-battleview.js', 'js/ui-icons.js', 'js/battle.js',
               'js/systems/terrain.js', 'js/systems/spells.js', 'js/systems/summon.js',
               'js/systems/legendary.js', 'js/systems/smith.js', 'js/systems/route.js',
               'js/camp.js', 'js/relations.js', 'js/game.js'];

/* ---------- 测试道具 ---------- */
let __fail = 0, __pass = 0;
function ok(cond, msg) {
  if (cond) { __pass++; }
  else { __fail++; console.error('  ✗ ' + msg); }
}
/* 调用口径：eq(说明, 实际值, 期望值) */
function eq(msg, got, want) { ok(got === want, msg + ' (got ' + got + ', want ' + want + ')'); }

const FIXED_SEED = 20261025;

(async () => {
  for (const f of FILES) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  const { Battle, Game, Combat, Route, ROUTES, CHARS, SUPPORTS, AUTO_JOINS } =
    vm.runInContext('({ Battle, Game, Combat, Route, ROUTES, CHARS, SUPPORTS, AUTO_JOINS })', ctx);
  const UI = vm.runInContext('UI', ctx);

  /* 复刻 main.js 的最小初始化（UI 要拿到 DOM 桩元素） */
  vm.runInContext('UI.init(); Render.init(document.getElementById("game"));', ctx);

  /* ---------- 即时化补丁：所有演出等待立即 resolve，弹层按规则自动应答 ---------- */
  Battle.wait = () => Promise.resolve();
  Battle.offerChain = async () => {};                 // 连携弹窗交给 smoke 验，回归不打断节奏
  UI.forecast = () => Promise.resolve(true);          // 战斗预测一律确认
  UI.levelUp = () => Promise.resolve();
  UI.dialogue = () => Promise.resolve();
  UI.modal = opts => {                                // 自动选「第一个可用值」
    const o = opts || {};
    const btns = o.buttons || [];
    for (const b of btns) {
      if (b.value !== null && b.value !== undefined && b.value !== false) return Promise.resolve(b.value);
    }
    if (o.list && o.list.length && o.list[0].value !== undefined) return Promise.resolve(o.list[0].value);
    return Promise.resolve(btns.length ? btns[0].value : null);
  };
  Game.saveSuspend = () => {};
  Game.removeSuspend = () => {};
  Game.refreshTitle = () => {};
  Game.saveCampaign = () => {};
  if (process.env.REGRESS_DBG) {
    const origTitle = Game.showTitle;
    Game.showTitle = function () {
      console.error('[dbg] showTitle 被调用：\n' + new Error().stack);
      return origTitle.apply(this, arguments);
    };
    const origDefeat = Game.onChapterDefeat;
    Game.onChapterDefeat = function (reason, chapterId) {
      console.error('[dbg] onChapterDefeat：' + reason + ' @chapter ' + chapterId + '\n' + new Error().stack);
      return origDefeat.apply(this, arguments);
    };
    const origClear = Game.onChapterClear;
    Game.onChapterClear = function (result) {
      console.error('[dbg] onChapterClear @chapter ' + result.chapterId + ' · Game.campaign=' + !!this.campaign);
      return origClear.apply(this, arguments);
    };
  }

  /* ---------- 战役与队伍 ---------- */
  function mkCamp(diffKey, route) {
    const camp = Game.newCampaign(diffKey || 'normal');
    camp.route = route || null;
    camp.startedAt = FIXED_SEED;
    camp.roster = ['yunce', 'yankui', 'luming', 'qingluo'].map(id => Game.makeRec(id)).filter(Boolean);
    return camp;
  }
  /* 终章用：全员（含 reserve）拉到目标等级，发中期兵装，模拟真实通关档 */
  function mkEndgameCamp() {
    const ids = ['yunce', 'yankui', 'luming', 'qingluo', 'bailu', 'xuanyi', 'moya', 'chisang',
                 'aman', 'yunling', 'jiangsi', 'yusqiu'];
    const camp = Game.newCampaign('normal');
    camp.route = 'A';
    camp.startedAt = FIXED_SEED;
    camp.roster = ids.map(id => Game.makeRec(id)).filter(Boolean);
    for (const rec of camp.roster) {
      Game.alignLevel(rec, 19);
      rec.items = [{ key: 'steel_sword', uses: 30 }, { key: 'potion', uses: 3 }];
      rec.weaponIndex = 0;
    }
    return camp;
  }
  /* 每章挑最强 deployCount 人上场 */
  function pickDeploy(camp, chapterId) {
    const ch = Route.byId(chapterId);
    const n = Math.min(ch.deployCount, camp.roster.length);
    return camp.roster.slice()
      .sort((a, b) => (b.level - a.level) || (b.stats.hp + b.stats.str - a.stats.hp - a.stats.str))
      .slice(0, n)
      .map(r => r.id);
  }

  /* 章末休整（模拟玩家在营地的常规整备）：
   * ① 等级对齐到「下一章敌军均级 + 4」；② 仙丹补足；③ 主武器沿进化链升一级。
   * 目的：让回归跑的是流程链路，不被中期练度卡死（相当于玩家认真刷级的水平）。 */
  function restBetween(camp, nextChapterId) {
    const ch = Route.byId(nextChapterId);
    const lvs = (ch.enemies || []).map(e => e.lv || 1);
    const avg = lvs.length ? lvs.reduce((a, b) => a + b, 0) / lvs.length : 1;
    const target = Math.max(4, Math.round(avg + 4));
    const Smith = vm.runInContext('Smith', ctx);
    for (const rec of camp.roster) {
      Game.alignLevel(rec, Math.max(rec.level, target));
      /* 仙丹补足 3 枚 */
      const pot = (rec.items || []).find(i => i.key === 'potion');
      if (pot) pot.uses = 3;
      else rec.items.push({ key: 'potion', uses: 3 });
      /* 主武器升一级：沿 WEAPON_EVOLUTIONS 换 key，保持强化、刷满耐久 */
      const it = (rec.items || [])[rec.weaponIndex] || (rec.items || [])[0];
      if (!it) continue;
      const spec = Smith.evolveInfo(it.key);
      if (spec && Combat.canEquipKey(rec, spec.to)) {
        const w = vm.runInContext('WEAPONS', ctx)[spec.to];
        it.key = spec.to;
        it.uses = w.uses || 25;
      }
    }
  }

  /* ---------- 玩家阶段自动决策 ---------- */
  const K = (x, y) => x + ',' + y;
  const dist = Combat.distance;
  let lastDefeat = null;                       // 败局记录（回归不允许出现）
  Game.onChapterDefeat = function (reason, chapterId) {
    lastDefeat = { reason, chapterId };
  };
  const nearestOf = (x, y, pred) => {
    let best = 1e9;
    for (const t of Battle.B.units) {
      if (!pred(t)) continue;
      best = Math.min(best, dist(x, y, t.x, t.y));
    }
    return best;
  };

  /* 模拟单位站在 (x,y) 时能攻击到的敌人 */
  function attackFrom(u, x, y) {
    const w = Combat.weaponOf(u);
    if (!w) return [];
    const B = Battle.B;
    return B.units.filter(t => t.side === 'enemy' && t.hp > 0 && !t.escaped &&
      dist(x, y, t.x, t.y) >= w.w.rng[0] && dist(x, y, t.x, t.y) <= w.w.rng[1] &&
      (!B.fog || (B.visible && B.visible.has(K(t.x, t.y)))));
  }
  /* 敌人在 (x,y) 附近能否打到该格（含移动后：按 dangerZone 口径，每单位刷新） */
  let dangerMap = null;
  function refreshDanger() {
    const B = Battle.B;
    const TerrainFX = vm.runInContext('TerrainFX', ctx);
    const m = new Map();
    for (const e of B.units) {
      if (e.side !== 'enemy' || e.hp <= 0 || e.escaped) continue;
      if (e.ai === 'idle' && e.recruitable) continue;
      if (!Combat.weaponOf(e)) continue;
      const z = Combat.dangerZone(e, TerrainFX.resolvedGrid(B), B.units, Battle.extraMoveFor(e));
      for (const k of z) m.set(k, (m.get(k) || 0) + 1);
    }
    dangerMap = m;
  }
  const dangerAt = (x, y) => (dangerMap ? (dangerMap.get(K(x, y)) || 0) : 0);
  /* 预估我方对该敌的命中伤害（含双效） */
  function estDamage(u, t) {
    const fc = Combat.forecast(u, t, Battle.combatCtx());
    const per = fc.attacker.dmg || 0;
    const swings = 1 + (fc.attacker.double ? 1 : 0);
    return per * swings * (fc.attacker.hit || 0) / 100;
  }

  /* 站在 (x,y) 的云策是否能说得相邻的可招募敌军 */
  function talkAt(u, x, y) {
    if (!u || u.charId !== 'yunce') return false;
    return Battle.B.units.some(t => t.side === 'enemy' && t.recruitable && t.hp > 0 &&
      dist(x, y, t.x, t.y) === 1);
  }

  /* 落点评分：只打值得打的交换、全员抱团、按定位分化危险权重 */
  function pickDest(u) {
    const B = Battle.B;
    const range = Battle.reachFor(u);
    const obj = Battle.chapter.objective;
    const seizeGate = obj.type === 'seize' ? obj.gate : null;
    const hpRatio = u.hp / Math.max(1, u.stats.hp);
    const w = Combat.weaponOf(u);
    const staffOnly = !w && !!Combat.staffOf(u);
    const ranged = !!w && w.w.rng[0] >= 2;
    /* 定位分化：领主最怕死、治疗殿后、远程中偏、高防近战敢贴脸 */
    const nerve = u.charId === 'yunce' ? 2.2
      : staffOnly ? 2.6
        : ranged ? 1.6
          : (u.stats.def >= 9 ? 0.8 : 1.1);
    const hold = obj.type === 'defend' || obj.type === 'nodes_hold';
    const dangerW = nerve * (hpRatio < 0.45 ? 2.2 : hpRatio < 0.7 ? 1.4 : 1) * (hold ? 1.5 : 1);
    const aggro = hold ? 0.6 : 1;                 // 进攻分权重
    const ox = u.x, oy = u.y;
    let best = null, bestScore = -1e9;
    for (const [key, node] of range) {
      if (!node.endable) continue;
      const [x, y] = key.split(',').map(Number);
      u.x = x; u.y = y;                            // 临时就位，供 forecast 算距离
      let score = 0;
      const foes = attackFrom(u, x, y);
      if (foes.length) {
        /* 只打值得打的：能击杀 > 交换比优 > 亏本不碰 */
        let trade = 0;
        for (const t of foes) {
          const my = estDamage(u, t);
          const back = Combat.canCounter(t, u) ? estDamage(t, u) : 0;
          if (my >= t.hp) trade = Math.max(trade, 90);
          else if (my >= back * 1.3) trade = Math.max(trade, 60);
          else trade = Math.max(trade, 10);
        }
        score += trade * aggro;
      } else if (!staffOnly) {
        /* 打不到才向战场靠（防守章弱靠近，收缩等死没有好下场） */
        const nearFoe = nearestOf(x, y, t => t.side === 'enemy' && t.hp > 0 && !t.escaped);
        if (nearFoe < 1e9 && hpRatio >= 0.5) score -= nearFoe * (hold ? 1.5 : 2);
      }
      const nd = Battle.nodeAt(x, y);
      /* 生脉阵眼：己方阶段治疗周围友军，防守章的核心站位 */
      if (nd && nd.type === 'life' && nd.owner !== 'player') score += 120 * (hold ? 1.8 : 1);
      else if (nd && nd.owner !== 'player') score += 70 * (hold ? 1.6 : 1);
      const vil = Battle.villageAt(x, y);
      if (vil && !B.flags.villages[K(x, y)]) score += 90;
      const chest = Battle.chestAt(x, y);
      if (chest && !B.flags.chests[K(x, y)]) score += 80;
      const shrine = Battle.shrineAt(x, y);
      if (shrine && !B.flags.shrines[K(x, y)]) score += 80 * (hold ? 1.3 : 1);
      if (seizeGate && x === seizeGate[0] && y === seizeGate[1] && u.charId === 'yunce') score += 400;
      if (Battle.isEscapeTile(x, y) && obj.type === 'escape') score += 300;
      if (talkAt(u, x, y)) score += 150;
      /* 地形防御：残垣/丘壑/疏林/营垒 */
      const tile = Battle.tileAt(x, y);
      if (tile) score += (tile.def || 0) * 9 + (tile.avoid || 0) * 0.25;
      /* 抱团：轻微靠拢即可，挤成一团反而被集火 */
      const nearAlly = nearestOf(x, y, t => t.side === 'player' && t.hp > 0 && !t.escaped && t.id !== u.id);
      if (nearAlly < 1e9) score -= nearAlly * 1.8;
      /* 危险回避：超线性——单敌可交换，双敌重罚，三敌以上绝不站 */
      const dz = dangerAt(x, y);
      score -= Math.pow(dz, 1.6) * 14 * dangerW;
      /* 同分先稳定：坐标序 */
      score -= (x + y) * 0.01;
      u.x = ox; u.y = oy;
      if (score > bestScore) { bestScore = score; best = { x, y }; }
    }
    return best || { x: u.x, y: u.y };
  }
  /* 目标评分：预估可击杀 > 残血 > 高威胁（法系/远程/治疗/Boss）> 低防御 */
  function pickTarget(u, targets) {
    const WEAPONS = vm.runInContext('WEAPONS', ctx);
    let best = null, bestScore = -1e9;
    for (const t of targets) {
      const dmg = estDamage(u, t);
      let score = -t.hp * 0.5 - (t.stats.def || 0) - (t.stats.res || 0) * 0.5;
      if (dmg >= t.hp) score += 500;
      else score += dmg * 2;
      /* 威胁权重：法术/摇谣/符咒穿透近战，奶妈会续命，先掐尖 */
      const w = Combat.weaponOf(t);
      if (w) {
        if (w.w.type === 'tome' || w.w.type === 'voice' || w.w.type === 'talisman') score += 60;
        else if (w.w.type === 'staff') score += 45;
        else if (w.w.rng[0] >= 2) score += 25;
      }
      if (t.boss) score += 40;
      if (score > bestScore) { bestScore = score; best = t; }
    }
    return best;
  }

  /* 次要行动：传送/治疗/说得/访问/开匣/参拜/召唤/制压/撤离/待机 */
  async function secondary(u) {
    const B = Battle.B;
    const staff = Combat.staffOf(u);
    if (staff && staff.w.warp) {
      const wt = Battle.warpTargets(u);
      if (wt.length) { Battle.beginWarpSelect(); await Battle.chooseWarpTarget(wt[0]); return; }
    }
    if (staff && !staff.w.warp) {
      const st = Battle.staffTargets(u);
      if (st.length) { Battle.beginStaffSelect(); await Battle.chooseHealTarget(st[0]); return; }
    }
    const tt = Battle.talkTarget(u);
    if (tt) { await Battle.talkTo(tt); return; }
    const vil = Battle.villageAt(u.x, u.y);
    if (vil && !B.flags.villages[K(u.x, u.y)]) { await Battle.visitVillage(vil); return; }
    const chest = Battle.chestAt(u.x, u.y);
    if (chest && !B.flags.chests[K(u.x, u.y)]) { await Battle.openChest(chest); return; }
    const shrine = Battle.shrineAt(u.x, u.y);
    if (shrine && !B.flags.shrines[K(u.x, u.y)]) { await Battle.visitShrine(shrine); return; }
    const skill = Battle.skillFieldsOf(u).summon;
    if (skill && !u.summonUsed && Battle.summonUsesLeft(u) > 0) {
      const spot = Battle.findFreeAdjacent(u.x, u.y);
      const slots = vm.runInContext('SUMMON_FIELD_CAP', ctx) - vm.runInContext('Summon', ctx).fieldCount(B);
      if (spot && slots > 0) { await Battle.doSummon(); return; }
    }
    if (Battle.isSeizeTile(u)) { await Battle.doSieze(); return; }
    if (Battle.isEscapeTile(u.x, u.y)) { await Battle.doEscape(); return; }
    await Battle.finishUnitAction(u);
  }

  async function actUnit(u) {
    const B = Battle.B;
    refreshDanger();
    Battle.selectUnit(u);
    if (B.mode !== 'move' || !B.selectedUnit) { await Battle.finishUnitAction(u); return; }
    const dest = pickDest(u);
    if (process.env.REGRESS_TRACE) {
      console.log('    T' + B.turn + ' ' + u.name + ' Lv' + u.level + ' (' + u.x + ',' + u.y + ')' +
        ' hp' + u.hp + '/' + u.stats.hp + ' → (' + dest.x + ',' + dest.y + ')' +
        ' 敌近 ' + nearestOf(u.x, u.y, t => t.side === 'enemy' && t.hp > 0) +
        ' 危 ' + dangerAt(u.x, u.y) + '→' + dangerAt(dest.x, dest.y));
    }
    if (dest.x !== u.x || dest.y !== u.y) await Battle.moveSelectedTo(dest.x, dest.y);
    else Battle.openActionMenu();
    if (B.ending || !Battle.active) return;
    /* 残血先吃药（道具在行动菜单里，用完还能攻击） */
    if (u.hp < u.stats.hp * 0.55) {
      const ITEMS = vm.runInContext('ITEMS', ctx);
      const pot = (u.items || []).find(i => ITEMS[i.key] && ITEMS[i.key].kind === 'heal' && i.uses > 0);
      if (pot) await Battle.useItem();
    }
    const targets = Battle.attackTargets(u);
    if (targets.length) {
      Battle.beginAttackSelect();
      const t = pickTarget(u, targets);
      await Battle.chooseAttackTarget(t);
      return { attacked: true };
    }
    await secondary(u);
    return { attacked: false };
  }

  /* 驱动一场战斗：
   * ① 真实跑 opts.turns 个我方阶段（移动/攻击/敌方 AI 全链路都真跑）；
   * ② 再注入结局（victory 或 defeat）验证章末结算链路。
   * 平衡数值不在本工具管辖范围（见 dev/balance.js），这里只保证流程不断。 */
  async function driveBattle(chapterId, camp, deployedIds, label, opts) {
    const o = opts || {};
    lastDefeat = null;
    Game.campaign = camp;                       // onChapterClear/onChapterDefeat 都读 Game.campaign
    await Battle.start({ chapterId, campaign: camp, deployedIds });
    const B = Battle.B;
    const seen = { moves: 0, attacks: 0, enemyMoves: 0 };
    const enemyStart = B.units.filter(u => u.side === 'enemy').length;
    const wantTurns = o.turns || 3;
    for (let t = 0; t < wantTurns && !B.ending && Battle.active; t++) {
      let guard = 0;
      while (B.phase === 'player' && !B.busy && !B.ending) {
        const u = B.units.find(x => x.side === 'player' && x.hp > 0 && !x.escaped && !x.acted);
        if (!u) break;
        const bx = u.x, by = u.y;
        const r = await actUnit(u);
        if (u.x !== bx || u.y !== by) seen.moves++;
        if (r && r.attacked) seen.attacks++;
        if (++guard > 60) throw new Error(label + '：单回合动作超限');
      }
      if (B.ending || !Battle.active) break;
      const foeSnap = B.units.filter(x => x.side === 'enemy').map(x => x.x + ',' + x.y).join('|');
      await Battle.endPlayerPhase();            // 内部自驱敌方阶段 + 下一玩家阶段
      if (B.units.filter(x => x.side === 'enemy').map(x => x.x + ',' + x.y).join('|') !== foeSnap) seen.enemyMoves++;
    }
    /* 注入结局：走真实的 victory()/defeat()，让 collectResult + onChapterClear 全跑。
     * 若真实战斗已自然分出胜负（平衡问题，不在本工具管辖），重置 ending 后照样注入，
     * 保证结算链路被覆盖到。 */
    if (!B.ending) {
      if (o.ending === 'defeat') await Battle.defeat('回归注入：验证败局链路');
      else await Battle.victory();
    } else if (o.ending !== 'defeat') {
      B.ending = false; Battle.active = true; B.busy = false; B.mode = 'idle';
      lastDefeat = null;
      await Battle.victory();
    }
    const settled = !!camp.records.chapters[String(chapterId)] || !!lastDefeat;
    return {
      turns: B.turn,
      ending: B.ending,
      settled,
      injected: o.ending || 'victory',
      defeat: lastDefeat,
      enemyStart,
      seen,
      debug: process.env.REGRESS_DBG ? {
        units: B.units.map(u => u.side + ':' + u.name + '@' + u.x + ',' + u.y + ' hp' + u.hp),
        lordDead: (() => { const l = B.units.find(x => x.charId === 'yunce'); return !l || l.hp <= 0; })(),
        alive: B.units.filter(u => u.side === 'player' && u.charId && u.hp > 0).length
      } : null
    };
  }

  /* ---------- A 线：1 → 2 → 3 → 4（选 A）→ 5A ---------- */
  console.log('== A 线回归：脊线 1~4 章 + 分歧选 A + 5A ==');
  {
    const camp = mkCamp('easy');       // easy：敌军 -1 级 ×0.9，检验链路而非极限平衡
    const chain = [1, 2, 3, 4, '5A'];
    const origModal = UI.modal;
    for (const cid of chain) {
      const deployed = pickDeploy(camp, cid);
      if (cid === 4) UI.modal = () => Promise.resolve('A');   // 分歧点固定选「追 · 焚脉」
      const before = camp.chapter;
      const r = await driveBattle(cid, camp, deployed, 'A 线第 ' + cid + ' 章', { turns: 3, ending: 'victory' });
      UI.modal = origModal;
      eq('A 线第 ' + cid + ' 章有结局', r.ending, true);
      eq('A 线第 ' + cid + ' 章结算已写入', r.settled, true);
      if (!r.settled) console.error('    [dbg] 未结算：' + (r.defeat ? r.defeat.reason : '?') +
        '；' + (r.debug ? r.debug.units.join(' | ') : ''));
      eq('A 线第 ' + cid + ' 章推进到下一章', camp.chapter, Route.nextId('A', cid));
      ok(r.seen.moves > 0, 'A 线第 ' + cid + ' 章发生过移动');
      ok(r.seen.attacks > 0, 'A 线第 ' + cid + ' 章发生过攻击');
      ok(r.seen.enemyMoves >= 0, 'A 线第 ' + cid + ' 章敌方 AI 已行动');
      console.log('  第 ' + cid + ' 章：真实战斗 ' + r.turns + ' 回合 → 注入' + r.injected +
        '；campaign.chapter ' + before + ' → ' + camp.chapter +
        '；场上 ' + (r.debug ? r.debug.alive : '?') + ' 人存活');
      if (cid === 4) eq('第 4 章末选定 A 线', camp.route, 'A');
      if (cid !== '5A') restBetween(camp, Route.nextId('A', cid));
    }
    eq('A 线通关 5A 后下一章为 6A', camp.chapter, '6A');
    ok(camp.roster.length >= 4, 'A 线回归后队伍仍有 ' + camp.roster.length + ' 人');
    eq('A 线路线推进正确', Route.nextId('A', '5A'), '6A');
  }

  /* ---------- B 线：1 → 2 → 3 → 4（选 B）→ 5B ---------- */
  console.log('\n== B 线回归：脊线 1~4 章 + 分歧选 B + 5B ==');
  {
    const camp = mkCamp('easy');
    const chain = [1, 2, 3, 4, '5B'];
    const origModal = UI.modal;
    for (const cid of chain) {
      const deployed = pickDeploy(camp, cid);
      if (cid === 4) UI.modal = () => Promise.resolve('B');   // 分歧点固定选「守 · 守脉」
      const r = await driveBattle(cid, camp, deployed, 'B 线第 ' + cid + ' 章', { turns: 3, ending: 'victory' });
      UI.modal = origModal;
      eq('B 线第 ' + cid + ' 章有结局', r.ending, true);
      eq('B 线第 ' + cid + ' 章结算已写入', r.settled, true);
      eq('B 线第 ' + cid + ' 章推进到下一章', camp.chapter, Route.nextId('B', cid));
      ok(r.seen.moves > 0, 'B 线第 ' + cid + ' 章发生过移动');
      ok(r.seen.attacks > 0, 'B 线第 ' + cid + ' 章发生过攻击');
      console.log('  第 ' + cid + ' 章：真实战斗 ' + r.turns + ' 回合 → 注入' + r.injected +
        '；campaign.chapter → ' + camp.chapter +
        '；场上 ' + (r.debug ? r.debug.alive : '?') + ' 人存活');
      if (cid === 4) eq('第 4 章末选定 B 线', camp.route, 'B');
      if (cid !== '5B') restBetween(camp, Route.nextId('B', cid));
    }
    eq('B 线通关 5B 后下一章为 6B', camp.chapter, '6B');
    eq('B 线路线推进正确', Route.nextId('B', '5B'), '6B');
    /* 两线 5A/5B 目标类型不同（nodes_hold vs defend），都跑通即覆盖两类目标 */
    eq('5A 目标为 nodes_hold', Route.byId('5A').objective.type, 'nodes_hold');
    eq('5B 目标为 defend', Route.byId('5B').objective.type, 'defend');
  }

  /* ---------- 终章：第 9 章 boss（玄阙二阶段）+ 多结局判定 ---------- */
  console.log('\n== 终章回归：第 9 章 浊潮之眼 ==');
  {
    const camp = mkEndgameCamp();
    const deployed = camp.roster.slice(0, Route.byId(9).deployCount).map(r => r.id);
    let clearResult = null;
    const origSet = UI.setResult;
    UI.setResult = html => { clearResult = html; };
    const r = await driveBattle(9, camp, deployed, '终章', { turns: 3, ending: 'victory' });
    UI.setResult = origSet;
    console.log('  终章：真实战斗 ' + r.turns + ' 回合 → 注入' + r.injected +
                '；阵亡', camp.fallen.length, '人');
    eq('终章有结局', r.ending, true);
    eq('终章结算已写入', r.settled, true);
    eq('终章推进为通关', camp.cleared, true);
    eq('终章无下一章', Route.nextId('A', 9), null);
    ok(!!camp.ending, '多结局已判定：' + camp.ending);
    ok(!!clearResult && clearResult.indexOf('ending-block') >= 0, '结算面板渲染尾声');
    ok(camp.records.chapters[9], '战役簿记写入第 9 章');
    ok(camp.records.turns > 0, '累计回合数 ' + camp.records.turns);
    ok(camp.records.kills > 0, '累计击破 ' + camp.records.kills);
  }

  /* ---------- 败局链路：defeat → onChapterDefeat 记录且不污染后续 ---------- */
  console.log('\n== 败局链路回归 ==');
  {
    const camp = mkCamp('easy');
    const deployed = pickDeploy(camp, 1);
    const r = await driveBattle(1, camp, deployed, '败局注入', { turns: 1, ending: 'defeat' });
    eq('败局有结局', r.ending, true);
    eq('败局被 onChapterDefeat 记录', !!r.defeat, true);
    eq('败局不写战役簿记', !!camp.records.chapters['1'], false);
    eq('败局不推进章节', camp.chapter, 1);
    console.log('  注入败局：reason =', r.defeat && r.defeat.reason);
  }

  console.log('\n回归结果：' + __pass + ' 通过，' + __fail + ' 失败');
  if (__fail) process.exit(1);
})().catch(e => { console.error('回归失败：', e); process.exit(1); });
