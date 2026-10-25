/* ============================================================
 * 山海策 · 灵脉  —  铁匠铺 · 武器强化 +3 与武器进化（systems/smith.js）
 * 强化规则（升级方案 §2.6）：
 *   任意耐久完好的可锻武器 +0 → +3；每级 +1 威力、+3 命中，+3 额外 +5 必杀
 *   （数值公式在 combat.js 的 weaponPlusMods，本系统只把守资格与账目）；
 *   消耗：铁髓×2+100 金 / 钢核×2+300 金 / 银晶×2+600 金（逐级递增）；
 *   耐久为 0 的损坏武器不可强化；强化与修理并存；传说与 Boss 专属不可强化；
 *   材料为可堆叠行囊道具（data-core.js 的 mat_*）。
 * 进化规则（P2.3）：同型兵装沿 WEAPON_EVOLUTIONS 逐级进化，保留强化等级、
 *   耐久刷满、装备位不变；费用 = 盘缠 + 材料；损坏武器不可进化。
 * 加载顺序：data-core → data-systems → systems/smith（方法体内调用，顺序无关）。
 * ============================================================ */
const SMITH_CAP = 3;
const SMITH_COST = {
  1: { mat: 'mat_iron', n: 2, gold: 100 },
  2: { mat: 'mat_steel', n: 2, gold: 300 },
  3: { mat: 'mat_silver', n: 2, gold: 600 }
};

const Smith = {
  cap() { return SMITH_CAP; },

  /* 强化资格：耐久武器 + 非传说/Boss 专属 + 未损坏 + 未满级 */
  canStrengthen(key, item) {
    const w = WEAPONS[key];
    if (!w || !w.uses) return false;               // 仅耐久武器（法术等次数道具除外）
    if (w.forgeable === false || !w.price) return false;  // 传说与 Boss 专属不可强化
    if (!item || (item.uses || 0) <= 0) return false;  // 损坏不可强化
    return (item.plus || 0) < SMITH_CAP;
  },

  /* 下一级费用（材料 key、数量、金币）；已满级返回 null */
  cost(item) {
    const next = (item && item.plus || 0) + 1;
    return SMITH_COST[next] || null;
  },

  /* 行囊中某材料的持有数量 */
  matCount(campaign, matKey) {
    return (campaign.convoy || [])
      .filter(i => i.key === matKey)
      .reduce((s, i) => s + (i.uses || 0), 0);
  },

  /* 执行强化：扣金币与材料（行囊堆叠扣，扣空移除），item.plus +1。
   * why: 'cap' | 'gold' | 'mat' | 'bad' */
  strengthen(campaign, item) {
    if (!item || !item.key) return { ok: false, why: 'bad' };
    if (!this.canStrengthen(item.key, item)) {
      const w = WEAPONS[item.key];
      if (!w || !w.uses || w.forgeable === false) return { ok: false, why: 'bad' };
      if ((item.uses || 0) <= 0) return { ok: false, why: 'broken' };
      return { ok: false, why: 'cap' };
    }
    const c = this.cost(item);
    if (!c) return { ok: false, why: 'cap' };
    if (campaign.gold < c.gold) return { ok: false, why: 'gold' };
    if (this.matCount(campaign, c.mat) < c.n) return { ok: false, why: 'mat' };
    campaign.gold -= c.gold;
    let need = c.n;
    for (let i = campaign.convoy.length - 1; i >= 0 && need > 0; i--) {
      const it = campaign.convoy[i];
      if (it.key !== c.mat) continue;
      const take = Math.min(need, it.uses || 0);
      it.uses -= take;
      need -= take;
      if (it.uses <= 0) campaign.convoy.splice(i, 1);
    }
    item.plus = (item.plus || 0) + 1;
    return { ok: true, plus: item.plus, cost: c, key: item.key, name: WEAPONS[item.key].name };
  },

  /* 强化效果文本（UI 展示用） */
  effectText(plus) {
    const p = Math.max(0, Math.min(SMITH_CAP, plus || 0));
    if (p <= 0) return '';
    return '+' + p + '：威力 +' + p + ' · 命中 +' + (3 * p) + (p >= SMITH_CAP ? ' · 必杀 +5' : '');
  },

  /* ---------------- 武器进化（P2.3） ---------------- */

  /* 该武器是否在进化树上（有下一阶） */
  evolveInfo(key) {
    return (typeof WEAPON_EVOLUTIONS !== 'undefined' && WEAPON_EVOLUTIONS[key]) || null;
  },

  /* 进化资格：在树上 + 下一阶存在 + 耐久未损坏 */
  canEvolve(key, item) {
    const spec = this.evolveInfo(key);
    if (!spec || !WEAPONS[spec.to]) return false;
    const w = WEAPONS[key];
    if (!w || !w.uses) return false;
    return !!item && (item.uses || 0) > 0;
  },

  /* 执行进化：扣盘缠与材料，item.key 换成下一阶，耐久刷满，强化等级保留。
   * why: 'bad' | 'broken' | 'gold' | 'mat' */
  evolve(campaign, item) {
    if (!item || !item.key) return { ok: false, why: 'bad' };
    const spec = this.evolveInfo(item.key);
    if (!spec || !WEAPONS[spec.to]) return { ok: false, why: 'bad' };
    if ((item.uses || 0) <= 0) return { ok: false, why: 'broken' };
    if (!this.canEvolve(item.key, item)) return { ok: false, why: 'bad' };
    if (campaign.gold < spec.gold) return { ok: false, why: 'gold' };
    if (this.matCount(campaign, spec.mat) < spec.n) return { ok: false, why: 'mat' };
    campaign.gold -= spec.gold;
    let need = spec.n;
    for (let i = campaign.convoy.length - 1; i >= 0 && need > 0; i--) {
      const it = campaign.convoy[i];
      if (it.key !== spec.mat) continue;
      const take = Math.min(need, it.uses || 0);
      it.uses -= take;
      need -= take;
      if (it.uses <= 0) campaign.convoy.splice(i, 1);
    }
    const fromKey = item.key;
    const fromName = WEAPONS[fromKey].name;
    const to = WEAPONS[spec.to];
    item.key = spec.to;
    item.uses = to.uses || 1;
    return { ok: true, from: fromKey, fromName, to: spec.to, name: to.name, plus: item.plus || 0, cost: spec };
  },

  /* 进化预览文本（UI 展示用） */
  evolveText(key, plus) {
    const spec = this.evolveInfo(key);
    if (!spec || !WEAPONS[spec.to]) return '';
    const a = WEAPONS[key], b = WEAPONS[spec.to];
    const p = plus || 0;
    return a.name + ' → ' + b.name +
      '：威力 ' + (a.mt + p) + '→' + (b.mt + p) +
      ' · 命中 ' + (a.hit + 3 * p) + '→' + (b.hit + 3 * p) +
      ' · 耐久 ' + (b.uses || 0) + (p ? ' · 保留 +' + p : '');
  }
};

if (typeof window !== 'undefined') window.Smith = Smith;
