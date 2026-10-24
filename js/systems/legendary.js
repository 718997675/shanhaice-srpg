/* ============================================================
 * 山海策 · 灵脉  —  传说武器链路（systems/legendary.js）
 * 数据：data-systems.js 的 LEGENDARY_WEAPONS。
 * 规则：
 *   小概率掉落：每次讨伐传说首领仅 LEGENDARY_DROP.base 概率直接掉落；
 *     未掉则累积「缘」（campaign.legendaryPity[boss]），每次 +ramp，
 *     cap 封顶，累计 hardPity 次必掉；二周目起基础掉率 +ngplus/周目。
 *   已拥有后重打同一 Boss → 保底转化为盘缠 + 脉印（rematch）；
 *   二周目（campaign.cycle ≥ 2）重打 → 双倍脉印与盘缠（ngplus）；
 *   打造坊只收 forgeable !== false 的兵装，传说武器不可打造。
 * 加载顺序：data-systems → systems/legendary（方法体内调用，顺序无关）。
 * ============================================================ */

/* 掉落曲线：3% 起步，每未掉 +3%，25% 封顶，12 次必掉；二周目 +5%/周目 */
const LEGENDARY_DROP = { base: 0.03, ramp: 0.03, cap: 0.25, hardPity: 12, ngplus: 0.05 };

const Legendary = {
  DROP: LEGENDARY_DROP,

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

  /* 缘：某首领自上次掉落（或开档）以来的讨伐次数 */
  pityOf(campaign, rawType) {
    return (campaign && campaign.legendaryPity && campaign.legendaryPity[rawType]) || 0;
  },

  bumpPity(campaign, rawType) {
    if (!campaign) return 0;
    if (!campaign.legendaryPity) campaign.legendaryPity = {};
    const n = this.pityOf(campaign, rawType) + 1;
    campaign.legendaryPity[rawType] = n;
    return n;
  },

  resetPity(campaign, rawType) {
    if (campaign && campaign.legendaryPity) delete campaign.legendaryPity[rawType];
  },

  /* 当前掉率（纯函数，UI/测试用）：{ chance, since, hardPity, ngplus, guaranteed }
   * since = 已讨伐次数（不含本次）；本次即第 hardPity 次时必掉。 */
  dropChance(campaign, rawType) {
    if (!this.forBoss(rawType)) return null;
    const cycle = Math.max(1, Math.floor((campaign && campaign.cycle) || 1));
    const ngplus = cycle >= 2;
    const since = this.pityOf(campaign, rawType);
    let chance = LEGENDARY_DROP.base + LEGENDARY_DROP.ramp * since +
      (ngplus ? LEGENDARY_DROP.ngplus * (cycle - 1) : 0);
    chance = Math.min(LEGENDARY_DROP.cap, chance);
    const guaranteed = since + 1 >= LEGENDARY_DROP.hardPity;
    return { chance: guaranteed ? 1 : chance, since, hardPity: LEGENDARY_DROP.hardPity, ngplus, guaranteed };
  },

  /* Boss 死亡结算。rng 可注入（测试用），默认 Math.random。
   * 返回 { key, name, action: 'drop'|'convert'|'miss', chance, since, gold, seals, ngplus } 或 null */
  onBossKilled(campaign, rawType, rng) {
    const w = this.forBoss(rawType);
    if (!w) return null;
    if (this.isOwned(campaign, w.key)) {
      const ngplus = ((campaign && campaign.cycle) || 1) >= 2;
      return {
        key: w.key, name: w.name, action: 'convert', chance: 0, since: this.pityOf(campaign, rawType),
        gold: ngplus ? 400 : 250, seals: ngplus ? 2 : 1, ngplus
      };
    }
    const d = this.dropChance(campaign, rawType);
    const roll = (typeof rng === 'function' ? rng() : Math.random());
    const since = this.bumpPity(campaign, rawType);
    if (d.guaranteed || roll < d.chance) {
      this.markOwned(campaign, w.key);
      this.resetPity(campaign, rawType);
      return { key: w.key, name: w.name, action: 'drop', chance: d.chance, since, gold: 0, seals: 0, ngplus: d.ngplus };
    }
    return { key: w.key, name: w.name, action: 'miss', chance: d.chance, since, gold: 0, seals: 0, ngplus: d.ngplus };
  },

  /* 图鉴/提示文本 */
  hint(key) {
    const w = LEGENDARY_WEAPONS[key];
    if (!w) return '';
    const src = ENEMY_TYPES[w.source];
    return '「' + (src ? src.name : w.source) + '」极小概率掉落 · 每未掉 +' +
      Math.round(LEGENDARY_DROP.ramp * 100) + '%（' + Math.round(LEGENDARY_DROP.cap * 100) +
      '% 封顶）· ' + LEGENDARY_DROP.hardPity + ' 次必掉 · 不可打造';
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
