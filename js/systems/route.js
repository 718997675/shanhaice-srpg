/* ============================================================
 * 山海策 · 灵脉  —  战役路线（P3.1）
 * 第 4 章末分歧：A 线「焚脉」写追 / B 线「守脉」写守，各 3 章，
 * 第 8 章天柱废墟汇合，第 9~12 章「下海」，第 13 章浊潮之眼终战。
 * campaign.chapter 存「下一章 id」（字符串或数字），不再存位置下标。
 * ============================================================ */

const ROUTES = {
  A: {
    key: 'A',
    name: '焚脉',
    slogan: '追',
    title: 'A 线 · 焚脉',
    desc: '玄阙亲自押送被俘守脉人赶往浊潮之眼。追上去，把他们带回来——代价是身后的灯火。',
    chapters: ['5A', '6A', '7A']
  },
  B: {
    key: 'B',
    name: '守脉',
    slogan: '守',
    title: 'B 线 · 守脉',
    desc: '断魂谷地脉开裂，半个青岚州将成泽国。守住谷口，等村民撤完——代价是追不上的那条路。',
    chapters: ['5B', '6B', '7B']
  }
};

/* 共享脊线：第 1~4 章共通，第 8 章汇合，9~12 章「下海」共通，第 13 章终战 */
const ROUTE_SPINE = [1, 2, 3, 4];
const ROUTE_MERGE = 8;              // 天柱废墟（汇合章）
const ROUTE_POST = [9, 10, 11, 12]; // 下海四章（汇合之后、终章之前，两线共通）
const ROUTE_FINALE = 13;            // 浊潮之眼（终章）

const Route = {
  ROUTES,
  SPINE: ROUTE_SPINE,
  MERGE: ROUTE_MERGE,
  POST: ROUTE_POST,
  FINALE: ROUTE_FINALE,

  /* 章节 id → 章节对象（找不到返 null） */
  byId(id) {
    if (id == null) return null;
    return CHAPTERS.find(c => c.id === id) || null;
  },

  /* 全部章节 id */
  allIds() {
    return CHAPTERS.map(c => c.id);
  },

  /* 某条路线（含未选路线时的共享脊线）的完整章节序列 */
  order(routeKey) {
    const spine = ROUTE_SPINE.map(id => this.byId(id));
    if (routeKey === 'A' || routeKey === 'B') {
      const route = ROUTES[routeKey].chapters.map(id => this.byId(id));
      const post = ROUTE_POST.map(id => this.byId(id));
      return spine.concat(route, [this.byId(ROUTE_MERGE)], post, [this.byId(ROUTE_FINALE)]);
    }
    return spine;
  },

  /* 下一章 id；没有下一章（终章通过）返 null */
  nextId(routeKey, chapterId) {
    const seq = this.order(routeKey);
    const i = seq.findIndex(c => c && c.id === chapterId);
    if (i < 0 || i + 1 >= seq.length) return null;
    return seq[i + 1].id;
  },

  /* 是否已过分歧点（路线已定） */
  isChosen(routeKey) {
    return routeKey === 'A' || routeKey === 'B';
  },

  /* 是否路线章节 */
  isRouteChapter(chapterId) {
    const id = String(chapterId);
    return id.length === 2 && (id[1] === 'A' || id[1] === 'B') && id[0] >= '5' && id[0] <= '7';
  },

  /* 展示名：如「A 线 · 焚脉」 */
  label(routeKey) {
    const r = ROUTES[routeKey];
    return r ? r.title : '未定';
  },

  /* 章节序号文案（走 no 字段，A/B 线同号不同图） */
  chapterNo(chapterId) {
    const ch = this.byId(chapterId);
    return ch ? ch.no : null;
  },

  /* 稳定的章节种子（id 可能是字符串 '5A'） */
  seedOf(id) {
    if (typeof id === 'number' && isFinite(id)) return id >>> 0;
    const s = String(id == null ? '' : id);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h >>> 0;
  },

  /* v3 旧档迁移：旧 chapter 是位置下标（= 旧 id），旧 5/6/7 章分别对应
   * 新 A5 玄冰祭坛 / B6 云梦泽 / 第 8 章天柱废墟。按最接近的落位续玩，
   * 路线值只影响后续链条（8/9 两章各线一致）。 */
  migrateLegacyChapter(chapter) {
    const n = Math.floor(Number(chapter) || 1);
    if (n === 5) return { chapter: '5A', route: 'A' };
    if (n === 6) return { chapter: '6B', route: 'B' };
    if (n === 7) return { chapter: 8, route: 'A' };
    if (n === 8) return { chapter: ROUTE_FINALE, route: 'A' };
    if (n >= 9) return { chapter: ROUTE_FINALE, route: 'A', cleared: true };
    return { chapter: Math.max(1, Math.min(4, n)), route: null };
  },

  /* v4 → v5：下海四章插在汇合章之后，原第 9 章（终章）后移为第 13 章。
   * 旧档若停在 9 且没通关，就是刚打完天柱废墟——直接进新第 9 章浮槎渡海；
   * 已通关的则落到 13（终章），保持「已通关」语义。 */
  migrateV4Chapter(chapter, cleared) {
    if (String(chapter) === '9') return cleared ? ROUTE_FINALE : 9;
    return chapter;
  }
};

if (typeof window !== 'undefined') window.Route = Route;
