/* ============================================================
 * 素材打包（P4.3）：把 art-source/ 里几 MB 的原图压成游戏能用的尺寸。
 *
 *   node dev/pack-art.js            # 全量打包
 *   node dev/pack-art.js --dry      # 只打印计划，不写文件
 *   node dev/pack-art.js --only icon # 只打某一类（portrait/full/icon/boss/variant）
 *
 * 为什么要有这一步：art-source 的图是 2048×1930 / 3.7M、1728×2182 / 5M 的成品大图，
 * 游戏里图标只显示 32~40px、立绘 210×300。123 张原图全接进去是 500M+，
 * 纯静态 file:// 会直接卡死。压完约 8M。
 *
 * 依赖：macOS 自带 sips（不引第三方包）。这是**离线预处理**，
 * 产物进 assets/ 进库，运行时仍然零构建、零依赖。
 * 原图留在 art-source/（已 gitignore），随时可重跑覆盖。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'art-source');
const OUT = path.join(ROOT, 'assets');
const DRY = process.argv.includes('--dry');
const ONLY = (() => {
  const i = process.argv.indexOf('--only');
  return i > 0 ? process.argv[i + 1] : null;
})();

/* 输出规格。max 是长边像素，约为游戏内显示尺寸的 2~3 倍（retina 够用）。 */
const SPEC = {
  portrait: { max: 600, fmt: 'jpeg', q: 85 },
  boss: { max: 600, fmt: 'jpeg', q: 85 },
  full: { max: 640, fmt: 'jpeg', q: 85 },
  icon: { max: 128, fmt: 'png' },
  variant: { max: 96, fmt: 'png' }
};

/* art-source 用的是美术侧拼音，个别与游戏 id 不同 */
const CHAR_ALIAS = {
  yanwei: 'yankui',   // 岩隈
  moyan: 'moya',      // 墨鸦
  yusuqiu: 'yusqiu'   // 虞素秋
};
const gid = id => CHAR_ALIAS[id] || id;

/* Boss 立绘：boss_{美术 id} → 游戏 ENEMY_TYPES 键 */
const BOSS_MAP = {
  bingxiao: 'icexiao',
  chisha: 'chisha',
  shanxiao: 'shanxiao',
  shuigui: 'waterghost',
  zhaolong: 'swampdragon',
  zhuojiang: 'turbidgeneral',
  zhuyao: 'bamboo',
  xuanque: 'xuanque'
};
/* 噬脉兽是玄阙的二阶段形态，单独命名；boss_xuanque_base 与角色立绘重复，跳过 */
const BEAST_MAP = { shimoshou: 'xuanque_beast' };

const stats = { files: 0, bytes: 0, skipped: [] };

/* 扩展名必须跟着实际编码走：JPEG 写成 .png 会让 MIME 与内容不符（file:// 下尤其危险） */
function extOf(spec) { return spec.fmt === 'jpeg' ? '.jpg' : '.png'; }

function sips(input, output, spec) {
  const args = ['-Z', String(spec.max)];
  if (spec.fmt === 'jpeg') args.push('-s', 'format', 'jpeg', '-s', 'formatOptions', String(spec.q));
  else args.push('-s', 'format', 'png');
  args.push(input, '--out', output);
  if (DRY) return 0;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  execFileSync('sips', args, { stdio: 'ignore' });
  return fs.statSync(output).size;
}

function emit(input, output, spec, label) {
  if (!fs.existsSync(input)) { stats.skipped.push(label + '（源文件不存在）'); return; }
  const size = sips(input, output, spec);
  stats.files++;
  stats.bytes += size;
  if (DRY) console.log('  [dry] ' + label + '  →  ' + path.relative(ROOT, output));
}

function listPng(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.png') && !f.startsWith('_'));
}

/* ---------- 1. 角色立绘：char_{id}_{expr}.png → portraits/{gid}[_expr].png ---------- */
function packPortraits() {
  console.log('\n[角色立绘] ' + SPEC.portrait.max + 'px ' + SPEC.portrait.fmt.toUpperCase());
  const dir = path.join(SRC, 'portraits/characters');
  const seen = new Set();
  for (const f of listPng(dir)) {
    const m = /^char_(.+)_(base|hurt|resolve|smile)$/.exec(f.replace(/\.png$/, ''));
    if (!m) { stats.skipped.push('立绘 ' + f + '（命名不匹配）'); continue; }
    const id = gid(m[1]);
    const expr = m[2];
    seen.add(m[1] + '_' + expr);
    const out = path.join(OUT, 'portraits', id + (expr === 'base' ? '' : '_' + expr) + extOf(SPEC.portrait));
    emit(path.join(dir, f), out, SPEC.portrait, '立绘 ' + id + '/' + expr);
  }
  return seen;
}

/* ---------- 2. Boss 立绘：boss_{x}_{base|rage}.png → portraits/{key}[_rage].png ---------- */
function packBosses() {
  console.log('\n[Boss 立绘] ' + SPEC.boss.max + 'px ' + SPEC.boss.fmt.toUpperCase());
  const dir = path.join(SRC, 'portraits/enemies');
  for (const f of listPng(dir)) {
    const m = /^boss_(.+)_(base|rage)$/.exec(f.replace(/\.png$/, ''));
    if (!m) { stats.skipped.push('Boss 立绘 ' + f + '（命名不匹配）'); continue; }
    const artId = m[1];
    const expr = m[2];
    let name;
    if (BEAST_MAP[artId]) {
      if (expr === 'rage') { stats.skipped.push('Boss 立绘 ' + f + '（噬脉兽只留 base）'); continue; }
      name = BEAST_MAP[artId];
    } else if (BOSS_MAP[artId]) {
      /* 玄阙的 base 已由角色立绘提供，这里只补 rage */
      if (artId === 'xuanque' && expr === 'base') { stats.skipped.push('Boss 立绘 ' + f + '（与角色立绘重复）'); continue; }
      name = BOSS_MAP[artId] + (expr === 'rage' ? '_rage' : '');
    } else {
      stats.skipped.push('Boss 立绘 ' + f + '（无对应敌型）');
      continue;
    }
    emit(path.join(dir, f), path.join(OUT, 'portraits', name + extOf(SPEC.boss)), SPEC.boss, 'Boss ' + name);
  }
}

/* ---------- 3. 全身立绘：char_{id}_full_base.png → portraits/full/{gid}.png ---------- */
function packFull() {
  console.log('\n[全身立绘] ' + SPEC.full.max + 'px ' + SPEC.full.fmt.toUpperCase());
  const dir = path.join(SRC, 'portraits/fullbody/characters');
  for (const f of listPng(dir)) {
    const m = /^char_(.+)_full_(base|hurt|attack)$/.exec(f.replace(/\.png$/, ''));
    if (!m) { stats.skipped.push('全身 ' + f + '（命名不匹配）'); continue; }
    const id = gid(m[1]);
    const expr = m[2];
    const out = path.join(OUT, 'portraits/full', id + (expr === 'base' ? '' : '_' + expr) + extOf(SPEC.full));
    emit(path.join(dir, f), out, SPEC.full, '全身 ' + id + '/' + expr);
  }
}

/* ---------- 4. 单位图标：icon_{id}.png → icons/units/{gid}.png ---------- */
function packIcons() {
  console.log('\n[单位图标] ' + SPEC.icon.max + 'px ' + SPEC.icon.fmt.toUpperCase());
  const dir = path.join(SRC, 'icons/units');
  for (const f of listPng(dir)) {
    const m = /^icon_(.+)$/.exec(f.replace(/\.png$/, ''));
    if (!m) continue;
    const id = gid(m[1]);
    emit(path.join(dir, f), path.join(OUT, 'icons/units', id + '.png'), SPEC.icon, '图标 ' + id);
  }
  /* Boss 图标 */
  const bdir = path.join(dir, 'bosses');
  for (const f of listPng(bdir)) {
    const m = /^icon_boss_(.+)$/.exec(f.replace(/\.png$/, ''));
    if (!m) continue;
    const artId = m[1];
    const name = BEAST_MAP[artId] || BOSS_MAP[artId];
    if (!name) { stats.skipped.push('Boss 图标 ' + f + '（无对应敌型）'); continue; }
    emit(path.join(bdir, f), path.join(OUT, 'icons/units/boss', name + '.png'), SPEC.icon, 'Boss 图标 ' + name);
  }
  /* 召唤兽图标：先按原名就位，接线时再映射 */
  const sdir = path.join(dir, 'summons');
  for (const f of listPng(sdir)) {
    const m = /^icon_summon_(.+)$/.exec(f.replace(/\.png$/, ''));
    if (!m) continue;
    emit(path.join(sdir, f), path.join(OUT, 'icons/units/summon', m[1] + '.png'), SPEC.icon, '召唤兽图标 ' + m[1]);
  }
  /* 敌方杂兵变体：v1/v2 各一套 */
  const vdir = path.join(dir, 'enemy_variants');
  for (const f of listPng(vdir)) {
    const m = /^icon_(.+)$/.exec(f.replace(/\.png$/, ''));
    if (!m) continue;
    emit(path.join(vdir, f), path.join(OUT, 'icons/units/variant', m[1] + '.png'), SPEC.variant, '杂兵图标 ' + m[1]);
  }
}

/* ---------- 跑 ---------- */
const t0 = Date.now();
if (!fs.existsSync(path.join(SRC, 'manifest.json'))) {
  console.error('找不到 art-source/manifest.json，请在项目根目录运行。');
  process.exit(1);
}
try {
  execFileSync('sips', ['--version'], { stdio: 'ignore' });
} catch (e) {
  console.error('缺少 sips（macOS 自带）。这一步只能在 macOS 上跑。');
  process.exit(1);
}

if (!ONLY || ONLY === 'portrait') packPortraits();
if (!ONLY || ONLY === 'boss') packBosses();
if (!ONLY || ONLY === 'full') packFull();
if (!ONLY || ONLY === 'icon') packIcons();

console.log('\n----------------------------------------');
if (DRY) {
  console.log('干跑：计划 ' + stats.files + ' 个文件（未写入）');
} else {
  const mb = (stats.bytes / 1024 / 1024).toFixed(2);
  console.log('打包完成：' + stats.files + ' 个文件，' + mb + ' MB，耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
if (stats.skipped.length) {
  console.log('\n跳过 ' + stats.skipped.length + ' 项：');
  for (const s of stats.skipped.slice(0, 30)) console.log('  · ' + s);
  if (stats.skipped.length > 30) console.log('  …还有 ' + (stats.skipped.length - 30) + ' 项');
}
