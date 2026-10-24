/* ============================================================
 * 渲染层：Canvas 2D 水墨战场
 * 不参与规则，只读取 Battle 的只读状态与自身动画状态。
 * ============================================================ */
const Render = {
  canvas: null,
  ctx: null,
  dpr: 1,
  W: 0,
  H: 0,
  tile: 46,
  ox: 0,
  oy: 0,
  boardW: 0,
  boardH: 0,
  topH: 46,
  battle: null,
  terrainCanvas: null,
  terrainDirty: false,
  moving: null,
  lungeFx: null,
  hpView: null,
  floats: [],
  slashes: [],
  flashes: [],
  shakeT: 0,
  shakePower: 0,
  hover: null,
  time: 0,
  theme: 'mountain',

  PALETTES: {
    mountain: { bg: '#101713', paper: '#cfc8b2', tint: '#8fa18a', ink: '#243029', haze: '#b9c3ae' },
    bamboo: { bg: '#0e1713', paper: '#ccd0b7', tint: '#7f9a7b', ink: '#22322a', haze: '#aec3a9' },
    river: { bg: '#0e1617', paper: '#c7cbbd', tint: '#7e9aa0', ink: '#243234', haze: '#adc1c1' },
    fortress: { bg: '#181310', paper: '#d2c3a7', tint: '#a88662', ink: '#352b21', haze: '#c7b293' },
    ice: { bg: '#10171a', paper: '#c8d2d3', tint: '#8aa5ad', ink: '#25333a', haze: '#b6c8cd' },
    swamp: { bg: '#101612', paper: '#c5c8ad', tint: '#859474', ink: '#263029', haze: '#aeb99c' },
    ruins: { bg: '#151412', paper: '#cbc2ad', tint: '#9b9481', ink: '#302d26', haze: '#bfb59f' },
    void: { bg: '#0e1113', paper: '#bdbab2', tint: '#7e898d', ink: '#242a2d', haze: '#a7b0b2' }
  },

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 160));
  },

  resize() {
    if (!this.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = this.canvas.clientWidth || window.innerWidth;
    const H = this.canvas.clientHeight || window.innerHeight;
    this.dpr = dpr;
    this.W = W;
    this.H = H;
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const topEl = document.getElementById('topBar');
    this.topH = topEl && topEl.offsetHeight ? topEl.offsetHeight : (H < 430 ? 42 : 46);
    const availW = W - (W < 760 ? 12 : 28);
    const availH = H - this.topH - (H < 430 ? 10 : 22);
    let tile = Math.min(availW / 16, availH / 8);
    tile = Math.min(tile, 80);
    tile = Math.max(tile, 20);
    this.tile = Math.floor(tile);
    this.boardW = this.tile * 16;
    this.boardH = this.tile * 8;
    this.ox = Math.round((W - this.boardW) / 2);
    this.oy = Math.round(this.topH + Math.max(4, (H - this.topH - this.boardH) / 2));
    if (this.oy + this.boardH > H - 2) this.oy = Math.max(this.topH, H - 2 - this.boardH);
    if (this.battle) this.buildTerrain();
  },

  setBattle(battle) {
    this.battle = battle;
    this.theme = (battle && battle.chapter && battle.chapter.theme) || 'mountain';
    this.moving = null;
    this.lungeFx = null;
    this.hpView = null;
    this.floats = [];
    this.slashes = [];
    this.flashes = [];
    this.resize();
    this.buildTerrain();
  },

  clearBattle() {
    this.battle = null;
    this.moving = null;
    this.lungeFx = null;
    this.hpView = null;
    this.floats = [];
    this.slashes = [];
    this.flashes = [];
  },

  palette() { return this.PALETTES[this.theme] || this.PALETTES.mountain; },

  hash(x, y, salt) {
    const v = Math.sin(x * 127.1 + y * 311.7 + (salt || 0) * 74.7) * 43758.5453;
    return v - Math.floor(v);
  },

  /* ---------------- 地形缓存 ---------------- */
  buildTerrain() {
    const b = this.battle;
    if (!b || !b.grid) { this.terrainCanvas = null; return; }
    const dpr = this.dpr;
    const c = document.createElement('canvas');
    c.width = Math.round(this.boardW * dpr);
    c.height = Math.round(this.boardH * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pal = this.palette();
    const t = this.tile;
    g.fillStyle = pal.paper;
    g.fillRect(0, 0, this.boardW, this.boardH);

    const wash = g.createLinearGradient(0, 0, this.boardW, this.boardH);
    wash.addColorStop(0, 'rgba(255,250,236,.24)');
    wash.addColorStop(0.5, 'rgba(255,255,255,0)');
    wash.addColorStop(1, 'rgba(52,45,31,.14)');
    g.fillStyle = wash;
    g.fillRect(0, 0, this.boardW, this.boardH);

    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 16; x++) {
        const ch = TerrainFX.tileChar(b, x, y);
        const px = x * t, py = y * t;
        this.drawTileBase(g, ch, x, y, px, py, t, pal);
      }
    }
    // 纸纹与墨点
    g.save();
    for (let i = 0; i < 340; i++) {
      const hx = this.hash(i, 1, 2) * this.boardW;
      const hy = this.hash(i, 2, 3) * this.boardH;
      const a = this.hash(i, 3, 4) * 0.05;
      g.fillStyle = `rgba(40,46,38,${a.toFixed(3)})`;
      g.beginPath();
      g.arc(hx, hy, this.hash(i, 4, 5) * 1.8 + 0.4, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    this.terrainCanvas = c;
  },

  drawTileBase(g, ch, x, y, px, py, t, pal) {
    const r1 = this.hash(x, y, 1);
    const r2 = this.hash(x, y, 2);
    if (ch === '~') {
      const grd = g.createLinearGradient(px, py, px, py + t);
      grd.addColorStop(0, '#91a8a7');
      grd.addColorStop(1, '#7f9a9a');
      g.fillStyle = grd;
      g.fillRect(px, py, t, t);
      g.strokeStyle = 'rgba(238,244,232,.35)';
      g.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const yy = py + t * (0.26 + i * 0.23) + r1 * 4;
        g.beginPath();
        g.moveTo(px + t * 0.1 + r2 * 6, yy);
        g.quadraticCurveTo(px + t * 0.35, yy - 3, px + t * 0.5, yy);
        g.quadraticCurveTo(px + t * 0.68, yy + 3, px + t * 0.9, yy - 1);
        g.stroke();
      }
      return;
    }
    g.fillStyle = this.tileTint(ch, pal, r1);
    g.fillRect(px, py, t, t);
    // 山野肌理
    g.save();
    g.globalAlpha = 0.14;
    for (let i = 0; i < 4; i++) {
      const ax = px + this.hash(x * 7 + i, y, 6) * t;
      const ay = py + this.hash(x, y * 5 + i, 7) * t;
      const w = t * (0.08 + this.hash(x + i, y, 8) * 0.2);
      g.strokeStyle = pal.ink;
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(ax - w, ay);
      g.quadraticCurveTo(ax, ay - t * 0.04, ax + w, ay + t * 0.01);
      g.stroke();
    }
    g.restore();

    if (ch === 'f') this.drawTree(g, px + t * 0.5, py + t * 0.55, t, r1, r2);
    else if (ch === 'h') this.drawHill(g, px, py, t, r1);
    else if (ch === 'M') this.drawMountain(g, px, py, t, r1, r2);
    else if (ch === '=') this.drawBridge(g, px, py, t);
    else if (ch === 'r') this.drawRuin(g, px, py, t, r1);
    else if (ch === 'v') this.drawVillage(g, px, py, t);
    else if (ch === 'F') this.drawFort(g, px, py, t);
    else if (ch === 'G') this.drawGate(g, px, py, t);
    else if (ch === 'L') this.drawNodeGround(g, px, py, t);
    else if (ch === 'C') this.drawChest(g, px, py, t);
    else if (ch === 'S') this.drawShrine(g, px, py, t);
    else if (ch === 'E') this.drawEscape(g, px, py, t);
    else if (ch === 'I') this.drawIce(g, px, py, t, r1, r2);
  },

  drawIce(g, px, py, t, r1, r2) {
    // 冰面：青白底 + 两道反向高光 + 随机冰裂纹
    g.fillStyle = 'rgba(214,236,246,.55)';
    g.fillRect(px, py, t, t);
    g.strokeStyle = 'rgba(255,255,255,.75)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(px + t * (0.1 + r1 * 0.15), py + t * 0.72);
    g.lineTo(px + t * (0.45 + r1 * 0.2), py + t * (0.2 + r2 * 0.15));
    g.stroke();
    g.strokeStyle = 'rgba(160,205,225,.5)';
    g.beginPath();
    g.moveTo(px + t * 0.62, py + t * 0.85);
    g.lineTo(px + t * (0.8 + r2 * 0.12), py + t * 0.35);
    g.stroke();
    g.strokeStyle = 'rgba(120,170,200,.35)';
    g.beginPath();
    g.moveTo(px + t * 0.3, py + t * 0.5);
    g.lineTo(px + t * 0.55, py + t * 0.62);
    g.lineTo(px + t * 0.78, py + t * 0.5);
    g.stroke();
  },

  tileTint(ch, pal, r) {
    const base = pal.paper;
    const map = {
      '.': [0, 0], f: [-6, -4], h: [8, 2], r: [6, -4], v: [18, 6],
      F: [4, -2], G: [10, -2], L: [-4, 0], C: [16, -2], S: [2, -6], E: [-2, 4],
      I: [-8, 12]
    };
    const off = map[ch] || [0, 0];
    const n = Math.round((r - 0.5) * 5);
    return this.shiftColor(base, off[0] + n, off[1] + n, 0);
  },

  shiftColor(hex, dr, dg, db) {
    const m = hex.replace('#', '');
    const r = Math.max(0, Math.min(255, parseInt(m.slice(0, 2), 16) + dr));
    const g = Math.max(0, Math.min(255, parseInt(m.slice(2, 4), 16) + dg));
    const b = Math.max(0, Math.min(255, parseInt(m.slice(4, 6), 16) + db));
    return `rgb(${r},${g},${b})`;
  },

  drawTree(g, cx, cy, t, r1, r2) {
    const s = t / 46;
    g.save();
    g.strokeStyle = 'rgba(48,58,43,.85)';
    g.lineWidth = 1.5 * s;
    g.beginPath();
    g.moveTo(cx, cy + 10 * s);
    g.quadraticCurveTo(cx - 2 * s, cy, cx + 1 * s, cy - 5 * s);
    g.stroke();
    g.fillStyle = 'rgba(65,84,61,.5)';
    for (let i = 0; i < 3; i++) {
      const yy = cy - (2 + i * 5) * s;
      const w = (13 - i * 2.4) * s + r1 * 2;
      g.beginPath();
      g.moveTo(cx - w, yy + 3 * s);
      g.quadraticCurveTo(cx - w * 0.4, yy - 6 * s, cx, yy - 7 * s);
      g.quadraticCurveTo(cx + w * 0.5, yy - 6 * s, cx + w, yy + 3 * s);
      g.quadraticCurveTo(cx, yy + 6 * s, cx - w, yy + 3 * s);
      g.fill();
    }
    g.globalAlpha = 0.28;
    g.strokeStyle = '#38452f';
    for (let i = 0; i < 2; i++) {
      g.beginPath();
      g.moveTo(cx - 4 * s, cy + 11 * s);
      g.lineTo(cx - 7 * s + r2 * 3, cy + (4 + i * 3) * s);
      g.stroke();
    }
    g.restore();
  },

  drawHill(g, px, py, t, r1) {
    g.save();
    g.strokeStyle = 'rgba(92,78,52,.38)';
    g.lineWidth = 1.1;
    for (let i = 0; i < 2; i++) {
      g.beginPath();
      g.moveTo(px + t * (0.08 + i * 0.2), py + t * (0.66 + i * 0.08));
      g.quadraticCurveTo(px + t * (0.38 + r1 * 0.1), py + t * (0.38 + i * 0.08), px + t * (0.9 - i * 0.12), py + t * 0.62);
      g.stroke();
    }
    g.restore();
  },

  drawMountain(g, px, py, t, r1, r2) {
    g.save();
    const baseY = py + t * 0.82;
    g.fillStyle = 'rgba(94,92,82,.5)';
    g.beginPath();
    g.moveTo(px + t * 0.08, baseY);
    g.lineTo(px + t * (0.32 + r1 * 0.12), py + t * 0.2);
    g.lineTo(px + t * 0.56, baseY);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(70,71,65,.42)';
    g.beginPath();
    g.moveTo(px + t * 0.42, baseY);
    g.lineTo(px + t * (0.7 + r2 * 0.1), py + t * 0.32);
    g.lineTo(px + t * 0.94, baseY);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(238,240,225,.5)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(px + t * 0.27, py + t * 0.34);
    g.lineTo(px + t * (0.32 + r1 * 0.12), py + t * 0.2);
    g.lineTo(px + t * 0.4, py + t * 0.36);
    g.stroke();
    g.restore();
  },

  drawBridge(g, px, py, t) {
    g.save();
    g.fillStyle = '#a98a61';
    g.fillRect(px, py, t, t);
    g.strokeStyle = 'rgba(74,54,32,.4)';
    g.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      g.beginPath();
      g.moveTo(px, py + t * i / 5);
      g.lineTo(px + t, py + t * i / 5);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(px + t * 0.2, py);
    g.lineTo(px + t * 0.2, py + t);
    g.moveTo(px + t * 0.8, py);
    g.lineTo(px + t * 0.8, py + t);
    g.stroke();
    g.restore();
  },

  drawRuin(g, px, py, t, r1) {
    g.save();
    g.fillStyle = 'rgba(105,98,82,.4)';
    const bw = t * 0.17, bh = t * (0.3 + r1 * 0.14);
    g.fillRect(px + t * 0.18, py + t * 0.64 - bh, bw, bh);
    g.fillRect(px + t * 0.6, py + t * 0.64 - bh * 0.7, bw, bh * 0.7);
    g.fillStyle = 'rgba(76,72,61,.35)';
    g.beginPath();
    g.moveTo(px + t * 0.3, py + t * 0.66);
    g.lineTo(px + t * 0.62, py + t * 0.58);
    g.lineTo(px + t * 0.68, py + t * 0.68);
    g.closePath();
    g.fill();
    g.restore();
  },

  drawVillage(g, px, py, t) {
    g.save();
    g.strokeStyle = 'rgba(92,73,48,.6)';
    g.fillStyle = 'rgba(215,194,154,.9)';
    g.fillRect(px + t * 0.28, py + t * 0.5, t * 0.44, t * 0.26);
    g.fillStyle = 'rgba(122,77,53,.78)';
    g.beginPath();
    g.moveTo(px + t * 0.2, py + t * 0.5);
    g.lineTo(px + t * 0.5, py + t * 0.29);
    g.lineTo(px + t * 0.8, py + t * 0.5);
    g.closePath();
    g.fill();
    g.strokeRect(px + t * 0.28, py + t * 0.5, t * 0.44, t * 0.26);
    g.fillStyle = 'rgba(88,63,40,.55)';
    g.fillRect(px + t * 0.45, py + t * 0.58, t * 0.1, t * 0.18);
    g.restore();
  },

  drawFort(g, px, py, t) {
    g.save();
    g.fillStyle = 'rgba(124,112,88,.7)';
    g.fillRect(px + t * 0.18, py + t * 0.38, t * 0.64, t * 0.42);
    g.fillStyle = 'rgba(92,82,64,.8)';
    for (let i = 0; i < 4; i++) {
      g.fillRect(px + t * (0.18 + i * 0.17), py + t * 0.31, t * 0.1, t * 0.09);
    }
    g.fillStyle = 'rgba(58,52,40,.65)';
    g.fillRect(px + t * 0.44, py + t * 0.56, t * 0.12, t * 0.24);
    g.strokeStyle = 'rgba(58,72,58,.5)';
    g.strokeRect(px + t * 0.18, py + t * 0.38, t * 0.64, t * 0.42);
    g.restore();
  },

  drawGate(g, px, py, t) {
    g.save();
    g.fillStyle = 'rgba(139,52,43,.75)';
    g.fillRect(px + t * 0.2, py + t * 0.3, t * 0.1, t * 0.48);
    g.fillRect(px + t * 0.7, py + t * 0.3, t * 0.1, t * 0.48);
    g.fillRect(px + t * 0.14, py + t * 0.26, t * 0.72, t * 0.08);
    g.fillRect(px + t * 0.22, py + t * 0.4, t * 0.56, t * 0.05);
    g.fillStyle = 'rgba(233,218,184,.6)';
    g.fillRect(px + t * 0.4, py + t * 0.2, t * 0.2, t * 0.06);
    g.restore();
  },

  drawNodeGround(g, px, py, t) {
    g.save();
    g.translate(px + t / 2, py + t / 2);
    g.strokeStyle = 'rgba(79,102,88,.45)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 0, t * 0.33, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, t * 0.23, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      g.beginPath();
      g.moveTo(Math.cos(a) * t * 0.23, Math.sin(a) * t * 0.23);
      g.lineTo(Math.cos(a) * t * 0.33, Math.sin(a) * t * 0.33);
      g.stroke();
    }
    g.restore();
  },

  drawChest(g, px, py, t) {
    g.save();
    g.fillStyle = 'rgba(120,84,45,.85)';
    g.fillRect(px + t * 0.3, py + t * 0.45, t * 0.4, t * 0.28);
    g.fillStyle = 'rgba(199,164,96,.9)';
    g.fillRect(px + t * 0.3, py + t * 0.42, t * 0.4, t * 0.08);
    g.fillStyle = 'rgba(70,50,28,.8)';
    g.fillRect(px + t * 0.46, py + t * 0.52, t * 0.08, t * 0.1);
    g.restore();
  },

  drawShrine(g, px, py, t) {
    g.save();
    g.fillStyle = 'rgba(118,105,128,.55)';
    g.fillRect(px + t * 0.24, py + t * 0.36, t * 0.52, t * 0.09);
    g.fillRect(px + t * 0.3, py + t * 0.36, t * 0.08, t * 0.4);
    g.fillRect(px + t * 0.62, py + t * 0.36, t * 0.08, t * 0.4);
    g.fillStyle = 'rgba(220,210,224,.5)';
    g.fillRect(px + t * 0.42, py + t * 0.55, t * 0.16, t * 0.18);
    g.restore();
  },

  drawEscape(g, px, py, t) {
    g.save();
    g.strokeStyle = 'rgba(80,116,130,.6)';
    g.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      const yy = py + t * (0.3 + i * 0.2);
      g.beginPath();
      g.moveTo(px + t * 0.22, yy);
      g.lineTo(px + t * 0.66, yy);
      g.lineTo(px + t * 0.54, yy - t * 0.08);
      g.moveTo(px + t * 0.66, yy);
      g.lineTo(px + t * 0.54, yy + t * 0.08);
      g.stroke();
    }
    g.restore();
  },

  /* ---------------- 坐标与动画 ---------------- */
  toTile(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const tx = Math.floor((x - this.ox) / this.tile);
    const ty = Math.floor((y - this.oy) / this.tile);
    if (tx < 0 || ty < 0 || tx >= 16 || ty >= 8) return null;
    return { x: tx, y: ty };
  },

  tileCenter(x, y) {
    return { x: this.ox + x * this.tile + this.tile / 2, y: this.oy + y * this.tile + this.tile / 2 };
  },

  getUnitPos(unit) {
    let px = unit.x, py = unit.y;
    if (this.moving && this.moving.unitId === unit.id) {
      const m = this.moving;
      const now = performance.now();
      const p = Math.max(0, Math.min(1, (now - m.start) / m.duration));
      const path = m.path;
      const seg = Math.min(path.length - 1, Math.floor(p * (path.length - 1)));
      const segP = p * (path.length - 1) - seg;
      const a = path[seg], b = path[Math.min(path.length - 1, seg + 1)];
      px = a.x + (b.x - a.x) * segP;
      py = a.y + (b.y - a.y) * segP;
    }
    if (this.lungeFx && this.lungeFx.unitId === unit.id) {
      const m = this.lungeFx;
      const now = performance.now();
      const p = Math.max(0, Math.min(1, (now - m.start) / m.duration));
      const k = Math.sin(p * Math.PI);
      px = m.fromX + (m.toX - m.fromX) * k;
      py = m.fromY + (m.toY - m.fromY) * k;
    }
    return { x: px, y: py };
  },

  isMoving() {
    return !!(this.moving || this.lungeFx);
  },

  animateMove(unit, path, speed) {
    return new Promise(resolve => {
      if (!path || path.length <= 1) { resolve(); return; }
      const per = 78 / (speed || 1);
      this.moving = {
        unitId: unit.id,
        path: path.map(p => ({ x: p.x, y: p.y })),
        start: performance.now(),
        duration: Math.max(120, (path.length - 1) * per),
        resolve
      };
      setTimeout(() => {
        if (this.moving && this.moving.unitId === unit.id) {
          this.moving = null;
          resolve();
        }
      }, Math.max(120, (path.length - 1) * per) + 30);
    });
  },

  async lunge(unit, targetX, targetY, speed) {
    const duration = 160 / (speed || 1);
    const from = this.getUnitPos(unit);
    this.lungeFx = {
      unitId: unit.id, fromX: from.x, fromY: from.y,
      toX: from.x + (targetX - from.x) * 0.42,
      toY: from.y + (targetY - from.y) * 0.42,
      start: performance.now(), duration
    };
    await new Promise(r => setTimeout(r, duration + 20));
    if (this.lungeFx && this.lungeFx.unitId === unit.id) this.lungeFx = null;
  },

  /* ---------------- 特效 ---------------- */
  floatText(text, x, y, color, size) {
    this.floats.push({
      text, x, y, color: color || '#f4e8cd',
      size: size || 16, start: performance.now(), life: 820
    });
  },

  slash(x, y, kind) {
    this.slashes.push({ x, y, kind: kind || 'slash', start: performance.now(), life: 380 });
  },

  flash(color, alpha) {
    this.flashes.push({ color: color || '#fff', alpha: alpha || 0.25, start: performance.now(), life: 220 });
  },

  shake(power) {
    this.shakeT = performance.now();
    this.shakePower = power || 5;
  },

  clearFx() {
    this.floats = [];
    this.slashes = [];
    this.flashes = [];
    this.moving = null;
    this.lungeFx = null;
    this.hpView = null;
  },

  /* ---------------- 主绘制 ---------------- */
  draw() {
    if (!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const pal = this.palette();
    this.time = performance.now();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    const bg = ctx.createLinearGradient(0, 0, this.W, this.H);
    bg.addColorStop(0, pal.bg);
    bg.addColorStop(0.55, '#0b100e');
    bg.addColorStop(1, '#090d0b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, this.W, this.H);
    if (!this.battle) return;

    let shx = 0, shy = 0;
    const since = this.time - this.shakeT;
    if (since < 260) {
      const k = (1 - since / 260) * this.shakePower;
      shx = (Math.random() - 0.5) * k * 2;
      shy = (Math.random() - 0.5) * k * 2;
    }
    ctx.save();
    ctx.translate(shx, shy);

    const b = this.battle;
    // 桌面外的留白
    const glow = ctx.createRadialGradient(this.ox + this.boardW / 2, this.oy + this.boardH / 2, 10, this.ox + this.boardW / 2, this.oy + this.boardH / 2, Math.max(this.boardW, this.boardH) * 0.7);
    glow.addColorStop(0, 'rgba(52,72,60,.24)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.W, this.H);

    // 画框投影
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.55)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = 'rgba(10,14,11,.8)';
    ctx.fillRect(this.ox - 3, this.oy - 3, this.boardW + 6, this.boardH + 6);
    ctx.restore();

    // 地形动态层变更后标脏，这里重建缓存再画
    if (this.terrainDirty) {
      this.terrainDirty = false;
      this.buildTerrain();
    }
    if (this.terrainCanvas) {
      ctx.drawImage(this.terrainCanvas, this.ox, this.oy, this.boardW, this.boardH);
    } else {
      ctx.fillStyle = pal.paper;
      ctx.fillRect(this.ox, this.oy, this.boardW, this.boardH);
    }

    this.drawGrid(ctx);
    this.drawRanges(ctx, b);
    this.drawWater(ctx, b);
    this.drawDust(ctx);
    this.drawNodes(ctx, b);
    this.drawUnits(ctx, b);
    this.drawFog(ctx, b);
    this.drawFx(ctx);
    this.drawCursor(ctx, b);
    this.drawFrame(ctx);
    ctx.restore();
  },

  /* 水面波光：深水格上缓慢移的正弦高光 */
  drawWater(ctx, b) {
    if (!b.grid) return;
    const t = this.tile;
    const now = this.time;
    ctx.save();
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 16; x++) {
        if (TerrainFX.tileChar(b, x, y) !== '~') continue;
        const px = this.ox + x * t, py = this.oy + y * t;
        const off = Math.sin(now / 900 + x * 1.3 + y * 0.9) * t * 0.16;
        const grd = ctx.createLinearGradient(px, py + off, px, py + t + off);
        grd.addColorStop(0, 'rgba(220,238,235,.16)');
        grd.addColorStop(0.5, 'rgba(220,238,235,.03)');
        grd.addColorStop(1, 'rgba(220,238,235,.12)');
        ctx.fillStyle = grd;
        ctx.fillRect(px, py, t, t);
        ctx.strokeStyle = 'rgba(226,242,238,.14)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + t * 0.15, py + t * 0.5 + off * 0.6);
        ctx.quadraticCurveTo(px + t * 0.5, py + t * 0.42 + off * 0.6, px + t * 0.85, py + t * 0.5 + off * 0.6);
        ctx.stroke();
      }
    }
    ctx.restore();
  },

  /* 灵尘：洪荒虚空中飘浮的金青微光（位置确定、随时间缓移） */
  drawDust(ctx) {
    const now = this.time;
    ctx.save();
    for (let i = 0; i < 26; i++) {
      const hx = this.hash(i, 11, 5);
      const hy = this.hash(i, 22, 6);
      const sp = 0.4 + this.hash(i, 33, 7) * 0.8;
      const drift = (now / 1000) * sp;
      const x = (hx * this.W + Math.sin(drift + i) * 14 + this.W) % this.W;
      const y = (hy * this.H - drift * 9 % this.H + this.H) % this.H;
      const tw = 0.35 + 0.3 * Math.sin(now / 700 + i * 1.7);
      const warm = this.hash(i, 44, 8) > 0.45;
      ctx.fillStyle = warm
        ? `rgba(240,209,137,${tw.toFixed(2)})`
        : `rgba(127,181,154,${(tw * 0.8).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.8 + this.hash(i, 55, 9) * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  drawGrid(ctx) {
    const t = this.tile;
    ctx.save();
    ctx.strokeStyle = 'rgba(120,96,54,.16)';
    ctx.lineWidth = 1;
    for (let x = 1; x < 16; x++) {
      ctx.beginPath();
      ctx.moveTo(this.ox + x * t + 0.5, this.oy);
      ctx.lineTo(this.ox + x * t + 0.5, this.oy + this.boardH);
      ctx.stroke();
    }
    for (let y = 1; y < 8; y++) {
      ctx.beginPath();
      ctx.moveTo(this.ox, this.oy + y * t + 0.5);
      ctx.lineTo(this.ox + this.boardW, this.oy + y * t + 0.5);
      ctx.stroke();
    }
    ctx.restore();
  },

  drawFrame(ctx) {
    const x0 = this.ox - 1.5, y0 = this.oy - 1.5;
    const w = this.boardW + 3, h = this.boardH + 3;
    ctx.save();
    ctx.strokeStyle = 'rgba(211,171,110,.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, w, h);
    ctx.strokeStyle = 'rgba(20,24,20,.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.ox + 3, this.oy + 3, this.boardW - 6, this.boardH - 6);
    // 四角云纹角花：双弧 + 一枚金点
    const c = Math.min(16, this.tile * 0.4);
    ctx.strokeStyle = 'rgba(240,209,137,.75)';
    ctx.lineWidth = 1.4;
    const corners = [[x0, y0, 1, 1], [x0 + w, y0, -1, 1], [x0, y0 + h, 1, -1], [x0 + w, y0 + h, -1, -1]];
    for (const [cx, cy, sx, sy] of corners) {
      ctx.beginPath();
      ctx.arc(cx + sx * c, cy + sy * c, c, sx * sy > 0 ? Math.PI : 0, sx * sy > 0 ? Math.PI * 1.5 : Math.PI * 0.5, sy < 0);
      ctx.stroke();
      ctx.fillStyle = 'rgba(240,209,137,.9)';
      ctx.beginPath();
      ctx.arc(cx + sx * c * 0.72, cy + sy * c * 0.72, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  drawRanges(ctx, b) {
    const t = this.tile;
    const now = this.time;
    if (b.moveRange && b.moveRange.size) {
      for (const node of b.moveRange.values()) {
        if (node.occupied && !(b.selectedUnit && node.x === b.selectedUnit.x && node.y === b.selectedUnit.y)) continue;
        const px = this.ox + node.x * t, py = this.oy + node.y * t;
        ctx.fillStyle = node.endable ? 'rgba(78,128,145,.25)' : 'rgba(78,128,145,.13)';
        ctx.fillRect(px + 1, py + 1, t - 2, t - 2);
        if (node.endable) {
          ctx.strokeStyle = 'rgba(117,172,185,.4)';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 1.5, py + 1.5, t - 3, t - 3);
        }
      }
    }
    if (b.attackRange && b.attackRange.size) {
      for (const k of b.attackRange) {
        const p = k.split(',');
        const x = +p[0], y = +p[1];
        if (x < 0 || y < 0 || x >= 16 || y >= 8) continue;
        const px = this.ox + x * t, py = this.oy + y * t;
        ctx.fillStyle = 'rgba(156,64,51,.22)';
        ctx.fillRect(px + 1, py + 1, t - 2, t - 2);
        ctx.strokeStyle = 'rgba(189,93,73,.46)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 1.5, py + 1.5, t - 3, t - 3);
      }
    }
    if (b.targetTiles && b.targetTiles.size) {
      const pulse = 0.4 + Math.sin(now / 180) * 0.2;
      for (const k of b.targetTiles) {
        const p = k.split(',');
        const px = this.ox + (+p[0]) * t, py = this.oy + (+p[1]) * t;
        ctx.strokeStyle = `rgba(220,114,84,${pulse.toFixed(2)})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 2.5, py + 2.5, t - 5, t - 5);
      }
    }
    if (b.pathPreview && b.pathPreview.length > 1) {
      ctx.save();
      ctx.fillStyle = 'rgba(230,196,122,.8)';
      for (let i = 0; i < b.pathPreview.length; i++) {
        const p = b.pathPreview[i];
        const cx = this.ox + p.x * t + t / 2;
        const cy = this.oy + p.y * t + t / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, i === b.pathPreview.length - 1 ? 4 : 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (b.dangerOn && b.dangerSet && b.dangerSet.size) {
      ctx.save();
      for (const k of b.dangerSet) {
        const p = k.split(',');
        const x = +p[0], y = +p[1];
        if (x < 0 || y < 0 || x >= 16 || y >= 8) continue;
        if (b.fog && b.visible && !b.visible.has(k)) continue;
        const px = this.ox + x * t, py = this.oy + y * t;
        ctx.fillStyle = 'rgba(155,55,45,.2)';
        ctx.fillRect(px, py, t, t);
        ctx.strokeStyle = 'rgba(206,96,74,.33)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = -t; i < t; i += 7) {
          ctx.moveTo(px + Math.max(0, i), py + Math.max(0, -i));
          ctx.lineTo(px + Math.min(t, i + t), py + Math.min(t, t - i));
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    // 已行动未选中单位不额外标记
    if (b.hover && b.hoverTileInfo) {
      const px = this.ox + b.hover.x * t, py = this.oy + b.hover.y * t;
      ctx.strokeStyle = 'rgba(240,225,190,.55)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px + 0.5, py + 0.5, t - 1, t - 1);
    }
  },

  nodePulse(node, now) {
    const active = node.active;
    const base = node.owner === 'player' ? [91, 155, 134] : node.owner === 'enemy' ? [168, 74, 59] : [150, 145, 126];
    const pulse = 0.5 + Math.sin(now / 420 + node.x * 0.7) * 0.5;
    return { base, pulse, alpha: active ? 0.55 + pulse * 0.3 : 0.24 };
  },

  drawNodes(ctx, b) {
    if (!b.nodes) return;
    const t = this.tile;
    const now = this.time;
    for (const node of b.nodes) {
      const center = this.tileCenter(node.x, node.y);
      const { base, pulse, alpha } = this.nodePulse(node, now);
      const hidden = b.fog && b.explored && !b.explored.has(node.x + ',' + node.y);
      if (hidden) continue;
      ctx.save();
      ctx.translate(center.x, center.y);
      if (node.active) {
        const grd = ctx.createRadialGradient(0, 0, 2, 0, 0, t * 0.55);
        grd.addColorStop(0, `rgba(${base[0]},${base[1]},${base[2]},${(0.32 * (0.6 + pulse * 0.4)).toFixed(3)})`);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(0, 0, t * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = `rgba(${base[0]},${base[1]},${base[2]},${alpha.toFixed(2)})`;
      ctx.lineWidth = node.active ? 2 : 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, t * (node.active ? 0.3 + pulse * 0.015 : 0.28), 0, Math.PI * 2);
      ctx.stroke();
      if (node.active) {
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.arc(0, 0, t * 0.39, now / 1200, now / 1200 + Math.PI * 1.5);
        ctx.stroke();
        ctx.setLineDash([]);
        // 符文环：六枚绕行的小印
        const rr = t * 0.47;
        for (let i = 0; i < 6; i++) {
          const a = now / 2600 + (Math.PI * 2 / 6) * i;
          const rx = Math.cos(a) * rr, ry = Math.sin(a) * rr * 0.96;
          const dotA = 0.35 + 0.3 * Math.sin(now / 500 + i * 1.1);
          ctx.fillStyle = `rgba(${base[0]},${base[1]},${base[2]},${dotA.toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(rx, ry, 1.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = `rgba(${base[0]},${base[1]},${base[2]},${node.active ? 0.88 : 0.55})`;
      ctx.font = `600 ${Math.max(9, Math.round(t * 0.24))}px "Songti SC", "STSong", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(NODE_INFO[node.type] ? NODE_INFO[node.type].name[0] : '脉', 0, 1);
      if ((node.tier || 1) > 1) {
        ctx.font = `600 ${Math.max(8, Math.round(t * 0.17))}px "Songti SC", "STSong", serif`;
        ctx.fillText(['', 'Ⅰ', 'Ⅱ', 'Ⅲ'][Math.min(node.tier || 1, 3)], 0, -t * 0.46);
      }
      ctx.restore();
    }
  },

  drawUnits(ctx, b) {
    const t = this.tile;
    const now = this.time;
    const list = b.units ? b.units.filter(u => u.hp > 0 && !u.escaped) : [];
    const withPos = list.map(u => ({ u, p: this.getUnitPos(u) }));
    withPos.sort((a, b2) => a.p.y - b2.p.y);
    for (const item of withPos) {
      const u = item.u;
      if (b.fog && u.side === 'enemy') {
        const key = u.x + ',' + u.y;
        if (!b.visible || !b.visible.has(key)) continue;
      }
      this.drawUnit(ctx, u, item.p, b, now);
    }
    // 选中单位再画一圈
    if (b.selectedUnit && b.selectedUnit.hp > 0) {
      const p = this.getUnitPos(b.selectedUnit);
      const center = this.tileCenter(p.x, p.y);
      ctx.save();
      ctx.strokeStyle = 'rgba(230,196,122,.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = -(now / 60) % 8;
      ctx.beginPath();
      ctx.arc(center.x, center.y, t * 0.36, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  },

  drawUnit(ctx, u, pos, b, now) {
    const t = this.tile;
    const cx = this.ox + pos.x * t + t / 2;
    const cy = this.oy + pos.y * t + t / 2;
    const isPlayer = u.side === 'player';
    const color = isPlayer ? '#3f6259' : (u.recruitable ? '#8e7340' : '#854036');
    const ring = isPlayer ? '#b9d0c4' : '#e0b8a9';
    const r = t * (u.boss ? 0.36 : 0.32);
    const hp = this.hpView && this.hpView[u.id] !== undefined ? this.hpView[u.id] : u.hp;
    const maxHp = u.stats.hp || 1;

    ctx.save();
    // 脚下灵环：我方青、敌军绛、可招募金，呼吸明灭
    const aura = isPlayer ? '127,181,154' : (u.recruitable ? '211,171,94' : '196,96,74');
    const auraA = 0.16 + 0.08 * Math.sin(now / 520 + u.x * 0.8 + u.y * 0.6);
    const auraR = r * 1.32;
    const ag = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, auraR);
    ag.addColorStop(0, `rgba(${aura},${auraA.toFixed(2)})`);
    ag.addColorStop(1, `rgba(${aura},0)`);
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(cx, cy, auraR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(${aura},${(auraA * 1.6).toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.82, r * 0.95, r * 0.34, 0, 0, Math.PI * 2);
    ctx.stroke();
    // 影子
    ctx.fillStyle = 'rgba(20,25,20,.24)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.82, r * 0.82, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    if (u.boss) {
      ctx.strokeStyle = 'rgba(205,170,95,.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 4 + Math.sin(now / 380) * 1.2, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = u.acted && isPlayer ? 0.56 : 1;
    const body = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.15, cx, cy, r);
    body.addColorStop(0, isPlayer ? '#6e9487' : '#ab6658');
    body.addColorStop(1, color);
    ctx.fillStyle = body;
    ctx.strokeStyle = 'rgba(18,24,20,.78)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = ring;
    ctx.globalAlpha *= 0.6;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2.5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = u.acted && isPlayer ? 0.68 : 1;
    ctx.fillStyle = '#f3e9d2';
    ctx.font = `600 ${Math.max(12, Math.round(t * 0.32))}px "Songti SC", "STSong", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(u.name.charAt(0), cx, cy + 0.5);

    // 兵种符号
    const w = Combat.weaponOf(u) || Combat.staffOf(u);
    const icon = w ? (WEAPON_TYPES[w.w.type] ? WEAPON_TYPES[w.w.type].icon : '') : '';
    if (icon) {
      ctx.font = `${Math.max(8, Math.round(t * 0.17))}px "Songti SC", serif`;
      ctx.fillStyle = 'rgba(28,32,25,.9)';
      ctx.beginPath();
      ctx.arc(cx + r * 0.72, cy - r * 0.7, Math.max(6, t * 0.13), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(238,228,205,.94)';
      ctx.fill();
      ctx.fillStyle = '#3a3a2b';
      ctx.fillText(icon, cx + r * 0.72, cy - r * 0.68);
    }

    // 可说得标记
    if (u.recruitable && u.side === 'enemy') {
      ctx.fillStyle = 'rgba(215,177,91,.95)';
      ctx.font = `600 ${Math.max(11, Math.round(t * 0.28))}px "Songti SC", serif`;
      ctx.fillText('!', cx, cy - r - 8);
    }

    ctx.globalAlpha = 1;
    // 名字
    if (u.boss || b.selectedUnit === u || (b.hoverUnit === u)) {
      ctx.font = `${Math.max(9, Math.round(t * 0.19))}px "Noto Serif SC", "Songti SC", serif`;
      ctx.fillStyle = isPlayer ? 'rgba(233,240,228,.95)' : 'rgba(244,218,208,.95)';
      ctx.strokeStyle = 'rgba(10,14,11,.7)';
      ctx.lineWidth = 2.5;
      const label = u.name;
      ctx.strokeText(label, cx, cy - r - 7);
      ctx.fillText(label, cx, cy - r - 7);
    }

    // 血条
    const bw = t * 0.68, bh = Math.max(3, t * 0.075);
    const bx = cx - bw / 2, by = cy + r + 3;
    ctx.fillStyle = 'rgba(20,24,20,.65)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    const frac = Math.max(0, hp / maxHp);
    ctx.fillStyle = u.side === 'player' ? (frac > 0.5 ? '#8faf77' : frac > 0.25 ? '#c3a35b' : '#b6503f') : '#b85f4e';
    ctx.fillRect(bx, by, bw * frac, bh);

    // 状态标记
    if (u.statuses && (u.statuses.movePenalty || u.statuses.def)) {
      ctx.fillStyle = 'rgba(190,150,200,.9)';
      ctx.font = `${Math.max(9, Math.round(t * 0.2))}px serif`;
      ctx.fillText('◇', cx - r - 6, cy - r);
    }
    // 已行动标记
    if (isPlayer && u.acted) {
      ctx.fillStyle = 'rgba(20,25,20,.35)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },

  drawFog(ctx, b) {
    if (!b.fog) return;
    const t = this.tile;
    ctx.save();
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 16; x++) {
        const k = x + ',' + y;
        if (b.visible && b.visible.has(k)) continue;
        const explored = b.explored && b.explored.has(k);
        const px = this.ox + x * t, py = this.oy + y * t;
        const n = this.hash(x, y, 9);
        if (explored) {
          ctx.fillStyle = `rgba(10,15,12,${(0.5 + n * 0.07).toFixed(2)})`;
          ctx.fillRect(px, py, t + 0.5, t + 0.5);
        } else {
          ctx.fillStyle = `rgba(8,12,10,${(0.94 + n * 0.04).toFixed(2)})`;
          ctx.fillRect(px, py, t + 0.5, t + 0.5);
        }
      }
    }
    if (b.visible) {
      ctx.globalCompositeOperation = 'lighter';
      for (const k of b.visible) {
        const p = k.split(',');
        const cx = this.ox + (+p[0]) * t + t / 2;
        const cy = this.oy + (+p[1]) * t + t / 2;
        const grd = ctx.createRadialGradient(cx, cy, t * 0.2, cx, cy, t * 1.6);
        grd.addColorStop(0, 'rgba(230,220,190,.12)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(cx, cy, t * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  },

  drawCursor(ctx, b) {
    if (!b.hover) return;
    const t = this.tile;
    const px = this.ox + b.hover.x * t, py = this.oy + b.hover.y * t;
    ctx.save();
    ctx.strokeStyle = 'rgba(235,214,167,.75)';
    ctx.lineWidth = 1;
    const c = Math.min(t * 0.2, 10);
    const corners = [
      [px + 1, py + 1, 1, 1], [px + t - 1, py + 1, -1, 1],
      [px + 1, py + t - 1, 1, -1], [px + t - 1, py + t - 1, -1, -1]
    ];
    for (const [x, y, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x + dx * c, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * c);
      ctx.stroke();
    }
    ctx.restore();
  },

  drawFx(ctx) {
    const now = this.time;
    const t = this.tile;
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      const p = (now - s.start) / s.life;
      if (p >= 1) { this.slashes.splice(i, 1); continue; }
      const cx = this.ox + s.x * t + t / 2;
      const cy = this.oy + s.y * t + t / 2;
      ctx.save();
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = s.kind === 'crit' ? '#f0c977' : '#f1e8d6';
      ctx.lineWidth = s.kind === 'crit' ? 4 : 2;
      ctx.beginPath();
      const span = t * (0.55 + p * 0.25);
      ctx.moveTo(cx - span, cy - span * 0.7);
      ctx.lineTo(cx + span * 0.8, cy + span * 0.6);
      ctx.moveTo(cx + span * 0.4, cy - span * 0.8);
      ctx.lineTo(cx - span * 0.6, cy + span * 0.45);
      ctx.stroke();
      if (s.kind === 'miss') {
        ctx.strokeStyle = 'rgba(220,225,210,.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, span * (0.4 + p * 0.4), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      const p = (now - f.start) / f.life;
      if (p >= 1) { this.floats.splice(i, 1); continue; }
      const cx = this.ox + f.x * t + t / 2;
      const cy = this.oy + f.y * t + t / 2 - p * t * 0.7;
      ctx.save();
      ctx.globalAlpha = p < 0.8 ? 1 : 1 - (p - 0.8) / 0.2;
      ctx.font = `700 ${f.size}px "Noto Serif SC", "Songti SC", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(15,20,16,.8)';
      ctx.strokeText(f.text, cx, cy);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, cx, cy);
      ctx.restore();
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      const p = (now - f.start) / f.life;
      if (p >= 1) { this.flashes.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = (1 - p) * f.alpha;
      ctx.fillStyle = f.color;
      ctx.fillRect(this.ox, this.oy, this.boardW, this.boardH);
      ctx.restore();
    }
  }
};

if (typeof window !== 'undefined') window.Render = Render;
