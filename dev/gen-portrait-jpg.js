/* ============================================================
 * 占位立绘位图化：把 gen-art.js 出的 SVG 转成游戏要用的 jpg。
 *
 *   node dev/gen-portrait-jpg.js            # 只补「根本没有 jpg」的角色（安全）
 *   node dev/gen-portrait-jpg.js axi aoxiao # 只做指定 id（会覆盖这几个 id 的现有 jpg）
 *
 * ⚠️ 没有 --all。这个脚本的产物是**占位图**，一旦把正式美术覆盖掉，
 *    只能从 git 里 `git checkout -- assets/portraits` 捞回来。要重刷就点名。
 *
 * 为什么要有这一步：`UI.portraitPath` 找的是 `<id>.jpg`，SVG 只是
 * onerror 兜底；关系图的 `<image>` 同理。没有 jpg 时虽然能显示，
 * 但每张图都要先 404 一次，营地列表滚动会闪。
 *
 * 依赖 sharp（macOS 上已装在 ~/node_modules，故用 NODE_PATH 指过去）。
 * 这是**离线预处理**，产物进 assets/ 进库，运行时仍然零构建零依赖。
 * 正式美术到位后，直接覆盖同名 jpg 即可，不用改这个脚本。
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sha1 = buf => crypto.createHash('sha1').update(buf).digest('hex');

let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.error('缺少 sharp。用 NODE_PATH 指到已安装的位置：');
  console.error('  NODE_PATH=~/node_modules node dev/gen-portrait-jpg.js');
  process.exit(1);
}

const ROOT = path.resolve(__dirname, '..');
const POR = path.join(ROOT, 'assets', 'portraits');
const ICON = path.join(ROOT, 'assets', 'icons', 'units');
const MANIFEST = path.join(POR, '_placeholder.json');

const only = process.argv.slice(2).filter(a => !a.startsWith('--'));

/* 输出规格与 assets/portraits 里现有成品一致 */
const W = 475, H = 600;
const ICON_W = 128, ICON_H = 120;

/* 头像裁切框（SVG 坐标系 360×480）：只取头部，留一点肩 */
const HEAD = { left: 60, top: 70, width: 240, height: 225 };   // 4:3.75，正好对上 128×120

fs.mkdirSync(ICON, { recursive: true });

const ids = fs.readdirSync(POR)
  .filter(f => f.endsWith('.svg') && f !== 'title.svg')
  .map(f => f.replace(/\.svg$/, ''))
  /* 点名了就只做点名的（允许覆盖）；没点名只补「根本没有 jpg」的角色。
   * 别按「缺 hurt」筛：Boss 有正式 jpg 但没有 hurt，那样会把美术成品覆盖掉。 */
  .filter(id => only.length ? only.includes(id) : !fs.existsSync(path.join(POR, id + '.jpg')));

if (!ids.length) {
  console.log('没有需要生成的角色（占位图都在位了；要重刷请点名，如 `… axi`）');
  process.exit(0);
}

/* 已有的占位指纹表 */
let manifest = {};
try { manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) || {}; } catch (e) { manifest = {}; }

/* 受伤表情：降饱和 + 压暗 + 一层很淡的血色，和成品 hurt 立绘的观感靠拢 */
const HURT_TINT = { r: 122, g: 26, b: 26, alpha: 0.13 };

(async () => {
  for (const id of ids) {
    const svgPath = path.join(POR, id + '.svg');
    const svg = fs.readFileSync(svgPath);
    const base = sharp(svg, { density: 200 }).resize(W, H, { fit: 'cover' });

    await base.clone().jpeg({ quality: 82, chromaSubsampling: '4:4:4' })
      .toFile(path.join(POR, id + '.jpg'));

    await base.clone()
      .modulate({ saturation: 0.42, brightness: 0.86 })
      .composite([{
        input: { create: { width: W, height: H, channels: 4, background: HURT_TINT } },
        blend: 'over'
      }])
      .jpeg({ quality: 82, chromaSubsampling: '4:4:4' })
      .toFile(path.join(POR, id + '_hurt.jpg'));

    /* 单位图标：从同一张 SVG 里裁头部，压到 128×120 */
    const meta = await sharp(svg, { density: 300 }).metadata();
    const sx = meta.width / 360;
    await sharp(svg, { density: 300 })
      .extract({
        left: Math.round(HEAD.left * sx),
        top: Math.round(HEAD.top * sx),
        width: Math.round(HEAD.width * sx),
        height: Math.round(HEAD.height * sx)
      })
      .resize(ICON_W, ICON_H, { fit: 'cover' })
      .png({ compressionLevel: 9 })
      .toFile(path.join(ICON, id + '.png'));

    const kb = f => Math.round(fs.statSync(path.join(POR, f)).size / 1024) + 'K';
    console.log('  ' + id + '  ' + id + '.jpg ' + kb(id + '.jpg') +
      '  ' + id + '_hurt.jpg ' + kb(id + '_hurt.jpg') +
      '  icons/' + id + '.png');

    /* 记下占位图的指纹：正式美术覆盖后指纹对不上，dev/check-art.js 就能认出「已替换」 */
    manifest[id] = sha1(fs.readFileSync(path.join(POR, id + '.jpg')));
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  }
  console.log('生成 ' + ids.length + ' 组（立绘 + 受伤 + 图标）');
  console.log('占位清单：' + path.relative(ROOT, MANIFEST) + '（共 ' + Object.keys(manifest).length + ' 人）');
})();
