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
               'js/systems/legendary.js', 'js/systems/smith.js', 'js/systems/route.js',
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
      id: 0, no: 0, name: '沙盒 · 冰面', theme: 'bamboo',
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
    await Battle.start({ chapter: ICE_SANDBOX, chapterId: 0, campaign: camp, deployedIds: ['yunce', 'luming', 'qingluo'] });
  } else {
    await Battle.start({ chapterId: 1, campaign: camp, deployedIds: ['yunce', 'luming'] });
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
    /* 命运注定的 miss：3% 未中，缘值 +1。
     * 注意：Math.random 必须在 vm 内部打补丁——vm 语境有自己的 Math 内置对象，
     * 在Node 外层改 Math.random 对 vm 里的代码无效（曾因此偶发 flaky）。 */
    vm.runInContext('globalThis.__origRandom = Math.random; Math.random = () => 0.99;', ctx);
    await Battle.handleDeath(boss, null);
    vm.runInContext('Math.random = globalThis.__origRandom;', ctx);
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

  /* 武器强化 +3：材料铺 → 行囊堆叠 → 兵装行强化钮 → 扣费升级 → 加成落进战斗公式 */
  {
    const { Smith, Camp } = vm.runInContext('({ Smith, Camp })', ctx);
    camp.gold = 5000;
    camp.convoy = [];
    const yunceRec2 = camp.roster.find(x => x.id === 'yunce');
    yunceRec2.items = [{ key: 'iron_sword', uses: 20, plus: 0 }];
    yunceRec2.weaponIndex = 0;
    /* 材料页签 */
    Camp.shopTab = 'mat';
    const shopBody = el();
    Camp.renderShop(shopBody);
    console.log('材料铺：含铁髓 =', shopBody.innerHTML.indexOf('铁髓') >= 0,
                '；含强化说明 =', shopBody.innerHTML.indexOf('铁匠铺强化') >= 0);
    if (shopBody.innerHTML.indexOf('铁髓') < 0 || shopBody.innerHTML.indexOf('铁匠铺强化') < 0) {
      throw new Error('材料页签缺块');
    }
    /* 购材堆叠 */
    await Camp.buy('mat', 'mat_iron');
    await Camp.buy('mat', 'mat_iron');
    console.log('购入铁髓 ×2 后行囊：', camp.convoy.map(i => i.key + '×' + i.uses).join(','));
    if (camp.convoy.length !== 1 || camp.convoy[0].uses !== 2) throw new Error('材料堆叠异常');
    /* 兵装行强化钮 */
    const sRow = Camp.itemRow.call(Camp, yunceRec2, yunceRec2.items[0], 0);
    console.log('兵装行：含强化钮 =', sRow.indexOf('data-act="strengthen"') >= 0,
                '；含铁髓花费 =', sRow.indexOf('铁髓 ×2') >= 0);
    if (sRow.indexOf('data-act="strengthen"') < 0 || sRow.indexOf('铁髓 ×2') < 0) throw new Error('兵装行缺强化钮');
    /* 开炉：扣 2 铁髓 + 100 金 → +1 */
    const item2 = yunceRec2.items[0];
    const sr = Smith.strengthen(camp, item2);
    console.log('强化铁剑：', sr.ok ? '成功 → +' + sr.plus : '失败 ' + sr.why,
                '；余金', camp.gold, '；余材', camp.convoy.length ? camp.convoy[0].uses : 0);
    if (!sr.ok || sr.plus !== 1 || camp.gold !== 4780 || camp.convoy.length !== 0) throw new Error('强化 +1 流程异常');
    /* 行显示加成 */
    const pRow = Camp.itemRow.call(Camp, yunceRec2, item2, 0);
    console.log('+1 兵装行：徽标 =', pRow.indexOf('plus-badge">+1') >= 0,
                '；威力 =', pRow.indexOf('力+6') >= 0);
    if (pRow.indexOf('plus-badge">+1') < 0 || pRow.indexOf('力+6') < 0) throw new Error('强化后行内加成缺失');
    /* 行囊行强化钮（data-where=convoy） */
    camp.convoy = [{ key: 'iron_sword', uses: 20, plus: 0 }];
    const detailHTML = Camp.unitDetail(yunceRec2);
    console.log('行囊行：含行囊强化钮 =', detailHTML.indexOf('data-where="convoy"') >= 0);
    if (detailHTML.indexOf('data-where="convoy"') < 0) throw new Error('行囊行缺强化钮');
    /* 传说不可强化（按钮不渲染） */
    camp.convoy = [{ key: 'lw_wanbi', uses: 20 }];
    const legendRow = Camp.itemRow.call(Camp, yunceRec2, { key: 'lw_wanbi', uses: 20 }, 0);
    if (legendRow.indexOf('data-act="strengthen"') >= 0) throw new Error('传说兵装不应有强化钮');
    camp.convoy = [];
    Camp.shopTab = 'weapon';
  }

  /* 传送武器：渡厄杖（唤回友军）+ 追影刃（命中换位）+ 商店按章/角色闸门 */
  {
    const CB = vm.runInContext('Combat', ctx);
    const Camp2 = vm.runInContext('Camp', ctx);
    /* 商店闸门：渡厄杖 ch3 上架；追影刃 ch4 且墨鸦入队 */
    camp.chapter = 1;
    const stock1 = Camp2.weaponStock().map(s => s.key);
    if (stock1.includes('staff_duo') || stock1.includes('dagger_zhuiying')) throw new Error('第 1 章不应上架传送武器');
    camp.chapter = 3;
    const stock3 = Camp2.weaponStock().map(s => s.key);
    if (!stock3.includes('staff_duo')) throw new Error('第 3 章应上架渡厄杖');
    if (stock3.includes('dagger_zhuiying')) throw new Error('墨鸦未入队不应上架追影刃');
    camp.roster.push(Game.makeRec('moya'));
    camp.chapter = 4;
    const stock4 = Camp2.weaponStock().map(s => s.key);
    if (!stock4.includes('dagger_zhuiying')) throw new Error('墨鸦入队第 4 章应上架追影刃');
    console.log('商店闸门：渡厄杖 ch3 / 追影刃 ch4+墨鸦，均按章解锁');
    camp.chapter = 1;
    camp.roster = camp.roster.filter(r => r.id !== 'moya');

    /* 渡厄杖流程：目标列表 → 唤到施法者邻位 → 扣耐久 → 消耗行动 */
    const heroes = B.units.filter(x => x.side === 'player' && x.hp > 0 && x.charId);
    const caster = heroes[0], mate = heroes[1];
    caster.items = [{ key: 'staff_duo', uses: 5 }];
    caster.weaponIndex = 0;
    caster.ranks.staff = 'A';
    caster.x = 2; caster.y = 2; caster.acted = false;
    mate.x = 2; mate.y = 4; mate.acted = false;
    B.selectedUnit = caster;
    const wt = Battle.warpTargets(caster);
    console.log('渡厄目标：', wt.map(t => t.name).join('/'), '（共 ' + wt.length + '）');
    if (wt.length !== 1 || wt[0].id !== mate.id) throw new Error('渡厄目标列表异常');
    const origExp = Battle.grantStaffExp;
    Battle.grantStaffExp = async () => {};   // 防升级弹窗挂起冒烟
    await Battle.chooseWarpTarget(mate);
    Battle.grantStaffExp = origExp;
    console.log('唤回后：' + mate.name + ' (' + mate.x + ',' + mate.y + ')，施法者 (' + caster.x + ',' + caster.y + ')');
    if (CB.distance(mate.x, mate.y, caster.x, caster.y) !== 1) throw new Error('友军未被唤到施法者邻位');
    if (caster.items[0].uses !== 4) throw new Error('渡厄杖耐久未扣');
    if (!caster.acted) throw new Error('渡厄未消耗行动');

    /* 追影刃换位：stub Combat.resolve 做确定性三分支 */
    const origResolve = CB.resolve;
    const mkStrike = (aId, dId, hit) => [{ type: 'strike', attacker: aId, defender: dId,
      attackerName: '甲', defenderName: '乙', hit: hit === undefined ? true : !!hit, crit: false, dmg: 3, hpAfter: 17 }];
    const runSwap = async (events, bossFlag) => {
      const a = { id: 9001, name: '甲', side: 'player', charId: 'testA', hp: 20, x: 3, y: 3,
        stats: { hp: 20, str: 10, mag: 0, skl: 10, spd: 10, lck: 5, def: 5, res: 5 },
        items: [{ key: 'dagger_zhuiying', uses: 20 }], weaponIndex: 0, ranks: { dagger: 'A' },
        statuses: {}, tags: ['human'] };
      const d = { id: 9002, name: '乙', side: 'enemy', charId: 'testB', hp: 20, x: 4, y: 3, boss: !!bossFlag,
        stats: { hp: 20, str: 8, mag: 0, skl: 8, spd: 8, lck: 5, def: 5, res: 5 },
        items: [], ranks: {}, statuses: {}, tags: ['human'] };
      B.units.push(a, d);
      CB.resolve = () => events(a.id, d.id);
      await Battle.performCombat(a, d, false);
      B.units = B.units.filter(u => u.id !== 9001 && u.id !== 9002);
      return { ax: a.x, ay: a.y, dx: d.x, dy: d.y };
    };
    let r = await runSwap(mkStrike, false);
    console.log('追影刃命中换位：甲 (' + r.ax + ',' + r.ay + ')  乙 (' + r.dx + ',' + r.dy + ')');
    if (r.ax !== 4 || r.ay !== 3 || r.dx !== 3 || r.dy !== 3) throw new Error('追影刃命中未换位');
    r = await runSwap((aId, dId) => mkStrike(aId, dId, false), false);
    if (r.ax !== 3 || r.dx !== 4) throw new Error('未命中不应换位');
    r = await runSwap(mkStrike, true);
    if (r.ax !== 3 || r.dx !== 4) throw new Error('对 Boss 不应换位');
    CB.resolve = origResolve;
    console.log('追影刃三分支：命中换位 / 未中不动 / Boss 不动，均正确');
  }

  /* 敌方精英词缀：池分配 / 登场播报 / 自愈 / 阵眼破盾 */
  {
    const CH = vm.runInContext('CHAPTERS', ctx);
    /* 分配：合成双池章节，两个浊甲卫轮流戴；Boss 自带不占池 */
    const fake = Object.create(Battle);
    fake.diff = { enemyLv: 0, enemyMul: 1 };
    fake.uid = 800;
    fake.chapter = { affixPool: ['berserk', 'shield'] };
    fake.B = { units: [], flags: {} };
    const made = [{ type: 'elite', lv: 5, x: 0, y: 0 }, { type: 'elite', lv: 5, x: 1, y: 0 }].map(sp => {
      const u = Battle.makeEnemyUnit.call(fake, sp);
      Battle.assignAffixes.call(fake, u, sp);
      return u;
    });
    console.log('词缀分配：', made.map(u => u.name + '·' + u.affixes.join('/')).join(' ， '));
    if (made[0].affixes[0] !== 'berserk' || made[1].affixes[0] !== 'shield') throw new Error('浊甲卫词缀轮流分配异常');
    Battle.announceAffixes.call(fake, made[0]);
    if (!fake.B.flags.announcedAffixes[made[0].id]) throw new Error('登场播报未记录');
    /* 自愈：敌方阶段开始回 10% 最大生命 */
    const rg = { id: 'rg1', name: '自愈靶', side: 'enemy', hp: 10, x: 15, y: 7, stats: { hp: 100 }, affixes: ['regen'], escaped: false };
    B.units.push(rg);
    Battle.tickAffixRegen();
    console.log('自愈：10 → ' + rg.hp + '（100 的 10%）');
    if (rg.hp !== 20) throw new Error('自愈回复量异常');
    B.units = B.units.filter(u => u.id !== 'rg1');
    /* 破盾：我方站在己方阵眼上命中带盾敌军才破；不在阵眼不破 */
    const CB = vm.runInContext('Combat', ctx);
    const origResolve2 = CB.resolve;
    const p = B.units.find(x => x.side === 'player' && x.charId && x.hp > 0);
    let node = B.nodes.find(n => n.id === 'n1');
    if (!node) {   // 沙盒图无阵眼：自建一个测试节点（本块末尾还原）
      node = { id: 'testn', x: 8, y: 6, type: 'attack', owner: 'player', tier: 1, active: true };
      B.nodes.push(node);
    }
    node.owner = 'player';
    p.x = node.x; p.y = node.y; p.acted = false;
    const mkShieldFoe = (id, x, y) => ({ id, name: '盾靶', side: 'enemy', charId: null, hp: 30, x, y,
      stats: { hp: 30, str: 8, mag: 0, skl: 8, spd: 8, lck: 5, def: 5, res: 5 },
      items: [], ranks: {}, statuses: {}, tags: ['human'], affixes: ['shield'] });
    const sf1 = mkShieldFoe('sf1', node.x, node.y - 1);
    B.units.push(sf1);
    CB.resolve = () => [{ type: 'strike', attacker: p.id, defender: sf1.id, attackerName: p.name, defenderName: sf1.name, hit: true, crit: false, dmg: 5, hpAfter: 25 }];
    await Battle.performCombat(p, sf1, false);
    console.log('阵眼破盾：shieldBreakUntil =', sf1.shieldBreakUntil, '（phaseIndex ' + B.phaseIndex + '）');
    if (!(sf1.shieldBreakUntil > B.phaseIndex)) throw new Error('站在己方阵眼未破盾');
    p.x = 2; p.y = 2;
    const sf2 = mkShieldFoe('sf2', 2, 3);
    B.units.push(sf2);
    CB.resolve = () => [{ type: 'strike', attacker: p.id, defender: sf2.id, attackerName: p.name, defenderName: sf2.name, hit: true, crit: false, dmg: 5, hpAfter: 25 }];
    await Battle.performCombat(p, sf2, false);
    if (sf2.shieldBreakUntil) throw new Error('不在阵眼不应破盾');
    console.log('非阵眼位置不破盾：正确');
    B.units = B.units.filter(u => u.id !== 'sf1' && u.id !== 'sf2');
    CB.resolve = origResolve2;
    if (node.id === 'testn') B.nodes = B.nodes.filter(n => n.id !== 'testn');
    else node.owner = 'none';
  }

  /* 双人连携 + 云策指挥技（P1.4） */
  {
    const CB = vm.runInContext('Combat', ctx);
    const RNGv = vm.runInContext('RNG', ctx);
    const UIv = vm.runInContext('UI', ctx);
    /* 连携：A（云策）攻击后，未行动的鹿鸣可追加一击 */
    const A = B.units.find(x => x.charId === 'yunce');
    const mate = B.units.find(x => x.charId === 'luming');
    A.items = [{ key: 'iron_sword', uses: 20 }]; A.weaponIndex = 0;
    mate.items = [{ key: 'iron_sword', uses: 20 }]; mate.weaponIndex = 0;
    mate.ranks = Object.assign({}, mate.ranks, { sword: 'C' });   // 鹿鸣本职无剑 rank，临时授剑验连携
    A.x = 3; A.y = 3; A.acted = false; A.chainUsed = false;
    mate.x = 4; mate.y = 4; mate.acted = false; mate.chainUsed = false;
    const cf1 = { id: 'cf1', name: '连携靶', side: 'enemy', charId: null, hp: 30, x: 3, y: 4,
      stats: { hp: 30, str: 8, mag: 0, skl: 8, spd: 8, lck: 5, def: 5, res: 5 },
      items: [{ key: 'iron_sword', uses: 20 }], weaponIndex: 0, ranks: { sword: 'C' }, statuses: {}, tags: ['human'] };
    B.units.push(cf1);
    const cands = Battle.chainAllies(A, cf1);
    console.log('连携候选：', cands.map(u => u.name).join('/') || '无');
    if (cands.length !== 1 || cands[0].id !== mate.id) throw new Error('连携候选异常');
    const origResolve3 = CB.resolve;
    CB.resolve = () => [{ type: 'strike', attacker: A.id, defender: cf1.id, attackerName: A.name, defenderName: cf1.name, hit: true, crit: false, dmg: 3, hpAfter: 27 }];
    const origModal = UIv.modal, origHit = RNGv.hitRoll, origNext = RNGv.next;
    UIv.modal = opts => Promise.resolve(opts.list[0].value);   // 自动选第一个候选
    RNGv.hitRoll = () => 0; RNGv.next = () => 0.99;            // 必中且不暴击
    const hpBefore = cf1.hp;
    await Battle.offerChain(A, cf1);
    UIv.modal = origModal; RNGv.hitRoll = origHit; RNGv.next = origNext;
    CB.resolve = origResolve3;
    console.log('连携追加：' + mate.name + ' 命中，靶 ' + hpBefore + ' → ' + cf1.hp + '；chainUsed =', mate.chainUsed);
    if (!mate.chainUsed || !mate.acted || cf1.hp >= hpBefore) throw new Error('连携追加攻击异常');
    B.units = B.units.filter(u => u.id !== 'cf1');
    /* 指挥技：号令 → 集火 → 坚守 */
    if (!Battle.commandAvailable()) throw new Error('云策在阵指挥技应可用');
    Battle.applyOrderCommand();
    console.log('号令：commandUsed =', B.commandUsed, '；云策可再动 =', A.acted === false);
    if (!B.commandUsed || A.acted) throw new Error('号令效果异常');
    if (Battle.commandAvailable()) throw new Error('用过后应不可再指挥');
    B.commandUsed = false;
    const cf2 = { id: 'cf2', name: '集火靶', side: 'enemy', charId: null, hp: 30, x: 5, y: 3,
      stats: { hp: 30, str: 8, mag: 0, skl: 8, spd: 8, lck: 5, def: 5, res: 5 },
      items: [{ key: 'iron_sword', uses: 20 }], weaponIndex: 0, ranks: { sword: 'C' }, statuses: {}, tags: ['human'] };
    B.units.push(cf2);
    Battle.beginVolleySelect();
    if (B.mode !== 'command-target') throw new Error('集火选择态异常');
    await Battle.chooseVolleyTarget(cf2);
    B.volleyTarget = null;
    const hitNo = Battle.modsFor(A, cf2).hit;
    B.volleyTarget = 'cf2';
    const hitYes = Battle.modsFor(A, cf2).hit;
    console.log('集火命中：' + hitNo + ' → ' + hitYes + '（+15）');
    if (hitYes - hitNo !== 15) throw new Error('集火加成异常');
    B.commandUsed = false;
    Battle.applyHoldCommand();
    const ctxH = Battle.combatCtx();
    console.log('坚守保护 ' + B.holdUnits.length + ' 人；云策受保护 =', ctxH.holdActive(A));
    if (!ctxH.holdActive(A) || !B.commandUsed) throw new Error('坚守效果异常');
    B.commandUsed = false; B.volleyTarget = null; B.holdUnits = [];
    B.units = B.units.filter(u => u.id !== 'cf2');
    B.mode = 'idle';
    B.targetTiles = null; B.attackRange = null;
  }

  /* P2.1 转职分支 + P2.3 武器进化 */
  {
    const { Smith, Camp, CLASSES, Combat } = vm.runInContext('({ Smith, Camp, CLASSES, Combat })', ctx);
    const rec = camp.roster.find(x => x.id === 'yunce');
    /* 12 个基础职业都应有两条转职线 */
    const bases = Object.keys(CLASSES).filter(k => CLASSES[k].tier === 1);
    const oneLine = bases.filter(k => (CLASSES[k].promotes || []).length !== 2);
    console.log('基础职业', bases.length, '个；双线', bases.length - oneLine.length, '个');
    if (bases.length !== 12 || oneLine.length) throw new Error('转职分支缺失：' + oneLine.join(','));
    /* 云策（剑客）转职按钮应列出两条线 */
    rec.cls = 'swordsman';
    rec.level = 20;
    camp.seals = Math.max(1, camp.seals || 0);
    const branches = Camp.promoteBranches(CLASSES.swordsman);
    console.log('剑客分支：', branches.map(b => b.name).join(' / '));
    if (branches.length !== 2) throw new Error('剑客分支数异常');
    const promoHTML = Camp.unitDetail(rec);
    if (promoHTML.indexOf('剑圣 / 裂阵剑士') < 0) throw new Error('转职按钮未展示双分支');
    console.log('转职按钮含双分支 =', true);
    /* 武器进化：兵装行钮 → 扣费扣料 → 换 key / 刷耐久 / 留强化 */
    camp.gold = 3000;
    camp.convoy = [{ key: 'mat_iron', uses: 4 }];
    rec.items = [{ key: 'iron_sword', uses: 6, plus: 2 }];
    rec.weaponIndex = 0;
    const evRow = Camp.itemRow.call(Camp, rec, rec.items[0], 0);
    console.log('兵装行：含进化钮 =', evRow.indexOf('data-act="evolve"') >= 0);
    if (evRow.indexOf('data-act="evolve"') < 0) throw new Error('兵装行缺进化钮');
    const er = Smith.evolve(camp, rec.items[0]);
    console.log('铁剑进化：', er.ok ? er.fromName + ' → ' + er.name : '失败 ' + er.why,
                '；耐久', rec.items[0].uses, '；强化 +' + rec.items[0].plus,
                '；余金', camp.gold, '；余材', Smith.matCount(camp, 'mat_iron'));
    if (!er.ok) throw new Error('进化失败：' + er.why);
    if (rec.items[0].key !== 'steel_sword') throw new Error('进化后 key 异常');
    if (rec.items[0].uses !== 25) throw new Error('进化后耐久未刷满');
    if (rec.items[0].plus !== 2) throw new Error('进化未保留强化等级');
    if (camp.gold !== 2600 || Smith.matCount(camp, 'mat_iron') !== 2) throw new Error('进化扣费异常');
    if (!Combat.canEquipKey(rec, 'steel_sword')) throw new Error('进化后无法装备');
    /* 行囊行进化钮 + 三类不可进化不出钮 */
    camp.convoy = [{ key: 'iron_bow', uses: 20, plus: 0 }, { key: 'mat_iron', uses: 2 }];
    const detail2 = Camp.unitDetail(rec);
    if (detail2.indexOf('data-act="evolve" data-where="convoy"') < 0) throw new Error('行囊行缺进化钮');
    const legendRow2 = Camp.itemRow.call(Camp, rec, { key: 'lw_yunque', uses: 20 }, 0);
    if (legendRow2.indexOf('data-act="evolve"') >= 0) throw new Error('传说兵装不应有进化钮');
    const endRow = Camp.itemRow.call(Camp, rec, { key: 'silver_sword', uses: 20 }, 0);
    if (endRow.indexOf('data-act="evolve"') >= 0) throw new Error('终点兵装不应有进化钮');
    const brokenRow = Camp.itemRow.call(Camp, rec, { key: 'iron_sword', uses: 0 }, 0);
    if (brokenRow.indexOf('data-act="evolve"') >= 0) throw new Error('损坏兵装不应有进化钮');
    console.log('传说/终点/损坏均无进化钮 =', true);
    camp.convoy = [];
  }

  console.log('\n冒烟通过：无引用错误');
})().catch(e => { console.error('冒烟失败：', e); process.exit(1); });
