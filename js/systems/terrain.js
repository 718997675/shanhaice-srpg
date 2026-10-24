/* ============================================================
 * 地形动态层（P1.2）
 * 在静态地图 grid 之上维护一层可到期失效的覆盖层：
 *   B.overlays[key] = { char: 'I', until: 回合数 }
 * 规则（滑行结算）在 combat.js；本模块只做状态与纯函数，
 * 经 battle.js 的 tileAt/tileChar/序列化钩子接入，不反向依赖 UI。
 * ============================================================ */
const TerrainFX = {
  key(x, y) { return x + ',' + y; },

  /* 覆盖一层地形；turns 为持续回合数（含当前回合），省略则永久 */
  set(B, x, y, char, turns) {
    if (!B || !B.grid[y] || B.grid[y][x] === undefined) return false;
    B.overlays = B.overlays || {};
    B.overlays[this.key(x, y)] = {
      char: char,
      until: turns ? B.turn + turns - 1 : Infinity
    };
    return true;
  },

  remove(B, x, y) {
    if (!B || !B.overlays) return false;
    return delete B.overlays[this.key(x, y)];
  },

  clear(B) {
    if (B) B.overlays = {};
  },

  /* 生效中的地形字符：覆盖层优先于静态地图 */
  tileChar(B, x, y) {
    if (!B || !B.grid[y] || B.grid[y][x] === undefined) return null;
    const o = B.overlays && B.overlays[this.key(x, y)];
    return o ? o.char : B.grid[y][x];
  },

  /* 叠加覆盖层后的网格副本（寻路/危险范围用；滑行仍只在落地时结算） */
  resolvedGrid(B) {
    if (!B || !B.grid) return B && B.grid;
    const o = B.overlays || {};
    return B.grid.map((row, y) => {
      let out = '';
      for (let x = 0; x < row.length; x++) {
        const k = this.key(x, y);
        out += o[k] ? o[k].char : row[x];
      }
      return out;
    });
  },

  /* 回合开始清理到期层，返回被清理的键 */
  expire(B) {
    const gone = [];
    if (!B || !B.overlays) return gone;
    for (const k in B.overlays) {
      if (B.overlays[k].until <= B.turn) { gone.push(k); delete B.overlays[k]; }
    }
    return gone;
  },

  /* ============================================================
   * 滑行目的地结算（纯函数）
   * path 为 Combat.pathTo 给出的路径（含起点）。终点在冰面上时，
   * 沿最后一步的方向滑行至稳定点；返回 null 表示无需滑行。
   * 返回 { x, y, path }：path 为从原位置到终点的完整动画路径。
   * ============================================================ */
  slideDestination(B, path) {
    if (!B || !path || path.length < 2) return null;
    const to = path[path.length - 1];
    const from = path[path.length - 2];
    const t = TERRAIN[this.tileChar(B, to.x, to.y)];
    if (!t || !t.slide) return null;
    const dx = Math.sign(to.x - from.x), dy = Math.sign(to.y - from.y);
    if (dx === 0 && dy === 0) return null;
    const w = B.grid[0].length, h = B.grid.length;
    const occupied = (x, y) =>
      B.units.some(u => u.hp > 0 && !u.escaped && u.x === x && u.y === y);
    const r = Combat.slide(
      (x, y) => TERRAIN[this.tileChar(B, x, y)],
      occupied, w, h, to.x, to.y, dx, dy);
    if (!r.path.length) return null;                 // 入口即停（理论上不会发生）
    return { x: r.x, y: r.y, path: path.slice(0, -1).concat(r.path) };
  }
};

if (typeof window !== 'undefined') window.TerrainFX = TerrainFX;
