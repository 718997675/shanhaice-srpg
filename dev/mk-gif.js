/* ============================================================
 * PNG 序列 → 动画 GIF（零依赖）
 * 用法：node dev/mk-gif.js <帧目录> <输出.gif> [--delay 130] [--scale 0.5]
 * 流程：PNG 解码(zlib) → 盒式缩放 → 中位切割量化(≤256 色) → LZW → GIF89a(循环)
 * ============================================================ */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------------- PNG 解码（支持 RGB / RGBA / 灰度，8bit，非隔行） ---------------- */
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG');
  let pos = 8, w = 0, h = 0, bitDepth = 8, colorType = 6, interlace = 0;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error('仅支持 8bit PNG，实际 ' + bitDepth);
  if (interlace) throw new Error('不支持隔行 PNG');
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : colorType === 4 ? 2 : null;
  if (!ch) throw new Error('不支持的 colorType ' + colorType);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  let line = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    /* 反滤波 */
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      let v = src[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      line[x] = v & 0xFF;
    }
    const t = prev; prev = line; line = t;
    for (let x = 0; x < w; x++) {
      const si = x * ch, di = (y * w + x) * 4;
      if (ch >= 3) { out[di] = prev[si]; out[di + 1] = prev[si + 1]; out[di + 2] = prev[si + 2]; out[di + 3] = ch === 4 ? prev[si + 3] : 255; }
      else { out[di] = out[di + 1] = out[di + 2] = prev[si]; out[di + 3] = ch === 2 ? prev[si + 1] : 255; }
    }
  }
  return { w, h, rgba: out };
}

/* ---------------- 盒式缩放 ---------------- */
function downscale(img, scale) {
  if (scale >= 1) return img;
  const w = Math.max(1, Math.round(img.w * scale)), h = Math.max(1, Math.round(img.h * scale));
  const rgba = Buffer.alloc(w * h * 4);
  const xr = img.w / w, yr = img.h / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * yr), y1 = Math.min(img.h, Math.max(y0 + 1, Math.ceil((y + 1) * yr)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * xr), x1 = Math.min(img.w, Math.max(x0 + 1, Math.ceil((x + 1) * xr)));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = (yy * img.w + xx) * 4;
        r += img.rgba[i]; g += img.rgba[i + 1]; b += img.rgba[i + 2]; a += img.rgba[i + 3]; n++;
      }
      const di = (y * w + x) * 4;
      rgba[di] = Math.round(r / n); rgba[di + 1] = Math.round(g / n); rgba[di + 2] = Math.round(b / n); rgba[di + 3] = Math.round(a / n);
    }
  }
  return { w, h, rgba };
}

/* ---------------- 中位切割量化 ---------------- */
function medianCut(rgba, maxColors) {
  const pixels = [];
  for (let i = 0; i < rgba.length; i += 4) pixels.push(rgba[i], rgba[i + 1], rgba[i + 2]);
  const px = pixels;
  const box = { start: 0, end: px.length / 3, idx: null };
  box.idx = Array.from({ length: box.end }, (_, i) => i);
  const boxes = [box];
  while (boxes.length < maxColors) {
    /* 找范围最大的盒子 */
    let bi = -1, bestRange = -1, axis = 0;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.idx.length < 2) continue;
      let mn = [255, 255, 255], mx = [0, 0, 0];
      for (const k of b.idx) for (let a = 0; a < 3; a++) { const v = px[k * 3 + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
      const range = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
      if (range > bestRange) { bestRange = range; bi = i; axis = (mx[0] - mn[0] >= mx[1] - mn[1] && mx[0] - mn[0] >= mx[2] - mn[2]) ? 0 : (mx[1] - mn[1] >= mx[2] - mn[2] ? 1 : 2); }
    }
    if (bi < 0 || bestRange <= 0) break;
    const b = boxes[bi];
    b.idx.sort((p, q) => px[p * 3 + axis] - px[q * 3 + axis]);
    const mid = b.idx.length >> 1;
    boxes.splice(bi, 1, { start: 0, end: 0, idx: b.idx.slice(0, mid) }, { start: 0, end: 0, idx: b.idx.slice(mid) });
  }
  /* 每个盒子取均值作为调色板 */
  const palette = [];
  for (const b of boxes) {
    let r = 0, g = 0, bl = 0;
    for (const k of b.idx) { r += px[k * 3]; g += px[k * 3 + 1]; bl += px[k * 3 + 2]; }
    const n = Math.max(1, b.idx.length);
    palette.push([Math.round(r / n), Math.round(g / n), Math.round(bl / n)]);
  }
  return palette;
}

function mapPixels(rgba, palette) {
  const n = rgba.length / 4;
  const idx = Buffer.alloc(n);
  const cache = new Map();
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2];
    const key = (r << 16) | (g << 8) | b;
    let v = cache.get(key);
    if (v === undefined) {
      let bd = Infinity;
      for (let p = 0; p < palette.length; p++) {
        const dr = r - palette[p][0], dg = g - palette[p][1], db = b - palette[p][2];
        const d = dr * dr * 2 + dg * dg * 3 + db * db;   // 感知权重
        if (d < bd) { bd = d; v = p; }
      }
      cache.set(key, v);
    }
    idx[i] = v;
  }
  return idx;
}

/* ---------------- GIF LZW ---------------- */
function lzwEncode(indices, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let dict = new Map();
  let next = eoiCode + 1;
  const bytes = [];
  let cur = 0, curBits = 0;
  const emit = code => {
    cur |= code << curBits;
    curBits += codeSize;
    while (curBits >= 8) { bytes.push(cur & 0xFF); cur >>>= 8; curBits -= 8; }
  };
  emit(clearCode);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix * 4096 + k;
    const hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next);
      if (next === (1 << codeSize) && codeSize < 12) codeSize++;
      next++;
    } else {
      emit(clearCode);
      dict = new Map();
      next = eoiCode + 1;
      codeSize = minCodeSize + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoiCode);
  if (curBits > 0) bytes.push(cur & 0xFF);
  /* 分子块 */
  const out = [];
  for (let i = 0; i < bytes.length; i += 255) {
    const chunk = bytes.slice(i, i + 255);
    out.push(chunk.length, ...chunk);
  }
  out.push(0);
  return Buffer.from(out);
}

/* ---------------- GIF 组装 ---------------- */
function buildGIF(frames, w, h, delayCs) {
  const parts = [];
  const push = (...bs) => parts.push(...bs);
  push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);             // GIF89a
  push(w & 0xFF, w >> 8, h & 0xFF, h >> 8);             // LSD
  push(0x00, 0x00, 0x00);                               // 无 GCT，背景 0，宽高比 0
  /* NETSCAPE 循环扩展 */
  push(0x21, 0xFF, 0x0B);
  for (const ch of 'NETSCAPE2.0') push(ch.charCodeAt(0));
  push(0x03, 0x01, 0x00, 0x00, 0x00);                   // 无限循环

  for (const f of frames) {
    /* GCE：disposal=1（保留），无透明 */
    push(0x21, 0xF9, 0x04, 0x04);
    push(delayCs & 0xFF, delayCs >> 8);
    push(0x00, 0x00);
    /* 图像描述符 + 局部调色板 */
    push(0x2C, 0, 0, 0, 0);
    push(w & 0xFF, w >> 8, h & 0xFF, h >> 8);
    push(0x80 | (f.paletteBits - 1));                   // LCT 标志 | 尺寸
    const pal = f.palette;
    for (let i = 0; i < (1 << f.paletteBits); i++) {
      const c = pal[i] || [0, 0, 0];
      push(c[0], c[1], c[2]);
    }
    const lzw = lzwEncode(f.indices, Math.max(2, f.paletteBits));
    parts.push(Buffer.from([Math.max(2, f.paletteBits)]));   // LZW 最小码长
    parts.push(lzw);
  }
  push(0x3B);                                           // trailer
  return Buffer.concat(parts.map(p => Buffer.isBuffer(p) ? p : Buffer.from(p)));
}

/* ---------------- 主流程 ---------------- */
function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i < 0 ? fallback : process.argv[i + 1];
}

(async () => {
  const dir = process.argv[2];
  const out = process.argv[3];
  if (!dir || !out) { console.error('用法：node dev/mk-gif.js <帧目录> <输出.gif> [--delay 130] [--scale 0.5]'); process.exit(1); }
  const delayMs = parseInt(arg('delay', '130'), 10);
  const scale = parseFloat(arg('scale', '0.5'));

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();
  if (!files.length) { console.error('目录里没有 PNG 帧'); process.exit(1); }
  console.log(`  读取 ${files.length} 帧（scale=${scale}, delay=${delayMs}ms）`);

  let W = 0, H = 0;
  const frames = [];
  for (const f of files) {
    let img = decodePNG(fs.readFileSync(path.join(dir, f)));
    img = downscale(img, scale);
    if (!W) { W = img.w; H = img.h; }
    if (img.w !== W || img.h !== H) { console.error('帧尺寸不一致：' + f); process.exit(1); }
    const palette = medianCut(img.rgba, 256);
    const indices = mapPixels(img.rgba, palette);
    let bits = 2; while ((1 << bits) < palette.length) bits++;
    if (bits > 8) bits = 8;
    /* 调色板补齐到 2^bits */
    while (palette.length < (1 << bits)) palette.push([0, 0, 0]);
    frames.push({ palette, indices, paletteBits: bits });
    if (frames.length % 10 === 0) console.log(`  已处理 ${frames.length}/${files.length}`);
  }

  const gif = buildGIF(frames, W, H, Math.round(delayMs / 10));
  fs.writeFileSync(out, gif);
  console.log(`  完成：${out}（${W}x${H}, ${frames.length} 帧, ${(gif.length / 1024 / 1024).toFixed(2)} MB）`);
})().catch(e => { console.error('GIF 合成失败：', e); process.exit(1); });
