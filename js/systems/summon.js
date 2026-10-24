/* ============================================================
 * 山海策 · 灵脉  —  召唤系统（systems/summon.js）
 * 数据：data-systems.js 的 SUMMON_TIERS / SUMMON_WEAPONS。
 * 替代 battle.js v1 硬编码山灵狼：阶位查表、场上上限、
 * 三态指令（猛攻/守御/随行）的修正与行为都在本文件。
 * 单位状态：unit.summon = { tier, order, caster }，随单位序列化。
 * ============================================================ */
const SUMMON_ORDER_DEFAULT = 'assault';

const Summon = {
  tierInfo(tier) {
    return SUMMON_TIERS.find(t => t.tier === tier) || SUMMON_TIERS[0];
  },

  /* 技能字段 summon 的数字即可召最高阶 */
  maxTier(skill) {
    const n = typeof skill === 'number' ? skill : 1;
    return Math.max(1, Math.min(SUMMON_TIERS.length, n));
  },

  tiersFor(skill) {
    return SUMMON_TIERS.filter(t => t.tier <= this.maxTier(skill));
  },

  fieldCount(B) {
    return B.units.filter(u => u.summoned && u.hp > 0 && !u.escaped).length;
  },

  canSpawn(B) {
    return this.fieldCount(B) < SUMMON_FIELD_CAP;
  },

  /* 按阶位表实例化（等级随召唤者；数值与 ENEMY_TYPES 同构算法） */
  spawn(B, uid, caster, tier) {
    const info = this.tierInfo(tier);
    const level = Math.max(1, caster.level || 1);
    const stats = {};
    for (const k of ['hp', 'str', 'mag', 'skl', 'spd', 'lck', 'def', 'res']) {
      stats[k] = Math.max(1, Math.round((info.base[k] || 0) + (info.growth[k] || 0) * (level - 1)));
    }
    const et = ENEMY_TYPES[info.unitType];
    return {
      id: 'u' + uid, charId: null, name: (et && et.name) || info.name, side: 'player', cls: null,
      level, exp: 0, stats, growth: {}, ranks: { beast: 'S' },
      items: [{ key: info.weapon, uses: 99 }], weaponIndex: 0, personal: {},
      move: info.move, moveType: info.moveType, tags: info.tags.slice(),
      hp: stats.hp, acted: true, hasMoved: false, movedDist: 0, statuses: {},
      escaped: false, recruitable: false, summoned: true, boss: false,
      rawType: info.unitType,
      element: et ? et.element : undefined,
      summon: { tier: info.tier, order: SUMMON_ORDER_DEFAULT, caster: caster.id }
    };
  },

  orderOf(unit) {
    return (unit && unit.summon && unit.summon.order) || SUMMON_ORDER_DEFAULT;
  },

  orderInfo(unit) {
    const info = this.tierInfo(unit && unit.summon ? unit.summon.tier : 1);
    const key = this.orderOf(unit);
    return (info.orders || []).find(o => o.key === key) || info.orders[0];
  },

  setOrder(unit, key) {
    if (!unit || !unit.summon) return false;
    const info = this.tierInfo(unit.summon.tier);
    if (!(info.orders || []).some(o => o.key === key)) return false;
    unit.summon.order = key;
    return true;
  },

  /* 指令态修正（battle.modsFor 调用）：猛攻伤+/防-，守御防+/回避+ */
  orderEffect(unit) {
    const oi = this.orderInfo(unit);
    return (oi && oi.effect) || {};
  },

  applyOrderMods(unit, m) {
    const e = this.orderEffect(unit);
    if (e.dmg) m.dmg += e.dmg;
    if (e.def) m.def += e.def;
    if (e.avoid) m.avoid += e.avoid;
  },

  /* 随行：护卫召唤者周围友军；返回真正受击者（无则 null） */
  interceptTarget(B, attacker, defender) {
    if (!attacker || !defender) return null;
    if (attacker.side !== 'enemy' || defender.side !== 'player') return null;
    for (const u of B.units) {
      if (!u.summoned || u.hp <= 0 || u.escaped || u.side !== 'player') continue;
      if (!u.summon || u.summon.order !== 'escort') continue;
      if (Combat.distance(u.x, u.y, defender.x, defender.y) !== 1) continue;
      return u;
    }
    return null;
  },

  /* 随行：召唤者行动结束后，未相邻的随行召唤物贴近到位 */
  followCaster(B, caster, log, float) {
    if (!caster) return [];
    const moved = [];
    for (const u of B.units) {
      if (!u.summoned || u.hp <= 0 || u.escaped) continue;
      if (!u.summon || u.summon.caster !== caster.id || u.summon.order !== 'escort') continue;
      if (Combat.distance(u.x, u.y, caster.x, caster.y) === 1) continue;
      const spot = this.freeAdjacent(B, caster.x, caster.y, u);
      if (!spot) continue;
      u.x = spot.x; u.y = spot.y;
      moved.push(u);
      if (float) float('随行', u.x, u.y, '#b8d6b0', 12);
    }
    if (moved.length && log) log(moved.map(u => u.name).join('、') + '紧随' + caster.name + '。', '');
    return moved;
  },

  /* 找 caster 周围空格（排除 ignore 自己与已被占用的格） */
  freeAdjacent(B, x, y, ignore) {
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (const d of dirs) {
      const nx = x + d[0], ny = y + d[1];
      if (nx < 0 || ny < 0) continue;
      if (B.units.some(u => u !== ignore && u.hp > 0 && !u.escaped && u.x === nx && u.y === ny)) continue;
      return { x: nx, y: ny };
    }
    return null;
  }
};

if (typeof window !== 'undefined') window.Summon = Summon;
