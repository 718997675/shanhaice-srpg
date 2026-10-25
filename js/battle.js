/* ============================================================
 * 战斗流程层：阶段、行动、阵眼、AI、目标、悔棋与续战
 * 规则由 Combat 提供；本层只维护战场状态与流程。
 * ============================================================ */
const Battle = {
  active: false,
  B: null,
  chapter: null,
  chapterId: null,
  campaign: null,
  diff: null,
  uid: 1,

  /* ============================================================
   * 启动与初始化
   * ============================================================ */
  async start(opts) {
    const o = opts || {};
    this.active = true;
    this.chapterId = o.chapterId;
    this.campaign = o.campaign;
    this.chapter = o.chapter || Route.byId(this.chapterId);
    /* 勇者模式（P3.4）：难度用 diffOf 叠加，敌军 ×1.15、悔棋 0 */
    this.diff = diffOf(o.campaign);
    this.uid = 1;
    const campSeed = (this.campaign && this.campaign.startedAt) || Date.now();
    RNG.setSeed((campSeed ^ Route.seedOf(this.chapterId)) >>> 0);
    this.B = this.createState();
    UI.log('', '');
    UI.clearLog();
    UI.showScreen('battle');
    UI.setBattleVisible(true);
    Render.resize();

    if (o.suspended) {
      this.applyState(o.suspended);
      this.B.busy = false;
      this.B.ending = false;
      this.B.mode = 'idle';
      this.B.selectedUnit = null;
      this.B.moveRange = null;
      this.B.attackRange = null;
      this.B.targetTiles = null;
      this.B.pathPreview = null;
      this.B.dangerOn = false;
      Render.setBattle(this.B);
      this.computeVisibility(false);
      this.updateNodes();
      UI.updateBattle(this.B);
      UI.phaseBanner(this.B.phase === 'player' ? '我方阶段' : '继续行旅', false);
      this.B.tapHint = this.B.phase === 'player' ? '点击我方单位行动' : '';
      UI.updateBattle(this.B);
      Audio.playMusic('battle');
      this.B.lastPlayerState = this.serialize(false);
      if (!Array.isArray(this.B.history) || !this.B.history.length) {
        this.B.history = [this.B.lastPlayerState];
        this.B.historyCursor = 1;
      }
      this.B.rewindSnapshot = this.B.historyCursor > 0 ? this.B.history[this.B.historyCursor - 1] : null;
      if (window.Game && Game.removeSuspend) Game.removeSuspend();
      return;
    }

    this.deployPlayerUnits(o.deployedIds || []);
    this.spawnChapterEnemies();
    this.computeVisibility(true);
    this.updateNodes();
    Render.setBattle(this.B);
    UI.updateBattle(this.B);
    Audio.playMusic('battle');
    this.B.phase = 'player';
    this.B.phaseIndex = 1;
    this.B.turn = 1;
    await this.beginPlayerPhase(true);
  },

  createState() {
    const ch = this.chapter;
    return {
      chapter: ch,
      chapterId: this.chapterId,
      grid: ch.map.slice(),
      units: [],
      overlays: {},
      nodes: (ch.nodes || []).map(n => ({
        id: n.id, x: n.x, y: n.y, type: n.type,
        owner: n.owner || 'none',
        startPhase: n.owner === 'enemy' ? 2 : 0,
        active: false,
        tier: n.tier || 1, hold: 0
      })),
      turn: 1,
      phase: 'player',
      phaseIndex: 1,
      fog: !!ch.fog,
      vision: ch.vision || 4,
      visible: new Set(),
      explored: new Set(),
      flags: {
        villages: {}, chests: {}, shrines: {}, seized: false,
        bossDead: false, lordDead: false, weakened: false, weakenShown: false,
        bossPhase: 1
      },
      visitedVillages: 0,
      loot: { gold: 0, items: [], seals: 0 },
      stats: { kills: 0, lost: 0, damage: 0, heals: 0, levels: 0, recruits: 0 },
      /* 指挥技（每章 1 次）与连携（每单位每回合 1 次）状态 */
      commandUsed: false,
      volleyTarget: null,
      holdUnits: [],
      supports: JSON.parse(JSON.stringify(this.campaign.supports || {})),
      recruited: [],
      summoned: [],
      casualties: [],
      mainHoldCount: 0,
      codexSeen: {},          // 本章击破的敌型 / 词缀（P3.4 图鉴）
      midsPlayed: {},         // 本章已播的幕间对白 key（P3.5 三幕结构）
      sideHoldCount: 0,
      spawnedReinforcements: {},
      rewindLeft: this.diff.rewinds,
      rewindSnapshot: null,
      history: [],
      historyCursor: 0,
      lastPlayerState: null,
      speed: this.campaign.settings && this.campaign.settings.speed === 2 ? 2 : 1,
      busy: false,
      ending: false,
      mode: 'idle',
      selectedUnit: null,
      origin: null,
      moveRange: null,
      attackRange: null,
      targetTiles: null,
      pathPreview: null,
      hover: null,
      hoverUnit: null,
      hoverTileInfo: null,
      dangerOn: false,
      dangerSet: null,
      tapHint: '点击我方单位行动'
    };
  },

  deployPlayerUnits(ids) {
    const ch = this.chapter;
    const chars = ids.filter(id => CHARS[id]);
    const tiles = (ch.deployTiles || []).slice();
    let ti = 0;
    for (const id of chars) {
      const rec = (this.campaign.roster || []).find(r => r.id === id);
      if (!rec) continue;
      let x = 0, y = 0;
      let found = false;
      while (ti < tiles.length) {
        const t = tiles[ti++];
        if (!this.unitAt(t[0], t[1])) { x = t[0]; y = t[1]; found = true; break; }
      }
      if (!found) {
        const free = this.findFreeTileNear(0, 6, 16, 8);
        if (!free) continue;
        x = free.x; y = free.y;
      }
      const u = this.makePlayerUnit(rec);
      u.x = x; u.y = y;
      this.B.units.push(u);
    }
  },

  makePlayerUnit(rec) {
    const base = CHARS[rec.id];
    const cls = CLASSES[rec.cls] || CLASSES[base.cls];
    const items = JSON.parse(JSON.stringify(rec.items || base.items || []));
    let wi = typeof rec.weaponIndex === 'number' ? rec.weaponIndex : 0;
    if (wi < 0 || wi >= items.length || !items[wi]) wi = 0;
    const u = {
      id: 'u' + (this.uid++),
      charId: rec.id,
      name: base.name,
      side: 'player',
      cls: rec.cls || base.cls,
      level: rec.level || base.level,
      exp: rec.exp || 0,
      stats: JSON.parse(JSON.stringify(rec.stats || base.stats)),
      growth: JSON.parse(JSON.stringify(base.growth)),
      ranks: JSON.parse(JSON.stringify(rec.ranks || base.ranks)),
      items,
      /* 本章起始耐久（P2.2 熟练度成长：用出手消耗量折算出击次数） */
      itemsStart: items.map(it => (it && it.uses) || 0),
      weaponIndex: wi,
      personal: JSON.parse(JSON.stringify(base.personal || {})),
      personal2: JSON.parse(JSON.stringify(base.personal2 || {})),
      inherited: JSON.parse(JSON.stringify(rec.inherited || [])),
      move: cls.move,
      moveType: cls.moveType,
      tags: (cls.tags || []).slice(),
      hp: 0,
      acted: false,
      hasMoved: false,
      movedDist: 0,
      statuses: {},
      escaped: false,
      recruitable: false,
      summoned: false,
      boss: false,
      rawType: null,
      portrait: base.portrait || rec.id
    };
    u.hp = u.stats.hp;
    return u;
  },

  makeEnemyUnit(spec) {
    const diff = this.diff;
    if (spec.char) {
      const c = CHARS[spec.char];
      if (!c) return null;
      const u = {
        id: 'u' + (this.uid++),
        charId: spec.char,
        name: c.name,
        side: 'enemy',
        cls: c.cls,
        level: spec.level || c.level,
        exp: 0,
        stats: JSON.parse(JSON.stringify(c.stats)),
        growth: JSON.parse(JSON.stringify(c.growth)),
        ranks: JSON.parse(JSON.stringify(c.ranks)),
        items: JSON.parse(JSON.stringify(c.items)),
        weaponIndex: 0,
        personal: JSON.parse(JSON.stringify(c.personal || {})),
        personal2: JSON.parse(JSON.stringify(c.personal2 || {})),
        inherited: [],
        move: CLASSES[c.cls].move,
        moveType: CLASSES[c.cls].moveType,
        tags: (CLASSES[c.cls].tags || []).slice(),
        hp: c.stats.hp,
        acted: false,
        hasMoved: false,
        movedDist: 0,
        statuses: {},
        escaped: false,
        recruitable: !!spec.recruitable,
        ai: spec.ai || 'idle',
        talkKey: spec.talkKey || null,
        boss: false,
        rawType: null,
        affixes: []
      };
      return u;
    }
    const type = ENEMY_TYPES[spec.type];
    if (!type) return null;
    const level = Math.max(1, (spec.lv || 1) + (diff.enemyLv || 0));
    const stats = {};
    for (const k of ['hp', 'str', 'mag', 'skl', 'spd', 'lck', 'def', 'res']) {
      const base = (type.base[k] || 0) + (type.growth[k] || 0) * (level - 1);
      stats[k] = Math.max(1, Math.round(base * (diff.enemyMul || 1)));
    }
    const wkey = spec.weapon || type.weapons[0];
    const w = WEAPONS[wkey];
    const u = {
      id: 'u' + (this.uid++),
      charId: null,
      name: type.name,
      side: 'enemy',
      cls: null,
      level,
      exp: 0,
      stats,
      growth: JSON.parse(JSON.stringify(type.growth)),
      ranks: { [w.type]: w.rank || 'S' },
      items: [{ key: wkey, uses: 99 }],
      weaponIndex: 0,
      personal: {},
      personal2: {},
      inherited: [],
      move: type.move,
      moveType: type.moveType,
      tags: (type.tags || []).slice(),
      hp: stats.hp,
      acted: false,
      hasMoved: false,
      movedDist: 0,
      statuses: {},
      escaped: false,
      recruitable: false,
      ai: spec.ai || type.ai || 'aggressive',
      boss: !!(spec.boss || type.boss),
      rawType: spec.type,
      phases: type.phases || 1,
      phase2: type.phase2 ? JSON.parse(JSON.stringify(type.phase2)) : null,
      phase: 1,
      talkKey: null,
      /* 精英词缀：Boss 直接带 ENEMY_TYPES.affixes；浊甲卫由本章池轮流佩戴（assignAffixes） */
      affixes: (type.affixes || []).slice()
    };
    return u;
  },

  /* 词缀分配：浊甲卫（type 'elite'）按出现顺序从本章 affixPool 轮流取一个；
   * 说得单位（char）不戴词缀。Boss 词缀已在 makeEnemyUnit 挂好。 */
  assignAffixes(u, spec) {
    if (!u || spec.char || !spec.type) return u;
    const pool = (this.chapter && this.chapter.affixPool) || [];
    if (spec.type === 'elite' && pool.length) {
      const i = (this.affixCursor = (this.affixCursor || 0) + 1) - 1;
      u.affixes = [pool[i % pool.length]];
    }
    return u;
  },

  /* 带缀单位登场播报（一次就够，别刷屏） */
  announceAffixes(u) {
    if (!u || !(u.affixes || []).length || (this.B.flags.announcedAffixes || {})[u.id]) return;
    if (!this.B.flags.announcedAffixes) this.B.flags.announcedAffixes = {};
    this.B.flags.announcedAffixes[u.id] = true;
    const names = u.affixes.map(k => (ELITE_AFFIXES[k] ? ELITE_AFFIXES[k].name : k)).join('、');
    UI.log(u.name + '身负词缀【' + names + '】。', 'bad');
  },

  /* 自愈词缀：敌方阶段开始，带 regen 的敌军回复 10% 最大生命 */
  tickAffixRegen() {
    const B = this.B;
    for (const u of B.units) {
      if (u.side !== 'enemy' || u.hp <= 0 || u.escaped) continue;
      if (!(u.affixes || []).includes('regen')) continue;
      if (u.hp >= u.stats.hp) continue;
      const amount = Math.max(1, Math.round(u.stats.hp * AFFIX_REGEN_RATE));
      const before = u.hp;
      u.hp = Math.min(u.stats.hp, u.hp + amount);
      const got = u.hp - before;
      UI.log(u.name + '的自愈生效，回复 ' + got + ' 点生命。', 'bad');
      Render.floatText('+' + got, u.x, u.y, '#a9d3a2', 14);
    }
  },

  spawnChapterEnemies() {
    this.affixCursor = 0;
    for (const spec of this.chapter.enemies || []) {
      const u = this.makeEnemyUnit(spec);
      if (!u) continue;
      this.assignAffixes(u, spec);
      u.x = spec.x;
      u.y = spec.y;
      this.B.units.push(u);
      this.announceAffixes(u);
    }
  },

  /* ============================================================
   * 基础查询
   * ============================================================ */
  unitAt(x, y, includeDead) {
    return this.B.units.find(u => u.x === x && u.y === y && (includeDead || (u.hp > 0 && !u.escaped)));
  },

  unitById(id) { return this.B.units.find(u => u.id === id); },

  tileAt(x, y) {
    if (!this.B || y < 0 || y >= 8 || x < 0 || x >= 16) return null;
    return TERRAIN[TerrainFX.tileChar(this.B, x, y)] || TERRAIN['.'];
  },

  tileChar(x, y) {
    if (!this.B || y < 0 || y >= 8 || x < 0 || x >= 16) return null;
    return TerrainFX.tileChar(this.B, x, y);
  },

  nodeAt(x, y) { return (this.B.nodes || []).find(n => n.x === x && n.y === y); },

  key(x, y) { return x + ',' + y; },

  inBounds(x, y) { return x >= 0 && y >= 0 && x < 16 && y < 8; },

  livingPlayers() { return this.B.units.filter(u => u.side === 'player' && u.hp > 0 && !u.escaped); },

  livingEnemies() { return this.B.units.filter(u => u.side === 'enemy' && u.hp > 0 && !u.escaped); },

  requiredPlayers() { return this.B.units.filter(u => u.side === 'player' && u.charId); },

  combatCtx() {
    return {
      mods: (unit, foe, initiating) => this.modsFor(unit, foe, initiating),
      tileAt: (x, y) => this.tileAt(x, y),
      rng: RNG,
      /* 供护盾词缀判断破盾期（combat.affixShieldActive 读 ctx.phaseIndex） */
      phaseIndex: this.B ? this.B.phaseIndex : 0,
      /* 连携候选（战斗预测标注「可连携」用） */
      chainAllies: (unit, foe) => this.chainAllies(unit, foe),
      /* 指挥技·坚守：受保护单位判定（combat.damage 读） */
      holdActive: unit => !!(this.B && (this.B.holdUnits || []).includes(unit.id))
    };
  },

  /* 技能字段合并（P2.2）：职业技 → 个人技① → 个人技② → 继承技。
   * 前两层沿用覆盖语义（保持旧数值不变）；后两层按「同名字段取较大值」合并，
   * 免得个人技②/继承技把职业技的数值压低（例如兽使的 summon: true）。 */
  skillFieldsOf(unit) {
    const out = {};
    if (!unit) return out;
    const cls = CLASSES[unit.cls];
    if (cls && cls.skill) Object.assign(out, cls.skill);
    if (unit.personal) Object.assign(out, unit.personal);
    if (unit.personal2) this.mergeSkillMax(out, unit.personal2);
    for (const sk of unit.inherited || []) this.mergeSkillMax(out, sk);
    return out;
  },

  /* 同名字段取较大值；非数值字段仅在空缺时补上。name/desc 不进公式。 */
  mergeSkillMax(out, sk) {
    if (!sk) return out;
    for (const k of Object.keys(sk)) {
      if (k === 'name' || k === 'desc') continue;
      const v = sk[k];
      if (typeof v === 'number') out[k] = Math.max(out[k] || 0, v);
      else if (out[k] === undefined) out[k] = v;
    }
    return out;
  },

  /* 已生效的技能条目（营地/图鉴展示用）：职业技 + 两条个人技 + 继承技 */
  skillListOf(unit) {
    const list = [];
    const cls = CLASSES[unit && unit.cls];
    if (cls && cls.skill) list.push(Object.assign({ kind: 'cls' }, cls.skill));
    if (unit && unit.personal) list.push(Object.assign({ kind: 'personal' }, unit.personal));
    if (unit && unit.personal2) list.push(Object.assign({ kind: 'personal' }, unit.personal2));
    for (const sk of (unit && unit.inherited) || []) list.push(Object.assign({ kind: 'inherit' }, sk));
    return list;
  },

  hasSkillField(unit, field) {
    const s = this.skillFieldsOf(unit);
    return s[field] !== undefined && s[field] !== false;
  },

  extraMoveFor(unit) {
    return this.modsFor(unit, null).move || 0;
  },

  adjacentAllies(unit) {
    return this.B.units.filter(u => u.side === unit.side && u.hp > 0 && !u.escaped && u.id !== unit.id &&
      (Math.abs(u.x - unit.x) + Math.abs(u.y - unit.y)) === 1);
  },

  supportPointsFor(a, b) {
    const pair = SUPPORT_PAIR_MAP[a + '_' + b];
    if (!pair) return 0;
    return this.B.supports[pair.id] || 0;
  },

  bestSupportBonus(unit) {
    if (!unit.charId) return { rank: null, hit: 0, avoid: 0, crit: 0, dodge: 0 };
    let best = { rank: null, hit: 0, avoid: 0, crit: 0, dodge: 0 };
    let bestOrder = -1;
    for (const pair of SUPPORTS) {
      if (pair.a !== unit.charId && pair.b !== unit.charId) continue;
      const partnerId = pair.a === unit.charId ? pair.b : pair.a;
      const partner = this.B.units.find(u => u.charId === partnerId && u.side === 'player' && u.hp > 0 && !u.escaped);
      if (!partner) continue;
      if (Combat.distance(unit.x, unit.y, partner.x, partner.y) > SUPPORT_RANGE) continue;
      const bonus = Combat.supportBonus(this.B.supports[pair.id] || 0);
      if (bonus.rank && RANK_ORDER[bonus.rank] > bestOrder) {
        bestOrder = RANK_ORDER[bonus.rank];
        best = bonus;
      }
    }
    return best;
  },

  /* 心结状态（P3.2）：'open' 未解 / 'cleared' 已解 / null 无心结 */
  knotState(charId) {
    const c = this.campaign || (typeof Game !== 'undefined' && Game.campaign);
    const knots = (c && c.knots) || null;
    if (!knots || !knots[charId]) return null;
    return knots[charId].resolved ? 'cleared' : 'open';
  },

  /* 心结是否全部解开（终章全队加成的条件） */
  allKnotsCleared() {
    const c = this.campaign || (typeof Game !== 'undefined' && Game.campaign);
    const knots = (c && c.knots) || {};
    const ids = Object.keys(knots).filter(id => knots[id] && typeof knots[id] === 'object');
    return ids.length > 0 && ids.every(id => knots[id].resolved);
  },

  modsFor(unit, foe, initiating) {
    const m = Combat.zeroMods();
    if (!unit || !this.B) return m;
    const cls = CLASSES[unit.cls];
    const skills = this.skillFieldsOf(unit);
    const w = Combat.weaponOf(unit);
    const wtype = w ? w.w.type : null;

    if (skills.hit && (!skills.weapon || skills.weapon === wtype)) m.hit += skills.hit;
    if (skills.crit && (!skills.weapon || skills.weapon === wtype)) m.crit += skills.crit;
    if (skills.hitIfNoMove && !unit.hasMoved) m.hit += skills.hitIfNoMove;
    if (skills.critIfNoMove && !unit.hasMoved) m.crit += skills.critIfNoMove;
    if (skills.hitVsFlying && foe && (foe.tags || []).includes('flying')) m.hit += skills.hitVsFlying;
    if (skills.hitVsArmor && foe && (foe.tags || []).includes('armor')) m.hit += skills.hitVsArmor;
    if (skills.critVsArmor && foe && (foe.tags || []).includes('armor')) m.crit += skills.critVsArmor;
    if (skills.hitIfMoved4 && (unit.movedDist || 0) >= 4) m.hit += skills.hitIfMoved4;
    if (skills.avoidFlat) m.avoid += skills.avoidFlat;
    if (skills.avoidIfLone && this.adjacentAllies(unit).length === 0) m.avoid += skills.avoidIfLone;
    if (skills.avoidOnNode && this.nodeAt(unit.x, unit.y)) m.avoid += skills.avoidOnNode;
    if (skills.defIfWounded && unit.hp < unit.stats.hp / 2) m.def += skills.defIfWounded;
    if (skills.def) m.def += skills.def;
    if (skills.res) m.res += skills.res;
    if (skills.healBonus) m.healBonus += skills.healBonus;
    if (skills.dmg) m.dmg += skills.dmg;              // 职业技直接加伤（裂阵/裂山/焚天等）
    if (skills.move) m.move += skills.move;
    if (skills.selfDamageOnNode && this.nodeAt(unit.x, unit.y)) m.dmg += skills.selfDamageOnNode;
    if (skills.selfDamageIfSummon && this.B.units.some(u => u.summoned && u.side === 'player' && u.hp > 0)) m.dmg += skills.selfDamageIfSummon;
    // 通兽语（姜姒）：己方每有 1 只召唤兽在场，自身伤害 +N
    if (skills.dmgPerSummon) {
      const n = this.B.units.filter(u => u.summoned && u.side === unit.side && u.hp > 0 && !u.escaped).length;
      if (n > 0) m.dmg += n * skills.dmgPerSummon;
    }

    // 召唤指令态修正（猛攻/守御/随行）
    if (unit.summoned && unit.summon) Summon.applyOrderMods(unit, m);

    // 武器词条与技能修正（传说兵器的 traits / skill 在此真正生效）
    if (w) {
      const wm = Combat.weaponMods(w.w, {
        foeTags: (foe && foe.tags) || [],
        adjacentAlly: this.adjacentAllies(unit).length > 0,
        initiating: !!initiating
      });
      m.hit += wm.hit; m.crit += wm.crit; m.dmg += wm.dmg;
      m.def += wm.def; m.res += wm.res; m.avoid += wm.avoid; m.move += wm.move;
    }

    // 邻近友军光环（彼此都受益）
    for (const ally of this.adjacentAllies(unit)) {
      const s = this.skillFieldsOf(ally);
      if (s.adjacentAllyHit) m.hit += s.adjacentAllyHit;
      if (s.adjacentAllyAvoid) m.avoid += s.adjacentAllyAvoid;
      if (s.dmgPerSummon) {
        const n = this.B.units.filter(u => u.summoned && u.side === unit.side && u.hp > 0 && !u.escaped).length;
        if (n > 0) m.dmg += n * s.dmgPerSummon;
      }
    }

    // 敌方寒气光环
    for (const e of this.B.units) {
      if (e.hp <= 0 || e.escaped || e.side === unit.side) continue;
      const s = this.skillFieldsOf(e);
      if (s.enemyAuraHit && Combat.distance(e.x, e.y, unit.x, unit.y) <= 2) m.hit -= s.enemyAuraHit;
    }

    // 敌方光环词缀：带 aura 的敌军周围 2 格友军命中 +10
    if (unit.side === 'enemy') {
      for (const e of this.B.units) {
        if (e.hp <= 0 || e.escaped || e.side !== unit.side || e.id === unit.id) continue;
        if (!(e.affixes || []).includes('aura')) continue;
        if (Combat.distance(e.x, e.y, unit.x, unit.y) <= 2) m.hit += AFFIX_AURA_HIT;
      }
    }

    // 指挥技·集火：我方本回合对指定敌人命中 +15
    if (unit.side === 'player' && this.B.volleyTarget && foe && foe.id === this.B.volleyTarget) {
      m.hit += COMMAND_VOLLEY_HIT;
    }

    // 灵脉阵眼
    const nodeHere = this.nodeAt(unit.x, unit.y);
    if (nodeHere) m.avoid += 10 * (nodeHere.tier || 1);
    for (const node of this.B.nodes) {
      if (!node.active || node.owner !== unit.side) continue;
      const t = node.tier || 1;
      const d = Combat.distance(node.x, node.y, unit.x, unit.y);
      if (node.type === 'attack' && d <= 3) { m.hit += 15 * t; m.crit += 5 * t; }
      else if (node.type === 'guard' && d <= 2) { m.def += 3 * t; m.res += 3 * t; }
      else if (node.type === 'flow' && d <= 3) { m.move += t; }
    }

    // 羁绊
    if (unit.side === 'player' && unit.charId) {
      const sb = this.bestSupportBonus(unit);
      if (sb.rank) {
        m.hit += sb.hit; m.avoid += sb.avoid; m.crit += sb.crit; m.critAvoid += sb.dodge;
      }
    }

    // 心结（P3.2）：未解 -5 命中；全部解开后终章全队 +5 命中 +5 必杀
    if (unit.side === 'player' && unit.charId) {
      const ks = this.knotState(unit.charId);
      if (ks === 'open') m.hit -= KNOT_HIT_PENALTY;
      else if (ks === 'cleared' && this.chapter && this.chapter.no === KNOT_FINAL_NO && this.allKnotsCleared()) {
        m.hit += KNOT_FINAL_BONUS.hit;
        m.crit += KNOT_FINAL_BONUS.crit;
      }
    }

    // 状态
    const st = unit.statuses || {};
    const pi = this.B.phaseIndex;
    if (st.def && pi <= st.def.until) m.def -= st.def.val;
    if (st.res && pi <= st.res.until) m.res -= st.res.val;
    if (st.avoid && pi <= st.avoid.until) m.avoid -= st.avoid.val;
    if (st.movePenalty && pi <= st.movePenalty.until) m.move -= st.movePenalty.val;
    if (st.root && pi <= st.root.until) m.move -= 99;
    if (st.atk && pi <= st.atk.until) m.dmg -= st.atk.val;
    if (st.hit && pi <= st.hit.until) m.hit -= st.hit.val;

    return m;
  },

  /* ============================================================
   * 视野与阵眼
   * ============================================================ */
  computeVisibility(reset) {
    const B = this.B;
    if (!B.fog) { B.visible = new Set(); B.explored = new Set(); return; }
    if (reset || !B.explored) B.explored = new Set();
    B.visible = new Set();
    const vis = B.vision || 4;
    for (const u of B.units) {
      if (u.side !== 'player' || u.hp <= 0 || u.escaped) continue;
      for (let dy = -vis; dy <= vis; dy++) {
        for (let dx = -vis; dx <= vis; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > vis) continue;
          const x = u.x + dx, y = u.y + dy;
          if (!this.inBounds(x, y)) continue;
          const k = this.key(x, y);
          B.visible.add(k);
          B.explored.add(k);
        }
      }
    }
  },

  updateNodes() {
    const pi = this.B.phaseIndex;
    for (const node of this.B.nodes) {
      node.active = node.owner !== 'none' && pi >= node.startPhase && pi <= node.startPhase + 4;
    }
  },

  captureNode(unit) {
    if (!unit || unit.hp <= 0 || unit.escaped) return false;
    const node = this.nodeAt(unit.x, unit.y);
    if (!node || node.owner === unit.side) return false;
    const old = node.owner;
    node.owner = unit.side;
    node.tier = 1;          // 易主则升华进度清零
    node.hold = 0;
    node.startPhase = this.B.phaseIndex + 2;
    node.active = false;
    this.updateNodes();
    const info = NODE_INFO[node.type] || { name: '阵眼' };
    const sideName = unit.side === 'player' ? '我方' : '敌方';
    UI.log(sideName + '占领' + info.name + '阵眼（' + (unit.side === 'player' ? '' : '') + '下个己方阶段生效）', unit.side === 'player' ? 'good' : 'bad');
    Audio.sfx('node');
    Render.floatText(info.name, unit.x, unit.y, unit.side === 'player' ? '#a8d2b7' : '#e0a393', 13);
    if (unit.side === 'player') UI.toast('占领' + info.name + ' · ' + info.desc);
    return true;
  },

  /* 驻守推进：己方阶段结束时，有己方存活单位停在节点上则累计，
   * 满 NODE_TIER_HOLD 个阶段 +1 阶（最高 NODE_TIER_MAX），效果倍增。 */
  tickNodeGarrison(side) {
    const B = this.B;
    for (const node of B.nodes) {
      if (node.owner !== side) continue;
      const held = B.units.some(u =>
        u.side === side && u.hp > 0 && !u.escaped && u.x === node.x && u.y === node.y);
      const up = nodeGarrisonTick(node, held);
      if (up > 0 && side === 'player') {
        const info = NODE_INFO[node.type] || { name: '阵眼' };
        UI.log(info.name + '阵眼驻守升华，升至 ' + up + ' 阶 · ' + nodeEffectText(node.type, up), 'good');
        UI.toast(info.name + '阵眼 ' + up + ' 阶 · ' + nodeEffectText(node.type, up), 2600);
        Audio.sfx('node');
        Render.floatText('升阶', node.x, node.y, '#c9b578', 13);
      }
    }
  },

  activeNodeEffectsFor(side) {
    return this.B.nodes.filter(n => n.active && n.owner === side);
  },

  startPhaseHealing(side) {
    const B = this.B;
    const nodes = this.activeNodeEffectsFor(side).filter(n => n.type === 'life');
    for (const u of B.units) {
      if (u.side !== side || u.hp <= 0 || u.escaped) continue;
      let healed = 0;
      for (const n of nodes) {
        if (Combat.distance(n.x, n.y, u.x, u.y) <= 3) { healed += 8 * (n.tier || 1); }
      }
      const terrain = this.tileAt(u.x, u.y);
      if (terrain && terrain.heal) healed += Math.ceil(u.stats.hp * terrain.heal);
      if (healed > 0 && u.hp < u.stats.hp) {
        const before = u.hp;
        u.hp = Math.min(u.stats.hp, u.hp + healed);
        const got = u.hp - before;
        if (got > 0) {
          Render.floatText('+' + got, u.x, u.y, '#a9d3a2', 13);
        }
      }
    }
  },

  pruneStatuses() {
    const pi = this.B.phaseIndex;
    for (const u of this.B.units) {
      if (!u.statuses) continue;
      for (const k of Object.keys(u.statuses)) {
        if (!u.statuses[k] || pi > u.statuses[k].until) delete u.statuses[k];
      }
    }
  },

  /* ============================================================
   * 阶段流程
   * ============================================================ */
  /* 幕间对白（P3.5 三幕结构）：章数据里的 mids = [{ key, turn }]。
   * 我方阶段开始时，若本回合有未播过的幕间就播一次；同一 key 只播一次，
   * 悔棋回退不重播（B.midsPlayed 随快照序列化）。 */
  async playMidDialogues() {
    const B = this.B;
    const list = (this.chapter && this.chapter.mids) || [];
    if (!B || !list.length) return;
    if (!B.midsPlayed || typeof B.midsPlayed !== 'object') B.midsPlayed = {};
    for (const m of list) {
      if (!m || !m.key || B.midsPlayed[m.key]) continue;
      if ((m.turn || 1) > B.turn) continue;
      if (typeof DIALOGUES === 'undefined' || !DIALOGUES[m.key]) { B.midsPlayed[m.key] = true; continue; }
      B.midsPlayed[m.key] = true;
      B.busy = true;
      try {
        await UI.dialogue(DIALOGUES[m.key]);
      } finally {
        B.busy = false;
      }
      if (!this.active || B.ending) return;
    }
  },

  async beginPlayerPhase(first) {
    const B = this.B;
    B.busy = true;
    B.phase = 'player';
    B.mode = 'idle';
    B.selectedUnit = null;
    B.origin = null;
    B.moveRange = null;
    B.attackRange = null;
    B.targetTiles = null;
    B.pathPreview = null;
    B.dangerOn = false;
    B.dangerSet = null;
    UI.hideActionBar();
    UI.hideUnitCard();
    this.pruneStatuses();
    this.updateNodes();
    // 地形动态层：回合开始清理到期覆盖层，有清理则标脏重绘
    if (TerrainFX.expire(this.B).length) Render.terrainDirty = true;
    for (const u of B.units) {
      if (u.side === 'player' && u.hp > 0 && !u.escaped) {
        u.acted = false;
        u.hasMoved = false;
        u.movedDist = 0;
        u.chainUsed = false;   // 连携每单位每回合限 1 次
      }
    }
    /* 集火/坚守只维持本回合；指挥次数每章 1 次不重置 */
    B.volleyTarget = null;
    B.holdUnits = [];
    this.startPhaseHealing('player');
    this.spawnReinforcements(B.turn);
    this.computeVisibility(false);
    B.tapHint = '点击我方单位行动';
    UI.updateBattle(B);
    UI.phaseBanner('我方阶段', false);
    Audio.sfx('phase');
    if (!first && B.turn > 1) UI.log('第 ' + B.turn + ' 回合 · 我方阶段', 'gold');
    else UI.log('第 ' + B.turn + ' 回合 · 我方阶段', 'gold');
    if (first) {
      UI.log('目标：' + this.chapter.objective.text, 'gold');
      setTimeout(() => UI.toast(this.chapter.tips || this.chapter.objective.text, 4200), 500);
    }
    B.busy = false;
    /* 幕间对白（P3.5）：本章三幕结构的第二幕，按回合触发一次 */
    await this.playMidDialogues();
    const snap = this.serialize(false);
    let hist = Array.isArray(B.history) ? B.history.slice() : [];
    let cur = Number.isInteger(B.historyCursor) ? B.historyCursor : hist.length;
    if (cur < 0) cur = 0;
    if (cur > hist.length) cur = hist.length;
    hist = hist.slice(0, cur + 1);
    hist.push(snap);
    if (hist.length > 12) hist.shift();
    B.history = hist;
    B.historyCursor = hist.length;
    B.rewindSnapshot = hist[hist.length - 1];
    B.lastPlayerState = snap;
    await this.wait(620);
    if (this.active && !B.ending) {
      if (window.Game && Game.saveSuspend) Game.saveSuspend(B.lastPlayerState);
      UI.updateBattle(B);
      await this.checkVictory();
      if (!B.ending) await this.checkDefeat();
    }
  },

  spawnReinforcements(turn) {
    const B = this.B;
    for (const r of this.chapter.reinforcements || []) {
      if (turn < r.turn || B.spawnedReinforcements[r.turn]) continue;
      let spawned = false;
      for (const spec of r.units) {
        let x = spec.x, y = spec.y;
        if (this.unitAt(x, y)) {
          const free = this.findFreeTileNear(x, y, 16, 8, true);
          if (!free) continue;
          x = free.x; y = free.y;
        }
        const u = this.makeEnemyUnit(spec);
        if (!u) continue;
        this.assignAffixes(u, spec);
        u.x = x; u.y = y;
        u.reinforcement = true;
        B.units.push(u);
        this.announceAffixes(u);
        spawned = true;
      }
      B.spawnedReinforcements[r.turn] = true;
      if (spawned) {
        UI.log('敌军增援自山后出现。', 'bad');
        UI.toast('敌军增援出现');
        Audio.sfx('phase');
      }
    }
  },

  async endPlayerPhase() {
    const B = this.B;
    if (!this.active || B.ending || B.busy || B.phase !== 'player') return;
    B.busy = true;
    B.mode = 'idle';
    B.selectedUnit = null;
    B.moveRange = null;
    B.attackRange = null;
    B.targetTiles = null;
    B.pathPreview = null;
    B.dangerOn = false;
    B.dangerSet = null;
    UI.hideActionBar();
    UI.hideUnitCard();
    this.grantSupportPoints();
    this.tickNodeGarrison('player');
    await this.resolveHoldObjectives();
    if (B.ending) { B.busy = false; return; }
    await this.checkVictory();
    if (B.ending) { B.busy = false; return; }

    B.phase = 'enemy';
    B.phaseIndex++;
    this.pruneStatuses();
    this.updateNodes();
    for (const u of B.units) {
      if (u.side === 'enemy' && u.hp > 0 && !u.escaped) { u.acted = false; u.hasMoved = false; u.movedDist = 0; }
    }
    this.tickAffixRegen();
    this.computeVisibility(false);
    UI.updateBattle(B);
    UI.phaseBanner('敌方阶段', true);
    Audio.sfx('phase');
    await this.wait(900);
    await this.runEnemyPhase();
  },

  grantSupportPoints() {
    const B = this.B;
    for (const pair of SUPPORTS) {
      const a = B.units.find(u => u.charId === pair.a && u.side === 'player' && u.hp > 0 && !u.escaped);
      const b = B.units.find(u => u.charId === pair.b && u.side === 'player' && u.hp > 0 && !u.escaped);
      if (!a || !b) continue;
      if (Combat.distance(a.x, a.y, b.x, b.y) !== 1) continue;
      const old = B.supports[pair.id] || 0;
      if (old >= 90) continue;
      const val = Math.min(90, old + SUPPORT_POINTS_ADJACENT);
      B.supports[pair.id] = val;
      const oldRank = Combat.supportRank(old);
      const newRank = Combat.supportRank(val);
      if (newRank && newRank !== oldRank) {
        UI.log(a.name + '与' + b.name + '的羁绊达到 ' + newRank + '。', 'gold');
        UI.toast('羁绊加深 · ' + pair.name + ' ' + newRank, 2400);
        Audio.sfx('node');
      }
    }
  },

  async resolveHoldObjectives() {
    const B = this.B;
    const obj = this.chapter.objective;
    if (obj.type === 'nodes_hold') {
      const ok = (obj.nodes || []).every(id => {
        const n = B.nodes.find(x => x.id === id);
        return n && n.owner === 'player';
      });
      B.mainHoldCount = ok ? B.mainHoldCount + 1 : 0;
      const held = (obj.nodes || []).filter(id => {
        const n = B.nodes.find(x => x.id === id);
        return n && n.owner === 'player';
      }).length;
      UI.log('阵眼守持 ' + Math.min(B.mainHoldCount, obj.turns) + ' / ' + obj.turns + '（' + held + '/' + (obj.nodes || []).length + ' 处）', ok ? 'good' : '');
      if (ok) UI.toast('阵眼共鸣 · 守持 ' + B.mainHoldCount + ' / ' + obj.turns);
      if (B.mainHoldCount >= obj.turns) {
        await this.victory();
        return;
      }
    }
    if (this.chapter.side && this.chapter.side.type === 'weaken') {
      const all = B.nodes.length > 0 && B.nodes.every(n => n.owner === 'player');
      B.sideHoldCount = all ? B.sideHoldCount + 1 : 0;
      if (all) UI.log('三脉同辉 ' + Math.min(B.sideHoldCount, 3) + ' / 3', 'good');
      if (B.sideHoldCount >= 3 && !B.flags.weakened) {
        B.flags.weakened = true;
        this.applyWeaken();
        if (!B.flags.weakenShown) {
          B.flags.weakenShown = true;
          await UI.dialogue(DIALOGUES.weakened || []);
        }
      }
    }
  },

  async runEnemyPhase() {
    const B = this.B;
    if (!this.active || B.ending) return;
    const enemies = B.units.filter(u => u.side === 'enemy' && u.hp > 0 && !u.escaped);
    for (const u of enemies) {
      if (!this.active || B.ending) break;
      if (u.hp <= 0 || u.escaped || u.side !== 'enemy') continue;
      if (u.ai === 'idle' && u.recruitable) { u.acted = true; continue; }
      await this.actEnemy(u);
      this.computeVisibility(false);
      UI.updateBattle(B);
      await this.wait(180);
      if (B.ending) break;
      await this.checkDefeat();
      if (B.ending) break;
    }
    if (!this.active || B.ending) return;
    const obj = this.chapter.objective;
    if (obj.type === 'defend' && B.turn >= obj.turns) {
      await this.victory();
      return;
    }
    if (obj.type === 'siege' && B.turn >= obj.turns && B.flags.bossDead) {
      await this.victory();
      return;
    }
    if (obj.type === 'siege' && B.turn >= obj.turns) {
      // 还得取将军首级；继续下一回合
    }
    B.turn++;
    B.phaseIndex++;
    this.tickNodeGarrison('enemy');
    await this.beginPlayerPhase(false);
  },

  /* ============================================================
   * AI
   * ============================================================ */
  reachFor(unit) {
    // 传解析后的网格：覆盖层（如冰冻结）要能改变可达范围
    return Combat.reachable(unit, TerrainFX.resolvedGrid(this.B), this.B.units, this.extraMoveFor(unit));
  },

  pathBetween(range, unit, x, y) {
    return Combat.pathTo(range, unit, x, y);
  },

  async actEnemy(unit) {
    const B = this.B;
    B.busy = true;
    UI.hideActionBar();
    UI.hideUnitCard();
    B.selectedUnit = null;
    B.hover = null;
    if (unit.ai === 'healer') {
      await this.actHealer(unit);
      this.finishEnemyAction(unit);
      B.busy = false;
      return;
    }
    if (unit.ai === 'idle') {
      unit.acted = true;
      B.busy = false;
      return;
    }
    const range = this.reachFor(unit);
    const best = this.bestEnemyAttack(unit, range);
    const spellPlan = this.bestEnemySpell(unit, range);
    if (spellPlan && (!best || spellPlan.score >= best.score)) {
      const path = this.pathBetween(range, unit, spellPlan.x, spellPlan.y);
      if (path) {
        const oldX = unit.x, oldY = unit.y;
        unit.x = spellPlan.x; unit.y = spellPlan.y;
        unit.hasMoved = spellPlan.x !== oldX || spellPlan.y !== oldY;
        unit.movedDist = Math.max(0, path.length - 1);
        this.computeVisibility(false);
        Audio.sfx('move');
        await Render.animateMove(unit, path, B.speed);
        this.computeVisibility(false);
        UI.updateBattle(B);
      }
      await Spells.cast(this.spellHost(), unit, spellPlan.target, spellPlan.spell);
    } else if (best) {
      const path = this.pathBetween(range, unit, best.x, best.y);
      if (path) {
        const oldX = unit.x, oldY = unit.y;
        unit.x = best.x; unit.y = best.y;
        unit.hasMoved = best.x !== oldX || best.y !== oldY;
        unit.movedDist = Math.max(0, path.length - 1);
        this.computeVisibility(false);
        Render.hpView = null;
        Audio.sfx('move');
        await Render.animateMove(unit, path, B.speed);
        this.computeVisibility(false);
        UI.updateBattle(B);
        if (best.target && best.target.hp > 0) {
          await this.performCombat(unit, best.target, true);
        }
      }
    } else {
      const approach = this.chooseEnemyApproach(unit, range);
      if (approach) {
        const path = this.pathBetween(range, unit, approach.x, approach.y);
        if (path) {
          unit.x = approach.x; unit.y = approach.y;
          unit.hasMoved = path.length > 1;
          unit.movedDist = Math.max(0, path.length - 1);
          Audio.sfx('move');
          await Render.animateMove(unit, path, B.speed);
          this.computeVisibility(false);
          UI.updateBattle(B);
        }
      }
    }
    this.finishEnemyAction(unit);
    B.busy = false;
  },

  finishEnemyAction(unit) {
    if (!unit) return;
    this.captureNode(unit);
    unit.acted = true;
    unit.hasMoved = false;
    unit.movedDist = 0;
    this.computeVisibility(false);
    UI.updateBattle(this.B);
  },

  bestEnemyAttack(unit, range) {
    const w = Combat.weaponOf(unit);
    if (!w) return null;
    const players = this.livingPlayers();
    if (!players.length) return null;
    if (unit.ai === 'guard') {
      const minDist = Math.min(...players.map(p => Combat.distance(unit.x, unit.y, p.x, p.y)));
      if (minDist > (unit.move || 0) + w.w.rng[1] + 2) return null;
    }
    let best = null;
    const oldX = unit.x, oldY = unit.y, oldMoved = unit.hasMoved, oldDist = unit.movedDist;
    for (const node of range.values()) {
      if (!node.endable) continue;
      for (const target of players) {
        const d = Combat.distance(node.x, node.y, target.x, target.y);
        if (d < w.w.rng[0] || d > w.w.rng[1]) continue;
        unit.x = node.x; unit.y = node.y; unit.hasMoved = !(node.x === oldX && node.y === oldY); unit.movedDist = node.cost;
        const f = Combat.forecast(unit, target, this.combatCtx());
        if (!f.canHit) continue;
        const expDmg = (f.attacker.hit / 100) * f.attacker.dmg * (f.attacker.double ? 2 : 1);
        let score = expDmg * 2 + (f.attacker.crit / 100) * f.attacker.dmg;
        if (expDmg >= target.hp) score += 55;
        if (target.charId === 'yunce') score += 26;
        if (target.cls === 'physician') score += 12;
        score += (1 - target.hp / target.stats.hp) * 12;
        const counterDmg = f.defender.canCounter ? (f.defender.hit / 100) * f.defender.dmg * (f.defender.double ? 2 : 1) : 0;
        score -= counterDmg * 0.85;
        if (counterDmg >= unit.hp) score -= 45;
        const terrain = this.tileAt(node.x, node.y);
        score += (terrain.avoid || 0) * 0.12 + (terrain.def || 0) * 0.7;
        const nodeHere = this.nodeAt(node.x, node.y);
        if (nodeHere && nodeHere.owner !== unit.side) score += 8;
        if (!best || score > best.score) {
          best = { x: node.x, y: node.y, target, score };
        }
      }
    }
    unit.x = oldX; unit.y = oldY; unit.hasMoved = oldMoved; unit.movedDist = oldDist;
    return best;
  },

  chooseEnemyApproach(unit, range) {
    const players = this.livingPlayers();
    if (!players.length) return null;
    let best = null;
    const w = Combat.weaponOf(unit);
    const maxR = w ? w.w.rng[1] : 1;
    for (const node of range.values()) {
      if (!node.endable) continue;
      let nearest = Infinity;
      for (const p of players) nearest = Math.min(nearest, Combat.distance(node.x, node.y, p.x, p.y));
      let score = -nearest * 10;
      const nodeHere = this.nodeAt(node.x, node.y);
      if (nodeHere && nodeHere.owner !== 'enemy') score += 18;
      if (nearest <= maxR) score += 10;
      const terrain = this.tileAt(node.x, node.y);
      score += (terrain.avoid || 0) * 0.08;
      // 不踩在多个敌人的同一格之类无需处理（不可重叠）
      if (!best || score > best.score) best = { x: node.x, y: node.y, score };
    }
    if (best && best.x === unit.x && best.y === unit.y) return null;
    return best;
  },

  async actHealer(unit) {
    const staff = Combat.staffOf(unit);
    if (!staff) return;
    const range = this.reachFor(unit);
    const allies = this.B.units.filter(u => u.side === 'enemy' && u.hp > 0 && u.hp < u.stats.hp);
    if (!allies.length) return;
    let best = null;
    const oldX = unit.x, oldY = unit.y;
    for (const node of range.values()) {
      if (!node.endable) continue;
      unit.x = node.x; unit.y = node.y;
      for (const target of allies) {
        const d = Combat.distance(node.x, node.y, target.x, target.y);
        if (d < staff.w.rng[0] || d > staff.w.rng[1]) continue;
        const missing = target.stats.hp - target.hp;
        let score = missing + (target.boss ? 20 : 0);
        if (!best || score > best.score) best = { x: node.x, y: node.y, target, score };
      }
    }
    unit.x = oldX; unit.y = oldY;
    if (!best) return;
    const path = this.pathBetween(range, unit, best.x, best.y);
    if (path) {
      unit.x = best.x; unit.y = best.y;
      Audio.sfx('move');
      await Render.animateMove(unit, path, this.B.speed);
    }
    const amount = Combat.healAmount(unit, staff, this.combatCtx());
    const before = best.target.hp;
    best.target.hp = Math.min(best.target.stats.hp, best.target.hp + amount);
    const got = best.target.hp - before;
    Combat.consumeUse(unit, staff.item);
    Render.floatText('+' + got, best.target.x, best.target.y, '#a9d3a2', 14);
    Audio.sfx('heal');
    UI.log(unit.name + '为' + best.target.name + '回复 ' + got + ' 点生命。', 'bad');
    await this.wait(300);
  },

  /* ============================================================
   * 输入
   * ============================================================ */
  async onTileTap(x, y) {
    if (!this.active || !this.B || this.B.ending) return;
    if (UI.isBlocking()) return;
    if (!this.inBounds(x, y)) return;
    if (this.B.busy || this.B.phase !== 'player') return;
    const B = this.B;
    B.hover = { x, y };
    const u = this.unitAt(x, y);
    try {
      if (B.mode === 'move') {
        const sel = B.selectedUnit;
        if (!sel) { B.mode = 'idle'; return; }
        if (u && u.side === 'player' && u.id !== sel.id && !u.acted) {
          this.selectUnit(u);
          return;
        }
        if (x === sel.x && y === sel.y) {
          this.openActionMenu();
          return;
        }
        const node = B.moveRange && B.moveRange.get(this.key(x, y));
        if (node && node.endable) {
          await this.moveSelectedTo(x, y);
          return;
        }
        if (u && u.side === 'enemy') {
          UI.unitCard(u, B, '敌方单位');
          return;
        }
        this.cancelSelection();
        return;
      }
      if (B.mode === 'attack-select') {
        if (u && u.side === 'enemy' && B.targetTiles && B.targetTiles.has(this.key(x, y))) {
          await this.chooseAttackTarget(u);
          return;
        }
        if (!u) { this.openActionMenu(); return; }
        UI.unitCard(u, B, '');
        return;
      }
      if (B.mode === 'staff-select') {
        if (u && u.side === 'player' && B.targetTiles && B.targetTiles.has(this.key(x, y))) {
          await this.chooseHealTarget(u);
          return;
        }
        if (!u) { this.openActionMenu(); return; }
        UI.unitCard(u, B, '');
        return;
      }
      if (B.mode === 'warp-select') {
        if (u && u.side === 'player' && B.targetTiles && B.targetTiles.has(this.key(x, y))) {
          await this.chooseWarpTarget(u);
          return;
        }
        if (!u) { this.openActionMenu(); return; }
        UI.unitCard(u, B, '');
        return;
      }
      if (B.mode === 'command-target') {
        if (u && u.side === 'enemy' && B.targetTiles && B.targetTiles.has(this.key(x, y))) {
          await this.chooseVolleyTarget(u);
          return;
        }
        if (!u) {
          B.mode = 'idle';
          B.targetTiles = null;
          B.attackRange = null;
          UI.hideActionBar();
          UI.hideUnitCard();
          UI.updateBattle(B);
          return;
        }
        UI.unitCard(u, B, '');
        return;
      }
      if (B.mode === 'spell-select') {
        if (u && u.side === 'enemy' && B.targetTiles && B.targetTiles.has(this.key(x, y))) {
          await this.chooseSpellTarget(u);
          return;
        }
        if (!u) { this.openActionMenu(); return; }
        UI.unitCard(u, B, '');
        return;
      }
      if (B.mode === 'action') {
        if (u) UI.unitCard(u, B, '');
        return;
      }
      if (B.mode === 'inspect') {
        if (u && u.side === 'player' && !u.acted) { this.selectUnit(u); return; }
        if (u) { UI.unitCard(u, B, ''); return; }
        this.clearInspect();
        return;
      }
      // idle
      if (u) {
        if (u.side === 'player' && !u.acted) { this.selectUnit(u); return; }
        if (u.side === 'player' && u.acted) {
          UI.unitCard(u, B, '本回合已行动');
          return;
        }
        this.inspectEnemy(u);
        return;
      }
      B.hover = null;
      B.attackRange = null;
      UI.hideUnitCard();
      UI.updateBattle(B);
    } catch (e) {
      console.error(e);
      this.B.busy = false;
      UI.toast('行动发生异常，已返回待机。');
    }
  },

  onHover(x, y) {
    if (!this.active || !this.B || this.B.busy || this.B.phase !== 'player') return;
    const B = this.B;
    if (x === null) { B.hover = null; B.hoverUnit = null; B.pathPreview = null; return; }
    B.hover = { x, y };
    B.hoverUnit = this.unitAt(x, y) || null;
    if (B.mode === 'move' && B.selectedUnit && B.moveRange) {
      const node = B.moveRange.get(this.key(x, y));
      if (node && node.endable) {
        B.pathPreview = Combat.pathTo(B.moveRange, B.selectedUnit, x, y);
      } else {
        B.pathPreview = null;
      }
    } else {
      B.pathPreview = null;
    }
  },

  selectUnit(u) {
    if (!u || u.side !== 'player' || u.acted || u.hp <= 0 || u.escaped) return;
    const B = this.B;
    B.selectedUnit = u;
    B.origin = { x: u.x, y: u.y };
    B.hasMovedBackup = u.hasMoved;
    B.movedDistBackup = u.movedDist;
    B.mode = 'move';
    B.attackRange = null;
    B.targetTiles = null;
    B.pathPreview = null;
    B.moveRange = this.reachFor(u);
    B.tapHint = '点击蓝色区域移动，或点击自身原地行动';
    Audio.sfx('select');
    UI.unitCard(u, B, '移动范围已显示');
    UI.updateBattle(B);
  },

  async moveSelectedTo(x, y) {
    const B = this.B;
    const u = B.selectedUnit;
    if (!u || !B.moveRange) return;
    const path = Combat.pathTo(B.moveRange, u, x, y);
    if (!path) return;
    // 冰面滑行（不做进 A*）：终点在冰面则沿进入方向滑至稳定点，需二次确认
    const slide = TerrainFX.slideDestination(B, path);
    if (slide && (slide.x !== x || slide.y !== y)) {
      B.busy = true;
      const go = await UI.modal({
        title: '冰面滑行',
        sub: '落脚处是冰面，会沿前进方向一路滑到稳定点',
        body: '目标 (' + x + ', ' + y + ') → 实际将滑至 (' + slide.x + ', ' + slide.y + ')',
        buttons: [
          { label: '取消', value: false },
          { label: '滑行', value: true, cls: 'primary' }
        ]
      });
      if (!go) { B.busy = false; return; }
    }
    B.busy = true;
    UI.hideActionBar();
    B.mode = 'action';
    u.x = slide ? slide.x : x;
    u.y = slide ? slide.y : y;
    u.hasMoved = path.length > 1 || u.x !== B.origin.x || u.y !== B.origin.y;
    u.movedDist = Math.max(0, (slide ? slide.path.length : path.length) - 1);
    if (slide) UI.log(u.name + '在冰面上滑行至 (' + u.x + ', ' + u.y + ')。', '');
    Audio.sfx('move');
    this.computeVisibility(false);
    await Render.animateMove(u, slide ? slide.path : path, B.speed);
    B.busy = false;
    B.moveRange = null;
    B.pathPreview = null;
    UI.unitCard(u, B, TERRAIN_HINTS[this.tileChar(u.x, u.y)] || '选择行动');
    this.openActionMenu();
  },

  openActionMenu() {
    const B = this.B;
    const u = B.selectedUnit;
    if (!u || B.busy) return;
    B.mode = 'action';
    B.moveRange = null;
    B.attackRange = null;
    B.targetTiles = null;
    B.pathPreview = null;
    const buttons = [];
    const w = Combat.weaponOf(u);
    const staff = Combat.staffOf(u);
    const targets = w ? this.attackTargets(u) : [];
    if (w) {
      buttons.push({
        label: '攻击', sub: targets.length ? targets.length + ' 个目标' : '无目标', cls: 'attack',
        disabled: !targets.length,
        onClick: () => this.beginAttackSelect()
      });
    }
    if (staff && !staff.w.warp) {
      const st = this.staffTargets(u);
      buttons.push({
        label: '杖', sub: st.length ? st.length + ' 个目标' : '无目标',
        disabled: !st.length,
        onClick: () => this.beginStaffSelect()
      });
    }
    if (staff && staff.w.warp) {
      const wt = this.warpTargets(u);
      buttons.push({
        label: '渡厄', sub: wt.length ? wt.length + ' 个目标' : '无目标',
        disabled: !wt.length,
        onClick: () => this.beginWarpSelect()
      });
    }
    const healItems = (u.items || []).filter(it => {
      const def = ITEMS[it.key];
      return def && def.kind === 'heal' && it.uses > 0 && u.hp < u.stats.hp;
    });
    if (healItems.length) {
      buttons.push({ label: '道具', sub: healItems.length + ' 种', onClick: () => this.useItem() });
    }
    const talkTarget = this.talkTarget(u);
    if (talkTarget) {
      buttons.push({ label: '说得', sub: talkTarget.name, cls: 'attack', onClick: () => this.talkTo(talkTarget) });
    }
    const village = this.villageAt(u.x, u.y);
    if (village && !B.flags.villages[this.key(u.x, u.y)]) {
      buttons.push({ label: '访问', sub: village.name, onClick: () => this.visitVillage(village) });
    }
    const chest = this.chestAt(u.x, u.y);
    if (chest && !B.flags.chests[this.key(u.x, u.y)]) {
      buttons.push({ label: '开匣', sub: '古匣', onClick: () => this.openChest(chest) });
    }
    const shrine = this.shrineAt(u.x, u.y);
    if (shrine && !B.flags.shrines[this.key(u.x, u.y)]) {
      buttons.push({ label: '参拜', sub: shrine.name, onClick: () => this.visitShrine(shrine) });
    }
    if (this.isSeizeTile(u)) {
      buttons.push({ label: '制压', sub: '渡口', cls: 'wait', onClick: () => this.doSieze() });
    }
    if (this.isEscapeTile(u.x, u.y)) {
      buttons.push({ label: '撤离', sub: '东岸', cls: 'wait', onClick: () => this.doEscape() });
    }
    const summonSkill = this.skillFieldsOf(u).summon;
    if (summonSkill && !u.summonUsed && this.summonUsesLeft(u) > 0) {
      const spot = this.findFreeAdjacent(u.x, u.y);
      const slots = SUMMON_FIELD_CAP - Summon.fieldCount(B);
      const topTier = Summon.tierInfo(Summon.maxTier(summonSkill));
      const beastName = ENEMY_TYPES[topTier.unitType] ? ENEMY_TYPES[topTier.unitType].name : topTier.name;
      buttons.push({
        label: '召唤', sub: spot ? (beastName + ' ' + slots + '/' + SUMMON_FIELD_CAP + ' · 余 ' + this.summonUsesLeft(u)) : '无空地',
        disabled: !spot || slots <= 0,
        onClick: () => this.doSummon()
      });
    }
    const usableSpells = Spells.forUnit(u).filter(sp => Spells.canUse(u, sp.key));
    if (usableSpells.length) {
      buttons.push({
        label: '法术', sub: usableSpells.length + ' 种', cls: 'attack',
        onClick: () => this.beginSpellSelect()
      });
    }
    buttons.push({ label: '待机', sub: '结束行动', cls: 'wait', onClick: () => this.finishUnitAction(u) });
    buttons.push({ label: '取消', sub: '退回', cls: 'cancel', onClick: () => this.cancelSelection() });
    const node = this.nodeAt(u.x, u.y);
    let hint;
    if (node) {
      const info = NODE_INFO[node.type] || { name: '阵眼', desc: '结束行动后占领' };
      const t = node.tier || 1;
      if (node.owner === 'player') {
        hint = info.name + ' ' + t + ' 阶 · ' + nodeEffectText(node.type, t) +
               ' · 驻守 ' + (node.hold || 0) + '/' + NODE_TIER_HOLD +
               (t < NODE_TIER_MAX ? '（停在节点上结束行动可升华）' : '（已至满阶）');
      } else {
        hint = '阵眼：' + info.desc + (node.owner === 'none' ? ' · 结束行动可占领' : ' · 敌方脉流 · 结束行动可夺取');
      }
    } else {
      hint = TERRAIN_HINTS[this.tileChar(u.x, u.y)] || '';
    }
    UI.actionBar(buttons, hint);
    UI.unitCard(u, B, '选择行动');
    UI.updateBattle(B);
  },

  async backToActionMenu() {
    const B = this.B;
    if (!B.selectedUnit) return;
    B.mode = 'action';
    B.targetTiles = null;
    B.attackRange = null;
    this.openActionMenu();
  },

  attackTargets(unit) {
    const w = Combat.weaponOf(unit);
    if (!w) return [];
    return this.B.units.filter(t =>
      t.side === 'enemy' && t.hp > 0 && !t.escaped &&
      Combat.distance(unit.x, unit.y, t.x, t.y) >= w.w.rng[0] &&
      Combat.distance(unit.x, unit.y, t.x, t.y) <= w.w.rng[1] &&
      (!this.B.fog || (this.B.visible && this.B.visible.has(this.key(t.x, t.y))))
    );
  },

  staffTargets(unit) {
    const st = Combat.staffOf(unit);
    if (!st) return [];
    return this.B.units.filter(t =>
      t.side === 'player' && t.hp > 0 && t.hp < t.stats.hp && !t.escaped &&
      Combat.distance(unit.x, unit.y, t.x, t.y) >= st.w.rng[0] &&
      Combat.distance(unit.x, unit.y, t.x, t.y) <= st.w.rng[1]
    );
  },

  talkTarget(unit) {
    if (!unit || unit.charId !== 'yunce') return null;
    return this.B.units.find(t => t.side === 'enemy' && t.recruitable && t.hp > 0 &&
      Combat.distance(unit.x, unit.y, t.x, t.y) === 1);
  },

  /* 渡厄杖目标：射程内所有存活友军（含自己以外的满血单位——传送不挑伤情） */
  warpTargets(unit) {
    const st = Combat.staffOf(unit);
    if (!st || !st.w.warp) return [];
    return this.B.units.filter(t =>
      t.side === 'player' && t.hp > 0 && !t.escaped && t.id !== unit.id &&
      Combat.distance(unit.x, unit.y, t.x, t.y) >= st.w.rng[0] &&
      Combat.distance(unit.x, unit.y, t.x, t.y) <= st.w.rng[1]
    );
  },

  villageAt(x, y) { return (this.chapter.villages || []).find(v => v.x === x && v.y === y); },
  chestAt(x, y) { return (this.chapter.chests || []).find(v => v.x === x && v.y === y); },
  shrineAt(x, y) { return (this.chapter.shrines || []).find(v => v.x === x && v.y === y); },

  isSeizeTile(u) {
    const obj = this.chapter.objective;
    return !!(obj.type === 'seize' && obj.gate && u.charId === 'yunce' && u.x === obj.gate[0] && u.y === obj.gate[1]);
  },

  isEscapeTile(x, y) {
    return (this.chapter.escapes || []).some(e => e[0] === x && e[1] === y);
  },

  beginAttackSelect() {
    const B = this.B;
    const u = B.selectedUnit;
    if (!u) return;
    const targets = this.attackTargets(u);
    if (!targets.length) return;
    B.mode = 'attack-select';
    B.targetTiles = new Set(targets.map(t => this.key(t.x, t.y)));
    const w = Combat.weaponOf(u);
    B.attackRange = new Set();
    for (const t of Combat.tilesInRange(u.x, u.y, w.w.rng[0], w.w.rng[1], 16, 8)) {
      B.attackRange.add(this.key(t.x, t.y));
    }
    Audio.sfx('select');
    UI.unitCard(u, B, '选择攻击目标');
    UI.actionBar([{ label: '返回', sub: '行动菜单', cls: 'cancel', onClick: () => this.backToActionMenu() }], '点击红框中的敌人');
    UI.updateBattle(B);
  },

  async chooseAttackTarget(target) {
    const B = this.B;
    const u = B.selectedUnit;
    if (!u || !target) return;
    /* 勇者模式（P3.4）：不给战斗预测，直接出手 */
    const ok = (this.diff && this.diff.heroic) ? true : await UI.forecast(this.combatCtx(), u, target);
    if (!this.active || B.ending) return;
    if (!ok) {
      if (B.mode === 'attack-select') UI.updateBattle(B);
      return;
    }
    B.busy = true;
    B.targetTiles = null;
    B.attackRange = null;
    UI.hideActionBar();
    await this.performCombat(u, target, false);
    B.busy = false;
    if (!B.ending) await this.offerChain(u, target);
    if (!B.ending) {
      await this.finishUnitAction(u);
    }
  },

  beginStaffSelect() {
    const B = this.B;
    const u = B.selectedUnit;
    if (!u) return;
    const targets = this.staffTargets(u);
    if (!targets.length) return;
    B.mode = 'staff-select';
    B.targetTiles = new Set(targets.map(t => this.key(t.x, t.y)));
    const st = Combat.staffOf(u);
    B.attackRange = new Set();
    for (const t of Combat.tilesInRange(u.x, u.y, st.w.rng[0], st.w.rng[1], 16, 8)) {
      B.attackRange.add(this.key(t.x, t.y));
    }
    UI.unitCard(u, B, '选择治疗目标');
    UI.actionBar([{ label: '返回', sub: '行动菜单', cls: 'cancel', onClick: () => this.backToActionMenu() }], '点击需要治疗的友军');
    UI.updateBattle(B);
  },

  async chooseHealTarget(target) {
    const B = this.B;
    const u = B.selectedUnit;
    if (!u || !target) return;
    const staff = Combat.staffOf(u);
    if (!staff) return;
    B.busy = true;
    B.targetTiles = null;
    B.attackRange = null;
    UI.hideActionBar();
    const amount = Combat.healAmount(u, staff, this.combatCtx());
    const before = target.hp;
    target.hp = Math.min(target.stats.hp, target.hp + amount);
    const got = target.hp - before;
    Combat.consumeUse(u, staff.item);
    B.stats.heals += got;
    Audio.sfx('heal');
    Render.floatText('+' + got, target.x, target.y, '#a9d3a2', 16);
    UI.log(u.name + '为' + target.name + '回复 ' + got + ' 点生命。', 'good');
    await this.grantStaffExp(u);
    if (staff.item.uses <= 0) UI.log(staff.w.name + '已用尽。', 'bad');
    B.busy = false;
    if (!B.ending) await this.finishUnitAction(u);
  },

  async grantStaffExp(unit) {
    const levels = Combat.levelUp(unit, 12);
    if (levels && levels.length) {
      this.B.stats.levels += levels.length;
      await UI.levelUp(unit, levels);
    }
  },

  /* ============================================================
   * 传送武器：渡厄杖（唤回友军）
   * ============================================================ */
  beginWarpSelect() {
    const B = this.B;
    const u = B.selectedUnit;
    if (!u) return;
    const targets = this.warpTargets(u);
    if (!targets.length) return;
    B.mode = 'warp-select';
    B.targetTiles = new Set(targets.map(t => this.key(t.x, t.y)));
    const st = Combat.staffOf(u);
    B.attackRange = new Set();
    for (const t of Combat.tilesInRange(u.x, u.y, st.w.rng[0], st.w.rng[1], 16, 8)) {
      B.attackRange.add(this.key(t.x, t.y));
    }
    UI.unitCard(u, B, '选择传送目标');
    UI.actionBar([{ label: '返回', sub: '行动菜单', cls: 'cancel', onClick: () => this.backToActionMenu() }], '点击需要唤回身侧的友军');
    UI.updateBattle(B);
  },

  async chooseWarpTarget(target) {
    const B = this.B;
    const u = B.selectedUnit;
    if (!u || !target) return;
    const staff = Combat.staffOf(u);
    if (!staff || !staff.w.warp) return;
    B.busy = true;
    B.targetTiles = null;
    B.attackRange = null;
    UI.hideActionBar();
    const dest = Combat.warpDestination(u, target, (x, y) => {
      if (!this.inBounds(x, y)) return true;
      const tile = this.tileAt(x, y);
      if (!tile || tile.blocked) return true;
      return !!this.unitAt(x, y);
    });
    if (!dest) {
      UI.toast('身侧没有空地，渡厄杖无法施展');
      UI.log(u.name + '身侧没有空地，渡厄杖无法施展。', 'bad');
      B.busy = false;
      this.openActionMenu();
      return;
    }
    const from = { x: target.x, y: target.y };
    target.x = dest.x;
    target.y = dest.y;
    Combat.consumeUse(u, staff.item);
    Audio.sfx('heal');
    Render.floatText('渡厄', dest.x, dest.y, '#9ec5e0', 16);
    UI.log(u.name + '展开渡厄杖：把' + target.name + '从 (' + from.x + ',' + from.y + ') 唤回身侧 (' + dest.x + ',' + dest.y + ')。', 'good');
    await this.grantStaffExp(u);
    if (staff.item.uses <= 0) UI.log(staff.w.name + '已用尽。', 'bad');
    B.busy = false;
    if (!B.ending) await this.finishUnitAction(u);
  },

  /* ============================================================
   * 双人连携（P1.4）：A 攻击后，与 A 相距 ≤2、本回合未行动且射程
   * 覆盖目标的友军 B 可追加一击。不获经验、不触发反击、每单位每回合 1 次。
   * ============================================================ */
  chainAllies(unit, foe) {
    if (!unit || !foe || unit.side !== 'player') return [];
    return this.B.units.filter(t =>
      t.side === 'player' && t.hp > 0 && !t.escaped && !t.summoned &&
      t.id !== unit.id && !t.acted && !t.chainUsed &&
      Combat.distance(unit.x, unit.y, t.x, t.y) <= CHAIN_RANGE &&
      Combat.canAttackRange(t, foe)
    );
  },

  /* 连携追加攻击：单次结算（无反击/无追击/无经验），目标死亡照常走 handleDeath */
  async performChainAttack(ally, target) {
    const B = this.B;
    if (!ally || !target || target.hp <= 0 || ally.hp <= 0) return false;
    const ctx = this.combatCtx();
    const w = Combat.weaponOf(ally);
    if (!w) return false;
    B.busy = true;
    UI.hideActionBar();
    const hitRate = Combat.hitChance(ally, target, ctx, true);
    const critRate = Combat.critChance(ally, target, ctx, true);
    const roll = (ctx.rng && ctx.rng.hitRoll) ? ctx.rng.hitRoll() : 0;
    const hit = roll < hitRate;
    let dmg = 0, crit = false;
    if (hit) {
      crit = (ctx.rng && ctx.rng.next) ? (ctx.rng.next() * 100 < critRate) : false;
      dmg = Combat.damage(ally, target, ctx, true) * (crit ? 3 : 1);
      target.hp = Math.max(0, target.hp - dmg);
    }
    Combat.consumeUse(ally, w.item);
    ally.acted = true;
    ally.chainUsed = true;
    if (ally.side === 'player') B.stats.damage += dmg;
    UI.log(ally.name + '连携出击' + (hit ? (crit ? '，必杀' : '') + '，造成 ' + dmg + ' 伤害。' : '，却被避开。'),
      ally.side === 'player' ? 'good' : 'bad');
    await Render.lunge(ally, target.x, target.y, B.speed);
    if (hit) {
      Render.slash(target.x, target.y, crit ? 'crit' : 'hit');
      Render.shake(crit ? 8 : 3);
      Render.floatText((crit ? '必杀 ' : '') + '-' + dmg, target.x, target.y, crit ? '#f1cd7a' : '#f0b8a8', crit ? 19 : 15);
      Audio.sfx(crit ? 'crit' : 'hit');
      if (target.hp <= 0) await this.handleDeath(target, ally);
    } else {
      Render.slash(target.x, target.y, 'miss');
      Render.floatText('闪避', target.x, target.y, '#dfe6d7', 14);
      Audio.sfx('miss');
    }
    await this.wait(260);
    UI.updateBattle(B);
    B.busy = false;
    if (!B.ending) {
      await this.checkVictory();
      if (!B.ending) await this.checkDefeat();
    }
    return true;
  },

  /* 攻击结束后询问连携（chooseAttackTarget 在 performCombat 后调用） */
  async offerChain(attacker, target) {
    const B = this.B;
    if (B.ending || !target || target.hp <= 0) return;
    const cands = this.chainAllies(attacker, target);
    if (!cands.length) return;
    const pick = await UI.modal({
      title: '双人连携',
      sub: attacker.name + '得手 · 相邻友军可追加一击（不获经验、不触发反击）',
      list: cands.map(u => {
        const w = Combat.weaponOf(u);
        const c = this.combatCtx();
        return {
          label: u.name + (w ? ' · ' + w.w.name : ''),
          meta: '命中 ' + Combat.hitChance(u, target, c, true) + '% · 伤害 ' + Combat.damage(u, target, c, true),
          value: u.id
        };
      })
    });
    if (!this.active || B.ending || pick == null) return;
    const ally = this.unitById(pick);
    if (ally) await this.performChainAttack(ally, target);
  },

  /* ============================================================
   * 云策指挥技（P1.4）：每章 1 次，HUD「令」入口。
   * 号令 = 3 格内友军本回合可再行动；集火 = 指定 5 格内敌人，本回合对其 +15 命中；
   * 坚守 = 3 格内友军本回合受伤 -20%。云策阵亡/离队时不可用。
   * ============================================================ */
  yunceUnit() {
    return this.B.units.find(u => u.charId === 'yunce' && u.side === 'player' && u.hp > 0 && !u.escaped) || null;
  },

  commandAvailable() {
    const B = this.B;
    if (!B || B.ending || B.commandUsed) return false;
    if (B.phase !== 'player' || B.busy) return false;
    return !!this.yunceUnit();
  },

  openCommandMenu() {
    const B = this.B;
    if (!this.commandAvailable()) {
      UI.toast(B && B.commandUsed ? '指挥技本章已用过' : '云策不在阵中，无法指挥');
      return;
    }
    const y = this.yunceUnit();
    UI.modal({
      title: '云策指挥技',
      sub: '本章仅可发动一次 · 云策当前位于 (' + y.x + ',' + y.y + ')',
      list: Object.keys(COMMAND_SKILLS).map(k => ({
        label: COMMAND_SKILLS[k].name,
        meta: COMMAND_SKILLS[k].desc,
        value: k
      }))
    }).then(pick => {
      if (!this.active || pick == null) return;
      if (pick === 'order') this.applyOrderCommand();
      else if (pick === 'volley') this.beginVolleySelect();
      else if (pick === 'hold') this.applyHoldCommand();
    });
  },

  applyOrderCommand() {
    const B = this.B;
    const y = this.yunceUnit();
    if (!y || B.commandUsed) return;
    let n = 0;
    for (const u of B.units) {
      if (u.side !== 'player' || u.hp <= 0 || u.escaped || u.summoned) continue;
      if (Combat.distance(y.x, y.y, u.x, u.y) > 3) continue;
      u.acted = false;
      u.hasMoved = false;
      u.movedDist = 0;
      n++;
    }
    B.commandUsed = true;
    UI.log('云策号令：' + n + ' 名友军本回合可再行动一次。', 'gold');
    UI.toast('号令 · ' + n + ' 人可再动');
    Audio.sfx('phase');
    UI.updateBattle(B);
  },

  applyHoldCommand() {
    const B = this.B;
    const y = this.yunceUnit();
    if (!y || B.commandUsed) return;
    B.holdUnits = B.units.filter(u =>
      u.side === 'player' && u.hp > 0 && !u.escaped &&
      Combat.distance(y.x, y.y, u.x, u.y) <= 3).map(u => u.id);
    B.commandUsed = true;
    UI.log('云策坚守：' + B.holdUnits.length + ' 名友军本回合受伤 -20%。', 'gold');
    UI.toast('坚守 · 受伤 -20%');
    Audio.sfx('phase');
    UI.updateBattle(B);
  },

  beginVolleySelect() {
    const B = this.B;
    const y = this.yunceUnit();
    if (!y || B.commandUsed) return;
    const targets = B.units.filter(t => t.side === 'enemy' && t.hp > 0 && !t.escaped &&
      Combat.distance(y.x, y.y, t.x, t.y) <= 5);
    if (!targets.length) { UI.toast('5 格内没有可集火的敌人'); return; }
    B.mode = 'command-target';
    B.targetTiles = new Set(targets.map(t => this.key(t.x, t.y)));
    B.attackRange = new Set();
    for (const t of Combat.tilesInRange(y.x, y.y, 1, 5, 16, 8)) B.attackRange.add(this.key(t.x, t.y));
    UI.unitCard(y, B, '选择集火目标');
    UI.actionBar([{
      label: '返回', sub: '取消', cls: 'cancel', onClick: () => {
        B.mode = 'idle';
        B.targetTiles = null;
        B.attackRange = null;
        UI.hideActionBar();
        UI.hideUnitCard();
        UI.updateBattle(B);
      }
    }], '点击 5 格内要集火的敌人');
    UI.updateBattle(B);
  },

  async chooseVolleyTarget(target) {
    const B = this.B;
    const y = this.yunceUnit();
    if (!target || !y || B.commandUsed) return;
    if (Combat.distance(y.x, y.y, target.x, target.y) > 5) { UI.toast('超出集火射程'); return; }
    B.volleyTarget = target.id;
    B.commandUsed = true;
    B.mode = 'idle';
    B.targetTiles = null;
    B.attackRange = null;
    UI.hideActionBar();
    UI.log('云策集火' + target.name + '：友军本回合对其命中 +15。', 'gold');
    UI.toast('集火 · ' + target.name);
    Audio.sfx('phase');
    UI.updateBattle(B);
  },

  /* ============================================================
   * 五行法术（systems/spells.js 编排）
   * ============================================================ */
  spellHost() {
    return {
      B: this.B,
      ctx: this.combatCtx(),
      log: (m, c) => UI.log(m, c),
      float: (t, x, y, c, s) => Render.floatText(t, x, y, c, s),
      sfx: (n) => Audio.sfx(n),
      wait: (ms) => this.wait(ms),
      kill: (unit, killer) => this.handleDeath(unit, killer),
      exp: (unit, amount) => {
        const lv = Combat.levelUp(unit, amount);
        if (lv && lv.length) { this.B.stats.levels += lv.length; return UI.levelUp(unit, lv); }
      }
    };
  },

  beginSpellSelect() {
    const B = this.B;
    const u = B.selectedUnit;
    if (!u) return;
    const spells = Spells.forUnit(u).filter(sp => Spells.canUse(u, sp.key));
    if (!spells.length) { UI.toast('没有可用的法术'); return; }
    UI.modal({
      title: '五行法术',
      sub: u.name + ' · 次数每章重置',
      list: spells.map(sp => ({
        label: sp.name + '（' + (ELEMENTS[sp.element] ? ELEMENTS[sp.element].name : '') + '·' + sp.rank + '阶）',
        meta: '剩 ' + Spells.usesLeft(u, sp.key) + ' 次 · 射程 ' + sp.rng[0] + '-' + sp.rng[1] +
              (sp.aoe ? ' · 范围半径 ' + sp.aoe.radius : '') +
              (sp.effect ? ' · ' + Spells.effectText(sp.effect) : ''),
        value: sp.key
      })),
      buttons: [{ label: '返回', value: null }]
    }).then(key => {
      if (!key || !this.active || !this.B) return;
      this.beginSpellTargetSelect(SPELLS[key]);
    });
  },

  beginSpellTargetSelect(spell) {
    const B = this.B;
    const u = B.selectedUnit;
    if (!u || !spell) return;
    const rangeBonus = this.skillFieldsOf(u).songRange || 0;
    const lo = spell.rng[0] + (spell.ally ? rangeBonus : 0);
    const hi = spell.rng[1] + (spell.ally ? rangeBonus : 0);
    const targets = B.units.filter(t => (spell.ally ? t.side === u.side : t.side !== u.side) &&
      t.hp > 0 && !t.escaped &&
      Combat.distance(u.x, u.y, t.x, t.y) >= lo &&
      Combat.distance(u.x, u.y, t.x, t.y) <= hi);
    if (!targets.length) { UI.toast(spell.ally ? '射程内没有友军' : '射程内没有目标'); return; }
    B.mode = 'spell-select';
    B.pendingSpell = spell;
    B.targetTiles = new Set(targets.map(t => this.key(t.x, t.y)));
    B.attackRange = new Set();
    for (const t of targets) {
      B.attackRange.add(this.key(t.x, t.y));
      if (spell.aoe) {
        for (const p of Combat.tilesInRange(t.x, t.y, 0, spell.aoe.radius, 16, 8)) {
          B.attackRange.add(this.key(p.x, p.y));
        }
      }
    }
    Audio.sfx('select');
    UI.unitCard(u, B, '选择法术目标');
    UI.actionBar([{ label: '返回', sub: '行动菜单', cls: 'cancel', onClick: () => this.backToActionMenu() }],
      spell.ally ? '点击蓝框中的友军' : '点击红框中的敌人');
    UI.updateBattle(B);
  },

  async chooseSpellTarget(target) {
    const B = this.B;
    const u = B.selectedUnit;
    const spell = B.pendingSpell;
    if (!u || !target || !spell) return;
    const fc = Spells.forecast(this.combatCtx(), u, target, spell, B);
    const aoeNames = fc.aoe.filter(t => t !== target).map(t => t.name);
    const power = Spells.songPowerOf(u);
    const effectDesc = spell.effect ? Spells.effectText(spell.effect) : '';
    const statLine = spell.heal
      ? '治疗 ' + (spell.heal + 2 * power)
      : spell.song
        ? '效果 ' + effectDesc + (power ? '（增强）' : '')
        : '命中 ' + (fc.f ? fc.f.hit : 0) + ' · 预估伤害 ' + (fc.f ? fc.f.dmg : 0) +
          (fc.f && fc.f.element.text ? ' · ' + fc.f.element.text : '') +
          (effectDesc ? ' · ' + effectDesc : '');
    const ok = await UI.modal({
      title: '咏唱《' + spell.name + '》',
      sub: u.name + ' → ' + target.name + '（距离 ' + fc.dist + '）',
      body: statLine +
            (aoeNames.length ? ' · 波及：' + aoeNames.join('、') : '') +
            ' · 剩余次数 ' + Spells.usesLeft(u, spell.key),
      buttons: [{ label: '取消', value: false }, { label: '咏唱', value: true, cls: 'primary' }]
    });
    if (!this.active || B.ending) return;
    if (!ok) {
      if (B.mode === 'spell-select') UI.updateBattle(B);
      return;
    }
    B.busy = true;
    B.targetTiles = null;
    B.attackRange = null;
    B.pendingSpell = null;
    UI.hideActionBar();
    await Spells.cast(this.spellHost(), u, target, spell);
    B.busy = false;
    if (!B.ending) await this.finishUnitAction(u);
  },

  /* 敌方法术 AI：在可达位中为每本法术找期望伤害最高的目标 */
  bestEnemySpell(unit, range) {
    const spells = Spells.forUnit(unit).filter(sp => Spells.canUse(unit, sp.key));
    if (!spells.length) return null;
    const players = this.livingPlayers();
    if (!players.length) return null;
    const oldX = unit.x, oldY = unit.y, oldMoved = unit.hasMoved, oldDist = unit.movedDist;
    let best = null;
    for (const node of range.values()) {
      if (!node.endable) continue;
      for (const sp of spells) {
        for (const target of players) {
          const d = Combat.distance(node.x, node.y, target.x, target.y);
          if (d < sp.rng[0] || d > sp.rng[1]) continue;
          unit.x = node.x; unit.y = node.y;
          unit.hasMoved = !(node.x === oldX && node.y === oldY);
          unit.movedDist = node.cost;
          const ctx = this.combatCtx();
          const f = Combat.spellAttack(unit, target, sp, ctx);
          let expDmg = (f.hit / 100) * f.dmg;
          if (sp.aoe) {
            for (const extra of Spells.aoeTargets(this.B, target, sp, unit.side)) {
              if (extra === target) continue;
              const f2 = Combat.spellAttack(unit, extra, sp, ctx);
              expDmg += (f2.hit / 100) * f2.dmg;
            }
          }
          let score = expDmg * 2.2 + (f.crit / 100) * f.dmg;
          if (expDmg >= target.hp) score += 55;
          if (target.charId === 'yunce') score += 26;
          score += (1 - target.hp / target.stats.hp) * 12;
          if (sp.aoe) score += 18 * Math.max(0, Spells.aoeTargets(this.B, target, sp, unit.side).length - 1);
          if (f.element.state === 'strong') score += 10;
          if (!best || score > best.score) best = { x: node.x, y: node.y, target, spell: sp, score };
        }
      }
    }
    unit.x = oldX; unit.y = oldY; unit.hasMoved = oldMoved; unit.movedDist = oldDist;
    return best;
  },

  async useItem() {
    const B = this.B;
    const u = B.selectedUnit;
    if (!u) return;
    const items = u.items.map((it, idx) => ({ it, idx, def: ITEMS[it.key] }))
      .filter(x => x.def && x.def.kind === 'heal' && x.it.uses > 0);
    if (!items.length || u.hp >= u.stats.hp) {
      UI.toast('没有可用的回复道具');
      return;
    }
    const choice = await UI.modal({
      title: '使用道具',
      sub: u.name + ' 生命 ' + u.hp + ' / ' + u.stats.hp,
      list: items.map(x => ({
        label: x.def.name + ' ×' + x.it.uses,
        meta: '回复 ' + x.def.heal,
        value: x.idx
      })),
      buttons: [{ label: '取消', value: null }]
    });
    if (choice === null || choice === undefined) return;
    const item = u.items[choice];
    if (!item) return;
    const def = ITEMS[item.key];
    const before = u.hp;
    u.hp = Math.min(u.stats.hp, u.hp + def.heal);
    const got = u.hp - before;
    item.uses--;
    Audio.sfx('heal');
    Render.floatText('+' + got, u.x, u.y, '#a9d3a2', 15);
    UI.log(u.name + '使用' + def.name + '，回复 ' + got + ' 点生命。', 'good');
    if (item.uses <= 0) {
      u.items.splice(choice, 1);
      if (u.weaponIndex >= u.items.length) u.weaponIndex = 0;
    }
    await this.finishUnitAction(u);
  },

  async talkTo(target) {
    const B = this.B;
    const u = B.selectedUnit;
    if (!u || !target || !target.recruitable) return;
    B.busy = true;
    UI.hideActionBar();
    if (target.talkKey && DIALOGUES[target.talkKey]) {
      await UI.dialogue(DIALOGUES[target.talkKey]);
    }
    target.side = 'player';
    target.ai = 'ally';
    target.recruitable = false;
    target.acted = true;
    target.hasMoved = false;
    B.recruited.push(target.charId);
    B.stats.recruits++;
    UI.log(target.name + '加入了我方。', 'gold');
    UI.toast(target.name + ' 加入队伍');
    Audio.sfx('levelup');
    this.computeVisibility(false);
    B.busy = false;
    await this.finishUnitAction(u, { noCapture: true });
  },

  async visitVillage(village) {
    const B = this.B;
    const u = B.selectedUnit;
    if (!u) return;
    B.busy = true;
    UI.hideActionBar();
    B.flags.villages[this.key(village.x, village.y)] = true;
    B.visitedVillages++;
    let addedItem = null;
    if (village.gold) { B.loot.gold += village.gold; UI.log('访问' + village.name + '，获得 ' + village.gold + ' 盘缠。', 'gold'); Audio.sfx('gold'); }
    if (village.item) { B.loot.items.push(village.item); addedItem = WEAPONS[village.item] ? WEAPONS[village.item].name : (ITEMS[village.item] ? ITEMS[village.item].name : village.item); UI.log('获得 ' + addedItem + '。', 'gold'); }
    if (village.talk && DIALOGUES[village.talk]) {
      await UI.dialogue(DIALOGUES[village.talk]);
    }
    if (village.recruit && CHARS[village.recruit]) {
      const rec = (this.campaign.roster || []).find(r => r.id === village.recruit);
      if (!rec) {
        const joined = this.addRecruitUnit(village.recruit, u.x, u.y);
        if (joined) {
          B.recruited.push(village.recruit);
          B.stats.recruits++;
          UI.log(joined.name + '加入了我方。', 'gold');
          UI.toast(joined.name + ' 加入队伍');
          Audio.sfx('levelup');
        }
      }
    }
    UI.updateBattle(B);
    B.busy = false;
    await this.finishUnitAction(u, { noCapture: false });
  },

  addRecruitUnit(charId, nearX, nearY) {
    if (this.B.units.some(u => u.charId === charId)) return null;
    const base = CHARS[charId];
    if (!base) return null;
    const rec = {
      id: charId, cls: base.cls, level: base.level, exp: 0,
      stats: JSON.parse(JSON.stringify(base.stats)),
      ranks: JSON.parse(JSON.stringify(base.ranks)),
      items: JSON.parse(JSON.stringify(base.items)),
      weaponIndex: 0
    };
    const u = this.makePlayerUnit(rec);
    const spot = this.findFreeTileNear(nearX, nearY, 16, 8, true) || { x: nearX, y: nearY };
    u.x = spot.x; u.y = spot.y;
    u.acted = true;
    this.B.units.push(u);
    this.computeVisibility(false);
    return u;
  },

  async openChest(chest) {
    const B = this.B;
    const u = B.selectedUnit;
    if (!u) return;
    B.busy = true;
    UI.hideActionBar();
    B.flags.chests[this.key(chest.x, chest.y)] = true;
    const item = chest.item;
    if (item) {
      B.loot.items.push(item);
      const nm = WEAPONS[item] ? WEAPONS[item].name : (ITEMS[item] ? ITEMS[item].name : item);
      UI.log('打开' + chest.name + '，获得 ' + nm + '。', 'gold');
      UI.toast('获得 ' + nm);
    }
    Audio.sfx('open');
    B.busy = false;
    await this.finishUnitAction(u);
  },

  async visitShrine(shrine) {
    const B = this.B;
    const u = B.selectedUnit;
    if (!u) return;
    B.busy = true;
    UI.hideActionBar();
    B.flags.shrines[this.key(shrine.x, shrine.y)] = true;
    if (shrine.gold) {
      B.loot.gold += shrine.gold;
      UI.log('参拜' + shrine.name + '，获得 ' + shrine.gold + ' 盘缠。', 'gold');
      Audio.sfx('gold');
    }
    if (shrine.heal) {
      const before = u.hp;
      u.hp = Math.min(u.stats.hp, u.hp + shrine.heal);
      UI.log('参拜' + shrine.name + '，回复 ' + (u.hp - before) + ' 点生命。', 'good');
      Audio.sfx('heal');
      Render.floatText('+' + (u.hp - before), u.x, u.y, '#a9d3a2', 14);
    }
    B.busy = false;
    await this.finishUnitAction(u);
  },

  async doSieze() {
    const B = this.B;
    const u = B.selectedUnit;
    if (!u || !this.isSeizeTile(u)) return;
    B.flags.seized = true;
    UI.log('云策踏上了对岸渡口，制压成功。', 'gold');
    Audio.sfx('victory');
    await this.finishUnitAction(u);
    await this.checkVictory();
  },

  async doEscape() {
    const B = this.B;
    const u = B.selectedUnit;
    if (!u) return;
    B.busy = true;
    UI.hideActionBar();
    u.escaped = true;
    u.acted = true;
    UI.log(u.name + '抵达东岸，撤离了战场。', 'gold');
    UI.toast(u.name + ' 已撤离');
    Audio.sfx('gold');
    B.selectedUnit = null;
    B.mode = 'idle';
    B.targetTiles = null;
    B.attackRange = null;
    B.moveRange = null;
    UI.hideUnitCard();
    this.computeVisibility(false);
    UI.updateBattle(B);
    B.busy = false;
    await this.checkVictory();
    if (!B.ending) await this.checkDefeat();
  },

  /* 每章召唤剩余次数：单位按职业 skill.summonUses 记（缺省 1 次），
   * 个人技②的 summonUsesBonus 在此叠加（阿蛮·唤兽）。
   * 单位每章从战役存档重建，计数器自然每章重置；summonUsed 兼容旧语义。 */
  summonUsesLeft(unit) {
    if (!unit) return 0;
    if (unit.summonUsed) return 0;
    const f = this.skillFieldsOf(unit);
    const per = (f.summonUses || 1) + (f.summonUsesBonus || 0);
    if (unit.summonUsesLeft === undefined) unit.summonUsesLeft = per;
    return Math.max(0, unit.summonUsesLeft);
  },

  async doSummon() {
    const B = this.B;
    const u = B.selectedUnit;
    if (!u || u.summonUsed || this.summonUsesLeft(u) <= 0) return;
    if (!Summon.canSpawn(B)) { UI.toast('场上召唤物已达上限（' + SUMMON_FIELD_CAP + ' 只）'); return; }
    const spot = this.findFreeAdjacent(u.x, u.y);
    if (!spot) { UI.toast('周围没有空位'); return; }
    const skill = this.skillFieldsOf(u).summon;
    const tiers = Summon.tiersFor(skill);
    let tier = tiers[tiers.length - 1].tier;
    if (tiers.length > 1) {
      const pick = await UI.modal({
        title: '召唤',
        sub: '选择阶位 · 场上同时最多 ' + SUMMON_FIELD_CAP + ' 只 · 本章余 ' + this.summonUsesLeft(u) + ' 次',
        list: tiers.map(t => ({
          label: t.name + ' · ' + (ENEMY_TYPES[t.unitType] ? ENEMY_TYPES[t.unitType].name : ''),
          meta: t.desc,
          value: t.tier
        })),
        buttons: [{ label: '取消', value: null }]
      });
      if (pick === null || pick === undefined) return;
      tier = pick;
    }
    B.busy = true;
    UI.hideActionBar();
    const info = Summon.tierInfo(tier);
    const pet = Summon.spawn(B, this.uid++, u, tier);
    pet.x = spot.x; pet.y = spot.y;
    B.units.push(pet);
    B.summoned.push(pet.id);
    u.summonUsesLeft = this.summonUsesLeft(u) - 1;
    if (u.summonUsesLeft <= 0) u.summonUsed = true;
    UI.log(u.name + '召唤了' + info.name + '（本章余 ' + this.summonUsesLeft(u) + ' 次）。', 'gold');
    Audio.sfx('node');
    Render.floatText(info.name, spot.x, spot.y, '#b8d6b0', 14);
    // 神御（神御师）：神兽登场时周围敌军命中 -5（一回合）
    const aura = this.skillFieldsOf(u).summonAuraHit;
    if (aura && tier >= 3) {
      for (const e of B.units) {
        if (e.side === 'enemy' && e.hp > 0 && !e.escaped && Combat.distance(e.x, e.y, pet.x, pet.y) <= 2) {
          e.statuses = e.statuses || {};
          e.statuses.hit = { val: aura, until: B.phaseIndex + 1 };
          UI.log(e.name + '震慑于神兽之威，命中下降。', 'gold');
        }
      }
    }
    B.busy = false;
    await this.finishUnitAction(u);
  },

  /* 兼容旧调用的山灵狼工厂（阶位表现由 SUMMON_TIERS 驱动） */
  makeAllyWolf(spec, x, y, tier) {
    const caster = { id: 'legacy', level: (spec && spec.lv) || 1 };
    const wolf = Summon.spawn(this.B, this.uid++, caster, tier || 1);
    wolf.x = x; wolf.y = y;
    return wolf;
  },

  async finishUnitAction(unit, opts) {
    const B = this.B;
    if (!unit) return;
    unit.acted = true;
    unit.hasMoved = false;
    unit.movedDist = 0;
    if (!opts || !opts.noCapture) this.captureNode(unit);
    // 随行召唤：护卫召唤者移动落位
    Summon.followCaster(B, unit,
      (m, c) => UI.log(m, c),
      (t, x, y, col, s) => Render.floatText(t, x, y, col, s));
    B.selectedUnit = null;
    B.mode = 'idle';
    B.moveRange = null;
    B.attackRange = null;
    B.targetTiles = null;
    B.pathPreview = null;
    B.origin = null;
    UI.hideActionBar();
    UI.hideUnitCard();
    this.computeVisibility(false);
    UI.updateBattle(B);
    if (this.B.dangerOn) this.recomputeDanger();
    await this.checkVictory();
    if (!B.ending) await this.checkDefeat();
  },

  cancelSelection() {
    const B = this.B;
    const u = B.selectedUnit;
    if (!u) return;
    if (B.origin) { u.x = B.origin.x; u.y = B.origin.y; }
    u.hasMoved = false;
    u.movedDist = 0;
    B.selectedUnit = null;
    B.origin = null;
    B.mode = 'idle';
    B.moveRange = null;
    B.attackRange = null;
    B.targetTiles = null;
    B.pathPreview = null;
    UI.hideActionBar();
    UI.hideUnitCard();
    this.computeVisibility(false);
    Audio.sfx('cancel');
    UI.updateBattle(B);
  },

  clearInspect() {
    const B = this.B;
    B.mode = 'idle';
    B.attackRange = null;
    B.targetTiles = null;
    UI.hideUnitCard();
    UI.updateBattle(B);
  },

  inspectEnemy(u) {
    if (!u) return;
    const B = this.B;
    B.mode = 'inspect';
    B.attackRange = new Set();
    const w = Combat.weaponOf(u);
    if (w) {
      for (const t of Combat.tilesInRange(u.x, u.y, w.w.rng[0], w.w.rng[1], 16, 8)) {
        B.attackRange.add(this.key(t.x, t.y));
      }
    }
    UI.unitCard(u, B, '敌方 · 显示攻击范围');
    UI.updateBattle(B);
  },

  /* ============================================================
   * 交战
   * ============================================================ */
  async performCombat(attacker, defender, fromEnemyPhase) {
    const B = this.B;
    const ctx = this.combatCtx();
    B.busy = true;
    UI.hideActionBar();
    // 随行召唤拦截：敌军攻击我方时，相邻的随行召唤物替友军挡击
    const guard = Summon.interceptTarget(B, attacker, defender);
    if (guard && guard !== defender) {
      UI.log(guard.name + '挺身替' + defender.name + '挡下这一击。', 'good');
      defender = guard;
    }
    B.hpView = null;
    Render.hpView = {};
    for (const u of B.units) if (u.hp > 0) Render.hpView[u.id] = u.hp;
    /* 追影刃换位：先捕获攻击方武器（交战可能把它耗尽，换位判定要在结算后仍认得出它） */
    const swapWeapon = (() => {
      const aw = Combat.weaponOf(attacker);
      return aw && aw.w.swapOnHit ? aw : null;
    })();
    UI.log(attacker.name + ' 与 ' + defender.name + ' 交战。', '');
    Audio.sfx('select');
    const events = Combat.resolve(attacker, defender, ctx);
    for (const ev of events) {
      if (ev.type === 'strike') {
        const striker = this.unitById(ev.attacker);
        const foe = this.unitById(ev.defender);
        if (!striker || !foe) continue;
        if (striker.hp <= 0) continue;
        await Render.lunge(striker, foe.x, foe.y, B.speed);
        if (ev.hit) {
          Render.hpView[foe.id] = ev.hpAfter;
          Render.slash(foe.x, foe.y, ev.crit ? 'crit' : 'hit');
          Render.shake(ev.crit ? 8 : 3);
          Render.floatText((ev.crit ? '必杀 ' : '') + '-' + ev.dmg, foe.x, foe.y, ev.crit ? '#f1cd7a' : '#f0b8a7', ev.crit ? 19 : 15);
          Render.flash(ev.crit ? '#f4d79a' : '#f0e8d4', ev.crit ? 0.3 : 0.12);
          Audio.sfx(ev.crit ? 'crit' : 'hit');
          UI.log(ev.attackerName + '命中' + ev.defenderName + (ev.crit ? '，必杀' : '') + '，造成 ' + ev.dmg + ' 伤害。', striker.side === 'player' ? 'good' : 'bad');
          if (ev.effective) UI.log('特效克制！', 'gold');
          if (striker.side === 'player') B.stats.damage += ev.dmg;
          if (ev.debuff) this.applyWeaponDebuff(foe, ev.debuff);
          const skill = this.skillFieldsOf(striker);
          if (skill.movePenaltyOnHit && ev.hit) {
            foe.statuses.movePenalty = { val: skill.movePenaltyOnHit, until: B.phaseIndex + 1 };
          }
          /* 传说武器附带技能：命中后 / 暴击后效果 */
          const wsk = ev.weaponSkill;
          if (wsk) {
            if (wsk.debuffDefOnHit) {
              const turns = wsk.debuffDefOnHit.turns || 1;
              foe.statuses.def = { val: wsk.debuffDefOnHit.def, until: B.phaseIndex + turns };
              UI.log(striker.name + '的' + wsk.name + '：' + foe.name + '护甲 -' + wsk.debuffDefOnHit.def + '。', 'gold');
              Render.floatText('破甲', foe.x, foe.y, '#e0b78a', 13);
            }
            if (ev.crit && wsk.movePenaltyOnCrit) {
              foe.statuses.movePenalty = { val: wsk.movePenaltyOnCrit, until: B.phaseIndex + 1 };
              UI.log(striker.name + '的' + wsk.name + '：' + foe.name + '下回合移动 -' + wsk.movePenaltyOnCrit + '。', 'gold');
              Render.floatText('迟滞', foe.x, foe.y, '#9ec5e0', 13);
            }
            if (wsk.cleanseOnHit && foe.statuses) {
              const buffKey = Object.keys(foe.statuses).find(k => foe.statuses[k] && foe.statuses[k].val < 0);
              if (buffKey) {
                delete foe.statuses[buffKey];
                UI.log(striker.name + '的' + wsk.name + '：涤去了' + foe.name + '身上的增益。', 'gold');
                Render.floatText('净脉', foe.x, foe.y, '#c9b3e0', 13);
              }
            }
          }
          /* 护盾词缀破盾：我方站在己方阵眼上命中带盾敌军 → 破盾（持续约一回合） */
          if (Combat.affixShieldActive(foe, ctx) && striker.side === 'player') {
            const node = this.nodeAt(striker.x, striker.y);
            if (node && node.owner === 'player') {
              foe.shieldBreakUntil = B.phaseIndex + 2;
              UI.log(striker.name + '借阵眼之力击破了' + foe.name + '的护盾。', 'gold');
              Render.floatText('破盾', foe.x, foe.y, '#f0c25a', 14);
            }
          }
        } else {
          Render.slash(foe.x, foe.y, 'miss');
          Render.floatText('闪避', foe.x, foe.y, '#dfe6d7', 14);
          Audio.sfx('miss');
          UI.log(ev.attackerName + '的攻击被' + ev.defenderName + '避开。', striker.side === 'player' ? 'bad' : 'good');
        }
        if (ev.hit && ev.lethal && Render.hpView) Render.hpView[foe.id] = 0;
        await this.wait(ev.crit ? 360 : 260);
      } else if (ev.type === 'break') {
        UI.log(ev.unitName + '的' + ev.weapon + '损毁了。', 'bad');
        Audio.sfx('cancel');
      }
    }
    const deaths = events.filter(e => e.type === 'death');
    for (const d of deaths) {
      const dead = this.unitById(d.unit);
      if (dead) await this.handleDeath(dead, this.unitById(d.killer));
    }
    /* 追影刃：攻击方命中过防守方、双方俱在、目标非 Boss → 交换位置 */
    if (swapWeapon && !B.ending && attacker.hp > 0 && defender.hp > 0 && !defender.boss &&
        Combat.swapOnHitLanded(events, attacker.id, defender.id)) {
      const ox = attacker.x, oy = attacker.y;
      attacker.x = defender.x;
      attacker.y = defender.y;
      defender.x = ox;
      defender.y = oy;
      UI.log(attacker.name + '的' + swapWeapon.w.name + '：与' + defender.name + '交换了位置。', 'gold');
      Render.floatText('换位', attacker.x, attacker.y, '#9ec5e0', 14);
    }
    Render.hpView = null;
    await this.wait(180);
    UI.updateBattle(B);
    B.busy = false;
    if (!B.ending) {
      await this.checkVictory();
      if (!B.ending) await this.checkDefeat();
    }
  },

  applyWeaponDebuff(foe, debuff) {
    if (!foe || !debuff) return;
    const until = this.B.phaseIndex + 1;
    if (debuff.def) foe.statuses.def = { val: debuff.def, until };
    if (debuff.res) foe.statuses.res = { val: debuff.res, until };
  },

  /* 图鉴解锁（P3.4）：击破的敌型与它身上的词缀记进本章战果，章末并入存档。
   * 说得 / 撤退的单位不算击破，所以只在这里记。 */
  noteCodex(unit) {
    const B = this.B;
    if (!B || !unit) return;
    if (!B.codexSeen || typeof B.codexSeen !== 'object') B.codexSeen = {};
    if (unit.rawType) B.codexSeen[unit.rawType] = true;
    for (const a of unit.affixes || []) B.codexSeen['affix_' + a] = true;
  },

  async handleDeath(unit, killer) {
    if (!unit) return;
    if (unit.side === 'enemy') {
      if (unit.rawType === 'xuanque' && unit.phase === 1) {
        unit.hp = 0;
        await this.transformBoss(unit);
        return;
      }
      if (unit.boss) {
        this.B.flags.bossDead = true;
        if (unit.rawType === 'xuanque') this.B.flags.bossDefeated = true;
      }
      this.B.stats.kills++;
      this.noteCodex(unit);
      unit.hp = 0;
      Audio.sfx('death');
      UI.log(unit.name + '倒下了。', 'good');
      Render.floatText('破', unit.x, unit.y, '#e7d5b0', 18);
      const lg = (typeof Legendary !== 'undefined') ? Legendary.onBossKilled(this.campaign, unit.rawType) : null;
      if (lg) {
        if (lg.action === 'drop') {
          this.B.loot.items.push(lg.key);
          UI.log('获得传说武器【' + lg.name + '】！', 'good');
          UI.toast('传说武器【' + lg.name + '】入手！');
          Audio.sfx('levelup');
          Render.floatText('传说', unit.x, unit.y, '#f0c25a', 22);
        } else if (lg.action === 'miss') {
          UI.log('【' + lg.name + '】未现踪影（本次掉率 ' + Math.round(lg.chance * 100) + '%·已讨伐 ' + lg.since + ' 次）。', '');
          Render.floatText('未掉', unit.x, unit.y, '#b8ac93', 13);
        } else {
          this.B.loot.gold += lg.gold;
          this.B.loot.seals = (this.B.loot.seals || 0) + lg.seals;
          UI.log('【' + lg.name + '】已持有，转化为 ' + lg.gold + ' 金 + ' + lg.seals + ' 印。', 'good');
          UI.toast('重复掉落转化：+' + lg.gold + '金 +' + lg.seals + '印');
          Render.floatText('+' + lg.gold + '金', unit.x, unit.y, '#f0c25a', 18);
        }
      }
      if (killer && killer.side === 'player' && killer.hp > 0 && !killer.summoned) {
        await this.grantKillExp(killer, unit);
      }
    } else if (unit.side === 'player') {
      unit.hp = 0;
      this.B.stats.lost++;
      if (unit.charId) this.B.casualties.push(unit.charId);
      Audio.sfx('death');
      UI.log(unit.name + '倒下了。', 'bad');
      Render.floatText('殁', unit.x, unit.y, '#df9b8c', 18);
      Render.shake(6);
      if (unit.charId === 'yunce') {
        this.B.flags.lordDead = true;
        UI.log('守脉人倒下了。', 'bad');
      }
    }
  },

  async grantKillExp(killer, foe) {
    const amount = Combat.killExp(killer.level, foe.level, this.diff.expMul) + (foe.boss ? 10 : 0);
    const levels = Combat.levelUp(killer, amount);
    UI.log(killer.name + '获得 ' + amount + ' 点经验。', 'gold');
    if (levels && levels.length) {
      this.B.stats.levels += levels.length;
      await UI.levelUp(killer, levels);
    }
  },

  async transformBoss(unit) {
    const type = ENEMY_TYPES.xuanque;
    const spec = type.phase2;
    const diff = this.diff;
    const stats = {};
    for (const k of ['hp', 'str', 'mag', 'skl', 'spd', 'lck', 'def', 'res']) {
      stats[k] = Math.max(1, Math.round(((spec.base[k] || 0) + (spec.growth[k] || 0) * (unit.level - 1)) * (diff.enemyMul || 1)));
    }
    unit.name = spec.name;
    unit.stats = stats;
    unit.hp = stats.hp;
    unit.items = [{ key: spec.weapon, uses: 99 }];
    unit.weaponIndex = 0;
    unit.moveType = spec.moveType;
    unit.move = spec.move;
    unit.tags = spec.tags.slice();
    unit.ai = 'aggressive';
    unit.phase = 2;
    unit.rawType = 'xuanque_phase2';
    unit.statuses = {};
    if (this.B.flags.weakened) this.weakenUnitStats(unit);
    this.B.flags.bossPhase = 2;
    UI.log('玄阙的血肉裂开，噬脉兽现身。', 'bad');
    UI.toast('玄阙化作噬脉兽');
    Audio.playMusic('boss');
    Audio.sfx('crit');
    Render.shake(10);
    Render.flash('#c9a35c', 0.25);
    UI.updateBattle(this.B);
    await UI.dialogue(DIALOGUES.boss_phase2 || []);
    UI.updateBattle(this.B);
  },

  weakenUnitStats(unit) {
    for (const k of ['hp', 'str', 'mag', 'skl', 'spd', 'def', 'res']) {
      unit.stats[k] = Math.max(1, Math.round(unit.stats[k] * 0.85));
    }
    unit.hp = Math.min(unit.hp, unit.stats.hp);
  },

  applyWeaken() {
    const B = this.B;
    const boss = B.units.find(u => u.side === 'enemy' && (u.rawType === 'xuanque' || u.rawType === 'xuanque_phase2') && u.hp > 0);
    UI.log('三处阵眼的脉光刺入浊潮，噬脉兽的气息被削弱了。', 'gold');
    UI.toast('阵眼共鸣 · 噬脉兽被削弱');
    if (boss && boss.phase === 2) {
      this.weakenUnitStats(boss);
      Render.floatText('脉弱', boss.x, boss.y, '#a9d3a2', 18);
      Render.shake(6);
    }
  },

  /* ============================================================
   * 胜负判定
   * ============================================================ */
  async checkVictory() {
    const B = this.B;
    if (!this.active || B.ending) return false;
    const obj = this.chapter.objective;
    let win = false;
    if (obj.type === 'rout') {
      win = this.livingEnemies().length === 0;
    } else if (obj.type === 'seize') {
      win = !!B.flags.seized;
    } else if (obj.type === 'siege') {
      win = B.turn >= obj.turns && !!B.flags.bossDead;
    } else if (obj.type === 'defend') {
      win = false;
    } else if (obj.type === 'escape') {
      const required = this.requiredPlayers().filter(u => u.hp > 0);
      win = required.length > 0 && required.every(u => u.escaped);
    } else if (obj.type === 'nodes_hold') {
      win = B.mainHoldCount >= obj.turns;
    } else if (obj.type === 'boss') {
      win = !!B.flags.bossDead;
    }
    if (win) { await this.victory(); return true; }
    return false;
  },

  async checkDefeat() {
    const B = this.B;
    if (!this.active || B.ending) return false;
    const lord = B.units.find(u => u.charId === 'yunce');
    if (lord && lord.hp <= 0) {
      await this.defeat('守脉人云策倒下了。山海的路，在这里断了。');
      return true;
    }
    const survivors = this.requiredPlayers().filter(u => u.hp > 0);
    if (!survivors.length) {
      await this.defeat('同行者已全部倒下。');
      return true;
    }
    return false;
  },

  sideSuccess() {
    const side = this.chapter.side;
    if (!side) return true;
    const B = this.B;
    if (side.type === 'villages') {
      return (this.chapter.villages || []).every(v => B.flags.villages[this.key(v.x, v.y)]);
    }
    if (side.type === 'shrines') {
      return (this.chapter.shrines || []).every(v => B.flags.shrines[this.key(v.x, v.y)]);
    }
    if (side.type === 'chest') {
      return (this.chapter.chests || []).every(v => B.flags.chests[this.key(v.x, v.y)]);
    }
    if (side.type === 'recruit') {
      return B.recruited.includes(side.char);
    }
    if (side.type === 'kill_boss') return !!B.flags.bossDead;
    if (side.type === 'weaken') return !!B.flags.weakened;
    return false;
  },

  sideInfo() {
    const B = this.B;
    if (!this.chapter) return [];
    const obj = this.chapter.objective;
    const lines = [];
    let mainText = obj.text;
    let progress = '';
    if (obj.type === 'rout') {
      const left = this.livingEnemies().length;
      progress = '余敌 ' + left;
      mainText = '歼灭所有敌军';
    } else if (obj.type === 'defend') {
      progress = Math.min(B.turn, obj.turns) + ' / ' + obj.turns + ' 回合';
    } else if (obj.type === 'seize') {
      progress = B.flags.seized ? '已制压' : '云策前往东北渡口';
    } else if (obj.type === 'siege') {
      progress = '第' + Math.min(B.turn, obj.turns) + '/' + obj.turns + ' 回合 · ' + (B.flags.bossDead ? '将军已败' : '将军仍在');
    } else if (obj.type === 'escape') {
      const req = this.requiredPlayers().filter(u => u.hp > 0);
      const done = req.filter(u => u.escaped).length;
      progress = done + ' / ' + req.length + ' 人撤离';
    } else if (obj.type === 'nodes_hold') {
      const owned = (obj.nodes || []).filter(id => {
        const n = B.nodes.find(x => x.id === id);
        return n && n.owner === 'player';
      }).length;
      progress = '守持 ' + Math.min(B.mainHoldCount, obj.turns) + '/' + obj.turns + ' · 阵眼 ' + owned + '/' + (obj.nodes || []).length;
    } else if (obj.type === 'boss') {
      progress = B.flags.bossPhase >= 2 ? '噬脉兽' : '玄阙';
    }
    lines.push({ text: mainText, progress, done: false });
    if (this.chapter.side) {
      const side = this.chapter.side;
      let sp = '';
      let done = this.sideSuccess();
      if (side.type === 'villages') {
        const total = (this.chapter.villages || []).length;
        const got = (this.chapter.villages || []).filter(v => B.flags.villages[this.key(v.x, v.y)]).length;
        sp = got + '/' + total;
      } else if (side.type === 'shrines') {
        const total = (this.chapter.shrines || []).length;
        const got = (this.chapter.shrines || []).filter(v => B.flags.shrines[this.key(v.x, v.y)]).length;
        sp = got + '/' + total;
      } else if (side.type === 'chest') {
        sp = done ? '已开启' : '未开启';
      } else if (side.type === 'recruit') {
        sp = done ? '已加入' : '未加入';
      } else if (side.type === 'kill_boss') {
        sp = B.flags.bossDead ? '已斩杀' : '未斩杀';
      } else if (side.type === 'weaken') {
        sp = Math.min(B.sideHoldCount, 3) + '/3';
      }
      lines.push({ text: '支线：' + side.text, progress: sp, done });
    }
    if (this.diff.rewinds > 0) lines.push({ text: '悔棋', progress: '× ' + B.rewindLeft, done: false });
    return lines;
  },

  async victory() {
    const B = this.B;
    if (B.ending || !this.active) return;
    B.ending = true;
    B.busy = true;
    this.active = false;
    UI.hideActionBar();
    UI.hideUnitCard();
    UI.updateBattle(B);
    UI.log('章节目标达成。', 'gold');
    Audio.playMusic('camp');
    Audio.sfx('victory');
    await this.wait(650);
    const result = this.collectResult();
    Render.clearFx();
    await Game.onChapterClear(result);
  },

  async defeat(reason) {
    const B = this.B;
    if (B.ending) return;
    B.ending = true;
    B.busy = true;
    this.active = false;
    UI.hideActionBar();
    UI.hideUnitCard();
    UI.updateBattle(B);
    Audio.stopMusic();
    Audio.sfx('defeat');
    await this.wait(400);
    if (Game.onChapterDefeat) Game.onChapterDefeat(reason, this.chapterId);
  },

  /* 本章各武器类型的出手次数（P2.2 熟练度成长）：按耐久消耗折算。
   * 兵器每次交锋扣 1、杖每次治疗扣 1、咒每次施法扣 1，因此消耗量≈出手次数。 */
  weaponUsesOf(u) {
    const out = {};
    const start = u.itemsStart || [];
    const items = u.items || [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const w = it && WEAPONS[it.key];
      if (!w) continue;
      const spent = Math.max(0, (start[i] || 0) - (it.uses || 0));
      if (!spent) continue;
      out[w.type] = (out[w.type] || 0) + spent;
    }
    return out;
  },

  /* 熟练度成长（P2.2）：纯函数，战役结算与测试共用。
   * ranks / rankPts 原地更新；uses 为本章各武器类型的出手次数。
   * 满 RANK_UP_USES 升一阶，余数留到下章，每章每类最多升一阶，S 阶封顶。
   * 返回本章升阶记录 [{ wt, from, to, uses }]。 */
  rankGrowth(ranks, rankPts, uses) {
    const ups = [];
    if (!ranks || !rankPts || !uses || typeof uses !== 'object') return ups;
    for (const wt of Object.keys(uses)) {
      const n = Math.max(0, uses[wt] || 0);
      if (!n) continue;
      const cur = RANK_ORDER[ranks[wt]];
      if (cur === undefined || cur >= RANK_NAMES.length - 1) { rankPts[wt] = 0; continue; }
      const pts = (rankPts[wt] || 0) + n;
      if (pts < RANK_UP_USES) { rankPts[wt] = pts; continue; }
      rankPts[wt] = pts - RANK_UP_USES;
      const from = RANK_NAMES[cur];
      ranks[wt] = RANK_NAMES[cur + 1];
      ups.push({ wt, from, to: ranks[wt], uses: n });
    }
    return ups;
  },

  collectResult() {
    const B = this.B;
    const rosterOut = [];
    for (const u of B.units) {
      if (u.side !== 'player' || !u.charId) continue;
      if (u.hp <= 0) continue;
      rosterOut.push({
        id: u.charId,
        cls: u.cls,
        level: u.level,
        exp: u.exp,
        stats: JSON.parse(JSON.stringify(u.stats)),
        ranks: JSON.parse(JSON.stringify(u.ranks)),
        items: JSON.parse(JSON.stringify(u.items)),
        weaponIndex: u.weaponIndex,
        weaponUses: this.weaponUsesOf(u),
        inherited: JSON.parse(JSON.stringify(u.inherited || []))
      });
    }
    const fallen = B.units.filter(u => u.side === 'player' && u.charId && u.hp <= 0).map(u => u.charId);
    /* 阵眼控制情况（P3.4 多结局判定：终章三阵眼是否全控） */
    const nodesTotal = (B.nodes || []).length;
    const nodesHeld = (B.nodes || []).filter(n => n && n.owner === 'player').length;
    return {
      chapterId: this.chapterId,
      turns: B.turn,
      victory: true,
      sideSuccess: this.sideSuccess(),
      nodesHeld,
      nodesTotal,
      codex: Object.assign({}, B.codexSeen || {}),
      units: rosterOut,
      fallen,
      recruited: B.recruited.slice(),
      supports: JSON.parse(JSON.stringify(B.supports)),
      loot: JSON.parse(JSON.stringify(B.loot)),
      stats: JSON.parse(JSON.stringify(B.stats)),
      flags: JSON.parse(JSON.stringify(B.flags)),
      mainHoldCount: B.mainHoldCount
    };
  },

  /* ============================================================
   * 界面按钮
   * ============================================================ */
  toggleSpeed() {
    if (!this.B) return;
    this.B.speed = this.B.speed === 1 ? 2 : 1;
    if (this.campaign) {
      if (!this.campaign.settings) this.campaign.settings = {};
      this.campaign.settings.speed = this.B.speed;
    }
    UI.updateBattle(this.B);
    UI.toast('战斗速度 ×' + this.B.speed);
  },

  toggleDanger() {
    const B = this.B;
    if (!B || !this.active) return;
    if (B.phase !== 'player') { UI.toast('敌方阶段无法查看危险范围'); return; }
    if (B.fog) { UI.toast('雾中视野有限，无法窥见危险范围'); return; }
    B.dangerOn = !B.dangerOn;
    if (B.dangerOn) this.recomputeDanger(); else B.dangerSet = null;
    Audio.sfx('tap');
    UI.updateBattle(B);
  },

  recomputeDanger() {
    const B = this.B;
    if (!B) return;
    const set = new Set();
    for (const u of B.units) {
      if (u.side !== 'enemy' || u.hp <= 0 || u.escaped) continue;
      if (u.ai === 'idle' && u.recruitable) continue;
      const z = Combat.dangerZone(u, TerrainFX.resolvedGrid(B), B.units, this.extraMoveFor(u));
      for (const k of z) set.add(k);
    }
    B.dangerSet = set;
  },

  askEndTurn() {
    const B = this.B;
    if (!B || !this.active || B.busy || B.phase !== 'player' || B.ending) return;
    const unacted = B.units.filter(u => u.side === 'player' && u.hp > 0 && !u.escaped && !u.acted);
    if (!unacted.length) {
      this.endPlayerPhase();
      return;
    }
    UI.confirm('结束回合', '还有 ' + unacted.length + ' 名单位尚未行动。确定结束我方阶段？', '结束回合', '继续行动')
      .then(ok => { if (ok) this.endPlayerPhase(); });
  },

  async openMenu() {
    const B = this.B;
    if (!B || !this.active) return;
    const canRewind = B.phase === 'player' && !B.busy && B.rewindLeft > 0 && !!B.rewindSnapshot;
    const actions = await UI.modal({
      title: '行旅暂停',
      sub: UI.chapterLabel(this.chapter.no) + ' · ' + this.chapter.name + '　第 ' + B.turn + ' 回合',
      body: '<div style="font-size:12px;color:#5f5a45;line-height:1.9;">' +
        '已击败敌军 ' + B.stats.kills + ' 名 · 本回合阵亡 ' + B.stats.lost + ' 人<br>' +
        '悔棋剩余 <b>' + B.rewindLeft + '</b> 次' + (this.diff.rewinds === 0 ? '（修罗难度不可悔棋）' : '') +
        '</div>',
      buttons: [
        { label: '继续', value: 'resume', cls: 'primary' },
        { label: '悔棋', value: 'rewind', cls: 'gold', onClick: () => { if (!canRewind) { UI.toast(B.rewindLeft <= 0 ? '悔棋次数已用尽' : '当前无法悔棋'); return false; } } },
        { label: '保存并退出', value: 'exit' },
        { label: '重新挑战', value: 'retry', cls: 'danger' },
        { label: '战斗说明', value: 'help' },
        { label: '设置', value: 'settings' }
      ],
      closable: true
    });
    if (!this.active || B.ending) return;
    if (actions === 'rewind') { this.rewind(); return; }
    if (actions === 'exit') {
      if (B.phase !== 'player' || B.busy) { UI.toast('请在我方阶段、非交战时退出'); return; }
      if (window.Game) {
        Game.saveSuspend(this.serialize());
        Game.showTitle();
        UI.toast('战局已保存');
      }
      return;
    }
    if (actions === 'retry') {
      const ok = await UI.confirm('重新挑战', '本场战斗的进度将全部放弃，回到章节开始。', '重新挑战', '取消');
      if (ok && window.Game) Game.retryChapter(this.chapterId);
      return;
    }
    if (actions === 'help') {
      if (window.Game) await Game.showHelp();
      return;
    }
    if (actions === 'settings') {
      if (window.Game) await Game.openSettings();
      return;
    }
  },

  rewind() {
    const B = this.B;
    if (!B || B.phase !== 'player' || B.busy || B.ending) { UI.toast('现在无法悔棋'); return; }
    if (B.rewindLeft <= 0) { UI.toast('悔棋次数已用尽'); return; }
    const hist = Array.isArray(B.history) ? B.history.slice() : [];
    let cur = Number.isInteger(B.historyCursor) ? B.historyCursor : hist.length;
    if (cur > hist.length) cur = hist.length;
    const idx = cur - 1;
    if (idx < 0) { UI.toast('已经没有更早的战局可回溯'); return; }
    const snap = hist[idx];
    if (!snap) { UI.toast('本回合没有可回溯的战局'); return; }
    const left = B.rewindLeft;
    this.applyState(snap);
    B.rewindLeft = left - 1;
    B.history = hist;
    B.historyCursor = idx;
    B.rewindSnapshot = idx > 0 ? hist[idx - 1] : null;
    B.busy = false;
    B.ending = false;
    B.mode = 'idle';
    B.selectedUnit = null;
    B.moveRange = null;
    B.attackRange = null;
    B.targetTiles = null;
    B.pathPreview = null;
    B.dangerOn = false;
    B.dangerSet = null;
    B.tapHint = '点击我方单位行动';
    UI.hideActionBar();
    UI.hideUnitCard();
    Render.clearFx();
    UI.clearLog();
    UI.log('悔棋：回到第 ' + B.turn + ' 回合开始。剩余 ' + B.rewindLeft + ' 次。', 'gold');
    UI.updateBattle(B);
    Audio.sfx('cancel');
  },

  /* ============================================================
   * 序列化
   * ============================================================ */
  serialize(includeHistory) {
    const B = this.B;
    if (!B) return null;
    const out = {
      chapterId: this.chapterId,
      grid: B.grid,
      units: B.units,
      nodes: B.nodes,
      overlays: B.overlays || {},
      turn: B.turn,
      phase: B.phase,
      phaseIndex: B.phaseIndex,
      fog: B.fog,
      vision: B.vision,
      visible: Array.from(B.visible || []),
      explored: Array.from(B.explored || []),
      flags: B.flags,
      visitedVillages: B.visitedVillages,
      loot: B.loot,
      stats: B.stats,
      supports: B.supports,
      recruited: B.recruited,
      summoned: B.summoned,
      casualties: B.casualties,
      mainHoldCount: B.mainHoldCount,
      midsPlayed: Object.assign({}, B.midsPlayed || {}),
      sideHoldCount: B.sideHoldCount,
      spawnedReinforcements: B.spawnedReinforcements,
      rewindLeft: B.rewindLeft,
      historyCursor: B.historyCursor,
      speed: B.speed,
      rng: RNG.snapshot()
    };
    if (includeHistory !== false && Array.isArray(B.history) && B.history.length) {
      out.history = B.history.slice(-12);
    }
    return JSON.parse(JSON.stringify(out));
  },

  applyState(data) {
    if (!data) return;
    const B = this.B;
    B.grid = data.grid ? data.grid.slice() : this.chapter.map.slice();
    B.units = JSON.parse(JSON.stringify(data.units || []));
    // 旧存档没有 tier/hold 字段，读取时补默认值
    B.nodes = (data.nodes || []).map(n => Object.assign({ tier: 1, hold: 0 }, n));
    // 地形动态层：旧存档没有则为空
    B.overlays = data.overlays ? JSON.parse(JSON.stringify(data.overlays)) : {};
    B.turn = data.turn || 1;
    B.phase = data.phase || 'player';
    B.phaseIndex = data.phaseIndex || 1;
    B.fog = data.fog !== undefined ? data.fog : !!this.chapter.fog;
    B.vision = data.vision || this.chapter.vision || 4;
    B.visible = new Set(data.visible || []);
    B.explored = new Set(data.explored || []);
    B.flags = data.flags || { villages: {}, chests: {}, shrines: {}, seized: false, bossDead: false, lordDead: false, weakened: false, bossPhase: 1 };
    B.visitedVillages = data.visitedVillages || 0;
    B.loot = data.loot || { gold: 0, items: [], seals: 0 };
    B.stats = data.stats || { kills: 0, lost: 0, damage: 0, heals: 0, levels: 0, recruits: 0 };
    B.supports = data.supports || {};
    B.recruited = data.recruited || [];
    B.summoned = data.summoned || [];
    B.casualties = data.casualties || [];
    B.mainHoldCount = data.mainHoldCount || 0;
    B.midsPlayed = Object.assign({}, data.midsPlayed || {});
    B.sideHoldCount = data.sideHoldCount || 0;
    B.spawnedReinforcements = data.spawnedReinforcements || {};
    B.rewindLeft = data.rewindLeft === undefined ? this.diff.rewinds : data.rewindLeft;
    B.speed = data.speed || 1;
    B.history = Array.isArray(data.history) ? JSON.parse(JSON.stringify(data.history)) : [];
    B.historyCursor = Number.isInteger(data.historyCursor) ? data.historyCursor : B.history.length;
    if (B.historyCursor < 0) B.historyCursor = 0;
    if (B.historyCursor > B.history.length) B.historyCursor = B.history.length;
    if (data.rng !== undefined) RNG.restore(data.rng);
    B.busy = false;
    B.ending = false;
    B.mode = 'idle';
    B.selectedUnit = null;
    B.moveRange = null;
    B.attackRange = null;
    B.targetTiles = null;
    B.pathPreview = null;
    B.dangerOn = false;
    B.dangerSet = null;
    B.hpView = null;
    for (const u of B.units) {
      if (!u.statuses) u.statuses = {};
      if (!u.items) u.items = [];
      if (!u.ranks) u.ranks = {};
    }
    this.updateNodes();
    this.computeVisibility(false);
    Render.setBattle(B);
  },

  getSuspendState() {
    if (!this.B) return null;
    if (this.B.phase === 'player' && !this.B.busy && !this.B.ending) return this.serialize();
    return this.B.lastPlayerState || this.serialize();
  },

  /* ============================================================
   * 工具
   * ============================================================ */
  wait(ms) {
    const speed = (this.B && this.B.speed) || 1;
    return new Promise(r => setTimeout(r, Math.max(16, ms / speed)));
  },

  findFreeAdjacent(x, y) {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const d of dirs) {
      const nx = x + d[0], ny = y + d[1];
      if (!this.inBounds(nx, ny)) continue;
      const tile = this.tileAt(nx, ny);
      if (!tile || tile.blocked) continue;
      if (!this.unitAt(nx, ny)) return { x: nx, y: ny };
    }
    return null;
  },

  findFreeTileNear(x, y, w, h, allowBlocked) {
    for (let r = 0; r <= Math.max(w, h); r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) + Math.abs(dy) !== r) continue;
          const nx = x + dx, ny = y + dy;
          if (!this.inBounds(nx, ny)) continue;
          const tile = this.tileAt(nx, ny);
          if (!tile) continue;
          if (!allowBlocked && tile.blocked) continue;
          if (this.unitAt(nx, ny)) continue;
          return { x: nx, y: ny };
        }
      }
    }
    return null;
  }
};

if (typeof window !== 'undefined') window.Battle = Battle;
