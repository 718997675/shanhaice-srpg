/* ============================================================
 * 山海策 · 灵脉  —  大地图战略层（二期 A · 分兵/战线）
 * 队伍分两路：front 随云策出征（当前路线）、rear 留守另一条战线。
 * 第 4 章末选定路线后分兵并锁定；5A~7A / 5B~7B 期间 rear 缺席；
 * 第 8 章天柱废墟汇合自动解锁，全员归队。
 * 规则只在这里，UI（camp.js）与流程（game.js / battle.js）只调用。
 * 红线：不做建造/据点经营，只回答「人往哪放」。
 * ============================================================ */

/* 随行上限：分兵时前阵最多几人（不含援军）。
 * 队伍在第 4 章末约 7 人，留 2 人守另一条战线。调平衡改这里。 */
const STRATEGY_FRONT_CAP = 5;

const Strategy = {
  CAP: STRATEGY_FRONT_CAP,

  /* 空结构（新档 / 旧档补默认） */
  empty() {
    return { front: null, deploy: {}, locked: false, lastOrder: null, adjustAt: null };
  },

  /* 规范化：只保留 roster 内成员的合法标签；云策必须随行；
   * locked 只在对局中的 5~7 章区间成立，其余情况一律解锁（含旧档、周目、已通关）。 */
  normalize(campaign, rosterIds) {
    const c = campaign;
    if (!c) return this.empty();
    const s = (c.strategy && typeof c.strategy === 'object') ? c.strategy : {};
    const ids = Array.isArray(rosterIds) ? rosterIds : ((c.roster || []).map(r => r.id));
    const out = this.empty();
    out.front = (s.front === 'A' || s.front === 'B') ? s.front : null;
    out.lastOrder = s.lastOrder || null;
    out.adjustAt = s.adjustAt || null;
    out.deploy = {};
    const src = (s.deploy && typeof s.deploy === 'object') ? s.deploy : {};
    for (const id of ids) {
      const line = src[id];
      if (line === 'front' || line === 'rear') out.deploy[id] = line;
    }
    /* 云策永远是随行的那一个 */
    if (ids.includes('yunce')) out.deploy.yunce = 'front';
    out.locked = !!s.locked;
    /* 解锁条件：没有选定战线 / 未分兵 / 已离开 5~7 章区间 */
    if (!out.front || !Object.keys(out.deploy).length || !this.inSplitRange(c.chapter)) out.locked = false;
    return out;
  },

  /* 分兵只在这几张章节生效：5A/6A/7A/5B/6B/7B */
  inSplitRange(chapterId) {
    if (typeof Route !== 'undefined' && Route.isRouteChapter) return Route.isRouteChapter(chapterId);
    const id = String(chapterId);
    return id.length === 2 && /[AB]/.test(id[1]) && id[0] >= '5' && id[0] <= '7';
  },

  /* 分兵是否正在生效（本章要按战线筛人） */
  isActive(campaign) {
    const s = campaign && campaign.strategy;
    return !!(s && s.locked && (s.front === 'A' || s.front === 'B') && this.inSplitRange(campaign.chapter));
  },

  /* 某人的归属：'reserve' 援军（不受分兵限制）/ 'rear' 留守 / 'front' 随行 */
  lineOf(campaign, charId) {
    if (typeof CHARS !== 'undefined' && CHARS[charId] && CHARS[charId].reserve) return 'reserve';
    const s = campaign && campaign.strategy;
    if (s && s.deploy && s.deploy[charId] === 'rear') return 'rear';
    return 'front';
  },

  /* 本章能否出战：援军随时可带；分兵生效时 rear 缺席 */
  canDeploy(campaign, charId) {
    if (typeof CHARS !== 'undefined' && CHARS[charId] && CHARS[charId].reserve) return true;
    if (!this.isActive(campaign)) return true;
    return this.lineOf(campaign, charId) !== 'rear';
  },

  /* 名单分组（按传入顺序） */
  idsOf(campaign, line) {
    const roster = (campaign && campaign.roster) || [];
    return roster.map(r => r.id).filter(id => this.lineOf(campaign, id) === line);
  },
  frontIds(campaign) { return this.idsOf(campaign, 'front'); },
  rearIds(campaign) { return this.idsOf(campaign, 'rear'); },
  reserveIds(campaign) { return this.idsOf(campaign, 'reserve'); },

  /* 本章缺席名单（分兵未生效时为空） */
  absentIds(campaign) {
    if (!this.isActive(campaign)) return [];
    return this.rearIds(campaign);
  },

  /* 默认分兵：按 HERO_ORDER 取前 CAP 名非援军成员随行，其余留守 */
  defaultDeploy(campaign, cap) {
    const limit = Math.max(1, cap || this.CAP);
    const roster = (campaign && campaign.roster) || [];
    const order = id => {
      const i = (typeof HERO_ORDER !== 'undefined' ? HERO_ORDER : []).indexOf(id);
      return i < 0 ? 99 : i;
    };
    const pool = roster.map(r => r.id)
      .filter(id => !(typeof CHARS !== 'undefined' && CHARS[id] && CHARS[id].reserve))
      .sort((a, b) => order(a) - order(b));
    const out = {};
    pool.forEach((id, i) => { out[id] = i < limit ? 'front' : 'rear'; });
    if (pool.includes('yunce')) out.yunce = 'front';
    return out;
  },

  /* 分兵：写入战线与名单并锁定 */
  lock(campaign, route, deploy) {
    if (!campaign) return null;
    campaign.strategy = this.normalize(campaign, null);
    campaign.strategy.front = (route === 'A' || route === 'B') ? route : null;
    campaign.strategy.deploy = Object.assign({}, deploy || this.defaultDeploy(campaign));
    campaign.strategy.deploy.yunce = 'front';
    campaign.strategy.locked = true;
    campaign.strategy.adjustAt = campaign.chapter;
    return campaign.strategy;
  },

  /* 汇合 / 通关 / 旧档：解除分兵，全员归队 */
  unlock(campaign) {
    if (!campaign) return null;
    const s = this.normalize(campaign, null);
    s.locked = false;
    campaign.strategy = s;
    return s;
  },

  /* 每章可调整一次分兵（防止把队伍锁死，也保留「这一章不能反悔」的重量） */
  canAdjust(campaign, chapterId) {
    const s = campaign && campaign.strategy;
    if (!s) return true;
    return !s.adjustAt || s.adjustAt !== chapterId;
  },
  markAdjusted(campaign, chapterId) {
    if (!campaign) return;
    campaign.strategy = this.normalize(campaign, null);
    campaign.strategy.adjustAt = chapterId || null;
  },

  /* 展示 */
  label(line) {
    return line === 'rear' ? '留守' : line === 'reserve' ? '援军' : '随行';
  },
  frontLabel(routeKey) {
    if (typeof Route !== 'undefined') return Route.label(routeKey);
    return routeKey === 'A' ? 'A 线 · 焚脉' : routeKey === 'B' ? 'B 线 · 守脉' : '未定';
  },
  /* 一行摘要：A 线 · 焚脉（追） · 随行 5 · 留守 2 */
  summary(campaign) {
    const s = (campaign && campaign.strategy) || this.empty();
    if (!this.isActive(campaign)) return { active: false, text: '未分兵 · 全员可出战', front: 0, rear: 0 };
    const front = this.frontIds(campaign).length;
    const rear = this.rearIds(campaign).length;
    return {
      active: true,
      front,
      rear,
      text: this.frontLabel(s.front) + ' · 随行 ' + front + ' · 留守 ' + rear
    };
  }
};

if (typeof window !== 'undefined') window.Strategy = Strategy;
