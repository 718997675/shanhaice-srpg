/* 关系网布局体检：算交叉数 / 最小圆心距 / 出界。
 * 用法：node dev/check-rel.js
 * 改 js/relations.js 的 SEED 后跑一次，零交叉再提交。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
const ctx = vm.createContext({ console, Math, JSON });
for (const f of ['js/data-core.js', 'js/data-systems.js', 'js/relations.js', 'js/combat.js']) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
}
const { Relations, SUPPORTS, CHARS } = vm.runInContext('({ Relations, SUPPORTS, CHARS })', ctx);
Relations._lay = null;
const lay = Relations.layout();
const net = Relations.netIds();
const R = Relations.R, W = Relations.W, H = Relations.H;

const pt = id => ({ x: lay[id].x, y: lay[id].y });
const side = (o, p, q) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
const segCross = (a, b, c, d) => {
  const d1 = side(a, b, c), d2 = side(a, b, d), d3 = side(c, d, a), d4 = side(c, d, b);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
};
const bad = [];
for (let i = 0; i < SUPPORTS.length; i++) for (let j = i + 1; j < SUPPORTS.length; j++) {
  const p = SUPPORTS[i], q = SUPPORTS[j];
  if (p.a === q.a || p.a === q.b || p.b === q.a || p.b === q.b) continue;
  if (segCross(pt(p.a), pt(p.b), pt(q.a), pt(q.b))) bad.push(p.id + ' × ' + q.id);
}
let minD = Infinity, minPair = '';
for (let i = 0; i < net.length; i++) for (let j = i + 1; j < net.length; j++) {
  const a = lay[net[i]], b = lay[net[j]];
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  if (d < minD) { minD = d; minPair = net[i] + '-' + net[j]; }
}
const out = net.filter(id => {
  const p = lay[id];
  return p.x < R || p.x > W - R || p.y < R || p.y > H - R;
});
console.log('节点 ' + net.length + ' / 连线 ' + SUPPORTS.length);
console.log('交叉 ' + bad.length + (bad.length ? ': ' + bad.join(' | ') : ''));
console.log('最小圆心距 ' + minD.toFixed(1) + '（要求 ≥ ' + (R * 2 + 14) + '，' + minPair + '）');
console.log('出界 ' + (out.join(',') || '无'));
for (const id of net) console.log('  ' + id + ': [' + lay[id].x + ', ' + lay[id].y + ']');
