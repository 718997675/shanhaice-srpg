/* ============================================================
 * 战斗内核：纯逻辑（不碰 DOM / Canvas）
 * 公式：
 *   攻速 = 速度 - max(0, 武器重量 - floor(力量/5))
 *   伤害 = max(0, 力/灵 + 武器威力 + 三角 - 敌防/魔抗 - 地形防) × 特效
 *   命中 = 武器命中 + 技巧×2 + floor(幸运/2) + 三角 + 加成
 *          - (敌攻速×2 + 敌幸运 + 地形回避 + 敌回避加成)
 *   暴击 = 武器暴击 + floor(技巧/2) + 加成 - 敌幸运 - 敌暴击回避
 *   攻速差 ≥4 追击；命中 2RN，暴击 1RN，暴击伤害 ×3。
 * ============================================================ */
const Combat = {
  zeroMods() {
    return { hit: 0, avoid: 0, crit: 0, critAvoid: 0, dmg: 0, def: 0, res: 0, healBonus: 0, move: 0 };
  },

  modsOf(ctx, unit, foe, initiating) {
    if (ctx && typeof ctx.mods === 'function') {
      const m = ctx.mods(unit, foe, !!initiating) || {};
      return Object.assign(this.zeroMods(), m);
    }
    return this.zeroMods();
  },

  tileAt(ctx, x, y) {
    if (ctx && typeof ctx.tileAt === 'function') return ctx.tileAt(x, y) || TERRAIN['.'];
    return TERRAIN['.'];
  },

  weaponOf(unit) {
    if (!unit || !Array.isArray(unit.items)) return null;
    let idx = unit.weaponIndex;
    if (typeof idx !== 'number' || idx < 0) idx = this.bestWeaponIndex(unit);
    const it = unit.items[idx];
    if (!it || it.uses <= 0) return null;
    const w = WEAPONS[it.key];
    if (!w || w.type === 'staff') return null;
    if (!this.hasRank(unit, w)) return null;
    return { item: it, w, idx };
  },

  staffOf(unit) {
    if (!unit || !Array.isArray(unit.items)) return null;
    const idx = typeof unit.weaponIndex === 'number' ? unit.weaponIndex : 0;
    const it = unit.items[idx];
    if (!it || it.uses <= 0) return null;
    const w = WEAPONS[it.key];
    if (!w || w.type !== 'staff') return null;
    if (!this.hasRank(unit, w)) return null;
    return { item: it, w, idx };
  },

  hasRank(unit, w) {
    const ranks = unit.ranks || {};
    const have = RANK_ORDER[ranks[w.type]];
    if (have === undefined) return false;
    if (w.rank === undefined) return true;
    return have >= RANK_ORDER[w.rank];
  },

  canEquipKey(unit, key) {
    const w = WEAPONS[key];
    const cls = CLASSES[unit.cls];
    if (!w || !cls) return false;
    if (w.type === 'staff') {
      return (cls.weapons || []).includes('staff') && this.hasRank(unit, w);
    }
    return (cls.weapons || []).includes(w.type) && this.hasRank(unit, w);
  },

  bestWeaponIndex(unit) {
    if (!Array.isArray(unit.items)) return -1;
    let best = -1, bestScore = -1;
    for (let i = 0; i < unit.items.length; i++) {
      const it = unit.items[i];
      if (!it || it.uses <= 0) continue;
      const w = WEAPONS[it.key];
      if (!w || w.type === 'staff') continue;
      if (!this.hasRank(unit, w)) continue;
      const score = (w.mt || 0) * 2 + (w.hit || 0) / 10 + (it.plus || 0) * 2;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  },

  maxHp(unit) { return unit.stats.hp; },

  attackSpeed(unit) {
    const w = this.weaponOf(unit);
    const wt = w ? w.w.wt : 0;
    const str = unit.stats.str || 0;
    let spd = (unit.stats.spd || 0) - Math.max(0, wt - Math.floor(str / 5));
    /* 狂暴词缀：生命低于 50% 时攻速 +3 */
    if ((unit.affixes || []).includes('berserk') && unit.hp < unit.stats.hp / 2) spd += AFFIX_BERSERK_SPD;
    return spd;
  },

  /* 护盾词缀是否生效（纯函数）：带 shield 且未处于破盾期。
   * 破盾期由 battle.js 在「我方站在己方阵眼上命中」时写入 unit.shieldBreakUntil，
   * 与 ctx.phaseIndex 比较；ctx 缺 phaseIndex（干净测试场）时视为生效。 */
  affixShieldActive(unit, ctx) {
    if (!unit || !(unit.affixes || []).includes('shield')) return false;
    const until = unit.shieldBreakUntil;
    if (typeof until !== 'number') return true;
    return !(ctx && typeof ctx.phaseIndex === 'number' && until > ctx.phaseIndex);
  },

  distance(ax, ay, bx, by) { return Math.abs(ax - bx) + Math.abs(ay - by); },

  canAttackRange(attacker, target, ax, ay) {
    if (!attacker || !target || attacker.side === target.side) return false;
    if (target.hp <= 0) return false;
    const w = this.weaponOf(attacker);
    if (!w) return false;
    const d = this.distance(ax === undefined ? attacker.x : ax, ay === undefined ? attacker.y : ay, target.x, target.y);
    return d >= w.w.rng[0] && d <= w.w.rng[1];
  },

  canCounter(defender, attacker) {
    if (!defender || !attacker || defender.hp <= 0) return false;
    const w = this.weaponOf(defender);
    if (!w) return false;
    const d = this.distance(defender.x, defender.y, attacker.x, attacker.y);
    return d >= w.w.rng[0] && d <= w.w.rng[1];
  },

  triangle(attacker, defender) {
    const aw = this.weaponOf(attacker), dw = this.weaponOf(defender);
    if (!aw || !dw) return { state: 'none', hit: 0, dmg: 0, text: '' };
    const at = aw.w.type, dt = dw.w.type;
    if (TRIANGLE[at] === dt) return { state: 'good', hit: 15, dmg: 2, text: TRIANGLE_NAMES[at] + ' 克 ' + TRIANGLE_NAMES[dt] };
    if (TRIANGLE[dt] === at) return { state: 'bad', hit: -15, dmg: -2, text: TRIANGLE_NAMES[dt] + ' 克 ' + TRIANGLE_NAMES[at] };
    return { state: 'none', hit: 0, dmg: 0, text: '' };
  },

  /* 强化修正（纯函数）：+1/+2/+3 每级 +1 威力、+3 命中；+3 额外 +5 必杀。
   * 强化不改变武器类型与重量；传说与 Boss 专属不可强化（入口在 systems/smith.js 把守）。 */
  weaponPlusMods(plus) {
    const p = Math.max(0, Math.min(3, Math.floor(plus || 0)));
    return { mt: p, hit: 3 * p, crit: p >= 3 ? 5 : 0 };
  },

  isEffective(attacker, defender) {
    const w = this.weaponOf(attacker);
    if (!w || !w.w.effective) return false;
    const tags = defender.tags || [];
    return w.w.effective.some(t => tags.includes(t));
  },

  /* 武器词条与技能修正（纯函数）：traits 逐项 + skill 的数值字段。
   * 键名规则：字段名（hit/crit/dmg/def/res/avoid/move）可选带
   * 「Vs+目标标签」后缀（如 critVsBeast → 对猛兽暴击 +N，需 foe.tags 含该标签）；
   * skill 另支持 dmgIfAdjacentAlly（相邻有友军）/ dmgIfInitiating（主动攻击时）。
   * 命中后类技能（debuffDefOnHit / movePenaltyOnCrit / cleanseOnHit）不在此处，
   * 由 battle.js 在 strike 事件里落地。 */
  weaponMods(wdef, opts) {
    const out = this.zeroMods();
    if (!wdef) return out;
    opts = opts || {};
    const tags = opts.foeTags || [];
    const parse = obj => {
      if (!obj) return;
      for (const k in obj) {
        const mm = /^([a-zA-Z]+?)(?:Vs([A-Z][A-Za-z]*))?$/.exec(k);
        if (!mm) continue;
        const field = mm[1];
        if (!(field in out)) continue;              // name/desc/debuffDefOnHit 等非数值字段跳过
        if (mm[2] && !tags.includes(mm[2].toLowerCase())) continue;
        const v = obj[k];
        if (typeof v === 'number') out[field] += v;
      }
    };
    (wdef.traits || []).forEach(parse);
    const sk = wdef.skill;
    if (sk) {
      parse(sk);
      if (sk.dmgIfAdjacentAlly && opts.adjacentAlly) out.dmg += sk.dmgIfAdjacentAlly;
      if (sk.dmgIfInitiating && opts.initiating) out.dmg += sk.dmgIfInitiating;
    }
    return out;
  },

  /* 传送落点（纯函数）：渡厄杖把友军传到施法者四邻空格。
   * 候选 = 施法者四邻中 blocked(x,y) 为假的格子（越界/地形/占位由调用方判断）；
   * 取离「友军原位置」曼哈顿距离最近者，平局按 右/左/下/上 次序，保证可复现。
   * 返回 { x, y } 或 null（四邻全堵）。 */
  warpDestination(caster, ally, blocked) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let best = null, bestD = Infinity;
    for (const d of dirs) {
      const nx = caster.x + d[0], ny = caster.y + d[1];
      if (blocked(nx, ny)) continue;
      const dist = Math.abs(nx - ally.x) + Math.abs(ny - ally.y);
      if (dist < bestD) { bestD = dist; best = { x: nx, y: ny }; }
    }
    return best;
  },

  /* 追影刃换位判定（纯函数）：攻击方在本次交战事件里至少命中过防守方一次。 */
  swapOnHitLanded(events, attackerId, defenderId) {
    return (events || []).some(e =>
      e.type === 'strike' && e.attacker === attackerId && e.defender === defenderId && e.hit);
  },

  /* 五行相克：金克木、木克土、土克水、水克火、火克金；同系与互不相克均为中性。
   * 返回 { state, mul, text }——spells.js 结算法术伤害时乘 mul。 */
  elementMul(atkEl, defEl) {
    const neutral = { state: 'neutral', mul: ELEMENT_MULTIPLIER.neutral, text: '' };
    if (!atkEl || !defEl || !ELEMENTS[atkEl] || !ELEMENTS[defEl] || atkEl === defEl) return neutral;
    if (ELEMENT_COUNTERS[atkEl] === defEl) {
      return { state: 'strong', mul: ELEMENT_MULTIPLIER.strong, text: ELEMENTS[atkEl].name + ' 克 ' + ELEMENTS[defEl].name };
    }
    if (ELEMENT_COUNTERS[defEl] === atkEl) {
      return { state: 'weak', mul: ELEMENT_MULTIPLIER.weak, text: ELEMENTS[defEl].name + ' 克 ' + ELEMENTS[atkEl].name };
    }
    return neutral;
  },

  /* 法术结算（纯公式）：mag + mt + am.dmg - 敌 res - dm.res，乘五行相克倍率。
   * 命中/暴击与武器系同构，但取 spell.hit/crit；不触发武器三角与反击。
   * aoe 的逐个目标由 systems/spells.js 循环调用本函数。 */
  spellAttack(caster, defender, spell, ctx) {
    const am = this.modsOf(ctx, caster, defender);
    const dm = this.modsOf(ctx, defender, caster);
    const el = this.elementMul(spell.element, defender.element);
    const tile = this.tileAt(ctx, defender.x, defender.y);
    const hitRaw = (spell.hit || 0) + (caster.stats.skl || 0) * 2 + Math.floor((caster.stats.lck || 0) / 2) + am.hit
      - (this.attackSpeed(defender) * 2 + (defender.stats.lck || 0) + (tile.avoid || 0) + dm.avoid);
    const critRaw = (spell.crit || 0) + Math.floor((caster.stats.skl || 0) / 2) + am.crit
      - ((defender.stats.lck || 0) + dm.critAvoid);
    let raw = (caster.stats.mag || 0) + (spell.mt || 0) + am.dmg - (defender.stats.res || 0) - dm.res;
    raw = Math.max(0, raw) * el.mul;
    return {
      element: el,
      hit: Math.max(0, Math.min(100, Math.round(hitRaw))),
      crit: Math.max(0, Math.min(100, Math.round(critRaw))),
      dmg: Math.max(0, Math.round(raw))
    };
  },

  hitChance(attacker, defender, ctx, initiating) {
    const w = this.weaponOf(attacker);
    if (!w) return 0;
    const am = this.modsOf(ctx, attacker, defender, initiating);
    const dm = this.modsOf(ctx, defender, attacker, false);
    const tri = this.triangle(attacker, defender);
    const tile = this.tileAt(ctx, defender.x, defender.y);
    const pm = this.weaponPlusMods(w.item.plus);
    let hit = (w.w.hit || 0) + (attacker.stats.skl || 0) * 2 + Math.floor((attacker.stats.lck || 0) / 2) + tri.hit + am.hit + pm.hit;
    let avoid = this.attackSpeed(defender) * 2 + (defender.stats.lck || 0) + (tile.avoid || 0) + dm.avoid;
    return Math.max(0, Math.min(100, Math.round(hit - avoid)));
  },

  critChance(attacker, defender, ctx, initiating) {
    const w = this.weaponOf(attacker);
    if (!w) return 0;
    const am = this.modsOf(ctx, attacker, defender, initiating);
    const dm = this.modsOf(ctx, defender, attacker, false);
    const pm = this.weaponPlusMods(w.item.plus);
    let crit = (w.w.crit || 0) + Math.floor((attacker.stats.skl || 0) / 2) + am.crit + pm.crit;
    crit -= (defender.stats.lck || 0) + dm.critAvoid;
    return Math.max(0, Math.min(100, Math.round(crit)));
  },

  damage(attacker, defender, ctx, initiating) {
    const w = this.weaponOf(attacker);
    if (!w) return 0;
    const am = this.modsOf(ctx, attacker, defender, initiating);
    const dm = this.modsOf(ctx, defender, attacker, false);
    const tri = this.triangle(attacker, defender);
    const tile = this.tileAt(ctx, defender.x, defender.y);
    const magic = !!w.w.magic;
    const main = magic ? (attacker.stats.mag || 0) : (attacker.stats.str || 0);
    const defBase = magic ? (defender.stats.res || 0) : (defender.stats.def || 0);
    const defMod = magic ? dm.res : dm.def;
    const terrainDef = magic ? 0 : (tile.def || 0);
    const pm = this.weaponPlusMods(w.item.plus);
    let raw = main + (w.w.mt || 0) + pm.mt + tri.dmg + am.dmg - defBase - defMod - terrainDef;
    raw = Math.max(0, raw);
    if (this.isEffective(attacker, defender)) raw *= 2;
    /* 护盾词缀：受伤 -30%（破盾期不生效；战斗预测同口径显示） */
    if (this.affixShieldActive(defender, ctx)) raw = Math.floor(raw * AFFIX_SHIELD_MUL);
    /* 指挥技·坚守：受保护的我方单位受伤 -20%（ctx.holdActive 由 battle.js 给出） */
    if (ctx.holdActive && ctx.holdActive(defender)) raw = Math.floor(raw * COMMAND_HOLD_MUL);
    return Math.max(0, Math.round(raw));
  },

  doubles(attacker, defender) {
    return this.attackSpeed(attacker) >= this.attackSpeed(defender) + 4;
  },

  forecast(attacker, defender, ctx) {
    const w = this.weaponOf(attacker);
    const dist = this.distance(attacker.x, attacker.y, defender.x, defender.y);
    const canHit = !!w && dist >= w.w.rng[0] && dist <= w.w.rng[1];
    const counter = this.canCounter(defender, attacker);
    const out = {
      distance: dist,
      canHit,
      triangle: this.triangle(attacker, defender),
      effective: this.isEffective(attacker, defender),
      counterEffective: counter ? this.isEffective(defender, attacker) : false,
      attacker: {
        dmg: w && canHit ? this.damage(attacker, defender, ctx, true) : 0,
        hit: w && canHit ? this.hitChance(attacker, defender, ctx, true) : 0,
        crit: w && canHit ? this.critChance(attacker, defender, ctx, true) : 0,
        double: !!w && canHit && this.doubles(attacker, defender)
      },
      defender: {
        canCounter: counter,
        dmg: counter ? this.damage(defender, attacker, ctx, false) : 0,
        hit: counter ? this.hitChance(defender, attacker, ctx, false) : 0,
        crit: counter ? this.critChance(defender, attacker, ctx, false) : 0,
        double: counter && this.doubles(defender, attacker)
      }
    };
    return out;
  },

  healAmount(healer, staffInfo, ctx) {
    if (!staffInfo) return 0;
    const m = this.modsOf(ctx, healer, null);
    const base = (staffInfo.w.heal || 0) + Math.floor((healer.stats.mag || 0) / 2) + m.healBonus;
    return Math.max(1, Math.round(base));
  },

  consumeUse(unit, item) {
    if (!item || unit.infinite) return false;
    item.uses = Math.max(0, (item.uses || 0) - 1);
    return item.uses <= 0;
  },

  /* 一次完整交战的出手序列，返回事件供表现层播放。
   * ctx: { mods(unit, foe), tileAt(x,y), rng }
   */
  resolve(attacker, defender, ctx) {
    const rng = (ctx && ctx.rng) || RNG;
    const events = [];
    if (!this.canAttackRange(attacker, defender)) return events;
    const aW = this.weaponOf(attacker);
    if (!aW) return events;

    const order = [];
    order.push(attacker);
    if (this.canCounter(defender, attacker)) order.push(defender);
    if (this.doubles(attacker, defender)) order.push(attacker);
    if (this.canCounter(defender, attacker) && this.doubles(defender, attacker)) order.push(defender);

    for (const striker of order) {
      const foe = striker === attacker ? defender : attacker;
      if (striker.hp <= 0 || foe.hp <= 0) break;
      const wInfo = this.weaponOf(striker);
      if (!wInfo) continue;
      if (striker === defender && !this.canCounter(striker, foe)) continue;

      const hitRate = this.hitChance(striker, foe, ctx, striker === attacker);
      const critRate = this.critChance(striker, foe, ctx, striker === attacker);
      const roll = rng.hitRoll();
      const hit = roll < hitRate;
      let crit = false;
      let dmg = 0;
      const effective = this.isEffective(striker, foe);
      const triangle = this.triangle(striker, foe);
      if (hit) {
        crit = (rng.next() * 100) < critRate;
        dmg = this.damage(striker, foe, ctx, striker === attacker) * (crit ? 3 : 1);
        foe.hp = Math.max(0, foe.hp - dmg);
      }
      const broke = this.consumeUse(striker, wInfo.item);
      const ev = {
        type: 'strike',
        attacker: striker.id,
        attackerName: striker.name,
        defender: foe.id,
        defenderName: foe.name,
        hit, crit, dmg, effective,
        weapon: wInfo.w.name,
        weaponType: wInfo.w.type,
        triangle: triangle.state,
        hpAfter: foe.hp,
        lethal: foe.hp <= 0,
        rolled: Math.round(roll),
        hitRate, critRate,
        debuff: hit && wInfo.w.debuff ? wInfo.w.debuff : null,
        /* 传说武器的附带技能：命中后/暴击后效果由 battle.js 落地 */
        weaponSkill: hit && wInfo.w.skill ? wInfo.w.skill : null,
        attackerX: striker.x, attackerY: striker.y,
        defenderX: foe.x, defenderY: foe.y
      };
      events.push(ev);
      if (broke) {
        events.push({ type: 'break', unit: striker.id, unitName: striker.name, weapon: wInfo.w.name, side: striker.side });
        striker.weaponBroken = true;
      }
      if (foe.hp <= 0) {
        events.push({ type: 'death', unit: foe.id, unitName: foe.name, side: foe.side, killer: striker.id });
        break;
      }
    }
    return events;
  },

  /* ---------------- 移动与寻路 ---------------- */
  terrainCost(unit, tile) {
    if (!tile) return null;
    const mv = unit.moveType;
    if (tile.blocked) {
      if (tile.water && (mv === 'flying' || mv === 'amphibious')) return mv === 'flying' ? (tile.flyCost || 1) : 1;
      if (tile.mountain && mv === 'flying') return tile.flyCost || 1;
      return null;
    }
    if (mv === 'flying') return tile.flyCost || 1;
    if (mv === 'amphibious' && tile.water) return 1;
    return tile.cost || 1;
  },

  canEnter(unit, tile) { return this.terrainCost(unit, tile) !== null; },

  key(x, y) { return x + ',' + y; },

  reachable(unit, grid, units, extraMove, spent) {
    const h = grid.length, w = grid[0].length;
    const occ = new Map();
    for (const u of units) {
      if (!u || u.hp <= 0) continue;
      occ.set(this.key(u.x, u.y), u);
    }
    /* spent：本回合已花费的地形移动力（攻击后再移动用）。≤0 时只能站在原地 */
    const maxCost = Math.max(0, (unit.move || 0) + (extraMove || 0) - (spent || 0));
    const dist = new Map();
    const prev = new Map();
    const startK = this.key(unit.x, unit.y);
    dist.set(startK, 0);
    const open = [{ x: unit.x, y: unit.y, cost: 0 }];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (open.length) {
      open.sort((a, b) => a.cost - b.cost);
      const cur = open.shift();
      const ck = this.key(cur.x, cur.y);
      if (cur.cost > (dist.get(ck) === undefined ? Infinity : dist.get(ck))) continue;
      for (const d of dirs) {
        const nx = cur.x + d[0], ny = cur.y + d[1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const tile = TERRAIN[grid[ny][nx]];
        const cost = this.terrainCost(unit, tile);
        if (cost === null) continue;
        const nk = this.key(nx, ny);
        const occu = occ.get(nk);
        if (occu && occu.side !== unit.side) continue;
        const nc = cur.cost + cost;
        if (nc > maxCost) continue;
        if (nc < (dist.has(nk) ? dist.get(nk) : Infinity)) {
          dist.set(nk, nc);
          prev.set(nk, ck);
          open.push({ x: nx, y: ny, cost: nc });
        }
      }
    }
    const out = new Map();
    for (const [k, cost] of dist.entries()) {
      const parts = k.split(',');
      const x = parseInt(parts[0], 10), y = parseInt(parts[1], 10);
      const occu = occ.get(k);
      out.set(k, {
        x, y, cost,
        from: prev.get(k) || null,
        occupied: !!occu && occu !== unit,
        endable: !occu || occu === unit
      });
    }
    return out;
  },

  pathTo(rangeMap, unit, tx, ty) {
    const targetK = this.key(tx, ty);
    if (!rangeMap.has(targetK)) return null;
    const path = [];
    let cur = targetK;
    let guard = 0;
    while (cur && guard++ < 256) {
      const node = rangeMap.get(cur);
      if (!node) break;
      path.push({ x: node.x, y: node.y });
      if (node.x === unit.x && node.y === unit.y) break;
      cur = node.from;
    }
    return path.reverse();
  },

  tilesInRange(x, y, minR, maxR, width, height) {
    const out = [];
    for (let yy = 0; yy < height; yy++) {
      for (let xx = 0; xx < width; xx++) {
        const d = Math.abs(xx - x) + Math.abs(yy - y);
        if (d >= Math.max(1, minR) && d <= maxR) out.push({ x: xx, y: yy, d });
      }
    }
    return out;
  },

  attackTiles(unit) {
    const w = this.weaponOf(unit);
    if (!w) return [];
    return this.tilesInRange(unit.x, unit.y, w.w.rng[0], w.w.rng[1], 999, 999);
  },

  /* 危险范围：所有可停留点的攻击范围并集 */
  dangerZone(unit, grid, units, extraMove) {
    const reach = this.reachable(unit, grid, units, extraMove || 0);
    const w = this.weaponOf(unit);
    const set = new Set();
    if (!w) return set;
    const h = grid.length, width = grid[0].length;
    for (const node of reach.values()) {
      if (!node.endable) continue;
      const tiles = this.tilesInRange(node.x, node.y, w.w.rng[0], w.w.rng[1], width, h);
      for (const t of tiles) set.add(this.key(t.x, t.y));
    }
    return set;
  },

  /* ---------------- 经验与成长 ---------------- */
  killExp(unitLevel, enemyLevel, mult) {
    const base = 30 + (enemyLevel - unitLevel) * 5;
    return Math.max(6, Math.round(Math.min(60, base) * (mult || 1)));
  },

  rollGrowth(unit) {
    const gains = {};
    let count = 0;
    for (const k of STAT_ORDER) {
      const cap = STAT_CAPS[k];
      if ((unit.stats[k] || 0) >= cap) continue;
      const g = (unit.growth && unit.growth[k]) || 0;
      if (RNG.chance(g)) {
        unit.stats[k]++;
        if (k === 'hp') unit.hp = Math.min(unit.stats.hp, unit.hp + 1);
        gains[k] = (gains[k] || 0) + 1;
        count++;
      }
    }
    let guard = 0;
    while (count < 2 && guard++ < 30) {
      const eligible = STAT_ORDER.filter(k => (unit.stats[k] || 0) < STAT_CAPS[k] && !gains[k]);
      if (!eligible.length) break;
      const k = RNG.pick(eligible);
      unit.stats[k]++;
      if (k === 'hp') unit.hp = Math.min(unit.stats.hp, unit.hp + 1);
      gains[k] = (gains[k] || 0) + 1;
      count++;
    }
    return gains;
  },

  levelUp(unit, amount) {
    unit.exp = (unit.exp || 0) + Math.round(amount);
    const levels = [];
    let guard = 0;
    while (unit.exp >= 100 && unit.level < MAX_LEVEL && guard++ < 10) {
      unit.exp -= 100;
      unit.level++;
      const gains = this.rollGrowth(unit);
      levels.push({ level: unit.level, gains });
    }
    if (unit.level >= MAX_LEVEL) unit.exp = 0;
    return levels;
  },

  supportRank(points) {
    if (points >= 90) return 'A';
    if (points >= 50) return 'B';
    if (points >= 20) return 'C';
    return null;
  },

  supportBonus(points) {
    const rank = this.supportRank(points);
    if (!rank) return { rank: null, hit: 0, avoid: 0, crit: 0, dodge: 0 };
    const r = SUPPORT_RANKS.find(x => x.rank === rank);
    return { rank: r.rank, hit: r.hit, avoid: r.avoid, crit: r.crit, dodge: r.dodge };
  },

  /* ============================================================
   * 冰面滑行（P1.2）
   * 滑行不做进 A*：寻路/可达按普通格子算，只在移动落地时结算。
   * 单位沿 (dx,dy) 进入冰面后持续滑行：下一格仍是冰面且可站则继续，
   * 遇越界/阻挡/占用/非冰面即停。返回终点与滑行经过的格子（不含起点，
   * 含进入的第一块冰面；若一步都滑不动则 path 为空）。
   * ============================================================ */
  slide(tileAt, occupied, w, h, sx, sy, dx, dy) {
    let x = sx, y = sy;
    const path = [];
    for (;;) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) break;      // 滑出地图：停
      if (occupied(nx, ny)) break;                             // 前方有人：停
      const t = tileAt(nx, ny);
      if (!t || t.blocked) break;                              // 不可通行：停
      x = nx; y = ny;
      path.push({ x: x, y: y });
      if (!t.slide) break;                                     // 滑到非冰面：停
    }
    return { x: x, y: y, path: path };
  }
};

if (typeof window !== 'undefined') window.Combat = Combat;
