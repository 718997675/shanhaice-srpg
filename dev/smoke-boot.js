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
               'js/systems/terrain.js', 'js/camp.js', 'js/game.js'];

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

  console.log('\n冒烟通过：无引用错误');
})().catch(e => { console.error('冒烟失败：', e); process.exit(1); });
