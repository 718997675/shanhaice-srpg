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
              'js/audio.js', 'js/juice.js', 'js/item-icons.js', 'js/render.js', 'js/ui.js', 'js/render-battleview.js', 'js/ui-icons.js', 'js/battle.js',
              'js/systems/terrain.js', 'js/systems/spells.js', 'js/systems/summon.js',
              'js/systems/legendary.js', 'js/systems/smith.js', 'js/systems/route.js',
              'js/camp.js', 'js/relations.js', 'js/game.js'];

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
    /* 真的选第二条分支转职：弹窗选「裂阵剑士」→ cls 变更、脉印 -1、剑熟练度升一阶 */
    const UIv = vm.runInContext('({ UI })', ctx).UI;
    const origModal = UIv.modal, origConfirm = UIv.confirm;
    UIv.modal = () => Promise.resolve('裂阵剑士');
    UIv.confirm = () => Promise.resolve(true);
    const sealsBefore = camp.seals, rankBefore = rec.ranks.sword;
    await Camp.promote(rec);
    UIv.modal = origModal; UIv.confirm = origConfirm;
    console.log('选第二分支转职：', (CLASSES[rec.cls] || {}).name, '；脉印', sealsBefore, '→', camp.seals,
                '；剑', rankBefore, '→', rec.ranks.sword);
    if (rec.cls !== 'riftblade') throw new Error('转职分支选择未生效：' + rec.cls);
    if (camp.seals !== sealsBefore - 1) throw new Error('转职未扣脉印');
    rec.cls = 'swordsman';
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

  /* P3.2 心结：挂载 → 命中 -5 → 支援 A 级了断 → 恢复 → 终章全解 +5/+5 */
  {
    const { HEART_KNOTS, Camp, UI: UIv2 } = vm.runInContext('({ HEART_KNOTS, Camp, UI })', ctx);
    camp.knots = {};
    Game.applyKnots('A');
    console.log('选 A 线挂心结：', Object.keys(camp.knots).join(','));
    if (!camp.knots.chisang || camp.knots.chisang.resolved) throw new Error('A 线未挂赤桑心结');
    const knotUnit = { id: 'kt', charId: 'chisang', side: 'player', cls: 'swordmaster', x: 3, y: 3, hp: 30,
      stats: { hp: 30, str: 10, mag: 0, skl: 10, spd: 10, lck: 5, def: 5, res: 5 },
      items: [], weaponIndex: -1, statuses: {}, tags: ['human'] };
    const knotFoe = { id: 'kt2', side: 'enemy', charId: null, x: 1, y: 1, hp: 20,
      stats: { hp: 20, str: 5, mag: 0, skl: 5, spd: 5, lck: 5, def: 5, res: 5 },
      items: [], weaponIndex: -1, statuses: {}, tags: ['human'] };
    B.units.push(knotUnit, knotFoe);
    Battle.campaign = camp;
    const hitKnot = Battle.modsFor(knotUnit, knotFoe).hit;
    console.log('心结未解命中修正：', hitKnot);
    if (hitKnot !== -5) throw new Error('心结命中修正异常：' + hitKnot);
    /* 羁绊不足 A：了断应被拒 */
    camp.supports[HEART_KNOTS.A.pairId] = 50;
    await Camp.resolveKnot('chisang');
    if (camp.knots.chisang.resolved) throw new Error('羁绊不足却了断了');
    console.log('羁绊 B 级时了断被拒 =', true);
    /* 拉到 A 级再了断 */
    camp.supports[HEART_KNOTS.A.pairId] = 90;
    const origDlg = UIv2.dialogue;
    UIv2.dialogue = () => Promise.resolve();
    await Camp.resolveKnot('chisang');
    UIv2.dialogue = origDlg;
    console.log('了断后 resolved =', camp.knots.chisang.resolved,
                '；命中修正 =', Battle.modsFor(knotUnit, knotFoe).hit);
    if (!camp.knots.chisang.resolved) throw new Error('了断未生效');
    if (Battle.modsFor(knotUnit, knotFoe).hit !== 0) throw new Error('了断后仍扣命中');
    /* 终章全解：+5 命中 +5 必杀 */
    const savedChapter = Battle.chapter;
    Battle.chapter = { no: 9 };
    const finalMods = Battle.modsFor(knotUnit, knotFoe);
    console.log('终章全解：命中 +' + finalMods.hit + ' · 必杀 +' + finalMods.crit);
    if (finalMods.hit !== 5 || finalMods.crit !== 5) throw new Error('终章全解加成异常');
    Battle.chapter = savedChapter;
    /* 营地支援页应渲染出心结卡 */
    camp.knots.chisang.resolved = false;
    const knotBody = el();
    Camp.renderSupport(knotBody);
    if (knotBody.innerHTML.indexOf('心结 · 空谷') < 0) throw new Error('支援页未渲染心结卡');
    if (knotBody.innerHTML.indexOf('data-act="knotResolve"') < 0) throw new Error('心结卡缺了断钮');
    console.log('支援页心结卡 =', true);
    camp.knots.chisang.resolved = true;
    B.units = B.units.filter(u => u.id !== 'kt' && u.id !== 'kt2');
  }

  /* P2.2 个人技② + 技能继承 + 熟练度成长 */
  {
    const { Camp, CLASSES, Game: Gv, INHERIT_CAP, RANK_UP_USES, Combat: CB2 } = vm.runInContext(
      '({ Camp, CLASSES, Game, INHERIT_CAP, RANK_UP_USES, Combat })', ctx);
    /* 营地详情页应同时列出职业技 / 两条个人技 / 熟练进度 */
    const rec = camp.roster.find(x => x.id === 'yunce');
    const detail = Camp.unitDetail(rec);
    const has = s => detail.indexOf(s) >= 0;
    console.log('详情页：个人技①', has('守脉人'), '；个人技②', has('承脉'), '；熟练行', has('prof-row'));
    if (!has('守脉人') || !has('承脉')) throw new Error('详情页未同时展示两条个人技');
    if (!has('prof-row')) throw new Error('详情页缺熟练进度');
    /* 个人技② 真进公式：魔抗 +2 */
    const probe = { id: 'p2', charId: 'yunce', side: 'player', cls: 'swordsman', x: 3, y: 3, hp: 23,
      stats: { hp: 23, str: 8, mag: 0, skl: 9, spd: 9, lck: 7, def: 6, res: 3 },
      personal: JSON.parse(JSON.stringify(vm.runInContext('CHARS', ctx).yunce.personal)),
      personal2: JSON.parse(JSON.stringify(vm.runInContext('CHARS', ctx).yunce.personal2)),
      inherited: [], items: [], weaponIndex: -1, statuses: {}, tags: ['human'] };
    B.units.push(probe);
    const resMod = Battle.modsFor(probe, null).res;
    console.log('承脉魔抗修正：', resMod);
    if (resMod !== 2) throw new Error('个人技② 未进公式：' + resMod);
    B.units = B.units.filter(u => u.id !== 'p2');

    /* 技能继承：转职把原职业技能写进 inherited，上限 2 条先进先出 */
    const temp = Gv.makeRec('yunce');
    temp.cls = 'swordsman';
    temp.level = 20;
    camp.seals = Math.max(3, camp.seals || 0);
    const UIv3 = vm.runInContext('({ UI })', ctx).UI;
    const oM = UIv3.modal, oC = UIv3.confirm;
    UIv3.modal = () => Promise.resolve('剑圣');
    UIv3.confirm = () => Promise.resolve(true);
    await Camp.promote(temp);
    console.log('转职继承：', temp.cls, '；inherited =', (temp.inherited || []).map(s => s.name).join('/'));
    if (temp.cls !== 'swordmaster') throw new Error('单分支转职失败');
    if (!(temp.inherited || []).some(s => s.name === '剑术精通')) throw new Error('转职未继承原职业技能');
    /* 继承技必须真进公式（剑术精通 = 装备剑命中 +10），同名时取较大值不叠乘 */
    temp.items = [{ key: 'iron_sword', uses: 20 }];
    temp.weaponIndex = 0;
    const sf = Battle.skillFieldsOf(temp);
    const bare = Battle.skillFieldsOf({ cls: 'zzz', inherited: temp.inherited });
    console.log('继承技字段：剑圣 hit =', sf.hit, '（职业 15 压过继承 10，不叠乘）；裸职 hit =', bare.hit,
                '；weapon =', bare.weapon);
    if (sf.hit !== 15) throw new Error('同名继承技应与职业技取较大值：' + sf.hit);
    if (bare.hit !== 10 || bare.weapon !== 'sword') throw new Error('继承技未进 skillFieldsOf');
    if (!Battle.skillListOf(temp).some(s => s.kind === 'inherit' && s.name === '剑术精通')) {
      throw new Error('skillListOf 未列出继承技');
    }
    /* 上限：塞满后先进先出 */
    temp.inherited = [{ name: '旧技甲', dmg: 1 }, { name: '旧技乙', dmg: 2 }];
    temp.cls = 'swordsman';
    await Camp.promote(temp);
    console.log('继承上限 ' + INHERIT_CAP + '：', temp.inherited.map(s => s.name).join('/'));
    if (temp.inherited.length !== INHERIT_CAP) throw new Error('继承条数超上限');
    if (temp.inherited.some(s => s.name === '旧技甲')) throw new Error('继承未先进先出');
    UIv3.modal = oM; UIv3.confirm = oC;

    /* 熟练度成长：本章出手 40 次 → 章末升一阶，进度清零 */
    const row = camp.roster.find(x => x.id === 'yunce');
    row.ranks.sword = 'D';
    row.rankPts = { sword: 0 };
    const ups = Gv.applyRankGrowth({ id: 'yunce', weaponUses: { sword: RANK_UP_USES } });
    console.log('熟练成长：剑 D →', row.ranks.sword, '；升阶记录', ups.length, '条；余进度', row.rankPts.sword);
    if (row.ranks.sword !== 'C') throw new Error('满次数未升阶');
    if (ups.length !== 1 || ups[0].from !== 'D' || ups[0].to !== 'C') throw new Error('升阶记录异常');
    if (row.rankPts.sword !== 0) throw new Error('升阶后进度未清零');
    /* 不足阈值只累计 */
    row.ranks.bow = 'D';
    row.rankPts.bow = 0;
    Gv.applyRankGrowth({ id: 'yunce', weaponUses: { bow: 15 } });
    console.log('未满阈值：弓', row.ranks.bow, '；进度', row.rankPts.bow);
    if (row.ranks.bow !== 'D' || row.rankPts.bow !== 15) throw new Error('未满阈值行为异常');
    /* 实战：交战后耐久消耗被折算成出手次数 */
    const atk = B.units.find(x => x.side === 'player' && x.charId && x.hp > 0);
    atk.items = [{ key: 'iron_sword', uses: 20 }];
    atk.itemsStart = [20];
    atk.weaponIndex = 0;
    atk.ranks = Object.assign({}, atk.ranks, { sword: 'A' });
    const dummy = { id: 'du1', name: '木桩', side: 'enemy', charId: null, hp: 999, x: atk.x, y: atk.y + 1,
      stats: { hp: 999, str: 1, mag: 0, skl: 1, spd: 1, lck: 1, def: 1, res: 1 },
      items: [], weaponIndex: -1, ranks: {}, statuses: {}, tags: ['human'] };
    B.units.push(dummy);
    await Battle.performCombat(atk, dummy, false);
    const used = Battle.weaponUsesOf(atk);
    console.log('交战后出手统计：', JSON.stringify(used), '；耐久', atk.items[0].uses);
    if (!used.sword || used.sword !== 20 - atk.items[0].uses) throw new Error('出手统计与耐久消耗不一致');
    B.units = B.units.filter(u => u.id !== 'du1');
    /* 存档归一化保留继承技（普通章节不该洗掉） */
    const norm = Gv.normalizeUnitRecord({ id: 'yunce', cls: 'swordmaster' }, { inherited: [{ name: '剑术精通', hit: 10 }] });
    console.log('归一化保留继承技：', (norm.inherited || []).map(s => s.name).join('/'));
    if (!(norm.inherited || []).length) throw new Error('归一化丢了继承技');
  }

  /* P3.3 替补援军等级对齐 + 殉志传承 + 英魂碑 */
  {
    const { Camp, Game: Gv, CHARS, CLASSES } = vm.runInContext('({ Camp, Game, CHARS, CLASSES })', ctx);
    /* 等级对齐：按成长期望值补，同一目标等级结果确定 */
    const xw = Gv.makeRec('xiewuyi');
    const baseHp = xw.stats.hp, baseMag = xw.stats.mag;
    Gv.alignLevel(xw, 10);
    const expHp = baseHp + Math.round(CHARS.xiewuyi.growth.hp / 100 * (10 - CHARS.xiewuyi.level));
    console.log('谢无衣对齐 Lv.10：生命', baseHp, '→', xw.stats.hp, '（期望', expHp, '）；灵力', baseMag, '→', xw.stats.mag);
    if (xw.level !== 10) throw new Error('等级未对齐：' + xw.level);
    if (xw.stats.hp !== expHp) throw new Error('对齐成长值异常：' + xw.stats.hp + ' ≠ ' + expHp);
    const low = Gv.makeRec('tengdage');
    Gv.alignLevel(low, 3);   // 目标低于基础等级：不降级
    console.log('目标等级低于基础时不降级：Lv.', low.level);
    if (low.level !== CHARS.tengdage.level) throw new Error('对齐不该降低等级');

    /* 殉志传承：支援最高的存活者接技能；传说兵装类型不符则封存 */
    const savedRoster = camp.roster, savedSupports = camp.supports;
    camp.roster = ['yunce', 'luming', 'qingluo', 'xuanyi'].map(id => Gv.makeRec(id));
    camp.supports = { qingluo_xuanyi: 90 };
    camp.memorial = {}; camp.relics = [];
    const dead = camp.roster.find(r => r.id === 'qingluo');
    dead.inherited = [{ name: '旧技', dmg: 1 }];
    dead.items = [{ key: 'lw_longgu', uses: 20 }, { key: 'iron_bow', uses: 10 }];
    const lg = Gv.passOnLegacy('qingluo', 5);
    const heir = camp.roster.find(r => r.id === (lg && lg.heir));
    console.log('传承：', lg.name, '→', lg.heirName, '；技能', lg.skill, '；兵装', lg.weapon, '；封存', lg.sealed);
    if (!lg || lg.heir !== 'xuanyi') throw new Error('继承者应为支援最高的玄漪：' + (lg && lg.heir));
    if (lg.skill !== '鹰眼') throw new Error('未传承个人技①：' + lg.skill);
    if (!heir.inherited.some(s => s.name === '鹰眼')) throw new Error('继承技未写入继承者');
    if (lg.sealed !== 'lw_longgu') throw new Error('弓不该传给法师');
    if (!camp.relics.some(it => it.key === 'lw_longgu')) throw new Error('类型不符的传说兵装未封存');
    if (lg.epitaph !== vm.runInContext('EPITAPHS', ctx).qingluo) throw new Error('英魂碑遗言未写入');
    /* 类型相符时随传承：玄漪的咒熟练度拉到 S，青萝改持咒传说 */
    heir.ranks.tome = 'S';
    dead.items = [{ key: 'lw_wanbi', uses: 20 }];
    camp.memorial = {}; camp.relics = [];
    const lg2 = Gv.passOnLegacy('qingluo', 6);
    console.log('类型相符随传承：', lg2.weapon, '；玄漪行囊', heir.items.map(i => i.key).join('/'));
    if (lg2.weapon !== 'lw_wanbi' || lg2.sealed) throw new Error('咒传说应随传承');
    if (!heir.items.some(i => i.key === 'lw_wanbi')) throw new Error('传说兵装未进继承者行囊');
    /* 继承上限仍是 2 条 */
    dead.inherited = [{ name: '甲技', dmg: 1 }, { name: '乙技', dmg: 1 }];
    heir.inherited = [{ name: '占位一', dmg: 1 }, { name: '占位二', dmg: 1 }];
    camp.memorial = {};
    Gv.passOnLegacy('qingluo', 7);
    console.log('传承后仍守上限 2：', heir.inherited.map(s => s.name).join('/'));
    if (heir.inherited.length !== 2) throw new Error('传承突破继承上限');
    if (heir.inherited.some(s => s.name === '占位一')) throw new Error('传承未先进先出');

    /* 英魂碑渲染：名字 + 遗言 + 传承去向 */
    camp.fallen = ['qingluo'];
    camp.memorial = { qingluo: lg };
    const memBody = el();
    Camp.renderMemorial(memBody);
    const html = memBody.innerHTML;
    const okName = html.indexOf('青萝') >= 0;
    const okEpi = html.indexOf('箭囊空了') >= 0;
    const okPass = html.indexOf('传给') >= 0 && html.indexOf('玄漪') >= 0;
    console.log('英魂碑渲染：名字', okName, '；遗言', okEpi, '；传承', okPass);
    if (!okName || !okEpi || !okPass) throw new Error('英魂碑渲染不完整');
    /* 无阵亡时给安慰文案 */
    camp.fallen = [];
    const emptyBody = el();
    Camp.renderMemorial(emptyBody);
    if (emptyBody.innerHTML.indexOf('愿它一直空着') < 0) throw new Error('空碑文案缺失');
    console.log('空碑文案 =', true);

    camp.roster = savedRoster;
    camp.supports = savedSupports;
    camp.memorial = {}; camp.relics = []; camp.fallen = [];
  }

  /* P3.4 多结局：终章结算写 ending + 渲染尾声；三种判定各跑一次 */
  {
    const { Game: Gv, UI: UIv } = vm.runInContext('({ Game, UI })', ctx);
    const savedChapter = camp.chapter, savedCleared = camp.cleared, savedEnding = camp.ending;
    const savedRoster2 = camp.roster, savedSupports2 = camp.supports;
    const origSetResult = UIv.setResult, origDlg2 = UIv.dialogue;
    const origSave = Gv.saveCampaign, origRefresh = Gv.refreshTitle;
    let captured = '';
    UIv.setResult = html => { captured = html; };
    UIv.dialogue = () => Promise.resolve();
    Gv.saveCampaign = () => {};
    Gv.refreshTitle = () => {};
    const runFinale = async (rosterIds, supports, nodesHeld, nodesTotal) => {
      captured = '';
      camp.chapter = 9; camp.cleared = false; camp.ending = null;
      camp.roster = rosterIds.map(id => Gv.makeRec(id));
      camp.supports = supports;
      await Gv.onChapterClear({
        chapterId: 9, turns: 12, sideSuccess: true, units: [], fallen: [],
        supports, loot: {}, stats: {}, flags: {}, nodesHeld, nodesTotal
      });
      return captured;
    };
    const allIds = ['yunce', 'yankui', 'luming', 'qingluo', 'bailu', 'xuanyi', 'moya', 'chisang', 'aman', 'yunling'];
    const manyA = { yunce_luming: 95, yunce_yankui: 95, qingluo_yunling: 95, xuanyi_chisang: 95 };
    const goodHtml = await runFinale(allIds, manyA, 3, 3);
    console.log('好结局：ending =', camp.ending, '；面板含「灵脉重燃」=', goodHtml.indexOf('灵脉重燃') >= 0);
    if (camp.ending !== 'good') throw new Error('满条件应判好结局：' + camp.ending);
    if (goodHtml.indexOf('灵脉重燃') < 0 || goodHtml.indexOf('ending-block') < 0) throw new Error('结算面板未渲染尾声');
    if (goodHtml.indexOf('同行 10 人') < 0) throw new Error('尾声指标行缺失');

    const midHtml = await runFinale(allIds, manyA, 2, 3);
    console.log('中结局（阵眼 2/3）：ending =', camp.ending, '；面板含「山河如旧」=', midHtml.indexOf('山河如旧') >= 0);
    if (camp.ending !== 'mid') throw new Error('阵眼未全控应判中结局：' + camp.ending);

    const badHtml = await runFinale(['yunce', 'luming'], {}, 0, 3);
    console.log('差结局（2 人 / 无 A 级）：ending =', camp.ending, '；面板含「永夜」=', badHtml.indexOf('永夜') >= 0);
    if (camp.ending !== 'bad') throw new Error('人少且无羁绊应判差结局：' + camp.ending);
    if (badHtml.indexOf('永夜') < 0) throw new Error('差结局未渲染');

    UIv.setResult = origSetResult; UIv.dialogue = origDlg2;
    Gv.saveCampaign = origSave; Gv.refreshTitle = origRefresh;
    camp.chapter = savedChapter; camp.cleared = savedCleared; camp.ending = savedEnding;
    camp.roster = savedRoster2; camp.supports = savedSupports2;
  }

  /* P3.4 勇者模式：难度叠加、悔棋 0、敌军更硬、不弹战斗预测 */
  {
    const { diffOf } = vm.runInContext('({ diffOf })', ctx);
    const { UI: UIv4 } = vm.runInContext('({ UI })', ctx);
    const fake = Object.create(Battle);
    fake.uid = 9000;
    fake.diff = diffOf({ difficulty: 'normal' });
    const plain = Battle.makeEnemyUnit.call(fake, { type: 'bandit', lv: 5 });
    fake.diff = diffOf({ difficulty: 'normal', heroic: true });
    const hard = Battle.makeEnemyUnit.call(fake, { type: 'bandit', lv: 5 });
    console.log('勇者敌军：生命', plain.stats.hp, '→', hard.stats.hp, '；倍率', Battle.diff && '—');
    if (!(hard.stats.hp > plain.stats.hp)) throw new Error('勇者模式敌军未变硬');
    if (hard.stats.hp !== Math.max(1, Math.round(plain.stats.hp * 1.15))) throw new Error('勇者倍率未按 1.15 结算');

    /* 开一场勇者战役：悔棋归零、无战斗预测 */
    const savedHeroic = camp.heroic;
    camp.heroic = true;
    await Battle.start({ chapterId: 1, campaign: camp, deployedIds: ['yunce', 'luming'] });
    const hb = Battle.B;
    console.log('勇者开战：', Battle.diff.name, '；敌军倍率', Battle.diff.enemyMul, '；悔棋', hb.rewindLeft);
    if (!Battle.diff.heroic || Battle.diff.enemyMul !== 1.15) throw new Error('勇者难度未叠加到战斗');
    if (hb.rewindLeft !== 0) throw new Error('勇者模式不该有悔棋：' + hb.rewindLeft);
    let forecastCalls = 0;
    const origForecast = UIv4.forecast;
    UIv4.forecast = () => { forecastCalls++; return Promise.resolve(false); };
    const atk = hb.units.find(u => u.side === 'player' && u.charId && u.hp > 0);
    const foe = hb.units.find(u => u.side === 'enemy' && u.hp > 0);
    if (atk && foe) {
      hb.selectedUnit = atk;
      atk.x = foe.x; atk.y = foe.y - 1; atk.acted = false; atk.hasMoved = false;
      hb.mode = 'attack-select';
      await Battle.chooseAttackTarget.call(Battle, foe);
    }
    UIv4.forecast = origForecast;
    console.log('勇者模式战斗预测弹窗次数 =', forecastCalls);
    if (forecastCalls !== 0) throw new Error('勇者模式不该弹战斗预测');
    camp.heroic = savedHeroic;
    await Battle.start({ chapterId: 1, campaign: camp, deployedIds: ['yunce', 'luming'] });
    console.log('关掉勇者后预测恢复：diff.heroic =', !!Battle.diff.heroic, '；悔棋', Battle.B.rewindLeft);
    if (Battle.diff.heroic || Battle.B.rewindLeft === 0) throw new Error('关闭勇者后未恢复');
  }

  /* P3.4 图鉴：击破录入 → 章末并入 + 遗迹解锁 → 页面渲染 */
  {
    const { Camp, Game: Gv, UI: UIv5, CODEX } = vm.runInContext('({ Camp, Game, UI, CODEX })', ctx);
    const fake = Object.create(Battle);
    fake.B = { codexSeen: {} };
    Battle.noteCodex.call(fake, { rawType: 'wolf', affixes: ['shield', 'regen'] });
    Battle.noteCodex.call(fake, { rawType: null, affixes: [] });
    console.log('击破录入：', Object.keys(fake.B.codexSeen).join(' / '));
    if (!fake.B.codexSeen.wolf) throw new Error('敌型未录入图鉴');
    if (!fake.B.codexSeen.affix_shield || !fake.B.codexSeen.affix_regen) throw new Error('词缀未录入图鉴');
    if (Object.keys(fake.B.codexSeen).length !== 3) throw new Error('无 rawType 的单位不该录入');

    /* 章末并入：第 8 章同时解锁遗迹条目 */
    const savedChapter = camp.chapter, savedCleared = camp.cleared, savedCodex = camp.codex;
    const origSet = UIv5.setResult, origDlg3 = UIv5.dialogue;
    const origSave2 = Gv.saveCampaign, origRefresh2 = Gv.refreshTitle;
    UIv5.setResult = () => {};
    UIv5.dialogue = () => Promise.resolve();
    Gv.saveCampaign = () => {};
    Gv.refreshTitle = () => {};
    camp.codex = {};
    camp.chapter = 8; camp.cleared = false;
    await Gv.onChapterClear({
      chapterId: 8, turns: 9, sideSuccess: true, units: [], fallen: [],
      supports: {}, loot: {}, stats: {}, flags: {},
      nodesHeld: 3, nodesTotal: 3, codex: { wolf: true, affix_shield: true }
    });
    UIv5.setResult = origSet; UIv5.dialogue = origDlg3;
    Gv.saveCampaign = origSave2; Gv.refreshTitle = origRefresh2;
    const got = Object.keys(camp.codex).sort().join(',');
    console.log('章末并入图鉴：', got);
    if (!camp.codex.wolf || !camp.codex.affix_shield) throw new Error('章末未并入击破记录');
    if (!camp.codex.ruin_8) throw new Error('第 8 章未解锁天柱废墟');
    if (camp.codex.ruin_5A) throw new Error('不该解锁未到过的遗迹');

    /* 页面渲染：已识显示小传，未识显示「未 识」 */
    const codexBody = el();
    Camp.renderCodex(codexBody);
    const html = codexBody.innerHTML;
    const okKnown = html.indexOf('妖狼') >= 0 && html.indexOf('浊化最浅') >= 0;
    const okLocked = html.indexOf('未 识') >= 0;
    const okCount = html.indexOf('3 / ' + CODEX.length) >= 0;
    console.log('图鉴页：已识', okKnown, '；未识占位', okLocked, '；计数', okCount);
    if (!okKnown || !okLocked || !okCount) throw new Error('图鉴页渲染不完整');
    camp.chapter = savedChapter; camp.cleared = savedCleared; camp.codex = savedCodex;
  }

  /* P3.5 三幕剧情：幕间对白按回合播一次，悔棋不重播 */
  {
    const { UI: UIv6, DIALOGUES: DLG } = vm.runInContext('({ UI, DIALOGUES })', ctx);
    const origDlg = UIv6.dialogue;
    const played = [];
    UIv6.dialogue = lines => { played.push(lines); return Promise.resolve(); };

    const fake = Object.create(Battle);
    fake.B = { turn: 2, busy: false };
    fake.chapter = { mids: [{ key: 'ch1_mid', turn: 3 }] };
    fake.active = true;

    await Battle.playMidDialogues.call(fake);
    console.log('第 2 回合幕间播放次数 =', played.length);
    if (played.length !== 0) throw new Error('回合未到不该播幕间');

    fake.B.turn = 3;
    await Battle.playMidDialogues.call(fake);
    await Battle.playMidDialogues.call(fake);
    console.log('第 3 回合幕间播放次数 =', played.length,
      '；已播标记 =', Object.keys(fake.B.midsPlayed).join(','));
    if (played.length !== 1) throw new Error('幕间应只播一次');
    if (!fake.B.midsPlayed.ch1_mid) throw new Error('幕间未标记已播');
    if (played[0] !== DLG.ch1_mid) throw new Error('播的不是本章第二幕');

    /* 键不存在时只标记、不报错、不弹窗 */
    const ghost = Object.create(Battle);
    ghost.B = { turn: 5, busy: false };
    ghost.chapter = { mids: [{ key: 'no_such_mid', turn: 1 }] };
    ghost.active = true;
    await Battle.playMidDialogues.call(ghost);
    console.log('缺对白的幕间：标记 =', Object.keys(ghost.B.midsPlayed).join(','));
    if (!ghost.B.midsPlayed.no_such_mid) throw new Error('缺对白的幕间也该标记');
    if (played.length !== 1) throw new Error('缺对白时不该弹窗');

    UIv6.dialogue = origDlg;

    /* 真实章节数据挂上了 mids，且引擎读得到 */
    await Battle.start({ chapterId: 1, campaign: camp, deployedIds: ['yunce', 'luming'] });
    console.log('第 1 章 mids =', JSON.stringify(Battle.chapter.mids));
    if (!Battle.chapter.mids || !Battle.chapter.mids[0] ||
        Battle.chapter.mids[0].key !== 'ch1_mid') throw new Error('章节未挂 mids');

    /* 快照往返保留已播记录（悔棋不重播） */
    Battle.B.midsPlayed = { ch1_mid: true };
    const snapM = Battle.serialize(false);
    Battle.B.midsPlayed = {};
    Battle.applyState(snapM);
    console.log('快照往返后 midsPlayed =', JSON.stringify(Battle.B.midsPlayed));
    if (!Battle.B.midsPlayed.ch1_mid) throw new Error('快照未保留幕间记录');
  }

  /* P4 对白演出指令：_dialogFx 只动 CSS 类，未知值静默不炸 */
  {
    const { UI: UIv7 } = vm.runInContext('({ UI })', ctx);
    const cls = new Set();
    const mkList = prefix => ({
      add: c => cls.add(prefix + c),
      remove: c => cls.delete(prefix + c),
      contains: c => cls.has(prefix + c),
      toggle: () => {}
    });
    const stage = { classList: mkList('stage:'), offsetWidth: 0 };
    const overlay = { classList: mkList(''), querySelector: () => stage };
    const fxUi = Object.create(UIv7);
    fxUi.el = { dialog: overlay };

    UIv7._dialogFx.call(fxUi, 'dim');
    const dimmed = cls.has('fx-dim');
    UIv7._dialogFx.call(fxUi, 'lit');
    const restored = !cls.has('fx-dim');
    UIv7._dialogFx.call(fxUi, 'shake');
    const shook = cls.has('stage:fx-shake');
    UIv7._dialogFx.call(fxUi, 'flash');
    const flashed = cls.has('fx-flash');
    UIv7._dialogFx.call(fxUi, 'no_such_fx');   // 未知值应静默
    console.log('演出指令：dim', dimmed, '；lit 复原', restored,
      '；shake', shook, '；flash', flashed, '；未知值不炸', true);
    if (!dimmed || !restored || !shook || !flashed) throw new Error('演出指令未生效');
  }

  /* P4 新手引导：同一条只弹一次，未知键不弹，无存档不炸 */
  {
    const { Game: Gv2, UI: UIv8, HINTS } = vm.runInContext('({ Game, UI, HINTS })', ctx);
    const origToast = UIv8.toast, origSave3 = Gv2.saveCampaign;
    const toasts = [];
    UIv8.toast = t => { toasts.push(t); };
    Gv2.saveCampaign = () => {};
    const savedCampaign = Gv2.campaign;
    Gv2.campaign = { hintsSeen: {} };
    const first = Gv2.hintOnce('move');
    const again = Gv2.hintOnce('move');
    const ghost2 = Gv2.hintOnce('no_such_hint');
    Gv2.campaign = null;
    const noSave = Gv2.hintOnce('node');
    Gv2.campaign = savedCampaign;
    UIv8.toast = origToast; Gv2.saveCampaign = origSave3;
    console.log('引导：首次', first, '；重复', again, '；未知键', ghost2,
      '；无存档', noSave, '；实际弹出', toasts.length, '次');
    if (!first || again || ghost2 || noSave) throw new Error('引导去重逻辑不对');
    if (toasts.length !== 1 || toasts[0] !== HINTS.move) throw new Error('引导文案不对');
  }

  /* P4.3 立绘路径：PNG 优先、SVG 兜底，角色与 Boss 都走同一条 */
  {
    const { UI: UIv9 } = vm.runInContext('({ UI })', ctx);
    const png = UIv9.portraitPath('yunce');
    const svg = UIv9.portraitSvgPath('yunce');
    const attr = UIv9.portraitFbAttr('yunce');
    const heroHtml = UIv9.portraitHTML('云策');
    const bossHtml = UIv9.portraitHTML('山魈王');
    const npcHtml = UIv9.portraitHTML('庙伯');
    console.log('立绘路径：', png, '｜兜底：', svg);
    console.log('portraitHTML：云策→jpg', heroHtml.indexOf('yunce.jpg') > 0,
      '；山魈王→jpg', bossHtml.indexOf('shanxiao.jpg') > 0,
      '；无立绘 NPC 不出 img', npcHtml.indexOf('<img') < 0);
    if (png !== 'assets/portraits/yunce.jpg') throw new Error('立绘路径不对');
    if (svg !== 'assets/portraits/yunce.svg') throw new Error('SVG 路径不对');
    if (attr.indexOf('yunce.svg') < 0 || attr.indexOf('dataset.fb') < 0) throw new Error('兜底属性不对');
    if (heroHtml.indexOf('yunce.jpg') < 0) throw new Error('角色立绘未用 JPG');
    if (bossHtml.indexOf('shanxiao.jpg') < 0) throw new Error('Boss 立绘未用 JPG');
    if (npcHtml.indexOf('<img') >= 0) throw new Error('无立绘 NPC 不该出 img');
  }

  /* P4.4 横版战斗演出：立绘链解析 / 生命周期 / 克制条 / 绘制不炸 */
  {
    const BV = vm.runInContext('BattleView', ctx);
    const { CHARS: BVCHARS, ENEMY_TYPES: BVETS, Render: BVRender } = vm.runInContext('({ CHARS, ENEMY_TYPES, Render })', ctx);
    const BV_FULL_IDS = vm.runInContext('BV_FULL_IDS', ctx);
    const BV_BUST_IDS = vm.runInContext('BV_BUST_IDS', ctx);
    const BV_VARIANT_ICON = vm.runInContext('BV_VARIANT_ICON', ctx);
    const BV_SUMMON_ICON = vm.runInContext('BV_SUMMON_ICON', ctx);
    const eqPath = (label, got, want) => {
      console.log('  ' + label + ' → ' + got);
      if (got !== want) throw new Error(label + ' 应为 ' + want + '，实际 ' + got);
    };

    /* 1) 立绘链：角色→全身、Boss→胸像、玄阙→全身、杂兵→变体剪影、无美术→null */
    const mkFake = (id, over) => Object.assign({
      id: id, name: '假', side: 'player', hp: 20, x: 1, y: 1,
      stats: { hp: 40, str: 10, mag: 0, skl: 8, spd: 8, lck: 5, def: 5, res: 5 },
      items: [], ranks: {}, statuses: {}, tags: []
    }, over || {});
    const hero = mkFake('bvH', { charId: 'yunce', name: '云策' });
    const boss = mkFake('bvB', { side: 'enemy', name: '山魈王', rawType: 'shanxiao', boss: true, affixes: ['shield'], tags: ['beast'] });
    const xq = mkFake('bvX', { side: 'enemy', name: '玄阙', rawType: 'xuanque', boss: true });
    const wolf = mkFake('bvW', { side: 'enemy', name: '妖狼', rawType: 'wolf', tags: ['beast'] });
    const summon = mkFake('bvS', { side: 'player', name: '山灵狼', rawType: 'ally_wolf', summoned: true });
    const bandit = mkFake('bvN', { side: 'enemy', name: '山贼', rawType: 'bandit', tags: ['human'] });
    eqPath('角色走全身', BV.portraitOf(hero), 'assets/portraits/full/yunce.jpg');
    eqPath('Boss 走胸像', BV.portraitOf(boss), 'assets/portraits/shanxiao.jpg');
    eqPath('玄阙有全身', BV.portraitOf(xq), 'assets/portraits/full/xuanque.jpg');
    eqPath('妖狼走变体剪影', BV.iconOf(wolf), 'assets/icons/units/variant/yaoshou_v1.png');
    eqPath('山灵狼走召唤剪影', BV.iconOf(summon), 'assets/icons/units/summon/jiyinglang.png');
    if (BV.iconOf(bandit) !== null) throw new Error('山贼无变体美术，不该有图标');
    if (BV.portraitOf(bandit) !== null) throw new Error('山贼无立绘，不该有路径');

    /* 2) usable：有美术才开演；双方都只有剪影兜底时留在棋盘 */
    if (!BV.usable(hero, boss)) throw new Error('角色 vs Boss 应开横版');
    if (!BV.usable(hero, wolf)) throw new Error('角色 vs 妖狼（有剪影）应开横版');
    if (BV.usable(bandit, mkFake('bvN2', { side: 'enemy', name: '匪', rawType: 'bandit', tags: ['human'] }))) throw new Error('双方都无美术不该开横版');

    /* 3) 生命周期：begin → strike（承诺会 resolve）→ end → 自动清场 */
    if (!BV.enabled()) throw new Error('横版演出默认应开');
    BV.begin(hero, boss, null);
    if (!BV.active()) throw new Error('begin 后应处于演出中');
    const sc = BV.scene;
    if (sc.atk.name !== '云策' || sc.def.name !== '山魈王') throw new Error('两侧 fighter 快照不对');
    const evHit = { type: 'strike', attacker: hero.id, defender: boss.id, attackerName: '云策', defenderName: '山魈王',
      hit: true, crit: true, dmg: 21, hpAfter: 17, lethal: false, triangle: 'good', effective: true };
    await BV.strike(evHit, 4);   // speed 4 加速，冒烟不拖时间
    if (sc.bar.tri !== '克制') throw new Error('克制条状态不对：' + sc.bar.tri);
    if (!sc.bar.effective) throw new Error('特效徽章未标记');
    if (sc.bar.affixes.indexOf('护盾') < 0) throw new Error('守方护盾词缀未进徽章');
    if (sc.def.hp !== 17) throw new Error('受击方数据未跟进 hpAfter：' + sc.def.hp);
    if (sc.def.down) throw new Error('非致死打击不该标记倒地');
    const evMiss = { type: 'strike', attacker: boss.id, defender: hero.id, hit: false, crit: false, dmg: 0,
      hpAfter: hero.hp, triangle: 'bad', effective: false };
    await BV.strike(evMiss, 4);
    BV.end();
    if (!BV.fading()) throw new Error('end 后应进入淡出');
    await new Promise(r => setTimeout(r, 400));
    if (BV.scene) throw new Error('淡出后场景未清');

    /* 4) 绘制全路径不炸（vm 的 2d 桩吞掉所有 Canvas 调用）：
     *    有立绘（Image 桩不触发 onload → 自动走剪影）、有图标、有特效 */
    BV.begin(hero, boss, null);
    BV.scene.fx = { ev: evHit, t0: Date.now(), dur: 500 };
    BV.scene.bar = BV.barOf(BV.scene, evHit);
    BVRender.draw();
    BV.scene.fx = { ev: evMiss, t0: Date.now(), dur: 500 };
    BVRender.draw();
    BV.scene.closing = true; BV.scene.t1 = Date.now();
    BVRender.draw();
    BV.end();
    await new Promise(r => setTimeout(r, 400));

    /* 5) 资产就位：清单里的每个文件都必须存在（防改名单漏文件） */
    const hasFile = p => fs.existsSync(path.join(ROOT, p));
    const missFull = BV_FULL_IDS.filter(id => !hasFile('assets/portraits/full/' + id + '.jpg'));
    if (missFull.length) throw new Error('全身立绘缺失：' + missFull.join(','));
    const missBust = BV_BUST_IDS.filter(id => !hasFile('assets/portraits/' + id + '.jpg'));
    if (missBust.length) throw new Error('胸像缺失：' + missBust.join(','));
    const iconMiss = [];
    for (const k of Object.keys(BV_VARIANT_ICON)) {
      if (!BVETS[k]) iconMiss.push('敌型 ' + k);
      if (!hasFile('assets/icons/units/variant/' + BV_VARIANT_ICON[k] + '.png')) iconMiss.push(BV_VARIANT_ICON[k]);
    }
    for (const k of Object.keys(BV_SUMMON_ICON)) {
      if (!BVETS[k]) iconMiss.push('敌型 ' + k);
      if (!hasFile('assets/icons/units/summon/' + BV_SUMMON_ICON[k] + '.png')) iconMiss.push(BV_SUMMON_ICON[k]);
    }
    if (iconMiss.length) throw new Error('图标映射缺资产：' + iconMiss.join(','));

    /* 6) 演出中结束战斗：clearBattle 必须清场，防止淡出跨到营地 */
    BV.begin(hero, boss, null);
    BVRender.clearBattle();
    if (BV.scene) throw new Error('clearBattle 未清横版场景');

    /* 7) 关设置后 performCombat 走回棋盘冲斩（不卡流程） */
    const { Game: Gv10 } = vm.runInContext('({ Game })', ctx);
    Gv10.settings.battleShow = false;
    if (BV.enabled()) throw new Error('关设置后 enabled 应为 false');
    Gv10.settings.battleShow = true;
    if (!BV.enabled()) throw new Error('开设置后 enabled 应为 true');

    console.log('横版演出：立绘链 6 项 / usable 3 项 / 生命周期 / 绘制 / 资产 / 清场，均通过');
  }

  /* P4.5 图标化：SVG 图标库 / 技能图标字段解析 / 单位卡小签 / 技能行 */
  {
    const Icons = vm.runInContext('Icons', ctx);
    const { CLASSES: IC, CHARS: ICCHARS } = vm.runInContext('({ CLASSES, CHARS })', ctx);

    /* 1) 基础渲染：svg/tag 形态正确，未知键静默空串 */
    const rootSvg = Icons.svg('root');
    if (rootSvg.indexOf('<svg') < 0 || rootSvg.indexOf('viewBox="0 0 24 24"') < 0) throw new Error('SVG 形态不对');
    if (Icons.svg('no_such_icon') !== '') throw new Error('未知图标应静默为空');
    const chip = Icons.tag('定身');
    if (chip.indexOf('tagchip') < 0 || chip.indexOf('<svg') < 0 || chip.indexOf('定身') < 0) throw new Error('小签形态不对');
    /* 注入字符必须转义 */
    if (Icons.tag('<b>').indexOf('&lt;b&gt;') < 0) throw new Error('小签未转义');

    /* 2) 技能图标按效果字段解析：每条规则一个代表 */
    const cases = [
      [{ summon: 2 }, 'summon'], [{ healBonus: 4 }, 'heal'], [{ songPower: 3 }, 'song'],
      [{ dmg: 2 }, 'blade'], [{ critVsArmor: 10 }, 'blade'], [{ crit: 12 }, 'spark'],
      [{ hit: 5 }, 'hit'], [{ hitVsFlying: 15 }, 'hit'], [{ adjacentAllyHit: 5 }, 'hit'],
      [{ avoidFlat: 5 }, 'feather'], [{ avoidOnNode: 10 }, 'feather'],
      [{ def: 3 }, 'wall'], [{ res: 2 }, 'wall'], [{ move: 1 }, 'move'], [{ mag: 2 }, 'mag'],
      [{ movePenaltyOnHit: 1 }, 'slow'], [{ weapon: 'sword' }, 'skill']
    ];
    for (const [skill, want] of cases) {
      const got = Icons.skillKey(skill);
      if (got !== want) throw new Error('技能图标解析 ' + JSON.stringify(skill) + ' → ' + got + '，应为 ' + want);
      if (!Icons.has(got)) throw new Error('图标键不存在：' + got);
    }
    /* 全量：游戏里每个技能都必须解析到已存在的图标（防新增技能漏图标） */
    const allSkills = [];
    for (const c of Object.values(IC)) if (c.skill) allSkills.push(c.skill);
    for (const ch of Object.values(ICCHARS)) { if (ch.personal) allSkills.push(ch.personal); if (ch.personal2) allSkills.push(ch.personal2); }
    const badSkill = allSkills.find(s => !Icons.has(Icons.skillKey(s)));
    if (badSkill) throw new Error('有技能解析到缺失图标：' + (badSkill.name || '?'));
    console.log('图标库：', allSkills.length, '个技能全部有图标；规则', cases.length, '条全对');

    /* 3) 单位卡小签带图标（状态 + 词缀 + 指令态） */
    const { UI: UIv11 } = vm.runInContext('({ UI })', ctx);
    const fakeU = {
      id: 'ic1', name: '云策', side: 'player', charId: 'yunce', cls: 'swordsman', level: 5,
      hp: 12, stats: { hp: 40, str: 10, mag: 0, skl: 8, spd: 8, lck: 5, def: 5, res: 5 },
      items: [{ key: 'iron_sword', uses: 20 }], weaponIndex: 0, ranks: { sword: 'C' },
      statuses: { def: { val: -3 }, avoid: { val: -10 }, root: { val: 1 }, movePenalty: { val: 1 } },
      affixes: ['shield'], tags: ['human'], escaped: false
    };
    /* unitCard 直接写 DOM；用桩元素接住 innerHTML */
    const cardEl = { classList: { add() {}, remove() {}, contains: () => false }, innerHTML: '', style: {} };
    const savedCard = UIv11.el.unitCard;
    UIv11.el.unitCard = cardEl;
    UIv11.unitCard(fakeU, { phaseIndex: 3 });
    UIv11.el.unitCard = savedCard;
    const html = cardEl.innerHTML;
    for (const t of ['破甲', '迷眼', '定身', '移速下降', '护盾']) {
      if (html.indexOf(t) < 0) throw new Error('单位卡缺标签：' + t);
    }
    if ((html.match(/tagchip/g) || []).length < 5) throw new Error('单位卡小签未带图标');
    if (html.indexOf('<svg') < 0) throw new Error('单位卡未渲染 SVG 图标');

    /* 4) 营地技能行带图标（职业技/个人技/继承技三条都走） */
    const { Camp: ICAMP } = vm.runInContext('({ Camp })', ctx);
    const detail = ICAMP.unitDetail({ id: 'yunce', cls: 'swordsman', level: 5, exp: 0,
      stats: { hp: 40, str: 10, mag: 0, skl: 8, spd: 8, lck: 5, def: 5, res: 5 },
      ranks: {}, rankPts: {}, items: [], inherited: [] });
    if (detail.indexOf('unit-skillline') < 0) throw new Error('技能行缺失');
    if (detail.indexOf('<svg') < 0) throw new Error('技能行未带图标');
    console.log('单位卡小签带图标 / 营地技能行带图标，均通过');
  }

  /* P4.6 机制说明库：营地「机制」页签渲染四组全部条目 */
  {
    const { Camp: MCCamp, MECHANICS: MCM, MECHANICS_GROUPS: MCG } =
      vm.runInContext('({ Camp, MECHANICS, MECHANICS_GROUPS })', ctx);
    const mechBody = el();
    MCCamp.renderMechanics(mechBody);
    const html = mechBody.innerHTML;
    const cards = (html.match(/mech-card/g) || []).length;
    const groups = (html.match(/mech-group/g) || []).length;
    const icons = (html.match(/<svg/g) || []).length;
    console.log('机制页：条目', cards, '；分组', groups, '；图标', icons, '；总数', MCM.length);
    if (cards !== MCM.length) throw new Error('机制条目数与数据不符');
    if (groups !== Object.keys(MCG).length) throw new Error('机制分组数与数据不符');
    if (icons !== MCM.length) throw new Error('机制条目未全部带图标');
    if (html.indexOf('机 制 说 明') < 0) throw new Error('机制页标题缺失');
    /* 每条都能按 id 锚定（页内直达用） */
    const missAnchor = MCM.filter(m => html.indexOf('mech-' + m.id) < 0);
    if (missAnchor.length) throw new Error('缺锚点：' + missAnchor.map(m => m.id).join(','));
    /* 图标键全部存在于图标库 */
    const Icons2 = vm.runInContext('Icons', ctx);
    const badIcon = MCM.filter(m => !Icons2.has(MCCamp.mechIcon(m.id)));
    if (badIcon.length) throw new Error('机制图标键缺失：' + badIcon.map(m => m.id).join(','));
    console.log('机制页渲染：四组全量 + 锚点 + 图标，均通过');
  }

  /* P4.7 人物关系图：关系网渲染 / 选中高亮 / 动作分发 / 常量文案 */
  {
    const { Camp: RC, Relations: RR, Game: RG, CHARS: RCCHARS, SUPPORTS: RSUP } =
      vm.runInContext('({ Camp, Relations, Game, CHARS, SUPPORTS })', ctx);
    const CombatR = vm.runInContext('Combat', ctx);

    /* 1) 假档：4 人在队、1 人殁、若干羁绊点 */
    const fake = {
      roster: ['yunce', 'luming', 'yankui', 'bailu'].map(id => ({ id: id })),
      fallen: ['moya'],
      supports: { yunce_luming: 25, yunce_yankui: 60, bailu_luming: 95 }
    };
    RR.sel = null;
    const html = RR.html(fake);
    const nodes = (html.match(/rel-n n-/g) || []).length;
    const hits = (html.match(/rel-hit/g) || []).length;
    const edges = (html.match(/rel-e e-/g) || []).length;
    const clips = (html.match(/id="relclip-/g) || []).length;
    console.log('关系图：节点', nodes, '；边', hits, '；可见边', edges, '；裁剪', clips);
    if (nodes !== RR.netIds().length) throw new Error('关系网节点数不对');
    if (hits !== RSUP.length || edges !== RSUP.length) throw new Error('关系网边数不对');
    if (clips !== nodes) throw new Error('头像裁剪路径缺失');
    for (const p of RSUP) {
      if (html.indexOf('data-pair="' + p.id + '"') < 0) throw new Error('缺边：' + p.id);
    }
    /* 每个节点：头像 jpg → svg 兜底 → 姓名首字 */
    for (const id of RR.netIds()) {
      if (html.indexOf('data-id="' + id + '"') < 0) throw new Error('缺节点：' + id);
      if (html.indexOf('assets/portraits/' + id + '.jpg') < 0) throw new Error('缺头像：' + id);
      if (html.indexOf(RCCHARS[id].name.charAt(0)) < 0) throw new Error('缺首字兜底：' + id);
    }
    if (html.indexOf('n-fallen') < 0 || html.indexOf('已殁') < 0) throw new Error('殁者标记缺失');
    if (html.indexOf('未入队') < 0) throw new Error('未入队标记缺失');
    if (html.indexOf('独行：') < 0 || html.indexOf(RCCHARS.xiewuyi.name) < 0) throw new Error('独行者缺失');
    /* 边等级样式与 Combat.supportRank 一致 */
    const e1 = RR.edgeInfo(fake, RSUP.find(p => p.id === 'yunce_luming'));
    if (e1.key !== 'C' || e1.rank !== CombatR.supportRank(25)) throw new Error('边等级样式不对');
    if (RR.edgeInfo(fake, RSUP.find(p => p.id === 'xuanyi_chisang')).key !== 'lock') throw new Error('未同行应为虚线');

    /* 2) 选中人物：点亮本人与全部关联，其余变暗 */
    RR.selectChar('yunce');
    const html2 = RR.html(fake);
    const litN = (html2.match(/rel-n n-\w+ lit/g) || []).length;
    const dimN = (html2.match(/rel-n n-\w+ dim/g) || []).length;
    const litE = (html2.match(/rel-e e-\w+ lit/g) || []).length;
    const dimE = (html2.match(/rel-e e-\w+ dim/g) || []).length;
    const deg = RR.pairsOf('yunce').length;
    console.log('选中云策：关联', litN, '人 /', litE, '组；变暗', dimN, '人 /', dimE, '组');
    if (litN !== deg + 1 || dimN !== nodes - deg - 1) throw new Error('人物选中高亮不对');
    if (litE !== deg || dimE !== RSUP.length - deg) throw new Error('人物选中连线高亮不对');
    if (html2.indexOf('n-sel') < 0) throw new Error('选中节点缺光环');
    if (html2.indexOf('rel-prow') < 0) throw new Error('侧栏缺羁绊行');
    /* 再点一次取消 */
    RR.selectChar('yunce');
    if (RR.sel !== null) throw new Error('再次点击应取消选中');

    /* 3) 选中连线 */
    RR.selectPair('bailu_luming');
    const html3 = RR.html(fake);
    if ((html3.match(/rel-e e-\w+ lit/g) || []).length !== 1) throw new Error('连线选中应只点亮一条');
    if ((html3.match(/rel-n n-\w+ lit/g) || []).length !== 2) throw new Error('连线选中应只点亮两端');
    if (html3.indexOf('已达最高羁绊') < 0) throw new Error('满级文案缺失');
    RR.clear();
    if (RR.sel !== null) throw new Error('clear 未清空选中');

    /* 4) 动作分发走 Camp.handleAction（SVG 元素带 data-act） */
    const savedTab = RC.tab;
    RC.tab = 'relations';
    await RC.handleAction({ dataset: { act: 'relChar', id: 'luming' } });
    if (!RR.sel || RR.sel.type !== 'char' || RR.sel.id !== 'luming') throw new Error('relChar 动作未生效');
    await RC.handleAction({ dataset: { act: 'relPair', pair: 'yunce_luming' } });
    if (!RR.sel || RR.sel.type !== 'pair') throw new Error('relPair 动作未生效');
    await RC.handleAction({ dataset: { act: 'relClear' } });
    if (RR.sel !== null) throw new Error('relClear 动作未生效');
    await RC.handleAction({ dataset: { act: 'relGoto' } });
    if (RC.tab !== 'support') throw new Error('relGoto 未跳到羁绊页');
    RC.tab = savedTab;

    /* 5) 整页渲染进 DOM 桩 + Camp.render 全链路 */
    const relBody = el();
    RC.renderRelations(relBody);
    if (relBody.innerHTML.indexOf('人 物 关 系') < 0) throw new Error('关系页标题缺失');
    if (relBody.innerHTML.indexOf('rel-svg') < 0) throw new Error('关系页 SVG 缺失');
    RG.campaign = fake;
    RC.tab = 'relations';
    RC.render();
    RC.tab = savedTab;
    RG.campaign = null;
    console.log('关系图：选中高亮 / 动作分发 / 整页渲染，均通过');
  }

  /* 二期 G：打击感 Juice（存在性 / 冻结语义 / reduced / 实战接入 / 跳过清零） */
  {
    const J = vm.runInContext('Juice', ctx);
    if (!J || typeof J.update !== 'function') throw new Error('Juice 未加载');
    const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
    /* 静态接线断言（防回归） */
    const bs = src('js/battle.js'), rs = src('js/render.js'), ms = src('js/main.js'), bvs = src('js/render-battleview.js');
    if (bs.indexOf('Juice.critWindUp') < 0 || bs.indexOf('Juice.hitFromEv') < 0) throw new Error('battle.js 缺 Juice 接线');
    if (rs.indexOf('Juice.now()') < 0 || rs.indexOf('Juice.drawFx') < 0) throw new Error('render.js 缺 Juice 接线');
    if (ms.indexOf('Juice.update') < 0) throw new Error('main.js 缺 Juice.update');
    if (bvs.indexOf('Juice.now()') < 0) throw new Error('render-battleview.js 缺冻结时钟接线');
    if (src('js/juice.js').indexOf('Combat.') >= 0) throw new Error('Juice 不许碰公式');
    /* 冻结语义：顿帧期时钟停走、update 返回 0，帧数到点恢复 */
    J.clearAll();
    J.update(16);
    const c0 = J.now();
    J.freeze(4 / 60);
    let dt = J.update(16);
    if (dt !== 0 || J.now() !== c0) throw new Error('顿帧期时钟未停走');
    if (J.update(16) !== 0) throw new Error('顿帧未按帧数解除');
    for (let i = 0; i < 5; i++) J.update(16);   // 4/60s ≈ 4.2 帧，5 帧必恢复
    if (J.now() <= c0) throw new Error('顿帧后时钟未恢复');
    /* 倍速：顿帧按比例缩短 */
    J.clearAll();
    J.freeze(4 / 60 / 2);
    if (J.hitstop > 4 / 60) throw new Error('倍速顿帧未缩短');
    /* reduced：只留 2 帧顿帧，不产粒子/闪白/震屏 */
    J.clearAll();
    Game.settings.reducedMotion = true;
    J.hit({ crit: true, kill: false, x: 1, y: 1, dir: 1, speed: 1, unitId: 'u1' });
    if (J.particles.length !== 0 || J.flash !== 0 || J.trauma !== 0) throw new Error('reduced 模式应只留顿帧');
    if (J.hitstop <= 0 || J.hitstop > 4 / 60) throw new Error('reduced 模式顿帧应为 2 帧');
    Game.settings.reducedMotion = false;
    /* 实战接入：一次命中后 Juice 有状态（顿帧/粒子/击退）。
     * 注意：前面的区块重开过战斗，B 是旧对象——必须重新取 Battle.B；
     * 摆位保证命中 100（铁剑 90 + 技×2 对 速0/运0 的Plain 木桩）。 */
    J.clearAll();
    const BB = Battle.B;
    const p = BB.units.find(x => x.side === 'player' && x.charId && x.hp > 0);
    p.items = [{ key: 'iron_sword', uses: 20 }];
    p.weaponIndex = 0;
    const rows = BB.chapter.map;
    let spot = null;
    for (let y = 0; y < rows.length && !spot; y++) {
      for (let x = 0; x + 1 < rows[y].length; x++) {
        if (rows[y][x] === '.' && rows[y][x + 1] === '.') { spot = { x, y }; break; }
      }
    }
    if (!spot) throw new Error('找不到相邻平地摆位');
    p.x = spot.x; p.y = spot.y;
    const dummy2 = { id: 'du2', name: '木桩二', side: 'enemy', charId: null, hp: 999, x: spot.x + 1, y: spot.y,
      stats: { hp: 999, str: 1, mag: 0, skl: 0, spd: 0, lck: 0, def: 1, res: 1 },
      items: [], weaponIndex: -1, ranks: {}, statuses: {}, tags: ['human'] };
    BB.units.push(dummy2);
    await Battle.performCombat(p, dummy2, false);
    const engaged = J.hitstop > 0 || J.particles.length > 0 || !!J.knock['du2'] || !!J.falls['du2'];
    console.log('Juice：命中接入', engaged ? '生效' : '未生效', '；粒子', J.particles.length, '；击退', !!J.knock['du2'], '；倒地', !!J.falls['du2']);
    if (!engaged) throw new Error('命中未触发打击感');
    J.clearAll();
    if (J.hitstop !== 0 || J.particles.length !== 0) throw new Error('clearAll 未清零');
    /* 死亡定格：handleDeath 挂卡 + 阵亡簿记 */
    const victim = BB.units.find(x => x.side === 'player' && x.charId && x.hp > 0 && x.charId !== 'yunce');
    if (!victim) throw new Error('找不到可阵亡的我方单位');
    const lostBefore = BB.stats.lost;
    await Battle.handleDeath(victim, p);
    console.log('死亡定格：', J.deathCard ? (J.deathCard.name + '——' + J.deathCard.line) : '未挂卡');
    if (!J.deathCard || J.deathCard.name !== victim.name) throw new Error('死亡定格卡未挂');
    if (J.deathCard.line !== vm.runInContext('EPITAPHS', ctx)[victim.charId]) throw new Error('遗言未取 EPITAPHS');
    if (BB.stats.lost !== lostBefore + 1) throw new Error('阵亡簿记未加一');
    J.clearAll();
    BB.units = BB.units.filter(u => u.id !== 'du2');
    console.log('打击感：冻结语义 / 倍速缩短 / reduced / 实战接入 / 跳过清零，均通过');
  }

  /* H-P1 物品图标：商店/打造坊/兵装行/行囊行接 SVG 程序图，未知 id 不回退文字 */
  {
    const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
    const { ItemIcons, WEAPONS, ITEMS, SPELLS, Camp } =
      vm.runInContext('({ ItemIcons, WEAPONS, ITEMS, SPELLS, Camp })', ctx);
    vm.runInContext('(c) => { Game.campaign = c; }', ctx)(camp);
    Camp.shopTab = 'weapon';
    const shopB = el();
    Camp.renderShop(shopB);
    const forgeB = el();
    Camp.renderForge(forgeB);
    console.log('商店图标：含 SVG data URI =', shopB.innerHTML.indexOf('data:image/svg+xml') >= 0,
                '；打造坊 =', forgeB.innerHTML.indexOf('data:image/svg+xml') >= 0);
    if (shopB.innerHTML.indexOf('data:image/svg+xml') < 0) throw new Error('商店行未接物品图标');
    if (forgeB.innerHTML.indexOf('data:image/svg+xml') < 0) throw new Error('打造坊未接物品图标');
    const yunceRec3 = camp.roster.find(x => x.id === 'yunce');
    yunceRec3.items = [{ key: 'iron_sword', uses: 20, plus: 0 }];
    yunceRec3.weaponIndex = 0;
    camp.convoy = [{ key: 'potion', uses: 2 }, { key: 'mat_iron', uses: 1 }];
    const detail3 = Camp.unitDetail(yunceRec3);
    console.log('兵装行/行囊行图标：含 SVG =', detail3.indexOf('data:image/svg+xml') >= 0);
    if (detail3.indexOf('data:image/svg+xml') < 0) throw new Error('兵装/行囊行未接物品图标');
    /* 覆盖校验：数据表每个 key 都有图，未知 id 返回空（调用方落文字，不炸） */
    const all = [].concat(Object.keys(WEAPONS), Object.keys(ITEMS), Object.keys(SPELLS));
    let noIcon = 0;
    for (const key of all) if (!ItemIcons.uriFor(key)) noIcon++;
    console.log('图标覆盖：', all.length - noIcon, '/', all.length, '（缺图', noIcon, '）');
    if (noIcon !== 0) throw new Error('有数据表条目缺图标');
    if (ItemIcons.iconHTML('__nope__') !== '') throw new Error('未知 id 应渲染为空');
    /* 静态接线：预测/单位卡/灵术菜单 */
    if (src('js/ui.js').indexOf("ItemIcons.iconHTML(w.item.key") < 0) throw new Error('ui.js 单位卡未接图标');
    if (src('js/ui.js').indexOf('ItemIcons.iconHTML(weapon.item.key') < 0) throw new Error('ui.js 战斗预测未接图标');
    if (src('js/battle.js').indexOf('ItemIcons.iconHTML(sp.key') < 0) throw new Error('battle.js 灵术菜单未接图标');
    if (src('js/item-icons.js').indexOf('Combat.') >= 0) throw new Error('图标库不许碰公式');
    camp.convoy = [];
    console.log('H-P1 图标化：渲染接入 / 全表覆盖 / 未知回退 / 呈现层纯洁，均通过');
  }

  console.log('\n冒烟通过：无引用错误');
})().catch(e => { console.error('冒烟失败：', e); process.exit(1); });
