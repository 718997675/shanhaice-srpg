/* ============================================================
 * 启动冒烟测试：在 vm 里以 DOM 桩加载全部脚本并完整跑一遍
 * Battle.start（含阶段开始、目标检查），抓引用错误/空值。
 * 运行：node dev/smoke-boot.js [sandbox]
 *   （无参 = 第 1 章正常战役；sandbox = dev/ice.html 的冰面沙盒）
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const useSandbox = process.argv[2] === 'sandbox';

/* ---------- DOM / 浏览器桩 ---------- */
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
  navigator: { userAgent: 'smoke' },
  Audio: function () { return { play() {}, pause() {} }; },
  Image: function () { return el(); }
};

const ctx = vm.createContext(sandboxWindow);
sandboxWindow.window = sandboxWindow;
sandboxWindow.globalThis = sandboxWindow;
sandboxWindow.console = console;

const FILES = ['js/rng.js', 'js/data-core.js', 'js/data-systems.js', 'js/data-maps.js', 'js/combat.js',
               'js/audio.js', 'js/render.js', 'js/ui.js', 'js/battle.js',
               'js/systems/terrain.js', 'js/systems/spells.js', 'js/systems/summon.js',
               'js/systems/legendary.js',
               'js/camp.js', 'js/game.js'];

(async () => {
  for (const f of FILES) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  }
  const { Battle, Game, TerrainFX, SAVE_VERSION, CHAPTERS } =
    vm.runInContext('({ Battle, Game, TerrainFX, SAVE_VERSION, CHAPTERS })', ctx);

  // 复刻 main.js 的最小初始化
  vm.runInContext('UI.init(); Render.init(document.getElementById("game"));', ctx);

  const camp = Game.newCampaign('normal');
  camp.roster = ['yunce', 'luming', 'qingluo'].map(id => Game.makeRec(id)).filter(Boolean);

  if (useSandbox) {
    const ICE_SANDBOX = {
      id: 0, name: '沙盒 · 冰面', theme: 'bamboo',
      objective: { type: 'rout', text: '测试滑行' },
      deployCount: 3,
      deployTiles: [[0, 6], [0, 7], [1, 6], [1, 7]],
      map: ['................', '................', '................', '................',
            '..I.............', '..I.............', '..IIIIIIIIIMII..', '................'],
      nodes: [], villages: [], chests: [], shrines: [],
      enemies: [{ type: 'bandit', lv: 1, x: 8, y: 6 }, { type: 'bandit', lv: 1, x: 12, y: 2 }],
      reinforcements: [], side: null, rewards: { gold: 0, items: [] },
      tips: '沙盒'
    };
    await Battle.start({ chapter: ICE_SANDBOX, chapterIndex: 0, campaign: camp, deployedIds: ['yunce', 'luming', 'qingluo'] });
  } else {
    await Battle.start({ chapterIndex: 1, campaign: camp, deployedIds: ['yunce', 'luming'] });
  }

  const B = Battle.B;
  console.log('启动成功：单位', B.units.length, '（我方', B.units.filter(u => u.side === 'player').length +
              ' / 敌方', B.units.filter(u => u.side === 'enemy').length + '）');
  console.log('地形动态层 overlays =', JSON.stringify(B.overlays));

  /* 动态层 + 滑行在真实状态上跑一遍 */
  const u = B.units.find(x => x.side === 'player');
  console.log('铺冰 (5,5)：', TerrainFX.set(B, 5, 5, 'I', 2));
  console.log('tileChar(5,5) =', Battle.tileChar(5, 5), ' tileAt.name =', Battle.tileAt(5, 5).name);

  // 序列化/回放（悔棋快照含动态层）
  const snap = Battle.serialize(false);
  console.log('快照 overlays 键数 =', Object.keys(snap.overlays || {}).length);
  Battle.applyState(JSON.parse(JSON.stringify(snap)));
  console.log('回放后 tileChar(5,5) =', Battle.tileChar(5, 5));

  // 沿冰道滑行结算（沙盒横道路径）
  const icePath = [{ x: 1, y: 6 }, { x: 2, y: 6 }];
  const sd = TerrainFX.slideDestination(B, icePath);
  console.log('滑行结算：', sd ? '(' + sd.x + ',' + sd.y + ')  经 ' + sd.path.length + ' 格' : 'null');

  // 阶段推进：到期清理
  B.turn = 2;
  const gone = TerrainFX.expire(B);
  console.log('第 2 回合到期清理：', gone.length, '层；tileChar(5,5) 恢复为', Battle.tileChar(5, 5));

  // 完整交互流：选单位 → 点冰面落点 → 弹确认 → 滑到终点
  if (useSandbox) {
    let mover = null;
    for (const cand of B.units.filter(x => x.side === 'player')) {
      if (Battle.reachFor(cand).has('2,6')) { mover = cand; break; }
    }
    console.log('选定可入冰单位：', mover ? mover.name + ' (' + mover.x + ',' + mover.y + ')' : '无');
    if (mover) {
      Battle.selectUnit(mover);
      // 第一次：取消 → 不动
      ctx.UI = vm.runInContext('UI', ctx);
      let answer = false;
      ctx.UI.modal = () => Promise.resolve(answer);
      await Battle.moveSelectedTo(2, 6);
      console.log('取消滑行后单位停在：', '(' + mover.x + ',' + mover.y + ')');
      // 第二次：确认 → 沿横道右滑，遇敌军 (8,6) 停在 (7,6)
      answer = true;
      await Battle.moveSelectedTo(2, 6);
      console.log('确认滑行后单位停在：', '(' + mover.x + ',' + mover.y + ')  hasMoved =', mover.hasMoved);
      console.log(mover.x === 7 && mover.y === 6 ? '滑行落点正确（遇人停在 7,6）' : '!! 滑行落点异常');
      // 第三次：竖带——把单位放到 (2,3)，点 (2,4) 应下滑到图底草地 (2,7)
      mover.x = 2; mover.y = 3; mover.acted = false;
      Battle.selectUnit(mover);
      await Battle.moveSelectedTo(2, 4);
      console.log('竖带下滑后单位停在：', '(' + mover.x + ',' + mover.y + ')');
      console.log(mover.x === 2 && mover.y === 7 ? '竖带滑行正确（滑出冰带落上 2,7）' : '!! 竖带滑行异常');
    }
  }

  /* 法术与召唤系统集成验证 */
  {
    const { Spells, Summon, SUMMON_FIELD_CAP } = vm.runInContext('({ Spells, Summon, SUMMON_FIELD_CAP })', ctx);
    for (const m of ['beginSpellSelect', 'beginSpellTargetSelect', 'chooseSpellTarget', 'bestEnemySpell', 'spellHost', 'doSummon']) {
      if (typeof Battle[m] !== 'function') throw new Error('Battle 缺少方法 ' + m);
    }
    // 敌方法术 AI：竹妖进场，附近有我方单位 → 有法术方案
    const bamboo = { id: 'boss1', name: '竹妖', side: 'enemy', rawType: 'bamboo', level: 8, ai: 'guard',
      x: 3, y: 5, hp: 34, move: 4, moveType: 'plant', stats: { hp: 34, str: 2, mag: 11, skl: 8, spd: 6, lck: 4, def: 6, res: 8 },
      items: [{ key: 'boss_vine', uses: 30 }], weaponIndex: 0, ranks: { tome: 'C' }, tags: ['plant'],
      spellUses: {}, statuses: {}, escaped: false, hasMoved: false, movedDist: 0, acted: false, boss: true };
    B.units.push(bamboo);
    const plan = Battle.bestEnemySpell(bamboo, Battle.reachFor(bamboo));
    console.log('竹妖法术 AI：', plan ? plan.spell.name + ' → ' + plan.target.name + ' @(' + plan.x + ',' + plan.y + ')' : '无');
    if (!plan) throw new Error('敌方法术 AI 无解');

    // 召唤三阶 + 场上上限
    const casterU = B.units.find(x => x.side === 'player' && x.hp > 0);
    const pet1 = Summon.spawn(B, Battle.uid++, casterU, 2);
    pet1.x = casterU.x; pet1.y = Math.min(7, casterU.y + 1);
    B.units.push(pet1);
    const pet2 = Summon.spawn(B, Battle.uid++, casterU, 3);
    pet2.x = casterU.x; pet2.y = Math.max(0, casterU.y - 1);
    B.units.push(pet2);
    console.log('召唤上场：', pet1.name, '/', pet2.name, '；场上', Summon.fieldCount(B), '/', SUMMON_FIELD_CAP);
    if (Summon.fieldCount(B) !== 2 || Summon.canSpawn(B)) throw new Error('召唤上限计数异常');

    // 指令态进 modsFor + 随行拦截
    Summon.setOrder(pet1, 'assault');
    const ma = Battle.modsFor(pet1, null);
    console.log('灵兽猛攻修正：dmg +' + ma.dmg + ' / def ' + ma.def);
    if (ma.dmg !== 3 || ma.def !== -2) throw new Error('召唤指令修正异常');
    Summon.setOrder(pet1, 'escort');
    const victim = B.units.find(x => x.side === 'player' && x.hp > 0 && x.id !== pet1.id && x.id !== pet2.id);
    // 找 victim 的一个空格邻位放随行召唤物（避免与 victim 同格或越界）
    const spots = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(d => ({ x: victim.x + d[0], y: victim.y + d[1] }))
      .filter(p => p.x >= 0 && p.x < 16 && p.y >= 0 && p.y < 8 &&
        !B.units.some(u => u.x === p.x && u.y === p.y && u.hp > 0));
    pet1.x = spots[0].x; pet1.y = spots[0].y;
    const guard = Summon.interceptTarget(B, bamboo, victim);
    console.log('随行拦截：', guard ? guard.name + ' 替 ' + victim.name : '无');
    if (!guard || guard.id !== pet1.id) throw new Error('随行拦截异常');
  }

  /* 传说武器掉落 / 保底转化 / 打造坊渲染 */
  {
    const { Legendary, Forge, Camp } = vm.runInContext('({ Legendary, Forge, Camp })', ctx);
    vm.runInContext('(c) => { Game.campaign = c; }', ctx)(camp);
    for (const m of ['renderForge']) {
      if (typeof Camp[m] !== 'function') throw new Error('Camp 缺少方法 ' + m);
    }
    const boss = { id: 'bossL', name: '竹妖', side: 'enemy', rawType: 'bamboo', level: 8,
      x: 3, y: 5, hp: 0, boss: true, statuses: {} };
    /* 从干净状态起验证三条分支（本块自洽，不受前文测试副作用影响） */
    camp.legendary = {};
    camp.legendaryPity = {};
    /* 命运注定的 miss：3% 未中，缘值 +1 */
    const origRandom = Math.random;
    Math.random = () => 0.99;
    await Battle.handleDeath(boss, null);
    Math.random = origRandom;
    const missPity = camp.legendaryPity['bamboo'];
    console.log('竹妖讨伐未掉（缘 +1 =', missPity, '）；持有数 =', Legendary.ownedCount(camp));
    if (missPity !== 1 || Legendary.isOwned(camp, 'lw_wanbi')) {
      throw new Error('小概率未掉分支异常: pity=' + missPity + ' owned=' + Legendary.isOwned(camp, 'lw_wanbi'));
    }
    /* 缘值满 12 次必掉 */
    camp.legendaryPity['bamboo'] = 11;
    await Battle.handleDeath(boss, null);
    const drop = B.loot.items[B.loot.items.length - 1];
    console.log('竹妖第 12 次必掉：', drop, '；战役持有数 =', Legendary.ownedCount(camp));
    if (drop !== 'lw_wanbi' || !Legendary.isOwned(camp, 'lw_wanbi')) throw new Error('保底掉落未入战利品');
    const goldBefore = B.loot.gold;
    await Battle.handleDeath(boss, null);
    console.log('竹妖重打保底：+' + (B.loot.gold - goldBefore) + ' 金 +' + B.loot.seals + ' 印');
    if (B.loot.gold - goldBefore !== 250 || B.loot.seals !== 1) throw new Error('重打保底数值异常');
    const body = el();
    Camp.renderForge(body);
    console.log('打造坊渲染：', body.innerHTML.length, '字符；含图鉴 =', body.innerHTML.indexOf('云却') >= 0,
                '；含打造行 =', body.innerHTML.indexOf('data-act="forge"') >= 0);
    if (body.innerHTML.indexOf('云却') < 0 || body.innerHTML.indexOf('data-act="forge"') < 0) {
      throw new Error('打造坊渲染缺块');
    }
    if (body.innerHTML.indexOf('词条：') < 0 || body.innerHTML.indexOf('技能·断岳') < 0) {
      throw new Error('图鉴缺少词条/技能说明');
    }
    const r = Forge.craft(camp, 'iron_sword');
    console.log('打造铁剑：', r.ok ? '成功（-' + r.cost.gold + ' 金）' : '失败 ' + r.why,
                '；行囊末件 =', camp.convoy[camp.convoy.length - 1].key);
    if (!r.ok || camp.convoy[camp.convoy.length - 1].key !== 'iron_sword') throw new Error('打造失败');
    /* 兵装行/行囊行同步图标与词条说明 */
    const yunceRec = camp.roster.find(x => x.id === 'yunce');
    const row = Camp.itemRow.call(Camp, yunceRec, { key: 'lw_wanbi', uses: 20 }, 0);
    console.log('兵装行：含图标 =', row.indexOf('wpn_lw_wanbi.png') >= 0,
                '；含词条 =', row.indexOf('词条：') >= 0, '；含技能 =', row.indexOf('技能·同春') >= 0);
    if (row.indexOf('wpn_lw_wanbi.png') < 0 || row.indexOf('词条：') < 0 || row.indexOf('技能·同春') < 0) {
      throw new Error('兵装行缺少图标/词条说明');
    }
    const plainRow = Camp.itemRow.call(Camp, yunceRec, { key: 'iron_sword', uses: 20 }, 1);
    if (plainRow.indexOf('wpn_') >= 0 || plainRow.indexOf('词条：') >= 0) throw new Error('普通兵装行不应带传说图标/词条');
  }

  console.log('\n冒烟通过：无引用错误');
})().catch(e => { console.error('冒烟失败：', e); process.exit(1); });
