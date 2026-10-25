/* 舆图布局体检：节点出界 / 太挤 / 连线交叉 / SVG 缺章
 * 用法：node dev/check-map.js [--dump]
 *   --dump 额外把一张「全通关」的舆图写成 dev/out-map.html，浏览器里可看
 * 手摆坐标的回归网：改 WM_NODES / WM_EDGES 之后跑一遍，交叉数应为 0。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ctx = vm.createContext({ console, Math });
const load = f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });

/* worldmap.js 依赖 Route / Render.PALETTES / UI，给最小桩 */
ctx.UI = {
  escape: s => String(s == null ? '' : s),
  chapterLabel: n => '第' + n + '章'
};
ctx.Render = {
  PALETTES: {
    mountain: { tint: '#8fa18a' }, bamboo: { tint: '#7f9a7b' }, river: { tint: '#7e9aa0' },
    fortress: { tint: '#a88662' }, ice: { tint: '#8aa5ad' }, swamp: { tint: '#859474' },
    ruins: { tint: '#9b9481' }, void: { tint: '#7e898d' }
  }
};

load('js/rng.js');
load('js/data-core.js');
load('js/data-systems.js');
load('js/data-maps.js');
load('js/systems/route.js');
load('js/systems/worldmap.js');

const WM = vm.runInContext('WorldMap', ctx);
const CHAPTERS = vm.runInContext('CHAPTERS', ctx);
const Route = vm.runInContext('Route', ctx);

let fail = 0;
const bad = m => { fail++; console.error('  ✗ ' + m); };
const ok = m => console.log('  ✓ ' + m);

/* ---------- 1. 覆盖：每章都有节点，每个节点都有章 ---------- */
console.log('\n[覆盖]');
for (const ch of CHAPTERS) {
  if (!WM.at(ch.id)) bad('章节缺节点 ' + ch.id + ' ' + ch.name);
}
for (const id of Object.keys(WM.nodes)) {
  if (!Route.byId(id) && !Route.byId(Number(id))) bad('节点没有对应章节 ' + id);
}
const nodeIds = Array.from(new Set(Object.keys(WM.nodes).map(String)));
const nodeIdSet = new Set(nodeIds);
for (const e of WM.edges) {
  if (!nodeIdSet.has(String(e[0])) || !nodeIdSet.has(String(e[1]))) bad('连线引用了不存在的节点 ' + e.join('-'));
}
if (!fail) ok('16 章 ↔ ' + Object.keys(WM.nodes).length + ' 节点一一对应，' + WM.edges.length + ' 条连线合法');

/* ---------- 2. 边界：圆心与文字都要留在画布内 ---------- */
console.log('\n[边界]');
const PAD = 30;      // 圆半径 13 + 名字高度
for (const id of nodeIds) {
  const p = WM.at(id);
  if (p.x < PAD || p.x > WM.W - PAD) bad('节点越界(横) ' + id + ' x=' + p.x);
  if (p.y < PAD || p.y > WM.H - PAD) bad('节点越界(纵) ' + id + ' y=' + p.y);
}
if (!fail) ok('全部节点含文字空间都在 ' + WM.W + '×' + WM.H + ' 内');

/* ---------- 3. 间距：两圆不能挤在一起 ---------- */
console.log('\n[间距]');
const MIN_D = 62;
let minD = Infinity, minPair = '';
for (let i = 0; i < nodeIds.length; i++) {
  for (let j = i + 1; j < nodeIds.length; j++) {
    const a = WM.at(nodeIds[i]), b = WM.at(nodeIds[j]);
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d < minD) { minD = d; minPair = nodeIds[i] + '-' + nodeIds[j]; }
  }
}
if (minD < MIN_D) bad('最近两节点 ' + minPair + ' 仅 ' + minD.toFixed(1) + 'px（阈值 ' + MIN_D + '）');
else ok('最近两节点 ' + minPair + ' = ' + minD.toFixed(1) + 'px（阈值 ' + MIN_D + '）');

/* ---------- 4. 交叉：连线不能互相穿过 ---------- */
console.log('\n[连线交叉]');
const seg = (p1, p2) => [p1, p2];
const cross = (a, b) => {
  const d = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const [p1, p2] = a, [p3, p4] = b;
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2), d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
};
let crosses = 0;
const sharesEnd = (a, b) =>
  String(a[0]) === String(b[0]) || String(a[0]) === String(b[1]) ||
  String(a[1]) === String(b[0]) || String(a[1]) === String(b[1]);
for (let i = 0; i < WM.edges.length; i++) {
  for (let j = i + 1; j < WM.edges.length; j++) {
    if (sharesEnd(WM.edges[i], WM.edges[j])) continue;
    const A = seg(WM.at(WM.edges[i][0]), WM.at(WM.edges[i][1]));
    const B = seg(WM.at(WM.edges[j][0]), WM.at(WM.edges[j][1]));
    if (cross(A, B)) { crosses++; bad('连线交叉 ' + WM.edges[i].join('-') + ' × ' + WM.edges[j].join('-')); }
  }
}
if (!crosses) ok(WM.edges.length + ' 条连线零交叉');

/* ---------- 5. 渲染：三种进度都要出得全 ---------- */
console.log('\n[渲染]');
const mkCampaign = (chapter, route, clearedIds) => ({
  chapter, route: route || null,
  records: { chapters: {} },
  roster: [{ id: 'yunce' }],
  strategy: null,
  ...(clearedIds ? { records: { chapters: clearedIds.reduce((m, id) => (m[id] = { turns: 5, kills: 3, lost: 0, side: true }, m), {}) } } : {})
});
const cases = [
  ['开局', mkCampaign(1, null, [])],
  ['A 线中段', mkCampaign('6A', 'A', [1, 2, 3, 4, '5A'])],
  ['B 线中段', mkCampaign('7B', 'B', [1, 2, 3, 4, '5B', '6B'])],
  ['下海', mkCampaign(11, 'A', [1, 2, 3, 4, '5A', '6A', '7A', 8, 9, 10])],
  ['已通关', mkCampaign(null, 'B', [1, 2, 3, 4, '5B', '6B', '7B', 8, 9, 10, 11, 12, 13])]
];
for (const [name, c] of cases) {
  const svg = WM.svg(c, WM.pickDefault(c));
  const nodes = (svg.match(/class="wm-node /g) || []).length;
  /* 只数主路，别把 .wm-road-under（描边底）算进去 */
  const roads = (svg.match(/class="wm-road(?![-\w])/g) || []).length;
  const cur = (svg.match(/is-current/g) || []).length;
  const dead = (svg.match(/is-abandoned/g) || []).length;
  if (nodes !== 16) bad(name + '：节点数 ' + nodes + ' ≠ 16（十六个节点应一次画全）');
  if (roads !== WM.edges.length) bad(name + '：道路数 ' + roads + ' ≠ ' + WM.edges.length);
  if (cur > 1) bad(name + '：当前章多于一个（' + cur + '）');
  if (c.route && dead !== 3) bad(name + '：未走之路应恰为 3 章（got ' + dead + '）');
  if (!c.route && dead) bad(name + '：未定路线时不该有未走之路');
  if (!/<\/svg>$/.test(svg)) bad(name + '：SVG 未闭合');
  if (!fail) ok(name + '：' + nodes + ' 节点 / ' + roads + ' 道路 / 当前 ' + cur + ' / 未走 ' + dead);
}

/* ---------- 6. 状态机 ---------- */
console.log('\n[状态]');
const c2 = mkCampaign('5A', 'A', [1, 2, 3, 4]);
const expect = {
  '1': 'cleared', '4': 'cleared', '5A': 'current',
  '6A': 'locked', '5B': 'abandoned', '8': 'locked'
};
for (const id of Object.keys(expect)) {
  const got = WM.stateOf(c2, id);
  if (got !== expect[id]) bad('stateOf(' + id + ') = ' + got + '，应为 ' + expect[id]);
}
const c3 = mkCampaign(8, 'A', [1, 2, 3, 4, '5A', '6A', '7A']);
if (WM.stateOf(c3, '5B') !== 'abandoned') bad('汇合后未走之路应仍为 abandoned');
if (WM.pickDefault(c3) !== '8') bad('pickDefault 应指向当前章 8（got ' + WM.pickDefault(c3) + '）');
if (!fail) ok('cleared / current / locked / abandoned 判定正确，pickDefault 落在当前章');

/* ---------- 7. 可选：导出一张图看 ---------- */
if (process.argv.includes('--dump')) {
  const c = cases[4][1];
  const html = '<!doctype html><meta charset="utf-8"><title>舆图</title>' +
    '<style>body{margin:0;background:#0d1210;display:flex;align-items:center;justify-content:center;height:100vh}' +
    '.sheet{width:min(1200px,96vw);background:linear-gradient(150deg,#f0e7d3,#d4c4a4);padding:12px;border-radius:4px}' +
    '.wm-svg{width:100%;height:auto;display:block}' +
    '.wm-road{fill:none;stroke:#8a6a34;stroke-opacity:.38;stroke-width:1.6;stroke-dasharray:6 6}' +
    '.wm-road.done{stroke:#9e3b32;stroke-opacity:.62;stroke-width:2.2;stroke-dasharray:none}' +
    '.wm-road.dead{stroke-opacity:.16;stroke-width:1.2;stroke-dasharray:2 7}' +
    '.wm-hill path{fill:#4a5342;fill-opacity:.13;stroke:#3f4636;stroke-opacity:.3;stroke-width:.9}' +
    '.wm-hill-ridge{fill:none;stroke:#3f4636;stroke-opacity:.26;stroke-width:.8}' +
    '.wm-wave{fill:none;stroke:#4f7d7c;stroke-opacity:.3;stroke-width:1.2}' +
    '.wm-wash{opacity:.1}.wm-coast{fill:none;stroke:#6f8f88;stroke-opacity:.35;stroke-dasharray:5 4}' +
    '.wm-region{font-family:serif;font-size:15px;letter-spacing:.22em;fill:#6b6448;fill-opacity:.42;text-anchor:middle}' +
    '.wm-dot{fill:#efe5cd;stroke:#8a6a34;stroke-width:1.8}.wm-no{font-size:11px;font-weight:700;fill:#6b6448;text-anchor:middle}' +
    '.wm-name{font-family:serif;font-size:11.5px;fill:#4a4738;text-anchor:middle}.wm-tag{font-size:8.5px;fill:#9a927a;text-anchor:middle}' +
    '.wm-hit{fill:transparent}.wm-line-badge{fill:#6b6448}.wm-line-text{font-size:8px;fill:#f2e8d0;text-anchor:middle}' +
    '.wm-node.is-cleared .wm-dot{fill:#9e3b32;stroke:#6d281f}.wm-node.is-cleared .wm-no{fill:#f6ead2}' +
    '.wm-node.is-current .wm-dot{fill:#d3ab5e;stroke:#8a6a34;stroke-width:2.6}.wm-node.is-current .wm-name{font-weight:600}' +
    '.wm-node.is-locked .wm-dot{fill:#e8dfc7;stroke:#a79c80;stroke-dasharray:3 3}.wm-node.is-locked .wm-no{fill:#9a927a}' +
    '.wm-node.is-abandoned .wm-dot{fill:#dcd6c3;stroke:#a79c80;stroke-dasharray:2 4;opacity:.8}' +
    '.wm-pulse{fill:none;stroke:#9e3b32;stroke-width:1.6}.wm-flag path{fill:#9e3b32;stroke:#6d281f}' +
    '</style><div class="sheet">' + WM.svg(c, '12') + '</div>';
  const out = path.join(__dirname, 'out-map.html');
  fs.writeFileSync(out, html);
  console.log('\n已导出 ' + out);
}

console.log(fail === 0 ? '\n舆图体检通过' : '\n舆图体检有 ' + fail + ' 处问题');
process.exitCode = fail ? 1 : 0;
