/* ============================================================
 * 美术进度体检：哪些角色的立绘还是占位图？
 *
 *   node dev/check-art.js
 *
 * 判定方式：`assets/portraits/_placeholder.json` 里记着每张占位图生成时的
 * sha1。文件名一样但内容变了 = 你已经换成正式美术了，脚本自动认出来。
 * 换成正式图后**不用改任何代码**，直接再跑一次这个脚本就能看到进度。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const POR = path.join(ROOT, 'assets', 'portraits');
const ICON = path.join(ROOT, 'assets', 'icons', 'units');
const MANIFEST = path.join(POR, '_placeholder.json');
const sha1 = buf => crypto.createHash('sha1').update(buf).digest('hex');

/* 角色名单以 data-core.js 为准，避免手抄漏人 */
const src = fs.readFileSync(path.join(ROOT, 'js/data-core.js'), 'utf8');
const order = /const HERO_ORDER = \[([^\]]+)\]/.exec(src);
const ids = order ? order[1].match(/'([a-z]+)'/g).map(s => s.replace(/'/g, '')) : [];

const names = {};
for (const m of src.matchAll(/id: '([a-z]+)', name: '([^']+)'/g)) names[m[1]] = m[2];

let manifest = {};
try { manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) || {}; } catch (e) { manifest = {}; }

const has = (dir, f) => fs.existsSync(path.join(dir, f));

const pending = [], done = [], missing = [];
for (const id of ids) {
  const f = path.join(POR, id + '.jpg');
  if (!has(POR, id + '.jpg')) { missing.push(id); continue; }
  const stamp = manifest[id];
  const same = stamp && sha1(fs.readFileSync(f)) === stamp;
  (same ? pending : done).push(id);
}

/* 变体缺口（不影响能看，但会影响演出质量） */
const lacks = (suffix, dir = POR) => ids.filter(id => !has(dir, id + suffix));

const pad = s => (s + '                    ').slice(0, 14);
console.log('\n== 立绘进度（共 ' + ids.length + ' 人）==\n');
console.log('  已换成正式美术 ' + done.length + ' 人：' + (done.map(i => names[i] || i).join('、') || '—'));
console.log('  仍是占位图   ' + pending.length + ' 人：' + (pending.map(i => names[i] || i).join('、') || '—'));
if (missing.length) console.log('  ⚠️ 完全缺图   ' + missing.length + ' 人：' + missing.map(i => names[i] || i).join('、'));

console.log('\n== 变体缺口 ==\n');
const rows = [
  ['hurt 受击', lacks('_hurt.jpg'), 'assets/portraits/<id>_hurt.jpg'],
  ['resolve 决意', lacks('_resolve.jpg'), 'assets/portraits/<id>_resolve.jpg'],
  ['单位图标', lacks('.png', ICON), 'assets/icons/units/<id>.png']
];
for (const [label, list, where] of rows) {
  console.log('  ' + pad(label) + (list.length ? list.map(i => names[i] || i).join('、') : '齐') +
    (list.length ? '   → ' + where : ''));
}

console.log('\n提示：正式图放好跑 node dev/pack-art.js，再跑本脚本复核。');
console.log('清单见 docs/待生成素材清单.md §六。\n');
