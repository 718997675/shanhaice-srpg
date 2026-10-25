/* ============================================================
 * 山海策 · 灵脉  —  法术系统（systems/spells.js）
 * 数据：data-systems.js 的 SPELLS；公式：combat.js 的
 * spellAttack / elementMul。本文件只做编排：可用性、次数、
 * 范围目标收集、效果落地、演出，不碰公式。
 * 单位状态：unit.spellUses = { spellKey: 剩余次数 }，随单位
 * 序列化；缺省视为满次数（每章重置由 resetUses 负责）。
 * 加载顺序：data-systems → systems/spells（battle 之后亦可，
 * 因只在方法体内调用）。
 * ============================================================ */
const Spells = {
  /* 我军法术：charId + level 匹配 learnBy */
  forUnit(unit) {
    const out = [];
    if (!unit) return out;
    for (const k in SPELLS) {
      const sp = SPELLS[k];
      if (unit.side === 'enemy') {
        if ((sp.holders || []).includes(unit.rawType)) out.push(sp);
      } else if (unit.charId) {
        if ((sp.learnBy || []).some(l => l.char === unit.charId && unit.level >= l.level)) out.push(sp);
      }
    }
    return out;
  },

  /* 敌军键（ENEMY_TYPES key）可持法术 */
  forEnemyType(rawType) {
    const out = [];
    for (const k in SPELLS) {
      if ((SPELLS[k].holders || []).includes(rawType)) out.push(SPELLS[k]);
    }
    return out;
  },

  usesLeft(unit, key) {
    const sp = SPELLS[key];
    if (!sp || !unit) return 0;
    if (!unit.spellUses || unit.spellUses[key] === undefined) return sp.uses;
    return unit.spellUses[key];
  },

  consume(unit, key) {
    const left = this.usesLeft(unit, key);
    if (!unit.spellUses) unit.spellUses = {};
    unit.spellUses[key] = Math.max(0, left - 1);
    return unit.spellUses[key];
  },

  /* 每章开始重置次数 */
  resetUses(unit) { if (unit) unit.spellUses = {}; },

  canUse(unit, key) { return this.usesLeft(unit, key) > 0; },

  /* aoe：以目标格为圆心、曼哈顿半径内的单位（ally 歌取友军，其余取敌军；不含逃脱者） */
  aoeTargets(B, center, spell, casterSide) {
    if (!spell || !spell.aoe) return [];
    const r = spell.aoe.radius || 1;
    return B.units.filter(u =>
      u.hp > 0 && !u.escaped &&
      (spell.ally ? u.side === casterSide : u.side !== casterSide) &&
      Combat.distance(u.x, u.y, center.x, center.y) <= r);
  },

  /* 预测：距离检定 + 单目标公式 + aoe 目标列表（B 为 battle 状态） */
  forecast(ctx, caster, target, spell, B) {
    const dist = Combat.distance(caster.x, caster.y, target.x, target.y);
    const inRange = dist >= spell.rng[0] && dist <= spell.rng[1];
    const f = inRange ? Combat.spellAttack(caster, target, spell, ctx) : null;
    const aoe = inRange && B ? this.aoeTargets(B, target, spell, caster.side) : [];
    return { dist, inRange, f, aoe, spell };
  },

  /* 效果落地：root 定身 / debuffDef 破甲 / debuffAvoid 迷眼 /
   * debuffAtk 力量下降 / debuffHit 命中下降 / buffHit 命中提升，turns 持续回合。
   * atk/hit 状态的 val 表示扣减值（增益存负值，modsFor 做减法）。 */
  applyEffect(unit, effect, phaseIndex) {
    if (!unit || !effect) return;
    if (!unit.statuses) unit.statuses = {};
    const turns = effect.turns || 1;
    const until = phaseIndex + turns;
    if (effect.root) unit.statuses.root = { until };
    if (effect.debuffDef) unit.statuses.def = { val: effect.debuffDef, until };
    if (effect.debuffAvoid) unit.statuses.avoid = { val: effect.debuffAvoid, until };
    if (effect.debuffAtk) unit.statuses.atk = { val: effect.debuffAtk, until };
    if (effect.debuffHit) unit.statuses.hit = { val: effect.debuffHit, until };
    if (effect.buffHit) unit.statuses.hit = { val: -effect.buffHit, until };
  },

  effectText(effect) {
    if (!effect) return '';
    const parts = [];
    if (effect.root) parts.push('定身');
    if (effect.debuffDef) parts.push('护甲 -' + effect.debuffDef);
    if (effect.debuffAvoid) parts.push('回避 -' + effect.debuffAvoid);
    if (effect.debuffAtk) parts.push('力量 -' + effect.debuffAtk);
    if (effect.debuffHit) parts.push('命中 -' + effect.debuffHit);
    if (effect.buffHit) parts.push('命中 +' + effect.buffHit);
    return parts.join('·');
  },

  /* 歌的增强等级（潮音娘子 songPower：效果数值 +N、治疗量 +2N） */
  songPowerOf(caster) {
    const cls = caster && CLASSES[caster.cls];
    return (cls && cls.skill && cls.skill.songPower) || 0;
  },

  /* 施法编排：扣次数 → 逐目标结算（主目标 + aoe）→ 伤害/治疗/效果/死亡。
   * host 需提供：B, ctx（combatCtx）, log, float, sfx, wait, kill, exp。
   * 命中 2RN、暴击 ×3，与 Combat.resolve 保持一致。
   * song 法术不造成伤害；ally 法术以友军为目标；heal 法术必中并回复。 */
  async cast(host, caster, target, spell) {
    const B = host.B;
    const rng = (host.ctx && host.ctx.rng) || RNG;
    this.consume(caster, spell.key);
    const el = ELEMENTS[spell.element];
    host.log(caster.name + '咏唱《' + spell.name + '》。', caster.side === 'player' ? 'good' : 'bad');
    host.float(spell.name, caster.x, caster.y, el ? el.color : '#dfe6d7', 15);
    /* 演出：法阵起手 → 弹道 → 停一拍，然后才逐目标结算。
     * play 自己管起手音；Juice 关闭时它只响一声就返回，不占时间。 */
    if (typeof SpellFx !== 'undefined') await SpellFx.play(host, caster, target, spell);
    else host.sfx('node');
    const targets = [target].concat(this.aoeTargets(B, target, spell, caster.side).filter(u => u !== target));
    let total = 0;
    /* 歌增强（潮音娘子）：效果数值 +N，治疗量 +2N */
    const power = this.songPowerOf(caster);
    const boost = eff => {
      if (!power || !eff) return eff;
      const out = JSON.parse(JSON.stringify(eff));
      for (const k of ['debuffAtk', 'debuffHit', 'buffHit', 'debuffDef', 'debuffAvoid']) {
        if (out[k]) out[k] += power;
      }
      return out;
    };
    for (const t of targets) {
      if (t.hp <= 0 || t.escaped) continue;
      /* —— 治疗歌：必中，回血 + 效果 —— */
      if (spell.heal) {
        const heal = spell.heal + 2 * power;
        const before = t.hp;
        t.hp = Math.min(t.stats.hp, t.hp + heal);
        const gained = t.hp - before;
        await host.wait(150);
        host.float('+' + gained, t.x, t.y, '#9fd39a', 15);
        host.sfx('heal');
        if (typeof SpellFx !== 'undefined') SpellFx.impact(host, t, spell);
        host.log(spell.name + '拂过' + t.name + '，回复 ' + gained + ' 生命。', caster.side === 'player' ? 'good' : 'bad');
        if (spell.effect) {
          const eff = boost(spell.effect);
          this.applyEffect(t, eff, B.phaseIndex);
          const et = this.effectText(eff);
          if (et) host.log(t.name + '获得' + et + '。', 'gold');
        }
        continue;
      }
      /* —— 伤害/减益歌：距离检定 + 命中 2RN + 暴击 ×3 —— */
      const f = Combat.spellAttack(caster, t, spell, host.ctx);
      const hit = rng.hitRoll() < f.hit;
      await host.wait(150);
      if (!hit) {
        host.float('闪避', t.x, t.y, '#dfe6d7', 14);
        host.sfx('miss');
        host.log(t.name + '避开了' + spell.name + '。', caster.side === 'player' ? 'bad' : 'good');
        continue;
      }
      const crit = (rng.next() * 100) < f.crit;
      const dmg = spell.song ? 0 : f.dmg * (crit ? 3 : 1);
      /* 命中音：暴击走 crit（要压过一切），否则按元素取 burst_* 一族 */
      const hitSfx = crit ? 'crit'
        : (typeof SpellFx !== 'undefined' ? SpellFx.sfxOf(spell.element).hit : 'hit');
      if (dmg > 0) {
        t.hp = Math.max(0, t.hp - dmg);
        total += dmg;
        host.float((crit ? '必杀 ' : '') + '-' + dmg, t.x, t.y, crit ? '#f1cd7a' : '#b8cfe0', crit ? 19 : 15);
        host.sfx(hitSfx);
        host.log(spell.name + '命中' + t.name + '，造成 ' + dmg + ' 伤害。', caster.side === 'player' ? 'good' : 'bad');
      } else {
        host.float(spell.name, t.x, t.y, '#cbb7e0', 15);
        host.sfx(hitSfx);
        host.log(spell.name + '笼罩' + t.name + '。', caster.side === 'player' ? 'good' : 'bad');
      }
      /* 命中演出：爆点 + 环，与上面的音效同一拍 */
      if (typeof SpellFx !== 'undefined') SpellFx.impact(host, t, spell);
      if (f.element.text) host.log(f.element.text + '，伤害加深。', 'gold');
      if (spell.effect) {
        const eff = boost(spell.effect);
        this.applyEffect(t, eff, B.phaseIndex);
        const et = this.effectText(eff);
        if (et) host.log(t.name + '陷入' + et + '。', 'gold');
      }
      if (t.hp <= 0) await host.kill(t, caster);
    }
    if (caster.side === 'player' && B.stats && total > 0) B.stats.damage += total;
    if (caster.side === 'player') host.exp(caster, 10);
    return total;
  }
};

if (typeof window !== 'undefined') window.Spells = Spells;
