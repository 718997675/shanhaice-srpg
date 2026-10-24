/* ============================================================
 * 山海策 · 灵脉  —  传说武器链路（systems/legendary.js）
 * 数据：data-systems.js 的 LEGENDARY_WEAPONS。
 * 规则：
 *   首杀必掉（战役内唯一，campaign.legendary 记账）；
 *   已拥有后重打同一 Boss → 保底转化为盘缠 + 脉印（rematch）；
 *   二周目（campaign.cycle ≥ 2）重打 → 双倍脉印与盘缠（ngplus）；
 *   打造坊只收 forgeable !== false 的兵装，传说武器不可打造。
 * 加载顺序：data-systems → systems/legendary（方法体内调用，顺序无关）。
 * ============================================================ */
const Legendary = {
  /* Boss 的 ENEMY_TYPES 键 → 传说武器定义 */
  forBoss(rawType) {
    for (const k in LEGENDARY_WEAPONS) {
      if (LEGENDARY_WEAPONS[k].source === rawType) return LEGENDARY_WEAPONS[k];
    }
    return null;
  },

  isOwned(campaign, key) {
    return !!(campaign && campaign.legendary && campaign.legendary[key]);
  },

  markOwned(campaign, key) {
    if (!campaign) return;
    if (!campaign.legendary) campaign.legendary = {};
    campaign.legendary[key] = true;
  },

  ownedCount(campaign) {
    return campaign && campaign.legendary ? Object.keys(campaign.legendary).length : 0;
  },

  /* Boss 死亡结算：{ key, name, action: 'drop'|'convert', gold, seals, ngplus } 或 null */
  onBossKilled(campaign, rawType) {
    const w = this.forBoss(rawType);
    if (!w) return null;
    if (!this.isOwned(campaign, w.key)) {
      this.markOwned(campaign, w.key);
      return { key: w.key, name: w.name, action: 'drop', gold: 0, seals: 0, ngplus: false };
    }
    const ngplus = ((campaign && campaign.cycle) || 1) >= 2;
    return {
      key: w.key, name: w.name, action: 'convert',
      gold: ngplus ? 400 : 250,
      seals: ngplus ? 2 : 1,
      ngplus
    };
  },

  /* 图鉴/提示文本 */
  hint(key) {
    const w = LEGENDARY_WEAPONS[key];
    if (!w) return '';
    const src = ENEMY_TYPES[w.source];
    return '「' + (src ? src.name : w.source) + '」首杀必掉 · 不可打造 · 重打保底' +
      (w.drop && w.drop.ngplus ? ' · 二周目保底' : '');
  }
};

/* ---------------- 打造坊 ---------------- */
const FORGE_COST_BY_RANK = { D: [200, 0], C: [350, 0], B: [600, 1], A: [1000, 2], S: [1600, 3] };

const Forge = {
  /* 可打造 = 在武器表内 + 非传说（forgeable:false）+ 有售价（排除 Boss 兵装等 price=0 专属物） */
  canCraft(key) {
    const w = WEAPONS[key];
    return !!w && w.forgeable !== false && w.price > 0;
  },

  cost(key) {
    const w = WEAPONS[key];
    if (!w) return null;
    const t = FORGE_COST_BY_RANK[w.rank] || [400, 1];
    return { gold: t[0], seals: t[1] };
  },

  craft(campaign, key) {
    if (!WEAPONS[key]) return { ok: false, why: 'unknown' };
    if (WEAPONS[key].forgeable === false) return { ok: false, why: 'legendary' };
    if (!this.canCraft(key)) return { ok: false, why: 'not-craftable' };
    const cost = this.cost(key);
    if (campaign.gold < cost.gold) return { ok: false, why: 'gold' };
    if (campaign.seals < cost.seals) return { ok: false, why: 'seals' };
    if (!Array.isArray(campaign.convoy)) campaign.convoy = [];
    if (campaign.convoy.length >= 60) return { ok: false, why: 'convoy' };
    campaign.gold -= cost.gold;
    campaign.seals -= cost.seals;
    campaign.convoy.push({ key, uses: WEAPONS[key].uses || 1 });
    return { ok: true, cost, key };
  }
};

if (typeof window !== 'undefined') { window.Legendary = Legendary; window.Forge = Forge; }
