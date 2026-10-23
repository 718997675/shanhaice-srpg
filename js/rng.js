/* ============================================================
 * 确定性随机：状态可存入快照/存档，悔棋可完全复现。
 * 命中 2RN（两次取平均），暴击 1RN，成长 1RN。
 * ============================================================ */
const RNG = {
  state: 0x9e3779b9,

  setSeed(seed) {
    this.state = (seed >>> 0) || 0x9e3779b9;
    return this;
  },

  next() {
    let t = this.state += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  },

  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); },

  chance(pct) { return this.next() * 100 < pct; },

  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; },

  hitRoll() { return (this.next() * 100 + this.next() * 100) / 2; },

  snapshot() { return this.state >>> 0; },

  restore(s) { this.state = (s >>> 0) || 1; }
};

if (typeof window !== 'undefined') window.RNG = RNG;
